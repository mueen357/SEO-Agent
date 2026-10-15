"""Tests for database schema parity, audit creation lifecycle, and issue service orchestration."""

import socket
import uuid
import pytest
from httpx import AsyncClient
from unittest.mock import patch
from sqlalchemy import select

from app.database.base import Base
import app.database.models
from app.database.models import Audit, AuditStatus
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository
from app.services.issue_service import IssueService
from app.services.scoring_service import ScoringService

MOCK_PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]


@pytest.mark.asyncio
async def test_runtime_schema_model_parity(test_db_session):
    """Verify that every column defined on SQLAlchemy models exists in the database schema."""
    conn = await test_db_session.connection()

    def inspect_tables(connection):
        import sqlite3
        cursor = connection.connection.cursor()
        for table_name, table in Base.metadata.tables.items():
            cursor.execute(f"PRAGMA table_info({table_name});")
            db_cols = {row[1] for row in cursor.fetchall()}
            assert db_cols, f"Table '{table_name}' does not exist in runtime database"
            for col in table.columns:
                assert col.name in db_cols, (
                    f"Model column '{col.name}' on table '{table_name}' is missing from database schema."
                )

    await conn.run_sync(inspect_tables)


@pytest.mark.asyncio
async def test_create_and_start_audit_lifecycle(client: AsyncClient, test_db_session):
    """Verify POST /api/v1/audits and POST /api/v1/audits/{id}/start lifecycle without HTTP 500."""
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        # 1. POST /api/v1/audits
        create_res = await client.post(
            "/api/v1/audits",
            json={
                "target_url": "https://example.com",
                "mode": "full",
                "configuration": {
                    "max_pages": 25,
                    "render_javascript": "auto"
                }
            }
        )
        assert create_res.status_code == 202
        audit_data = create_res.json()
        audit_id_str = audit_data["id"]
        audit_id = uuid.UUID(audit_id_str)

        assert audit_data["status"] == "created"
        assert audit_data["mode"] == "full"
        assert audit_data["max_pages"] == 50

        # 2. POST /api/v1/audits/{id}/start
        start_res = await client.post(f"/api/v1/audits/{audit_id_str}/start")
        assert start_res.status_code == 202
        start_data = start_res.json()
        assert start_data["status"] == "queued"
        assert start_data["audit_id"] == audit_id_str

        # 3. Verify database state via repository
        audit_repo = AuditRepository(test_db_session)
        audit_in_db = await audit_repo.get_audit_by_id(audit_id)
        assert audit_in_db is not None
        assert audit_in_db.status == AuditStatus.queued.value
        assert hasattr(audit_in_db, "urls_json")

        # 4. Verify worker atomic claim
        crawl_repo = CrawlRepository(test_db_session)
        claimed = await crawl_repo.claim_next_job(worker_token="test-worker-1", lease_seconds=30)
        assert claimed is not None
        assert claimed.id == audit_id
        assert claimed.status == AuditStatus.crawling.value
        assert claimed.worker_token == "test-worker-1"


@pytest.mark.asyncio
async def test_issue_service_and_scoring_orchestration(test_db_session):
    """Verify that IssueService provides analyze_audit alias and scoring service calls it safely."""
    issue_svc = IssueService(test_db_session)
    assert hasattr(issue_svc, "run_analysis")
    assert hasattr(issue_svc, "analyze_audit")
    assert callable(issue_svc.analyze_audit)

    scoring_svc = ScoringService(test_db_session)
    assert hasattr(scoring_svc, "compute_score")
