"""Heading structure and hierarchy rules."""

from typing import Any, Dict, List

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule


class H1PresenceRule(BaseRule):
    rule_id = "ONPAGE_H1_PRESENCE"
    category = "on_page"
    subcategory = "headings"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        counts = ctx.headings_json.get("counts", {})
        h1_count = counts.get("h1", 0)

        if h1_count == 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Missing H1 heading",
                description="The page HTML contains no <h1> heading tag. While not a strict Google indexing requirement, a single descriptive H1 provides clear structural context for users and search engines.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "h1_count": 0, "source": ctx.source_type},
                recommendation="Add an <h1> heading to clearly communicate the primary subject of the page to users and search engines.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="H1 heading present",
            description=f"Page has {h1_count} H1 heading(s).",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "h1_count": h1_count, "h1_texts": ctx.headings_json.get("h1", []), "source": ctx.source_type},
            recommendation="Ensure the H1 accurately reflects page content.",
            source_type=ctx.source_type,
            confidence=1.0,
        )


class H1MultipleRule(BaseRule):
    rule_id = "ONPAGE_H1_MULTIPLE"
    category = "on_page"
    subcategory = "headings"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        counts = ctx.headings_json.get("counts", {})
        h1_count = counts.get("h1", 0)

        if h1_count > 1:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Multiple H1 headings detected",
                description=f"Page contains {h1_count} H1 tags. While supported by modern HTML, a single primary H1 simplifies document hierarchy.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "h1_count": h1_count, "h1_texts": ctx.headings_json.get("h1", []), "source": ctx.source_type},
                recommendation="Consider reserving <h1> for the main page title and using <h2> for subsections.",
                source_type=ctx.source_type,
                confidence=0.9,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Single H1 heading structure",
            description=f"Page has {h1_count} H1 heading.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "h1_count": h1_count, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
        )


class H1EmptyRule(BaseRule):
    rule_id = "ONPAGE_H1_EMPTY"
    category = "on_page"
    subcategory = "headings"
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        counts = ctx.headings_json.get("counts", {})
        h1_count = counts.get("h1", 0)

        if h1_count == 0:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Empty H1 check skipped",
                description="No H1 tags found on page.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="Add an H1 heading.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        h1_texts: List[str] = ctx.headings_json.get("h1", [])
        has_content = any(t.strip() for t in h1_texts)

        if not has_content:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Empty H1 heading text",
                description="An <h1> tag is present but contains only whitespace or no text content.",
                severity="medium",
                status="fail",
                evidence={"page_url": ctx.url, "h1_count": h1_count, "source": ctx.source_type},
                recommendation="Provide informative, visible text inside the <h1> tag.",
                source_type=ctx.source_type,
                confidence=1.0,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="H1 has non-empty text",
            description="The H1 heading contains readable text content.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "h1_texts": h1_texts, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
        )


class HeadingHierarchyRule(BaseRule):
    rule_id = "ONPAGE_HEADING_HIERARCHY"
    category = "on_page"
    subcategory = "headings"
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        counts: Dict[str, int] = ctx.headings_json.get("counts", {})
        c = {k: counts.get(k, 0) for k in ("h1", "h2", "h3", "h4", "h5", "h6")}

        jumps = []
        if c["h2"] > 0 and c["h3"] == 0 and (c["h4"] > 0 or c["h5"] > 0 or c["h6"] > 0):
            jumps.append("H2 to H4+ without H3")
        if c["h3"] > 0 and c["h4"] == 0 and (c["h5"] > 0 or c["h6"] > 0):
            jumps.append("H3 to H5+ without H4")

        if jumps:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Heading level hierarchy jump",
                description=f"Page heading structure skips intermediate levels: {', '.join(jumps)}.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "heading_counts": c, "jumps_detected": jumps, "source": ctx.source_type},
                recommendation="Organize headings in a logical sequence (H1 -> H2 -> H3) to maintain clear document outline.",
                source_type=ctx.source_type,
                confidence=0.85,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Logical heading hierarchy",
            description="No structural level jumps detected across heading elements.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "heading_counts": c, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
        )
