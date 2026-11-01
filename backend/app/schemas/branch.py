"""Schemas de sucursales."""

from __future__ import annotations

import uuid

from app.schemas.common import ORMModel


class BranchOut(ORMModel):
    id: uuid.UUID
    name: str
    address: str | None

