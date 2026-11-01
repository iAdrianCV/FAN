"""Endpoints de reportes financieros y cierre de caja."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DateRangeDep, DbSession, scoped_branch, scoped_user
from app.schemas.report import ReportSummary
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/summary",
    response_model=ReportSummary,
    summary="Resumen de ventas, margen bruto y desglose por medio de pago",
)
async def summary(
    db: DbSession,
    user: CurrentUser,
    dates: DateRangeDep,
    branch_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
    receipts_limit: Annotated[int, Query(ge=0, le=2000)] = 500,
) -> ReportSummary:
    return await ReportService(db).summary(
        date_from=dates.date_from,
        date_to=dates.date_to,
        branch_id=scoped_branch(user, branch_id),
        user_id=scoped_user(user, user_id),
        receipts_limit=receipts_limit,
    )

