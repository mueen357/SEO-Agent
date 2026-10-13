"""Tests for browser network security boundary, egress proxy, and flags (Phase 1.4B)."""

import asyncio
import socket
import pytest
from app.renderer.browser_security import BrowserSecurityManager
from app.renderer.egress_proxy import ValidatingEgressProxy


def test_chromium_launch_and_context_security_options():
    """Verify Chromium flags and context options enforce TLS validation and block permissions."""
    args = BrowserSecurityManager.get_secure_chromium_args(proxy_server="http://127.0.0.1:8888")
    assert "--disable-local-storage" in args
    assert "--disable-extensions" in args
    assert "--no-default-browser-check" in args
    assert "--proxy-server=http://127.0.0.1:8888" in args

    opts = BrowserSecurityManager.get_secure_context_options(proxy_server="http://127.0.0.1:8888")
    assert opts["accept_downloads"] is False
    assert opts["permissions"] == []
    assert opts["ignore_https_errors"] is False  # Must preserve TLS certificate verification!
    assert opts["bypass_csp"] is False          # Must enforce Content Security Policy!
    assert opts["service_workers"] == "block"
    assert opts["proxy"]["server"] == "http://127.0.0.1:8888"


@pytest.mark.asyncio
async def test_validating_egress_proxy_blocks_loopback_and_metadata():
    """Egress proxy must reject loopback, link-local, private, and cloud metadata targets."""
    proxy = ValidatingEgressProxy(host="127.0.0.1", port=0, allowed_ports={80, 443})
    port = await proxy.start()
    assert port > 0

    try:
        # Test 1: Loopback IP
        valid, _, err = await proxy._validate_destination("127.0.0.1", 80)
        assert valid is False
        assert "restricted IP" in err

        # Test 2: Cloud Metadata IP (169.254.169.254)
        valid, _, err = await proxy._validate_destination("169.254.169.254", 80)
        assert valid is False
        assert "restricted IP" in err

        # Test 3: Private RFC 1918 IPs
        valid, _, err = await proxy._validate_destination("10.0.0.1", 80)
        assert valid is False
        assert "restricted IP" in err

        valid, _, err = await proxy._validate_destination("192.168.1.1", 443)
        assert valid is False
        assert "restricted IP" in err

        # Test 4: Prohibited Port (e.g. 22 SSH or 8080)
        valid, _, err = await proxy._validate_destination("example.com", 22)
        assert valid is False
        assert "Port 22 is not in permitted" in err

        # Test 5: Local fixture override
        proxy_fixture = ValidatingEgressProxy(
            host="127.0.0.1",
            port=0,
            allow_local_fixtures=True,
            allowed_fixture_hosts={"127.0.0.1"},
        )
        valid_fix, ip_fix, _ = await proxy_fixture._validate_destination("127.0.0.1", 8000)
        assert valid_fix is True
        assert ip_fix == "127.0.0.1"

    finally:
        await proxy.stop()


@pytest.mark.asyncio
async def test_proxy_connect_tunnel_rejection_http_response():
    """Client attempting CONNECT to a blocked destination receives 403 Forbidden."""
    proxy = ValidatingEgressProxy(host="127.0.0.1", port=0, allowed_ports={80, 443})
    port = await proxy.start()

    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        # Attempt CONNECT to cloud metadata endpoint
        writer.write(b"CONNECT 169.254.169.254:80 HTTP/1.1\r\nHost: 169.254.169.254:80\r\n\r\n")
        await writer.drain()

        response = await reader.read(1024)
        assert b"403 Forbidden" in response
        assert b"SSRF Blocked" in response

        writer.close()
        await writer.wait_closed()
    finally:
        await proxy.stop()
