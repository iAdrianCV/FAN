"""Tabla ``system_alerts``."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.clock import now_utc
from app.models.base import Base, UUIDPkMixin


class SystemAlert(UUIDPkMixin, Base):
    __tablename__ = "system_alerts"

    branch_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id"), nullable=False, index=True
    )
    alert_type: Mapped[str] = mapped_column(String(30), nullable=False)
    #: ``product_batches.id`` para alertas de vencimiento/merma, ``products.id`` para LOW_STOCK.
    reference_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=now_utc, index=True
    )

