"""Motor y sesiones asíncronas de SQLAlchemy 2.0 sobre aiomysql (MySQL / MariaDB)."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DB_ECHO,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=3600,
    pool_pre_ping=True,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """Dependencia FastAPI: una sesión por request con rollback automático ante errores.

    Los servicios son responsables de hacer ``commit``; cualquier excepción propagada
    revierte la transacción y libera los bloqueos ``FOR UPDATE`` adquiridos.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise

