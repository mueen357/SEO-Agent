"""XML Sitemap technical audit rules."""

from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_SITEMAP_DOCS = "https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap"


class SitemapAvailabilityRule(BaseRule):
    rule_id = "TECH_SITEMAP_AVAILABILITY"
    category = "technical"
    subcategory = "sitemaps"
    documentation_url = GOOGLE_SITEMAP_DOCS
    default_severity = "low"
    is_site_level = True

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        sitemaps = ctx.sitemaps

        if not sitemaps:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="No XML sitemaps discovered",
                description="No XML sitemaps were discovered via robots.txt or standard sitemap locations.",
                severity="low",
                status="warning",
                evidence={"sitemap_count": 0},
                recommendation="Create and submit an XML sitemap to help search engines discover newly published or updated URLs.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        valid_sitemaps = [sm.sitemap_url for sm in sitemaps if sm.status in ("valid", "success")]
        if valid_sitemaps:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="XML sitemaps available",
                description=f"Discovered {len(valid_sitemaps)} accessible XML sitemap(s).",
                severity="info",
                status="pass",
                evidence={"valid_sitemaps": valid_sitemaps, "total_count": len(sitemaps)},
                recommendation="Keep sitemaps up-to-date with new content.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="XML sitemaps present but errored",
            description="XML sitemaps were discovered but all encountered fetch or parse errors.",
            severity="high",
            status="fail",
            evidence={"sitemap_count": len(sitemaps)},
            recommendation="Fix XML syntax errors or HTTP response issues for discovered sitemaps.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )

    def evaluate_site(self, ctx: SiteAuditContext) -> RuleAssessment:
        p_ctx = PageAuditContext(page=None)
        p_ctx.sitemaps = ctx.sitemaps
        return self.evaluate(p_ctx)


class SitemapParseErrorRule(BaseRule):
    rule_id = "TECH_SITEMAP_PARSE_ERROR"
    category = "technical"
    subcategory = "sitemaps"
    documentation_url = GOOGLE_SITEMAP_DOCS
    default_severity = "high"
    is_site_level = True

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        errored = [
            {"url": sm.sitemap_url, "error": sm.error_message, "status": sm.status}
            for sm in ctx.sitemaps
            if sm.status in ("parse_error", "fetch_error")
        ]

        if errored:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="XML sitemap parse or fetch errors",
                description=f"Encountered errors processing {len(errored)} sitemap(s). Invalid XML prevents search engines from parsing submitted URLs.",
                severity="high",
                status="fail",
                evidence={"errored_sitemaps": errored, "error_count": len(errored)},
                recommendation="Validate XML syntax and ensure sitemap endpoints return valid, uncorrupted XML documents.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No XML sitemap parse errors",
            description="All processed sitemaps parsed cleanly without syntax or fetch errors.",
            severity="info",
            status="pass",
            evidence={"sitemap_count": len(ctx.sitemaps)},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )

    def evaluate_site(self, ctx: SiteAuditContext) -> RuleAssessment:
        p_ctx = PageAuditContext(page=None)
        p_ctx.sitemaps = ctx.sitemaps
        return self.evaluate(p_ctx)


class SitemapUrlStatusRule(BaseRule):
    rule_id = "TECH_SITEMAP_URL_STATUS"
    category = "technical"
    subcategory = "sitemaps"
    documentation_url = GOOGLE_SITEMAP_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        if not ctx.is_in_sitemap:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="URL not listed in XML sitemap",
                description="This crawled URL was not found in any discovered XML sitemap.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "in_sitemap": False},
                recommendation="Consider including valuable indexable pages in XML sitemaps.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        status = ctx.http_status
        if status != 200:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Non-200 URL listed in XML sitemap (HTTP {status or 'unknown'})",
                description=f"URL is included in an XML sitemap but returns HTTP {status or 'error'}. Google guidelines require sitemaps to contain only indexable, HTTP 200 URLs.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "http_status": status, "in_sitemap": True},
                recommendation="Remove non-200 URLs (redirects, 404s, error pages) from XML sitemaps immediately.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Sitemap URL returns HTTP 200 OK",
            description="URL is listed in an XML sitemap and responds with HTTP 200 OK.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "http_status": 200, "in_sitemap": True},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class SitemapNoindexConflictRule(BaseRule):
    rule_id = "TECH_SITEMAP_NOINDEX_CONFLICT"
    category = "technical"
    subcategory = "sitemaps"
    documentation_url = GOOGLE_SITEMAP_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        if not ctx.is_in_sitemap:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Sitemap noindex conflict check skipped",
                description="URL is not in an XML sitemap.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        meta_robots = (ctx.effective_meta_robots or "").lower()
        x_robots = (ctx.headers.get("x-robots-tag") or "").lower()

        is_noindex = "noindex" in meta_robots or "noindex" in x_robots or "none" in meta_robots

        if is_noindex:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Contradictory indexing: Sitemap URL specifies noindex",
                description="This URL is submitted in an XML sitemap but specifies 'noindex' (via meta tag or X-Robots-Tag). Submitting a noindexed URL wastes crawl budget and creates conflicting signals.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "meta_robots": ctx.effective_meta_robots, "x_robots_tag": ctx.headers.get("x-robots-tag"), "in_sitemap": True},
                recommendation="Either remove the URL from the sitemap or remove the 'noindex' directive.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No sitemap noindex conflict",
            description="URL is listed in sitemap and is indexable.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "in_sitemap": True},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class SitemapCanonicalConflictRule(BaseRule):
    rule_id = "TECH_SITEMAP_CANONICAL_CONFLICT"
    category = "technical"
    subcategory = "sitemaps"
    documentation_url = GOOGLE_SITEMAP_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        if not ctx.is_in_sitemap:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Sitemap canonical conflict check skipped",
                description="URL is not in an XML sitemap.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        canonical = ctx.effective_canonical_url
        if not canonical:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Sitemap URL has no canonical declaration",
                description="URL is listed in sitemap without a declared canonical tag.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "in_sitemap": True},
                recommendation="Add a self-referencing canonical tag to clarify preferred URL.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        norm_page = ctx.url.rstrip("/")
        norm_can = canonical.rstrip("/")

        if norm_page != norm_can:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Sitemap URL specifies different canonical target",
                description=f"This URL is submitted in an XML sitemap but specifies canonical target '{canonical}'. Google guidelines state that only canonical URLs should be submitted in XML sitemaps.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "in_sitemap": True},
                recommendation="Submit only the canonical version in your XML sitemap, or update the canonical tag if this page is authoritative.",
                source_type=ctx.source_type,
                confidence=0.95,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Sitemap URL matches declared canonical",
            description="URL in sitemap specifies matching self-referencing canonical tag.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical, "in_sitemap": True},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
