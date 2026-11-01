"""Tablas ``sales``, ``sale_items`` y ``sale_payments``."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.clock import now_utc
from app.models.base import Base, UUIDPkMixin
from app.models.batch import ProductBatch
from app.models.product import Product


class Sale(UUIDPkMixin, Base):
    __tablename__ = "sales"

    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id"), nullable=False, index=True
    )
    #: Cajero que emitió la venta (usado por el filtro de reportes por usuario).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    receipt_series: Mapped[str] = mapped_column(String(10), nullable=False)
    receipt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Sin ForeignKey ORM: la tabla de clientes no se mapea en este servicio.
    customer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    tax: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, index=True
    )

    items: Mapped[list[SaleItem]] = relationship(
        back_populates="sale", lazy="raise", cascade="all, delete-orphan"
    )
    payments: Mapped[list[SalePayment]] = relationship(
        back_populates="sale", lazy="raise", cascade="all, delete-orphan"
    )


class SaleItem(UUIDPkMixin, Base):
    __tablename__ = "sale_items"

    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("sales.id"), nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("products.id"), nullable=False
    )
    batch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("product_batches.id"), nullable=False
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_line: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    sale: Mapped[Sale] = relationship(back_populates="items", lazy="raise")
    product: Mapped[Product] = relationship(lazy="raise")
    batch: Mapped[ProductBatch] = relationship(lazy="raise")


class SalePayment(UUIDPkMixin, Base):
    __tablename__ = "sale_payments"

    sale_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("sales.id"), nullable=False, index=True
    )
    payment_method: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cash_tendered: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    change_given: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=now_utc)

    sale: Mapped[Sale] = relationship(back_populates="payments", lazy="raise")

