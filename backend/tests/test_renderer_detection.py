"""Tests for smart JavaScript rendering detection heuristics (Phase 1.4B)."""

import pytest
from app.renderer.render_detector import RenderDetector
from app.renderer.render_policy import RenderMode, RenderStrategy


def test_static_html_page_needs_no_rendering():
    """Traditional server-rendered HTML with sufficient content should evaluate to HTTP_ONLY."""
    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <title>Standard Server Rendered Page</title>
        <meta name="description" content="A comprehensive guide to web optimization.">
    </head>
    <body>
        <h1>Web Optimization Guide</h1>
        <p>This is a complete article with plenty of textual information explaining best practices for websites.</p>
        <h2>Core Concepts</h2>
        <p>Structured data, metadata tags, semantic HTML, and accessibility are essential components of quality web engineering.</p>
        <a href="/about">About Us</a>
    </body>
    </html>
    """
    decision = RenderDetector.detect(html, http_status=200, allow_public_rendering=False)
    assert decision.strategy == RenderStrategy.HTTP_ONLY
    assert "sufficient" in decision.reason or "complete" in decision.reason
    assert decision.evidence["heading_count"] == 2
    assert decision.evidence["visible_text_length"] > 200


def test_empty_spa_root_requires_render():
    """Client-rendered SPA with empty #root container requires rendering when allowed, or reports unavailable."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>React App</title></head>
    <body>
        <div id="root"></div>
        <script src="/static/js/bundle.12345.js"></script>
    </body>
    </html>
    """
    # When public rendering is disabled
    decision_disabled = RenderDetector.detect(html, allow_public_rendering=False)
    assert decision_disabled.strategy == RenderStrategy.RENDER_UNAVAILABLE
    assert "#root" in decision_disabled.evidence["empty_roots"]
    assert "network isolation" in decision_disabled.reason

    # When public rendering is enabled
    decision_enabled = RenderDetector.detect(html, allow_public_rendering=True)
    assert decision_enabled.strategy == RenderStrategy.RENDER_REQUIRED
    assert "#root" in decision_enabled.evidence["empty_roots"]


def test_client_placeholder_requires_render():
    """Pages showing 'You need to enable JavaScript to run this app' require rendering."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>App</title></head>
    <body>
        <noscript>You need to enable JavaScript to run this app.</noscript>
        <div id="app">Loading application...</div>
        <script src="/main.js"></script>
    </body>
    </html>
    """
    decision = RenderDetector.detect(html, allow_public_rendering=True)
    assert decision.strategy == RenderStrategy.RENDER_REQUIRED
    assert len(decision.evidence["client_placeholders"]) > 0


def test_server_rendered_nextjs_does_not_render_unnecessarily():
    """Next.js pages delivering complete server-side HTML (SSR) should evaluate to HTTP_ONLY."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>Next.js Blog</title></head>
    <body>
        <div id="__next">
            <header><h1>Welcome to Our Official Engineering Blog</h1></header>
            <main>
                <article>
                    <h2>Deep Dive into Modern Web Architectures</h2>
                    <p>Modern applications leverage server-side rendering to generate rich, indexable HTML documents that search engines and crawlers can parse directly without executing JavaScript bundles in headless browsers.</p>
                    <p>This paragraph contains detailed content, citations, and structural markup that fulfills all SEO discovery requirements.</p>
                </article>
            </main>
        </div>
        <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}}}</script>
        <script src="/_next/static/chunks/main.js"></script>
    </body>
    </html>
    """
    decision = RenderDetector.detect(html, allow_public_rendering=True)
    assert decision.strategy == RenderStrategy.HTTP_ONLY
    assert decision.evidence["ssr_content_present"] is True
    assert "SSR" in decision.reason or "server-rendered" in decision.reason


def test_render_mode_never_overrides_heuristics():
    """Setting render_mode to 'never' always returns HTTP_ONLY even for empty SPAs."""
    html = '<div id="root"></div><script src="/bundle.js"></script>'
    decision = RenderDetector.detect(html, render_mode=RenderMode.never, allow_public_rendering=True)
    assert decision.strategy == RenderStrategy.HTTP_ONLY
    assert "never" in decision.reason


def test_render_mode_always_overrides_when_enabled():
    """Setting render_mode to 'always' triggers render recommendation/requirement."""
    html = "<h1>Static Page</h1><p>Full content.</p>"
    decision = RenderDetector.detect(html, render_mode=RenderMode.always, allow_public_rendering=True)
    assert decision.strategy == RenderStrategy.RENDER_RECOMMENDED or decision.strategy == RenderStrategy.RENDER_REQUIRED


def test_error_http_status_skips_rendering():
    """4xx and 5xx responses never trigger browser rendering."""
    html = "<h1>404 Not Found</h1>"
    decision = RenderDetector.detect(html, http_status=404, allow_public_rendering=True)
    assert decision.strategy == RenderStrategy.HTTP_ONLY
    assert "404" in decision.reason
