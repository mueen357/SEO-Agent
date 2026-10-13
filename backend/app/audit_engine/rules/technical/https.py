"""HTTPS and security signals audit rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_HTTPS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/https"


class HttpsUsageRule(BaseRule):
    rule_id = "TECH_HTTPS_USAGE"
    category = "technical"
    subcategory = "security"
    documentation_url = GOOGLE_HTTPS_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        url = ctx.url

        if url.startswith("https://"):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Page served over secure HTTPS",
                description="Page URL utilizes encrypted HTTPS protocol.",
                severity="info",
                status="pass",
                evidence={"page_url": url, "scheme": "https"},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        if url.startswith("http://"):
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Insecure HTTP page",
                description=f"Page is served over plain unencrypted HTTP ('{url}'). Google treats HTTPS as a search ranking signal and browsers mark HTTP sites as non-secure.",
                severity="medium",
                status="warning",
                evidence={"page_url": url, "scheme": "http"},
                recommendation="Install an SSL/TLS certificate and configure 301 redirects from HTTP to HTTPS.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Non-HTTP protocol scheme",
            description=f"Page utilizes unexpected scheme in URL: '{url}'.",
            severity="low",
            status="warning",
            evidence={"page_url": url},
            recommendation="Ensure standard web URLs are used.",
            source_type=ctx.source_type,
            confidence=0.8,
            documentation_url=self.documentation_url,
        )


class HttpsDowngradeRule(BaseRule):
    rule_id = "TECH_HTTPS_DOWNGRADE"
    category = "technical"
    subcategory = "security"
    documentation_url = GOOGLE_HTTPS_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        chain = ctx.redirect_chain
        req_url = ctx.page.requested_url
        final_url = ctx.url

        has_downgrade = False
        if req_url.startswith("https://") and final_url.startswith("http://"):
            has_downgrade = True

        for i in range(len(chain) - 1):
            curr_url = chain[i].get("url", "")
            next_url = chain[i + 1].get("url", "")
            if curr_url.startswith("https://") and next_url.startswith("http://"):
                has_downgrade = True
                break

        if has_downgrade:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="HTTPS to HTTP security downgrade redirect",
                description="A secure HTTPS request redirected to an unencrypted HTTP destination. Security downgrades expose user traffic and trigger browser security warnings.",
                severity="high",
                status="fail",
                evidence={"requested_url": req_url, "final_url": final_url, "chain": chain},
                recommendation="Ensure redirects always preserve or upgrade to HTTPS. Never downgrade to unencrypted HTTP.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No HTTPS security downgrade",
            description="Redirect chain does not downgrade from HTTPS to HTTP.",
            severity="info",
            status="pass",
            evidence={"requested_url": req_url, "final_url": final_url},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
