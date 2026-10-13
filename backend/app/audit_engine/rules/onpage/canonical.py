"""Deterministic on-page SEO rules for canonical URL verification."""

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
                title="Missing canonical URL declaration",
                description="The page does not declare a rel='canonical' tag. Canonical URLs specify the preferred version of a page to search engines.",
                severity="low",
                status="warning",
                evidence={"page_url": ctx.url, "source": ctx.source_type},
                recommendation="Add a <link rel='canonical' href='...'> tag in the <head> to clearly indicate the authoritative URL.",
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

        canonical_clean = canonical.strip()
        parsed_page = urlparse(ctx.url)
        parsed_can = urlparse(canonical_clean)

        # Check for disallowed/unsafe schemes
        if parsed_can.scheme and parsed_can.scheme.lower() not in ("http", "https"):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Malformed canonical URL scheme",
                description=f"The canonical URL '{canonical_clean}' uses unsupported scheme '{parsed_can.scheme}'. Only http and https are valid.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "scheme": parsed_can.scheme, "source": ctx.source_type},
                recommendation="Ensure the rel='canonical' URL uses https:// or http:// scheme.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        # Check for fragment in canonical URL
        # Google documentation: Google ignores fragment identifiers in canonical URLs.
        if "#" in canonical_clean or parsed_can.fragment:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Canonical URL contains fragment identifier",
                description=f"The canonical URL '{canonical_clean}' contains a fragment identifier (#). Google ignores fragment identifiers in canonical tags, which can cause unexpected canonicalization.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "fragment": parsed_can.fragment, "source": ctx.source_type},
                recommendation="Remove the fragment (#...) from the rel='canonical' URL.",
                source_type=ctx.source_type,
                confidence=0.95,
                documentation_url=self.documentation_url,
            )

        # Relative canonical references
        is_relative = not bool(parsed_can.scheme)
        if is_relative:
            # Check for invalid relative formatting (e.g. whitespace, invalid characters)
            if any(c in canonical_clean for c in (" ", "<", ">", '"', "'")):
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Malformed canonical URL",
                    description=f"The canonical URL '{canonical_clean}' contains invalid characters.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
                    recommendation="Ensure the canonical URL is properly URL-encoded without spaces or special characters.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

            # Check if this resembles a valid relative URL reference
            # Valid relative references typically start with '/', './', '../', '?', '#'
            # or contain a path segment separator '/' or a web extension.
            # Plain unslashed tokens (e.g. 'not-a-url') lack path semantics and are malformed.
            is_valid_relative_pattern = (
                canonical_clean.startswith(("/", "./", "../", "?", "#"))
                or ("/" in canonical_clean)
                or any(canonical_clean.endswith(ext) for ext in (".html", ".htm", ".php", ".asp", ".aspx"))
            )
            if not is_valid_relative_pattern:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Malformed canonical URL",
                    description=f"The canonical URL '{canonical_clean}' is not a valid relative path or absolute URL.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
                    recommendation="Provide an absolute canonical URL (e.g. https://example.com/page) or a valid relative path (e.g. /page).",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

            # Resolve relative reference against the document's base context
            resolved_can = urljoin(ctx.url, canonical_clean)
            resolved_parsed = urlparse(resolved_can)

            if not resolved_parsed.scheme or not resolved_parsed.netloc:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Malformed relative canonical URL",
                    description=f"The relative canonical URL '{canonical_clean}' could not be resolved to a valid destination.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
                    recommendation="Fix the relative canonical path or use an absolute URL.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

            # Valid relative canonical URL (supports /services, ./services, ../services, services/plumbing, ?page=2)
            norm_can = resolved_can.rstrip("/")
            norm_page = ctx.url.rstrip("/")

            if norm_can == norm_page:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Valid relative canonical URL (self-referencing)",
                    description=f"Page specifies relative canonical '{canonical_clean}', resolving to current page '{resolved_can}'. Google recommends absolute URLs to prevent mirror discrepancies.",
                    severity="info",
                    status="pass",
                    evidence={"page_url": ctx.url, "raw_canonical": canonical_clean, "resolved_canonical": resolved_can, "source": ctx.source_type},
                    recommendation="Consider using an absolute canonical URL (with https://) to prevent resolution discrepancies across mirrors.",
                    source_type=ctx.source_type,
                    confidence=0.95,
                    documentation_url=self.documentation_url,
                )

            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Valid relative canonical URL",
                description=f"Page specifies relative canonical '{canonical_clean}', resolving to '{resolved_can}'. Google recommends absolute URLs to prevent resolution ambiguities.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "raw_canonical": canonical_clean, "resolved_canonical": resolved_can, "source": ctx.source_type},
                recommendation="Consider using an absolute canonical URL to prevent path resolution discrepancies across mirrors.",
                source_type=ctx.source_type,
                confidence=0.95,
                documentation_url=self.documentation_url,
            )

        # Absolute URL checks
        if not parsed_can.netloc:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Malformed canonical URL",
                description=f"The canonical URL '{canonical_clean}' lacks a valid host destination.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
                recommendation="Ensure the rel='canonical' URL is an absolute, well-formed URL with https:// scheme and hostname.",
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
                evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "page_host": parsed_page.netloc, "canonical_host": parsed_can.netloc, "source": ctx.source_type},
                recommendation="Confirm that content is intentionally syndicated to an external domain.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        # Self-referencing vs same-domain cross-page
        norm_can = canonical_clean.rstrip("/")
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
                evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
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
            description=f"Canonical points to another page on the same domain: {canonical_clean}.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical_clean, "source": ctx.source_type},
            recommendation="Confirm that search engines should index the target URL instead of this page.",
            source_type=ctx.source_type,
            confidence=0.95,
            documentation_url=self.documentation_url,
        )
