"""Errores de dominio y manejadores HTTP con formato RFC 7807 (application/problem+json).

Todas las respuestas de error comparten la forma::

    {
      "type": "https://lotepos.app/problems/insufficient-stock",
      "title": "Bad Request",
      "status": 400,
      "status_code": 400,
      "detail": "Stock insuficiente para 'Leche Gloria 1L'...",
      "error_code": "INSUFFICIENT_STOCK",
      "instance": "/api/v1/sales/checkout",
      "errors": [...],      # opcional (validación)
      "extra": {...}        # opcional (contexto de negocio)
    }
"""

from __future__ import annotations

import logging
from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("fan_pos.errors")

PROBLEM_MEDIA_TYPE = "application/problem+json"
PROBLEM_BASE_URI = "https://fanpos.app/problems/"

_HTTP_DEFAULT_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


class AppException(Exception):
    """Excepción de negocio que se traduce a una respuesta RFC 7807."""

    def __init__(
        self,
        status_code: int,
        error_code: str,
        detail: str,
        *,
        title: str | None = None,
        extra: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.error_code = error_code
        self.detail = detail
        self.title = title
        self.extra = extra
        self.headers = headers


class NotFoundError(AppException):
    def __init__(self, error_code: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(404, error_code, detail, extra=extra)


class BusinessRuleError(AppException):
    def __init__(self, error_code: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(400, error_code, detail, extra=extra)


class ConflictError(AppException):
    def __init__(self, error_code: str, detail: str, extra: dict[str, Any] | None = None) -> None:
        super().__init__(409, error_code, detail, extra=extra)


class UnauthorizedError(AppException):
    def __init__(self, detail: str = "Credenciales inválidas o token expirado") -> None:
        super().__init__(401, "UNAUTHORIZED", detail, headers={"WWW-Authenticate": "Bearer"})


class ForbiddenError(AppException):
    def __init__(self, detail: str = "No tiene permisos para realizar esta acción") -> None:
        super().__init__(403, "FORBIDDEN", detail)


def problem_response(
    request: Request,
    *,
    status_code: int,
    error_code: str,
    detail: str,
    title: str | None = None,
    errors: list[Any] | None = None,
    extra: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """Construye la respuesta ``application/problem+json``."""
    try:
        default_title = HTTPStatus(status_code).phrase
    except ValueError:
        default_title = "Error"
    body: dict[str, Any] = {
        "type": PROBLEM_BASE_URI + error_code.lower().replace("_", "-"),
        "title": title or default_title,
        "status": status_code,
        "status_code": status_code,
        "detail": detail,
        "error_code": error_code,
        "instance": request.url.path,
    }
    if errors is not None:
        body["errors"] = errors
    if extra:
        body["extra"] = extra
    return JSONResponse(
        content=jsonable_encoder(body),
        status_code=status_code,
        media_type=PROBLEM_MEDIA_TYPE,
        headers=headers,
    )


async def _app_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppException)
    return problem_response(
        request,
        status_code=exc.status_code,
        error_code=exc.error_code,
        detail=exc.detail,
        title=exc.title,
        extra=exc.extra,
        headers=exc.headers,
    )


async def _http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    detail = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
    return problem_response(
        request,
        status_code=exc.status_code,
        error_code=_HTTP_DEFAULT_CODES.get(exc.status_code, "HTTP_ERROR"),
        detail=detail,
        headers=getattr(exc, "headers", None),
    )


async def _validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    errors = [
        {
            "loc": list(err.get("loc", ())),
            "msg": err.get("msg", ""),
            "type": err.get("type", ""),
        }
        for err in exc.errors()
    ]
    first = errors[0] if errors else None
    detail = (
        f"Datos inválidos en '{'.'.join(str(p) for p in first['loc'])}': {first['msg']}"
        if first
        else "Datos de entrada inválidos"
    )
    return problem_response(
        request, status_code=422, error_code="VALIDATION_ERROR", detail=detail, errors=errors
    )


async def _integrity_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.warning("IntegrityError en %s: %s", request.url.path, exc)
    return problem_response(
        request,
        status_code=409,
        error_code="INTEGRITY_CONFLICT",
        detail="La operación viola una restricción de integridad (registro duplicado o referencia inválida).",
    )


async def _dbapi_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error de base de datos en %s", request.url.path, exc_info=exc)
    return problem_response(
        request,
        status_code=503,
        error_code="DATABASE_ERROR",
        detail="Error temporal de base de datos. Intente nuevamente.",
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no controlado en %s", request.url.path, exc_info=exc)
    return problem_response(
        request,
        status_code=500,
        error_code="INTERNAL_ERROR",
        detail="Error interno del servidor.",
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Registra todos los manejadores de error en la app."""
    app.add_exception_handler(AppException, _app_exception_handler)
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(IntegrityError, _integrity_error_handler)
    app.add_exception_handler(DBAPIError, _dbapi_error_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)

