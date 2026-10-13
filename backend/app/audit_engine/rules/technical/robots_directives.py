"""Meta robots directives evaluation rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_ROBOTS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag"


class MetaRobotsDirectivesRule(BaseRule):
    rule_id = "TECH_META_ROBOTS_DIRECTIVES"
    category = "technical"
    subcategory = "robots_meta"
    documentation_url = GOOGLE_ROBOTS_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        raw_robots = ctx.effective_meta_robots

        if not raw_robots:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No restrictive meta robots tag",
                description="Page declares no meta robots directives. By search standards, pages without robots directives are indexable and links are followed.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "meta_robots": None, "source": ctx.source_type},
                recommendation="No action needed unless page should be excluded from search engines.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        tokens = [t.strip().lower() for t in raw_robots.split(",") if t.strip()]

        has_index = "index" in tokens
        has_noindex = "noindex" in tokens or "none" in tokens
        has_nofollow = "nofollow" in tokens or "none" in tokens

        # Conflicting directives
        if has_index and has_noindex:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Conflicting meta robots directives",
                description=f"Page specifies both 'index' and 'noindex' in meta robots tag: '{raw_robots}'. Google resolves conflicts conservatively by treating 'noindex' as taking precedence.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "meta_robots": raw_robots, "tokens": tokens, "source": ctx.source_type},
                recommendation="Remove conflicting directives and declare either 'index' or 'noindex' explicitly.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if has_noindex:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Page marked noindex",
                description=f"Page specifies restrictive meta robots directive: '{raw_robots}'. Search engines will not index this page or show it in search snippets.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "meta_robots": raw_robots, "tokens": tokens, "source": ctx.source_type},
                recommendation="Verify that this page is intended to be hidden from search engines. If this is a public landing page, remove 'noindex'.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if has_nofollow:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Page specifies nofollow",
                description=f"Page specifies meta robots directive: '{raw_robots}'. Search engines will not follow links on this page to discover new content.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "meta_robots": raw_robots, "tokens": tokens, "source": ctx.source_type},
                recommendation="Confirm that links on this page should not be followed by search crawlers.",
                source_type=ctx.source_type,
                confidence=0.95,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Indexable meta robots declaration",
            description=f"Page declares valid non-restrictive meta robots directives: '{raw_robots}'.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "meta_robots": raw_robots, "tokens": tokens, "source": ctx.source_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
