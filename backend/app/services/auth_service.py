"""Autenticación de usuarios."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import UnauthorizedError
from app.core.security import create_access_token, hash_password, verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth import TokenResponse, UserOut

# Hash bcrypt real (generado al importar) para igualar el tiempo de respuesta con usuarios inexistentes.
_DUMMY_HASH: str = hash_password("fan_pos-timing-equalizer")


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.users = UserRepository(session)

    async def login(self, username: str, password: str) -> TokenResponse:
        user = await self.users.get_by_username(username)
        if user is None:
            verify_password(password, _DUMMY_HASH)
            raise UnauthorizedError("Usuario o contraseña incorrectos")
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("Usuario o contraseña incorrectos")
        if not user.is_active:
            raise UnauthorizedError("El usuario está desactivado")

        token, expires_in = create_access_token(user.id, {"role": user.role})
        return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))
