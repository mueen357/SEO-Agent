"""Site-wide rules for duplicate titles, meta descriptions, and H1 headings."""

import hashlib
import unicodedata
from typing import List
from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule

GOOGLE_TITLE_DOCS = "https://developers.google.com/search/docs/appearance/title-link"
GOOGLE_SNIPPET_DOCS = "https://developers.google.com/search/docs/appearance/snippet"


def norm_str(s: str) -> str:
    if not s:
        return ""
    return unicodedata.normalize("NFKC", s).strip().lower()


class DuplicateTitleRule(BaseRule):
    rule_id = "SITE_TITLE_DUPLICATE"
    category = "on_page"
    subcategory = "title"
    documentation_url = GOOGLE_TITLE_DOCS
    default_severity = "medium"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        groups = {}

        for p in ctx.pages:
            if not p.title:
                continue
            norm = norm_str(p.title)
            if len(norm) >= 5:
                groups.setdefault(norm, []).append(p)

        dup_groups = {k: pages for k, pages in groups.items() if len(pages) > 1}

        if not dup_groups:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No duplicate title tags detected",
                    description="All crawled pages with titles have distinct title tags.",
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

        for norm_title, pages in dup_groups.items():
            urls = [p.final_url or p.requested_url for p in pages]
            h = hashlib.sha256(norm_title.encode("utf-8")).hexdigest()[:16]
            raw_title = pages[0].title or ""

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Duplicate title tag across {len(pages)} pages",
                    description=f"{len(pages)} pages share the identical title: '{raw_title}'. Google recommends unique, descriptive titles for every page.",
                    severity="medium",
                    status="warning",
                    evidence={
                        "title": raw_title,
                        "page_count": len(pages),
                        "sample_urls": urls[:10],
                        "all_urls": urls,
                        "page_ids": [str(p.id) for p in pages],
                    },
                    recommendation="Provide a unique, topic-specific <title> tag for each page reflecting its primary subject.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"title:{h}",
                )
            )

        return assessments


class DuplicateMetaDescriptionRule(BaseRule):
    rule_id = "SITE_META_DESCRIPTION_DUPLICATE"
    category = "on_page"
    subcategory = "meta_description"
    documentation_url = GOOGLE_SNIPPET_DOCS
    default_severity = "low"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        groups = {}

        for p in ctx.pages:
            if not p.meta_description:
                continue
            norm = norm_str(p.meta_description)
            if len(norm) >= 15:
                groups.setdefault(norm, []).append(p)

        dup_groups = {k: pages for k, pages in groups.items() if len(pages) > 1}

        if not dup_groups:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No duplicate meta descriptions detected",
                    description="All crawled pages with meta descriptions have distinct descriptions.",
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

        for norm_desc, pages in dup_groups.items():
            urls = [p.final_url or p.requested_url for p in pages]
            h = hashlib.sha256(norm_desc.encode("utf-8")).hexdigest()[:16]
            raw_desc = pages[0].meta_description or ""

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Duplicate meta description across {len(pages)} pages",
                    description=f"{len(pages)} pages share the identical meta description snippet. Google recommends unique descriptions for each page.",
                    severity="low",
                    status="warning",
                    evidence={
                        "meta_description": raw_desc[:200],
                        "page_count": len(pages),
                        "sample_urls": urls[:10],
                        "all_urls": urls,
                        "page_ids": [str(p.id) for p in pages],
                    },
                    recommendation="Create tailored meta descriptions that summarize the unique content of each page.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"desc:{h}",
                )
            )

        return assessments


class DuplicateH1Rule(BaseRule):
    rule_id = "SITE_H1_DUPLICATE"
    category = "on_page"
    subcategory = "headings"
    documentation_url = GOOGLE_TITLE_DOCS
    default_severity = "low"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []
        groups = {}

        for p in ctx.pages:
            headings = getattr(p, "headings_json", {}) or {}
            h1_list = headings.get("h1", [])
            if h1_list and isinstance(h1_list, list) and h1_list[0]:
                norm = norm_str(h1_list[0])
                if len(norm) >= 5:
                    groups.setdefault(norm, []).append((p, h1_list[0]))

        dup_groups = {k: items for k, items in groups.items() if len(items) > 1}

        if not dup_groups:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No duplicate H1 headings detected",
                    description="No multiple pages share identical primary H1 headings.",
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

        for norm_h1, items in dup_groups.items():
            pages = [it[0] for it in items]
            raw_h1 = items[0][1]
            urls = [p.final_url or p.requested_url for p in pages]
            h = hashlib.sha256(norm_h1.encode("utf-8")).hexdigest()[:16]

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Duplicate H1 heading across {len(pages)} pages",
                    description=f"{len(pages)} pages share the identical H1 heading: '{raw_h1}'. Ensure primary headings clearly identify each page's specific content.",
                    severity="low",
                    status="warning",
                    evidence={
                        "h1": raw_h1,
                        "page_count": len(pages),
                        "sample_urls": urls[:10],
                        "all_urls": urls,
                        "page_ids": [str(p.id) for p in pages],
                    },
                    recommendation="Ensure the primary H1 accurately and distinctly identifies the specific subject of each page.",
                    source_type="derived_from_crawl",
                    confidence=0.9,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"h1:{h}",
                )
            )

        return assessments
