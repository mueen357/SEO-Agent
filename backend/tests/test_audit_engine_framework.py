"""Tests for rule engine framework, registry, isolation, and fingerprinting."""

import uuid
from typing import Optional
import pytest

from app.audit_engine import AuditEngine, BaseRule, PageAuditContext, RuleAssessment, RuleRegistry
from app.database.models import CrawlPage


class MockFailingRule(BaseRule):
    rule_id = "MOCK_FAILING_RULE"
    category = "test"
    subcategory = "mock"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        raise ValueError("Simulated rule failure in test")


class MockPassingRule(BaseRule):
    rule_id = "MOCK_PASSING_RULE"
    category = "test"
    subcategory = "mock"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Mock Passing Title",
            description="Mock Passing Description",
            severity="info",
            status="pass",
            evidence={"ok": True},
            recommendation="No action needed.",
        )


def test_registry_registration_and_discovery():
    reg = RuleRegistry()
    rules = reg.get_all_rules()
    assert len(rules) >= 16

    rule_ids = [r.rule_id for r in rules]
    assert "ONPAGE_TITLE_PRESENT" in rule_ids
    assert "ONPAGE_TITLE_LENGTH" in rule_ids
    assert "ONPAGE_META_DESC_PRESENT" in rule_ids
    assert "ONPAGE_H1_PRESENCE" in rule_ids
    assert "ONPAGE_CANONICAL_PRESENCE" in rule_ids
    assert "ONPAGE_IMAGE_ALT_MISSING" in rule_ids
    assert "ONPAGE_INTERNAL_OUTLINKS" in rule_ids
    assert "ONPAGE_HTML_LANG" in rule_ids


def test_per_rule_exception_isolation():
    reg = RuleRegistry()
    # Create empty registry and add passing + failing rules
    custom_reg = RuleRegistry()
    custom_reg._rules.clear()
    custom_reg.register(MockPassingRule())
    custom_reg.register(MockFailingRule())

    engine = AuditEngine(registry=custom_reg)
    page = CrawlPage(
        requested_url="https://example.com",
        final_url="https://example.com",
        fetch_status="success",
        http_status=200,
    )
    ctx = PageAuditContext(page=page)

    assessments = engine.evaluate_page(ctx)
    assert len(assessments) == 2

    passing = next(a for a in assessments if a.rule_id == "MOCK_PASSING_RULE")
    assert passing.status == "pass"

    failing = next(a for a in assessments if a.rule_id == "MOCK_FAILING_RULE")
    assert failing.status == "unknown"
    assert "Simulated rule failure" in failing.evidence["error"]


def test_rule_fingerprint_deterministic_and_unique():
    a = RuleAssessment(
        rule_id="TEST_RULE",
        category="on_page",
        subcategory="test",
        title="Test",
        description="Test",
        severity="high",
        status="fail",
    )
    audit_id = uuid.uuid4()
    page_1 = uuid.uuid4()
    page_2 = uuid.uuid4()

    fp1 = a.compute_fingerprint(audit_id, page_1)
    fp1_again = a.compute_fingerprint(audit_id, page_1)
    fp2 = a.compute_fingerprint(audit_id, page_2)

    assert fp1 == fp1_again, "Fingerprint must be deterministic across identical runs"
    assert fp1 != fp2, "Fingerprint must vary across distinct crawl pages"
