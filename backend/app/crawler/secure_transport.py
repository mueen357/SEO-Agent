"""SSRF-protected socket connector and DNS pinning resolver.

Enforces strict public IP validation on all resolved addresses to prevent SSRF
and DNS rebinding (TOCTOU) attacks while retaining HTTPS certificate validation.
"""

import asyncio
import ipaddress
import socket
from typing import Any
import aiohttp
from aiohttp.abc import AbstractResolver


class SSRFSecurityError(Exception):
    """Raised when an outbound connection destination resolves to a restricted address."""
    pass


# Disallowed IPv4 and IPv6 network blocks
BLOCKED_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),          # Current network (local identification)
    ipaddress.ip_network("10.0.0.0/8"),         # Private RFC 1918
    ipaddress.ip_network("100.64.0.0/10"),      # Shared Address Space (CGNAT)
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback
    ipaddress.ip_network("169.254.0.0/16"),     # Link-Local & Cloud Metadata (169.254.169.254)
    ipaddress.ip_network("172.16.0.0/12"),      # Private RFC 1918
    ipaddress.ip_network("192.0.0.0/24"),       # IETF Protocol Assignments
    ipaddress.ip_network("192.0.2.0/24"),       # Documentation (TEST-NET-1)
    ipaddress.ip_network("192.88.99.0/24"),     # 6to4 Relay Anycast
    ipaddress.ip_network("192.168.0.0/16"),     # Private RFC 1918
    ipaddress.ip_network("198.18.0.0/15"),      # Benchmarking
    ipaddress.ip_network("198.51.100.0/24"),    # Documentation (TEST-NET-2)
    ipaddress.ip_network("203.0.113.0/24"),     # Documentation (TEST-NET-3)
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved for future use
    ipaddress.ip_network("255.255.255.255/32"), # Broadcast
    # IPv6 blocked ranges
    ipaddress.ip_network("::1/128"),            # Loopback
    ipaddress.ip_network("::/128"),             # Unspecified
    ipaddress.ip_network("fe80::/10"),          # Link-Local Unicast
    ipaddress.ip_network("fc00::/7"),           # Unique Local Address (ULA)
    ipaddress.ip_network("ff00::/8"),           # Multicast
    ipaddress.ip_network("2001:db8::/32"),      # Documentation
]


def is_public_ip(ip_addr: str | ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Return True only if the IP address is publicly routable and not reserved."""
    if not isinstance(ip_addr, (ipaddress.IPv4Address, ipaddress.IPv6Address)):
        try:
            ip = ipaddress.ip_address(str(ip_addr).strip())
        except ValueError:
            return False
    else:
        ip = ip_addr

    # Unwrap IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped

    # Check built-in properties
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
        return False

    # Check explicit blocked networks
    for net in BLOCKED_NETWORKS:
        if ip in net:
            return False

    return True


class ValidatedDNSResolver(AbstractResolver):
    """Custom aiohttp DNS resolver that validates every candidate IP address."""

    async def resolve(
        self, host: str, port: int = 0, family: int = socket.AF_UNSPEC
    ) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        try:
            addr_infos = await loop.getaddrinfo(
                host, port, family=family, type=socket.SOCK_STREAM
            )
        except Exception as e:
            raise OSError(f"DNS resolution failed for '{host}': {e}") from e

        if not addr_infos:
            raise OSError(f"No DNS records found for '{host}'")

        validated_hosts: list[dict[str, Any]] = []

        # Validate EVERY candidate address. Reject completely if any is disallowed.
        for fam, _, proto, _, sockaddr in addr_infos:
            ip_str = sockaddr[0]
            if not is_public_ip(ip_str):
                raise SSRFSecurityError(
                    f"Destination '{host}' resolved to restricted address '{ip_str}'"
                )

            validated_hosts.append({
                "hostname": host,
                "host": ip_str,
                "port": sockaddr[1],
                "family": fam,
                "proto": proto,
                "flags": 0,
            })

        return validated_hosts

    async def close(self) -> None:
        pass


def create_secure_connector(
    resolver: AbstractResolver | None = None,
) -> aiohttp.TCPConnector:
    """Create an aiohttp TCPConnector with DNS validation and strict TLS checks."""
    res = resolver or ValidatedDNSResolver()
    return aiohttp.TCPConnector(
        resolver=res,
        ssl=True,  # Mandatory TLS certificate validation
        limit_per_host=1,
        enable_cleanup_closed=True,
        force_close=False,
    )
