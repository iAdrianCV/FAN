"""Endpoints del motor de alertas."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, Limit, Pagination, scoped_branch
from app.core.enums import AlertSeverity, AlertType
from app.schemas.alert import AlertCountOut, AlertEvaluationResult, AlertOut
from app.schemas.common import Page
from app.services.alert_service import AlertService

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=Page[AlertOut], summary="Listar alertas (por defecto, pendientes)")
async def list_alerts(
    db: DbSession,
    user: CurrentUser,
    branch_id: uuid.UUID | None = None,
    is_resolved: Annotated[bool | None, Query(description="null = todas")] = False,
    alert_type: AlertType | None = None,
    severity: AlertSeverity | None = None,
    refresh: Annotated[bool, Query(description="Evaluar condiciones antes de listar")] = False,
    offset: Pagination = 0,
    limit: Limit = 100,
) -> Page[AlertOut]:
    branch = scoped_branch(user, branch_id)
    service = AlertService(db)
    if refresh:
        await service.evaluate(branch)
    return await service.list_alerts(
        branch_id=branch,
        is_resolved=is_resolved,
        alert_type=alert_type,
        severity=severity,
        offset=offset,
        limit=limit,
    )


@router.get("/count", response_model=AlertCountOut, summary="Contador de alertas pendientes (badge)")
async def count_alerts(db: DbSession, user: CurrentUser, branch_id: uuid.UUID | None = None) -> AlertCountOut:
    return await AlertService(db).count_pending(scoped_branch(user, branch_id))


@router.post("/evaluate", response_model=AlertEvaluationResult, summary="Ejecutar el evaluador bajo demanda")
async def evaluate_alerts(
    db: DbSession, user: CurrentUser, branch_id: uuid.UUID | None = None
) -> AlertEvaluationResult:
    return await AlertService(db).evaluate(scoped_branch(user, branch_id))


@router.patch("/{alert_id}/resolve", response_model=AlertOut, summary="Marcar alerta como resuelta")
async def resolve_alert(alert_id: uuid.UUID, db: DbSession, user: CurrentUser) -> AlertOut:
    return await AlertService(db).resolve(alert_id, user)

