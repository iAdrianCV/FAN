"""Endpoints de sucursales."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.enums import UserRole
from app.core.errors import NotFoundError
from app.repositories.user_repository import BranchRepository
from app.schemas.branch import BranchOut

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut], summary="Sucursales accesibles por el usuario")
async def list_branches(db: DbSession, user: CurrentUser) -> list[BranchOut]:
    branches = await BranchRepository(db).list_all()
    if user.role == UserRole.CASHIER.value and user.branch_id is not None:
        branches = [b for b in branches if b.id == user.branch_id]
    return [BranchOut.model_validate(b) for b in branches]


@router.get("/{branch_id}", response_model=BranchOut)
async def get_branch(branch_id: uuid.UUID, db: DbSession, _: CurrentUser) -> BranchOut:
    branch = await BranchRepository(db).get(branch_id)
    if branch is None:
        raise NotFoundError("BRANCH_NOT_FOUND", "Sucursal no encontrada")
    return BranchOut.model_validate(branch)

