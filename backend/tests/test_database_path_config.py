"""Tests for database path stabilization, CWD-independence, and URL normalization."""

import os
import tempfile
from pathlib import Path
import pytest
from app.config import Settings, BACKEND_DIR


def test_default_database_path_is_anchored_to_backend_dir():
    """Verify that default settings resolve to backend/siteaudit.db regardless of process CWD."""
    original_cwd = os.getcwd()
    with tempfile.TemporaryDirectory() as tmp_dir:
        try:
            os.chdir(tmp_dir)
            settings = Settings()
            canonical_db = (BACKEND_DIR / "siteaudit.db").as_posix()
            assert f"sqlite+aiosqlite:///{canonical_db}" == settings.database_url
            assert f"sqlite:///{canonical_db}" == settings.sync_database_url
        finally:
            os.chdir(original_cwd)


def test_relative_sqlite_url_normalization():
    """Verify relative ./siteaudit.db or bare siteaudit.db are normalized to BACKEND_DIR."""
    settings = Settings(database_url="sqlite+aiosqlite:///./siteaudit.db")
    canonical_db = (BACKEND_DIR / "siteaudit.db").as_posix()
    assert settings.database_url == f"sqlite+aiosqlite:///{canonical_db}"

    # Bare relative path without ./
    bare_settings = Settings(database_url="sqlite+aiosqlite:///siteaudit.db")
    assert bare_settings.database_url == f"sqlite+aiosqlite:///{canonical_db}"

    # Sync URL with relative path
    sync_settings = Settings(sync_database_url="sqlite:///siteaudit.db")
    assert sync_settings.sync_database_url == f"sqlite:///{canonical_db}"


def test_absolute_and_external_database_urls_preserved():
    """Verify absolute SQLite paths and non-SQLite URLs (e.g. PostgreSQL) are untouched."""
    abs_sqlite = "sqlite+aiosqlite:///C:/custom/path/db.sqlite3"
    settings = Settings(database_url=abs_sqlite)
    assert settings.database_url == abs_sqlite

    pg_url = "postgresql+asyncpg://user:pass@localhost:5432/dbname"
    settings_pg = Settings(database_url=pg_url)
    assert settings_pg.database_url == pg_url
