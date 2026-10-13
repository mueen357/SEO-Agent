"""HTTP X-Robots-Tag header audit rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_ROBOTS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag"


class XRobotsTagRule(BaseRule):
    rule_id = "TECH_X_ROBOTS_TAG"
    category = "technical"
    subcategory = "http_headers"
    documentation_url = GOOGLE_ROBOTS_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        headers = ctx.headers

        if not headers and ctx.response_headers is None and getattr(ctx.page, "headers_json", None) is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="X-Robots-Tag evidence unavailable",
                description="HTTP response headers were not recorded for this crawl page; X-Robots-Tag status cannot be determined.",
                severity="info",
                status="unknown",
                evidence={"page_url": ctx.url},
                recommendation="Run a new crawl to capture HTTP response headers.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        x_robots = headers.get("x-robots-tag")
        if not x_robots:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No restrictive X-Robots-Tag header",
                description="HTTP response contains no X-Robots-Tag header.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "x_robots_tag": None},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        tokens = [t.strip().lower() for t in x_robots.split(",") if t.strip()]

        has_index = "index" in tokens
        has_noindex = "noindex" in tokens or "none" in tokens

        if has_index and has_noindex:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Conflicting X-Robots-Tag directives",
                description=f"HTTP header specifies conflicting directives: '{x_robots}'. 'noindex' takes precedence in search engines.",
                severity="high",
                status="warning",
                evidence={"page_url": ctx.url, "x_robots_tag": x_robots, "tokens": tokens},
                recommendation="Ensure the X-Robots-Tag header declares consistent indexing instructions.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if has_noindex:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="X-Robots-Tag noindex directive present",
                description=f"HTTP response returned X-Robots-Tag: '{x_robots}'. Search engines observing this header will not index the document.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "x_robots_tag": x_robots, "tokens": tokens},
                recommendation="Verify that this resource should be blocked from search indexes. Remove header if it should be indexed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Non-restrictive X-Robots-Tag header",
            description=f"HTTP response returned X-Robots-Tag: '{x_robots}'.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "x_robots_tag": x_robots, "tokens": tokens},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
