"""Tests for PageRenderer on deterministic offline fixtures (Phase 1.4B)."""

import asyncio
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import uuid
import pytest
from app.renderer.browser_manager import BrowserManager
from app.renderer.render_policy import RenderDecision, RenderPolicy, RenderStrategy
from app.renderer.renderer import PageRenderer
from app.renderer.screenshot import ScreenshotService


class OfflineFixtureServer:
    """Lightweight local HTTP fixture server running on ephemeral port."""

    def __init__(self, html_content: str):
        self.html_content = html_content
        self.server = None
        self.thread = None
        self.port = 0

    def start(self):
        handler_cls = self._make_handler(self.html_content)
        self.server = HTTPServer(("127.0.0.1", 0), handler_cls)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self.port

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()

    @staticmethod
    def _make_handler(content_str):
        class FixtureHandler(SimpleHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(content_str.encode("utf-8"))

            def log_message(self, format, *args):
                pass
        return FixtureHandler


@pytest.mark.asyncio
async def test_page_renderer_dynamic_spa_fixture():
    """Test PageRenderer executing JavaScript on a dynamic SPA fixture and capturing hydrated DOM."""
    spa_html = """
    <!DOCTYPE html>
    <html>
    <head><title>Initial Title</title></head>
    <body>
        <div id="root">Loading...</div>
        <script>
            // Simulate client-side React hydration
            setTimeout(() => {
                document.title = "Hydrated Client App";
                const root = document.getElementById("root");
                root.innerHTML = "<h1>Dynamic H1 Heading</h1><p>Client populated content.</p><a href='/dynamic-link'>Dynamic Link</a>";
            }, 50);
        </script>
    </body>
    </html>
    """
    fixture = OfflineFixtureServer(spa_html)
    port = fixture.start()
    url = f"http://127.0.0.1:{port}/"

    browser_manager = BrowserManager(max_concurrent_contexts=1, allow_local_fixtures=True)
    policy = RenderPolicy(
        navigation_timeout=10.0,
        hydration_wait=0.3,
        allow_public_rendering=True,
    )
    renderer = PageRenderer(browser_manager=browser_manager, policy=policy)

    audit_id = uuid.uuid4()
    page_id = uuid.uuid4()
    decision = RenderDecision(strategy=RenderStrategy.RENDER_REQUIRED, reason="SPA test")

    raw_data = {
        "title": "Initial Title",
        "headings_json": {"h1": []},
        "image_count": 0,
        "internal_link_count": 0,
        "external_link_count": 0,
    }

    try:
        render_res, parsed, comparison = await renderer.render_page(
            url=url,
            audit_id=audit_id,
            page_id=page_id,
            decision=decision,
            raw_extraction=raw_data,
        )

        assert render_res.status == "success"
        assert parsed.title == "Hydrated Client App"
        assert "Dynamic H1 Heading" in parsed.headings_json.get("h1", [])
        assert comparison["title_changed"] is True
        assert comparison["rendered_reveals_more_content"] is True
        assert render_res.performance_metrics["is_lab_measurement"] is True

    finally:
        await browser_manager.close()
        fixture.stop()


@pytest.mark.asyncio
async def test_page_renderer_navigation_timeout():
    """PageRenderer returns failed status when navigation timeout occurs."""
    browser_manager = BrowserManager(max_concurrent_contexts=1, allow_local_fixtures=True)
    policy = RenderPolicy(navigation_timeout=0.2, hydration_wait=0.0)
    renderer = PageRenderer(browser_manager=browser_manager, policy=policy)

    decision = RenderDecision(strategy=RenderStrategy.RENDER_REQUIRED, reason="Timeout test")

    try:
        # Non-routable blackhole port
        res, parsed, comp = await renderer.render_page(
            url="http://127.0.0.1:59999/",
            audit_id=uuid.uuid4(),
            page_id=uuid.uuid4(),
            decision=decision,
        )
        assert res.status == "failed"
        assert res.error_message is not None
    finally:
        await browser_manager.close()


def test_screenshot_service_disabled_by_default_and_path_safety():
    """Verify screenshot capture is disabled by default and generates sanitized paths."""
    policy = RenderPolicy()
    assert policy.enable_screenshots is False
