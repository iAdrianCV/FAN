"""Reglas de autorización reutilizables por los servicios."""

from __future__ import annotations

import uuid

from app.core.enums import UserRole
from app.core.errors import ForbiddenError
from app.models import User


def ensure_branch_access(user: User, branch_id: uuid.UUID) -> None:
    """Un cajero asignado a una sucursal solo puede operar en ella.

    ADMIN y SUPERVISOR, o usuarios sin sucursal fija, pueden operar en todas.
    """
    if user.role == UserRole.CASHIER.value and user.branch_id is not None and user.branch_id != branch_id:
        raise ForbiddenError("No tiene acceso a la sucursal indicada")

