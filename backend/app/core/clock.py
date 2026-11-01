"""Utilidades de fecha/hora conscientes de zona horaria."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.config import settings

LOCAL_TZ: ZoneInfo = ZoneInfo(settings.TIMEZONE)


def now_utc() -> datetime:
    """Instante actual en UTC (timezone-aware)."""
    return datetime.now(timezone.utc)


def now_local() -> datetime:
    """Instante actual en la zona horaria del negocio."""
    return datetime.now(LOCAL_TZ)


def today_local() -> date:
    """Fecha calendario actual en la zona horaria del negocio (base de FEFO y alertas)."""
    return now_local().date()


def ensure_aware(value: datetime) -> datetime:
    """Interpreta datetimes 'naive' en la zona del negocio."""
    return value if value.tzinfo is not None else value.replace(tzinfo=LOCAL_TZ)


def local_day_bounds(day: date) -> tuple[datetime, datetime]:
    """Rango semiabierto [inicio, fin) de un día local."""
    start = datetime.combine(day, time.min, tzinfo=LOCAL_TZ)
    return start, start + timedelta(days=1)

