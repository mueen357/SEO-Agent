"""Audit execution context holding crawled and rendered page evidence."""

import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urlparse

from app.database.models import CrawlLink, CrawlPage, CrawlPageRender, CrawlSitemap


@dataclass
class PageAuditContext:
    """Contextual evidence for auditing an individual crawled page."""

    page: CrawlPage
    render: Optional[CrawlPageRender] = None
    links: List[CrawlLink] = field(default_factory=list)
    audit_target_url: str = ""
    audit_hostname: str = ""

    # Cross-page and site evidence
    all_pages: Optional[List[CrawlPage]] = None
    url_to_page: Dict[str, CrawlPage] = field(default_factory=dict)
    sitemaps: List[CrawlSitemap] = field(default_factory=list)
    sitemap_urls: Set[str] = field(default_factory=set)
    robots_txt_status: Optional[str] = None
    robots_txt_content: Optional[str] = None
    response_headers: Optional[Dict[str, str]] = None

    @property
    def url(self) -> str:
        return self.page.final_url or self.page.requested_url

    @property
    def http_status(self) -> Optional[int]:
        return self.page.http_status

    @property
    def is_success(self) -> bool:
        return self.page.fetch_status == "success" and self.page.http_status == 200

    @property
    def effective_title(self) -> Optional[str]:
        if self.render and self.render.rendered_title:
            return self.render.rendered_title.strip()
        if self.page.title:
            return self.page.title.strip()
        return None

    @property
    def effective_meta_description(self) -> Optional[str]:
        if self.render and self.render.rendered_meta_description:
            return self.render.rendered_meta_description.strip()
        if self.page.meta_description:
            return self.page.meta_description.strip()
        return None

    @property
    def effective_canonical_url(self) -> Optional[str]:
        if self.render and self.render.rendered_canonical_url:
            return self.render.rendered_canonical_url.strip()
        if self.page.canonical_url:
            return self.page.canonical_url.strip()
        return None

    @property
    def effective_meta_robots(self) -> Optional[str]:
        if self.render and self.render.rendered_meta_robots:
            return self.render.rendered_meta_robots.strip()
        if self.page.meta_robots:
            return self.page.meta_robots.strip()
        return None

    @property
    def source_type(self) -> str:
        if self.render and self.render.render_status == "success":
            return "rendered_browser"
        return "raw_http"

    @property
    def headings_json(self) -> Dict[str, Any]:
        return self.page.headings_json or {}

    @property
    def headers(self) -> Dict[str, str]:
        raw = self.response_headers or getattr(self.page, "headers_json", None) or {}
        return {str(k).lower(): str(v) for k, v in raw.items()}

    @property
    def canonical_tag_count(self) -> Optional[int]:
        return getattr(self.page, "canonical_tag_count", None)

    @property
    def canonical_hrefs(self) -> List[str]:
        return getattr(self.page, "canonical_hrefs_json", None) or []

    @property
    def redirect_chain(self) -> List[Dict[str, Any]]:
        return self.page.redirect_chain_json or []

    @property
    def is_in_sitemap(self) -> bool:
        norm_url = self.url.rstrip("/")
        for sm_url in self.sitemap_urls:
            if sm_url.rstrip("/") == norm_url:
                return True
        return False

    def lookup_page(self, target_url: str) -> Optional[CrawlPage]:
        """Lookup a crawled page by URL."""
        if not target_url:
            return None
        norm = target_url.rstrip("/")
        # Try direct lookup
        if target_url in self.url_to_page:
            return self.url_to_page[target_url]
        if norm in self.url_to_page:
            return self.url_to_page[norm]
        # Match normalized
        for u, p in self.url_to_page.items():
            if u.rstrip("/") == norm or (p.final_url and p.final_url.rstrip("/") == norm):
                return p
        return None


@dataclass
class SiteAuditContext:
    """Site-level contextual evidence for site-wide technical SEO rules."""

    audit_id: uuid.UUID
    target_url: str
    hostname: str
    pages: List[CrawlPage] = field(default_factory=list)
    sitemaps: List[CrawlSitemap] = field(default_factory=list)
    sitemap_urls: Set[str] = field(default_factory=set)
    robots_txt_status: Optional[str] = None
    robots_txt_content: Optional[str] = None


@dataclass
class SiteWideAuditContext:
    """Comprehensive contextual evidence for evaluating site-wide SEO and topological rules."""

    audit_id: uuid.UUID
    target_url: str = ""
    hostname: str = ""
    host: Optional[str] = None
    crawl_status: Optional[str] = "completed" 
    pages: List[CrawlPage] = field(default_factory=list)
    links: List[CrawlLink] = field(default_factory=list)
    sitemaps: List[CrawlSitemap] = field(default_factory=list)
    sitemap_urls: Set[str] = field(default_factory=set)
    link_graph: Any = None
    robots_txt_status: Optional[str] = None
    robots_txt_content: Optional[str] = None
    exact_duplicate_groups: List[Dict[str, Any]] = field(default_factory=list)
    near_duplicate_groups: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def total_pages(self) -> int:
        return len(self.pages)

    def __post_init__(self) -> None:
        if not self.hostname and self.host:
            self.hostname = self.host
        elif not self.host and self.hostname:
            self.host = self.hostname

