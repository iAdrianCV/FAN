"""Planificador de tareas periódicas (APScheduler) para el motor de alertas."""

from __future__ import annotations

import logging
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.core.clock import now_utc
from app.core.config import settings
from app.services.alert_service import run_alert_evaluation

logger = logging.getLogger("lotepos.scheduler")


def build_scheduler() -> AsyncIOScheduler:
    """Crea el scheduler con la evaluación de alertas cada ``ALERTS_INTERVAL_HOURS`` horas.

    La primera ejecución ocurre ~30 s después del arranque. Si hay varias instancias,
    el advisory lock del evaluador garantiza que solo una procese a la vez.
    """
    scheduler = AsyncIOScheduler(timezone=settings.TIMEZONE)
    scheduler.add_job(
        run_alert_evaluation,
        trigger=IntervalTrigger(hours=settings.ALERTS_INTERVAL_HOURS),
        id="alerts-evaluator",
        name="Evaluador de alertas de vencimiento y stock",
        next_run_time=now_utc() + timedelta(seconds=30),
        max_instances=1,
        coalesce=True,
        misfire_grace_time=600,
        replace_existing=True,
    )
    logger.info("Scheduler de alertas configurado cada %d h", settings.ALERTS_INTERVAL_HOURS)
    return scheduler

