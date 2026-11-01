"""Gestión de catálogo y consultas de stock por sucursal."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import today_local
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.models import Product
from app.repositories.product_repository import ProductRepository, ProductStockRow
from app.repositories.user_repository import BranchRepository
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate, ProductWithStock


def to_product_with_stock(row: ProductStockRow) -> ProductWithStock:
    base = ProductOut.model_validate(row.product).model_dump()
    return ProductWithStock(
        **base,
        stock=row.stock,
        sale_price=row.sale_price,
        last_cost_price=row.last_cost_price,
        next_expiration=row.next_expiration,
    )


class ProductService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.products = ProductRepository(session)
        self.branches = BranchRepository(session)

    async def _ensure_branch(self, branch_id: uuid.UUID) -> None:
        if await self.branches.get(branch_id) is None:
            raise NotFoundError("BRANCH_NOT_FOUND", "La sucursal indicada no existe")

    async def search(
        self,
        *,
        branch_id: uuid.UUID,
        query: str | None,
        include_inactive: bool,
        only_in_stock: bool,
        offset: int,
        limit: int,
    ) -> Page[ProductWithStock]:
        await self._ensure_branch(branch_id)
        rows, total = await self.products.search_with_stock(
            branch_id=branch_id,
            today=today_local(),
            allow_expired=settings.ALLOW_SELLING_EXPIRED,
            query=query.strip() if query else None,
            include_inactive=include_inactive,
            only_in_stock=only_in_stock,
            offset=offset,
            limit=limit,
        )
        return Page[ProductWithStock](
            items=[to_product_with_stock(r) for r in rows], total=total, offset=offset, limit=limit
        )

    async def get_by_barcode(self, *, barcode: str, branch_id: uuid.UUID) -> ProductWithStock:
        await self._ensure_branch(branch_id)
        row = await self.products.get_with_stock(
            branch_id=branch_id,
            today=today_local(),
            allow_expired=settings.ALLOW_SELLING_EXPIRED,
            barcode=barcode.strip(),
        )
        if row is None:
            raise NotFoundError(
                "PRODUCT_NOT_FOUND",
                f"No existe un producto con el código de barras '{barcode}'",
                extra={"barcode": barcode},
            )
        return to_product_with_stock(row)

    async def get_with_stock(self, *, product_id: uuid.UUID, branch_id: uuid.UUID) -> ProductWithStock:
        await self._ensure_branch(branch_id)
        row = await self.products.get_with_stock(
            branch_id=branch_id,
            today=today_local(),
            allow_expired=settings.ALLOW_SELLING_EXPIRED,
            product_id=product_id,
        )
        if row is None:
            raise NotFoundError("PRODUCT_NOT_FOUND", "Producto no encontrado")
        return to_product_with_stock(row)

    async def create(self, payload: ProductCreate) -> Product:
        product, created = await self.products.insert_if_absent(
            barcode=payload.barcode,
            name=payload.name,
            sku=payload.sku,
            category=payload.category,
            unit=payload.unit.upper(),
            min_stock=payload.min_stock,
        )
        if not created:
            await self.session.rollback()
            raise ConflictError(
                "BARCODE_ALREADY_EXISTS",
                f"Ya existe un producto con el código '{payload.barcode}'",
                extra={"product_id": str(product.id)},
            )
        await self.session.commit()
        return product

    async def update(self, product_id: uuid.UUID, payload: ProductUpdate) -> Product:
        product = await self.products.get(product_id)
        if product is None:
            raise NotFoundError("PRODUCT_NOT_FOUND", "Producto no encontrado")
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            if field in {"name", "is_active", "min_stock"} and value is None:
                continue  # columnas NOT NULL: ignorar nulos explícitos
            if field == "unit" and isinstance(value, str):
                value = value.upper()
            setattr(product, field, value)
        await self.session.commit()
        return product

