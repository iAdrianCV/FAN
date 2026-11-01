"""Schemas de lotes e ingreso rápido de inventario."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import Field, model_validator

from app.schemas.common import (
    InputModel,
    MoneyIn,
    Money,
    NonNegativeQuantityIn,
    ORMModel,
    PositiveMoneyIn,
    PositiveQuantityIn,
    Quantity,
)
from app.schemas.product import ProductOut


class QuickEntryRequest(InputModel):
    """Alta rápida de inventario por código de barras."""

    branch_id: uuid.UUID
    barcode: str = Field(min_length=3, max_length=64)
    quantity: PositiveQuantityIn
    expiration_date: date | None = None
    # Obligatorio solo si el producto no existe.
    name: str | None = Field(default=None, min_length=2, max_length=200)
    # Opcionales: si faltan, se heredan del lote más reciente.
    cost_price: MoneyIn | None = None
    sale_price: PositiveMoneyIn | None = None
    batch_number: str | None = Field(default=None, min_length=1, max_length=64)
    # Datos adicionales usados solo al crear un producto nuevo.
    sku: str | None = Field(default=None, max_length=64)
    category: str | None = Field(default=None, max_length=100)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    min_stock: NonNegativeQuantityIn | None = None


class BatchOut(ORMModel):
    id: uuid.UUID
    product_id: uuid.UUID
    branch_id: uuid.UUID
    batch_number: str
    cost_price: Money
    sale_price: Money
    current_quantity: Quantity
    initial_quantity: Quantity
    expiration_date: date | None
    received_at: datetime


class BatchWithProduct(BatchOut):
    product_name: str
    barcode: str
    unit: str
    days_to_expiry: int | None


class QuickEntryResponse(ORMModel):
    product: ProductOut
    batch: BatchOut
    product_created: bool
    prices_inherited: bool


class WriteOffRequest(InputModel):
    """Baja por merma. Si ``quantity`` es nulo se da de baja todo el saldo del lote."""

    quantity: PositiveQuantityIn | None = None
    reason: str = Field(default="Merma por vencimiento", min_length=3, max_length=255)

    @model_validator(mode="after")
    def _normalize(self) -> WriteOffRequest:
        self.reason = " ".join(self.reason.split())
        return self


class WriteOffResponse(ORMModel):
    batch: BatchOut
    written_off_quantity: Quantity
    written_off_cost: Money
    audit_alert_id: uuid.UUID

