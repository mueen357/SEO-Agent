"""Technical canonical validation and cross-signal consistency rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_CANONICAL_DOCS = "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls"


class CanonicalTargetStatusRule(BaseRule):
    rule_id = "TECH_CANONICAL_TARGET_STATUS"
    category = "technical"
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
                title="Canonical target status check skipped",
                description="No canonical tag declared on this page.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        # If self-referencing, status matches page status
        norm_page = ctx.url.rstrip("/")
        norm_can = canonical.rstrip("/")
        if norm_page == norm_can:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Self-referencing canonical target status verified",
                description="Canonical URL references the page itself.",
                severity="info",
                status="pass",
                evidence={"page_url": ctx.url, "canonical_url": canonical},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        target_page = ctx.lookup_page(canonical)
        if target_page is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Canonical target not crawled",
                description=f"Declared canonical target '{canonical}' was not visited during this crawl; its HTTP status cannot be determined from available evidence.",
                severity="info",
                status="unknown",
                evidence={"page_url": ctx.url, "canonical_url": canonical},
                recommendation="Verify that the canonical destination is accessible and returns HTTP 200.",
                source_type=ctx.source_type,
                confidence=0.9,
                documentation_url=self.documentation_url,
            )

        t_status = target_page.http_status
        if t_status and t_status >= 400:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Canonical points to broken page (HTTP {t_status})",
                description=f"The rel='canonical' tag points to an error page '{canonical}' returning HTTP {t_status}. Search engines cannot consolidate signals to a 4xx/5xx target.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "target_http_status": t_status},
                recommendation="Update canonical tag to point to a valid, live page returning HTTP 200.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if t_status and 300 <= t_status < 400:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Canonical points to redirecting page (HTTP {t_status})",
                description=f"The rel='canonical' tag points to a redirecting page '{canonical}'. Canonical tags should point directly to the final destination.",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "canonical_url": canonical, "target_http_status": t_status},
                recommendation="Update the canonical URL to point directly to the destination of the redirect.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Canonical target responds with HTTP 200 OK",
            description=f"Declared canonical target '{canonical}' was crawled and returns HTTP 200 OK.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical, "target_http_status": 200},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class CanonicalConflictRule(BaseRule):
    rule_id = "TECH_CANONICAL_CONFLICT"
    category = "technical"
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
                title="Canonical conflict check skipped",
                description="No canonical URL present.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        target_page = ctx.lookup_page(canonical)
        if target_page:
            t_robots = (target_page.meta_robots or "").lower()
            t_headers = target_page.headers_json or {}
            t_xrobots = (t_headers.get("x-robots-tag") or "").lower()

            if "noindex" in t_robots or "noindex" in t_xrobots or "none" in t_robots:
                return RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Canonical points to noindexed target",
                    description=f"Declared canonical target '{canonical}' specifies 'noindex'. Search engines cannot consolidate signals to a page excluded from search results.",
                    severity="high",
                    status="fail",
                    evidence={"page_url": ctx.url, "canonical_url": canonical, "target_robots": target_page.meta_robots},
                    recommendation="Remove 'noindex' from the canonical target, or change the canonical URL to point to an indexable page.",
                    source_type=ctx.source_type,
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No canonical directive conflicts",
            description="Canonical target does not conflict with target robots indexing directives.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_url": canonical},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class CanonicalMultipleRule(BaseRule):
    rule_id = "TECH_CANONICAL_MULTIPLE"
    category = "technical"
    subcategory = "canonical"
    documentation_url = GOOGLE_CANONICAL_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        count = ctx.canonical_tag_count

        if count > 1:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Multiple canonical tags detected ({count} tags)",
                description=f"Page HTML contains {count} rel='canonical' elements. Declaring multiple canonical URLs creates ambiguous signals and search engines may disregard all of them.",
                severity="high",
                status="fail",
                evidence={"page_url": ctx.url, "canonical_tag_count": count},
                recommendation="Consolidate canonical declarations into a single, unambiguous rel='canonical' tag in the HTML <head>.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Single canonical tag",
            description=f"Page specifies {count} canonical tag.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "canonical_tag_count": count},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
