"""Inventario por lotes: alta rápida, listado FEFO y bajas por merma."""

from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today_local
from app.core.enums import AlertSeverity, AlertType
from app.core.errors import AppException, BusinessRuleError, NotFoundError
from app.core.money import fmt_qty, q2, q3
from app.models import Product, ProductBatch, SystemAlert, User
from app.repositories.alert_repository import AlertRepository
from app.repositories.batch_repository import BatchRepository
from app.repositories.product_repository import ProductRepository
from app.repositories.user_repository import BranchRepository
from app.schemas.batch import (
    BatchOut,
    BatchWithProduct,
    QuickEntryRequest,
    QuickEntryResponse,
    WriteOffRequest,
    WriteOffResponse,
)
from app.schemas.common import Page
from app.schemas.product import ProductOut
from app.services.permissions import ensure_branch_access

logger = logging.getLogger("lotepos.inventory")

MAX_BATCH_SUFFIX = 999


def build_batch_number(barcode: str, day: date) -> str:
    """Patrón ``LOT-{YYYYMMDD}-{primeros4_barcode}``."""
    return f"LOT-{day:%Y%m%d}-{barcode[:4].upper()}"


class InventoryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.products = ProductRepository(session)
        self.batches = BatchRepository(session)
        self.branches = BranchRepository(session)
        self.alerts = AlertRepository(session)

    # ---------------------------------------------------------- alta rápida
    async def quick_entry(self, payload: QuickEntryRequest, user: User) -> QuickEntryResponse:
        """Registra un lote nuevo (creando el producto si no existe) en una transacción atómica."""
        ensure_branch_access(user, payload.branch_id)
        if await self.branches.get(payload.branch_id) is None:
            raise NotFoundError("BRANCH_NOT_FOUND", "La sucursal indicada no existe")

        today = today_local()
        if payload.expiration_date is not None and payload.expiration_date < today:
            raise BusinessRuleError(
                "EXPIRATION_IN_PAST",
                "La fecha de vencimiento no puede ser anterior a hoy",
                extra={"expiration_date": payload.expiration_date.isoformat()},
            )

        barcode = payload.barcode.strip()

        # 1) Producto: existente o creación inmediata.
        product = await self.products.get_by_barcode(barcode)
        product_created = False
        if product is None:
            if not payload.name:
                raise AppException(
                    422,
                    "PRODUCT_NAME_REQUIRED",
                    "El producto no existe: debe indicar 'name' para registrarlo",
                    extra={"barcode": barcode},
                )
            product, product_created = await self.products.insert_if_absent(
                barcode=barcode,
                name=payload.name,
                sku=payload.sku,
                category=payload.category,
                unit=(payload.unit or "UND").upper(),
                min_stock=payload.min_stock if payload.min_stock is not None else Decimal("0"),
            )
        elif not product.is_active:
            product.is_active = True  # recibir stock reactiva el producto

        # Serializa altas concurrentes del mismo producto/sucursal (numeración de lote).
        await self.session.execute(
            text("SELECT GET_LOCK(:key, 10)"),
            {"key": f"lotepos_batch_{product.id}_{payload.branch_id}"},
        )

        # 2) Precios: explícitos o heredados del lote más reciente.
        cost_price = payload.cost_price
        sale_price = payload.sale_price
        prices_inherited = False
        if cost_price is None or sale_price is None:
            latest = await self.batches.latest_prices(product_id=product.id, branch_id=payload.branch_id)
            if latest is None:
                missing = [n for n, v in (("cost_price", cost_price), ("sale_price", sale_price)) if v is None]
                raise AppException(
                    422,
                    "PRICE_REQUIRED",
                    "No hay lotes previos de los cuales heredar precios: indique "
                    + " y ".join(missing),
                    extra={"missing": missing},
                )
            cost_price = cost_price if cost_price is not None else latest[0]
            sale_price = sale_price if sale_price is not None else latest[1]
            prices_inherited = True

        # 3) Número de lote.
        batch_number = payload.batch_number or await self._next_batch_number(product, payload.branch_id, today)

        # 4) Lote.
        quantity = q3(payload.quantity)
        batch = ProductBatch(
            id=uuid.uuid4(),
            product_id=product.id,
            branch_id=payload.branch_id,
            batch_number=batch_number,
            cost_price=q2(cost_price),
            sale_price=q2(sale_price),
            current_quantity=quantity,
            initial_quantity=quantity,
            expiration_date=payload.expiration_date,
        )
        self.session.add(batch)
        await self.session.commit()

        logger.info(
            "Lote %s ingresado: producto=%s sucursal=%s qty=%s user=%s",
            batch_number, product.id, payload.branch_id, quantity, user.id,
        )
        return QuickEntryResponse(
            product=ProductOut.model_validate(product),
            batch=BatchOut.model_validate(batch),
            product_created=product_created,
            prices_inherited=prices_inherited,
        )

    async def _next_batch_number(self, product: Product, branch_id: uuid.UUID, today: date) -> str:
        base = build_batch_number(product.barcode, today)
        candidate = base
        suffix = 1
        while await self.batches.batch_number_exists(
            product_id=product.id, branch_id=branch_id, batch_number=candidate
        ):
            suffix += 1
            if suffix > MAX_BATCH_SUFFIX:
                raise BusinessRuleError("BATCH_NUMBER_EXHAUSTED", "Demasiados lotes registrados hoy")
            candidate = f"{base}-{suffix}"
        return candidate

    # ---------------------------------------------------------- listado
    async def list_batches(
        self,
        *,
        branch_id: uuid.UUID,
        product_id: uuid.UUID | None,
        only_available: bool,
        expiring_within_days: int | None,
        offset: int,
        limit: int,
    ) -> Page[BatchWithProduct]:
        today = today_local()
        expiring_before = (
            today + timedelta(days=expiring_within_days) if expiring_within_days is not None else None
        )
        rows, total = await self.batches.list_with_product(
            branch_id=branch_id,
            product_id=product_id,
            only_available=only_available,
            expiring_before=expiring_before,
            offset=offset,
            limit=limit,
        )
        items = [
            BatchWithProduct(
                **BatchOut.model_validate(batch).model_dump(),
                product_name=product.name,
                barcode=product.barcode,
                unit=product.unit,
                days_to_expiry=(batch.expiration_date - today).days if batch.expiration_date else None,
            )
            for batch, product in rows
        ]
        return Page[BatchWithProduct](items=items, total=total, offset=offset, limit=limit)

    # ---------------------------------------------------------- merma
    async def write_off(self, batch_id: uuid.UUID, payload: WriteOffRequest, user: User) -> WriteOffResponse:
        """Da de baja stock de un lote (merma) con bloqueo pesimista y rastro de auditoría."""
        batch = await self.batches.get(batch_id, for_update=True)
        if batch is None:
            raise NotFoundError("BATCH_NOT_FOUND", "Lote no encontrado")
        ensure_branch_access(user, batch.branch_id)

        if batch.current_quantity <= 0:
            raise BusinessRuleError("BATCH_EMPTY", "El lote no tiene stock para dar de baja")
        quantity = q3(payload.quantity) if payload.quantity is not None else batch.current_quantity
        if quantity > batch.current_quantity:
            raise BusinessRuleError(
                "WRITE_OFF_EXCEEDS_STOCK",
                f"La baja ({quantity}) excede el saldo del lote ({batch.current_quantity})",
                extra={"requested": str(quantity), "available": str(batch.current_quantity)},
            )

        product = await self.products.get(batch.product_id)
        product_name = product.name if product else str(batch.product_id)
        unit = product.unit if product else ""

        batch.current_quantity = batch.current_quantity - quantity
        written_off_cost = q2(quantity * batch.cost_price)

        audit = SystemAlert(
            id=uuid.uuid4(),
            branch_id=batch.branch_id,
            alert_type=AlertType.WRITE_OFF.value,
            reference_id=batch.id,
            message=(
                f"Baja por merma: {fmt_qty(quantity)} {unit} de {product_name} "
                f"(lote {batch.batch_number}), costo S/ {written_off_cost}. "
                f"Motivo: {payload.reason}. Usuario: {user.username}"
            ),
            severity=AlertSeverity.INFO.value,
            is_resolved=True,
        )
        self.session.add(audit)

        if batch.current_quantity <= 0:
            await self.alerts.resolve_for_reference(
                reference_id=batch.id,
                alert_types=[AlertType.EXPIRED.value, AlertType.EXPIRING_SOON.value],
            )

        await self.session.commit()
        logger.info("Merma lote=%s qty=%s user=%s", batch.id, quantity, user.id)
        return WriteOffResponse(
            batch=BatchOut.model_validate(batch),
            written_off_quantity=quantity,
            written_off_cost=written_off_cost,
            audit_alert_id=audit.id,
        )
