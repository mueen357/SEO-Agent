"""Audit rule engine executing registered rules against crawled pages and site context."""

import logging
from typing import List, Optional

from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.registry import RuleRegistry, default_registry
from app.audit_engine.result import RuleAssessment

logger = logging.getLogger(__name__)


class AuditEngine:
    """Executes deterministic SEO audit rules with per-rule exception isolation."""

    def __init__(self, registry: Optional[RuleRegistry] = None) -> None:
        self.registry = registry or default_registry

    def evaluate_page(
        self,
        ctx: PageAuditContext,
        category: Optional[str] = None,
    ) -> List[RuleAssessment]:
        """Evaluate registered page-level rules for a given page context."""
        assessments: List[RuleAssessment] = []
        if category:
            rules = [r for r in self.registry.get_rules_by_category(category) if not r.is_site_level]
        else:
            rules = [r for r in self.registry.get_all_rules() if not r.is_site_level]

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

    def evaluate_site(
        self,
        ctx: SiteAuditContext,
        category: Optional[str] = None,
    ) -> List[RuleAssessment]:
        """Evaluate registered site-level rules against site context."""
        assessments: List[RuleAssessment] = []
        if category:
            rules = [r for r in self.registry.get_rules_by_category(category) if r.is_site_level]
        else:
            rules = [r for r in self.registry.get_all_rules() if r.is_site_level]

        for rule in rules:
            try:
                assessment = rule.evaluate_site(ctx)
                assessments.append(assessment)
            except Exception as e:
                logger.error(
                    "Site rule %s failed on target %s: %s",
                    rule.rule_id,
                    ctx.target_url,
                    e,
                    exc_info=True,
                )
                assessments.append(
                    RuleAssessment(
                        rule_id=rule.rule_id,
                        category=rule.category,
                        subcategory=rule.subcategory,
                        title=f"{rule.rule_id} evaluation error",
                        description=f"Rule encountered unexpected error: {str(e)}",
                        severity="low",
                        status="unknown",
                        evidence={"audit_target": ctx.target_url, "error": str(e)},
                        recommendation="Review server logs or report issue.",
                        source_type="derived_from_crawl",
                        confidence=0.0,
                        rule_version=rule.rule_version,
                    )
                )

        return assessments
