"""Tests for HTML parsing, link classification, and crawl engine orchestration."""

from unittest.mock import AsyncMock, MagicMock
import pytest

from app.crawler.engine import CrawlEngine
from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.parser import HTMLPageParser
from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.scope import CrawlScope


def test_html_parser_seo_metadata_and_headings():
    html = b"""
    <!DOCTYPE html>
    <html lang="en-US">
    <head>
        <title>Test Page Title</title>
        <meta name="description" content="Official meta description text">
        <meta property="og:description" content="OpenGraph description to ignore">
        <link rel="canonical" href="https://example.com/test-page">
        <meta name="robots" content="index, follow">
    </head>
    <body>
        <h1>Primary Heading</h1>
        <h2>Secondary Heading A</h2>
        <h2>Secondary Heading B</h2>
        <img src="valid.png" alt="Valid alt description">
        <img src="missing.png">
        <img src="empty.png" alt="   ">
        <a href="/internal-link">Internal</a>
        <a href="https://external.com/blog">External</a>
    </body>
    </html>
    """

    scope = CrawlScope("https://example.com")
    data = HTMLPageParser.parse(html, "https://example.com/test-page", scope)

    assert data.title == "Test Page Title"
    assert data.meta_description == "Official meta description text"
    assert data.canonical_url == "https://example.com/test-page"
    assert data.meta_robots == "index, follow"
    assert data.html_lang == "en-US"

    assert data.headings_json["counts"]["h1"] == 1
    assert data.headings_json["counts"]["h2"] == 2
    assert "Primary Heading" in data.headings_json["h1"]

    assert data.image_count == 3
    assert data.missing_alt_count == 1
    assert data.empty_alt_count == 1

    assert data.internal_link_count == 1
    assert data.external_link_count == 1
    assert any(link.destination_url == "https://example.com/internal-link" for link in data.discovered_links)


@pytest.mark.asyncio
async def test_crawl_engine_bounded_execution():
    fetcher = MagicMock(spec=SecureHTTPFetcher)

    page_html = b"""
    <html><head><title>Page</title></head><body>
    <h1>Title</h1>
    <a href="/page1">Link 1</a>
    </body></html>
    """

    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/",
        final_url="https://example.com/",
        fetch_status="success",
        http_status=200,
        content_type="text/html",
        body=page_html,
    ))
    fetcher.close = AsyncMock()

    config = CrawlConfig(max_pages=2, requests_per_second=10.0, parse_sitemaps=False)
    engine = CrawlEngine(
        start_url="https://example.com/",
        config=config,
        fetcher=fetcher,
    )

    summary = await engine.execute()
    assert summary["pages_crawled"] >= 1
    assert summary["pages_crawled"] <= 2
