"""Crawl lifecycle service managing start transitions and crawler execution."""

import logging
from typing import Any, Dict, Optional
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.crawler.engine import CrawlEngine
from app.crawler.policies import CrawlConfig
from app.database.models import Audit, AuditMode, AuditStatus
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository

logger = logging.getLogger(__name__)


class CrawlService:
    """Manages crawl start transitions, worker orchestration, and persistence callbacks."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit_repo = AuditRepository(session)
        self.crawl_repo = CrawlRepository(session)

    async def start_audit(self, audit_id: uuid.UUID) -> Audit:
        """Transition an eligible audit from 'created' to 'queued'."""
        audit = await self.audit_repo.get_audit_by_id(audit_id)
        if not audit:
            raise NotFoundError(f"Audit '{audit_id}' was not found.")

        # Reject verified_owner audits until ownership verification is implemented
        if audit.mode == AuditMode.verified_owner.value:
            raise ConflictError(
                "Verified owner audits require domain ownership verification which is not yet supported."
            )

        # Only 'created' audits can be queued
        if audit.status != AuditStatus.created.value:
            raise ConflictError(
                f"Cannot start audit '{audit_id}'. Current status is '{audit.status}', but must be 'created'."
            )

        audit.status = AuditStatus.queued.value
        await self.session.commit()
        await self.session.refresh(audit)
        return audit

    async def execute_crawl(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        config: Optional[CrawlConfig] = None,
    ) -> None:
        """Run the crawling engine and handle progress, persistence, and terminal states."""
        audit = await self.audit_repo.get_audit_by_id(audit_id)
        if not audit:
            logger.error(f"Cannot execute crawl: audit '{audit_id}' does not exist.")
            return

        cfg = config or CrawlConfig(max_pages=audit.max_pages)

        # Callbacks
        async def on_page_persisted(page_data: Dict[str, Any], links_data: list):
            await self.crawl_repo.save_page(audit_id, page_data, links_data)

        async def on_sitemap_persisted(sitemap_data: Dict[str, Any]):
            await self.crawl_repo.save_sitemap(audit_id, sitemap_data)

        async def on_progress(progress: Dict[str, Any]):
            await self.crawl_repo.heartbeat(
                audit_id=audit_id,
                worker_token=worker_token,
                progress_json=progress,
                pages_crawled=progress.get("pages_crawled"),
                pages_discovered=progress.get("urls_discovered"),
            )

        async def is_cancelled() -> bool:
            return await self.crawl_repo.is_cancelled(audit_id)

        engine = CrawlEngine(
            start_url=audit.target_url,
            config=cfg,
            on_page_persisted=on_page_persisted,
            on_sitemap_persisted=on_sitemap_persisted,
            on_progress=on_progress,
            is_cancelled=is_cancelled,
        )

        try:
            summary = await engine.execute()

            # Check if cancelled
            if await is_cancelled():
                logger.info(f"Audit '{audit_id}' was cancelled during crawl.")
                await self.crawl_repo.release_job(
                    audit_id=audit_id,
                    worker_token=worker_token,
                    terminal_status=AuditStatus.cancelled,
                    progress_json=summary,
                )
                return

            # Determine terminal status
            if summary.get("pages_crawled", 0) > 0 and summary.get("pages_failed", 0) > 0:
                terminal_status = AuditStatus.partially_completed
            elif summary.get("pages_crawled", 0) > 0:
                terminal_status = AuditStatus.completed
            else:
                terminal_status = AuditStatus.failed

            await self.crawl_repo.release_job(
                audit_id=audit_id,
                worker_token=worker_token,
                terminal_status=terminal_status,
                progress_json=summary,
            )
            logger.info(f"Audit '{audit_id}' completed with status '{terminal_status.value}'.")

        except Exception as e:
            logger.exception(f"Unhandled error during audit '{audit_id}' crawl: {e}")
            await self.crawl_repo.release_job(
                audit_id=audit_id,
                worker_token=worker_token,
                terminal_status=AuditStatus.failed,
                error_message=str(e),
            )
