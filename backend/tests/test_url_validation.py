"""Tests for URL validation, SSRF protections, and normalization."""

import socket
import pytest
from unittest.mock import patch

from app.core.errors import DisallowedURLError, DNSResolutionError
from app.services.url_validation import validate_and_normalize_url


def test_valid_http_and_https_urls():
    v1 = validate_and_normalize_url("https://example.com", check_dns=False)
    assert v1.normalized_url == "https://example.com/"
    assert v1.hostname == "example.com"

    v2 = validate_and_normalize_url("http://sub.domain.org/path/test?q=1#fragment", check_dns=False)
    assert v2.normalized_url == "http://sub.domain.org/path/test?q=1"
    assert v2.hostname == "sub.domain.org"


def test_strip_default_ports():
    v1 = validate_and_normalize_url("http://example.com:80/page", check_dns=False)
    assert v1.normalized_url == "http://example.com/page"

    v2 = validate_and_normalize_url("https://example.com:443/page", check_dns=False)
    assert v2.normalized_url == "https://example.com/page"

    v3 = validate_and_normalize_url("https://example.com:8443/page", check_dns=False)
    assert v3.normalized_url == "https://example.com:8443/page"


def test_reject_disallowed_schemes():
    for bad_url in [
        "ftp://example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "data:text/html,test",
        "ws://example.com",
    ]:
        with pytest.raises(DisallowedURLError) as exc_info:
            validate_and_normalize_url(bad_url, check_dns=False)
        assert "disallowed" in exc_info.value.message.lower()


def test_reject_userinfo_credentials():
    with pytest.raises(DisallowedURLError) as exc_info:
        validate_and_normalize_url("https://admin:secret@example.com", check_dns=False)
    assert "credentials" in exc_info.value.message.lower()


def test_reject_excessive_url_length():
    long_url = "https://example.com/" + ("a" * 2050)
    with pytest.raises(DisallowedURLError) as exc_info:
        validate_and_normalize_url(long_url, check_dns=False)
    assert "exceeds maximum allowed length" in exc_info.value.message.lower()


def test_reject_forbidden_hostnames():
    for host in ["http://localhost", "https://localhost:8080", "http://app.localhost", "http://metadata.google.internal"]:
        with pytest.raises(DisallowedURLError):
            validate_and_normalize_url(host, check_dns=False)


def test_reject_ip_literals_in_private_ranges():
    bad_ips = [
        "http://127.0.0.1",
        "http://127.0.0.1:8000",
        "http://10.0.0.1",
        "http://172.16.0.1",
        "http://192.168.1.1",
        "http://169.254.169.254",  # Cloud metadata
        "http://0.0.0.0",
        "http://[::1]",
        "http://[fc00::1]",
        "http://[fe80::1]",
    ]
    for url in bad_ips:
        with pytest.raises(DisallowedURLError) as exc_info:
            validate_and_normalize_url(url, check_dns=False)
        assert "private" in exc_info.value.message.lower() or "disallowed" in exc_info.value.message.lower()


def test_dns_resolution_failure():
    with patch("socket.getaddrinfo", side_effect=socket.gaierror(socket.EAI_NONAME, "Name or service not known")):
        with pytest.raises(DNSResolutionError) as exc_info:
            validate_and_normalize_url("https://definitely-non-existent-domain-12345.org", check_dns=True)
        assert "DNS resolution failed" in exc_info.value.message


def test_dns_resolution_to_private_ip():
    # Domain that resolves to 127.0.0.1 (simulated SSRF attempt)
    fake_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))
    ]
    with patch("socket.getaddrinfo", return_value=fake_addr_info):
        with pytest.raises(DisallowedURLError) as exc_info:
            validate_and_normalize_url("https://rebinding-attack.com", check_dns=True)
        assert "resolved to disallowed/private IP address" in exc_info.value.message


def test_dns_resolution_to_public_ip():
    # Valid public domain
    fake_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))
    ]
    with patch("socket.getaddrinfo", return_value=fake_addr_info):
        validated = validate_and_normalize_url("https://example.com/test", check_dns=True)
        assert validated.normalized_url == "https://example.com/test"
        assert validated.hostname == "example.com"
