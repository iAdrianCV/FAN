"""Endpoints de ventas (checkout FEFO, consulta y anulación)."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.api.deps import (
    CurrentUser,
    DateRangeDep,
    DbSession,
    Limit,
    ManagerUser,
    Pagination,
    scoped_branch,
    scoped_user,
)
from app.core.enums import SaleStatus
from app.schemas.common import Page
from app.schemas.sale import CheckoutRequest, SaleOut, SaleSummaryOut, VoidSaleRequest
from app.services.alert_service import run_alert_evaluation
from app.services.sale_service import SaleService

router = APIRouter(prefix="/sales", tags=["sales"])


@router.post(
    "/checkout",
    response_model=SaleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar venta (FEFO + pagos divididos) en una transacción ACID",
)
async def checkout(
    payload: CheckoutRequest,
    db: DbSession,
    user: CurrentUser,
    background: BackgroundTasks,
) -> SaleOut:
    sale = await SaleService(db).checkout(payload, user)
    # Re-evalúa stock bajo/vencimientos de la sucursal tras responder.
    background.add_task(run_alert_evaluation, payload.branch_id)
    return sale


@router.get("", response_model=Page[SaleSummaryOut], summary="Listado de comprobantes")
async def list_sales(
    db: DbSession,
    user: CurrentUser,
    dates: DateRangeDep,
    branch_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    sale_status: Annotated[SaleStatus | None, Query(alias="status")] = None,
    offset: Pagination = 0,
    limit: Limit = 50,
) -> Page[SaleSummaryOut]:
    return await SaleService(db).list_sales(
        date_from=dates.date_from,
        date_to=dates.date_to,
        branch_id=scoped_branch(user, branch_id),
        user_id=scoped_user(user, user_id),
        status=sale_status,
        offset=offset,
        limit=limit,
    )


@router.get("/{sale_id}", response_model=SaleOut)
async def get_sale(sale_id: uuid.UUID, db: DbSession, user: CurrentUser) -> SaleOut:
    return await SaleService(db).get(sale_id, user)


@router.post("/{sale_id}/void", response_model=SaleOut, summary="Anular venta y reponer stock a sus lotes")
async def void_sale(
    sale_id: uuid.UUID,
    payload: VoidSaleRequest,
    db: DbSession,
    user: ManagerUser,
    background: BackgroundTasks,
) -> SaleOut:
    sale = await SaleService(db).void(sale_id, payload, user)
    background.add_task(run_alert_evaluation, sale.branch_id)
    return sale

