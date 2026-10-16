"""Site-wide rules evaluating internal linking topology and discovery depth."""

from typing import List
from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.link_graph import InternalLinkGraph
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_LINKS_DOCS = "https://developers.google.com/search/docs/crawling-indexing/links-crawlable"


class NoObservedInternalInlinksRule(BaseRule):
    rule_id = "SITE_NO_OBSERVED_INTERNAL_INLINKS"
    category = "links"
    subcategory = "internal_linking"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "medium"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        graph: InternalLinkGraph = ctx.link_graph

        if not graph:
            return assessments

        orphans = []
        for p in ctx.pages:
            # Exclude seed homepage (depth == 0)
            if p.depth == 0:
                continue
            url = p.final_url or p.requested_url
            m = graph.get_metrics(url)
            if m.inbound_unique_pages == 0:
                orphans.append(p)

        if not orphans:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="All crawled pages have observed inbound internal links",
                    description="Every discovered page beyond the seed URL has at least one observed internal inbound link in the sampled crawl.",
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

        urls = [p.final_url or p.requested_url for p in orphans]
        assessments.append(
            RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"No internal inbound links observed in sampled crawl ({len(orphans)} pages)",
                description=(
                    f"{len(orphans)} page(s) had zero inbound links from other pages within the observed crawl sample. "
                    "Note: A sampled crawl cannot prove these pages are completely unlinked on the live site, "
                    "but indicates potential discovery barriers."
                ),
                severity="medium",
                status="warning",
                evidence={
                    "orphan_count": len(orphans),
                    "sample_urls": urls[:10],
                    "all_urls": urls,
                    "page_ids": [str(p.id) for p in orphans],
                },
                recommendation=(
                    "Ensure valuable pages are linked from relevant categories, navigation, or parent pages "
                    "so search engine crawlers and users can discover them naturally."
                ),
                source_type="derived_from_crawl",
                confidence=0.85,
                documentation_url=self.documentation_url,
                fingerprint_key=f"orphans:{len(orphans)}",
            )
        )

        return assessments


class LowInternalInlinksRule(BaseRule):
    rule_id = "SITE_LOW_INTERNAL_INLINKS"
    category = "links"
    subcategory = "internal_linking"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "low"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        graph: InternalLinkGraph = ctx.link_graph

        if not graph or len(ctx.pages) <= 5:
            return [
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Low internal inlinks check not applicable (sample <= 5 pages)",
                    description="Internal link distribution analysis requires more than 5 crawled pages for statistically meaningful topology metrics.",
                    severity="info",
                    status="not_applicable",
                    evidence={
                        "reason": "small_sample_size",
                        "pages_crawled": len(ctx.pages),
                        "min_pages_required": 6,
                    },
                    recommendation="No action needed for small crawls.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"low_inlinks_na:{ctx.audit_id}",
                )
            ]

        low_inlink_pages = []
        for p in ctx.pages:
            if p.depth == 0:
                continue
            url = p.final_url or p.requested_url
            m = graph.get_metrics(url)
            if m.inbound_unique_pages == 1:
                low_inlink_pages.append(p)

        if not low_inlink_pages:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Good internal link coverage across site",
                    description="No crawled pages rely on only a single internal inlink.",
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

        urls = [p.final_url or p.requested_url for p in low_inlink_pages]
        assessments.append(
            RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Low internal link coverage ({len(low_inlink_pages)} pages with only 1 inlink)",
                description=(
                    f"{len(low_inlink_pages)} page(s) have only a single inbound link in the sampled crawl graph. "
                    "Pages with minimal internal links may receive less crawl priority."
                ),
                severity="low",
                status="warning",
                evidence={
                    "low_inlink_count": len(low_inlink_pages),
                    "sample_urls": urls[:10],
                    "all_urls": urls,
                    "page_ids": [str(p.id) for p in low_inlink_pages],
                },
                recommendation="Add contextual cross-links from related articles or relevant section pages.",
                source_type="derived_from_crawl",
                confidence=0.8,
                documentation_url=self.documentation_url,
                fingerprint_key=f"low_inlinks:{len(low_inlink_pages)}",
            )
        )

        return assessments


class DeepCrawlPathRule(BaseRule):
    rule_id = "SITE_DEEP_CRAWL_PATH"
    category = "links"
    subcategory = "crawl_depth"
    documentation_url = GOOGLE_LINKS_DOCS
    default_severity = "low"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        deep_pages = [p for p in ctx.pages if p.depth >= 4]

        if not deep_pages:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Optimal crawl depth (all pages within 3 clicks of seed)",
                    description="No pages require 4 or more navigation hops from the audit seed URL.",
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

        urls = [p.final_url or p.requested_url for p in deep_pages]
        assessments.append(
            RuleAssessment(
                rule_id=self.rule_id,
                category=self.category,
                subcategory=self.subcategory,
                title=f"Deep crawl discovery path ({len(deep_pages)} pages at depth >= 4)",
                description=(
                    f"{len(deep_pages)} page(s) were discovered at depth 4 or deeper from the initial seed page. "
                    "Deep click paths can make pages harder for users and crawlers to access."
                ),
                severity="low",
                status="warning",
                evidence={
                    "deep_pages_count": len(deep_pages),
                    "max_depth": max(p.depth for p in deep_pages),
                    "sample_urls": urls[:10],
                    "all_urls": urls,
                    "page_ids": [str(p.id) for p in deep_pages],
                },
                recommendation="Flatten site architecture where possible through category listings or breadcrumbs.",
                source_type="derived_from_crawl",
                confidence=0.85,
                documentation_url=self.documentation_url,
                fingerprint_key=f"deep:{len(deep_pages)}",
            )
        )

        return assessments
