"""Audit rule engine executing registered rules against crawled pages."""

import logging
from typing import List, Optional

from app.audit_engine.context import PageAuditContext
from app.audit_engine.registry import RuleRegistry, default_registry
from app.audit_engine.result import RuleAssessment

logger = logging.getLogger(__name__)


class AuditEngine:
    """Executes deterministic SEO audit rules with per-rule exception isolation."""

    def __init__(self, registry: Optional[RuleRegistry] = None) -> None:
        self.registry = registry or default_registry

    def evaluate_page(self, ctx: PageAuditContext) -> List[RuleAssessment]:
        """Evaluate all registered rules for a given page context."""
        assessments: List[RuleAssessment] = []
        rules = self.registry.get_all_rules()

        for rule in rules:
            try:
                assessment = rule.evaluate(ctx)
                assessments.append(assessment)
            except Exception as e:
                logger.error(
                    "Rule %s failed on page %s: %s",
                    rule.rule_id,
                    ctx.url,
                    e,
                    exc_info=True,
                )
                # Per-rule error isolation: record unknown status without crashing audit
                assessments.append(
                    RuleAssessment(
                        rule_id=rule.rule_id,
                        category=rule.category,
                        subcategory=rule.subcategory,
                        title=f"{rule.rule_id} evaluation error",
                        description=f"Rule encountered unexpected error: {str(e)}",
                        severity="low",
                        status="unknown",
                        evidence={"page_url": ctx.url, "error": str(e)},
                        recommendation="Review server logs or report issue.",
                        source_type=ctx.source_type,
                        confidence=0.0,
                        rule_version=rule.rule_version,
                    )
                )

        return assessments
