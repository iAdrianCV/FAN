"""Schemas de alertas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.core.enums import AlertSeverity, AlertType
from app.schemas.common import ORMModel


class AlertOut(ORMModel):
    id: uuid.UUID
    branch_id: uuid.UUID
    alert_type: AlertType
    reference_id: uuid.UUID
    message: str
    severity: AlertSeverity
    is_resolved: bool
    created_at: datetime


class AlertCountOut(BaseModel):
    total: int
    high: int
    medium: int
    low: int


class AlertEvaluationResult(BaseModel):
    executed: bool
    created: int
    resolved: int
    evaluated_at: datetime

