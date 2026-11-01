"""Repositorio de ventas y pagos."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import PaymentMethod
from app.models import Sale, SaleItem, SalePayment


class SaleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def lock_receipt_series(self, series: str) -> None:
        """Serializa la numeración de una serie con un lock de base de datos."""
        await self.session.execute(
            text("SELECT GET_LOCK(:key, 10)"), {"key": f"fan_pos_receipt_{series}"}
        )

    async def next_receipt_number(self, series: str) -> int:
        stmt = select(func.coalesce(func.max(Sale.receipt_number), 0)).where(Sale.receipt_series == series)
        return int(await self.session.scalar(stmt) or 0) + 1

    async def receipt_exists(self, series: str, number: int) -> bool:
        stmt = select(func.count()).where(Sale.receipt_series == series, Sale.receipt_number == number)
        return int(await self.session.scalar(stmt) or 0) > 0

    async def get_full(self, sale_id: uuid.UUID, *, for_update: bool = False) -> Sale | None:
        """Venta con ítems (producto + lote) y pagos precargados."""
        stmt = (
            select(Sale)
            .where(Sale.id == sale_id)
            .options(
                selectinload(Sale.items).selectinload(SaleItem.product),
                selectinload(Sale.items).selectinload(SaleItem.batch),
                selectinload(Sale.payments),
            )
        )
        if for_update:
            stmt = stmt.with_for_update(of=Sale)
        return await self.session.scalar(stmt)

    async def list_sales(
        self,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_id: uuid.UUID | None,
        user_id: uuid.UUID | None,
        status: str | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[Sale], int]:
        stmt = select(Sale).where(Sale.created_at >= date_from, Sale.created_at < date_to)
        if branch_id is not None:
            stmt = stmt.where(Sale.branch_id == branch_id)
        if user_id is not None:
            stmt = stmt.where(Sale.user_id == user_id)
        if status is not None:
            stmt = stmt.where(Sale.status == status)
        total = int(await self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
        stmt = stmt.order_by(Sale.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.scalars(stmt)
        return result.all(), total

    async def list_payments(
        self,
        *,
        date_from: datetime,
        date_to: datetime,
        branch_id: uuid.UUID | None,
        payment_method: PaymentMethod | None,
        sale_status: str,
        offset: int,
        limit: int,
    ) -> tuple[list[tuple[SalePayment, Sale]], int]:
        stmt = (
            select(SalePayment, Sale)
            .join(Sale, Sale.id == SalePayment.sale_id)
            .where(Sale.created_at >= date_from, Sale.created_at < date_to, Sale.status == sale_status)
        )
        if branch_id is not None:
            stmt = stmt.where(Sale.branch_id == branch_id)
        if payment_method is not None:
            stmt = stmt.where(SalePayment.payment_method == payment_method.value)
        total = int(await self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
        stmt = stmt.order_by(SalePayment.created_at.desc()).offset(offset).limit(limit)
        rows = (await self.session.execute(stmt)).tuples().all()
        return [(p, s) for p, s in rows], total

    async def payments_for_sale(self, sale_id: uuid.UUID) -> Sequence[SalePayment]:
        result = await self.session.scalars(
            select(SalePayment).where(SalePayment.sale_id == sale_id).order_by(SalePayment.created_at)
        )
        return result.all()

