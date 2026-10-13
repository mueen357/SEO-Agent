"""Link structure and anchor text audit rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule


class InternalOutlinksRule(BaseRule):
    rule_id = "ONPAGE_INTERNAL_OUTLINKS"
    category = "links"
    subcategory = "links"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        internal_count = ctx.page.internal_link_count

        if internal_count == 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No outgoing internal links (dead end)",
                description="The page contains no outgoing links to other pages on the same website.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "internal_link_count": 0, "external_link_count": ctx.page.external_link_count, "source": ctx.source_type},
                recommendation="Add contextual internal links to guide users and search bots to related topics and parent categories.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Page has outgoing internal links",
            description=f"Page provides {internal_count} outgoing internal link(s) to site resources.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "internal_link_count": internal_count, "source": ctx.source_type},
            recommendation="Maintain natural internal link architecture.",
            source_type=ctx.source_type,
            confidence=1.0,
        )


class EmptyAnchorTextRule(BaseRule):
    rule_id = "ONPAGE_EMPTY_ANCHOR_TEXT"
    category = "links"
    subcategory = "links"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        links = ctx.links
        if not links:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Anchor text evaluation skipped",
                description="No link records available to inspect anchor text.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        empty_anchors = [l for l in links if not l.link_text.strip()]
        empty_count = len(empty_anchors)

        if empty_count > 0:
            sample = [l.destination_url for l in empty_anchors[:5]]
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Links with empty anchor text",
                description=f"{empty_count} link(s) on the page have empty or whitespace-only anchor text.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "empty_anchor_count": empty_count, "total_links_checked": len(links), "sample_destinations": sample, "source": ctx.source_type},
                recommendation="Provide descriptive anchor text or aria-label attributes so users and search engines understand link destinations.",
                source_type=ctx.source_type,
                confidence=0.9,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="All checked links have anchor text",
            description=f"All {len(links)} discovered link(s) have non-empty anchor text.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "total_links_checked": len(links), "empty_anchor_count": 0, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
        )
