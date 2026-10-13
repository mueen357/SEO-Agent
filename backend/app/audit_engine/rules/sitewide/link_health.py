"""Site-wide rules evaluating internal links to broken pages and redirects."""

from typing import List
from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.link_graph import InternalLinkGraph
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_LINKS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/links-crawlable"


class InternalLinkTo4xxRule(BaseRule):
    rule_id = "SITE_INTERNAL_LINK_TO_4XX"
    category = "links"
    subcategory = "broken_links"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "high"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        graph: InternalLinkGraph = ctx.link_graph
        if not graph:
            return assessments

        broken_pairs = graph.broken_4xx_links

        if not broken_pairs:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No internal links to confirmed 4xx broken pages",
                    description="No internal links point to pages confirmed as returning HTTP 4xx client errors.",
                    severity="info",
                    status="pass",
                    evidence={"pages_checked": len(ctx.pages)},
                    recommendation="No action needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key="site:none",
                )
            )
            return assessments

        # Group by broken destination URL
        by_dest = {}
        for src_page, edge, dest_page in broken_pairs:
            by_dest.setdefault(edge.destination_url, []).append((src_page, edge, dest_page))

        for dest_url, occurrences in by_dest.items():
            dest_page = occurrences[0][2]
            src_urls = list({occ[0].final_url or occ[0].requested_url for occ in occurrences})

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Internal link to confirmed HTTP {dest_page.http_status} page ({dest_url})",
                    description=(
                        f"Found {len(occurrences)} internal link(s) across {len(src_urls)} page(s) pointing to "
                        f"'{dest_url}', which returned HTTP {dest_page.http_status}."
                    ),
                    severity="high",
                    status="fail",
                    evidence={
                        "broken_url": dest_url,
                        "http_status": dest_page.http_status,
                        "referencing_pages_count": len(src_urls),
                        "referencing_urls": src_urls[:10],
                        "link_texts": list({occ[1].link_text for occ in occurrences if occ[1].link_text})[:5],
                    },
                    recommendation="Update or remove internal links pointing to this broken destination, or restore the page.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"broken_4xx:{dest_url}",
                )
            )

        return assessments


class InternalLinkTo5xxRule(BaseRule):
    rule_id = "SITE_INTERNAL_LINK_TO_5XX"
    category = "links"
    subcategory = "broken_links"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "critical"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        graph: InternalLinkGraph = ctx.link_graph
        if not graph:
            return assessments

        server_errors = graph.broken_5xx_links

        if not server_errors:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No internal links to 5xx server error pages",
                    description="No internal links point to pages returning HTTP 5xx server errors.",
                    severity="info",
                    status="pass",
                    evidence={"pages_checked": len(ctx.pages)},
                    recommendation="No action needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key="site:none",
                )
            )
            return assessments

        by_dest = {}
        for src_page, edge, dest_page in server_errors:
            by_dest.setdefault(edge.destination_url, []).append((src_page, edge, dest_page))

        for dest_url, occurrences in by_dest.items():
            dest_page = occurrences[0][2]
            src_urls = list({occ[0].final_url or occ[0].requested_url for occ in occurrences})

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Internal link to confirmed HTTP {dest_page.http_status} server error page ({dest_url})",
                    description=(
                        f"Found {len(occurrences)} internal link(s) pointing to '{dest_url}', which returned "
                        f"HTTP {dest_page.http_status} server error."
                    ),
                    severity="critical",
                    status="fail",
                    evidence={
                        "broken_url": dest_url,
                        "http_status": dest_page.http_status,
                        "referencing_pages_count": len(src_urls),
                        "referencing_urls": src_urls[:10],
                    },
                    recommendation="Investigate server-side failure at destination URL and correct internal links.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"broken_5xx:{dest_url}",
                )
            )

        return assessments


class InternalLinkToRedirectRule(BaseRule):
    rule_id = "SITE_INTERNAL_LINK_TO_REDIRECT"
    category = "links"
    subcategory = "redirects"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "low"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        graph: InternalLinkGraph = ctx.link_graph
        if not graph:
            return assessments

        redirect_pairs = graph.redirect_links

        if not redirect_pairs:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No internal links to redirecting URLs",
                    description="Internal links point directly to canonical destinations without intermediate redirects.",
                    severity="info",
                    status="pass",
                    evidence={"pages_checked": len(ctx.pages)},
                    recommendation="No action needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key="site:none",
                )
            )
            return assessments

        by_dest = {}
        for src_page, edge, dest_page in redirect_pairs:
            by_dest.setdefault(edge.destination_url, []).append((src_page, edge, dest_page))

        for dest_url, occurrences in by_dest.items():
            dest_page = occurrences[0][2]
            src_urls = list({occ[0].final_url or occ[0].requested_url for occ in occurrences})

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Internal links to redirecting URL (HTTP {dest_page.http_status} -> {dest_url})",
                    description=(
                        f"Found {len(occurrences)} internal link(s) pointing to redirecting URL '{dest_url}'. "
                        "Linking directly to the final destination preserves crawl efficiency."
                    ),
                    severity="low",
                    status="warning",
                    evidence={
                        "redirect_url": dest_url,
                        "http_status": dest_page.http_status,
                        "final_destination": dest_page.final_url,
                        "referencing_pages_count": len(src_urls),
                        "referencing_urls": src_urls[:10],
                    },
                    recommendation=f"Update internal hyperlinks to point directly to '{dest_page.final_url or dest_url}'.",
                    source_type="derived_from_crawl",
                    confidence=0.9,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"redirect:{dest_url}",
                )
            )

        return assessments
