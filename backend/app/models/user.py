"""Tabla ``users`` (usuarios del POS para autenticación JWT).

Supuesto de esquema: ``users(id uuid PK, username unique, full_name, password_hash,
role, branch_id uuid NULL -> branches.id, is_active bool)``. Ajuste los nombres de columna
aquí si su esquema difiere; el resto del código solo depende de estos atributos.
"""

from __future__ import annotations

import uuid

from sqlalchemy import Boolean, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin


class User(UUIDPkMixin, Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    branch_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("branches.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

