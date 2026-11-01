"""Tipos y modelos Pydantic base reutilizables."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer


def _money_json(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01")))


def _qty_json(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.001")))


#: Monto monetario de salida (Decimal internamente, número JSON con 2 decimales).
Money = Annotated[Decimal, PlainSerializer(_money_json, return_type=float, when_used="json")]
#: Cantidad de salida (hasta 3 decimales para productos a granel).
Quantity = Annotated[Decimal, PlainSerializer(_qty_json, return_type=float, when_used="json")]

#: Entradas validadas estrictamente.
MoneyIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
PositiveMoneyIn = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]
PositiveQuantityIn = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]
NonNegativeQuantityIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=3)]

T = TypeVar("T")


class InputModel(BaseModel):
    """Base para payloads de entrada: rechaza campos desconocidos y recorta espacios."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ORMModel(BaseModel):
    """Base para respuestas construidas desde objetos ORM."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    """Respuesta paginada estándar."""

    items: list[T]
    total: int
    offset: int
    limit: int


class ProblemDetail(BaseModel):
    """Esquema RFC 7807 devuelto por todos los errores de la API."""

    type: str
    title: str
    status: int
    status_code: int
    detail: str
    error_code: str
    instance: str
    errors: list[dict[str, Any]] | None = None
    extra: dict[str, Any] | None = None


class MessageResponse(BaseModel):
    message: str


PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ProblemDetail, "description": "Regla de negocio violada"},
    401: {"model": ProblemDetail, "description": "No autenticado"},
    403: {"model": ProblemDetail, "description": "Sin permisos"},
    404: {"model": ProblemDetail, "description": "Recurso no encontrado"},
    409: {"model": ProblemDetail, "description": "Conflicto"},
    422: {"model": ProblemDetail, "description": "Error de validación"},
}

