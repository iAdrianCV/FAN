"""Reportes financieros y datos para el cierre de caja."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import PaymentMethod, SaleStatus
from app.core.errors import BusinessRuleError
from app.core.money import ZERO, q2
from app.models import Sale, SaleItem, SalePayment
from app.schemas.report import PaymentMethodTotal, ReportSummary
from app.schemas.sale import SaleSummaryOut

MAX_RANGE_DAYS = 366


def _pct(part: Decimal, whole: Decimal) -> Decimal:
    return q2(part / whole * Decimal("100")) if whole > ZERO else Decimal("0.00")


class ReportService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def summary(
        self,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_id: uuid.UUID | None,
        user_id: uuid.UUID | None,
        receipts_limit: int,
    ) -> ReportSummary:
        """Resumen de ventas: totales, margen bruto, desglose por medio de pago y comprobantes."""
        if date_to <= date_from:
            raise BusinessRuleError("INVALID_DATE_RANGE", "date_to debe ser posterior a date_from")
        if (date_to - date_from).days > MAX_RANGE_DAYS:
            raise BusinessRuleError("DATE_RANGE_TOO_LARGE", f"El rango máximo es de {MAX_RANGE_DAYS} días")

        scope: list[ColumnElement[bool]] = [Sale.created_at >= date_from, Sale.created_at < date_to]
        if branch_id is not None:
            scope.append(Sale.branch_id == branch_id)
        if user_id is not None:
            scope.append(Sale.user_id == user_id)
        completed = [*scope, Sale.status == SaleStatus.COMPLETED.value]

        # Totales de cabecera.
        totals = (
            await self.session.execute(
                select(
                    func.count(Sale.id),
                    func.coalesce(func.sum(Sale.total), 0),
                    func.coalesce(func.sum(Sale.subtotal), 0),
                    func.coalesce(func.sum(Sale.tax), 0),
                    func.coalesce(func.sum(Sale.discount), 0),
                ).where(*completed)
            )
        ).one()
        sales_count = int(totals[0])
        total_sales, subtotal, tax, discount = (Decimal(v) for v in totals[1:])

        voided = (
            await self.session.execute(
                select(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0)).where(
                    *scope, Sale.status == SaleStatus.VOIDED.value
                )
            )
        ).one()

        # Margen bruto: Σ (unit_price - unit_cost) × quantity.
        margin = (
            await self.session.execute(
                select(
                    func.coalesce(func.sum((SaleItem.unit_price - SaleItem.unit_cost) * SaleItem.quantity), 0),
                    func.coalesce(func.sum(SaleItem.unit_cost * SaleItem.quantity), 0),
                    func.coalesce(func.sum(SaleItem.total_line), 0),
                )
                .select_from(SaleItem)
                .join(Sale, Sale.id == SaleItem.sale_id)
                .where(*completed)
            )
        ).one()
        gross_margin = q2(Decimal(margin[0]))
        total_cost = q2(Decimal(margin[1]))
        lines_revenue = Decimal(margin[2])

        # Desglose por medio de pago.
        pay_rows = (
            await self.session.execute(
                select(
                    SalePayment.payment_method,
                    func.coalesce(func.sum(SalePayment.amount), 0),
                    func.count(SalePayment.id),
                    func.coalesce(func.sum(SalePayment.cash_tendered), 0),
                    func.coalesce(func.sum(SalePayment.change_given), 0),
                )
                .join(Sale, Sale.id == SalePayment.sale_id)
                .where(*completed)
                .group_by(SalePayment.payment_method)
            )
        ).tuples().all()
        by_method: dict[str, tuple[Decimal, int, Decimal, Decimal]] = {
            str(m): (Decimal(a), int(c), Decimal(t), Decimal(ch)) for m, a, c, t, ch in pay_rows
        }
        collected = sum((v[0] for v in by_method.values()), ZERO)
        payments_by_method = [
            PaymentMethodTotal(
                payment_method=method,
                amount=by_method.get(method.value, (ZERO, 0, ZERO, ZERO))[0],
                count=by_method.get(method.value, (ZERO, 0, ZERO, ZERO))[1],
                share_pct=_pct(by_method.get(method.value, (ZERO, 0, ZERO, ZERO))[0], collected),
            )
            for method in PaymentMethod
        ]
        cash = by_method.get(PaymentMethod.CASH.value, (ZERO, 0, ZERO, ZERO))

        # Comprobantes emitidos (incluye anulados para trazabilidad).
        receipt_rows = (
            await self.session.scalars(
                select(Sale).where(*scope).order_by(Sale.created_at.desc()).limit(receipts_limit + 1)
            )
        ).all()
        truncated = len(receipt_rows) > receipts_limit

        return ReportSummary(
            date_from=date_from,
            date_to=date_to,
            branch_id=branch_id,
            user_id=user_id,
            sales_count=sales_count,
            voided_count=int(voided[0]),
            voided_total=Decimal(voided[1]),
            total_sales=total_sales,
            subtotal=subtotal,
            tax=tax,
            discount=discount,
            average_ticket=q2(total_sales / sales_count) if sales_count else Decimal("0.00"),
            total_cost=total_cost,
            gross_margin=gross_margin,
            gross_margin_pct=_pct(gross_margin, lines_revenue),
            net_margin=q2(gross_margin - discount),
            expected_cash=cash[0],
            cash_tendered_total=cash[2],
            change_given_total=cash[3],
            payments_by_method=payments_by_method,
            receipts=[SaleSummaryOut.model_validate(s) for s in receipt_rows[:receipts_limit]],
            receipts_truncated=truncated,
        )

