"""Repository for persistent crawl page, link, sitemap records, and worker leases."""

from datetime import datetime, timedelta, timezone
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
import uuid
from sqlalchemy import func, select, update, case, or_, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.crawler.normalizer import normalize_url
from app.database.models import Audit, AuditStatus, CrawlLink, CrawlPage, CrawlPageRender, CrawlSitemap

logger = logging.getLogger("crawl_repository")


def safe_exception_summary(e: Exception) -> str:
    """Extract a safe, non-sensitive diagnostic summary from an exception.

    Prevents leakage of raw SQL queries, bound parameters (e.g. HTML content, auth tokens,
    cookies, headers), table internals, or file system paths into log files.
    """
    cls_name = type(e).__name__
    orig = getattr(e, "orig", None)
    if orig is not None:
        orig_str = str(orig)
        orig_cls = type(orig).__name__
        if "UNIQUE constraint failed" in orig_str:
            match = re.search(r"UNIQUE constraint failed:\s*([a-zA-Z0-9_., ]+)", orig_str)
            target = match.group(1).strip() if match else "unique_constraint"
            return f"{cls_name}: UNIQUE constraint failed ({target})"
        if "FOREIGN KEY constraint failed" in orig_str:
            return f"{cls_name}: FOREIGN KEY constraint failed"
        if "CHECK constraint failed" in orig_str:
            return f"{cls_name}: CHECK constraint failed"
        return f"{cls_name} ({orig_cls})"
    return cls_name


def _safe_merge_progress_json(
    existing: Optional[Dict[str, Any]],
    incoming: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Safely deep-merge incoming progress updates into existing progress JSON without losing pipeline or stage state."""
    base = dict(existing or {})
    if not incoming:
        return base

    for key, val in incoming.items():
        if key == "pipeline" and isinstance(val, dict) and isinstance(base.get("pipeline"), dict):
            base_pipe = dict(base["pipeline"])
            for pk, pv in val.items():
                if pk == "stages" and isinstance(pv, dict) and isinstance(base_pipe.get("stages"), dict):
                    merged_stages = dict(base_pipe["stages"])
                    for sk, sv in pv.items():
                        if isinstance(sv, dict) and isinstance(merged_stages.get(sk), dict):
                            stage_entry = dict(merged_stages[sk])
                            stage_entry.update(sv)
                            merged_stages[sk] = stage_entry
                        else:
                            merged_stages[sk] = sv
                    base_pipe["stages"] = merged_stages
                elif pk == "completed_stages" and isinstance(pv, list) and isinstance(base_pipe.get("completed_stages"), list):
                    comp_list = list(base_pipe["completed_stages"])
                    for st_item in pv:
                        if st_item not in comp_list:
                            comp_list.append(st_item)
                    base_pipe["completed_stages"] = comp_list
                elif pk == "errors" and isinstance(pv, dict) and isinstance(base_pipe.get("errors"), dict):
                    err_dict = dict(base_pipe["errors"])
                    err_dict.update(pv)
                    base_pipe["errors"] = err_dict
                else:
                    base_pipe[pk] = pv
            base["pipeline"] = base_pipe
        else:
            base[key] = val

    return base


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
        """Persist a CrawlPage record and its discovered links idempotently.
        
        Guarantees that duplicate callbacks, engine retries, or replayed pages
        never cause UNIQUE constraint primary key or (audit_id, requested_url) collisions,
        and strictly enforces that foreign-audit IDs are rejected.
        """
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        requested_url = page_data.get("requested_url", "")

        # Define explicit page identity within an audit:
        # If an explicit page ID is supplied in page_data, verify audit ownership;
        # otherwise, compute a deterministic UUID5 from (audit_id, normalized_url)
        # to ensure retries, replays, or callbacks never generate colliding random UUIDs.
        normalized_req_url = normalize_url(requested_url) or requested_url
        raw_page_id = page_data.get("id")
        if raw_page_id:
            page_id = uuid.UUID(raw_page_id) if isinstance(raw_page_id, str) else raw_page_id
            # Verify explicit page ID does not collide with a foreign audit record
            foreign_check = select(CrawlPage.audit_id).where(CrawlPage.id == page_id)
            res_foreign = await self.session.execute(foreign_check)
            existing_audit_id = res_foreign.scalar_one_or_none()
            if existing_audit_id is not None and existing_audit_id != audit_id:
                raise ValueError(
                    f"Cross-audit record isolation violation: explicit page id '{page_id}' "
                    f"belongs to foreign audit '{existing_audit_id}', not '{audit_id}'"
                )
        else:
            page_id = uuid.uuid5(audit_id, normalized_req_url)

        # Check if page already exists within the target audit by primary key ID or (audit_id, requested_url)
        find_stmt = (
            select(CrawlPage)
            .options(selectinload(CrawlPage.links))
            .where(
                CrawlPage.audit_id == audit_id,
                or_(
                    CrawlPage.id == page_id,
                    CrawlPage.requested_url == requested_url,
                ),
            )
        )
        res = await self.session.execute(find_stmt)
        existing_page = res.scalar_one_or_none()

        if existing_page:
            # Update mutable fields idempotently without deleting or duplicating
            existing_page.final_url = page_data.get("final_url", existing_page.final_url)
            existing_page.depth = page_data.get("depth", existing_page.depth)
            existing_page.fetch_status = page_data.get("fetch_status", existing_page.fetch_status)
            existing_page.http_status = page_data.get("http_status", existing_page.http_status)
            existing_page.content_type = page_data.get("content_type", existing_page.content_type)
            existing_page.response_time_ms = page_data.get("response_time_ms", existing_page.response_time_ms)
            existing_page.redirect_chain_json = page_data.get("redirect_chain_json", existing_page.redirect_chain_json)
            existing_page.title = page_data.get("title", existing_page.title)
            existing_page.meta_description = page_data.get("meta_description", existing_page.meta_description)
            existing_page.canonical_url = page_data.get("canonical_url", existing_page.canonical_url)
            existing_page.canonical_tag_count = page_data.get("canonical_tag_count", existing_page.canonical_tag_count)
            existing_page.canonical_hrefs_json = page_data.get("canonical_hrefs_json", existing_page.canonical_hrefs_json)
            existing_page.normalized_main_text_hash = page_data.get("normalized_main_text_hash", existing_page.normalized_main_text_hash)
            existing_page.main_text_simhash = page_data.get("main_text_simhash", existing_page.main_text_simhash)
            existing_page.main_text_word_count = page_data.get("main_text_word_count", existing_page.main_text_word_count)
            existing_page.main_text_character_count = page_data.get("main_text_character_count", existing_page.main_text_character_count)
            existing_page.extraction_source = page_data.get("extraction_source", existing_page.extraction_source)
            existing_page.extraction_version = page_data.get("extraction_version", existing_page.extraction_version)
            existing_page.content_quality_status = page_data.get("content_quality_status", existing_page.content_quality_status)
            existing_page.headers_json = page_data.get("headers_json", existing_page.headers_json)
            existing_page.meta_robots = page_data.get("meta_robots", existing_page.meta_robots)
            existing_page.html_lang = page_data.get("html_lang", existing_page.html_lang)
            existing_page.headings_json = page_data.get("headings_json", existing_page.headings_json)
            existing_page.image_count = page_data.get("image_count", existing_page.image_count)
            existing_page.missing_alt_count = page_data.get("missing_alt_count", existing_page.missing_alt_count)
            existing_page.empty_alt_count = page_data.get("empty_alt_count", existing_page.empty_alt_count)
            existing_page.internal_link_count = page_data.get("internal_link_count", existing_page.internal_link_count)
            existing_page.external_link_count = page_data.get("external_link_count", existing_page.external_link_count)
            existing_page.content_hash = page_data.get("content_hash", existing_page.content_hash)
            existing_page.technology_evidence_json = page_data.get("technology_evidence_json", existing_page.technology_evidence_json)
            existing_page.error_message = page_data.get("error_message", existing_page.error_message)
            existing_page.fetched_at = page_data.get("fetched_at", existing_page.fetched_at)

            # Idempotently merge discovered links
            existing_dests = {l.destination_url for l in existing_page.links}
            for ld in links_data:
                dest = ld.get("destination_url", "")
                if dest and dest not in existing_dests:
                    new_link = CrawlLink(
                        id=uuid.uuid5(existing_page.id, dest),
                        audit_id=audit_id,
                        source_page_id=existing_page.id,
                        destination_url=dest,
                        link_text=ld.get("link_text", ""),
                        internal=ld.get("internal", True),
                        discovered_at=ld.get("discovered_at", datetime.now(timezone.utc)),
                    )
                    self.session.add(new_link)
                    existing_dests.add(dest)

            await self.session.commit()
            await self.session.refresh(existing_page)
            return existing_page

        # New page insertion
        page = CrawlPage(
            id=page_id,
            audit_id=audit_id,
            requested_url=requested_url,
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
            canonical_tag_count=page_data.get("canonical_tag_count"),
            canonical_hrefs_json=page_data.get("canonical_hrefs_json", []),
            normalized_main_text_hash=page_data.get("normalized_main_text_hash"),
            main_text_simhash=page_data.get("main_text_simhash"),
            main_text_word_count=page_data.get("main_text_word_count", 0),
            main_text_character_count=page_data.get("main_text_character_count", 0),
            extraction_source=page_data.get("extraction_source", "empty"),
            extraction_version=page_data.get("extraction_version", "1.0.0"),
            content_quality_status=page_data.get("content_quality_status", "empty"),
            headers_json=page_data.get("headers_json", {}),
            meta_robots=page_data.get("meta_robots"),
            html_lang=page_data.get("html_lang"),
            headings_json=page_data.get("headings_json"),
            image_count=page_data.get("image_count", 0),
            missing_alt_count=page_data.get("missing_alt_count", 0),
            empty_alt_count=page_data.get("empty_alt_count", 0),
            internal_link_count=page_data.get("internal_link_count", 0),
            external_link_count=page_data.get("external_link_count", 0),
            content_hash=page_data.get("content_hash"),
            technology_evidence_json=page_data.get("technology_evidence_json", {}),
            error_message=page_data.get("error_message"),
            fetched_at=page_data.get("fetched_at", datetime.now(timezone.utc)),
        )
        self.session.add(page)

        seen_dests: set[str] = set()
        for ld in links_data:
            dest = ld.get("destination_url", "")
            if dest and dest not in seen_dests:
                link = CrawlLink(
                    id=uuid.uuid5(page_id, dest),
                    audit_id=audit_id,
                    source_page_id=page_id,
                    destination_url=dest,
                    link_text=ld.get("link_text", ""),
                    internal=ld.get("internal", True),
                    discovered_at=ld.get("discovered_at", datetime.now(timezone.utc)),
                )
                self.session.add(link)
                seen_dests.add(dest)

        try:
            await self.session.commit()
            await self.session.refresh(page)
            return page
        except IntegrityError as e:
            # Handle concurrent race condition: another worker or callback persisted this page
            safe_err = safe_exception_summary(e)
            logger.warning(
                f"IntegrityError on page insertion for audit '{audit_id}', url '{requested_url}': {safe_err}. "
                "Rolling back and verifying persistence."
            )
            await self.session.rollback()
            check_res = await self.session.execute(find_stmt)
            persisted_page = check_res.scalar_one_or_none()
            if persisted_page:
                return persisted_page
            # Never swallow IntegrityError if row is genuinely missing (e.g. invalid foreign key or foreign conflict)
            raise

    async def save_page_render(
        self,
        audit_id: uuid.UUID,
        crawl_page_id: uuid.UUID,
        render_data: Dict[str, Any],
    ) -> CrawlPageRender:
        """Persist or update a CrawlPageRender record associated with a CrawlPage idempotently.
        
        Strictly enforces that the referenced CrawlPage belongs to the supplied audit_id,
        and that an explicit render ID does not collide with a foreign audit record.
        """
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        if isinstance(crawl_page_id, str):
            crawl_page_id = uuid.UUID(crawl_page_id)

        # Verify crawl_page_id exists and belongs to the supplied audit_id
        page_stmt = select(CrawlPage.audit_id).where(CrawlPage.id == crawl_page_id)
        page_res = await self.session.execute(page_stmt)
        page_audit_id = page_res.scalar_one_or_none()
        if page_audit_id is None:
            raise ValueError(f"CrawlPage '{crawl_page_id}' not found for render persistence")
        if page_audit_id != audit_id:
            raise ValueError(
                f"Cross-audit record isolation violation: CrawlPage '{crawl_page_id}' "
                f"belongs to foreign audit '{page_audit_id}', not '{audit_id}'"
            )

        raw_render_id = render_data.get("id")
        if raw_render_id:
            render_id = uuid.UUID(raw_render_id) if isinstance(raw_render_id, str) else raw_render_id
            foreign_render_check = select(CrawlPageRender.audit_id).where(CrawlPageRender.id == render_id)
            res_foreign_render = await self.session.execute(foreign_render_check)
            existing_render_audit_id = res_foreign_render.scalar_one_or_none()
            if existing_render_audit_id is not None and existing_render_audit_id != audit_id:
                raise ValueError(
                    f"Cross-audit record isolation violation: explicit render id '{render_id}' "
                    f"belongs to foreign audit '{existing_render_audit_id}', not '{audit_id}'"
                )
        else:
            render_id = uuid.uuid5(audit_id, f"render:{crawl_page_id}")

        find_render_stmt = select(CrawlPageRender).where(
            CrawlPageRender.audit_id == audit_id,
            or_(
                CrawlPageRender.crawl_page_id == crawl_page_id,
                CrawlPageRender.id == render_id,
            ),
        )
        res = await self.session.execute(find_render_stmt)
        existing_render = res.scalar_one_or_none()

        if existing_render:
            existing_render.render_status = render_data.get("render_status", existing_render.render_status)
            existing_render.render_strategy = render_data.get("render_strategy", existing_render.render_strategy)
            existing_render.render_reason = render_data.get("render_reason", existing_render.render_reason)
            existing_render.evidence_json = render_data.get("evidence_json", existing_render.evidence_json)
            existing_render.rendered_title = render_data.get("rendered_title", existing_render.rendered_title)
            existing_render.rendered_meta_description = render_data.get("rendered_meta_description", existing_render.rendered_meta_description)
            existing_render.rendered_canonical_url = render_data.get("rendered_canonical_url", existing_render.rendered_canonical_url)
            existing_render.rendered_meta_robots = render_data.get("rendered_meta_robots", existing_render.rendered_meta_robots)
            existing_render.rendered_headings_json = render_data.get("rendered_headings_json", existing_render.rendered_headings_json)
            existing_render.rendered_image_count = render_data.get("rendered_image_count", existing_render.rendered_image_count)
            existing_render.rendered_link_count = render_data.get("rendered_link_count", existing_render.rendered_link_count)
            existing_render.comparison_json = render_data.get("comparison_json", existing_render.comparison_json)
            existing_render.performance_metrics_json = render_data.get("performance_metrics_json", existing_render.performance_metrics_json)
            existing_render.screenshot_desktop_path = render_data.get("screenshot_desktop_path", existing_render.screenshot_desktop_path)
            existing_render.screenshot_mobile_path = render_data.get("screenshot_mobile_path", existing_render.screenshot_mobile_path)
            existing_render.error_message = render_data.get("error_message", existing_render.error_message)
            existing_render.rendered_at = render_data.get("rendered_at", existing_render.rendered_at)

            await self.session.commit()
            await self.session.refresh(existing_render)
            return existing_render

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
        try:
            await self.session.commit()
            await self.session.refresh(render)
            return render
        except IntegrityError as e:
            safe_err = safe_exception_summary(e)
            logger.warning(
                f"IntegrityError on page render insertion for audit '{audit_id}', page '{crawl_page_id}': {safe_err}. "
                "Rolling back and verifying persistence."
            )
            await self.session.rollback()
            check_res = await self.session.execute(find_render_stmt)
            persisted_render = check_res.scalar_one_or_none()
            if persisted_render:
                return persisted_render
            raise

    async def save_sitemap(
        self,
        audit_id: uuid.UUID,
        sitemap_data: Dict[str, Any],
    ) -> CrawlSitemap:
        """Persist or update a CrawlSitemap record idempotently.
        
        Strictly enforces that lookups and explicit IDs cannot match or overwrite foreign audit records.
        """
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        sitemap_url = sitemap_data.get("sitemap_url", "")
        raw_sm_id = sitemap_data.get("id")
        if raw_sm_id:
            sm_id = uuid.UUID(raw_sm_id) if isinstance(raw_sm_id, str) else raw_sm_id
            foreign_sm_check = select(CrawlSitemap.audit_id).where(CrawlSitemap.id == sm_id)
            res_foreign_sm = await self.session.execute(foreign_sm_check)
            existing_sm_audit_id = res_foreign_sm.scalar_one_or_none()
            if existing_sm_audit_id is not None and existing_sm_audit_id != audit_id:
                raise ValueError(
                    f"Cross-audit record isolation violation: explicit sitemap id '{sm_id}' "
                    f"belongs to foreign audit '{existing_sm_audit_id}', not '{audit_id}'"
                )
        else:
            sm_id = uuid.uuid5(audit_id, sitemap_url)

        find_sm_stmt = select(CrawlSitemap).where(
            CrawlSitemap.audit_id == audit_id,
            or_(
                CrawlSitemap.id == sm_id,
                CrawlSitemap.sitemap_url == sitemap_url,
            ),
        )
        res = await self.session.execute(find_sm_stmt)
        existing_sm = res.scalar_one_or_none()

        if existing_sm:
            existing_sm.status = sitemap_data.get("status", existing_sm.status)
            existing_sm.url_count = sitemap_data.get("url_count", existing_sm.url_count)
            existing_sm.error_message = sitemap_data.get("error_message", existing_sm.error_message)
            existing_sm.urls_json = sitemap_data.get("discovered_urls", existing_sm.urls_json or [])[:2000]
            await self.session.commit()
            await self.session.refresh(existing_sm)
            return existing_sm

        sm = CrawlSitemap(
            id=sm_id,
            audit_id=audit_id,
            sitemap_url=sitemap_url,
            status=sitemap_data.get("status", "success"),
            url_count=sitemap_data.get("url_count", 0),
            error_message=sitemap_data.get("error_message"),
            urls_json=sitemap_data.get("discovered_urls", [])[:2000],
            discovered_at=datetime.now(timezone.utc),
        )
        self.session.add(sm)
        try:
            await self.session.commit()
            await self.session.refresh(sm)
            return sm
        except IntegrityError as e:
            safe_err = safe_exception_summary(e)
            logger.warning(
                f"IntegrityError on sitemap insertion for audit '{audit_id}', url '{sitemap_url}': {safe_err}. "
                "Rolling back and verifying persistence."
            )
            await self.session.rollback()
            check_res = await self.session.execute(find_sm_stmt)
            persisted_sm = check_res.scalar_one_or_none()
            if persisted_sm:
                return persisted_sm
            raise

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
        """Atomically claim the next eligible queued or abandoned audit job using conditional update."""
        now = datetime.now(timezone.utc)
        lease_expiration = now + timedelta(seconds=lease_seconds)

        active_in_progress_statuses = [
            AuditStatus.crawling.value,
            AuditStatus.analyzing.value,
            AuditStatus.enriching.value,
            AuditStatus.generating_recommendations.value,
        ]
        # Query top eligible candidates ordered by created_at
        stmt = (
            select(Audit.id)
            .where(
                (Audit.status == AuditStatus.queued.value)
                | (
                    (Audit.status.in_(active_in_progress_statuses))
                    & (Audit.lease_expires_at != None)
                    & (Audit.lease_expires_at < now)
                )
            )
            .order_by(Audit.created_at.asc())
            .limit(5)
        )
        result = await self.session.execute(stmt)
        candidate_ids = result.scalars().all()

        if not candidate_ids:
            return None

        # Attempt atomic conditional update on candidates
        for candidate_id in candidate_ids:
            update_stmt = (
                update(Audit)
                .where(
                    Audit.id == candidate_id,
                    (
                        (Audit.status == AuditStatus.queued.value)
                        | (
                            (Audit.status.in_(active_in_progress_statuses))
                            & (Audit.lease_expires_at != None)
                            & (Audit.lease_expires_at < now)
                        )
                    ),
                )
                .values(
                    status=case(
                        (Audit.status == AuditStatus.queued.value, AuditStatus.crawling.value),
                        else_=Audit.status,
                    ),
                    worker_token=worker_token,
                    lease_expires_at=lease_expiration,
                    heartbeat_at=now,
                    started_at=case(
                        (Audit.started_at == None, now),
                        else_=Audit.started_at,
                    ),
                )
            )
            update_res = await self.session.execute(update_stmt)
            if update_res.rowcount > 0:
                await self.session.commit()
                # Fetch and return the claimed audit
                fetch_stmt = select(Audit).where(Audit.id == candidate_id)
                fetch_res = await self.session.execute(fetch_stmt)
                return fetch_res.scalar_one_or_none()

        return None

    async def heartbeat(
        self,
        audit_id: uuid.UUID,
        worker_token: str,
        lease_seconds: int = 60,
        progress_json: Optional[Dict[str, Any]] = None,
        pages_crawled: Optional[int] = None,
        pages_discovered: Optional[int] = None,
        status: Optional[str] = None,
    ) -> bool:
        """Renew job lease and persist progress with safe deep-merge. Returns False if job was cancelled or stolen."""
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

        # If another worker stole or owns the lease
        if audit.worker_token is None:
            audit.worker_token = worker_token
        elif audit.worker_token != worker_token:
            logger.warning(
                f"Heartbeat rejected: worker '{worker_token}' does not own audit '{audit_id}' (owned by '{audit.worker_token}')"
            )
            return False

        audit.heartbeat_at = now
        audit.lease_expires_at = now + timedelta(seconds=lease_seconds)
        if status is not None:
            audit.status = status
        if progress_json is not None:
            audit.progress_json = _safe_merge_progress_json(audit.progress_json, progress_json)
            flag_modified(audit, "progress_json")
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
        """Complete or fail a job, ensuring cancelled jobs are preserved and stale workers cannot release."""
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

        # Enforce worker ownership: stale workers must not overwrite status or publish results
        if audit.worker_token is not None and audit.worker_token != worker_token:
            logger.warning(
                f"Stale worker '{worker_token}' attempted to release audit '{audit_id}' owned by '{audit.worker_token}'"
            )
            return False

        audit.status = terminal_status.value
        audit.completed_at = datetime.now(timezone.utc)
        audit.worker_token = None
        audit.lease_expires_at = None
        if error_message:
            audit.error_message = error_message
        if progress_json:
            audit.progress_json = _safe_merge_progress_json(audit.progress_json, progress_json)
            flag_modified(audit, "progress_json")
            if "pages_crawled" in progress_json:
                audit.pages_crawled = progress_json["pages_crawled"]
            if "urls_discovered" in progress_json:
                audit.pages_discovered = progress_json["urls_discovered"]

        await self.session.commit()
        return True

    async def has_pages(self, audit_id: uuid.UUID) -> bool:
        """Check if any crawled pages exist for this audit."""
        if isinstance(audit_id, str):
            audit_id = uuid.UUID(audit_id)
        stmt = select(CrawlPage.id).where(CrawlPage.audit_id == audit_id).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none() is not None
