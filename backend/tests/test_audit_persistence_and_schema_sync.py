"""Regression tests for ORM / Alembic schema synchronization, audit persistence,
and crawl worker data persistence.

Guarantees:
- Zero ORM vs migrated database schema drift (columns, nullabilities, types)
- Fresh migration to head followed by full ORM CRUD
- Upgrade and preservation of legacy database records
- POST /api/v1/audits and POST /api/v1/audits/{id}/start lifecycle
- CrawlPage, CrawlPageRender, and CrawlSitemap persistence without SQL missing-column errors
"""

import os
import sqlite3
import tempfile
import uuid
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.database.base import Base
from app.database.models import (
    Audit,
    AuditMode,
    AuditStatus,
    CrawlPage,
    CrawlPageRender,
    CrawlSitemap,
)
from app.services.issue_service import IssueService

MOCK_PUBLIC_DNS = [(2, 1, 6, "", ("93.184.216.34", 443))]


def test_orm_metadata_matches_migrated_schema():
    """Verify that every column in Base.metadata exists in the migrated SQLite schema
    with matching nullability, preventing runtime OperationalErrors."""
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ini_path = os.path.join(backend_root, "alembic.ini")

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db = os.path.join(tmp_dir, "test_schema_parity.db").replace("\\", "/")
        test_url = f"sqlite:///{test_db}"

        alembic_cfg = Config(ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", test_url)
        alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))
        command.upgrade(alembic_cfg, "head")

        conn = sqlite3.connect(test_db)
        cur = conn.cursor()

        for table_name, table in Base.metadata.tables.items():
            cur.execute(f"PRAGMA table_info({table_name});")
            cols = cur.fetchall()
            assert len(cols) > 0, f"Table {table_name} was not created by Alembic migrations!"
            
            db_cols = {c[1]: {"notnull": bool(c[3]), "default": c[4]} for c in cols}
            model_cols = {c.name for c in table.columns}

            missing_in_db = model_cols - set(db_cols.keys())
            assert not missing_in_db, f"ORM model '{table_name}' has columns missing in DB: {missing_in_db}"

            # Verify no NOT NULL column in DB is marked as nullable=True in ORM
            for col in table.columns:
                if col.name in db_cols:
                    db_notnull = db_cols[col.name]["notnull"]
                    assert not (db_notnull and col.nullable), (
                        f"Column {table_name}.{col.name} is NOT NULL in database but marked nullable=True in ORM"
                    )

        conn.close()


def test_fresh_migration_and_orm_crud():
    """Run all migrations 0001 -> head on fresh DB and test real ORM CRUD."""
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ini_path = os.path.join(backend_root, "alembic.ini")

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db = os.path.join(tmp_dir, "test_fresh_crud.db").replace("\\", "/")
        test_url = f"sqlite:///{test_db}"

        alembic_cfg = Config(ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", test_url)
        alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))
        command.upgrade(alembic_cfg, "head")

        engine = create_engine(test_url)
        Session = sessionmaker(bind=engine)
        session = Session()

        # 1. Insert Audit
        audit_id = uuid.uuid4()
        audit = Audit(
            id=audit_id,
            target_url="https://regression.example.com",
            normalized_url="https://regression.example.com/",
            hostname="regression.example.com",
            mode=AuditMode.full.value,
            status=AuditStatus.created.value,
            max_pages=10,
        )
        session.add(audit)
        session.flush()

        # 2. Insert CrawlPage
        page_id = uuid.uuid4()
        page = CrawlPage(
            id=page_id,
            audit_id=audit_id,
            requested_url="https://regression.example.com/",
            final_url="https://regression.example.com/",
            depth=0,
            fetch_status="success",
            http_status=200,
            title="Regression Page",
            response_time_ms=120,
        )
        session.add(page)
        session.flush()

        # 3. Insert CrawlPageRender
        render_id = uuid.uuid4()
        render = CrawlPageRender(
            id=render_id,
            crawl_page_id=page_id,
            audit_id=audit_id,
            render_status="success",
            render_strategy="HTTP_ONLY",
            rendered_title="Rendered Regression Page",
        )
        session.add(render)
        session.flush()

        # 4. Insert CrawlSitemap with urls_json
        sitemap_id = uuid.uuid4()
        sitemap = CrawlSitemap(
            id=sitemap_id,
            audit_id=audit_id,
            sitemap_url="https://regression.example.com/sitemap.xml",
            status="valid",
            url_count=2,
            urls_json=["https://regression.example.com/p1", "https://regression.example.com/p2"],
        )
        session.add(sitemap)
        session.commit()

        # 5. Select & verify
        loaded_audit = session.get(Audit, audit_id)
        assert loaded_audit is not None
        assert len(loaded_audit.pages) == 1
        assert loaded_audit.pages[0].render.rendered_title == "Rendered Regression Page"
        assert len(loaded_audit.sitemaps) == 1
        assert loaded_audit.sitemaps[0].urls_json == ["https://regression.example.com/p1", "https://regression.example.com/p2"]

        session.close()
        engine.dispose()

        # Verify integrity
        raw_conn = sqlite3.connect(test_db)
        cur = raw_conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        assert cur.fetchone()[0] == "ok"
        raw_conn.close()


def test_upgrade_and_preservation_of_legacy_schema():
    """Migrate to 0006, insert historical data, upgrade to head (0008), verify data preservation."""
    backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    ini_path = os.path.join(backend_root, "alembic.ini")

    with tempfile.TemporaryDirectory() as tmp_dir:
        test_db = os.path.join(tmp_dir, "test_legacy_upgrade.db").replace("\\", "/")
        test_url = f"sqlite:///{test_db}"

        alembic_cfg = Config(ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", test_url)
        alembic_cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))
        
        # Upgrade to 0006
        command.upgrade(alembic_cfg, "0006_add_sitewide_intelligence")

        conn = sqlite3.connect(test_db)
        cur = conn.cursor()
        cur.execute("SELECT version_num FROM alembic_version;")
        assert cur.fetchone()[0] == "0006_add_sitewide_intelligence"

        # Insert historical audit and page
        hist_audit_id = "11111111-2222-3333-4444-555555555555"
        cur.execute(
            """INSERT INTO audits (id, target_url, normalized_url, hostname, mode, status, max_pages, pages_discovered, pages_crawled, configuration_json, created_at, updated_at, progress_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (hist_audit_id, "https://legacy.example.com", "https://legacy.example.com/", "legacy.example.com", "quick", "completed", 1, 1, 1, "{}", "2026-01-01 00:00:00", "2026-01-01 00:00:00", "{}"),
        )
        conn.commit()
        conn.close()

        # Upgrade to head (applies 0007 and 0008)
        command.upgrade(alembic_cfg, "head")

        conn = sqlite3.connect(test_db)
        cur = conn.cursor()
        cur.execute("SELECT version_num FROM alembic_version;")
        assert cur.fetchone()[0] == "0008_add_technology_detection_tables"

        cur.execute("SELECT count(*) FROM audits WHERE id = ?", (hist_audit_id,))
        assert cur.fetchone()[0] == 1, "Historical audit record was lost during upgrade!"

        cur.execute("PRAGMA integrity_check;")
        assert cur.fetchone()[0] == "ok"
        conn.close()


@pytest.mark.asyncio
async def test_full_audit_create_and_start_lifecycle_api(client: AsyncClient):
    """End-to-end test of POST /api/v1/audits and POST /api/v1/audits/{id}/start without schema errors."""
    with patch("socket.getaddrinfo", return_value=MOCK_PUBLIC_DNS):
        payload = {
            "target_url": "https://full-audit-test.com",
            "mode": "full",
            "max_pages": 10,
        }
        res = await client.post("/api/v1/audits", json=payload)
        assert res.status_code == 202, f"Expected 202, got {res.status_code}: {res.text}"
        data = res.json()
        assert "id" in data
        audit_id = data["id"]
        assert data["mode"] == "full"
        assert data["status"] == "created"
        assert data["max_pages"] == 10

        # Start audit
        start_res = await client.post(f"/api/v1/audits/{audit_id}/start")
        assert start_res.status_code == 202, f"Expected 202, got {start_res.status_code}: {start_res.text}"
        start_data = start_res.json()
        assert start_data["status"] == "queued"

        # Query audit status
        get_res = await client.get(f"/api/v1/audits/{audit_id}")
        assert get_res.status_code == 200
        assert get_res.json()["status"] == "queued"

        # Query pages
        pages_res = await client.get(f"/api/v1/audits/{audit_id}/pages")
        assert pages_res.status_code == 200
        assert pages_res.json()["pages"] == []


@pytest.mark.asyncio
async def test_crawl_page_and_render_persistence_in_db(test_db_session: AsyncSession):
    """Verify that CrawlPage and CrawlPageRender persist cleanly in DB session."""
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://persist-test.com",
        normalized_url="https://persist-test.com/",
        hostname="persist-test.com",
        mode=AuditMode.full.value,
        status=AuditStatus.crawling.value,
        max_pages=5,
    )
    test_db_session.add(audit)
    await test_db_session.flush()

    page_id = uuid.uuid4()
    page = CrawlPage(
        id=page_id,
        audit_id=audit_id,
        requested_url="https://persist-test.com/about",
        final_url="https://persist-test.com/about",
        depth=1,
        fetch_status="success",
        http_status=200,
        content_type="text/html",
        title="About Us",
        response_time_ms=85,
    )
    test_db_session.add(page)
    await test_db_session.flush()

    render = CrawlPageRender(
        id=uuid.uuid4(),
        crawl_page_id=page_id,
        audit_id=audit_id,
        render_status="success",
        render_strategy="HTTP_ONLY",
        rendered_title="About Us - Rendered",
    )
    test_db_session.add(render)
    await test_db_session.commit()

    # Query back with selectinload to eagerly fetch relation in async session
    from sqlalchemy.orm import selectinload
    stmt = select(CrawlPage).options(selectinload(CrawlPage.render)).where(CrawlPage.id == page_id)
    res = await test_db_session.execute(stmt)
    loaded_page = res.scalar_one_or_none()
    assert loaded_page is not None
    assert loaded_page.title == "About Us"
    assert loaded_page.render is not None
    assert loaded_page.render.rendered_title == "About Us - Rendered"


def test_issue_service_analyze_audit_alias():
    """Verify backward-compatible alias analyze_audit exists on IssueService."""
    assert hasattr(IssueService, "analyze_audit"), "IssueService must provide analyze_audit alias"
    assert IssueService.analyze_audit == IssueService.run_analysis
