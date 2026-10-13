"""Tests for robots.txt compliance and safe XML sitemap parsing."""

from unittest.mock import AsyncMock, MagicMock
import pytest

from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.robots import RobotsChecker
from app.crawler.scope import CrawlScope
from app.crawler.sitemap import SitemapParser


@pytest.mark.asyncio
async def test_robots_txt_allow_disallow_and_sitemap():
    robots_content = (
        "User-agent: *\n"
        "Disallow: /admin/\n"
        "Disallow: /private/\n"
        "Allow: /admin/public/\n"
        "Crawl-delay: 2\n"
        "Sitemap: https://example.com/sitemap.xml\n"
    ).encode("utf-8")

    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/robots.txt",
        final_url="https://example.com/robots.txt",
        fetch_status="success",
        http_status=200,
        body=robots_content,
    ))

    scope = CrawlScope("https://example.com")
    config = CrawlConfig()
    checker = RobotsChecker(fetcher, scope, config)
    await checker.load()

    assert checker.loaded is True
    assert checker.sitemap_urls == ["https://example.com/sitemap.xml"]
    assert checker.crawl_delay == 2.0

    # Permission checks
    assert checker.can_fetch("https://example.com/page") is True
    assert checker.can_fetch("https://example.com/admin/secret") is False
    assert checker.can_fetch("https://example.com/admin/public/page") is True


@pytest.mark.asyncio
async def test_robots_txt_not_found_allows_crawling():
    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/robots.txt",
        final_url="https://example.com/robots.txt",
        fetch_status="http_error",
        http_status=404,
    ))

    scope = CrawlScope("https://example.com")
    config = CrawlConfig()
    checker = RobotsChecker(fetcher, scope, config)
    await checker.load()

    assert checker.can_fetch("https://example.com/anything") is True


@pytest.mark.asyncio
async def test_robots_txt_forbidden_blocks_crawling():
    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/robots.txt",
        final_url="https://example.com/robots.txt",
        fetch_status="http_error",
        http_status=403,
    ))

    scope = CrawlScope("https://example.com")
    config = CrawlConfig()
    checker = RobotsChecker(fetcher, scope, config)
    await checker.load()

    assert checker.can_fetch("https://example.com/anything") is False


@pytest.mark.asyncio
async def test_sitemap_xml_parsing():
    xml_data = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        '  <url><loc>https://example.com/page1</loc></url>\n'
        '  <url><loc>https://example.com/page2</loc></url>\n'
        '  <url><loc>https://evil.com/page3</loc></url>\n'  # Out of scope
        '</urlset>'
    ).encode("utf-8")

    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/sitemap.xml",
        final_url="https://example.com/sitemap.xml",
        fetch_status="success",
        http_status=200,
        body=xml_data,
    ))

    scope = CrawlScope("https://example.com")
    config = CrawlConfig()
    parser = SitemapParser(fetcher, scope, config)

    urls, records = await parser.discover_sitemaps(["https://example.com/sitemap.xml"])

    assert len(records) >= 1
    assert "https://example.com/page1" in urls
    assert "https://example.com/page2" in urls
    assert "https://evil.com/page3" not in urls  # Scope filtering


@pytest.mark.asyncio
async def test_sitemap_malformed_xml():
    fetcher = MagicMock(spec=SecureHTTPFetcher)
    fetcher.fetch = AsyncMock(return_value=FetchResult(
        requested_url="https://example.com/sitemap.xml",
        final_url="https://example.com/sitemap.xml",
        fetch_status="success",
        http_status=200,
        body=b"<<invalid xml>>",
    ))

    scope = CrawlScope("https://example.com")
    config = CrawlConfig()
    parser = SitemapParser(fetcher, scope, config)

    urls, records = await parser.discover_sitemaps(["https://example.com/sitemap.xml"])
    assert len(urls) == 0
    assert any(r.status == "parse_error" for r in records)
