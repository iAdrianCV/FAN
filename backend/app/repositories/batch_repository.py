"""Repositorio de lotes (incluye el bloqueo pesimista FEFO)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Product, ProductBatch
from app.repositories.product_repository import sellable_batch_condition


class BatchRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, batch_id: uuid.UUID, *, for_update: bool = False) -> ProductBatch | None:
        stmt = select(ProductBatch).where(ProductBatch.id == batch_id)
        if for_update:
            # populate_existing: refresca el objeto del identity map con la fila bloqueada.
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        return await self.session.scalar(stmt)

    async def lock_many(self, batch_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, ProductBatch]:
        """Bloquea varios lotes en orden determinista de PK (evita deadlocks)."""
        if not batch_ids:
            return {}
        stmt = (
            select(ProductBatch)
            .where(ProductBatch.id.in_(batch_ids))
            .order_by(ProductBatch.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result = await self.session.scalars(stmt)
        return {b.id: b for b in result.all()}

    async def lock_available_fefo(
        self,
        *,
        product_id: uuid.UUID,
        branch_id: uuid.UUID,
        today: date,
        allow_expired: bool,
    ) -> list[ProductBatch]:
        """``SELECT ... FOR UPDATE`` de lotes con saldo, ordenados FEFO.

        Equivale a::

            SELECT * FROM product_batches
             WHERE product_id = :id AND branch_id = :branch_id AND current_quantity > 0
               [AND (expiration_date IS NULL OR expiration_date >= :today)]
             ORDER BY expiration_date ASC NULLS LAST, received_at ASC, id ASC
             FOR UPDATE
        """
        stmt = (
            select(ProductBatch)
            .where(
                ProductBatch.product_id == product_id,
                ProductBatch.branch_id == branch_id,
                sellable_batch_condition(today, allow_expired),
            )
            .order_by(
                ProductBatch.expiration_date.asc().nulls_last(),
                ProductBatch.received_at.asc(),
                ProductBatch.id.asc(),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result = await self.session.scalars(stmt)
        return list(result.all())

    async def current_sale_price(self, *, product_id: uuid.UUID, branch_id: uuid.UUID) -> Decimal | None:
        """Precio de lista vigente: ``sale_price`` del lote más reciente en la sucursal."""
        stmt = (
            select(ProductBatch.sale_price)
            .where(ProductBatch.product_id == product_id, ProductBatch.branch_id == branch_id)
            .order_by(ProductBatch.received_at.desc(), ProductBatch.id.desc())
            .limit(1)
        )
        return await self.session.scalar(stmt)

    async def latest_prices(
        self, *, product_id: uuid.UUID, branch_id: uuid.UUID
    ) -> tuple[Decimal, Decimal] | None:
        """``(cost_price, sale_price)`` del lote más reciente; prioriza la sucursal indicada."""
        stmt = (
            select(ProductBatch.cost_price, ProductBatch.sale_price)
            .where(ProductBatch.product_id == product_id)
            .order_by(
                (ProductBatch.branch_id == branch_id).desc(),
                ProductBatch.received_at.desc(),
                ProductBatch.id.desc(),
            )
            .limit(1)
        )
        row = (await self.session.execute(stmt)).tuples().first()
        return (row[0], row[1]) if row else None

    async def batch_number_exists(
        self, *, product_id: uuid.UUID, branch_id: uuid.UUID, batch_number: str
    ) -> bool:
        stmt = select(func.count()).where(
            ProductBatch.product_id == product_id,
            ProductBatch.branch_id == branch_id,
            ProductBatch.batch_number == batch_number,
        )
        return int(await self.session.scalar(stmt) or 0) > 0

    async def list_with_product(
        self,
        *,
        branch_id: uuid.UUID,
        product_id: uuid.UUID | None,
        only_available: bool,
        expiring_before: date | None,
        offset: int,
        limit: int,
    ) -> tuple[list[tuple[ProductBatch, Product]], int]:
        stmt = select(ProductBatch, Product).join(Product, Product.id == ProductBatch.product_id).where(
            ProductBatch.branch_id == branch_id
        )
        if product_id is not None:
            stmt = stmt.where(ProductBatch.product_id == product_id)
        if only_available:
            stmt = stmt.where(ProductBatch.current_quantity > 0)
        if expiring_before is not None:
            stmt = stmt.where(ProductBatch.expiration_date <= expiring_before)

        total = int(
            await self.session.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
        )
        stmt = (
            stmt.order_by(
                ProductBatch.expiration_date.asc().nulls_last(),
                ProductBatch.received_at.asc(),
            )
            .offset(offset)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).tuples().all()
        return [(b, p) for b, p in rows], total
