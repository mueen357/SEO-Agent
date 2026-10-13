"""Meta description audit rules grounded in Google Search Central documentation."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_SNIPPET_DOCS = "https://developers.google.com/search/docs/appearance/snippet"


class MetaDescriptionPresentRule(BaseRule):
    rule_id = "ONPAGE_META_DESC_PRESENT"
    category = "on_page"
    subcategory = "meta_description"
    documentation_url = GOOGLE_SNIPPET_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        desc = ctx.effective_meta_description

        if desc is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Missing meta description",
                description="The page HTML contains no meta[name='description'] tag in the <head>.",
                severity="medium",
                status="fail",
                evidence={"page_url": ctx.url, "meta_description": None, "source": ctx.source_type},
                recommendation="Add a unique, informative meta description summarizing the page content.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if not desc.strip():
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Empty meta description",
                description="The meta description tag is present but its content attribute is empty.",
                severity="medium",
                status="fail",
                evidence={"page_url": ctx.url, "meta_description": desc, "source": ctx.source_type},
                recommendation="Provide an informative summary of page content in the meta description.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Meta description present",
            description=f"A non-empty meta description is present ({len(desc)} characters).",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "meta_description": desc, "character_count": len(desc), "source": ctx.source_type},
            recommendation="Maintain unique, descriptive meta descriptions across site pages.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class MetaDescriptionLengthRule(BaseRule):
    rule_id = "ONPAGE_META_DESC_LENGTH"
    category = "on_page"
    subcategory = "meta_description"
    documentation_url = GOOGLE_SNIPPET_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        desc = ctx.effective_meta_description
        if not desc:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Meta description length check skipped",
                description="No meta description present to evaluate length.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="Add a meta description tag.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        length = len(desc)
        if length < 50:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Short meta description",
                description=f"Meta description is only {length} characters long and may provide insufficient context.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "meta_description": desc, "character_count": length, "source": ctx.source_type},
                recommendation="Expand the meta description to ~120-160 characters to provide a compelling summary.",
                source_type=ctx.source_type,
                confidence=0.85,
                documentation_url=self.documentation_url,
            )

        if length > 160:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Long meta description",
                description=f"Meta description is {length} characters long and may be truncated in search snippets.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "meta_description": desc, "character_count": length, "source": ctx.source_type},
                recommendation="Note: Google dynamically selects snippets, but aim for ~150-160 characters to minimize snippet truncation.",
                source_type=ctx.source_type,
                confidence=0.8,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Optimal meta description length",
            description=f"Meta description length ({length} characters) is within standard editorial guidelines.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "meta_description": desc, "character_count": length, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
