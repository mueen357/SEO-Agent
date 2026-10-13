"""Redirect analysis audit rules."""

from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_REDIRECT_DOCS = "https://developers.google.com/search/docs/crawling-indexing/301-redirects"


class RedirectChainRule(BaseRule):
    rule_id = "TECH_REDIRECT_CHAIN"
    category = "technical"
    subcategory = "redirects"
    documentation_url = GOOGLE_REDIRECT_DOCS
    default_severity = "medium"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        chain = ctx.redirect_chain

        if len(chain) > 1:
            hop_urls = [h.get("url", "") for h in chain]
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Redirect chain detected ({len(chain)} hops)",
                description=f"Request encountered a multi-hop redirect chain ({len(chain)} hops). Redirect chains waste crawl budget, introduce page latency, and dilute PageRank.",
                severity="medium",
                status="warning",
                evidence={"requested_url": ctx.page.requested_url, "final_url": ctx.url, "hop_count": len(chain), "chain": chain},
                recommendation=f"Update links and redirects to point directly to the final destination: '{ctx.url}'.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No redirect chain",
            description="Page was reached directly or via a single redirect hop.",
            severity="info",
            status="pass",
            evidence={"requested_url": ctx.page.requested_url, "final_url": ctx.url, "hop_count": len(chain)},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class RedirectLoopRule(BaseRule):
    rule_id = "TECH_REDIRECT_LOOP"
    category = "technical"
    subcategory = "redirects"
    documentation_url = GOOGLE_REDIRECT_DOCS
    default_severity = "critical"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        chain = ctx.redirect_chain
        urls = [h.get("url", "").rstrip("/") for h in chain if h.get("url")]

        has_loop = len(urls) != len(set(urls)) or ctx.page.fetch_status == "redirect_loop"

        if has_loop:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Circular redirect loop detected",
                description="Request encountered a circular redirect loop. The page cannot be loaded by users or search engines.",
                severity="critical",
                status="fail",
                evidence={"requested_url": ctx.page.requested_url, "chain": chain, "fetch_status": ctx.page.fetch_status},
                recommendation="Fix web server redirect configuration to break the circular redirect loop.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="No circular redirect loop",
            description="No redirect loops detected for this URL.",
            severity="info",
            status="pass",
            evidence={"requested_url": ctx.page.requested_url, "hop_count": len(chain)},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )


class RedirectFailureRule(BaseRule):
    rule_id = "TECH_REDIRECT_FAILURE"
    category = "technical"
    subcategory = "redirects"
    documentation_url = GOOGLE_REDIRECT_DOCS
    default_severity = "high"

    def evaluate(self, ctx: PageAuditContext) -> RuleAssessment:
        chain = ctx.redirect_chain

        if not chain:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title="Redirect failure check skipped",
                description="Page had no redirects.",
                severity="info",
                status="not_applicable",
                evidence={"page_url": ctx.url},
                recommendation="No action needed.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        status = ctx.http_status
        if status and status >= 400:
            return RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Redirect chain destination failed (HTTP {status})",
                description=f"Redirect chain ends at an inaccessible destination returning HTTP {status}.",
                severity="high",
                status="fail",
                evidence={"requested_url": ctx.page.requested_url, "final_url": ctx.url, "final_status": status, "chain": chain},
                recommendation="Update redirect rule to point to an active, valid destination page.",
                source_type=ctx.source_type,
                confidence=1.0,
                documentation_url=self.documentation_url,
            )

        return RuleAssessment(
            rule_id=self.rule_id,
            category=self.category,
            subcategory=self.subcategory,
            title="Redirect destination resolved cleanly",
            description="Redirect chain resolved to a valid destination.",
            severity="info",
            status="pass",
            evidence={"requested_url": ctx.page.requested_url, "final_url": ctx.url, "final_status": status},
            recommendation="No action needed.",
            source_type=ctx.source_type,
            confidence=1.0,
            documentation_url=self.documentation_url,
        )
