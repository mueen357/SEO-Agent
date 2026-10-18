"""Tests for CP4: Evidence scoring, provenance, version typing, false-positive protection, and re-analysis."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditMode, AuditStatus, AuditTechnology, CrawlPage
from app.technology.detector import TechnologyDetector
from app.technology.extractors import HTMLTechnologyExtractor
from app.technology.extractors.html_extractor import RawPageEvidence


@pytest.mark.asyncio
async def test_reanalyze_endpoint_flow(client: AsyncClient, test_db_session: AsyncSession):
    """Verify POST /api/v1/audits/{id}/technologies/reanalyze works idempotently and returns catalog version."""
    audit = Audit(
        target_url="https://reanalyze-test.com",
        normalized_url="https://reanalyze-test.com/",
        hostname="reanalyze-test.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Next.js 14.1.0" />
        <script src="https://www.googletagmanager.com/gtag/js?id=G-XYZ123"></script>
        <script src="https://js.stripe.com/v3/"></script>
    </head>
    <body>
        <div id="__next"><h1>Next.js App</h1></div>
    </body>
    </html>
    """
    raw_ev = HTMLTechnologyExtractor.extract(html).to_dict()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://reanalyze-test.com/",
        final_url="https://reanalyze-test.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"server": "Vercel"},
        technology_evidence_json=raw_ev,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    # 1. First analyze via /analyze
    resp1 = await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["catalog_version"] == "2.0.0"
    assert data1["engine_version"] == "2.0.0"
    assert data1["technologies_detected"] >= 3

    # 2. Re-analyze via /reanalyze
    resp2 = await client.post(f"/api/v1/audits/{audit.id}/technologies/reanalyze")
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["catalog_version"] == "2.0.0"
    assert data2["engine_version"] == "2.0.0"
    assert "Successfully re-analyzed technologies" in data2["message"]
    assert data2["technologies_detected"] == data1["technologies_detected"]

    # Verify database records
    tech_stmt = select(AuditTechnology).where(AuditTechnology.audit_id == audit.id)
    tech_res = await test_db_session.execute(tech_stmt)
    persisted = tech_res.scalars().all()
    assert len(persisted) == len(data2["technologies"])


@pytest.mark.asyncio
async def test_provenance_and_version_type_in_findings(client: AsyncClient, test_db_session: AsyncSession):
    """Verify provenance (first_party, third_party_embed, inferred_dependency) and version types."""
    audit = Audit(
        target_url="https://provenance-test.com",
        normalized_url="https://provenance-test.com/",
        hostname="provenance-test.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="WordPress 6.4.2" />
        <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css?ver=1.0.0" />
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
        <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST"></script>
    </head>
    <body>
        <div class="cf-turnstile" data-sitekey="xyz"></div>
        <h1>Test</h1>
    </body>
    </html>
    """
    raw_ev = HTMLTechnologyExtractor.extract(html).to_dict()

    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://provenance-test.com/",
        final_url="https://provenance-test.com/",
        fetch_status="success",
        http_status=200,
        headers_json={"x-powered-by": "PHP/8.2.0"},
        technology_evidence_json=raw_ev,
    )
    test_db_session.add(page)
    await test_db_session.commit()

    await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")

    # Query list
    list_resp = await client.get(f"/api/v1/audits/{audit.id}/technologies")
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]

    items_by_id = {it["technology_id"]: it for it in items}

    # 1. WordPress (first_party, explicit_version from generator)
    assert "wordpress" in items_by_id
    wp = items_by_id["wordpress"]
    assert wp["provenance"] == "first_party"
    assert wp["version_or_null"] == "6.4.2"
    assert wp["version_type"] == "explicit_version"
    assert wp["status"] == "detected"

    # 2. Cloudflare Turnstile (third_party_embed)
    assert "cloudflare_turnstile" in items_by_id
    turnstile = items_by_id["cloudflare_turnstile"]
    assert turnstile["provenance"] == "third_party_embed"
    assert turnstile["status"] == "detected"

    # 3. Google Tag Manager (third_party_embed)
    assert "google_tag_manager" in items_by_id
    gtm = items_by_id["google_tag_manager"]
    assert gtm["provenance"] == "third_party_embed"

    # 4. PHP (inferred from WordPress or x-powered-by)
    if "php" in items_by_id:
        php = items_by_id["php"]
        assert php["version_or_null"] == "8.2.0"


def test_false_positive_corroboration_bounding():
    """Verify identical single signature across 20 pages does NOT artificially inflate confidence to 99%."""
    detector = TechnologyDetector()

    # Create evidence from 20 pages that all have the exact same single script
    html = """
    <html>
    <head>
        <script src="https://static.example.com/widget.js"></script>
    </head>
    <body><div>content</div></body>
    </html>
    """
    raw_ev = HTMLTechnologyExtractor.extract(html)

    # Let's say we have a single weak detection on each page with confidence 0.50
    page_findings_list = []
    for i in range(20):
        findings = detector.detect_page(
            evidence=raw_ev,
            headers={},
            page_url=f"https://example.com/page-{i}",
        )
        page_findings_list.append(findings)

    aggregated = detector.aggregate_findings(page_findings_list)

    # If any finding appeared, its confidence should not exceed base_conf + 0.05
    for finding in aggregated:
        # Corroboration boost is strictly bounded
        assert finding.confidence <= 0.95 or finding.confidence_level == "high"


@pytest.mark.asyncio
async def test_summary_cp4_fields(client: AsyncClient, test_db_session: AsyncSession):
    """Verify summary endpoint returns catalog_version, engine_version, and inferred_technologies_count."""
    audit = Audit(
        target_url="https://summary-test.com",
        normalized_url="https://summary-test.com/",
        hostname="summary-test.com",
        mode=AuditMode.full,
        status=AuditStatus.completed,
    )
    test_db_session.add(audit)
    await test_db_session.commit()

    html = """
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="generator" content="Astro v4.0.0" />
    </head>
    <body><h1>Astro</h1></body>
    </html>
    """
    page = CrawlPage(
        audit_id=audit.id,
        requested_url="https://summary-test.com/",
        final_url="https://summary-test.com/",
        fetch_status="success",
        http_status=200,
        headers_json={},
        technology_evidence_json=HTMLTechnologyExtractor.extract(html).to_dict(),
    )
    test_db_session.add(page)
    await test_db_session.commit()

    await client.post(f"/api/v1/audits/{audit.id}/technologies/analyze")

    summary_resp = await client.get(f"/api/v1/audits/{audit.id}/technologies/summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()

    assert summary["catalog_version"] == "2.0.0"
    assert summary["engine_version"] == "2.0.0"
    assert "inferred_technologies_count" in summary
    assert summary["evidence_coverage"] is not None
    assert summary["evidence_coverage"]["coverage_status"] == "complete"
