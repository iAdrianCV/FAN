"""Punto de entrada de la API LotePOS.

Ejecutar en desarrollo::

    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.scheduler import build_scheduler
from app.db.session import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("lotepos")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    scheduler = build_scheduler() if settings.ALERTS_SCHEDULER_ENABLED else None
    if scheduler is not None:
        scheduler.start()
    logger.info("%s %s iniciado (%s)", settings.PROJECT_NAME, settings.VERSION, settings.ENVIRONMENT)
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
        await engine.dispose()
        logger.info("%s detenido", settings.PROJECT_NAME)


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="POS y control de stock con trazabilidad por lotes, ventas FEFO y alertas preventivas.",
        lifespan=lifespan,
        docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_exception_handlers(app)
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    @app.get("/health", tags=["health"], summary="Liveness + conectividad a BD")
    async def health() -> dict[str, str]:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "version": settings.VERSION}

    return app


app = create_app()

