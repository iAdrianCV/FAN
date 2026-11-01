"""Repositorios de usuarios y sucursales."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Branch, User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def get_by_username(self, username: str) -> User | None:
        stmt = select(User).where(func.lower(User.username) == username.lower())
        return await self.session.scalar(stmt)


class BranchRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, branch_id: uuid.UUID) -> Branch | None:
        return await self.session.get(Branch, branch_id)

    async def list_all(self) -> Sequence[Branch]:
        result = await self.session.scalars(select(Branch).order_by(Branch.name))
        return result.all()

