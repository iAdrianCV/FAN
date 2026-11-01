"""Repositorio de alertas del sistema."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence

from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AlertSeverity
from app.models import SystemAlert


class AlertRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, alert_id: uuid.UUID) -> SystemAlert | None:
        return await self.session.get(SystemAlert, alert_id)

    async def list_alerts(
        self,
        *,
        branch_id: uuid.UUID | None,
        is_resolved: bool | None,
        alert_types: Sequence[str] | None,
        severity: str | None,
        offset: int,
        limit: int,
    ) -> tuple[Sequence[SystemAlert], int]:
        stmt = select(SystemAlert)
        if branch_id is not None:
            stmt = stmt.where(SystemAlert.branch_id == branch_id)
        if is_resolved is not None:
            stmt = stmt.where(SystemAlert.is_resolved.is_(is_resolved))
        if alert_types:
            stmt = stmt.where(SystemAlert.alert_type.in_(alert_types))
        if severity is not None:
            stmt = stmt.where(SystemAlert.severity == severity)
        total = int(await self.session.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
        # Orden: severidad (rojo > ámbar > amarillo > info) y luego más recientes primero.
        order_case = case(
            (SystemAlert.severity == AlertSeverity.HIGH.value, 0),
            (SystemAlert.severity == AlertSeverity.MEDIUM.value, 1),
            (SystemAlert.severity == AlertSeverity.LOW.value, 2),
            else_=3,
        )
        stmt = stmt.order_by(order_case, SystemAlert.created_at.desc()).offset(offset).limit(limit)
        result = await self.session.scalars(stmt)
        return result.all(), total

    async def count_pending_by_severity(self, branch_id: uuid.UUID | None, alert_types: Sequence[str]) -> dict[str, int]:
        stmt = (
            select(SystemAlert.severity, func.count())
            .where(SystemAlert.is_resolved.is_(False), SystemAlert.alert_type.in_(alert_types))
            .group_by(SystemAlert.severity)
        )
        if branch_id is not None:
            stmt = stmt.where(SystemAlert.branch_id == branch_id)
        rows = (await self.session.execute(stmt)).tuples().all()
        return {sev: int(cnt) for sev, cnt in rows}

    async def unresolved(
        self, *, alert_types: Sequence[str], branch_id: uuid.UUID | None
    ) -> Sequence[SystemAlert]:
        stmt = select(SystemAlert).where(
            SystemAlert.is_resolved.is_(False), SystemAlert.alert_type.in_(alert_types)
        )
        if branch_id is not None:
            stmt = stmt.where(SystemAlert.branch_id == branch_id)
        result = await self.session.scalars(stmt)
        return result.all()

    async def bulk_insert(self, rows: list[dict[str, object]]) -> int:
        """Inserta alertas ignorando duplicados si existe un índice único en la BD."""
        if not rows:
            return 0
        stmt = mysql_insert(SystemAlert).values(rows).prefix_with("IGNORE")
        result = await self.session.execute(stmt)
        return int(result.rowcount or 0)  # type: ignore[attr-defined]

    async def resolve_ids(self, alert_ids: Iterable[uuid.UUID]) -> int:
        ids = list(alert_ids)
        if not ids:
            return 0
        result = await self.session.execute(
            update(SystemAlert)
            .where(SystemAlert.id.in_(ids), SystemAlert.is_resolved.is_(False))
            .values(is_resolved=True)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]

    async def resolve_for_reference(self, *, reference_id: uuid.UUID, alert_types: Sequence[str]) -> int:
        result = await self.session.execute(
            update(SystemAlert)
            .where(
                SystemAlert.reference_id == reference_id,
                SystemAlert.alert_type.in_(alert_types),
                SystemAlert.is_resolved.is_(False),
            )
            .values(is_resolved=True)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
