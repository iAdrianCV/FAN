"""Enumeraciones de dominio compartidas por modelos, schemas y servicios."""

from __future__ import annotations

from enum import StrEnum


class PaymentMethod(StrEnum):
    CASH = "CASH"
    YAPE = "YAPE"
    PLIN = "PLIN"
    CARD = "CARD"
    TRANSFER = "TRANSFER"


class SaleStatus(StrEnum):
    COMPLETED = "COMPLETED"
    VOIDED = "VOIDED"


class AlertType(StrEnum):
    EXPIRING_SOON = "EXPIRING_SOON"
    EXPIRED = "EXPIRED"
    LOW_STOCK = "LOW_STOCK"
    #: Registro de auditoría de bajas por merma (se inserta ya resuelto).
    WRITE_OFF = "WRITE_OFF"
    #: Registro de auditoría de anulación de venta (se inserta ya resuelto).
    SALE_VOIDED = "SALE_VOIDED"


#: Tipos que el evaluador periódico crea y auto-resuelve.
EVALUATED_ALERT_TYPES: tuple[AlertType, ...] = (
    AlertType.EXPIRING_SOON,
    AlertType.EXPIRED,
    AlertType.LOW_STOCK,
)


class AlertSeverity(StrEnum):
    HIGH = "HIGH"  # Rojo: vencido con stock
    MEDIUM = "MEDIUM"  # Ámbar: por vencer
    LOW = "LOW"  # Amarillo: stock bajo
    INFO = "INFO"  # Auditoría


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    SUPERVISOR = "SUPERVISOR"
    CASHIER = "CASHIER"
