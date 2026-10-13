"""Browser process lifecycle manager controlling Chromium instances and concurrency."""

import asyncio
import logging
from typing import Optional, Set
from playwright.async_api import Browser, BrowserContext, Playwright, async_playwright

from app.renderer.browser_security import BrowserSecurityManager

logger = logging.getLogger("browser_manager")


class BrowserManager:
    """Manages the lifecycle of a controlled Chromium process and bounded contexts."""

    def __init__(
        self,
        max_concurrent_contexts: int = 2,
        proxy_url: Optional[str] = None,
        allow_local_fixtures: bool = False,
    ) -> None:
        self.max_concurrent_contexts = max_concurrent_contexts
        self.proxy_url = proxy_url
        self.allow_local_fixtures = allow_local_fixtures
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.semaphore = asyncio.Semaphore(max_concurrent_contexts)
        self.active_contexts: Set[BrowserContext] = set()
        self._lock = asyncio.Lock()

    async def _ensure_browser(self) -> Browser:
        """Initialize Playwright and launch Chromium if not running or crashed."""
        async with self._lock:
            if self.browser and self.browser.is_connected():
                return self.browser

            if self.browser:
                try:
                    await self.browser.close()
                except Exception:
                    pass
                self.browser = None

            if not self.playwright:
                self.playwright = await async_playwright().start()

            launch_args = BrowserSecurityManager.get_secure_chromium_args(proxy_server=self.proxy_url)
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=launch_args,
            )
            logger.info("Chromium launched successfully.")
            return self.browser

    async def create_context(self) -> BrowserContext:
        """Create a fresh isolated browser context within concurrency limits."""
        await self.semaphore.acquire()
        try:
            browser = await self._ensure_browser()
            opts = BrowserSecurityManager.get_secure_context_options(proxy_server=self.proxy_url)
            context = await browser.new_context(**opts)
            await BrowserSecurityManager.setup_route_interception(
                context,
                allow_local_fixtures=self.allow_local_fixtures,
            )
            self.active_contexts.add(context)
            return context
        except Exception:
            self.semaphore.release()
            raise

    async def release_context(self, context: BrowserContext) -> None:
        """Safely close context and release concurrency semaphore."""
        try:
            if context in self.active_contexts:
                self.active_contexts.remove(context)
            await context.close()
        except Exception as e:
            logger.debug(f"Error closing browser context: {e}")
        finally:
            self.semaphore.release()

    async def close(self) -> None:
        """Clean up all active contexts, browser instance, and Playwright driver."""
        async with self._lock:
            for ctx in list(self.active_contexts):
                try:
                    await ctx.close()
                except Exception:
                    pass
            self.active_contexts.clear()

            if self.browser:
                try:
                    await self.browser.close()
                except Exception:
                    pass
                self.browser = None

            if self.playwright:
                try:
                    await self.playwright.stop()
                except Exception:
                    pass
                self.playwright = None

            logger.info("BrowserManager closed cleanly.")
