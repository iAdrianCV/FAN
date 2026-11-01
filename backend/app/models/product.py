"""Tabla ``products`` (catálogo global, independiente de la sucursal)."""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin


class Product(UUIDPkMixin, Base):
    __tablename__ = "products"

    barcode: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    sku: Mapped[str | None] = mapped_column(String(64), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    min_stock: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"))
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="UND")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<Product {self.barcode} {self.name}>"

