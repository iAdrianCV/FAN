"""Liquidación de pagos (split payments) y catálogo de medios de pago.

Reglas:
* La suma de ``amount`` debe ser >= total de la venta.
* Solo el efectivo puede exceder el total: el excedente se descuenta del monto aplicado
  en efectivo y se suma al vuelto (``change_given``). Así, la suma de montos registrados
  siempre cuadra exactamente con el total (base del arqueo de caja).
* ``change_given = cash_tendered - amount_aplicado`` para cada pago en efectivo.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from app.core.enums import PaymentMethod
from app.core.errors import BusinessRuleError
from app.core.money import ZERO, q2
from app.schemas.payment import PaymentMethodInfo
from app.schemas.sale import PaymentIn

PAYMENT_METHODS: dict[PaymentMethod, PaymentMethodInfo] = {
    PaymentMethod.CASH: PaymentMethodInfo(
        code=PaymentMethod.CASH, label="Efectivo", requires_reference=False, allows_change=True
    ),
    PaymentMethod.YAPE: PaymentMethodInfo(
        code=PaymentMethod.YAPE, label="Yape", requires_reference=True, allows_change=False
    ),
    PaymentMethod.PLIN: PaymentMethodInfo(
        code=PaymentMethod.PLIN, label="Plin", requires_reference=True, allows_change=False
    ),
    PaymentMethod.CARD: PaymentMethodInfo(
        code=PaymentMethod.CARD, label="Tarjeta / POS", requires_reference=True, allows_change=False
    ),
    PaymentMethod.TRANSFER: PaymentMethodInfo(
        code=PaymentMethod.TRANSFER, label="Transferencia", requires_reference=False, allows_change=False
    ),
}


@dataclass(slots=True)
class SettledPayment:
    payment_method: PaymentMethod
    amount: Decimal
    cash_tendered: Decimal | None
    change_given: Decimal | None
    reference_number: str | None


def settle_payments(total: Decimal, payments: Sequence[PaymentIn]) -> list[SettledPayment]:
    """Valida y normaliza los pagos de una venta. Lanza ``BusinessRuleError`` si no cuadran."""
    total = q2(total)
    if total > ZERO and not payments:
        raise BusinessRuleError("PAYMENT_REQUIRED", "Debe registrar al menos un pago")

    settled: list[SettledPayment] = []
    for p in payments:
        info = PAYMENT_METHODS[p.payment_method]
        if info.requires_reference and not p.reference_number:
            raise BusinessRuleError(
                "PAYMENT_REFERENCE_REQUIRED",
                f"El pago con {info.label} requiere número de operación/voucher",
                extra={"payment_method": p.payment_method.value},
            )
        amount = q2(p.amount)
        is_cash = p.payment_method == PaymentMethod.CASH
        settled.append(
            SettledPayment(
                payment_method=p.payment_method,
                amount=amount,
                cash_tendered=q2(p.cash_tendered if p.cash_tendered is not None else amount) if is_cash else None,
                change_given=None,
                reference_number=p.reference_number,
            )
        )

    paid = sum((s.amount for s in settled), ZERO)
    if paid < total:
        pending = total - paid
        raise BusinessRuleError(
            "PAYMENT_INSUFFICIENT",
            f"Pagos insuficientes: total S/ {total}, pagado S/ {paid}, pendiente S/ {pending}",
            extra={"total": str(total), "paid": str(paid), "pending": str(pending)},
        )

    excess = paid - total
    if excess > ZERO:
        for s in reversed(settled):
            if s.payment_method != PaymentMethod.CASH:
                continue
            absorbed = min(excess, s.amount)
            s.amount -= absorbed
            excess -= absorbed
            if excess == ZERO:
                break
        if excess > ZERO:
            raise BusinessRuleError(
                "OVERPAYMENT_NOT_ALLOWED",
                "Los pagos electrónicos no pueden exceder el total de la venta",
                extra={"excess": str(excess)},
            )

    for s in settled:
        if s.payment_method == PaymentMethod.CASH and s.cash_tendered is not None:
            s.change_given = q2(s.cash_tendered - s.amount)

    # Un pago en efectivo totalmente absorbido no aporta a la venta: se devuelve íntegro.
    return [s for s in settled if s.amount > ZERO]

