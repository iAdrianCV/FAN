"""Schemas de autenticación."""

from __future__ import annotations

import uuid

from pydantic import Field

from app.core.enums import UserRole
from app.schemas.common import InputModel, ORMModel


class LoginRequest(InputModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=4, max_length=128)


class UserOut(ORMModel):
    id: uuid.UUID
    username: str
    full_name: str
    role: UserRole
    branch_id: uuid.UUID | None


class TokenResponse(ORMModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut

