"""Audit execution context holding crawled and rendered page evidence."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from app.database.models import CrawlLink, CrawlPage, CrawlPageRender


@dataclass
class PageAuditContext:
    """Contextual evidence for auditing an individual crawled page."""

    page: CrawlPage
    render: Optional[CrawlPageRender] = None
    links: List[CrawlLink] = field(default_factory=list)
    audit_target_url: str = ""
    audit_hostname: str = ""

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
