"""Base declarativa.

IMPORTANTE: Los modelos SOLO mapean tablas existentes. Nunca se ejecuta
``Base.metadata.create_all`` ni migraciones desde esta aplicación.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base declarativa común."""


class UUIDPkMixin:
    """PK UUID generada en la aplicación (almacenada como CHAR(36) en MySQL)."""

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)

