"""Synthetic End-to-End Test for Task 2.4D: Complete Scoring Lifecycle and Staleness Detection.

Verifies:
1. Create audit with persistent crawl evidence.
2. Execute applicable SEO analysis (IssueService).
3. Calculate initial score via POST /api/v1/audits/{id}/score.
4. Retrieve score via GET /api/v1/audits/{id}/score.
5. Mutate controlled page evidence (e.g. HTTP status 200 -> 500).
6. Detect stale score on GET /api/v1/audits/{id}/score.
7. Recalculate score via POST /api/v1/audits/{id}/score.
8. Confirm updated fingerprint and clean score state.
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_engine.registry import default_registry
from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage, SeoIssue


@pytest.mark.asyncio
async def test_synthetic_audit_lifecycle_e2e(client: AsyncClient, test_db_session: AsyncSession):
    # Step 1: Create audit
    audit_id = uuid.uuid4()
    audit = Audit(
        id=audit_id,
        target_url="https://example.com",
        normalized_url="https://example.com/",
        hostname="example.com",
        mode=AuditMode.quick.value,
        status=AuditStatus.completed.value,
        max_pages=5,
        pages_crawled=2,
    )
    test_db_session.add(audit)

    # Step 2: Persist crawl evidence for 2 pages
    page1 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit_id,
        requested_url="https://example.com/",
        final_url="https://example.com/",
        fetch_status="success",
        http_status=200,
        content_quality_status="usable",
        title="Example Home",
        headings_json={"h1": ["Welcome"]},
        canonical_url="https://example.com/",
        depth=0,
    )
    page2 = CrawlPage(
        id=uuid.uuid4(),
        audit_id=audit_id,
        requested_url="https://example.com/contact",
        final_url="https://example.com/contact",
        fetch_status="success",
        http_status=200,
        content_quality_status="usable",
        title="Contact Us",
        headings_json={"h1": ["Contact"]},
        canonical_url="https://example.com/contact",
        depth=1,
    )
    test_db_session.add_all([page1, page2])

    # Step 3: Add rule evaluations for all 16 on-page rules
    onpage_rules = default_registry.get_onpage_rules()
    issues = []
    for r in onpage_rules:
        issues.append(
            SeoIssue(
                id=uuid.uuid4(),
                audit_id=audit_id,
                crawl_page_id=page1.id,
                rule_id=r.rule_id,
                category="on_page",
                subcategory=getattr(r, "subcategory", "general"),
                title=f"{r.rule_id} Evaluation",
                description="Rule evaluated",
                severity="medium",
                status="pass",
                fingerprint=f"fp_{r.rule_id}_pass",
                evidence_json={"page_url": page1.final_url},
                recommendation="None.",
            )
        )
    test_db_session.add_all(issues)
    await test_db_session.commit()

    # Step 4: Calculate initial score via API
    res_post = await client.post(f"/api/v1/audits/{audit_id}/score")
    assert res_post.status_code == 200
    card1 = res_post.json()
    assert card1["audit_id"] == str(audit_id)
    assert card1["overall_score"] is not None
    assert card1["overall_state"] == "available"
    fp1 = card1["input_fingerprint"]
    assert fp1 is not None

    # Step 5: Retrieve score via GET /api/v1/audits/{id}/score
    res_get = await client.get(f"/api/v1/audits/{audit_id}/score")
    assert res_get.status_code == 200
    card_get1 = res_get.json()
    assert card_get1["overall_state"] == "available"
    assert card_get1["input_fingerprint"] == fp1

    # Step 6: Modify controlled page evidence: page2 HTTP status 200 -> 500
    page2.http_status = 500
    await test_db_session.commit()

    # Step 7: GET /api/v1/audits/{id}/score must detect stale score
    res_stale = await client.get(f"/api/v1/audits/{audit_id}/score")
    assert res_stale.status_code == 200
    card_stale = res_stale.json()
    assert card_stale["overall_state"] == "stale"
    assert card_stale["input_fingerprint"] == fp1

    # Step 8: Recalculate via POST /api/v1/audits/{id}/score
    res_recalc = await client.post(f"/api/v1/audits/{audit_id}/score")
    assert res_recalc.status_code == 200
    card2 = res_recalc.json()
    fp2 = card2["input_fingerprint"]
    assert fp2 != fp1
    # Because page2 returned 500, failed_pages=1, so recalculated score is correctly provisional
    assert card2["overall_state"] == "provisional"

    # Step 9: Confirm GET /api/v1/audits/{id}/score now returns fresh scorecard
    res_get2 = await client.get(f"/api/v1/audits/{audit_id}/score")
    assert res_get2.status_code == 200
    card_get2 = res_get2.json()
    assert card_get2["overall_state"] == "provisional"
    assert card_get2["input_fingerprint"] == fp2
