"""Endpoints de lotes: alta rápida, listado FEFO y bajas por merma."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.api.deps import CurrentUser, DbSession, Limit, ManagerUser, Pagination, scoped_branch
from app.schemas.batch import (
    BatchWithProduct,
    QuickEntryRequest,
    QuickEntryResponse,
    WriteOffRequest,
    WriteOffResponse,
)
from app.schemas.common import Page
from app.services.alert_service import run_alert_evaluation
from app.services.inventory_service import InventoryService

router = APIRouter(prefix="/batches", tags=["batches"])


@router.post(
    "/quick-entry",
    response_model=QuickEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Alta rápida de inventario por código de barras",
)
async def quick_entry(
    payload: QuickEntryRequest,
    db: DbSession,
    user: CurrentUser,
    background: BackgroundTasks,
) -> QuickEntryResponse:
    result = await InventoryService(db).quick_entry(payload, user)
    background.add_task(run_alert_evaluation, payload.branch_id)
    return result


@router.get("", response_model=Page[BatchWithProduct], summary="Lotes de una sucursal en orden FEFO")
async def list_batches(
    db: DbSession,
    user: CurrentUser,
    branch_id: Annotated[uuid.UUID, Query()],
    product_id: uuid.UUID | None = None,
    only_available: bool = True,
    expiring_within_days: Annotated[int | None, Query(ge=0, le=3650)] = None,
    offset: Pagination = 0,
    limit: Limit = 50,
) -> Page[BatchWithProduct]:
    branch = scoped_branch(user, branch_id) or branch_id
    return await InventoryService(db).list_batches(
        branch_id=branch,
        product_id=product_id,
        only_available=only_available,
        expiring_within_days=expiring_within_days,
        offset=offset,
        limit=limit,
    )


@router.post(
    "/{batch_id}/write-off",
    response_model=WriteOffResponse,
    summary="Ajuste de inventario: dar de baja por merma (vencido, dañado, etc.)",
)
async def write_off(
    batch_id: uuid.UUID,
    payload: WriteOffRequest,
    db: DbSession,
    user: ManagerUser,
    background: BackgroundTasks,
) -> WriteOffResponse:
    result = await InventoryService(db).write_off(batch_id, payload, user)
    background.add_task(run_alert_evaluation, result.batch.branch_id)
    return result

