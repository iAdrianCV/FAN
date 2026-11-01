"""Motor de venta FEFO transaccional, anulación y consulta de ventas."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today_local
from app.core.config import settings
from app.core.enums import AlertSeverity, AlertType, SaleStatus
from app.core.errors import BusinessRuleError, ConflictError, NotFoundError
from app.core.money import ZERO, fmt_qty, q2, q3
from app.models import Product, ProductBatch, Sale, SaleItem, SalePayment, SystemAlert, User
from app.repositories.batch_repository import BatchRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.sale_repository import SaleRepository
from app.repositories.user_repository import BranchRepository
from app.schemas.common import Page
from app.schemas.sale import (
    CheckoutRequest,
    SaleItemOut,
    SaleOut,
    SalePaymentOut,
    SaleSummaryOut,
    VoidSaleRequest,
)
from app.services.payment_service import settle_payments
from app.services.permissions import ensure_branch_access

logger = logging.getLogger("lotepos.sales")


def compute_tax_breakdown(total: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Devuelve ``(subtotal, tax, total)`` según la configuración de impuestos.

    * ``PRICES_INCLUDE_TAX=True`` (Perú, IGV incluido): el total no cambia, se desglosa.
    * ``PRICES_INCLUDE_TAX=False``: el impuesto se suma sobre el neto.
    """
    rate = settings.TAX_RATE
    if settings.PRICES_INCLUDE_TAX:
        subtotal = q2(total / (Decimal("1") + rate)) if rate > ZERO else total
        return subtotal, total - subtotal, total
    tax = q2(total * rate)
    return total, tax, total + tax


def build_sale_out(sale: Sale) -> SaleOut:
    """Serializa una venta con ítems/pagos ya cargados (sin lazy loads)."""
    items = [
        SaleItemOut(
            id=i.id,
            product_id=i.product_id,
            product_name=i.product.name,
            batch_id=i.batch_id,
            batch_number=i.batch.batch_number,
            quantity=i.quantity,
            unit_price=i.unit_price,
            unit_cost=i.unit_cost,
            total_line=i.total_line,
        )
        for i in sale.items
    ]
    payments = [SalePaymentOut.model_validate(p) for p in sale.payments]
    change_total = sum((p.change_given or ZERO for p in sale.payments), ZERO)
    return SaleOut(
        id=sale.id,
        branch_id=sale.branch_id,
        user_id=sale.user_id,
        receipt_series=sale.receipt_series,
        receipt_number=sale.receipt_number,
        customer_id=sale.customer_id,
        subtotal=sale.subtotal,
        tax=sale.tax,
        discount=sale.discount,
        total=sale.total,
        status=SaleStatus(sale.status),
        created_at=sale.created_at,
        change_total=change_total,
        items=items,
        payments=payments,
    )


class SaleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.products = ProductRepository(session)
        self.batches = BatchRepository(session)
        self.sales = SaleRepository(session)
        self.branches = BranchRepository(session)

    # ================================================================ checkout
    async def checkout(self, payload: CheckoutRequest, user: User) -> SaleOut:
        """Registra una venta consumiendo stock por FEFO dentro de una única transacción ACID.

        1. Agrupa ítems por producto y los procesa en orden determinista (evita deadlocks).
        2. Bloquea (``FOR UPDATE``) los lotes vendibles de cada producto en orden FEFO.
        3. Valida disponibilidad total; si falta stock -> HTTP 400 y rollback.
        4. Descuenta lote por lote y divide la línea en varios ``sale_items`` con su costo real.
        5. Valida y liquida pagos (vuelto en efectivo), asigna correlativo y confirma.
        """
        ensure_branch_access(user, payload.branch_id)
        if await self.branches.get(payload.branch_id) is None:
            raise NotFoundError("BRANCH_NOT_FOUND", "La sucursal indicada no existe")

        # 1) Consolidar cantidades por producto.
        qty_by_product: dict[uuid.UUID, Decimal] = {}
        for item in payload.items:
            qty_by_product[item.product_id] = qty_by_product.get(item.product_id, ZERO) + q3(item.quantity)
        product_ids: list[uuid.UUID] = sorted(qty_by_product, key=lambda pid: pid.bytes)

        products = await self.products.get_many(product_ids)
        missing = [str(pid) for pid in product_ids if pid not in products]
        if missing:
            raise NotFoundError(
                "PRODUCT_NOT_FOUND", "Uno o más productos no existen", extra={"product_ids": missing}
            )
        inactive = [products[pid].name for pid in product_ids if not products[pid].is_active]
        if inactive:
            raise BusinessRuleError(
                "PRODUCT_INACTIVE", f"Productos inactivos: {', '.join(inactive)}", extra={"products": inactive}
            )

        today = today_local()
        sale_id = uuid.uuid4()
        sale_items: list[SaleItem] = []
        gross_total = ZERO

        # 2-4) Consumo FEFO con bloqueo pesimista.
        for pid in product_ids:
            product = products[pid]
            requested = qty_by_product[pid]
            batches = await self.batches.lock_available_fefo(
                product_id=pid,
                branch_id=payload.branch_id,
                today=today,
                allow_expired=settings.ALLOW_SELLING_EXPIRED,
            )
            available = sum((b.current_quantity for b in batches), ZERO)
            if available < requested:
                raise BusinessRuleError(
                    "INSUFFICIENT_STOCK",
                    f"Stock insuficiente para '{product.name}': solicitado {fmt_qty(requested)}, "
                    f"disponible {fmt_qty(available)}",
                    extra={
                        "product_id": str(pid),
                        "product_name": product.name,
                        "requested": float(requested),
                        "available": float(available),
                    },
                )

            unit_price = await self.batches.current_sale_price(product_id=pid, branch_id=payload.branch_id)
            if unit_price is None:  # pragma: no cover - hay lotes, siempre existe precio
                raise BusinessRuleError("PRICE_NOT_FOUND", f"'{product.name}' no tiene precio de venta")

            lines = self._consume_fefo(sale_id, product, batches, requested, unit_price)
            sale_items.extend(lines)
            gross_total += sum((ln.total_line for ln in lines), ZERO)

        # Descuento global e impuestos.
        discount = q2(payload.discount)
        if discount > gross_total:
            raise BusinessRuleError(
                "INVALID_DISCOUNT",
                "El descuento no puede superar el importe de la venta",
                extra={"discount": str(discount), "gross_total": str(gross_total)},
            )
        subtotal, tax, total = compute_tax_breakdown(gross_total - discount)

        # Pagos (split payments + vuelto).
        settled = settle_payments(total, payload.payments)

        # Correlativo del comprobante (serializado por serie).
        series = payload.receipt_series or settings.DEFAULT_RECEIPT_SERIES
        await self.sales.lock_receipt_series(series)
        if payload.receipt_number is not None:
            if await self.sales.receipt_exists(series, payload.receipt_number):
                raise ConflictError(
                    "RECEIPT_DUPLICATED",
                    f"El comprobante {series}-{payload.receipt_number} ya fue emitido",
                    extra={"receipt_series": series, "receipt_number": payload.receipt_number},
                )
            receipt_number = payload.receipt_number
        else:
            receipt_number = await self.sales.next_receipt_number(series)

        sale = Sale(
            id=sale_id,
            branch_id=payload.branch_id,
            user_id=user.id,
            receipt_series=series,
            receipt_number=receipt_number,
            customer_id=payload.customer_id,
            subtotal=subtotal,
            tax=tax,
            discount=discount,
            total=total,
            status=SaleStatus.COMPLETED.value,
        )
        sale.items = sale_items
        sale.payments = [
            SalePayment(
                id=uuid.uuid4(),
                payment_method=s.payment_method.value,
                amount=s.amount,
                cash_tendered=s.cash_tendered,
                change_given=s.change_given,
                reference_number=s.reference_number,
            )
            for s in settled
        ]
        self.session.add(sale)
        await self.session.commit()

        logger.info(
            "Venta %s-%s total=%s items=%d user=%s", series, receipt_number, total, len(sale_items), user.id
        )
        return build_sale_out(sale)

    @staticmethod
    def _consume_fefo(
        sale_id: uuid.UUID,
        product: Product,
        batches: Sequence[ProductBatch],
        requested: Decimal,
        unit_price: Decimal,
    ) -> list[SaleItem]:
        """Descuenta ``requested`` de los lotes (ya bloqueados y ordenados FEFO).

        Genera un ``SaleItem`` por lote tocado con su ``unit_cost`` real. El importe total
        de la línea se calcula una sola vez (``precio × cantidad``) y el residuo de redondeo
        se asigna a la última fracción, de modo que la suma cuadra con el carrito.
        """
        line_total = q2(unit_price * requested)
        remaining = requested
        allocated = ZERO
        lines: list[SaleItem] = []
        for batch in batches:
            if remaining <= ZERO:
                break
            take = min(batch.current_quantity, remaining)
            batch.current_quantity = batch.current_quantity - take
            remaining -= take
            part_total = q2(unit_price * take)
            allocated += part_total
            item = SaleItem(
                id=uuid.uuid4(),
                sale_id=sale_id,
                product_id=product.id,
                batch_id=batch.id,
                quantity=take,
                unit_price=unit_price,
                unit_cost=batch.cost_price,
                total_line=part_total,
            )
            item.product = product
            item.batch = batch
            lines.append(item)
        if lines and allocated != line_total:
            lines[-1].total_line = lines[-1].total_line + (line_total - allocated)
        return lines

    # ================================================================ anulación
    async def void(self, sale_id: uuid.UUID, payload: VoidSaleRequest, user: User) -> SaleOut:
        """Anula una venta y devuelve las cantidades exactamente a los lotes de origen."""
        sale = await self.sales.get_full(sale_id, for_update=True)
        if sale is None:
            raise NotFoundError("SALE_NOT_FOUND", "Venta no encontrada")
        ensure_branch_access(user, sale.branch_id)
        if sale.status != SaleStatus.COMPLETED.value:
            raise ConflictError("SALE_NOT_VOIDABLE", f"La venta está en estado {sale.status}")

        locked = await self.batches.lock_many(sorted({i.batch_id for i in sale.items}, key=lambda b: b.bytes))
        for item in sale.items:
            batch = locked[item.batch_id]
            batch.current_quantity = batch.current_quantity + item.quantity

        sale.status = SaleStatus.VOIDED.value
        self.session.add(
            SystemAlert(
                id=uuid.uuid4(),
                branch_id=sale.branch_id,
                alert_type=AlertType.SALE_VOIDED.value,
                reference_id=sale.id,
                message=(
                    f"Venta {sale.receipt_series}-{sale.receipt_number} anulada por {user.username}. "
                    f"Total S/ {sale.total}. Motivo: {payload.reason}"
                ),
                severity=AlertSeverity.INFO.value,
                is_resolved=True,
            )
        )
        await self.session.commit()
        logger.info("Venta %s anulada por %s", sale.id, user.id)
        return build_sale_out(sale)

    # ================================================================ consultas
    async def get(self, sale_id: uuid.UUID, user: User) -> SaleOut:
        sale = await self.sales.get_full(sale_id)
        if sale is None:
            raise NotFoundError("SALE_NOT_FOUND", "Venta no encontrada")
        ensure_branch_access(user, sale.branch_id)
        return build_sale_out(sale)

    async def list_sales(
        self,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_id: uuid.UUID | None,
        user_id: uuid.UUID | None,
        status: SaleStatus | None,
        offset: int,
        limit: int,
    ) -> Page[SaleSummaryOut]:
        rows, total = await self.sales.list_sales(
            date_from=date_from,
            date_to=date_to,
            branch_id=branch_id,
            user_id=user_id,
            status=status.value if status else None,
            offset=offset,
            limit=limit,
        )
        return Page[SaleSummaryOut](
            items=[SaleSummaryOut.model_validate(s) for s in rows], total=total, offset=offset, limit=limit
        )

    async def payments(self, sale_id: uuid.UUID, user: User) -> list[SalePaymentOut]:
        sale = await self.session.get(Sale, sale_id)
        if sale is None:
            raise NotFoundError("SALE_NOT_FOUND", "Venta no encontrada")
        ensure_branch_access(user, sale.branch_id)
        return [SalePaymentOut.model_validate(p) for p in await self.sales.payments_for_sale(sale_id)]
