"""Endpoints de autenticación."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse, summary="Iniciar sesión (JWT Bearer)")
async def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    return await AuthService(db).login(payload.username, payload.password)


@router.get("/me", response_model=UserOut, summary="Usuario autenticado")
async def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)

