"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    app_name: str = "Website Audit Agent API"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False
    api_prefix: str = "/api/v1"

    # Server binding (strictly local development)
    host: str = "127.0.0.1"
    port: int = 8000

    # Database URLs (supports SQLite local dev and future PostgreSQL)
    database_url: str = "sqlite+aiosqlite:///./siteaudit.db"
    sync_database_url: str = "sqlite:///./siteaudit.db"

    # CORS configuration
    cors_allowed_origins: List[str] = [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    cors_allowed_origin_regex: str = r"^chrome-extension://[a-z0-9]+$"

    # Audit & validation limits
    url_max_length: int = 2048
    dns_timeout_seconds: float = 3.0
    default_page_size: int = 20
    max_page_size: int = 100
    default_max_pages_quick: int = 1
    default_max_pages_full: int = 50
    max_allowed_pages: int = 500
    idempotency_ttl_hours: int = 24


@lru_cache
def get_settings() -> Settings:
    return Settings()
