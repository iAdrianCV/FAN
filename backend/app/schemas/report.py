"""Schemas de reportes financieros y cierre de caja."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.core.enums import PaymentMethod
from app.schemas.common import Money
from app.schemas.sale import SaleSummaryOut


class PaymentMethodTotal(BaseModel):
    payment_method: PaymentMethod
    amount: Money
    count: int
    #: Porcentaje del total recaudado (0-100).
    share_pct: Decimal


class ReportSummary(BaseModel):
    date_from: datetime
    date_to: datetime
    branch_id: uuid.UUID | None
    user_id: uuid.UUID | None

    sales_count: int
    voided_count: int
    voided_total: Money

    total_sales: Money
    subtotal: Money
    tax: Money
    discount: Money
    average_ticket: Money

    total_cost: Money
    #: Σ (unit_price - unit_cost) × quantity
    gross_margin: Money
    gross_margin_pct: Decimal
    #: Margen bruto menos descuentos globales.
    net_margin: Money

    #: Efectivo neto recaudado (montos aplicados; el vuelto ya está descontado).
    expected_cash: Money
    cash_tendered_total: Money
    change_given_total: Money

    payments_by_method: list[PaymentMethodTotal]
    receipts: list[SaleSummaryOut]
    receipts_truncated: bool

