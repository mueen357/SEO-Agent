"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from pathlib import Path
from typing import List
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Canonical backend directory path for centralized SQLite resolution
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE_PATH = BACKEND_DIR / "siteaudit.db"
DEFAULT_ASYNC_SQLITE_URL = f"sqlite+aiosqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"
DEFAULT_SYNC_SQLITE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


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
    database_url: str = Field(default=DEFAULT_ASYNC_SQLITE_URL)
    sync_database_url: str = Field(default=DEFAULT_SYNC_SQLITE_URL)

    @model_validator(mode="after")
    def resolve_database_urls(self) -> "Settings":
        """Ensure relative SQLite paths are anchored to BACKEND_DIR regardless of process working directory."""
        for attr in ["database_url", "sync_database_url"]:
            val = getattr(self, attr)
            if isinstance(val, str) and "///./" in val:
                prefix, rel_part = val.split("///./", 1)
                abs_path = (BACKEND_DIR / rel_part).resolve().as_posix()
                setattr(self, attr, f"{prefix}///{abs_path}")
        return self

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
    # Rendering & Browser settings (Phase 1.4B)
    render_javascript_mode: str = "auto"
    allow_public_rendering: bool = False
    render_navigation_timeout_seconds: float = 20.0
    render_total_timeout_seconds: float = 25.0
    render_hydration_wait_seconds: float = 1.5
    render_max_dom_size_bytes: int = 5 * 1024 * 1024
    render_max_concurrent_contexts: int = 2
    enable_screenshots: bool = False
    screenshot_storage_dir: str = "./storage/screenshots"


@lru_cache
def get_settings() -> Settings:
    return Settings()
