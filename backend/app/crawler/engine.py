"""Core crawl orchestration engine.

Coordinates outbound fetching, robots.txt compliance, sitemap parsing, HTML parsing,
rate limiting, cancellation, progress updates, and persistence callbacks.
"""

import asyncio
from datetime import datetime, timezone
import logging
import time
from typing import Any, Callable, Coroutine

from app.crawler.discovery import CrawlQueue
from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.normalizer import normalize_url
from app.crawler.parser import HTMLPageParser, ParsedPageData
from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.robots import RobotsChecker
from app.crawler.scope import CrawlScope
from app.crawler.sitemap import SitemapParser, SitemapResult

logger = logging.getLogger(__name__)


class CrawlEngine:
    """Asynchronous website crawl engine."""

    def __init__(
        self,
        start_url: str,
        config: CrawlConfig | None = None,
        fetcher: SecureHTTPFetcher | None = None,
        on_page_persisted: Callable[[dict[str, Any], list[dict[str, Any]]], Coroutine[Any, Any, None]] | None = None,
        on_sitemap_persisted: Callable[[dict[str, Any]], Coroutine[Any, Any, None]] | None = None,
        on_progress: Callable[[dict[str, Any]], Coroutine[Any, Any, None]] | None = None,
        is_cancelled: Callable[[], Coroutine[Any, Any, bool]] | None = None,
    ) -> None:
        normalized_start = normalize_url(start_url)
        if not normalized_start:
            raise ValueError(f"Invalid crawl start URL: {start_url}")

        self.start_url = normalized_start
        self.config = (config or CrawlConfig()).validate()
        self.scope = CrawlScope(self.start_url, include_subdomains=self.config.include_subdomains)
        self.fetcher = fetcher or SecureHTTPFetcher()
        self.queue = CrawlQueue(self.scope, self.config)

        self._on_page_persisted = on_page_persisted
        self._on_sitemap_persisted = on_sitemap_persisted
        self._on_progress = on_progress
        self._is_cancelled = is_cancelled

        # Execution statistics
        self.pages_crawled: int = 0
        self.pages_failed: int = 0
        self.max_depth_reached: int = 0
        self.start_time: float = 0.0

    async def execute(self) -> dict[str, Any]:
        """Execute full crawl workflow."""
        self.start_time = time.monotonic()
        start_dt = datetime.now(timezone.utc)

        # 1. Enqueue seed URL
        self.queue.push(self.start_url, depth=0)

        # 2. Robots.txt discovery
        robots = RobotsChecker(self.fetcher, self.scope, self.config)
        await robots.load()

        # Check if robots specifies a crawl-delay
        effective_delay = 1.0 / self.config.requests_per_second
        if robots.crawl_delay and robots.crawl_delay > effective_delay:
            effective_delay = min(robots.crawl_delay, 10.0)

        # 3. XML Sitemap discovery
        sitemap_parser = SitemapParser(self.fetcher, self.scope, self.config)
        discovered_sitemap_urls, sitemap_records = await sitemap_parser.discover_sitemaps(robots.sitemap_urls)

        # Persist sitemap records
        for sm_rec in sitemap_records:
            if self._on_sitemap_persisted:
                await self._on_sitemap_persisted({
                    "sitemap_url": sm_rec.sitemap_url,
                    "status": sm_rec.status,
                    "url_count": sm_rec.url_count,
                    "error_message": sm_rec.error_message,
                })

        # Seed in-scope sitemap URLs into crawl queue (depth=1)
        for sm_url in discovered_sitemap_urls:
            if len(self.queue) >= self.config.max_pages * 2:
                break
            self.queue.push(sm_url, depth=1, source_url=self.start_url)

        # 4. Main crawl loop
        last_request_time = 0.0

        while not self.queue.is_empty() and self.pages_crawled < self.config.max_pages:
            # Check cancellation
            if self._is_cancelled and await self._is_cancelled():
                logger.info("Crawl execution cancelled by user")
                break

            item = self.queue.pop()
            if not item:
                break

            current_url = item.url
            current_depth = item.depth
            if current_depth > self.max_depth_reached:
                self.max_depth_reached = current_depth

            # Check robots.txt permission
            if not robots.can_fetch(current_url):
                self.queue.skipped_count += 1
                self.queue.skipped_reasons["robots_blocked"] += 1
                # Persist skipped robots page record
                if self._on_page_persisted:
                    await self._on_page_persisted({
                        "requested_url": current_url,
                        "final_url": current_url,
                        "depth": current_depth,
                        "fetch_status": "robots_blocked",
                        "http_status": None,
                        "error_message": "Disallowed by robots.txt",
                        "raw_html": fetch_res.body.decode("utf-8", errors="replace") if fetch_res.body else "",
                "fetched_at": datetime.now(timezone.utc),
                    }, [])
                continue

            # Polite rate limiting
            now = time.monotonic()
            elapsed_since_last = now - last_request_time
            if elapsed_since_last < effective_delay:
                await asyncio.sleep(effective_delay - elapsed_since_last)

            last_request_time = time.monotonic()

            # Execute fetch
            fetch_res = await self.fetcher.fetch(current_url, self.scope, self.config)

            # Process HTML if applicable
            parsed: ParsedPageData = ParsedPageData()
            is_html = (
                fetch_res.content_type
                and any(t in fetch_res.content_type.lower() for t in ("text/html", "application/xhtml+xml"))
            )

            if fetch_res.fetch_status == "success" and fetch_res.body and is_html:
                parsed = HTMLPageParser.parse(fetch_res.body, fetch_res.final_url, self.scope)
                self.pages_crawled += 1

                # Enqueue newly discovered internal links
                for link in parsed.discovered_links:
                    if link.internal and (self.pages_crawled + len(self.queue)) < (self.config.max_pages * 3):
                        self.queue.push(link.destination_url, depth=current_depth + 1, source_url=fetch_res.final_url)
            elif fetch_res.fetch_status == "success" and not is_html:
                # Non-HTML resource
                fetch_res.fetch_status = "unsupported_media"
                fetch_res.error_message = f"Skipped non-HTML content-type: {fetch_res.content_type}"
                self.pages_crawled += 1
            else:
                self.pages_failed += 1

            # Prepare page record for persistence
            page_data = {
                "requested_url": fetch_res.requested_url,
                "final_url": fetch_res.final_url,
                "depth": current_depth,
                "fetch_status": fetch_res.fetch_status,
                "http_status": fetch_res.http_status,
                "content_type": fetch_res.content_type,
                "response_time_ms": fetch_res.response_time_ms,
                "redirect_chain_json": fetch_res.redirect_chain,
                "title": parsed.title,
                "meta_description": parsed.meta_description,
                "canonical_url": parsed.canonical_url,
                "meta_robots": parsed.meta_robots,
                "html_lang": parsed.html_lang,
                "headings_json": parsed.headings_json,
                "image_count": parsed.image_count,
                "missing_alt_count": parsed.missing_alt_count,
                "empty_alt_count": parsed.empty_alt_count,
                "internal_link_count": parsed.internal_link_count,
                "external_link_count": parsed.external_link_count,
                "content_hash": parsed.content_hash,
                "error_message": fetch_res.error_message,
                "raw_html": fetch_res.body.decode("utf-8", errors="replace") if fetch_res.body else "",
                "fetched_at": datetime.now(timezone.utc),
            }

            links_data = [
                {
                    "destination_url": dl.destination_url,
                    "link_text": dl.link_text,
                    "internal": dl.internal,
                    "discovered_at": datetime.now(timezone.utc),
                }
                for dl in parsed.discovered_links
            ]

            if self._on_page_persisted:
                await self._on_page_persisted(page_data, links_data)

            # Send progress update
            if self._on_progress:
                await self._on_progress(self.get_progress_summary())

        await self.fetcher.close()

        end_dt = datetime.now(timezone.utc)
        summary = self.get_progress_summary()
        summary["started_at"] = start_dt.isoformat()
        summary["completed_at"] = end_dt.isoformat()
        return summary

    def get_progress_summary(self) -> dict[str, Any]:
        """Generate accurate, honest crawl progress statistics."""
        return {
            "urls_discovered": self.queue.discovered_count,
            "urls_queued": len(self.queue),
            "pages_attempted": self.pages_crawled + self.pages_failed,
            "pages_crawled": self.pages_crawled,
            "pages_failed": self.pages_failed,
            "pages_skipped": self.queue.skipped_count,
            "skipped_reasons": dict(self.queue.skipped_reasons),
            "crawl_depth_reached": self.max_depth_reached,
            "max_pages_limit": self.config.max_pages,
            "max_depth_limit": self.config.max_depth,
        }
