"""Service layer coordinating technology detection, persistence, and querying."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import uuid
from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import (
    Audit,
    AuditTechnology,
    AuditTechnologySummary,
    CrawlPage,
)
from app.technology.detector import TechnologyDetector
from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import TechnologyFinding
from app.technology.wordpress import WordPressAssetDetector


class TechnologyService:
    """Coordinates technology analysis, multi-page evidence aggregation, and persistence."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.detector = TechnologyDetector()

    async def analyze_audit(
        self,
        audit_id: uuid.UUID,
    ) -> Tuple[List[AuditTechnology], AuditTechnologySummary]:
        """Perform deterministic technology and CMS analysis across all crawled pages."""
        # 1. Verify audit exists
        audit_stmt = select(Audit).where(Audit.id == audit_id)
        res = await self.db.execute(audit_stmt)
        audit = res.scalar_one_or_none()
        if not audit:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit '{audit_id}' not found.",
            )

        # 2. Query all crawl pages for this audit
        pages_stmt = (
            select(CrawlPage)
            .where(CrawlPage.audit_id == audit_id)
            .order_by(CrawlPage.depth.asc(), CrawlPage.fetched_at.asc())
        )
        pages_res = await self.db.execute(pages_stmt)
        pages = pages_res.scalars().all()

        if not pages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Audit '{audit_id}' has 0 crawled pages. Cannot perform technology detection without crawl evidence.",
            )

        page_findings_list: List[List[TechnologyFinding]] = []
        page_themes_list = []
        page_plugins_list = []

        for p in pages:
            headers = p.headers_json or {}
            tech_ev_dict = p.technology_evidence_json or {}
            raw_evidence = RawPageEvidence.from_dict(tech_ev_dict)
            page_url = p.final_url or p.requested_url or ""

            # Classify page
            p_findings = self.detector.detect_page(
                evidence=raw_evidence,
                headers=headers,
                page_url=page_url,
            )
            page_findings_list.append(p_findings)

            # Discover WordPress themes and plugins
            p_themes = WordPressAssetDetector.detect_themes(raw_evidence, page_url)
            p_plugins = WordPressAssetDetector.detect_plugins(raw_evidence, page_url)
            if p_themes:
                page_themes_list.append(p_themes)
            if p_plugins:
                page_plugins_list.append(p_plugins)

        # 3. Aggregate across all pages
        aggregated_findings = self.detector.aggregate_findings(page_findings_list)
        aggregated_themes = WordPressAssetDetector.aggregate_themes(page_themes_list)
        aggregated_plugins = WordPressAssetDetector.aggregate_plugins(page_plugins_list)
        summary_obj = self.detector.summarize(aggregated_findings)

        # 4. Idempotently clear previous analysis for this audit
        await self.db.execute(
            delete(AuditTechnology).where(AuditTechnology.audit_id == audit_id)
        )
        await self.db.execute(
            delete(AuditTechnologySummary).where(AuditTechnologySummary.audit_id == audit_id)
        )

        now = datetime.now(timezone.utc)

        # 5. Insert new AuditTechnology records
        persisted_technologies: List[AuditTechnology] = []
        for finding in aggregated_findings:
            e_items = [e.to_dict() for e in finding.evidence_items]
            # Store metadata envelope for SQLite persistence and property resolution
            e_items.append({
                "_meta": True,
                "provenance": finding.provenance,
                "version_type": finding.version_type,
                "subcategory": finding.subcategory,
                "catalog_version": "2.0.0",
                "engine_version": "2.0.0",
            })
            tech_record = AuditTechnology(
                id=uuid.uuid4(),
                audit_id=audit_id,
                technology_id=finding.technology_id,
                technology_name=finding.technology_name,
                technology_category=finding.technology_category,
                status=finding.status,
                confidence=finding.confidence,
                confidence_level=finding.confidence_level,
                version_or_null=finding.version_or_null,
                evidence_type=finding.evidence_type,
                evidence_source=finding.evidence_source,
                evidence_summary=finding.evidence_summary,
                observed_page_or_url=finding.observed_page_or_url,
                detection_method=finding.detection_method,
                page_count=finding.page_count,
                affected_urls_json=finding.affected_urls,
                evidence_items_json=e_items,
                created_at=now,
                updated_at=now,
            )
            self.db.add(tech_record)
            persisted_technologies.append(tech_record)

        # 6. Insert new AuditTechnologySummary record
        summary_record = AuditTechnologySummary(
            id=uuid.uuid4(),
            audit_id=audit_id,
            primary_cms=summary_obj.primary_cms,
            frontend_frameworks_json=summary_obj.frontend_frameworks,
            backend_runtimes_json=summary_obj.backend_runtimes,
            total_detected=summary_obj.total_detected,
            detected_technologies_count=summary_obj.detected_technologies_count,
            possible_technologies_count=summary_obj.possible_technologies_count,
            confidence_distribution_json=summary_obj.confidence_distribution,
            wordpress_themes_json=[t.to_dict() for t in aggregated_themes],
            wordpress_plugins_json=[p.to_dict() for p in aggregated_plugins],
            created_at=now,
            updated_at=now,
        )
        self.db.add(summary_record)

        await self.db.commit()

        # Re-fetch with clean session attributes
        return persisted_technologies, summary_record

    async def reanalyze_audit(
        self,
        audit_id: uuid.UUID,
    ) -> Tuple[List[AuditTechnology], AuditTechnologySummary]:
        """Re-analyze technologies for an existing completed audit using persisted crawl evidence."""
        return await self.analyze_audit(audit_id)


    async def get_technologies(
        self,
        audit_id: uuid.UUID,
        category: Optional[str] = None,
        status_filter: Optional[str] = None,
        min_confidence: Optional[float] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[AuditTechnology], int, List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Query persisted technology findings with filtering and pagination."""
        # Verify audit exists
        audit_stmt = select(Audit.id).where(Audit.id == audit_id)
        res = await self.db.execute(audit_stmt)
        if not res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit '{audit_id}' not found.",
            )

        # Base filter
        conditions = [AuditTechnology.audit_id == audit_id]
        if category:
            conditions.append(AuditTechnology.technology_category == category)
        if status_filter:
            conditions.append(AuditTechnology.status == status_filter)
        if min_confidence is not None:
            conditions.append(AuditTechnology.confidence >= min_confidence)

        # Count query
        count_stmt = select(func.count(AuditTechnology.id)).where(*conditions)
        count_res = await self.db.execute(count_stmt)
        total = count_res.scalar_one() or 0

        # Items query (ordered deterministically by confidence desc, name asc)
        items_stmt = (
            select(AuditTechnology)
            .where(*conditions)
            .order_by(AuditTechnology.confidence.desc(), AuditTechnology.technology_name.asc())
            .offset(offset)
            .limit(limit)
        )
        items_res = await self.db.execute(items_stmt)
        items = list(items_res.scalars().all())

        # Fetch themes and plugins from summary
        summary_stmt = select(AuditTechnologySummary).where(AuditTechnologySummary.audit_id == audit_id)
        summary_res = await self.db.execute(summary_stmt)
        summary = summary_res.scalar_one_or_none()

        themes = summary.wordpress_themes_json if summary else []
        plugins = summary.wordpress_plugins_json if summary else []

        return items, total, themes, plugins

    async def get_summary(
        self,
        audit_id: uuid.UUID,
    ) -> AuditTechnologySummary:
        """Retrieve persisted executive summary for an audit."""
        # Verify audit exists
        audit_stmt = select(Audit.id).where(Audit.id == audit_id)
        res = await self.db.execute(audit_stmt)
        if not res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit '{audit_id}' not found.",
            )

        summary_stmt = select(AuditTechnologySummary).where(AuditTechnologySummary.audit_id == audit_id)
        summary_res = await self.db.execute(summary_stmt)
        summary = summary_res.scalar_one_or_none()

        if not summary:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Technology analysis has not been performed for audit '{audit_id}'. Run POST /api/v1/audits/{audit_id}/technologies/analyze first.",
            )

        return summary
