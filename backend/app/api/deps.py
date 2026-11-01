"""Dependencias compartidas de la API: sesión, usuario autenticado, roles y rangos de fecha."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Coroutine
from datetime import datetime
from typing import Annotated, Any

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import ensure_aware, local_day_bounds, today_local
from app.core.enums import UserRole
from app.core.errors import BusinessRuleError, ForbiddenError, UnauthorizedError
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models import User
from app.repositories.user_repository import UserRepository

DbSession = Annotated[AsyncSession, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False, description="JWT obtenido en /api/v1/auth/login")


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Valida el Bearer JWT y devuelve el usuario activo."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UnauthorizedError("Falta el token de autenticación")
    try:
        user_id = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise UnauthorizedError("Token inválido o expirado") from exc
    user = await UserRepository(db).get(user_id)
    if user is None or not user.is_active:
        raise UnauthorizedError("Usuario no válido o desactivado")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], Coroutine[Any, Any, User]]:
    """Fábrica de dependencias que restringe el acceso a ciertos roles."""
    allowed = {r.value for r in roles}

    async def _checker(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise ForbiddenError(f"Requiere uno de los roles: {', '.join(sorted(allowed))}")
        return user

    return _checker


ManagerUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.SUPERVISOR))]


class DateRange:
    """Rango [date_from, date_to). Por defecto: el día local actual completo."""

    def __init__(
        self,
        date_from: Annotated[
            datetime | None, Query(description="Inicio (ISO 8601). Sin zona = hora local del negocio")
        ] = None,
        date_to: Annotated[datetime | None, Query(description="Fin exclusivo (ISO 8601)")] = None,
    ) -> None:
        default_from, default_to = local_day_bounds(today_local())
        self.date_from: datetime = ensure_aware(date_from) if date_from else default_from
        self.date_to: datetime = ensure_aware(date_to) if date_to else default_to
        if self.date_to <= self.date_from:
            raise BusinessRuleError("INVALID_DATE_RANGE", "date_to debe ser posterior a date_from")


DateRangeDep = Annotated[DateRange, Depends(DateRange)]


def scoped_branch(user: User, branch_id: uuid.UUID | None) -> uuid.UUID | None:
    """Cajeros con sucursal fija solo consultan su sucursal."""
    if user.role == UserRole.CASHIER.value and user.branch_id is not None:
        if branch_id is not None and branch_id != user.branch_id:
            raise ForbiddenError("No tiene acceso a la sucursal indicada")
        return user.branch_id
    return branch_id


def scoped_user(user: User, user_id: uuid.UUID | None) -> uuid.UUID | None:
    """Los cajeros solo pueden consultar sus propias ventas/reportes."""
    if user.role == UserRole.CASHIER.value:
        if user_id is not None and user_id != user.id:
            raise ForbiddenError("Solo puede consultar sus propias ventas")
        return user.id
    return user_id


Pagination = Annotated[int, Query(ge=0, description="Desplazamiento")]
Limit = Annotated[int, Query(ge=1, le=200, description="Tamaño de página")]

