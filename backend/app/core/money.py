"""Aritmética monetaria y de cantidades con ``Decimal`` (nunca float)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
MILLI = Decimal("0.001")
ZERO = Decimal("0")


def q2(value: Decimal) -> Decimal:
    """Redondea a 2 decimales (céntimos) con HALF_UP."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def q3(value: Decimal) -> Decimal:
    """Redondea cantidades a 3 decimales (soporta productos a granel)."""
    return value.quantize(MILLI, rounding=ROUND_HALF_UP)


def fmt_qty(value: Decimal) -> str:
    """Representación legible de una cantidad (``12.500`` -> ``12.5``, ``3.000`` -> ``3``)."""
    normalized = value.normalize()
    return f"{normalized:f}"
