"""Robots.txt technical compliance audit rules complying with RFC 9309."""

from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_ROBOTS_TXT_DOCS = "https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec"


class RobotsFetchStatusRule(BaseRule):
    rule_id = "TECH_ROBOTS_FETCH_STATUS"
    category = "technical"
    subcategory = "robots_txt"
    documentation_url = GOOGLE_ROBOTS_TXT_DOCS
    default_severity = "high"
    is_site_level = True

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        status = ctx.robots_txt_status

        if status is None:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Robots.txt status unknown",
                description="Robots.txt fetch status was not recorded for this audit.",
                severity="info",
                status="unknown",
                evidence={"audit_target": ctx.audit_target_url},
                recommendation="Ensure crawler records robots.txt status during audit initialization.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if status == "found":
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Robots.txt successfully fetched",
                description="Site provides an accessible robots.txt file (HTTP 200).",
                severity="info",
                status="pass",
                evidence={"robots_txt_status": status, "audit_target": ctx.audit_target_url},
                recommendation="Review robots.txt directives periodically to prevent accidental disallows.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )
        elif status == "not_found":
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Robots.txt absent (HTTP 404)",
                description="robots.txt returned HTTP 404 (Not Found). Under RFC 9309, search engines treat absent robots.txt as unrestricted crawl access.",
                severity="info",
                status="pass",
                evidence={"robots_txt_status": status, "audit_target": ctx.audit_target_url},
                recommendation="Consider adding a robots.txt to declare sitemap locations and prevent unnecessary 404 error log entries.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )
        elif status == "forbidden":
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Robots.txt inaccessible (HTTP 403 Forbidden)",
                description="robots.txt returned HTTP 403 (Forbidden). RFC 9309 advises crawlers to conservatively halt crawling when robots.txt is blocked.",
                severity="high",
                status="warning",
                evidence={"robots_txt_status": status, "audit_target": ctx.audit_target_url},
                recommendation="Ensure /robots.txt is publicly accessible without IP restrictions or authentication.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )
        else:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Robots.txt fetch issue ({status})",
                description=f"robots.txt could not be fetched normally (status: '{status}'). Search engines may delay crawling during persistent server errors.",
                severity="high",
                status="warning",
                evidence={"robots_txt_status": status, "audit_target": ctx.audit_target_url},
                recommendation="Investigate web server configuration and ensure /robots.txt responds with HTTP 200.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

    def evaluate_site(self, ctx: SiteAuditContext) -> RuleAssessment:
        p_ctx = PageAuditContext(page=None)  # dummy for reuse
        p_ctx.robots_txt_status = ctx.robots_txt_status
        p_ctx.audit_target_url = ctx.target_url
        return self.evaluate(p_ctx)


class RobotsDisallowRule(BaseRule):
    rule_id = "TECH_ROBOTS_DISALLOW"
    category = "technical"
    subcategory = "robots_txt"
    documentation_url = GOOGLE_ROBOTS_TXT_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        fetch_status = ctx.page.fetch_status

        if fetch_status == "robots_blocked":
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="URL disallowed by robots.txt",
                description="This URL was blocked from crawling by site robots.txt rules. Note that disallow blocks crawling, not indexation (pages can still be indexed if linked elsewhere).",
                severity="medium",
                status="warning",
                evidence={"page_url": ctx.url, "fetch_status": fetch_status},
                recommendation="If this page should be indexed, remove the Disallow directive in robots.txt. If it should NOT be indexed, use a 'noindex' tag instead.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="URL allowed by robots.txt",
            description="URL is accessible to crawlers according to robots.txt rules.",
            severity="info",
            status="pass",
            evidence={"page_url": ctx.url, "fetch_status": fetch_status},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class RobotsSitemapDeclarationRule(BaseRule):
    rule_id = "TECH_ROBOTS_SITEMAP_DECLARATION"
    category = "technical"
    subcategory = "robots_txt"
    documentation_url = GOOGLE_ROBOTS_TXT_DOCS
    default_severity = "low"
    is_site_level = True

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        content = ctx.robots_txt_content or ""

        sitemap_lines = []
        for line in content.splitlines():
            clean = line.split("#", 1)[0].strip()
            if clean.lower().startswith("sitemap:"):
                sitemap_lines.append(clean.split(":", 1)[1].strip())

        if sitemap_lines:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Sitemap declared in robots.txt",
                description=f"robots.txt declares {len(sitemap_lines)} XML sitemap URL(s).",
                severity="info",
                status="pass",
                evidence={"sitemaps_declared": sitemap_lines, "count": len(sitemap_lines)},
                recommendation="Ensure all declared sitemap URLs resolve to valid, active sitemap XML files.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No sitemap declaration in robots.txt",
            description="robots.txt does not declare any 'Sitemap:' directives. While optional, declaring sitemaps in robots.txt accelerates search engine discovery.",
            severity="low",
            status="warning",
            evidence={"robots_txt_present": bool(content)},
            recommendation="Add 'Sitemap: https://yourdomain.com/sitemap.xml' to the end of robots.txt.",
            source_type=ctx.source_type,
            confidence=0.9,
            documentation_url=self.documentation_url,
        )

    def evaluate_site(self, ctx: SiteAuditContext) -> RuleAssessment:
        p_ctx = PageAuditContext(page=None)
        p_ctx.robots_txt_content = ctx.robots_txt_content
        return self.evaluate(p_ctx)
