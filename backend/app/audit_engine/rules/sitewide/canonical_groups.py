"""Site-wide rules evaluating canonical consolidation signals across duplicate groups."""

from typing import List
from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_CANONICAL_DOCS = "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls"


class DuplicateCanonicalReviewRule(BaseRule):
    rule_id = "SITE_DUPLICATE_CANONICAL_REVIEW"
    category = "canonical"
    subcategory = "duplicate_consolidation"
    documentation_url = GOOGLE_CANONICAL_DOCS
    default_severity = "medium"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []

        # Find duplicate content groups
        hash_to_pages = {}
        for p in ctx.pages:
            if p.fetch_status != "success" or p.http_status != 200:
                continue
            h = getattr(p, "normalized_main_text_hash", None)
            if h and getattr(p, "content_quality_status", None) in ("usable", "sufficient"):
                hash_to_pages.setdefault(h, []).append(p)

        dup_groups = {h: pages for h, pages in hash_to_pages.items() if len(pages) > 1}

        if not dup_groups:
            return [
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Duplicate canonical consolidation not applicable (no duplicate content groups)",
                    description="No duplicate content groups were detected across crawled pages, so duplicate canonical consolidation does not apply.",
                    severity="info",
                    status="not_applicable",
                    evidence={
                        "reason": "no_duplicate_content_groups",
                        "pages_evaluated": len(ctx.pages),
                    },
                    recommendation="No duplicate canonical review needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"canonical_review_na:{ctx.audit_id}",
                )
            ]

        for h, pages in dup_groups.items():
            # Check canonical targets declared by pages in this duplicate group
            canonicals = set()
            self_referencing_count = 0

            for p in pages:
                url = (p.final_url or p.requested_url or "").rstrip("/")
                can = (p.canonical_url or "").rstrip("/")
                if can:
                    canonicals.add(can)
                    if can == url:
                        self_referencing_count += 1

            urls = [p.final_url or p.requested_url for p in pages]

            # If all duplicates declare a single consolidated canonical target, consolidation is working
            if len(canonicals) == 1 and len(pages) > 1:
                assessments.append(
                    RuleAssessment(
                        rule_id=self.rule_id,
                        category=self.category,
                        subcategory=self.subcategory,
                        title=f"Duplicate content pages consolidated to single canonical ({len(pages)} pages)",
                        description=(
                            f"{len(pages)} pages with identical main content all declare canonical preference "
                            f"to '{list(canonicals)[0]}'."
                        ),
                        severity="info",
                        status="pass",
                        evidence={
                            "group_hash": h,
                            "page_count": len(pages),
                            "urls": urls[:10],
                            "preferred_canonical": list(canonicals)[0],
                        },
                        recommendation="Canonical signals are consolidated cleanly.",
                        source_type="derived_from_crawl",
                        confidence=1.0,
                        documentation_url=self.documentation_url,
                        fingerprint_key=f"canonical_consolidated:{h}",
                    )
                )
            # If all duplicates declare distinct self-referencing canonicals, they compete against each other
            elif self_referencing_count >= 2 and len(canonicals) >= 2:
                assessments.append(
                    RuleAssessment(
                        rule_id=self.rule_id,
                        category=self.category,
                        subcategory=self.subcategory,
                        title=f"Duplicate content pages with competing self-referencing canonicals ({len(pages)} pages)",
                        description=(
                            f"{len(pages)} pages have identical main content but each declares a self-referencing rel='canonical' tag. "
                            "This sends conflicting signals to search engines about which page should be indexed."
                        ),
                        severity="medium",
                        status="warning",
                        evidence={
                            "group_hash": h,
                            "page_count": len(pages),
                            "urls": urls[:10],
                            "declared_canonicals": list(canonicals)[:10],
                        },
                        recommendation=(
                            "Choose a single authoritative URL as the preferred version and point the rel='canonical' "
                            "tags on all duplicate pages to that single preferred URL."
                        ),
                        source_type="derived_from_crawl",
                        confidence=0.95,
                        documentation_url=self.documentation_url,
                        fingerprint_key=f"canonical_review:{h}",
                    )
                )

        if not assessments:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Duplicate canonical review complete",
                    description=f"Evaluated {len(dup_groups)} duplicate group(s); no competing self-referencing canonicals detected.",
                    severity="info",
                    status="pass",
                    evidence={"duplicate_groups_count": len(dup_groups)},
                    recommendation="No competing duplicate canonicals found.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"canonical_review_pass:{ctx.audit_id}",
                )
            )

        return assessments


class ContentCanonicalConflictRule(BaseRule):
    rule_id = "SITE_CONTENT_CANONICAL_CONFLICT"
    category = "canonical"
    subcategory = "canonical_conflict"
    documentation_url = GOOGLE_CANONICAL_DOCS
    default_severity = "high"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []

        # Find duplicate pages pointing to a canonical that returned 4xx or 5xx
        crawled_urls = {p.final_url.rstrip("/"): p for p in ctx.pages if p.final_url}

        hash_to_pages = {}
        for p in ctx.pages:
            h = getattr(p, "normalized_main_text_hash", None)
            if h and getattr(p, "content_quality_status", None) in ("usable", "sufficient"):
                hash_to_pages.setdefault(h, []).append(p)

        dup_groups = {h: pages for h, pages in hash_to_pages.items() if len(pages) > 1}

        if not dup_groups:
            return [
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="Content canonical conflict not applicable (no duplicate content groups)",
                    description="No duplicate content groups were detected across crawled pages, so canonical conflict checks do not apply.",
                    severity="info",
                    status="not_applicable",
                    evidence={
                        "reason": "no_duplicate_content_groups",
                        "pages_evaluated": len(ctx.pages),
                    },
                    recommendation="No canonical conflict review needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"can_conflict_na:{ctx.audit_id}",
                )
            ]

        for h, pages in dup_groups.items():
            for p in pages:
                if not p.canonical_url:
                    continue
                can_norm = p.canonical_url.rstrip("/")
                target = crawled_urls.get(can_norm)
                if target and target.http_status and target.http_status >= 400:
                    assessments.append(
                        RuleAssessment(
                            rule_id=self.rule_id,
                            category=self.category,
                            subcategory=self.subcategory,
                            title=f"Duplicate page points canonical to error page (HTTP {target.http_status})",
                            description=(
                                f"Page '{p.final_url or p.requested_url}' has duplicate content and specifies a canonical "
                                f"URL '{p.canonical_url}' that returns HTTP {target.http_status}."
                            ),
                            severity="high",
                            status="fail",
                            evidence={
                                "page_url": p.final_url or p.requested_url,
                                "canonical_url": p.canonical_url,
                                "target_http_status": target.http_status,
                            },
                            recommendation="Update the canonical URL to point to a live, indexable HTTP 200 page.",
                            source_type="derived_from_crawl",
                            confidence=1.0,
                            documentation_url=self.documentation_url,
                            fingerprint_key=f"can_conflict:{p.final_url}",
                        )
                    )

        if not assessments:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No canonical conflicts with error pages detected",
                    description="Duplicate pages with canonical tags point to accessible pages (no HTTP 4xx or 5xx targets).",
                    severity="info",
                    status="pass",
                    evidence={
                        "duplicate_groups_count": len(dup_groups),
                    },
                    recommendation="Canonical URLs are valid and accessible.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"can_conflict_pass:{ctx.audit_id}",
                )
            )

        return assessments
