"""HTTP response status code audit rules."""

from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_STATUS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/http-network-errors"


class HttpStatus4xxRule(BaseRule):
    rule_id = "TECH_HTTP_4XX"
    category = "technical"
    subcategory = "http_status"
    documentation_url = GOOGLE_STATUS_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        status = ctx.http_status

        if status is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="HTTP status unavailable",
                description="No HTTP status code was recorded for this page fetch.",
                severity="info",
                status="unknown",
                evidence={"page_url": ctx.url, "fetch_status": ctx.page.fetch_status},
                recommendation="Investigate crawl fetch logs to determine why HTTP status was not captured.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if 400 <= status < 500:
            if status == 404:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="HTTP 404 Not Found",
                    description=f"Page returned client error HTTP {status} (Not Found). Search engines will drop non-existent pages from index.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                    recommendation="Restore the missing resource, update inbound links, or return HTTP 410 if content was intentionally removed.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )
            elif status == 410:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="HTTP 410 Gone",
                    description=f"Page returned HTTP {status} (Gone). Search engines treat 410 as permanent removal and de-index faster than 404.",
                    severity="medium",
                    status="warning",
                    evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                    recommendation="Verify this content was intentionally and permanently deleted.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )
            elif status in (401, 403):
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"HTTP {status} Access Restricted",
                    description=f"Page returned HTTP {status} ({'Unauthorized' if status == 401 else 'Forbidden'}). Private or protected pages cannot be indexed.",
                    severity="low",
                    status="warning",
                    evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                    recommendation="Ensure private or authentication-required areas are disallowed in robots.txt rather than returning raw 403/401 to crawlers.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )
            else:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"HTTP {status} Client Error",
                    description=f"Page returned 4xx client error status HTTP {status}.",
                    severity="medium",
                    status="fail",
                    evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                    recommendation="Investigate why the web server returned this client error response.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No 4xx client error",
            description=f"HTTP response status is {status}.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "http_status": status},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class HttpStatus5xxRule(BaseRule):
    rule_id = "TECH_HTTP_5XX"
    category = "technical"
    subcategory = "http_status"
    documentation_url = GOOGLE_STATUS_DOCS
    default_severity = "critical"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        status = ctx.http_status

        if status is not None and 500 <= status < 600:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"HTTP {status} Server Error",
                description=f"Page returned 5xx server error HTTP {status}. Server errors halt search crawler rendering and degrade site indexability.",
                severity="critical",
                status="fail",
                evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                recommendation="Investigate server logs, application errors, or upstream gateway configuration immediately.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No 5xx server error",
            description=f"HTTP response status is {status or 'unknown'}.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "http_status": status},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class HttpStatus429Rule(BaseRule):
    rule_id = "TECH_HTTP_429"
    category = "technical"
    subcategory = "http_status"
    documentation_url = GOOGLE_STATUS_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        status = ctx.http_status

        if status == 429:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="HTTP 429 Too Many Requests (Rate Limited)",
                description="Server responded with HTTP 429 rate limiting. Aggressive rate limiting causes incomplete crawl discovery and de-indexing.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "http_status": status, "fetch_status": ctx.page.fetch_status},
                recommendation="Ensure rate limiting mechanisms do not throttle legitimate verified search engine bots.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No HTTP 429 rate limiting",
            description="Page request was not throttled by HTTP 429.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "http_status": status},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class HttpUnsupportedContentRule(BaseRule):
    rule_id = "TECH_HTTP_UNSUPPORTED_CONTENT"
    category = "technical"
    subcategory = "content_type"
    documentation_url = GOOGLE_STATUS_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        fetch_status = ctx.page.fetch_status
        content_type = ctx.page.content_type or ""

        if fetch_status in ("timeout", "network_error", "size_exceeded", "ssrf_blocked"):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Fetch Failure ({fetch_status.replace('_', ' ').title()})",
                description=f"Page could not be retrieved successfully due to {fetch_status}: {ctx.page.error_message or 'network failure'}.",
                severity="high",
                status="warning",
                evidence={"page_url": ctx.url, "fetch_status": fetch_status, "error_message": ctx.page.error_message},
                recommendation="Verify server connectivity, response timeouts, and payload limits.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if content_type and "text/html" not in content_type.lower() and "application/xhtml" not in content_type.lower():
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Non-HTML document response",
                description=f"Page returned non-HTML Content-Type: '{content_type}'.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "content_type": content_type},
                recommendation="Confirm that crawling non-HTML documents is intentional.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Supported HTML content type",
            description=f"Page returns standard HTML Content-Type: '{content_type or 'text/html'}'.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "content_type": content_type},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
