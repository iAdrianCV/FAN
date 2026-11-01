"""Endpoints de pagos."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DateRangeDep, DbSession, Limit, Pagination, scoped_branch
from app.core.enums import PaymentMethod, SaleStatus
from app.repositories.sale_repository import SaleRepository
from app.schemas.common import Page
from app.schemas.payment import PaymentListItem, PaymentMethodInfo
from app.schemas.sale import SalePaymentOut
from app.services.payment_service import PAYMENT_METHODS
from app.services.sale_service import SaleService

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("/methods", response_model=list[PaymentMethodInfo], summary="Catálogo de medios de pago")
async def payment_methods(_: CurrentUser) -> list[PaymentMethodInfo]:
    return list(PAYMENT_METHODS.values())


@router.get("", response_model=Page[PaymentListItem], summary="Pagos registrados en un rango")
async def list_payments(
    db: DbSession,
    user: CurrentUser,
    dates: DateRangeDep,
    branch_id: uuid.UUID | None = None,
    payment_method: PaymentMethod | None = None,
    offset: Pagination = 0,
    limit: Limit = 50,
) -> Page[PaymentListItem]:
    rows, total = await SaleRepository(db).list_payments(
        date_from=dates.date_from,
        date_to=dates.date_to,
        branch_id=scoped_branch(user, branch_id),
        payment_method=payment_method,
        sale_status=SaleStatus.COMPLETED.value,
        offset=offset,
        limit=limit,
    )
    items = [
        PaymentListItem(
            id=p.id,
            sale_id=s.id,
            receipt_series=s.receipt_series,
            receipt_number=s.receipt_number,
            payment_method=PaymentMethod(p.payment_method),
            amount=p.amount,
            cash_tendered=p.cash_tendered,
            change_given=p.change_given,
            reference_number=p.reference_number,
            created_at=p.created_at,
        )
        for p, s in rows
    ]
    return Page[PaymentListItem](items=items, total=total, offset=offset, limit=limit)


@router.get("/sale/{sale_id}", response_model=list[SalePaymentOut], summary="Pagos de una venta")
async def sale_payments(sale_id: uuid.UUID, db: DbSession, user: CurrentUser) -> list[SalePaymentOut]:
    return await SaleService(db).payments(sale_id, user)

