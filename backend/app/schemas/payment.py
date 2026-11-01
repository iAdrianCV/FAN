"""Schemas de pagos."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.enums import PaymentMethod
from app.schemas.common import Money, ORMModel


class PaymentMethodInfo(BaseModel):
    code: PaymentMethod
    label: str
    requires_reference: bool
    allows_change: bool


class PaymentListItem(ORMModel):
    id: uuid.UUID
    sale_id: uuid.UUID
    receipt_series: str
    receipt_number: int
    payment_method: PaymentMethod
    amount: Money
    cash_tendered: Money | None
    change_given: Money | None
    reference_number: str | None
    created_at: datetime

