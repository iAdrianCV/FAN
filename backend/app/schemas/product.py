"""Schemas de productos."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from pydantic import Field

from app.schemas.common import InputModel, Money, NonNegativeQuantityIn, ORMModel, Quantity

BarcodeStr = Field(min_length=3, max_length=64)


class ProductCreate(InputModel):
    barcode: str = BarcodeStr
    sku: str | None = Field(default=None, max_length=64)
    name: str = Field(min_length=2, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    min_stock: NonNegativeQuantityIn = Decimal("0")
    unit: str = Field(default="UND", min_length=1, max_length=20)


class ProductUpdate(InputModel):
    sku: str | None = Field(default=None, max_length=64)
    name: str | None = Field(default=None, min_length=2, max_length=200)
    category: str | None = Field(default=None, max_length=100)
    min_stock: NonNegativeQuantityIn | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    is_active: bool | None = None


class ProductOut(ORMModel):
    id: uuid.UUID
    barcode: str
    sku: str | None
    name: str
    category: str | None
    min_stock: Quantity
    unit: str
    is_active: bool


class ProductWithStock(ProductOut):
    """Producto con stock consolidado vendible y precio vigente en una sucursal."""

    stock: Quantity
    #: Precio de lista vigente (lote más reciente recibido en la sucursal).
    sale_price: Money | None
    last_cost_price: Money | None
    #: Próximo vencimiento del stock vendible (orden FEFO).
    next_expiration: date | None

