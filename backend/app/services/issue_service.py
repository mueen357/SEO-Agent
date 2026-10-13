"""Service coordinating deterministic on-page and technical SEO rule execution and issues retrieval."""

import math
import uuid
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit_engine import AuditEngine
from app.audit_engine.context import PageAuditContext, SiteAuditContext
from app.audit_engine.result import RuleAssessment
from app.database.models import Audit, CrawlPage, CrawlPageRender, CrawlSitemap
from app.repositories.issue_repository import IssueRepository
from app.schemas.issues import (
    AnalyzeAuditResponse,
    IssueSummaryResponse,
    PaginatedIssuesResponse,
    SeoIssueResponse,
)


class IssueService:
    """Coordinates deterministic SEO rule evaluations and issues management."""

    def __init__(self, db: AsyncSession, engine: Optional[AuditEngine] = None) -> None:
        self.db = db
        self.repo = IssueRepository(db)
        self.engine = engine or AuditEngine()

    async def get_audit_or_404(self, audit_id: uuid.UUID) -> Audit:
        stmt = select(Audit).where(Audit.id == audit_id)
        res = await self.db.execute(stmt)
        audit = res.scalar_one_or_none()
        if not audit:
            raise HTTPException(status_code=404, detail=f"Audit {audit_id} not found")
        return audit

    async def run_analysis(
        self,
        audit_id: uuid.UUID,
        category: Optional[str] = None,
    ) -> AnalyzeAuditResponse:
        """Run deterministic SEO rule engine (on_page, technical, or all) against audit pages."""
        audit = await self.get_audit_or_404(audit_id)

        # 1. Fetch crawled pages with render and links relationships loaded
        stmt = (
            select(CrawlPage)
            .where(CrawlPage.audit_id == audit_id)
            .options(
                selectinload(CrawlPage.render),
                selectinload(CrawlPage.links),
            )
            .order_by(CrawlPage.depth.asc(), CrawlPage.fetched_at.asc())
        )
        res = await self.db.execute(stmt)
        pages = list(res.scalars().all())

        # 2. Fetch sitemaps for the audit
        stmt_sm = select(CrawlSitemap).where(CrawlSitemap.audit_id == audit_id)
        res_sm = await self.db.execute(stmt_sm)
        sitemaps = list(res_sm.scalars().all())

        sitemap_urls = set()
        for sm in sitemaps:
            if sm.urls_json:
                sitemap_urls.update(sm.urls_json)

        url_to_page = {}
        for p in pages:
            if p.requested_url:
                url_to_page[p.requested_url] = p
            if p.final_url:
                url_to_page[p.final_url] = p

        all_assessments: List[Tuple[RuleAssessment, Optional[uuid.UUID]]] = []
        pages_analyzed = 0

        # 3. Evaluate page-level rules
        for page in pages:
            ctx = PageAuditContext(
                page=page,
                render=page.render,
                links=list(page.links),
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

        # 4. Evaluate site-level rules (technical category or all)
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

        # 5. Determine categories to replace atomically
        categories_to_replace = None
        if category == "on_page":
            categories_to_replace = ["on_page", "links", "images"]
        elif category == "technical":
            categories_to_replace = ["technical"]

        saved_count = await self.repo.save_assessments(
            audit_id,
            all_assessments,
            replace_existing=True,
            categories_to_replace=categories_to_replace,
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
            engine_version="2.2.0",
            summary=summary,
        )

    async def run_onpage_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Run only on-page rules (categories: on_page, links, images)."""
        return await self.run_analysis(audit_id, category="on_page")

    async def run_technical_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Run only technical SEO rules (category: technical)."""
        return await self.run_analysis(audit_id, category="technical")

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
