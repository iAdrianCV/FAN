"""Router principal de la API v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import alerts, auth, batches, branches, payments, products, reports, sales
from app.schemas.common import PROBLEM_RESPONSES

api_router = APIRouter(responses=PROBLEM_RESPONSES)

api_router.include_router(auth.router)
api_router.include_router(branches.router)
api_router.include_router(products.router)
api_router.include_router(batches.router)
api_router.include_router(sales.router)
api_router.include_router(payments.router)
api_router.include_router(reports.router)
api_router.include_router(alerts.router)

