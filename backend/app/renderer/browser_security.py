"""Browser-level security policies, Chromium flags, and route interception."""

from typing import List, Optional, Set
from urllib.parse import urlparse
from playwright.async_api import BrowserContext, Route, Request

from app.crawler.secure_transport import is_public_ip
import ipaddress


BLOCKED_SCHEMES = {"file", "chrome", "javascript", "about", "ws", "wss"}
SAFE_DATA_PREFIXES = ("data:image/", "data:text/css")


class BrowserSecurityManager:
    """Manages browser process hardening and context-level request routing."""

    @staticmethod
    def get_secure_chromium_args(proxy_server: Optional[str] = None) -> List[str]:
        """Chromium command line flags disabling unnecessary network/system mechanisms."""
        args = [
            "--disable-local-storage",
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-default-apps",
            "--mute-audio",
            "--no-default-browser-check",
            "--disable-background-networking",
            "--disable-sync",
            "--disable-translate",
            "--disable-component-update",
            "--disable-domain-reliability",
            "--disable-client-side-phishing-detection",
        ]
        if proxy_server:
            args.append(f"--proxy-server={proxy_server}")
        return args

    @staticmethod
    def get_secure_context_options(proxy_server: Optional[str] = None) -> dict:
        """Context options enforcing strict permissions, TLS check, and download blocking."""
        opts = {
            "accept_downloads": False,
            "permissions": [],
            "ignore_https_errors": False,  # Preserves TLS certificate verification!
            "bypass_csp": False,          # Enforces Content Security Policy
            "service_workers": "block",
            "viewport": {"width": 1280, "height": 800},
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 SiteAuditBot/1.4",
        }
        if proxy_server:
            opts["proxy"] = {"server": proxy_server}
        return opts

    @classmethod
    async def setup_route_interception(
        cls,
        context: BrowserContext,
        allowed_schemes: Optional[Set[str]] = None,
        allowed_ports: Optional[Set[int]] = None,
        allow_local_fixtures: bool = False,
    ) -> None:
        """Register context-wide route handler as defense-in-depth security boundary."""
        schemes = allowed_schemes or {"http", "https"}
        ports = allowed_ports or {80, 443}

        async def route_handler(route: Route, request: Request):
            url = request.url
            parsed = urlparse(url)
            scheme = (parsed.scheme or "").lower()

            # 1. Scheme checks
            if scheme in BLOCKED_SCHEMES:
                await route.abort("blockedbyclient")
                return

            if scheme == "data":
                if any(url.startswith(prefix) for prefix in SAFE_DATA_PREFIXES):
                    await route.continue_()
                    return
                await route.abort("blockedbyclient")
                return

            if scheme not in schemes:
                await route.abort("blockedbyclient")
                return

            # 2. Port checks
            port = parsed.port or (443 if scheme == "https" else 80)
            if not allow_local_fixtures and port not in ports:
                await route.abort("blockedbyclient")
                return

            # 3. Direct IP literal check in URL hostname
            hostname = parsed.hostname or ""
            if not allow_local_fixtures:
                try:
                    ip_obj = ipaddress.ip_address(hostname)
                    if not is_public_ip(ip_obj):
                        await route.abort("blockedbyclient")
                        return
                except ValueError:
                    pass  # Domain name, handled by proxy / resolver

            await route.continue_()

        await context.route("**/*", route_handler)
