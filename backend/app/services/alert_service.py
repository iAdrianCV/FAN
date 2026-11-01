"""Motor de alertas preventivas (vencimientos y stock bajo).

El evaluador es idempotente:
* Crea una alerta por cada condición activa que no tenga ya una alerta NO resuelta
  con la misma clave ``(alert_type, branch_id, reference_id)``.
* Auto-resuelve alertas cuya condición desapareció (lote agotado/dado de baja,
  stock repuesto, lote que pasó de "por vencer" a "vencido").
* Un advisory lock evita ejecuciones concurrentes (varios workers / instancias).
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, timedelta

from sqlalchemy import case, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import now_utc, today_local
from app.core.config import settings
from app.core.enums import EVALUATED_ALERT_TYPES, AlertSeverity, AlertType, UserRole
from app.core.errors import ForbiddenError, NotFoundError
from app.core.money import fmt_qty
from app.db.session import AsyncSessionLocal
from app.models import Product, ProductBatch, SystemAlert, User
from app.repositories.alert_repository import AlertRepository
from app.repositories.product_repository import sellable_batch_condition
from app.schemas.alert import AlertCountOut, AlertEvaluationResult, AlertOut
from app.schemas.common import Page

logger = logging.getLogger("lotepos.alerts")

AlertKey = tuple[str, uuid.UUID, uuid.UUID]  # (alert_type, branch_id, reference_id)
_EVALUATED = [t.value for t in EVALUATED_ALERT_TYPES]


def _fmt_date(d: date) -> str:
    return d.strftime("%d/%m/%Y")


class AlertService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.alerts = AlertRepository(session)

    # ------------------------------------------------------------ evaluador
    async def evaluate(self, branch_id: uuid.UUID | None = None) -> AlertEvaluationResult:
        """Evalúa todas las condiciones y sincroniza ``system_alerts`` en una transacción."""
        acquired = await self.session.scalar(
            text("SELECT GET_LOCK('lotepos_alerts_evaluator', 0)")
        )
        if not acquired or acquired == 0:
            await self.session.rollback()
            logger.info("Evaluación de alertas omitida: otra ejecución en curso")
            return AlertEvaluationResult(executed=False, created=0, resolved=0, evaluated_at=now_utc())

        today = today_local()
        desired: dict[AlertKey, tuple[str, str]] = {}
        await self._collect_expiration_conditions(desired, today, branch_id)
        await self._collect_low_stock_conditions(desired, today, branch_id)

        existing = await self.alerts.unresolved(alert_types=_EVALUATED, branch_id=branch_id)
        existing_keys: set[AlertKey] = set()
        to_resolve: list[uuid.UUID] = []
        for alert in existing:
            key: AlertKey = (alert.alert_type, alert.branch_id, alert.reference_id)
            if key in existing_keys or key not in desired:
                to_resolve.append(alert.id)  # duplicada o condición ya no vigente
            else:
                existing_keys.add(key)

        now = now_utc()
        to_insert: list[dict[str, object]] = [
            {
                "id": uuid.uuid4(),
                "branch_id": key[1],
                "alert_type": key[0],
                "reference_id": key[2],
                "message": message,
                "severity": severity,
                "is_resolved": False,
                "created_at": now,
            }
            for key, (message, severity) in desired.items()
            if key not in existing_keys
        ]

        created = await self.alerts.bulk_insert(to_insert)
        resolved = await self.alerts.resolve_ids(to_resolve)
        await self.session.commit()

        logger.info("Alertas evaluadas (branch=%s): creadas=%d resueltas=%d", branch_id, created, resolved)
        return AlertEvaluationResult(executed=True, created=created, resolved=resolved, evaluated_at=now)

    async def _collect_expiration_conditions(
        self, desired: dict[AlertKey, tuple[str, str]], today: date, branch_id: uuid.UUID | None
    ) -> None:
        threshold = today + timedelta(days=settings.ALERTS_EXPIRING_DAYS)
        stmt = (
            select(
                ProductBatch.id,
                ProductBatch.branch_id,
                ProductBatch.batch_number,
                ProductBatch.expiration_date,
                ProductBatch.current_quantity,
                Product.name,
                Product.unit,
            )
            .join(Product, Product.id == ProductBatch.product_id)
            .where(
                ProductBatch.current_quantity > 0,
                ProductBatch.expiration_date.is_not(None),
                ProductBatch.expiration_date <= threshold,
            )
        )
        if branch_id is not None:
            stmt = stmt.where(ProductBatch.branch_id == branch_id)

        for batch_id, b_branch, batch_number, exp, qty, name, unit in (await self.session.execute(stmt)).tuples():
            assert exp is not None
            stock_txt = f"{fmt_qty(qty)} {unit}"
            if exp < today:
                desired[(AlertType.EXPIRED.value, b_branch, batch_id)] = (
                    f"VENCIDO: {name} (lote {batch_number}) venció el {_fmt_date(exp)} "
                    f"y aún tiene {stock_txt} en estantería",
                    AlertSeverity.HIGH.value,
                )
            else:
                days = (exp - today).days
                when = "vence HOY" if days == 0 else ("vence mañana" if days == 1 else f"vence en {days} días")
                desired[(AlertType.EXPIRING_SOON.value, b_branch, batch_id)] = (
                    f"Por vencer: {name} (lote {batch_number}) {when} ({_fmt_date(exp)}). Stock: {stock_txt}",
                    AlertSeverity.MEDIUM.value,
                )

    async def _collect_low_stock_conditions(
        self, desired: dict[AlertKey, tuple[str, str]], today: date, branch_id: uuid.UUID | None
    ) -> None:
        sellable_qty = case(
            (sellable_batch_condition(today, settings.ALLOW_SELLING_EXPIRED), ProductBatch.current_quantity),
            else_=0,
        )
        stock_sq = (
            select(
                ProductBatch.branch_id.label("branch_id"),
                ProductBatch.product_id.label("product_id"),
                func.coalesce(func.sum(sellable_qty), 0).label("stock"),
            )
            .group_by(ProductBatch.branch_id, ProductBatch.product_id)
        )
        if branch_id is not None:
            stock_sq = stock_sq.where(ProductBatch.branch_id == branch_id)
        sq = stock_sq.subquery("stock_by_branch")

        stmt = (
            select(sq.c.branch_id, sq.c.product_id, sq.c.stock, Product.name, Product.min_stock, Product.unit)
            .join(Product, Product.id == sq.c.product_id)
            .where(Product.is_active.is_(True), sq.c.stock <= Product.min_stock)
        )
        for b_branch, product_id, stock, name, min_stock, unit in (await self.session.execute(stmt)).tuples():
            if stock <= 0:
                message = f"SIN STOCK: {name} está agotado (mínimo {fmt_qty(min_stock)} {unit})"
            else:
                message = f"Stock bajo: {name} tiene {fmt_qty(stock)} {unit} (mínimo {fmt_qty(min_stock)} {unit})"
            desired[(AlertType.LOW_STOCK.value, b_branch, product_id)] = (message, AlertSeverity.LOW.value)

    # ------------------------------------------------------------ consultas
    async def list_alerts(
        self,
        *,
        branch_id: uuid.UUID | None,
        is_resolved: bool | None,
        alert_type: AlertType | None,
        severity: AlertSeverity | None,
        offset: int,
        limit: int,
    ) -> Page[AlertOut]:
        types = [alert_type.value] if alert_type else _EVALUATED
        rows, total = await self.alerts.list_alerts(
            branch_id=branch_id,
            is_resolved=is_resolved,
            alert_types=types,
            severity=severity.value if severity else None,
            offset=offset,
            limit=limit,
        )
        return Page[AlertOut](items=[AlertOut.model_validate(a) for a in rows], total=total, offset=offset, limit=limit)

    async def count_pending(self, branch_id: uuid.UUID | None) -> AlertCountOut:
        counts = await self.alerts.count_pending_by_severity(branch_id, _EVALUATED)
        high = counts.get(AlertSeverity.HIGH.value, 0)
        medium = counts.get(AlertSeverity.MEDIUM.value, 0)
        low = counts.get(AlertSeverity.LOW.value, 0)
        return AlertCountOut(total=high + medium + low, high=high, medium=medium, low=low)

    async def resolve(self, alert_id: uuid.UUID, user: User) -> AlertOut:
        alert: SystemAlert | None = await self.alerts.get(alert_id)
        if alert is None:
            raise NotFoundError("ALERT_NOT_FOUND", "Alerta no encontrada")
        if (
            user.role == UserRole.CASHIER.value
            and user.branch_id is not None
            and user.branch_id != alert.branch_id
        ):
            raise ForbiddenError("No tiene acceso a la sucursal de esta alerta")
        alert.is_resolved = True
        await self.session.commit()
        return AlertOut.model_validate(alert)


async def run_alert_evaluation(branch_id: uuid.UUID | None = None) -> None:
    """Punto de entrada para APScheduler y ``BackgroundTasks`` (sesión propia)."""
    async with AsyncSessionLocal() as session:
        try:
            await AlertService(session).evaluate(branch_id)
        except Exception:  # noqa: BLE001 - una tarea en segundo plano nunca debe romper el proceso
            await session.rollback()
            logger.exception("Fallo en la evaluación de alertas (branch=%s)", branch_id)

