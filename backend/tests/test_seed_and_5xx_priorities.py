"""Regression tests for Task 2.4D: Seed/Homepage Identification and HTTP 5xx Priority Corrections.

Verifies:
- Authoritative seed and homepage identity resolution (no slash-counting heuristics)
- Deep URLs (/contact) not treated as root homepage
- Deep seed correctly identified as seed but not domain homepage
- Verified redirected seed URL tracking
- Confirmed HTTP 5xx requires real 500-599 evidence
- Missing HTTP evidence not treated as confirmed 500 (demoted to P2)
- HTTP 200 mislabeled as 500 demoted to P2
- Isolated deep page 500 (/contact, /products/item) demoted to P1
- Homepage 500, Seed 500, and Redirected Seed 500 are P0
- 3+ affected confirmed 5xx pages are P0 (widespread scope)
- Deterministic priority ranking
"""

import pytest
from app.scoring.priorities import (
    classify_priority_tier,
    compute_priority_items,
    normalize_priority_url,
    resolve_page_importance,
)


# =========================================================================
# 1. SEED & HOMEPAGE IDENTIFICATION TESTS
# =========================================================================

def test_root_homepage_identification():
    """Root homepage is identified by path '/' and empty query, not slash count."""
    imp1 = resolve_page_importance("https://example.com/")
    assert imp1["is_root_homepage"] is True
    assert imp1["is_entrance_page"] is True

    imp2 = resolve_page_importance("https://example.com")
    assert imp2["is_root_homepage"] is True
    assert imp2["is_entrance_page"] is True


def test_deep_contact_page_is_never_homepage():
    """https://example.com/contact must NOT be classified as homepage despite low slash count."""
    imp = resolve_page_importance("https://example.com/contact", seed_url="https://example.com/")
    assert imp["is_root_homepage"] is False
    assert imp["is_seed_page"] is False
    assert imp["is_entrance_page"] is False
    assert imp["importance_label"] == "internal_deep_page"


def test_deep_seed_url_identified_as_seed_not_domain_homepage():
    """If seed is a deep URL (/contact), identify it as seed, not domain homepage."""
    imp = resolve_page_importance("https://example.com/contact", seed_url="https://example.com/contact")
    assert imp["is_root_homepage"] is False
    assert imp["is_seed_page"] is True
    assert imp["is_entrance_page"] is True
    assert imp["importance_label"] == "deep_seed_page"


def test_redirected_seed_url_identification():
    """Account for verified redirect targets as seed pages."""
    imp = resolve_page_importance(
        "https://example.com/landing",
        seed_url="http://example.com",
        seed_final_url="https://example.com/landing",
    )
    assert imp["is_seed_page"] is True
    assert imp["is_entrance_page"] is True


def test_invalid_url_and_unknown_importance():
    """Invalid URLs return invalid status and unknown importance without inventing homepage evidence."""
    imp_invalid = resolve_page_importance("://invalid-url")
    assert imp_invalid["is_valid"] is False
    assert imp_invalid["is_root_homepage"] is False
    assert imp_invalid["is_entrance_page"] is False

    imp_unknown = resolve_page_importance("https://example.com/deep/page")
    assert imp_unknown["is_root_homepage"] is False
    assert imp_unknown["is_seed_page"] is False
    assert imp_unknown["importance_label"] == "unknown"


# =========================================================================
# 2. HTTP 5XX PRIORITY TESTS
# =========================================================================

def test_homepage_500_is_p0():
    """Confirmed HTTP 500 on root homepage is P0."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"http_status": 500, "page_url": "https://example.com/"},
        is_root_homepage=True,
    )
    assert tier == "P0"


def test_isolated_deep_contact_500_is_p1():
    """Isolated HTTP 500 on deep /contact page must NOT automatically become P0 (demoted to P1)."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"http_status": 500, "page_url": "https://example.com/contact"},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P1"


def test_products_item_500_is_p1():
    """Isolated HTTP 500 on /products/item is P1."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="high",
        affected_pages=1,
        total_pages=20,
        evidence={"http_status": 500, "page_url": "https://example.com/products/item"},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P1"


def test_seed_url_returning_500_is_p0():
    """Initial crawl seed URL returning 500 is P0 blocker."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"http_status": 500, "page_url": "https://example.com/contact"},
        is_seed_page=True,
    )
    assert tier == "P0"


def test_redirected_seed_returning_500_is_p0():
    """Redirected final seed URL returning 500 is P0 blocker."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"http_status": 503, "page_url": "https://example.com/landing"},
        is_seed_page=True,
    )
    assert tier == "P0"


def test_three_affected_pages_500_is_p0():
    """Substantial scope (>= 3 affected pages) with confirmed 500 escalates to P0."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=3,
        total_pages=10,
        evidence={"http_status": 500},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P0"


def test_missing_http_status_evidence_demoted_to_p2():
    """Missing HTTP status evidence must NOT be treated as confirmed 500 error."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={},  # No http_status
        is_root_homepage=True,
    )
    assert tier == "P2"


def test_http_200_mislabeled_as_500_demoted_to_p2():
    """HTTP 200 incorrectly labeled as 500 must NOT become P0 or P1."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"http_status": 200},
        is_root_homepage=True,
    )
    assert tier == "P2"


def test_canonical_conflicts_not_automatically_emergency():
    """Isolated deep canonical conflicts without critical severity are not P0 emergencies."""
    tier_deep = classify_priority_tier(
        rule_id="TECH_CANONICAL_CONFLICT",
        severity="high",
        affected_pages=1,
        total_pages=10,
        evidence={"page_url": "https://example.com/deep/page"},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier_deep == "P1"

    tier_home = classify_priority_tier(
        rule_id="TECH_CANONICAL_CONFLICT",
        severity="critical",
        affected_pages=1,
        total_pages=10,
        evidence={"page_url": "https://example.com/"},
        is_root_homepage=True,
    )
    assert tier_home == "P0"


def test_compute_priority_items_deterministic_ranking():
    """compute_priority_items ranks P0 above P1 and preserves deterministic ordering."""
    grouped = [
        {
            "rule_id": "TECH_HTTP_5XX",
            "title": "Deep Page 500 Error",
            "severity": "critical",
            "affected_page_count": 1,
            "affected_urls_json": ["https://example.com/contact"],
            "evidence_json": {"samples": [{"http_status": 500, "page_url": "https://example.com/contact"}]},
            "group_fingerprint": "fp_deep_500",
        },
        {
            "rule_id": "TECH_HTTP_5XX",
            "title": "Homepage 500 Error",
            "severity": "critical",
            "affected_page_count": 1,
            "affected_urls_json": ["https://example.com/"],
            "evidence_json": {"samples": [{"http_status": 500, "page_url": "https://example.com/"}]},
            "group_fingerprint": "fp_home_500",
        },
        {
            "rule_id": "ONPAGE_TITLE_PRESENT",
            "title": "Missing Title",
            "severity": "high",
            "affected_page_count": 2,
            "affected_urls_json": ["https://example.com/page1", "https://example.com/page2"],
            "evidence_json": {},
            "group_fingerprint": "fp_title",
        },
    ]

    items = compute_priority_items(grouped, total_pages=10, seed_url="https://example.com/")

    # Homepage 500 must be P0 and rank 1
    assert items[0]["title"] == "Homepage 500 Error"
    assert items[0]["priority_tier"] == "P0"
    assert items[0]["priority_rank"] == 1

    # Deep page 500 must be P1
    deep_item = next(it for it in items if it["title"] == "Deep Page 500 Error")
    assert deep_item["priority_tier"] == "P1"

    # Missing Title is also P1
    title_item = next(it for it in items if it["title"] == "Missing Title")
    assert title_item["priority_tier"] == "P1"


# =========================================================================
# REGRESSION SUITE: ISOLATED 500 SCOPE HOTFIX
# =========================================================================

def test_one_deep_500_out_of_two_pages_is_p1():
    """One isolated deep 500 out of two pages (50% scope) must NOT receive P0 based on percentage alone."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=2,
        evidence={"http_status": 500, "page_url": "https://example.com/deep/page"},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P1"


def test_one_deep_500_out_of_five_pages_is_p1():
    """One isolated deep 500 out of five pages (20% scope) must NOT receive P0 based on percentage alone."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=5,
        evidence={"http_status": 500, "page_url": "https://example.com/deep/page"},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P1"


def test_confirmed_homepage_500_is_p0():
    """Confirmed HTTP 500 on homepage is P0 even if only 1 page is affected."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=2,
        evidence={"http_status": 500, "page_url": "https://example.com/"},
        is_root_homepage=True,
        is_seed_page=False,
    )
    assert tier == "P0"


def test_confirmed_seed_500_is_p0():
    """Confirmed HTTP 500 on seed URL is P0 even if seed is a deep URL."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=1,
        total_pages=2,
        evidence={"http_status": 500, "page_url": "https://example.com/contact"},
        is_root_homepage=False,
        is_seed_page=True,
    )
    assert tier == "P0"


def test_widespread_confirmed_5xx_is_p0():
    """Widespread confirmed 5xx (>= 3 pages) escalates to P0."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="high",
        affected_pages=3,
        total_pages=100,
        evidence={"http_status": 502},
        is_root_homepage=False,
        is_seed_page=False,
    )
    assert tier == "P0"


def test_missing_http_evidence_not_p0_p1():
    """Missing HTTP status evidence is strictly excluded from P0 and P1."""
    tier = classify_priority_tier(
        rule_id="TECH_HTTP_5XX",
        severity="critical",
        affected_pages=5,
        total_pages=5,
        evidence={},
        is_root_homepage=True,
        is_seed_page=True,
    )
    assert tier not in ("P0", "P1")
    assert tier == "P2"

