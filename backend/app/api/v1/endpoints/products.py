"""Endpoints de productos y stock consolidado."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from app.api.deps import CurrentUser, DbSession, Limit, ManagerUser, Pagination, scoped_branch
from app.schemas.common import Page
from app.schemas.product import ProductCreate, ProductOut, ProductUpdate, ProductWithStock
from app.services.product_service import ProductService

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=Page[ProductWithStock], summary="Buscar productos con stock por sucursal")
async def search_products(
    db: DbSession,
    user: CurrentUser,
    branch_id: Annotated[uuid.UUID, Query()],
    q: Annotated[str | None, Query(max_length=100, description="Nombre, SKU o código exacto")] = None,
    include_inactive: bool = False,
    only_in_stock: bool = False,
    offset: Pagination = 0,
    limit: Limit = 50,
) -> Page[ProductWithStock]:
    branch = scoped_branch(user, branch_id) or branch_id
    return await ProductService(db).search(
        branch_id=branch,
        query=q,
        include_inactive=include_inactive,
        only_in_stock=only_in_stock,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/barcode/{barcode}",
    response_model=ProductWithStock,
    summary="Buscar por código de barras (escáner). 404 PRODUCT_NOT_FOUND si no existe",
)
async def get_by_barcode(
    db: DbSession,
    user: CurrentUser,
    barcode: Annotated[str, Path(min_length=3, max_length=64)],
    branch_id: Annotated[uuid.UUID, Query()],
) -> ProductWithStock:
    branch = scoped_branch(user, branch_id) or branch_id
    return await ProductService(db).get_by_barcode(barcode=barcode, branch_id=branch)


@router.get("/{product_id}", response_model=ProductWithStock)
async def get_product(
    product_id: uuid.UUID,
    db: DbSession,
    user: CurrentUser,
    branch_id: Annotated[uuid.UUID, Query()],
) -> ProductWithStock:
    branch = scoped_branch(user, branch_id) or branch_id
    return await ProductService(db).get_with_stock(product_id=product_id, branch_id=branch)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def create_product(payload: ProductCreate, db: DbSession, _: ManagerUser) -> ProductOut:
    return ProductOut.model_validate(await ProductService(db).create(payload))


@router.patch("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: uuid.UUID, payload: ProductUpdate, db: DbSession, _: ManagerUser
) -> ProductOut:
    return ProductOut.model_validate(await ProductService(db).update(product_id, payload))

