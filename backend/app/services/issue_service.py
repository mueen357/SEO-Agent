"""Service orchestrating SEO rule evaluations across on-page, technical, and site-wide scopes."""

import logging
import math
import uuid
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit_engine.context import PageAuditContext, SiteAuditContext, SiteWideAuditContext
from app.audit_engine.engine import AuditEngine
from app.audit_engine.link_graph import InternalLinkGraph
from app.audit_engine.result import RuleAssessment
from app.database.models import Audit, CrawlLink, CrawlPage, CrawlSitemap, SeoIssue, SiteFindingGroup
from app.repositories.issue_repository import IssueRepository
from app.schemas.issues import (
    AnalyzeAuditResponse,
    IssueSummaryResponse,
    LinkGraphNodeResponse,
    LinkGraphSummaryResponse,
    PaginatedFindingGroupsResponse,
    PaginatedIssuesResponse,
    SeoIssueResponse,
    SiteFindingGroupResponse,
    SiteWideSummaryResponse,
)

logger = logging.getLogger(__name__)


class IssueService:
    """Business logic for evaluating audit rules, isolating rule families, and querying findings."""

    def __init__(self, db: AsyncSession, engine: Optional[AuditEngine] = None) -> None:
        self.db = db
        self.engine = engine or AuditEngine()
        self.repo = IssueRepository(db)

    async def get_audit_or_404(self, audit_id: uuid.UUID) -> Audit:
        """Fetch audit by ID or raise HTTP 404."""
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await self.db.execute(stmt)
        audit = res.scalar_one_or_none()
        if not audit:
            raise HTTPException(status_code=404, detail="Audit not found")
        return audit

    async def run_analysis(
        self,
        audit_id: uuid.UUID,
        category: Optional[str] = None,
    ) -> AnalyzeAuditResponse:
        """Execute SEO rules against crawled pages and site-level context.
        
        Guarantees strict rule-set isolation:
        - category='on_page' only deletes and writes ONPAGE_ rules.
        - category='technical' only deletes and writes TECH_ rules.
        - category='sitewide' runs site-wide topological and duplicate intelligence (SITE_ rules).
        - category in (None, 'all') runs all rule families cleanly.
        """
        if category == "sitewide":
            return await self.run_sitewide_analysis(audit_id)

        audit = await self.get_audit_or_404(audit_id)

        # 1. Fetch crawled pages with relationships loaded
        pages_stmt = (
            select(CrawlPage)
            .where(CrawlPage.audit_id == audit_id)
            .options(selectinload(CrawlPage.render))
        )
        pages_res = await self.db.execute(pages_stmt)
        pages = list(pages_res.scalars().all())

        # 2. Fetch sitemaps
        sitemaps_stmt = select(CrawlSitemap).where(CrawlSitemap.audit_id == audit_id)
        sitemaps_res = await self.db.execute(sitemaps_stmt)
        sitemaps = list(sitemaps_res.scalars().all())

        sitemap_urls = set()
        for sm in sitemaps:
            if sm.urls_json:
                sitemap_urls.update(sm.urls_json)

        url_to_page = {p.final_url: p for p in pages if p.final_url}

        all_assessments: List[Tuple[RuleAssessment, Optional[uuid.UUID]]] = []
        pages_analyzed = 0

        # 3. Evaluate page-level rules
        for page in pages:
            ctx = PageAuditContext(
                page=page,
                render=getattr(page, "render", None),
                audit_target_url=audit.target_url,
                audit_hostname=audit.hostname,
                all_pages=pages,
                url_to_page=url_to_page,
                sitemaps=sitemaps,
                sitemap_urls=sitemap_urls,
                robots_txt_status=audit.robots_txt_status,
                robots_txt_content=audit.robots_txt_content,
                response_headers=page.headers_json,
            )

            if category == "on_page":
                if page.fetch_status == "success" and page.http_status == 200:
                    page_assessments = self.engine.evaluate_page(ctx, category="on_page")
                    for a in page_assessments:
                        all_assessments.append((a, page.id))
                    pages_analyzed += 1
            elif category == "technical":
                page_assessments = self.engine.evaluate_page(ctx, category="technical")
                for a in page_assessments:
                    all_assessments.append((a, page.id))
                pages_analyzed += 1
            else:
                # All categories
                if page.fetch_status == "success" and page.http_status == 200:
                    onpage_assessments = self.engine.evaluate_page(ctx, category="on_page")
                    for a in onpage_assessments:
                        all_assessments.append((a, page.id))
                tech_assessments = self.engine.evaluate_page(ctx, category="technical")
                for a in tech_assessments:
                    all_assessments.append((a, page.id))
                pages_analyzed += 1

        # 4. Evaluate site-level technical rules (technical category or all)
        if category in ("technical", None, "all"):
            site_ctx = SiteAuditContext(
                audit_id=audit_id,
                target_url=audit.target_url,
                hostname=audit.hostname,
                pages=pages,
                sitemaps=sitemaps,
                sitemap_urls=sitemap_urls,
                robots_txt_status=audit.robots_txt_status,
                robots_txt_content=audit.robots_txt_content,
            )
            site_assessments = self.engine.evaluate_site(site_ctx, category="technical")
            for a in site_assessments:
                all_assessments.append((a, None))

        # 5. Evaluate site-wide rules if category is all/None
        if category in (None, "all"):
            sitewide_res = await self.run_sitewide_analysis(audit_id)
            # Note: run_sitewide_analysis persists site-wide rules and groups directly.

        # 6. Apply precise rule-prefix isolation during save
        rule_prefixes_to_replace = None
        if category == "on_page":
            rule_prefixes_to_replace = ["ONPAGE_"]
        elif category == "technical":
            rule_prefixes_to_replace = ["TECH_"]

        saved_count = await self.repo.save_assessments(
            audit_id,
            all_assessments,
            replace_existing=True,
            rule_prefixes_to_replace=rule_prefixes_to_replace,
        )

        summary_data = await self.repo.get_summary(audit_id)
        summary = IssueSummaryResponse(
            total_assessments=summary_data.get("total_assessments", 0),
            actionable_findings=summary_data.get("actionable_findings", 0),
            pass_count=summary_data.get("pass_count", 0),
            warning_count=summary_data.get("warning_count", 0),
            fail_count=summary_data.get("fail_count", 0),
            unknown_count=summary_data.get("unknown_count", 0),
            not_applicable_count=summary_data.get("not_applicable_count", 0),
            total_issues=summary_data.get("total_issues", 0),
            by_category=summary_data.get("by_category", {}),
            by_severity=summary_data.get("by_severity", {}),
            by_status=summary_data.get("by_status", {}),
            rules_executed_count=summary_data.get("rules_executed_count", 0),
        )

        cat_name = category or "all"
        return AnalyzeAuditResponse(
            audit_id=audit_id,
            status="completed",
            message=f"{cat_name.title()} SEO rule analysis completed successfully. Analyzed {pages_analyzed} page(s).",
            pages_analyzed=pages_analyzed,
            total_issues=saved_count,
            issues_found=saved_count,
            engine_version="2.3.0",
            summary=summary,
        )

    async def run_onpage_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Run only on-page rules (categories: on_page, links, images)."""
        return await self.run_analysis(audit_id, category="on_page")

    async def run_technical_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Run only technical SEO rules (category: technical)."""
        return await self.run_analysis(audit_id, category="technical")

    async def run_sitewide_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Execute site-wide SEO analysis, duplicate content detection, and link graph intelligence."""
        audit = await self.get_audit_or_404(audit_id)

        # 1. Fetch crawled pages
        pages_stmt = (
            select(CrawlPage)
            .where(CrawlPage.audit_id == audit_id)
            .options(selectinload(CrawlPage.render))
        )
        pages_res = await self.db.execute(pages_stmt)
        pages = list(pages_res.scalars().all())

        # 2. Fetch links
        links_stmt = select(CrawlLink).where(CrawlLink.audit_id == audit_id)
        links_res = await self.db.execute(links_stmt)
        links = list(links_res.scalars().all())

        # 3. Fetch sitemaps
        sitemaps_stmt = select(CrawlSitemap).where(CrawlSitemap.audit_id == audit_id)
        sitemaps_res = await self.db.execute(sitemaps_stmt)
        sitemaps = list(sitemaps_res.scalars().all())

        sitemap_urls = set()
        for sm in sitemaps:
            if sm.urls_json:
                sitemap_urls.update(sm.urls_json)

        # 4. Build deterministic internal link graph
        link_graph = InternalLinkGraph.from_crawl(
            pages=pages,
            links=links,
            sitemap_urls=sitemap_urls,
            seed_url=audit.target_url,
        )

        # 5. Build SiteWideAuditContext
        sitewide_ctx = SiteWideAuditContext(
            audit_id=audit_id,
            host=audit.hostname,
            pages=pages,
            links=links,
            link_graph=link_graph,
            sitemaps=sitemaps,
            sitemap_urls=sitemap_urls,
            crawl_status=audit.status.value if hasattr(audit.status, "value") else str(audit.status),
        )

        # 6. Evaluate all 13 site-wide rules with per-rule exception isolation
        assessments = self.engine.evaluate_sitewide(sitewide_ctx)

        # 7. Extract SiteFindingGroup records and associate assessments
        all_assessments: List[Tuple[RuleAssessment, Optional[uuid.UUID]]] = []
        finding_groups: List[SiteFindingGroup] = []

        url_to_page = {p.final_url: p for p in pages if p.final_url}

        for a in assessments:
            # Check if assessment is tied to a specific page or is site-wide
            page_id = None
            if "page_url" in a.evidence and a.evidence["page_url"] in url_to_page:
                page_id = url_to_page[a.evidence["page_url"]].id
            all_assessments.append((a, page_id))

            # Map rule_id to canonical group_type
            rule_group_types = {
                "SITE_CONTENT_DUPLICATE_EXACT": "exact_duplicate_content",
                "SITE_CONTENT_DUPLICATE_NEAR": "near_duplicate_content",
                "SITE_TITLE_DUPLICATE": "duplicate_title",
                "SITE_META_DESCRIPTION_DUPLICATE": "duplicate_meta_description",
                "SITE_H1_DUPLICATE": "duplicate_h1",
                "SITE_DUPLICATE_CANONICAL_REVIEW": "duplicate_canonical_review",
                "SITE_CONTENT_CANONICAL_CONFLICT": "content_canonical_conflict",
            }

            # If evidence has a group_id or group_fingerprint, record SiteFindingGroup
            if a.status in ("fail", "warning") and ("group_id" in a.evidence or "group_fingerprint" in a.evidence or a.rule_id in rule_group_types):
                group_fp = a.evidence.get("group_fingerprint") or a.compute_fingerprint(audit_id, None)
                g_type = a.evidence.get("group_type") or rule_group_types.get(a.rule_id, "site_group")
                aff_urls = a.evidence.get("affected_urls") or a.evidence.get("all_urls") or a.evidence.get("sample_urls") or []
                aff_page_ids = a.evidence.get("affected_page_ids") or a.evidence.get("page_ids") or []
                group = SiteFindingGroup(
                    id=uuid.uuid4(),
                    audit_id=audit_id,
                    rule_id=a.rule_id,
                    rule_version=a.rule_version,
                    group_fingerprint=group_fp,
                    group_type=g_type,
                    affected_page_ids_json=aff_page_ids,
                    affected_urls_json=aff_urls,
                    evidence_json=a.evidence,
                )
                finding_groups.append(group)

        # 8. Rule-set isolation: delete ONLY previous site-wide assessments (SITE_)
        saved_count = await self.repo.save_assessments(
            audit_id,
            all_assessments,
            replace_existing=True,
            rule_prefixes_to_replace=["SITE_"],
        )

        # 9. Save finding groups atomically
        await self.repo.save_finding_groups(audit_id, finding_groups, replace_existing=True)

        # 10. Compute updated summary
        summary_data = await self.repo.get_summary(audit_id)
        summary = IssueSummaryResponse(
            total_assessments=summary_data.get("total_assessments", 0),
            actionable_findings=summary_data.get("actionable_findings", 0),
            pass_count=summary_data.get("pass_count", 0),
            warning_count=summary_data.get("warning_count", 0),
            fail_count=summary_data.get("fail_count", 0),
            unknown_count=summary_data.get("unknown_count", 0),
            not_applicable_count=summary_data.get("not_applicable_count", 0),
            total_issues=summary_data.get("total_issues", 0),
            by_category=summary_data.get("by_category", {}),
            by_severity=summary_data.get("by_severity", {}),
            by_status=summary_data.get("by_status", {}),
            rules_executed_count=summary_data.get("rules_executed_count", 0),
        )

        return AnalyzeAuditResponse(
            audit_id=audit_id,
            status="completed",
            message=f"Site-wide SEO analysis completed successfully. Evaluated 13 site-wide rules across {len(pages)} page(s).",
            pages_analyzed=len(pages),
            total_issues=saved_count,
            issues_found=saved_count,
            engine_version="2.3.0",
            summary=summary,
        )

    async def get_sitewide_summary(self, audit_id: uuid.UUID) -> SiteWideSummaryResponse:
        """Retrieve aggregated site-wide intelligence summary metrics."""
        audit = await self.get_audit_or_404(audit_id)
        data = await self.repo.get_summary(audit_id)

        # Query finding groups count
        groups, total_groups = await self.repo.get_finding_groups(audit_id, page=1, page_size=500)
        exact_count = sum(1 for g in groups if g.group_type == "exact_duplicate_content")
        near_count = sum(1 for g in groups if g.group_type == "near_duplicate_content")
        meta_count = sum(1 for g in groups if g.group_type in ("duplicate_title", "duplicate_meta_description", "duplicate_h1"))
        canonical_count = sum(1 for g in groups if "canonical" in g.group_type)

        # Count total pages
        pages_stmt = select(CrawlPage).where(CrawlPage.audit_id == audit_id)
        pages_res = await self.db.execute(pages_stmt)
        pages = list(pages_res.scalars().all())

        analyzed_count = sum(1 for p in pages if p.fetch_status == "success")
        excluded_count = len(pages) - analyzed_count

        return SiteWideSummaryResponse(
            audit_id=audit_id,
            total_assessments=data.get("total_assessments", 0),
            actionable_findings=data.get("actionable_findings", 0),
            pass_count=data.get("pass_count", 0),
            warning_count=data.get("warning_count", 0),
            fail_count=data.get("fail_count", 0),
            unknown_count=data.get("unknown_count", 0),
            exact_duplicate_groups_count=exact_count,
            near_duplicate_groups_count=near_count,
            duplicate_metadata_groups_count=meta_count,
            canonical_conflict_groups_count=canonical_count,
            pages_analyzed=analyzed_count,
            pages_excluded=excluded_count,
            evidence_coverage="sampled_crawl",
            rules_executed_count=13,
        )

    async def get_sitewide_duplicate_groups(
        self,
        audit_id: uuid.UUID,
        rule_id: Optional[str] = None,
        group_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedFindingGroupsResponse:
        """Retrieve paginated site-wide finding groups."""
        await self.get_audit_or_404(audit_id)

        page = max(1, page)
        page_size = min(100, max(1, page_size))

        groups, total = await self.repo.get_finding_groups(
            audit_id=audit_id,
            rule_id=rule_id,
            group_type=group_type,
            page=page,
            page_size=page_size,
        )

        items = [
            SiteFindingGroupResponse(
                id=g.id,
                audit_id=g.audit_id,
                rule_id=g.rule_id,
                rule_version=g.rule_version,
                group_fingerprint=g.group_fingerprint,
                group_type=g.group_type,
                affected_page_ids=g.affected_page_ids_json or [],
                affected_urls=g.affected_urls_json or [],
                evidence=g.evidence_json or {},
                created_at=g.created_at,
                updated_at=g.updated_at,
            )
            for g in groups
        ]

        total_pages = math.ceil(total / page_size) if total > 0 else 1
        return PaginatedFindingGroupsResponse(
            audit_id=audit_id,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=items,
        )

    async def get_sitewide_link_graph(self, audit_id: uuid.UUID) -> LinkGraphSummaryResponse:
        """Construct deterministic link graph representation and topological summary."""
        audit = await self.get_audit_or_404(audit_id)

        pages_stmt = select(CrawlPage).where(CrawlPage.audit_id == audit_id)
        pages_res = await self.db.execute(pages_stmt)
        pages = list(pages_res.scalars().all())

        links_stmt = select(CrawlLink).where(CrawlLink.audit_id == audit_id)
        links_res = await self.db.execute(links_stmt)
        links = list(links_res.scalars().all())

        sitemaps_stmt = select(CrawlSitemap).where(CrawlSitemap.audit_id == audit_id)
        sitemaps_res = await self.db.execute(sitemaps_stmt)
        sitemaps = list(sitemaps_res.scalars().all())

        sitemap_urls = set()
        for sm in sitemaps:
            if sm.urls_json:
                sitemap_urls.update(sm.urls_json)

        graph = InternalLinkGraph.from_crawl(
            pages=pages,
            links=links,
            sitemap_urls=sitemap_urls,
            seed_url=audit.target_url,
        )
        summary = graph.get_summary()

        node_responses = [
            LinkGraphNodeResponse(
                url=n.url,
                crawl_page_id=str(n.page_id) if n.page_id else None,
                http_status=n.http_status,
                inbound_internal_count=n.inbound_internal_count,
                outbound_internal_count=n.outbound_internal_count,
                crawl_depth=n.crawl_depth,
                is_sitemap_only=n.is_sitemap_only,
                is_seed=n.is_seed,
            )
            for n in graph.nodes.values()
        ]

        return LinkGraphSummaryResponse(
            audit_id=audit_id,
            total_nodes=summary.get("total_nodes", 0),
            total_internal_edges=summary.get("total_internal_edges", 0),
            unique_destinations=summary.get("unique_destinations", 0),
            orphan_count=summary.get("orphan_count", 0),
            low_inlink_count=summary.get("low_inlink_count", 0),
            broken_link_destinations=summary.get("broken_link_destinations", 0),
            redirect_destinations=summary.get("redirect_destinations", 0),
            max_crawl_depth=summary.get("max_crawl_depth", 0),
            sitemap_only_count=summary.get("sitemap_only_count", 0),
            crawl_completeness_caveat=summary.get(
                "crawl_completeness_caveat",
                "Graph reflects only observed sampled URLs. Uncrawled pages may exist.",
            ),
            nodes=node_responses,
        )

    async def get_audit_issues(
        self,
        audit_id: uuid.UUID,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        crawl_page_id: Optional[uuid.UUID] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> PaginatedIssuesResponse:
        """Retrieve paginated issues with filtering."""
        await self.get_audit_or_404(audit_id)

        page = max(1, page)
        page_size = min(100, max(1, page_size))

        issues, total = await self.repo.get_issues(
            audit_id=audit_id,
            category=category,
            severity=severity,
            status=status,
            crawl_page_id=crawl_page_id,
            page=page,
            page_size=page_size,
        )

        issue_responses: List[SeoIssueResponse] = []
        for iss in issues:
            resp = SeoIssueResponse(
                id=iss.id,
                audit_id=iss.audit_id,
                crawl_page_id=iss.crawl_page_id,
                page_url=iss.page.final_url if iss.page else None,
                rule_id=iss.rule_id,
                category=iss.category,
                subcategory=iss.subcategory,
                title=iss.title,
                description=iss.description,
                severity=iss.severity,
                status=iss.status,
                evidence_json=iss.evidence_json,
                recommendation=iss.recommendation,
                source_type=iss.source_type,
                confidence=iss.confidence,
                documentation_url=iss.documentation_url,
                rule_version=iss.rule_version,
                created_at=iss.created_at,
            )
            issue_responses.append(resp)

        summary = await self.get_summary(audit_id)
        total_pages = math.ceil(total / page_size) if total > 0 else 1

        message = (
            "No issues found or analysis has not been executed yet. The issue detection pipeline is scheduled for Phase 1.5."
            if total == 0
            else None
        )
        return PaginatedIssuesResponse(
            audit_id=audit_id,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            items=issue_responses,
            issues=issue_responses,
            summary=summary,
            message=message,
        )

    async def get_summary(self, audit_id: uuid.UUID) -> IssueSummaryResponse:
        """Retrieve aggregated summary counts for the audit."""
        await self.get_audit_or_404(audit_id)
        data = await self.repo.get_summary(audit_id)
        return IssueSummaryResponse(
            total_assessments=data.get("total_assessments", 0),
            actionable_findings=data.get("actionable_findings", 0),
            pass_count=data.get("pass_count", 0),
            warning_count=data.get("warning_count", 0),
            fail_count=data.get("fail_count", 0),
            unknown_count=data.get("unknown_count", 0),
            not_applicable_count=data.get("not_applicable_count", 0),
            total_issues=data.get("total_issues", 0),
            by_category=data.get("by_category", {}),
            by_severity=data.get("by_severity", {}),
            by_status=data.get("by_status", {}),
            rules_executed_count=data.get("rules_executed_count", 0),
        )
