"""Crawl lifecycle service managing start transitions, crawler execution, and dynamic rendering."""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import get_settings
from app.core.errors import ConflictError, NotFoundError
from app.crawler.engine import CrawlEngine
from app.crawler.policies import CrawlConfig
from app.database.models import Audit, AuditMode, AuditStatus, CrawlPage
from app.database.session import get_session_factory
from app.renderer.browser_manager import BrowserManager
from app.renderer.render_detector import RenderDetector
from app.renderer.render_policy import RenderMode, RenderPolicy, RenderStrategy
from app.renderer.renderer import PageRenderer
from app.repositories.audit_repository import AuditRepository
from app.repositories.crawl_repository import CrawlRepository

logger = logging.getLogger("crawl_service")


class CrawlService:
    """Manages crawl start transitions, worker orchestration, independent heartbeats, and rendering."""

    def __init__(
        self,
        session: AsyncSession,
        session_factory: Optional[async_sessionmaker[AsyncSession]] = None,
    ) -> None:
        self.session = session
        self.session_factory = session_factory
        self.audit_repo = AuditRepository(session)
        self.crawl_repo = CrawlRepository(session)

    async def start_audit(self, audit_id: uuid.UUID) -> Audit:
        """Transition an eligible audit from 'created' to 'queued'."""
        audit = await self.audit_repo.get_audit_by_id(audit_id)
        if not audit:
            raise NotFoundError(f"Audit '{audit_id}' was not found.")

        if audit.mode == AuditMode.verified_owner.value:
            raise ConflictError(
                "Verified owner audits require domain ownership verification which is not yet supported."
            )

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
        render_policy: Optional[RenderPolicy] = None,
        allow_local_fixtures: bool = False,
        release_on_completion: bool = True,
        fetcher: Optional[Any] = None,
    ) -> Any:
        """Run crawling engine with optional rendering, independent lease heartbeat, and status management."""
        audit = await self.audit_repo.get_audit_by_id(audit_id)
        if not audit:
            logger.error(f"Cannot execute crawl: audit '{audit_id}' does not exist.")
            return

        settings = get_settings()
        cfg = config or CrawlConfig(max_pages=audit.max_pages)

        # Parse audit configuration overrides if present
        audit_cfg = audit.configuration_json or {}
        rm_str = audit_cfg.get("render_javascript", settings.render_javascript_mode)
        try:
            rm_enum = RenderMode(rm_str)
        except ValueError:
            rm_enum = RenderMode.auto

        allow_pub_render = audit_cfg.get("allow_public_rendering", settings.allow_public_rendering)
        enable_shots = audit_cfg.get("enable_screenshots", settings.enable_screenshots)

        pol = render_policy or RenderPolicy(
            render_mode=rm_enum,
            navigation_timeout=settings.render_navigation_timeout_seconds,
            render_timeout=settings.render_total_timeout_seconds,
            hydration_wait=settings.render_hydration_wait_seconds,
            max_dom_size_bytes=settings.render_max_dom_size_bytes,
            max_concurrent_contexts=settings.render_max_concurrent_contexts,
            enable_screenshots=enable_shots,
            allow_public_rendering=allow_pub_render,
        )

        browser_manager = BrowserManager(
            max_concurrent_contexts=pol.max_concurrent_contexts,
            allow_local_fixtures=allow_local_fixtures,
        )
        page_renderer = PageRenderer(browser_manager=browser_manager, policy=pol)

        # Start independent background heartbeat task (every 15s to keep 60s lease fresh)
        heartbeat_stop = asyncio.Event()

        async def _heartbeat_loop():
            while not heartbeat_stop.is_set():
                try:
                    await asyncio.sleep(15.0)
                    if heartbeat_stop.is_set():
                        break
                    # Use a dedicated session for background heartbeat to NEVER share AsyncSession across concurrent tasks
                    sf = self.session_factory or get_session_factory()
                    async with sf() as hb_session:
                        hb_repo = CrawlRepository(hb_session)
                        valid = await hb_repo.heartbeat(
                            audit_id=audit_id,
                            worker_token=worker_token,
                            lease_seconds=60,
                        )
                        if not valid:
                            logger.warning(f"Worker heartbeat rejected or audit '{audit_id}' cancelled/overtaken.")
                            break
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.debug(f"Error during independent lease heartbeat: {e}")

        heartbeat_task = asyncio.create_task(_heartbeat_loop())

        async def is_cancelled() -> bool:
            return await self.crawl_repo.is_cancelled(audit_id)

        # Callbacks
        async def on_page_persisted(page_data: Dict[str, Any], links_data: list):
            # 1. Save CrawlPage record
            page = await self.crawl_repo.save_page(audit_id, page_data, links_data)

            # 2. Check if cancelled before rendering
            if await is_cancelled():
                return

            # 3. Smart JavaScript detection
            raw_html = page_data.get("raw_html", "")
            decision = RenderDetector.detect(
                raw_html=raw_html,
                http_status=page_data.get("http_status"),
                content_type=page_data.get("content_type"),
                allow_public_rendering=pol.allow_public_rendering or allow_local_fixtures,
                render_mode=pol.render_mode,
            )

            # 4. Handle Rendering Decision
            if decision.strategy in (RenderStrategy.RENDER_REQUIRED, RenderStrategy.RENDER_RECOMMENDED):
                render_res, rendered_parsed, comparison = await page_renderer.render_page(
                    url=page.requested_url,
                    audit_id=audit_id,
                    page_id=page.id,
                    decision=decision,
                    raw_extraction=page_data,
                )

                render_dict = {
                    "render_status": render_res.status,
                    "render_strategy": decision.strategy.value,
                    "render_reason": decision.reason,
                    "evidence_json": decision.evidence,
                    "rendered_title": rendered_parsed.title if rendered_parsed else None,
                    "rendered_meta_description": rendered_parsed.meta_description if rendered_parsed else None,
                    "rendered_canonical_url": rendered_parsed.canonical_url if rendered_parsed else None,
                    "rendered_meta_robots": rendered_parsed.meta_robots if rendered_parsed else None,
                    "rendered_headings_json": rendered_parsed.headings_json if rendered_parsed else {},
                    "rendered_image_count": rendered_parsed.image_count if rendered_parsed else 0,
                    "rendered_link_count": (rendered_parsed.internal_link_count + rendered_parsed.external_link_count) if rendered_parsed else 0,
                    "comparison_json": comparison or {},
                    "performance_metrics_json": render_res.performance_metrics or {},
                    "screenshot_desktop_path": render_res.screenshot_desktop_path,
                    "screenshot_mobile_path": render_res.screenshot_mobile_path,
                    "error_message": render_res.error_message,
                    "rendered_at": datetime.now(timezone.utc),
                }
                await self.crawl_repo.save_page_render(audit_id, page.id, render_dict)

            elif decision.strategy == RenderStrategy.RENDER_UNAVAILABLE:
                render_dict = {
                    "render_status": "unavailable",
                    "render_strategy": decision.strategy.value,
                    "render_reason": decision.reason,
                    "evidence_json": decision.evidence,
                    "comparison_json": {},
                    "performance_metrics_json": {},
                    "rendered_at": datetime.now(timezone.utc),
                }
                await self.crawl_repo.save_page_render(audit_id, page.id, render_dict)

            else:  # HTTP_ONLY
                render_dict = {
                    "render_status": "skipped",
                    "render_strategy": decision.strategy.value,
                    "render_reason": decision.reason,
                    "evidence_json": decision.evidence,
                    "comparison_json": {},
                    "performance_metrics_json": {},
                    "rendered_at": datetime.now(timezone.utc),
                }
                await self.crawl_repo.save_page_render(audit_id, page.id, render_dict)

        async def on_sitemap_persisted(sitemap_data: Dict[str, Any]):
            await self.crawl_repo.save_sitemap(audit_id, sitemap_data)

        async def on_progress(progress: Dict[str, Any]):
            pipeline_update = {
                "pipeline": {
                    "stages": {
                        "crawling": {
                            "status": "running",
                            "pages_crawled": progress.get("pages_crawled", 0),
                            "urls_discovered": progress.get("urls_discovered", 0),
                        }
                    }
                },
                "crawl": progress,
            }
            await self.crawl_repo.heartbeat(
                audit_id=audit_id,
                worker_token=worker_token,
                lease_seconds=60,
                progress_json=pipeline_update,
                pages_crawled=progress.get("pages_crawled"),
                pages_discovered=progress.get("urls_discovered"),
            )

        engine = CrawlEngine(
            start_url=audit.target_url,
            config=cfg,
            fetcher=fetcher,
            on_page_persisted=on_page_persisted,
            on_sitemap_persisted=on_sitemap_persisted,
            on_progress=on_progress,
            is_cancelled=is_cancelled,
        )

        # Pre-populate engine queue seen URLs from existing pages to ensure restarts / retries don't re-fetch
        existing_pages_stmt = select(CrawlPage.requested_url).where(CrawlPage.audit_id == audit_id)
        existing_pages_res = await self.session.execute(existing_pages_stmt)
        for u in existing_pages_res.scalars().all():
            engine.queue._seen_urls.add(u)
        engine.pages_crawled = len(engine.queue._seen_urls)

        try:
            summary = await engine.execute()

            # Stop heartbeat loop
            heartbeat_stop.set()
            heartbeat_task.cancel()

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

            if not release_on_completion and terminal_status in (AuditStatus.completed, AuditStatus.partially_completed):
                await self.crawl_repo.heartbeat(
                    audit_id=audit_id,
                    worker_token=worker_token,
                    lease_seconds=60,
                    progress_json=summary,
                    pages_crawled=summary.get("pages_crawled"),
                    pages_discovered=summary.get("urls_discovered"),
                )
                logger.info(f"Audit '{audit_id}' crawl finished ({summary.get('pages_crawled', 0)} pages); retaining worker lease for pipeline orchestration.")
                return summary

            await self.crawl_repo.release_job(
                audit_id=audit_id,
                worker_token=worker_token,
                terminal_status=terminal_status,
                progress_json=summary,
            )
            logger.info(f"Audit '{audit_id}' completed with status '{terminal_status.value}'.")
            return summary

        except Exception as e:
            logger.exception(f"Unhandled error during audit '{audit_id}' crawl: {e}")
            heartbeat_stop.set()
            heartbeat_task.cancel()
            from app.services.audit_pipeline_service import sanitize_pipeline_error
            sanitized = sanitize_pipeline_error(e, stage="crawling")
            await self.crawl_repo.release_job(
                audit_id=audit_id,
                worker_token=worker_token,
                terminal_status=AuditStatus.failed,
                error_message=f"Crawling failed: {sanitized}",
            )
            raise
        finally:
            heartbeat_stop.set()
            if not heartbeat_task.done():
                heartbeat_task.cancel()
            await browser_manager.close()
