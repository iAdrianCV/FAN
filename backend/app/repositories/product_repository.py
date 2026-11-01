"""Repositorio de productos, incluyendo consultas de stock consolidado por sucursal."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Product, ProductBatch


@dataclass(frozen=True, slots=True)
class ProductStockRow:
    """Proyección de producto + stock vendible + precio vigente."""

    product: Product
    stock: Decimal
    sale_price: Decimal | None
    last_cost_price: Decimal | None
    next_expiration: date | None


def sellable_batch_condition(today: date, allow_expired: bool) -> ColumnElement[bool]:
    """Condición SQL de lote vendible: con saldo y (si aplica) no vencido."""
    has_stock = ProductBatch.current_quantity > 0
    if allow_expired:
        return has_stock
    return and_(
        has_stock,
        or_(ProductBatch.expiration_date.is_(None), ProductBatch.expiration_date >= today),
    )


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class ProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, product_id: uuid.UUID) -> Product | None:
        return await self.session.get(Product, product_id)

    async def get_many(self, product_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, Product]:
        if not product_ids:
            return {}
        result = await self.session.scalars(select(Product).where(Product.id.in_(product_ids)))
        return {p.id: p for p in result.all()}

    async def get_by_barcode(self, barcode: str) -> Product | None:
        return await self.session.scalar(select(Product).where(Product.barcode == barcode))

    async def insert_if_absent(
        self,
        *,
        barcode: str,
        name: str,
        sku: str | None,
        category: str | None,
        unit: str,
        min_stock: Decimal,
    ) -> tuple[Product, bool]:
        """Inserta el producto si el barcode no existe."""
        product = await self.get_by_barcode(barcode)
        if product is not None:
            return product, False

        product = Product(
            id=uuid.uuid4(),
            barcode=barcode,
            name=name,
            sku=sku,
            category=category,
            unit=unit,
            min_stock=min_stock,
            is_active=True,
        )
        self.session.add(product)
        await self.session.flush()
        return product, True

    # ------------------------------------------------------------------ stock
    def _stock_query(self, branch_id: uuid.UUID, today: date, allow_expired: bool) -> Select[tuple[Product, Decimal, Decimal | None, Decimal | None, date | None]]:
        stock_sq = (
            select(
                ProductBatch.product_id.label("product_id"),
                func.sum(ProductBatch.current_quantity).label("stock"),
                func.min(ProductBatch.expiration_date).label("next_expiration"),
            )
            .where(ProductBatch.branch_id == branch_id, sellable_batch_condition(today, allow_expired))
            .group_by(ProductBatch.product_id)
            .subquery("stock_sq")
        )
        # Precio vigente = lote más reciente recibido en la sucursal (Window Function SQL estándar).
        rn = func.row_number().over(
            partition_by=ProductBatch.product_id,
            order_by=(ProductBatch.received_at.desc(), ProductBatch.id.desc()),
        ).label("rn")
        price_ranked = (
            select(
                ProductBatch.product_id.label("product_id"),
                ProductBatch.sale_price.label("sale_price"),
                ProductBatch.cost_price.label("cost_price"),
                rn,
            )
            .where(ProductBatch.branch_id == branch_id)
            .subquery("price_ranked")
        )
        price_sq = (
            select(
                price_ranked.c.product_id,
                price_ranked.c.sale_price,
                price_ranked.c.cost_price,
            )
            .where(price_ranked.c.rn == 1)
            .subquery("price_sq")
        )
        return (
            select(
                Product,
                func.coalesce(stock_sq.c.stock, 0),
                price_sq.c.sale_price,
                price_sq.c.cost_price,
                stock_sq.c.next_expiration,
            )
            .outerjoin(stock_sq, stock_sq.c.product_id == Product.id)
            .outerjoin(price_sq, price_sq.c.product_id == Product.id)
        )

    @staticmethod
    def _to_row(row: tuple[Product, Decimal, Decimal | None, Decimal | None, date | None]) -> ProductStockRow:
        product, stock, sale_price, cost_price, next_exp = row
        return ProductStockRow(
            product=product,
            stock=Decimal(stock),
            sale_price=sale_price,
            last_cost_price=cost_price,
            next_expiration=next_exp,
        )

    async def get_with_stock(
        self,
        *,
        branch_id: uuid.UUID,
        today: date,
        allow_expired: bool,
        product_id: uuid.UUID | None = None,
        barcode: str | None = None,
    ) -> ProductStockRow | None:
        stmt = self._stock_query(branch_id, today, allow_expired)
        if product_id is not None:
            stmt = stmt.where(Product.id == product_id)
        elif barcode is not None:
            stmt = stmt.where(Product.barcode == barcode)
        else:
            raise ValueError("Debe indicar product_id o barcode")
        row = (await self.session.execute(stmt)).tuples().first()
        return self._to_row(row) if row else None

    async def search_with_stock(
        self,
        *,
        branch_id: uuid.UUID,
        today: date,
        allow_expired: bool,
        query: str | None,
        include_inactive: bool,
        only_in_stock: bool,
        offset: int,
        limit: int,
    ) -> tuple[list[ProductStockRow], int]:
        """Búsqueda paginada por nombre, SKU o código de barras exacto."""
        stmt = self._stock_query(branch_id, today, allow_expired)
        filters: list[ColumnElement[bool]] = []
        if not include_inactive:
            filters.append(Product.is_active.is_(True))
        if query:
            pattern = f"%{_escape_like(query)}%"
            filters.append(
                or_(
                    Product.name.ilike(pattern, escape="\\"),
                    Product.sku.ilike(pattern, escape="\\"),
                    Product.barcode == query,
                )
            )
        if filters:
            stmt = stmt.where(*filters)
        if only_in_stock:
            stmt = stmt.where(func.coalesce(stmt.selected_columns[1], 0) > 0)

        count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
        total = int(await self.session.scalar(count_stmt) or 0)

        stmt = stmt.order_by(Product.name.asc(), Product.id.asc()).offset(offset).limit(limit)
        rows = (await self.session.execute(stmt)).tuples().all()
        return [self._to_row(r) for r in rows], total

