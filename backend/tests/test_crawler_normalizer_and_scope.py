"""Tests for URL normalization, scope enforcement, and crawl queue management."""

import pytest
from app.crawler.discovery import CrawlQueue
from app.crawler.normalizer import normalize_url
from app.crawler.policies import CrawlConfig
from app.crawler.scope import CrawlScope


def test_url_normalization_basic():
    assert normalize_url("https://Example.COM:443/path/to/page/") == "https://example.com/path/to/page/"
    assert normalize_url("http://example.com:80/") == "http://example.com/"
    assert normalize_url("https://example.com/foo#section1") == "https://example.com/foo"
    assert normalize_url("https://example.com/a/b/../c") == "https://example.com/a/c"
    assert normalize_url("https://example.com//double//slashes") == "https://example.com/double/slashes"


def test_relative_url_resolution():
    base = "https://example.com/blog/article-1"
    assert normalize_url("article-2", base_url=base) == "https://example.com/blog/article-2"
    assert normalize_url("/about", base_url=base) == "https://example.com/about"
    assert normalize_url("../contact", base_url=base) == "https://example.com/contact"
    assert normalize_url("?page=2", base_url=base) == "https://example.com/blog/article-1?page=2"


def test_query_parameters_sorting():
    url = "https://example.com/search?q=seo&page=2&sort=asc"
    normalized = normalize_url(url)
    assert normalized == "https://example.com/search?page=2&q=seo&sort=asc"


def test_invalid_and_non_http_schemes():
    assert normalize_url("javascript:alert(1)") is None
    assert normalize_url("mailto:user@example.com") is None
    assert normalize_url("ftp://example.com/file") is None
    assert normalize_url("data:text/html,<b>hi</b>") is None
    assert normalize_url("http://user:pass@example.com/") is None  # embedded credentials rejected


def test_scope_enforcement():
    scope = CrawlScope("https://target.com")

    # In scope
    assert scope.is_in_scope("https://target.com/page") is True
    assert scope.is_in_scope("http://target.com/about") is True
    assert scope.is_in_scope("https://target.com:443/") is True

    # Out of scope
    assert scope.is_in_scope("https://otherdomain.com") is False
    assert scope.is_in_scope("https://sub.target.com") is False  # subdomains excluded by default
    assert scope.is_in_scope("https://target.com.attacker.com") is False  # attacker suffix rejected
    assert scope.is_in_scope("https://target.com:8080/") is False  # non-standard port rejected
    assert scope.is_in_scope("https://user:pass@target.com/") is False  # credentials rejected
    assert scope.is_in_scope("ftp://target.com/") is False


def test_subdomain_exclusion():
    scope_strict = CrawlScope("https://example.com", include_subdomains=False)
    assert scope_strict.is_in_scope("https://blog.example.com") is False
    assert scope_strict.is_in_scope("https://api.example.com") is False

    scope_subs = CrawlScope("https://example.com", include_subdomains=True)
    assert scope_subs.is_in_scope("https://blog.example.com") is True
    assert scope_subs.is_in_scope("https://example.com.evil.com") is False


def test_crawl_queue_deduplication_and_limits():
    scope = CrawlScope("https://example.com")
    config = CrawlConfig(max_pages=10, max_depth=2)
    queue = CrawlQueue(scope, config)

    # Initial push
    assert queue.push("https://example.com/", depth=0) is True
    assert len(queue) == 1

    # Duplicate push rejected
    assert queue.push("https://example.com/", depth=0) is False
    assert queue.skipped_reasons["duplicate"] == 1
    assert len(queue) == 1

    # Out of scope rejected
    assert queue.push("https://external.com/", depth=1) is False
    assert queue.skipped_reasons["out_of_scope"] == 1

    # Depth beyond max_depth (2) rejected
    assert queue.push("https://example.com/deep", depth=3) is False
    assert queue.skipped_reasons["depth_limit"] == 1

    # Pop FIFO
    item = queue.pop()
    assert item is not None
    assert item.url == "https://example.com/"
    assert item.depth == 0
    assert len(queue) == 0
