"""Lab performance measurements extracted via browser performance APIs."""

from typing import Any, Dict
from playwright.async_api import Page


class PerformanceMetricsExtractor:
    """Extracts lab performance timings and resource counts from the rendered page."""

    @staticmethod
    async def extract(page: Page) -> Dict[str, Any]:
        """Execute in-browser performance API queries and return structured lab metrics."""
        script = """
        () => {
            const nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
            const timing = performance.timing || {};
            const resources = (performance.getEntriesByType && performance.getEntriesByType('resource')) || [];

            let transferSize = 0;
            for (let i = 0; i < resources.length; i++) {
                if (resources[i].transferSize) {
                    transferSize += resources[i].transferSize;
                }
            }

            const navStart = timing.navigationStart || (nav.startTime || 0);
            const loadEnd = timing.loadEventEnd || (nav.loadEventEnd || 0);
            const domContentEnd = timing.domContentLoadedEventEnd || (nav.domContentLoadedEventEnd || 0);
            const domInteractive = timing.domInteractive || (nav.domInteractive || 0);
            const respStart = timing.responseStart || (nav.responseStart || 0);
            const respEnd = timing.responseEnd || (nav.responseEnd || 0);
            const reqStart = timing.requestStart || (nav.requestStart || 0);

            return {
                is_lab_measurement: true,
                navigation_duration_ms: (loadEnd && navStart) ? Math.max(0, Math.round(loadEnd - navStart)) : (nav.duration ? Math.round(nav.duration) : null),
                dom_content_loaded_ms: (domContentEnd && navStart) ? Math.max(0, Math.round(domContentEnd - navStart)) : null,
                load_event_ms: (loadEnd && navStart) ? Math.max(0, Math.round(loadEnd - navStart)) : null,
                dom_interactive_ms: (domInteractive && navStart) ? Math.max(0, Math.round(domInteractive - navStart)) : null,
                response_time_ms: (respEnd && reqStart) ? Math.max(0, Math.round(respEnd - reqStart)) : null,
                resource_count: resources.length,
                transfer_size_bytes: transferSize || (nav.transferSize || 0)
            };
        }
        """
        try:
            metrics = await page.evaluate(script)
            return metrics or {"is_lab_measurement": True}
        except Exception:
            return {"is_lab_measurement": True}
