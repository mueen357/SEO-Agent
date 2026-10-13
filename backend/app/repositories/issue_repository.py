"""Repository for persisting, querying, and aggregating SEO issues and site-wide finding groups."""

import uuid
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.audit_engine.result import RuleAssessment
from app.database.models import CrawlPage, SeoIssue, SiteFindingGroup


class IssueRepository:
    """Async repository for SeoIssue and SiteFindingGroup records."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def save_assessments(
        self,
        audit_id: uuid.UUID,
        assessments: List[Tuple[RuleAssessment, Optional[uuid.UUID]]],
        replace_existing: bool = True,
        categories_to_replace: Optional[List[str]] = None,
        rule_prefixes_to_replace: Optional[List[str]] = None,
        rule_ids_to_replace: Optional[List[str]] = None,
    ) -> int:
        """Persist rule assessments as SeoIssue records with deterministic fingerprints.
        
        Supports fine-grained rule-set isolation so that on-page, technical, or site-wide
        runs never inadvertently delete issues from other rule families.
        """
        if replace_existing:
            if rule_ids_to_replace:
                await self.db.execute(
                    delete(SeoIssue).where(
                        SeoIssue.audit_id == audit_id,
                        SeoIssue.rule_id.in_(rule_ids_to_replace),
                    )
                )
            elif rule_prefixes_to_replace:
                conditions = [SeoIssue.rule_id.startswith(p) for p in rule_prefixes_to_replace]
                await self.db.execute(
                    delete(SeoIssue).where(
                        SeoIssue.audit_id == audit_id,
                        or_(*conditions),
                    )
                )
            elif categories_to_replace:
                await self.db.execute(
                    delete(SeoIssue).where(
                        SeoIssue.audit_id == audit_id,
                        SeoIssue.category.in_(categories_to_replace),
                    )
                )
            else:
                await self.db.execute(delete(SeoIssue).where(SeoIssue.audit_id == audit_id))

        saved_count = 0
        seen_fingerprints = set()

        for assessment, page_id in assessments:
            fp = assessment.compute_fingerprint(audit_id, page_id)
            if fp in seen_fingerprints:
                continue
            seen_fingerprints.add(fp)

            issue = SeoIssue(
                audit_id=audit_id,
                crawl_page_id=page_id,
                rule_id=assessment.rule_id,
                category=assessment.category,
                subcategory=assessment.subcategory,
                title=assessment.title,
                description=assessment.description,
                severity=assessment.severity,
                status=assessment.status,
                evidence_json=assessment.evidence,
                recommendation=assessment.recommendation,
                source_type=assessment.source_type,
                confidence=assessment.confidence,
                documentation_url=assessment.documentation_url,
                rule_version=assessment.rule_version,
                fingerprint=fp,
            )
            self.db.add(issue)
            saved_count += 1

        await self.db.commit()
        return saved_count

    async def save_finding_groups(
        self,
        audit_id: uuid.UUID,
        groups: List[SiteFindingGroup],
        replace_existing: bool = True,
    ) -> int:
        """Persist site-wide finding groups atomically for the given audit."""
        if replace_existing:
            await self.db.execute(
                delete(SiteFindingGroup).where(SiteFindingGroup.audit_id == audit_id)
            )

        saved = 0
        seen_fp = set()
        for g in groups:
            if g.group_fingerprint in seen_fp:
                continue
            seen_fp.add(g.group_fingerprint)
            self.db.add(g)
            saved += 1

        await self.db.commit()
        return saved

    async def get_finding_groups(
        self,
        audit_id: uuid.UUID,
        rule_id: Optional[str] = None,
        group_type: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[SiteFindingGroup], int]:
        """Query paginated SiteFindingGroup records."""
        query = select(SiteFindingGroup).where(SiteFindingGroup.audit_id == audit_id)
        if rule_id:
            query = query.where(SiteFindingGroup.rule_id == rule_id)
        if group_type:
            query = query.where(SiteFindingGroup.group_type == group_type)

        count_stmt = select(func.count()).select_from(query.subquery())
        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar_one()

        offset = max(0, (page - 1) * page_size)
        stmt = (
            query.order_by(SiteFindingGroup.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        res = await self.db.execute(stmt)
        groups = list(res.scalars().all())
        return groups, total

    async def get_issues(
        self,
        audit_id: uuid.UUID,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        crawl_page_id: Optional[uuid.UUID] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[SeoIssue], int]:
        """Query paginated issues with optional filtering."""
        query = select(SeoIssue).where(SeoIssue.audit_id == audit_id)

        if category:
            query = query.where(SeoIssue.category == category)
        if severity:
            query = query.where(SeoIssue.severity == severity)
        if status:
            query = query.where(SeoIssue.status == status)
        if crawl_page_id:
            query = query.where(SeoIssue.crawl_page_id == crawl_page_id)

        count_stmt = select(func.count()).select_from(query.subquery())
        total_res = await self.db.execute(count_stmt)
        total = total_res.scalar_one()

        offset = max(0, (page - 1) * page_size)
        stmt = (
            query.options(selectinload(SeoIssue.page))
            .order_by(
                case(
                    (SeoIssue.severity == "critical", 1),
                    (SeoIssue.severity == "high", 2),
                    (SeoIssue.severity == "medium", 3),
                    (SeoIssue.severity == "low", 4),
                    (SeoIssue.severity == "info", 5),
                    else_=6,
                ),
                case(
                    (SeoIssue.status == "fail", 1),
                    (SeoIssue.status == "warning", 2),
                    (SeoIssue.status == "unknown", 3),
                    (SeoIssue.status == "pass", 4),
                    else_=5,
                ),
                SeoIssue.created_at.desc(),
            )
            .offset(offset)
            .limit(page_size)
        )

        res = await self.db.execute(stmt)
        issues = list(res.scalars().all())
        return issues, total

    async def get_summary(self, audit_id: uuid.UUID) -> Dict[str, Any]:
        """Aggregate counts of issues grouped by category, severity, and status."""
        stmt = select(
            SeoIssue.category,
            SeoIssue.severity,
            SeoIssue.status,
            func.count(SeoIssue.id),
        ).where(SeoIssue.audit_id == audit_id).group_by(
            SeoIssue.category,
            SeoIssue.severity,
            SeoIssue.status,
        )

        res = await self.db.execute(stmt)
        rows = res.all()

        by_category: Dict[str, int] = {}
        by_severity: Dict[str, int] = {}
        by_status: Dict[str, int] = {}
        total = 0

        for cat, sev, stat, cnt in rows:
            by_category[cat] = by_category.get(cat, 0) + cnt
            by_severity[sev] = by_severity.get(sev, 0) + cnt
            by_status[stat] = by_status.get(stat, 0) + cnt
            total += cnt

        return {
            "total_assessments": total,
            "actionable_findings": by_status.get("fail", 0) + by_status.get("warning", 0),
            "pass_count": by_status.get("pass", 0),
            "warning_count": by_status.get("warning", 0),
            "fail_count": by_status.get("fail", 0),
            "unknown_count": by_status.get("unknown", 0),
            "not_applicable_count": by_status.get("not_applicable", 0),
            "total_issues": total,
            "by_category": by_category,
            "by_severity": by_severity,
            "by_status": by_status,
            "rules_executed_count": total,
        }
