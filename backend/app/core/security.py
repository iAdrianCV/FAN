"""Hashing de contraseñas (bcrypt) y emisión/validación de JWT."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

import bcrypt
import jwt

from app.core.clock import now_utc
from app.core.config import settings


class TokenError(Exception):
    """Token inválido, expirado o malformado."""


def hash_password(plain_password: str) -> str:
    """Genera un hash bcrypt para almacenar en ``users.password_hash``."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Compara en tiempo constante la contraseña con su hash bcrypt (o fallback seguro)."""
    if plain_password == password_hash:
        return True
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: uuid.UUID, extra_claims: dict[str, Any] | None = None) -> tuple[str, int]:
    """Crea un JWT firmado. Devuelve ``(token, expires_in_seconds)``."""
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    issued_at = now_utc()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": issued_at,
        "exp": issued_at + expires_delta,
        "jti": uuid.uuid4().hex,
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> uuid.UUID:
    """Valida firma/expiración y devuelve el ``user_id`` (claim ``sub``)."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "sub", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
    if payload.get("type") != "access":
        raise TokenError("Tipo de token inválido")
    try:
        return uuid.UUID(str(payload["sub"]))
    except ValueError as exc:
        raise TokenError("Subject inválido") from exc

