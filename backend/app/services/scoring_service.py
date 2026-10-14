"""Business logic orchestrating SEO Health Score calculation, staleness detection, and priorities."""

import uuid
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.models import Audit, CrawlPage, CrawlPageRender, SeoIssue
from app.repositories.scoring_repository import ScoringRepository
from app.scoring.engine import ScoringEngine, compute_input_fingerprint
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy
from app.services.issue_service import IssueService


class ScoringService:
    """Service orchestrating SEO Health Score calculation and prioritization."""

    def __init__(
        self,
        db: AsyncSession,
        policy: ScoringPolicy = DEFAULT_SCORING_POLICY,
    ) -> None:
        self.db = db
        self.policy = policy
        self.engine = ScoringEngine(policy=policy)
        self.repo = ScoringRepository(db)

    async def get_audit_or_404(self, audit_id: uuid.UUID) -> Audit:
        """Fetch audit by ID or raise HTTP 404."""
        stmt = select(Audit).where(Audit.id == audit_id)
        result = await self.db.execute(stmt)
        audit = result.scalar_one_or_none()
        if not audit:
            raise HTTPException(status_code=404, detail=f"Audit {audit_id} not found")
        return audit

    async def _gather_audit_evidence(
        self,
        audit_id: uuid.UUID,
    ) -> Tuple[int, int, int, List[Dict[str, Any]], bool]:
        """Fetch pages and evaluated issue assessments for scoring."""
        # 1. Pages counts
        pages_stmt = select(CrawlPage).where(CrawlPage.audit_id == audit_id)
        pages_res = await self.db.execute(pages_stmt)
        all_pages = pages_res.scalars().all()

        total_pages = len(all_pages)
        evaluated_pages = sum(1 for p in all_pages if p.fetch_status == "success" and p.http_status == 200)
        failed_pages = sum(1 for p in all_pages if p.fetch_status != "success" or (p.http_status and p.http_status >= 400))

        # Check renders
        renders_stmt = select(CrawlPageRender.id).where(CrawlPageRender.audit_id == audit_id).limit(1)
        has_renders = bool((await self.db.execute(renders_stmt)).first())

        # 2. Issues / rule assessments
        issues_stmt = select(SeoIssue).where(SeoIssue.audit_id == audit_id)
        issues_res = await self.db.execute(issues_stmt)
        issues = issues_res.scalars().all()

        evaluations = []
        for iss in issues:
            evaluations.append({
                "rule_id": iss.rule_id,
                "category": iss.category,
                "severity": iss.severity,
                "status": iss.status,
                "title": iss.title,
                "recommendation": iss.recommendation,
                "evidence": iss.evidence_json or {},
                "page_url": (iss.evidence_json or {}).get("page_url", ""), "crawl_page_id": iss.crawl_page_id,
                "is_sitewide": iss.category == "sitewide" or iss.rule_id.startswith("SITE_"),
            })

        return total_pages, evaluated_pages, failed_pages, evaluations, has_renders

    async def compute_score(
        self,
        audit_id: uuid.UUID,
        force: bool = False,
    ) -> Any:
        """Compute or recalculate SEO Health Scorecard and priority items idempotently."""
        audit = await self.get_audit_or_404(audit_id)

        # If audit has not been analyzed yet but has crawled pages, trigger analysis first
        total_p, eval_p, fail_p, evals, has_renders = await self._gather_audit_evidence(audit_id)
        if total_p > 0 and len(evals) == 0 and audit.status in ("completed", "analyzing", "partially_completed"):
            issue_svc = IssueService(self.db)
            await issue_svc.analyze_audit(audit_id)
            total_p, eval_p, fail_p, evals, has_renders = await self._gather_audit_evidence(audit_id)

        # Check idempotency: if scorecard exists and fingerprint matches current evidence
        existing_card = await self.repo.get_scorecard(audit_id)
        current_fp = compute_input_fingerprint(evals, total_p)

        if existing_card and not force:
            if existing_card.input_fingerprint == current_fp:
                return existing_card

        # Evaluate through pure scoring engine
        scorecard_data, priority_items = self.engine.evaluate_audit(
            audit_id=audit_id,
            total_pages=total_p,
            evaluated_pages=eval_p,
            failed_pages=fail_p,
            evaluations=evals,
            audit_status=audit.status,
            max_pages_limit=audit.max_pages,
            has_renders=has_renders,
        )

        return await self.repo.save_scorecard(scorecard_data, priority_items)

    async def get_scorecard(self, audit_id: uuid.UUID) -> Any:
        """Fetch scorecard, auto-detecting staleness against latest evidence."""
        await self.get_audit_or_404(audit_id)
        card = await self.repo.get_scorecard(audit_id)
        if not card:
            # Auto-compute if missing
            return await self.compute_score(audit_id)

        # Check staleness
        total_p, _, _, evals, _ = await self._gather_audit_evidence(audit_id)
        current_fp = compute_input_fingerprint(evals, total_p)
        if card.input_fingerprint != current_fp and card.overall_state != "stale":
            card.overall_state = "stale"
            await self.db.commit()
            await self.db.refresh(card)

        return card

    async def get_breakdown(self, audit_id: uuid.UUID) -> Dict[str, Any]:
        """Fetch detailed score breakdown and explainability."""
        card = await self.get_scorecard(audit_id)
        expl = card.explanation_json or {}
        return {
            "audit_id": audit_id,
            "overall_score": card.overall_score,
            "overall_state": card.overall_state,
            "score_label": card.score_label,
            "category_scores": card.category_scores_json or {},
            "top_deductions": expl.get("top_deductions", []),
            "formula": expl.get("formula", "35% On-Page + 40% Technical + 25% Site-Wide"),
            "disclaimer": expl.get("disclaimer", ""),
        }

    async def get_coverage(self, audit_id: uuid.UUID) -> Dict[str, Any]:
        """Fetch coverage metrics and assessment completeness."""
        card = await self.get_scorecard(audit_id)
        cov = card.coverage_json or {}
        return {
            "audit_id": audit_id,
            "score_state": card.overall_state,
            "coverage_ratio": cov.get("coverage_ratio", 0.0),
            "coverage_label": cov.get("coverage_label", "minimal"),
            "total_pages_crawled": cov.get("total_pages_crawled", 0),
            "pages_evaluated": cov.get("pages_evaluated", 0),
            "pages_failed": cov.get("pages_failed", 0),
            "rule_evaluations_total": cov.get("rule_evaluations_total", 0),
            "rule_family_completion": cov.get("rule_family_completion", {}),
            "has_rendering_evidence": cov.get("has_rendering_evidence", False),
            "crawl_limit_hit": cov.get("crawl_limit_hit", False),
            "details": cov,
        }

    async def get_priorities(
        self,
        audit_id: uuid.UUID,
        priority_tier: Optional[str] = None,
        category: Optional[str] = None,
        rule_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[Any], int, Dict[str, int]]:
        """Fetch filterable prioritized action items."""
        await self.get_audit_or_404(audit_id)
        # Ensure scorecard and priority items exist
        card = await self.repo.get_scorecard(audit_id)
        if not card:
            await self.compute_score(audit_id)

        return await self.repo.get_priority_items(
            audit_id=audit_id,
            priority_tier=priority_tier,
            category=category,
            rule_id=rule_id,
            limit=limit,
            offset=offset,
        )
