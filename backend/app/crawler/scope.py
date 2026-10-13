"""Target website scope definition and enforcement."""

from urllib.parse import urlsplit


class CrawlScope:
    """Enforces strict hostname and protocol boundaries for crawling."""

    def __init__(self, target_url: str, include_subdomains: bool = False) -> None:
        parts = urlsplit(target_url.strip())
        if parts.scheme.lower() not in ("http", "https"):
            raise ValueError(f"Invalid crawl target scheme: {parts.scheme}")
        if not parts.hostname:
            raise ValueError(f"Invalid crawl target hostname: {target_url}")

        self.scheme = parts.scheme.lower()
        self.target_host = parts.hostname.lower()
        self.target_port = parts.port or (443 if self.scheme == "https" else 80)
        self.include_subdomains = include_subdomains

    def is_in_scope(self, url: str) -> bool:
        """Verify whether a candidate URL belongs strictly to the target scope."""
        if not url:
            return False

        try:
            parts = urlsplit(url.strip())
        except Exception:
            return False

        # Protocol check
        scheme = parts.scheme.lower()
        if scheme not in ("http", "https"):
            return False

        # Embedded credentials rejection
        if parts.username or parts.password:
            return False

        candidate_host = (parts.hostname or "").lower()
        if not candidate_host:
            return False

        # Port restrictions (strictly 80 and 443)
        candidate_port = parts.port or (443 if scheme == "https" else 80)
        if candidate_port not in (80, 443):
            return False

        # Hostname matching
        if not self.include_subdomains:
            # Exact hostname match required
            return candidate_host == self.target_host

        # If subdomains allowed in future, enforce strict suffix with boundary
        if candidate_host == self.target_host:
            return True
        if candidate_host.endswith("." + self.target_host):
            return True

        return False
