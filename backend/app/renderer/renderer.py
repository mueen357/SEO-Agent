"""PageRenderer coordinates dynamic JavaScript rendering, metrics, and screenshots."""

import asyncio
import logging
import time
from typing import Any, Dict, Optional, Tuple
import uuid

from app.crawler.parser import HTMLPageParser
from app.crawler.scope import CrawlScope
from app.renderer.browser_manager import BrowserManager
from app.renderer.comparator import RawVsRenderedComparator
from app.renderer.metrics import PerformanceMetricsExtractor
from app.renderer.render_policy import RenderDecision, RenderPolicy, RenderResult, RenderStrategy
from app.renderer.screenshot import ScreenshotService

logger = logging.getLogger("page_renderer")


class PageRenderer:
    """Executes secure, bounded JavaScript rendering using an isolated browser context."""

    def __init__(
        self,
        browser_manager: BrowserManager,
        policy: Optional[RenderPolicy] = None,
    ) -> None:
        self.browser_manager = browser_manager
        self.policy = policy or RenderPolicy()

    async def render_page(
        self,
        url: str,
        audit_id: uuid.UUID,
        page_id: uuid.UUID,
        decision: RenderDecision,
        raw_extraction: Optional[Dict[str, Any]] = None,
    ) -> Tuple[RenderResult, Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        """Render page, extract rendered HTML, performance metrics, and comparison with raw extraction.
        
        Returns: (RenderResult, rendered_extraction_dict, comparison_dict)
        """
        start_time = time.monotonic()
        context = None

        try:
            context = await self.browser_manager.create_context()
            page = await context.new_page()

            # Set navigation timeout
            nav_timeout_ms = int(self.policy.navigation_timeout * 1000)
            page.set_default_navigation_timeout(nav_timeout_ms)
            page.set_default_timeout(nav_timeout_ms)

            # Navigate
            response = await page.goto(url, wait_until="domcontentloaded", timeout=nav_timeout_ms)

            # Bounded hydration wait
            if self.policy.hydration_wait > 0:
                await asyncio.sleep(self.policy.hydration_wait)

            # Extract rendered HTML
            rendered_html = await page.content()
            duration_ms = int((time.monotonic() - start_time) * 1000)

            # Check DOM size limit
            if len(rendered_html.encode("utf-8")) > self.policy.max_dom_size_bytes:
                return (
                    RenderResult(
                        status="failed",
                        decision=decision,
                        response_time_ms=duration_ms,
                        error_message="Rendered DOM exceeds configured maximum byte limit (5MB).",
                    ),
                    None,
                    None,
                )

            # Extract lab performance metrics
            metrics = await PerformanceMetricsExtractor.extract(page)

            # Optional screenshot capture
            desktop_shot, mobile_shot = None, None
            if self.policy.enable_screenshots:
                desktop_shot, mobile_shot = await ScreenshotService.capture(
                    page=page,
                    audit_id=audit_id,
                    page_id=page_id,
                    desktop_dims=self.policy.screenshot_dimensions_desktop,
                    mobile_dims=self.policy.screenshot_dimensions_mobile,
                )

            # Parse rendered HTML using standard parser
            scope = CrawlScope(url)
            rendered_bytes = rendered_html.encode('utf-8')
            rendered_parsed = HTMLPageParser.parse(html_bytes=rendered_bytes, current_url=url, scope=scope)

            # Run comparison with raw extraction if provided
            comparison = None
            if raw_extraction:
                comparison = RawVsRenderedComparator.compare(raw_extraction, rendered_parsed)

            result = RenderResult(
                status="success",
                decision=decision,
                rendered_html=rendered_html,
                rendered_url=page.url,
                response_time_ms=duration_ms,
                performance_metrics=metrics,
                screenshot_desktop_path=desktop_shot,
                screenshot_mobile_path=mobile_shot,
            )

            return result, rendered_parsed, comparison

        except Exception as e:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            logger.warning(f"Failed to render page {url}: {e}")
            return (
                RenderResult(
                    status="failed",
                    decision=decision,
                    response_time_ms=duration_ms,
                    error_message=str(e),
                ),
                None,
                None,
            )

        finally:
            if context:
                await self.browser_manager.release_context(context)
