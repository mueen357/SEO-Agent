"""Tests for authoritative scoring-family mapping, registry integrity, and category preservation."""

import pytest
from app.audit_engine.registry import RuleRegistry
from app.scoring.engine import ScoringEngine
from app.scoring.rule_mapping import (
    SCORING_FAMILIES,
    get_all_registered_rule_families,
    get_rule_scoring_family,
    validate_rule_families_integrity,
)


def test_rule_families_integrity_51_rules():
    """Verify that all 51 registered rules map uniquely and completely to authoritative families."""
    report = validate_rule_families_integrity()
    assert report["is_valid"] is True
    assert report["total_rules"] == 51
    assert report["on_page_count"] == 16
    assert report["technical_count"] == 22
    assert report["sitewide_count"] == 13
    assert report["unknown_count"] == 0
    assert len(report["duplicated_ids"]) == 0


def test_no_rule_mapped_to_multiple_families():
    """Ensure no rule identity is counted in two families."""
    mapping = get_all_registered_rule_families()
    assert len(mapping) == 51

    families_seen = {"on_page": set(), "technical": set(), "sitewide": set()}
    for rid, info in mapping.items():
        fam = info["scoring_family"]
        assert fam in SCORING_FAMILIES
        assert rid not in families_seen[fam]
        families_seen[fam].add(rid)

    # Disjointness check
    assert families_seen["on_page"].isdisjoint(families_seen["technical"])
    assert families_seen["on_page"].isdisjoint(families_seen["sitewide"])
    assert families_seen["technical"].isdisjoint(families_seen["sitewide"])


def test_display_categories_preserved():
    """Verify that original descriptive categories (images, links, content) are preserved."""
    mapping = get_all_registered_rule_families()

    # Image rules have display category 'images' but scoring family 'on_page'
    assert mapping["ONPAGE_IMAGE_ALT_MISSING"]["display_category"] == "images"
    assert mapping["ONPAGE_IMAGE_ALT_MISSING"]["scoring_family"] == "on_page"
    assert mapping["ONPAGE_IMAGE_ALT_EMPTY"]["display_category"] == "images"
    assert mapping["ONPAGE_IMAGE_ALT_EMPTY"]["scoring_family"] == "on_page"

    # Link rules have display category 'links' but scoring family 'on_page'
    assert mapping["ONPAGE_INTERNAL_OUTLINKS"]["display_category"] == "links"
    assert mapping["ONPAGE_INTERNAL_OUTLINKS"]["scoring_family"] == "on_page"
    assert mapping["ONPAGE_EMPTY_ANCHOR_TEXT"]["display_category"] == "links"
    assert mapping["ONPAGE_EMPTY_ANCHOR_TEXT"]["scoring_family"] == "on_page"

    # Site-wide content rules have display category 'content' but scoring family 'sitewide'
    assert mapping["SITE_CONTENT_DUPLICATE_EXACT"]["display_category"] == "content"
    assert mapping["SITE_CONTENT_DUPLICATE_EXACT"]["scoring_family"] == "sitewide"
    assert mapping["SITE_CONTENT_DUPLICATE_NEAR"]["display_category"] == "content"
    assert mapping["SITE_CONTENT_DUPLICATE_NEAR"]["scoring_family"] == "sitewide"

    # Site-wide link rules have display category 'links' but scoring family 'sitewide'
    assert mapping["SITE_NO_OBSERVED_INTERNAL_INLINKS"]["display_category"] == "links"
    assert mapping["SITE_NO_OBSERVED_INTERNAL_INLINKS"]["scoring_family"] == "sitewide"
    assert mapping["SITE_DEEP_CRAWL_PATH"]["display_category"] == "links"
    assert mapping["SITE_DEEP_CRAWL_PATH"]["scoring_family"] == "sitewide"


def test_image_checks_affect_on_page_score():
    """Ensure ONPAGE_IMAGE_ALT_MISSING (category=images) directly affects on_page score."""
    engine = ScoringEngine()

    # Baseline: all pass on 10 pages for title rule
    base_evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "status": "pass", "severity": "high", "page_url": f"https://example.com/p{i}"}
        for i in range(10)
    ]
    card_clean, _ = engine.evaluate_audit(
        audit_id="test-img-clean",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=base_evals,
    )
    assert card_clean["on_page_score"] == 100.0

    # Add image failure: 10 fail evaluations for ONPAGE_IMAGE_ALT_MISSING (category='images')
    image_fail_evals = list(base_evals) + [
        {"rule_id": "ONPAGE_IMAGE_ALT_MISSING", "category": "images", "status": "fail", "severity": "medium", "page_url": f"https://example.com/p{i}"}
        for i in range(10)
    ]
    card_with_image_fail, _ = engine.evaluate_audit(
        audit_id="test-img-fail",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=image_fail_evals,
    )
    # on_page score MUST be lower due to image rule penalty (not omitted!)
    assert card_with_image_fail["on_page_score"] < 100.0
    assert "ONPAGE_IMAGE_ALT_MISSING" in card_with_image_fail["category_scores_json"]["on_page"]["deductions"][0]["rule_id"]


def test_link_checks_affect_on_page_score():
    """Ensure ONPAGE_INTERNAL_OUTLINKS (category=links) directly affects on_page score."""
    engine = ScoringEngine()

    base_evals = [
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "status": "pass", "severity": "high", "page_url": f"https://example.com/p{i}"}
        for i in range(10)
    ]
    # Add link warning evaluations
    link_warn_evals = list(base_evals) + [
        {"rule_id": "ONPAGE_INTERNAL_OUTLINKS", "category": "links", "status": "warning", "severity": "low", "page_url": f"https://example.com/p{i}"}
        for i in range(10)
    ]
    card, _ = engine.evaluate_audit(
        audit_id="test-link-warn",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=link_warn_evals,
    )
    assert card["on_page_score"] < 100.0
    deduction_rules = [d["rule_id"] for d in card["category_scores_json"]["on_page"]["deductions"]]
    assert "ONPAGE_INTERNAL_OUTLINKS" in deduction_rules


def test_sitewide_content_checks_affect_sitewide_score():
    """Ensure SITE_CONTENT_DUPLICATE_EXACT (category=content) affects sitewide score."""
    engine = ScoringEngine()

    # Passing sitewide check
    site_evals = [
        {"rule_id": "SITE_TITLE_DUPLICATE", "category": "on_page", "status": "pass", "severity": "medium", "evidence": {"page_count": 0}}
    ]
    card_pass, _ = engine.evaluate_audit(
        audit_id="test-site-pass",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=site_evals,
    )
    assert card_pass["sitewide_score"] == 100.0

    # Add duplicate exact content failure
    site_evals_fail = list(site_evals) + [
        {
            "rule_id": "SITE_CONTENT_DUPLICATE_EXACT",
            "category": "content",
            "status": "fail",
            "severity": "high",
            "evidence": {"page_count": 6, "affected_urls": [f"https://example.com/p{i}" for i in range(6)]},
        }
    ]
    card_fail, _ = engine.evaluate_audit(
        audit_id="test-site-fail",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=site_evals_fail,
    )
    assert card_fail["sitewide_score"] < 100.0
    deduction_rules = [d["rule_id"] for d in card_fail["category_scores_json"]["sitewide"]["deductions"]]
    assert "SITE_CONTENT_DUPLICATE_EXACT" in deduction_rules


def test_sitewide_internal_link_findings_affect_sitewide_score():
    """Ensure SITE_NO_OBSERVED_INTERNAL_INLINKS (category=links) affects sitewide score."""
    engine = ScoringEngine()

    evals = [
        {"rule_id": "SITE_TITLE_DUPLICATE", "category": "on_page", "status": "pass", "severity": "medium", "evidence": {"page_count": 0}},
        {
            "rule_id": "SITE_NO_OBSERVED_INTERNAL_INLINKS",
            "category": "links",
            "status": "warning",
            "severity": "medium",
            "evidence": {"page_count": 5, "affected_urls": [f"https://example.com/p{i}" for i in range(5)]},
        },
    ]
    card, _ = engine.evaluate_audit(
        audit_id="test-site-links",
        total_pages=10,
        evaluated_pages=10,
        failed_pages=0,
        evaluations=evals,
    )
    assert card["sitewide_score"] < 100.0
    deductions = [d["rule_id"] for d in card["category_scores_json"]["sitewide"]["deductions"]]
    assert "SITE_NO_OBSERVED_INTERNAL_INLINKS" in deductions


def test_technical_checks_remain_in_technical_family():
    """Verify that technical rules feed the technical category as expected."""
    engine = ScoringEngine()

    evals = [
        {"rule_id": "TECH_HTTPS_USAGE", "category": "technical", "status": "pass", "severity": "critical", "page_url": "https://example.com/"},
        {"rule_id": "TECH_HTTP_4XX", "category": "technical", "status": "fail", "severity": "high", "page_url": "https://example.com/bad"},
    ]
    card, _ = engine.evaluate_audit(
        audit_id="test-tech",
        total_pages=2,
        evaluated_pages=2,
        failed_pages=0,
        evaluations=evals,
    )
    assert card["technical_score"] is not None
    assert card["technical_score"] < 100.0
    assert "TECH_HTTP_4XX" in [d["rule_id"] for d in card["category_scores_json"]["technical"]["deductions"]]


def test_unknown_rule_ids_flagged_not_silently_dropped():
    """Ensure unrecognized rule IDs are tracked in explainability / coverage and not silently discarded."""
    engine = ScoringEngine()

    evals = [
        {"rule_id": "CUSTOM_MYSTERY_RULE_999", "category": "custom", "status": "fail", "severity": "critical", "page_url": "https://example.com/"},
        {"rule_id": "ONPAGE_TITLE_PRESENT", "category": "on_page", "status": "pass", "severity": "high", "page_url": "https://example.com/"},
    ]
    card, _ = engine.evaluate_audit(
        audit_id="test-unrecognized",
        total_pages=1,
        evaluated_pages=1,
        failed_pages=0,
        evaluations=evals,
    )
    assert "unrecognized_rules" in card["coverage_json"]["details"]
    assert "CUSTOM_MYSTERY_RULE_999" in card["coverage_json"]["details"]["unrecognized_rules"]
    assert "unrecognized_rules" in card["explanation_json"]
    assert "CUSTOM_MYSTERY_RULE_999" in card["explanation_json"]["unrecognized_rules"]
