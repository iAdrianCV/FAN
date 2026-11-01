"""Tabla ``branches``."""

from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UUIDPkMixin


class Branch(UUIDPkMixin, Base):
    __tablename__ = "branches"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)

    def __repr__(self) -> str:
        return f"<Branch {self.name}>"

