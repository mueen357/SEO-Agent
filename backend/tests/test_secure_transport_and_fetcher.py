"""Tests for SSRF prevention, validated DNS resolver, and secure HTTP fetcher."""

import asyncio
import socket
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from app.crawler.fetcher import SecureHTTPFetcher
from app.crawler.policies import CrawlConfig, FetchResult
from app.crawler.scope import CrawlScope
from app.crawler.secure_transport import (
    SSRFSecurityError,
    ValidatedDNSResolver,
    is_public_ip,
)


def test_is_public_ip_ipv4_restrictions():
    # Disallowed IPs
    assert is_public_ip("127.0.0.1") is False
    assert is_public_ip("127.1.2.3") is False
    assert is_public_ip("10.0.0.1") is False
    assert is_public_ip("192.168.1.1") is False
    assert is_public_ip("172.16.0.1") is False
    assert is_public_ip("172.31.255.254") is False
    assert is_public_ip("169.254.169.254") is False  # Cloud metadata
    assert is_public_ip("169.254.169.123") is False
    assert is_public_ip("100.64.0.1") is False       # CGNAT
    assert is_public_ip("198.18.0.1") is False       # Benchmarking
    assert is_public_ip("0.0.0.0") is False
    assert is_public_ip("255.255.255.255") is False

    # Allowed public IPs
    assert is_public_ip("8.8.8.8") is True
    assert is_public_ip("1.1.1.1") is True
    assert is_public_ip("93.184.216.34") is True


def test_is_public_ip_ipv6_restrictions():
    # Disallowed IPv6
    assert is_public_ip("::1") is False
    assert is_public_ip("fe80::1") is False
    assert is_public_ip("fc00::1") is False
    assert is_public_ip("::ffff:127.0.0.1") is False
    assert is_public_ip("::ffff:169.254.169.254") is False
    assert is_public_ip("::ffff:10.0.0.1") is False

    # Allowed public IPv6
    assert is_public_ip("2606:2800:220:1:248:1893:25c8:1946") is True


@pytest.mark.asyncio
async def test_validated_dns_resolver_rejects_restricted_ips():
    resolver = ValidatedDNSResolver()

    # Rejection of 127.0.0.1
    mock_loop = MagicMock()
    mock_loop.getaddrinfo = AsyncMock(return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443)),
    ])

    with patch("asyncio.get_running_loop", return_value=mock_loop):
        with pytest.raises(SSRFSecurityError, match="restricted address"):
            await resolver.resolve("localhost", 443)


@pytest.mark.asyncio
async def test_validated_dns_resolver_dns_rebinding_prevention():
    resolver = ValidatedDNSResolver()

    # If any candidate IP is private, the entire resolution must be rejected
    mock_loop = MagicMock()
    mock_loop.getaddrinfo = AsyncMock(return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 443)),
    ])

    with patch("asyncio.get_running_loop", return_value=mock_loop):
        with pytest.raises(SSRFSecurityError, match="restricted address"):
            await resolver.resolve("attacker.com", 443)


@pytest.mark.asyncio
async def test_validated_dns_resolver_allows_valid_public_ips():
    resolver = ValidatedDNSResolver()

    mock_loop = MagicMock()
    mock_loop.getaddrinfo = AsyncMock(return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
    ])

    with patch("asyncio.get_running_loop", return_value=mock_loop):
        res = await resolver.resolve("example.com", 443)
        assert len(res) == 1
        assert res[0]["host"] == "93.184.216.34"


@pytest.mark.asyncio
async def test_fetcher_scope_and_cross_host_redirect_rejection():
    fetcher = SecureHTTPFetcher()
    scope = CrawlScope("https://example.com")
    config = CrawlConfig()

    # Direct out of scope request rejected immediately
    res = await fetcher.fetch("https://evil.com/page", scope, config)
    assert res.fetch_status == "scope_blocked"
    assert "outside authorized crawl scope" in res.error_message


@pytest.mark.asyncio
async def test_fetcher_redirect_loop_detection():
    fetcher = SecureHTTPFetcher()
    scope = CrawlScope("https://example.com")
    config = CrawlConfig(max_redirects=5)

    # Mock responses: A -> B -> A
    class MockResponse:
        def __init__(self, status, location):
            self.status = status
            self.headers = {"Location": location}
            self.content_type = "text/html"
            self.content = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    mock_session = MagicMock()
    # First call: /a -> /b; Second call: /b -> /a
    mock_session.get.side_effect = [
        MockResponse(301, "https://example.com/b"),
        MockResponse(301, "https://example.com/a"),
    ]

    mock_session.closed = False
    fetcher._session = mock_session
    fetcher._owns_session = False

    res = await fetcher.fetch("https://example.com/a", scope, config)
    assert res.fetch_status == "network_error"
    assert "Redirect loop detected" in res.error_message


@pytest.mark.asyncio
async def test_fetcher_max_redirects_exceeded():
    fetcher = SecureHTTPFetcher()
    scope = CrawlScope("https://example.com")
    config = CrawlConfig(max_redirects=2)

    class MockResponse:
        def __init__(self, location):
            self.status = 302
            self.headers = {"Location": location}
            self.content_type = "text/html"
            self.content = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    mock_session = MagicMock()
    mock_session.get.side_effect = [
        MockResponse("https://example.com/r1"),
        MockResponse("https://example.com/r2"),
        MockResponse("https://example.com/r3"),
    ]

    mock_session.closed = False
    fetcher._session = mock_session
    fetcher._owns_session = False

    res = await fetcher.fetch("https://example.com/start", scope, config)
    assert res.fetch_status == "network_error"
    assert "Exceeded maximum redirects" in res.error_message


@pytest.mark.asyncio
async def test_fetcher_response_size_limit_content_length():
    fetcher = SecureHTTPFetcher()
    scope = CrawlScope("https://example.com")
    config = CrawlConfig(max_response_bytes=1000)

    class MockResponse:
        def __init__(self):
            self.status = 200
            self.headers = {"Content-Length": "500000"}
            self.content_type = "text/html"
            self.content = AsyncMock()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

    mock_session = MagicMock()
    mock_session.get.return_value = MockResponse()

    mock_session.closed = False
    fetcher._session = mock_session
    fetcher._owns_session = False

    res = await fetcher.fetch("https://example.com/big", scope, config)
    assert res.fetch_status == "size_exceeded"
