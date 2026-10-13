"""Safe URL validation and SSRF protection service.

CRITICAL SECURITY NOTICE:
Initial DNS resolution implemented here is a pre-flight sanity check to reject
obviously private, loopback, or metadata addresses prior to job creation.
Initial DNS resolution alone IS NOT sufficient to prevent all SSRF or DNS rebinding
attacks. When the actual web crawler and HTTP scraper are implemented in later phases,
the crawler MUST revalidate the resolved destination IP address on every redirect
hop and immediately before establishing socket connections.
"""

import ipaddress
import socket
from urllib.parse import urlparse, urlunparse
from app.config import get_settings
from app.core.errors import DisallowedURLError, DNSResolutionError

# Disallowed IPv4 network definitions
DISALLOWED_IPV4_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),          # Current network (RFC 791)
    ipaddress.ip_network("10.0.0.0/8"),         # Private-Use (RFC 1918)
    ipaddress.ip_network("100.64.0.0/10"),      # Shared Address Space (RFC 6598)
    ipaddress.ip_network("127.0.0.0/8"),        # Loopback (RFC 1122)
    ipaddress.ip_network("169.254.0.0/16"),     # Link Local / APIPA (RFC 3927)
    ipaddress.ip_network("172.16.0.0/12"),      # Private-Use (RFC 1918)
    ipaddress.ip_network("192.0.0.0/24"),       # IETF Protocol Assignments (RFC 6890)
    ipaddress.ip_network("192.0.2.0/24"),       # Documentation / TEST-NET-1 (RFC 5737)
    ipaddress.ip_network("192.88.99.0/24"),     # 6to4 Relay Anycast (RFC 7526)
    ipaddress.ip_network("192.168.0.0/16"),     # Private-Use (RFC 1918)
    ipaddress.ip_network("198.18.0.0/15"),      # Benchmarking (RFC 2544)
    ipaddress.ip_network("198.51.100.0/24"),    # Documentation / TEST-NET-2 (RFC 5737)
    ipaddress.ip_network("203.0.113.0/24"),     # Documentation / TEST-NET-3 (RFC 5737)
    ipaddress.ip_network("224.0.0.0/4"),        # Multicast (RFC 5771)
    ipaddress.ip_network("240.0.0.0/4"),        # Reserved for Future Use (RFC 1112)
    ipaddress.ip_network("255.255.255.255/32"), # Limited Broadcast (RFC 919)
]

# Disallowed IPv6 network definitions
DISALLOWED_IPV6_NETWORKS = [
    ipaddress.ip_network("::1/128"),            # Loopback
    ipaddress.ip_network("::/128"),             # Unspecified
    ipaddress.ip_network("fc00::/7"),           # Unique Local (RFC 4193)
    ipaddress.ip_network("fe80::/10"),          # Link-Local Unicast (RFC 4291)
    ipaddress.ip_network("ff00::/8"),           # Multicast (RFC 4291)
    ipaddress.ip_network("2001:db8::/32"),      # Documentation
    ipaddress.ip_network("100::/64"),           # Discard prefix
]

FORBIDDEN_HOSTNAMES = {
    "localhost",
    "metadata.google.internal",
    "metadata.internal",
    "instance-data",
}


def is_ip_disallowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """Check whether an IP address belongs to any private, loopback, or reserved ranges."""
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
        return True

    if isinstance(ip, ipaddress.IPv4Address):
        for net in DISALLOWED_IPV4_NETWORKS:
            if ip in net:
                return True
    elif isinstance(ip, ipaddress.IPv6Address):
        for net in DISALLOWED_IPV6_NETWORKS:
            if ip in net:
                return True

    return False


class ValidatedURL:
    def __init__(self, target_url: str, normalized_url: str, hostname: str):
        self.target_url = target_url
        self.normalized_url = normalized_url
        self.hostname = hostname


def validate_and_normalize_url(url: str, check_dns: bool = True) -> ValidatedURL:
    """Validate that a URL is a safe, publicly reachable HTTP/HTTPS URL and return normalized details.

    Performs:
    1. Length validation (<= 2048 characters)
    2. Scheme validation (only HTTP and HTTPS allowed)
    3. Userinfo check (credentials embedded in URL rejected)
    4. Hostname format & forbidden string checks
    5. Direct IP literal range checks
    6. DNS resolution & IP range checks (fails safely on DNS errors)
    7. Canonical URL normalization
    """
    settings = get_settings()

    if not url or not isinstance(url, str):
        raise DisallowedURLError("URL must be a non-empty string.")

    cleaned_url = url.strip()

    if len(cleaned_url) > settings.url_max_length:
        raise DisallowedURLError(f"URL exceeds maximum allowed length of {settings.url_max_length} characters.")

    try:
        parsed = urlparse(cleaned_url)
    except Exception as exc:
        raise DisallowedURLError(f"Malformed URL structure: {exc}")

    # 1. Scheme check
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise DisallowedURLError(f"Scheme '{parsed.scheme}' is disallowed. Only 'http' and 'https' are permitted.")

    # 2. Embedded credentials check
    if parsed.username or parsed.password:
        raise DisallowedURLError("URLs with embedded credentials (username/password) are disallowed.")

    # 3. Hostname presence check
    hostname = parsed.hostname
    if not hostname:
        raise DisallowedURLError("URL must include a valid hostname.")

    hostname_lower = hostname.lower()

    # 4. Forbidden hostnames
    if hostname_lower in FORBIDDEN_HOSTNAMES or hostname_lower.endswith(".localhost"):
        raise DisallowedURLError(f"Hostname '{hostname}' refers to local or metadata service and is disallowed.")

    # 5. Check if hostname is an IP literal
    try:
        ip_literal = ipaddress.ip_address(hostname_lower)
        if is_ip_disallowed(ip_literal):
            raise DisallowedURLError(f"IP address '{hostname}' is in a private, loopback, or reserved range.")
    except ValueError:
        # Not an IP literal; it is a domain name. Proceed to DNS check.
        if check_dns:
            _validate_hostname_dns(hostname_lower)

    # 6. Normalize URL
    # Normalize path (ensure at least "/")
    path = parsed.path if parsed.path else "/"
    # Strip default ports (80 for http, 443 for https)
    port = parsed.port
    netloc = hostname_lower
    if port:
        if not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
            netloc = f"{hostname_lower}:{port}"

    # Strip fragments (#), preserve query string
    normalized_url = urlunparse((
        scheme,
        netloc,
        path,
        parsed.params,
        parsed.query,
        ""  # fragment removed
    ))

    return ValidatedURL(
        target_url=cleaned_url,
        normalized_url=normalized_url,
        hostname=hostname_lower
    )


def _validate_hostname_dns(hostname: str) -> None:
    """Resolve domain name via DNS and ensure none of the resolved IPs are in disallowed ranges."""
    settings = get_settings()
    original_timeout = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(settings.dns_timeout_seconds)
        # Query for both IPv4 and IPv6 addresses
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise DNSResolutionError(f"DNS resolution failed for hostname '{hostname}': {e.strerror or 'domain does not exist'}")
    except socket.timeout:
        raise DNSResolutionError(f"DNS resolution timed out for hostname '{hostname}' after {settings.dns_timeout_seconds}s.")
    except Exception as e:
        raise DNSResolutionError(f"DNS lookup error for hostname '{hostname}': {str(e)}")
    finally:
        socket.setdefaulttimeout(original_timeout)

    if not addr_info:
        raise DNSResolutionError(f"No IP addresses resolved for hostname '{hostname}'.")

    resolved_ips = []
    for family, socktype, proto, canonname, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            resolved_ips.append(ip_obj)
            if is_ip_disallowed(ip_obj):
                raise DisallowedURLError(
                    f"Hostname '{hostname}' resolved to disallowed/private IP address '{ip_str}'."
                )
        except ValueError:
            continue

    if not resolved_ips:
        raise DNSResolutionError(f"Hostname '{hostname}' did not yield valid IP addresses.")
