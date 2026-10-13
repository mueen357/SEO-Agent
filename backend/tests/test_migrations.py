"""Tests for reversible Alembic database migrations."""

import os
import tempfile
import pytest
from alembic import command
from alembic.config import Config


def test_reversible_alembic_migrations():
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ini_path = os.path.join(backend_root, "alembic.ini")

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db = os.path.join(tmp_dir, "test_migration.db").replace("\\", "/")
        test_url = f"sqlite:///{test_db}"

        alembic_cfg = Config(ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", test_url)
        alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))

        # 1. Upgrade to head
        command.upgrade(alembic_cfg, "head")

        # 2. Downgrade to base
        command.downgrade(alembic_cfg, "base")

        # 3. Upgrade to head again
        command.upgrade(alembic_cfg, "head")
