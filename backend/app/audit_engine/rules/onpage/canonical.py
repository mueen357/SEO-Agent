"""Canonical URL audit rules grounded in Google Search Central documentation."""

from urllib.parse import urljoin, urlparse

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_CANONICAL_DOCS = "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls"


class CanonicalPresenceRule(BaseRule):
    rule_id = "ONPAGE_CANONICAL_PRESENCE"
    category = "on_page"
    subcategory = "canonical"
    documentation_url = GOOGLE_CANONICAL_DOCS
    default_severity = "low"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        canonical = ctx.effective_canonical_url

        if not canonical:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Missing canonical URL tag",
                description="The page HTML contains no rel='canonical' link element.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "canonical_url": None, "source": ctx.source_type},
                recommendation="Add a rel='canonical' tag to explicitly specify the preferred URL version for indexing.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Canonical URL present",
            description=f"Page specifies canonical URL: {canonical}",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical, "source": ctx.source_type},
            recommendation="Verify the declared canonical URL correctly represents the authoritative page.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class CanonicalValidRule(BaseRule):
    rule_id = "ONPAGE_CANONICAL_VALID"
    category = "on_page"
    subcategory = "canonical"
    documentation_url = GOOGLE_CANONICAL_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        canonical = ctx.effective_canonical_url

        if not canonical:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Canonical validity check skipped",
                description="No canonical URL present to validate.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="Declare a canonical URL.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        parsed_can = urlparse(canonical)
        parsed_page = urlparse(ctx.url)

        # 1. Explicit relative path
        if canonical.startswith(("/", "./", "../")):
            resolved_can = urljoin(ctx.url, canonical)
            resolved_parsed = urlparse(resolved_can)

            if not resolved_parsed.scheme or not resolved_parsed.netloc:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Malformed relative canonical URL",
                    description=f"The relative canonical URL '{canonical}' could not be resolved to a valid destination.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "canonical_url": canonical, "source": ctx.source_type},
                    recommendation="Fix the relative canonical path or use an absolute URL.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Valid relative canonical URL",
                description=f"Page specifies relative canonical '{canonical}', resolving to '{resolved_can}'. Google recommends absolute URLs to prevent resolution ambiguities.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "raw_canonical": canonical, "resolved_canonical": resolved_can, "source": ctx.source_type},
                recommendation="Consider using an absolute canonical URL to prevent path resolution discrepancies across mirrors.",
                source_type=ctx.source_type,
                confidence=0.95,
                documentation_url=self.documentation_url,
            )

        # 2. Check for absolute URL with scheme
        if not parsed_can.scheme or not parsed_can.netloc:
            # Neither an explicit relative path nor an absolute URL with scheme -> Malformed
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Malformed canonical URL",
                description=f"The canonical URL '{canonical}' is malformed or lacks an absolute http(s) scheme.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "source": ctx.source_type},
                recommendation="Ensure the rel='canonical' URL is an absolute, well-formed URL with https:// scheme.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if parsed_can.scheme not in ("http", "https"):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Malformed canonical URL scheme",
                description=f"The canonical URL '{canonical}' uses unsupported scheme '{parsed_can.scheme}'. Only http and https are valid.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "scheme": parsed_can.scheme, "source": ctx.source_type},
                recommendation="Ensure the rel='canonical' URL uses https:// or http:// scheme.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        # Cross-domain check
        if parsed_can.netloc.lower() != parsed_page.netloc.lower():
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Cross-domain canonical URL",
                description=f"Canonical points to an external host: {parsed_can.netloc}. Verify cross-domain syndication is intentional.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "page_host": parsed_page.netloc, "canonical_host": parsed_can.netloc, "source": ctx.source_type},
                recommendation="Confirm that content is intentionally syndicated to an external domain.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        # Self-referencing vs same-domain cross-page
        norm_can = canonical.rstrip("/")
        norm_page = ctx.url.rstrip("/")

        if norm_can == norm_page:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Self-referencing canonical URL",
                description="Canonical URL correctly points to the current page itself.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "source": ctx.source_type},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Canonical points to another URL",
            description=f"Canonical points to another page on the same domain: {canonical}.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical, "source": ctx.source_type},
            recommendation="Confirm that search engines should index the target URL instead of this page.",
            source_type=ctx.source_type,
            confidence=0.95,
            documentation_url=self.documentation_url,
        )
