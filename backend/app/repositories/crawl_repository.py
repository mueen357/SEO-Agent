"""Repository for persistent crawl page, link, sitemap records, and worker leases."""

from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.models import Audit, AuditStatus, CrawlLink, CrawlPage, CrawlPageRender, CrawlSitemap

logger = logging.getLogger("crawl_repository")


class CrawlRepository:
    """Handles database persistence for discovered pages, links, sitemaps, renders, and worker state."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def save_page(
        self,
        audit_id: uuid.UUID,
        page_data: Dict[str, Any],
        links_data: List[Dict[str, Any]],
    ) -> CrawlPage:
        """Persist a CrawlPage record and its discovered links."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        page_id = page_data.get("id") or uuid.uuid4()
        if isinstance(page_id, str):
            page_id = uuid.UUID(page_id)

        page = CrawlPage(
            id=page_id,
            audit_id=audit_id,
            requested_url=page_data.get("requested_url", ""),
            final_url=page_data.get("final_url", ""),
            depth=page_data.get("depth", 0),
            fetch_status=page_data.get("fetch_status", "success"),
            http_status=page_data.get("http_status"),
            content_type=page_data.get("content_type"),
            response_time_ms=page_data.get("response_time_ms", 0),
            redirect_chain_json=page_data.get("redirect_chain_json", []),
            title=page_data.get("title"),
            meta_description=page_data.get("meta_description"),
            canonical_url=page_data.get("canonical_url"),
            meta_robots=page_data.get("meta_robots"),
            html_lang=page_data.get("html_lang"),
            headings_json=page_data.get("headings_json"),
            image_count=page_data.get("image_count", 0),
            missing_alt_count=page_data.get("missing_alt_count", 0),
            empty_alt_count=page_data.get("empty_alt_count", 0),
            internal_link_count=page_data.get("internal_link_count", 0),
            external_link_count=page_data.get("external_link_count", 0),
            content_hash=page_data.get("content_hash"),
            error_message=page_data.get("error_message"),
            fetched_at=page_data.get("fetched_at", datetime.now(timezone.utc)),
        )
        self.session.add(page)

        # Add links
        for ld in links_data:
            link = CrawlLink(
                id=uuid.uuid4(),
                audit_id=audit_id,
                source_page_id=page_id,
                destination_url=ld.get("destination_url", ""),
                link_text=ld.get("link_text", ""),
                internal=ld.get("internal", True),
                discovered_at=ld.get("discovered_at", datetime.now(timezone.utc)),
            )
            self.session.add(link)

        await self.session.commit()
        await self.session.refresh(page)
        return page

    async def save_page_render(
        self,
        audit_id: uuid.UUID,
        crawl_page_id: uuid.UUID,
        render_data: Dict[str, Any],
    ) -> CrawlPageRender:
        """Persist a CrawlPageRender record associated with a CrawlPage."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        if isinstance(crawl_page_id, str):
            crawl_page_id = uuid.UUID(crawl_page_id)

        render_id = render_data.get("id") or uuid.uuid4()
        if isinstance(render_id, str):
            render_id = uuid.UUID(render_id)

        render = CrawlPageRender(
            id=render_id,
            crawl_page_id=crawl_page_id,
            audit_id=audit_id,
            render_status=render_data.get("render_status", "success"),
            render_strategy=render_data.get("render_strategy", "HTTP_ONLY"),
            render_reason=render_data.get("render_reason"),
            evidence_json=render_data.get("evidence_json", {}),
            rendered_title=render_data.get("rendered_title"),
            rendered_meta_description=render_data.get("rendered_meta_description"),
            rendered_canonical_url=render_data.get("rendered_canonical_url"),
            rendered_meta_robots=render_data.get("rendered_meta_robots"),
            rendered_headings_json=render_data.get("rendered_headings_json", {}),
            rendered_image_count=render_data.get("rendered_image_count", 0),
            rendered_link_count=render_data.get("rendered_link_count", 0),
            comparison_json=render_data.get("comparison_json", {}),
            performance_metrics_json=render_data.get("performance_metrics_json", {}),
            screenshot_desktop_path=render_data.get("screenshot_desktop_path"),
            screenshot_mobile_path=render_data.get("screenshot_mobile_path"),
            error_message=render_data.get("error_message"),
            rendered_at=render_data.get("rendered_at", datetime.now(timezone.utc)),
        )
        self.session.add(render)
        await self.session.commit()
        await self.session.refresh(render)
        return render

    async def save_sitemap(
        self,
        audit_id: uuid.UUID,
        sitemap_data: Dict[str, Any],
    ) -> CrawlSitemap:
        """Persist a CrawlSitemap record."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        sm = CrawlSitemap(
            id=uuid.uuid4(),
            audit_id=audit_id,
            sitemap_url=sitemap_data.get("sitemap_url", ""),
            status=sitemap_data.get("status", "success"),
            url_count=sitemap_data.get("url_count", 0),
            error_message=sitemap_data.get("error_message"),
            discovered_at=datetime.now(timezone.utc),
        )
        self.session.add(sm)
        await self.session.commit()
        await self.session.refresh(sm)
        return sm

    async def get_pages(
        self,
        audit_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[CrawlPage], int]:
        """Query crawled pages for an audit with pagination and eagerly loaded render relationships."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        offset = (page - 1) * page_size

        total_stmt = select(func.count()).select_from(CrawlPage).where(CrawlPage.audit_id == audit_id)
        total_res = await self.session.execute(total_stmt)
        total = total_res.scalar_one()

        stmt = (
            select(CrawlPage)
            .options(selectinload(CrawlPage.render))
            .where(CrawlPage.audit_id == audit_id)
            .order_by(CrawlPage.fetched_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def get_sitemaps(self, audit_id: uuid.UUID) -> List[CrawlSitemap]:
        """Query discovered sitemaps for an audit."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        stmt = (
            select(CrawlSitemap)
            .where(CrawlSitemap.audit_id == audit_id)
            .order_by(CrawlSitemap.discovered_at.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # --- Worker Leasing & Atomic Job Claiming ---

    async def claim_next_job(
        self,
        worker_token: str,
        lease_seconds: int = 60,
    ) -> Optional[Audit]:
        """Atomically claim the next eligible queued or abandoned audit job."""
        now = datetime.now(timezone.utc)
        lease_expiration = now + timedelta(seconds=lease_seconds)

        stmt = (
            select(Audit)
            .where(
                (Audit.status == AuditStatus.queued.value)
                | (
                    (Audit.status == AuditStatus.crawling.value)
                    & (Audit.lease_expires_at != None)
                    & (Audit.lease_expires_at < now)
                )
            )
            .order_by(Audit.created_at.asc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        audit = result.scalar_one_or_none()

        if not audit:
            return None

        # Atomically update lease and status
        audit.status = AuditStatus.crawling.value
        audit.worker_token = worker_token
        audit.lease_expires_at = lease_expiration
        audit.heartbeat_at = now
        if not audit.started_at:
            audit.started_at = now

        await self.session.commit()
        await self.session.refresh(audit)
        return audit

    async def heartbeat(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        lease_seconds: int = 60,
        progress_json: Optional[Dict[str, Any]] = None,
        pages_crawled: Optional[int] = None,
        pages_discovered: Optional[int] = None,
    ) -> bool:
        """Renew job lease and persist progress. Returns False if job was cancelled or stolen."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        now = datetime.now(timezone.utc)
        stmt = select(Audit).where(Audit.id == audit_id)
        result = await self.session.execute(stmt)
        audit = result.scalar_one_or_none()

        if not audit:
            return False

        # If audit is cancelled, worker must stop immediately
        if audit.status == AuditStatus.cancelled.value:
            return False

        # If another worker stole the lease
        if audit.worker_token != worker_token:
            return False

        audit.heartbeat_at = now
        audit.lease_expires_at = now + timedelta(seconds=lease_seconds)
        if progress_json is not None:
            audit.progress_json = progress_json
        if pages_crawled is not None:
            audit.pages_crawled = pages_crawled
        if pages_discovered is not None:
            audit.pages_discovered = pages_discovered

        await self.session.commit()
        return True

    async def is_cancelled(self, audit_id: uuid.UUID) -> bool:
        """Check whether the audit was cancelled by the user."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        stmt = select(Audit.status).where(Audit.id == audit_id)
        result = await self.session.execute(stmt)
        status = result.scalar_one_or_none()
        return status == AuditStatus.cancelled.value

    async def release_job(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        terminal_status: AuditStatus,
        progress_json: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ) -> bool:
        """Complete or fail a job, ensuring cancelled jobs are not overwritten as completed."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        stmt = select(Audit).where(Audit.id == audit_id)
        result = await self.session.execute(stmt)
        audit = result.scalar_one_or_none()

        if not audit:
            return False

        # If job was cancelled by user, retain cancelled status
        if audit.status == AuditStatus.cancelled.value:
            await self.session.commit()
            return True

        audit.status = terminal_status.value
        audit.completed_at = datetime.now(timezone.utc)
        audit.worker_token = None
        audit.lease_expires_at = None
        if error_message:
            audit.error_message = error_message
        if progress_json:
            audit.progress_json = progress_json
            if "pages_crawled" in progress_json:
                audit.pages_crawled = progress_json["pages_crawled"]
            if "urls_discovered" in progress_json:
                audit.pages_discovered = progress_json["urls_discovered"]

        await self.session.commit()
        return True
