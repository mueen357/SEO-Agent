"""Service coordinating deterministic on-page SEO rule execution and issues retrieval."""

import math
import uuid
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit_engine import AuditEngine
from app.audit_engine.context import PageAuditContext
from app.audit_engine.result import RuleAssessment
from app.database.models import Audit, AuditStatus, CrawlPage, CrawlPageRender
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

    async def run_onpage_analysis(self, audit_id: uuid.UUID) -> AnalyzeAuditResponse:
        """Run deterministic on-page rule engine against all crawled pages of the audit."""
        audit = await self.get_audit_or_404(audit_id)

        # Fetch crawled pages with render and links relationships loaded
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

        if not pages:
            summary = IssueSummaryResponse(audit_id=audit_id)
            return AnalyzeAuditResponse(
                audit_id=audit_id,
                status="completed",
                message="No crawl pages found to analyze. Run a crawl first.",
                pages_analyzed=0,
                issues_found=0,
                summary=summary,
            )

        all_assessments: List[Tuple[RuleAssessment, Optional[uuid.UUID]]] = []
        analyzed_count = 0

        for page in pages:
            # Only evaluate pages that returned HTTP 200 and successful fetch
            if page.fetch_status != "success" or page.http_status != 200:
                continue

            ctx = PageAuditContext(
                page=page,
                render=page.render,
                links=list(page.links),
                audit_target_url=audit.target_url,
                audit_hostname=audit.hostname,
            )

            page_assessments = self.engine.evaluate_page(ctx)
            for assessment in page_assessments:
                all_assessments.append((assessment, page.id))
            analyzed_count += 1

        # Persist assessments idempotently
        saved_count = await self.repo.save_assessments(audit_id, all_assessments, replace_existing=True)

        summary_data = await self.repo.get_summary(audit_id)
        summary = IssueSummaryResponse(
            audit_id=audit_id,
            total_issues=summary_data["total_issues"],
            by_category=summary_data["by_category"],
            by_severity=summary_data["by_severity"],
            by_status=summary_data["by_status"],
            rules_executed_count=summary_data["rules_executed_count"],
        )

        return AnalyzeAuditResponse(
            audit_id=audit_id,
            status="completed",
            message=f"On-page SEO rule analysis completed successfully. Analyzed {analyzed_count} pages.",
            pages_analyzed=analyzed_count,
            issues_found=saved_count,
            summary=summary,
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

        total_pages = math.ceil(total / page_size) if total > 0 else 1

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
                fingerprint=iss.fingerprint,
                created_at=iss.created_at,
                updated_at=iss.updated_at,
            )
            issue_responses.append(resp)

        summary_data = await self.repo.get_summary(audit_id)
        summary = IssueSummaryResponse(
            audit_id=audit_id,
            total_issues=summary_data["total_issues"],
            by_category=summary_data["by_category"],
            by_severity=summary_data["by_severity"],
            by_status=summary_data["by_status"],
            rules_executed_count=summary_data["rules_executed_count"],
        )

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
            issues=issue_responses,
            summary=summary,
            message=message,
        )

    async def get_summary(self, audit_id: uuid.UUID) -> IssueSummaryResponse:
        """Retrieve aggregated summary counts for the audit."""
        await self.get_audit_or_404(audit_id)
        data = await self.repo.get_summary(audit_id)
        return IssueSummaryResponse(
            audit_id=audit_id,
            total_issues=data["total_issues"],
            by_category=data["by_category"],
            by_severity=data["by_severity"],
            by_status=data["by_status"],
            rules_executed_count=data["rules_executed_count"],
        )
