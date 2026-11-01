"""Tabla ``product_batches`` (lotes por sucursal con trazabilidad de costo y vencimiento)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.clock import now_utc
from app.models.base import Base, UUIDPkMixin
from app.models.branch import Branch
from app.models.product import Product


class ProductBatch(UUIDPkMixin, Base):
    __tablename__ = "product_batches"

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True
    )
    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id"), nullable=False, index=True
    )
    batch_number: Mapped[str] = mapped_column(String(64), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    sale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    current_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    initial_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    expiration_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    product: Mapped[Product] = relationship(lazy="raise")
    branch: Mapped[Branch] = relationship(lazy="raise")

    def __repr__(self) -> str:
        return f"<ProductBatch {self.batch_number} qty={self.current_quantity}>"

