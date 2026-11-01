"""Schemas de ventas y checkout FEFO."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.core.enums import PaymentMethod, SaleStatus
from app.schemas.common import (
    InputModel,
    Money,
    MoneyIn,
    ORMModel,
    PositiveMoneyIn,
    PositiveQuantityIn,
    Quantity,
)


class CheckoutItem(InputModel):
    product_id: uuid.UUID
    quantity: PositiveQuantityIn


class PaymentIn(InputModel):
    """Pago individual. ``amount`` es el monto aplicado a la venta.

    Para efectivo, ``cash_tendered`` es lo entregado por el cliente (>= amount); el
    vuelto se calcula en el servidor.
    """

    payment_method: PaymentMethod
    amount: PositiveMoneyIn
    cash_tendered: PositiveMoneyIn | None = None
    reference_number: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def _validate_method_fields(self) -> PaymentIn:
        if self.payment_method != PaymentMethod.CASH and self.cash_tendered is not None:
            raise ValueError("cash_tendered solo aplica a pagos en efectivo (CASH)")
        if self.payment_method == PaymentMethod.CASH and self.cash_tendered is not None:
            if self.cash_tendered < self.amount:
                raise ValueError("cash_tendered no puede ser menor que amount")
        return self


class CheckoutRequest(InputModel):
    branch_id: uuid.UUID
    items: list[CheckoutItem] = Field(min_length=1, max_length=300)
    payments: list[PaymentIn] = Field(default_factory=list, max_length=10)
    receipt_series: str | None = Field(default=None, pattern=r"^[A-Z0-9]{1,10}$")
    #: Si se omite, el servidor asigna el correlativo siguiente de la serie.
    receipt_number: int | None = Field(default=None, ge=1)
    customer_id: uuid.UUID | None = None
    discount: MoneyIn = Decimal("0")


class SaleItemOut(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    batch_id: uuid.UUID
    batch_number: str
    quantity: Quantity
    unit_price: Money
    unit_cost: Money
    total_line: Money


class SalePaymentOut(ORMModel):
    id: uuid.UUID
    payment_method: PaymentMethod
    amount: Money
    cash_tendered: Money | None
    change_given: Money | None
    reference_number: str | None
    created_at: datetime


class SaleSummaryOut(ORMModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    user_id: uuid.UUID | None
    receipt_series: str
    receipt_number: int
    total: Money
    status: SaleStatus
    created_at: datetime


class SaleOut(SaleSummaryOut):
    customer_id: uuid.UUID | None
    subtotal: Money
    tax: Money
    discount: Money
    change_total: Money
    items: list[SaleItemOut]
    payments: list[SalePaymentOut]


class VoidSaleRequest(InputModel):
    reason: str = Field(min_length=3, max_length=255)

