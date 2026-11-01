"""Configuración centralizada de la aplicación (variables de entorno / .env)."""

from __future__ import annotations

from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de ejecución de LotePOS.

    Todos los valores pueden sobreescribirse vía variables de entorno o un archivo ``.env``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Aplicación ---
    PROJECT_NAME: str = "fan_pos API"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"
    CORS_ORIGINS: list[str] = ["*"]
    TIMEZONE: str = "America/Lima"

    # --- Base de datos ---
    DATABASE_URL: str = "mysql+aiomysql://root:@localhost:3306/fan_pos_db?charset=utf8mb4"
    DB_POOL_SIZE: int = Field(default=10, ge=1)
    DB_MAX_OVERFLOW: int = Field(default=20, ge=0)
    DB_POOL_TIMEOUT: int = Field(default=30, ge=1)
    DB_ECHO: bool = False

    # --- Seguridad ---
    JWT_SECRET_KEY: str = Field(min_length=32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=720, ge=5)

    # --- Reglas de negocio ---
    TAX_RATE: Decimal = Field(default=Decimal("0.18"), ge=0, le=1)
    PRICES_INCLUDE_TAX: bool = True
    ALLOW_SELLING_EXPIRED: bool = False
    DEFAULT_RECEIPT_SERIES: str = Field(default="B001", min_length=1, max_length=10)

    # --- Motor de alertas ---
    ALERTS_EXPIRING_DAYS: int = Field(default=15, ge=1)
    ALERTS_INTERVAL_HOURS: int = Field(default=6, ge=1)
    ALERTS_SCHEDULER_ENABLED: bool = True


@lru_cache
def get_settings() -> Settings:
    """Devuelve una instancia única (cacheada) de configuración."""
    return Settings()  # type: ignore[call-arg]


settings: Settings = get_settings()

