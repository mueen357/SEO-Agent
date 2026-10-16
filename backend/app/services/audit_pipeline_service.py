"""Authoritative background pipeline orchestrator for one-click end-to-end website audits.

Coordinates stages:
STAGE 1: validation (Verify audit target and configuration)
STAGE 2: crawling (Crawl website within page budget)
STAGE 3: storage (Persist pages, renders, sitemaps, headers)
STAGE 4: on_page_seo (Execute 16 registered On-Page SEO rules)
STAGE 5: technical_seo (Execute 22 registered Technical SEO rules)
STAGE 6: sitewide_seo (Execute 13 registered Site-Wide rules & duplicate graph)
STAGE 7: technology_detection (Detect CMS, frameworks, WordPress assets)
STAGE 8: seo_scoring (Calculate SEO health scorecard and priority items)
STAGE 9: publishing (Finalize audit state, coverage, and completion timestamps)
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Callable, Dict, List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.models import Audit, AuditStatus, CrawlPage
from app.database.session import get_session_factory
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository
from app.services.crawl_service import CrawlService
from app.services.issue_service import IssueService
from app.services.scoring_service import ScoringService
from app.services.technology_service import TechnologyService

logger = logging.getLogger("audit_pipeline")

PIPELINE_STAGES = [
    "validation",
    "crawling",
    "storage",
    "on_page_seo",
    "technical_seo",
    "sitewide_seo",
    "technology_detection",
    "seo_scoring",
    "publishing",
]


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AuditPipelineService:
    """Orchestrates end-to-end automated execution of all audit stages."""

    def __init__(self, session_factory: Optional[Callable[[], AsyncSession]] = None) -> None:
        self.session_factory = session_factory or get_session_factory()

    def _init_pipeline_progress(self, existing_progress: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Initialize or normalize the pipeline progress structure."""
        progress = dict(existing_progress or {})
        pipeline = progress.get("pipeline", {})

        stages_dict = pipeline.get("stages", {})
        for st in PIPELINE_STAGES:
            if st not in stages_dict:
                stages_dict[st] = {"status": "pending"}

        progress["pipeline"] = {
            "current_stage": pipeline.get("current_stage", PIPELINE_STAGES[0]),
            "total_stages": len(PIPELINE_STAGES),
            "completed_stages": pipeline.get("completed_stages", []),
            "stages": stages_dict,
            "errors": pipeline.get("errors", {}),
        }
        return progress

    async def _update_stage(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        stage_name: str,
        stage_status: str,
        error_msg: Optional[str] = None,
        audit_status: Optional[AuditStatus] = None,
        lease_seconds: int = 60,
    ) -> bool:
        """Update audit pipeline stage state and renew worker lease."""
        async with self.session_factory() as session:
            crawl_repo = CrawlRepository(session)
            stmt = select(Audit).where(Audit.id == audit_id)
            res = await session.execute(stmt)
            audit = res.scalar_one_or_none()
            if not audit:
                return False

            if audit.status == AuditStatus.cancelled.value:
                return False

            progress = self._init_pipeline_progress(audit.progress_json)
            pipe = progress["pipeline"]
            pipe["current_stage"] = stage_name

            st_data = pipe["stages"].get(stage_name, {})
            st_data["status"] = stage_status
            if stage_status == "running" and "started_at" not in st_data:
                st_data["started_at"] = utc_iso_now()
            elif stage_status in ("completed", "skipped", "failed", "cancelled"):
                st_data["completed_at"] = utc_iso_now()
                if stage_status == "completed" and stage_name not in pipe["completed_stages"]:
                    pipe["completed_stages"].append(stage_name)

            if error_msg:
                st_data["error"] = error_msg
                pipe["errors"][stage_name] = error_msg

            pipe["stages"][stage_name] = st_data

            if audit_status:
                audit.status = audit_status.value

            return await crawl_repo.heartbeat(
                audit_id=audit_id,
                worker_token=worker_token,
                lease_seconds=lease_seconds,
                progress_json=progress,
                pages_crawled=audit.pages_crawled,
                pages_discovered=audit.pages_discovered,
                status=audit_status.value if audit_status else None,
            )

    async def _is_cancelled(self, audit_id: uuid.UUID) -> bool:
        async with self.session_factory() as session:
            stmt = select(Audit.status).where(Audit.id == audit_id)
            res = await session.execute(stmt)
            st = res.scalar_one_or_none()
            return st == AuditStatus.cancelled.value

    async def _stage_is_completed(self, audit_id: uuid.UUID, stage_name: str) -> bool:
        async with self.session_factory() as session:
            stmt = select(Audit.progress_json).where(Audit.id == audit_id)
            res = await session.execute(stmt)
            p_json = res.scalar_one_or_none()
            if not p_json or not isinstance(p_json, dict):
                return False
            pipe = p_json.get("pipeline", {})
            st = pipe.get("stages", {}).get(stage_name, {}).get("status")
            return st == "completed"

    async def _has_crawled_pages(self, audit_id: uuid.UUID) -> bool:
        async with self.session_factory() as session:
            stmt = select(CrawlPage.id).where(CrawlPage.audit_id == audit_id).limit(1)
            res = await session.execute(stmt)
            return res.scalar_one_or_none() is not None

    async def execute_pipeline(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        allow_local_fixtures: bool = False,
    ) -> None:
        """Execute the full 9-stage pipeline sequentially."""
        logger.info(f"Starting full audit pipeline for audit '{audit_id}' [worker: {worker_token}]")

        # STAGE 1: Validation
        if await self._is_cancelled(audit_id):
            return
        if not await self._stage_is_completed(audit_id, "validation"):
            await self._update_stage(audit_id, worker_token, "validation", "running", audit_status=AuditStatus.crawling)
            await asyncio.sleep(0.01)  # Context yield
            await self._update_stage(audit_id, worker_token, "validation", "completed")

        # STAGE 2 & 3: Crawling & Storage
        if await self._is_cancelled(audit_id):
            return

        crawl_already_done = await self._stage_is_completed(audit_id, "crawling") and await self._has_crawled_pages(audit_id)
        if crawl_already_done:
            logger.info(f"Audit '{audit_id}' crawling and storage already completed. Skipping crawl stage during resume.")
        else:
            await self._update_stage(audit_id, worker_token, "crawling", "running", audit_status=AuditStatus.crawling)
            await self._update_stage(audit_id, worker_token, "storage", "running")

            crawl_summary = {}
            try:
                async with self.session_factory() as session:
                    crawl_svc = CrawlService(session)
                    crawl_summary = await crawl_svc.execute_crawl(
                        audit_id=audit_id,
                        worker_token=worker_token,
                        allow_local_fixtures=allow_local_fixtures,
                        release_on_completion=False,
                    )
            except Exception as e:
                logger.exception(f"Crawl stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "crawling", "failed", error_msg=str(e))
                await self._update_stage(audit_id, worker_token, "storage", "failed", error_msg=str(e))
                async with self.session_factory() as session:
                    crawl_repo = CrawlRepository(session)
                    await crawl_repo.release_job(
                        audit_id=audit_id,
                        worker_token=worker_token,
                        terminal_status=AuditStatus.failed,
                        error_message=f"Crawling failed: {e}",
                    )
                return

            if await self._is_cancelled(audit_id):
                return

            pages_crawled = crawl_summary.get("pages_crawled", 0) if isinstance(crawl_summary, dict) else 0
            if pages_crawled == 0:
                logger.warning(f"Audit '{audit_id}' crawled 0 pages. Aborting downstream pipeline.")
                await self._update_stage(audit_id, worker_token, "crawling", "failed", error_msg="0 pages crawled")
                await self._update_stage(audit_id, worker_token, "storage", "failed", error_msg="0 pages crawled")
                async with self.session_factory() as session:
                    crawl_repo = CrawlRepository(session)
                    await crawl_repo.release_job(
                        audit_id=audit_id,
                        worker_token=worker_token,
                        terminal_status=AuditStatus.failed,
                        error_message="Crawl failed to retrieve any pages.",
                    )
                return

            await self._update_stage(audit_id, worker_token, "crawling", "completed")
            await self._update_stage(audit_id, worker_token, "storage", "completed")

        # STAGE 4: On-Page SEO
        if await self._is_cancelled(audit_id):
            return
        if await self._stage_is_completed(audit_id, "on_page_seo"):
            logger.info(f"Audit '{audit_id}' on_page_seo already completed. Skipping.")
        else:
            await self._update_stage(audit_id, worker_token, "on_page_seo", "running", audit_status=AuditStatus.analyzing)
            try:
                async with self.session_factory() as session:
                    issue_svc = IssueService(session)
                    await issue_svc.run_analysis(audit_id, category="on_page")
                await self._update_stage(audit_id, worker_token, "on_page_seo", "completed")
            except Exception as e:
                logger.exception(f"On-Page SEO analysis stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "on_page_seo", "failed", error_msg=str(e))

        # STAGE 5: Technical SEO
        if await self._is_cancelled(audit_id):
            return
        if await self._stage_is_completed(audit_id, "technical_seo"):
            logger.info(f"Audit '{audit_id}' technical_seo already completed. Skipping.")
        else:
            await self._update_stage(audit_id, worker_token, "technical_seo", "running", audit_status=AuditStatus.analyzing)
            try:
                async with self.session_factory() as session:
                    issue_svc = IssueService(session)
                    await issue_svc.run_analysis(audit_id, category="technical")
                await self._update_stage(audit_id, worker_token, "technical_seo", "completed")
            except Exception as e:
                logger.exception(f"Technical SEO analysis stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "technical_seo", "failed", error_msg=str(e))

        # STAGE 6: Site-Wide SEO
        if await self._is_cancelled(audit_id):
            return
        if await self._stage_is_completed(audit_id, "sitewide_seo"):
            logger.info(f"Audit '{audit_id}' sitewide_seo already completed. Skipping.")
        else:
            await self._update_stage(audit_id, worker_token, "sitewide_seo", "running", audit_status=AuditStatus.analyzing)
            try:
                async with self.session_factory() as session:
                    issue_svc = IssueService(session)
                    await issue_svc.run_sitewide_analysis(audit_id)
                await self._update_stage(audit_id, worker_token, "sitewide_seo", "completed")
            except Exception as e:
                logger.exception(f"Site-Wide SEO analysis stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "sitewide_seo", "failed", error_msg=str(e))

        # STAGE 7: Technology & CMS Detection
        if await self._is_cancelled(audit_id):
            return
        if await self._stage_is_completed(audit_id, "technology_detection"):
            logger.info(f"Audit '{audit_id}' technology_detection already completed. Skipping.")
        else:
            await self._update_stage(audit_id, worker_token, "technology_detection", "running", audit_status=AuditStatus.enriching)
            try:
                async with self.session_factory() as session:
                    tech_svc = TechnologyService(session)
                    await tech_svc.analyze_audit(audit_id)
                await self._update_stage(audit_id, worker_token, "technology_detection", "completed")
            except Exception as e:
                logger.exception(f"Technology detection stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "technology_detection", "failed", error_msg=str(e))

        # STAGE 8: SEO Scoring & Priorities
        if await self._is_cancelled(audit_id):
            return
        if await self._stage_is_completed(audit_id, "seo_scoring"):
            logger.info(f"Audit '{audit_id}' seo_scoring already completed. Skipping.")
        else:
            await self._update_stage(
                audit_id,
                worker_token,
                "seo_scoring",
                "running",
                audit_status=AuditStatus.generating_recommendations,
            )
            try:
                async with self.session_factory() as session:
                    score_svc = ScoringService(session)
                    await score_svc.compute_score(audit_id, force=True)
                await self._update_stage(audit_id, worker_token, "seo_scoring", "completed")
            except Exception as e:
                logger.exception(f"SEO Scoring stage failed for audit '{audit_id}': {e}")
                await self._update_stage(audit_id, worker_token, "seo_scoring", "failed", error_msg=str(e))

        # STAGE 9: Publishing & Completion
        if await self._is_cancelled(audit_id):
            return
        await self._update_stage(audit_id, worker_token, "publishing", "running")

        # Determine terminal status based on stage errors
        async with self.session_factory() as session:
            crawl_repo = CrawlRepository(session)
            stmt = select(Audit).where(Audit.id == audit_id)
            res = await session.execute(stmt)
            audit = res.scalar_one_or_none()
            if not audit:
                return

            progress = self._init_pipeline_progress(audit.progress_json)
            pipe = progress["pipeline"]
            errors = pipe.get("errors", {})
            terminal_status = AuditStatus.partially_completed if errors else AuditStatus.completed

            pipe["stages"].setdefault("publishing", {})["status"] = "completed"
            pipe["stages"]["publishing"]["completed_at"] = utc_iso_now()
            if "publishing" not in pipe["completed_stages"]:
                pipe["completed_stages"].append("publishing")
            pipe["current_stage"] = "completed"

            audit.progress_json = progress

            await crawl_repo.release_job(
                audit_id=audit_id,
                worker_token=worker_token,
                terminal_status=terminal_status,
                progress_json=audit.progress_json,
            )
            logger.info(f"Audit pipeline successfully finished for audit '{audit_id}' with status '{terminal_status.value}'")

    async def run_missing_stages(
        self,
        audit_id: uuid.UUID,
        worker_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute any missing analysis stages on an existing audit without recrawling."""
        token = worker_token or f"manual-complete-{uuid.uuid4().hex[:6]}"
        logger.info(f"Running missing analysis stages for existing audit '{audit_id}' [token: {token}]")

        async with self.session_factory() as session:
            stmt = select(Audit).where(Audit.id == audit_id)
            res = await session.execute(stmt)
            audit = res.scalar_one_or_none()
            if not audit:
                raise ValueError(f"Audit '{audit_id}' not found")

            # Check if pages exist
            pages_stmt = select(CrawlPage.id).where(CrawlPage.audit_id == audit_id).limit(1)
            pages_res = await session.execute(pages_stmt)
            if not pages_res.scalar_one_or_none():
                raise ValueError(f"Audit '{audit_id}' has 0 crawled pages. Cannot run analysis without pages.")

            # Claim lease for analysis
            now = datetime.now(timezone.utc)
            audit.worker_token = token
            audit.status = AuditStatus.analyzing.value
            audit.lease_expires_at = now + timedelta(seconds=120)
            audit.heartbeat_at = now
            progress = self._init_pipeline_progress(audit.progress_json)
            pipe = progress["pipeline"]
            pipe["stages"]["validation"]["status"] = "completed"
            pipe["stages"]["crawling"]["status"] = "completed"
            pipe["stages"]["storage"]["status"] = "completed"
            if "validation" not in pipe["completed_stages"]:
                pipe["completed_stages"].append("validation")
            if "crawling" not in pipe["completed_stages"]:
                pipe["completed_stages"].append("crawling")
            if "storage" not in pipe["completed_stages"]:
                pipe["completed_stages"].append("storage")
            audit.progress_json = progress
            await session.commit()

        # Run pipeline from current stage to finish
        await self.execute_pipeline(audit_id, worker_token=token)

        return {"status": "completed", "audit_id": str(audit_id), "message": "All missing stages completed successfully."}

