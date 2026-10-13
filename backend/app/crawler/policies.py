"""Crawl configuration and result policies for the website audit crawler."""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CrawlConfig:
    """Bounded configuration policies for a crawl session."""

    max_pages: int = 50
    max_depth: int = 3
    request_timeout: float = 15.0
    max_redirects: int = 5
    max_response_bytes: int = 5 * 1024 * 1024  # 5 MB
    per_host_concurrency: int = 1
    requests_per_second: float = 1.0
    user_agent: str = (
        "SiteAuditAI-Crawler/1.0 (+https://example.com/bot; security-audit)"
    )
    retry_count: int = 2
    include_subdomains: bool = False
    respect_robots_txt: bool = True
    parse_sitemaps: bool = True
    max_sitemaps: int = 20
    max_sitemap_urls: int = 1000

    def validate(self) -> "CrawlConfig":
        """Validate and clamp configuration parameters within safe boundaries."""
        clamped_pages = max(1, min(self.max_pages, 500))
        clamped_depth = max(0, min(self.max_depth, 10))
        clamped_timeout = max(2.0, min(self.request_timeout, 60.0))
        clamped_redirects = max(0, min(self.max_redirects, 10))
        clamped_bytes = max(100 * 1024, min(self.max_response_bytes, 25 * 1024 * 1024))
        clamped_rps = max(0.1, min(self.requests_per_second, 10.0))
        clamped_retries = max(0, min(self.retry_count, 5))

        return CrawlConfig(
            max_pages=clamped_pages,
            max_depth=clamped_depth,
            request_timeout=clamped_timeout,
            max_redirects=clamped_redirects,
            max_response_bytes=clamped_bytes,
            per_host_concurrency=1,
            requests_per_second=clamped_rps,
            user_agent=self.user_agent,
            retry_count=clamped_retries,
            include_subdomains=False,  # Subdomains strictly excluded in 1.4A
            respect_robots_txt=self.respect_robots_txt,
            parse_sitemaps=self.parse_sitemaps,
            max_sitemaps=self.max_sitemaps,
            max_sitemap_urls=self.max_sitemap_urls,
        )


@dataclass
class FetchResult:
    """Structured result of an outbound HTTP fetch attempt."""

    requested_url: str
    final_url: str
    fetch_status: str  # success, http_error, timeout, network_error, ssrf_blocked, size_exceeded, scope_blocked, robots_blocked
    http_status: int | None = None
    content_type: str | None = None
    response_time_ms: int = 0
    redirect_chain: list[dict[str, Any]] = field(default_factory=list)
    body: bytes | None = None
    error_message: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
