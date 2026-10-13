"""Pydantic v2 schemas for Crawler data models, pagination, and audit execution."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class CrawlPageRenderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    crawl_page_id: uuid.UUID
    audit_id: uuid.UUID
    render_status: str
    render_strategy: str
    render_reason: Optional[str] = None
    evidence_json: Dict[str, Any] = Field(default_factory=dict)
    rendered_title: Optional[str] = None
    rendered_meta_description: Optional[str] = None
    rendered_canonical_url: Optional[str] = None
    rendered_meta_robots: Optional[str] = None
    rendered_headings_json: Dict[str, Any] = Field(default_factory=dict)
    rendered_image_count: int = 0
    rendered_link_count: int = 0
    comparison_json: Dict[str, Any] = Field(default_factory=dict)
    performance_metrics_json: Dict[str, Any] = Field(default_factory=dict)
    screenshot_desktop_path: Optional[str] = None
    screenshot_mobile_path: Optional[str] = None
    error_message: Optional[str] = None
    rendered_at: datetime


class CrawlPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    requested_url: str
    final_url: str
    depth: int
    fetch_status: str
    http_status: Optional[int] = None
    content_type: Optional[str] = None
    response_time_ms: int = 0
    redirect_chain_json: Optional[List[Dict[str, Any]]] = None
    title: Optional[str] = None
    meta_description: Optional[str] = None
    canonical_url: Optional[str] = None
    meta_robots: Optional[str] = None
    html_lang: Optional[str] = None
    headings_json: Optional[Dict[str, Any]] = None
    image_count: int = 0
    missing_alt_count: int = 0
    empty_alt_count: int = 0
    internal_link_count: int = 0
    external_link_count: int = 0
    content_hash: Optional[str] = None
    error_message: Optional[str] = None
    fetched_at: datetime
    render: Optional[CrawlPageRenderResponse] = None


class CrawlPagesListResponse(BaseModel):
    audit_id: uuid.UUID
    total: int
    page: int
    page_size: int
    total_pages: int
    pages: List[CrawlPageResponse]


class CrawlSitemapResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    sitemap_url: str
    status: str
    url_count: int = 0
    error_message: Optional[str] = None
    discovered_at: datetime


class CrawlSitemapsListResponse(BaseModel):
    audit_id: uuid.UUID
    total: int
    sitemaps: List[CrawlSitemapResponse]


class AuditStartResponse(BaseModel):
    message: str
    audit_id: uuid.UUID
    status: str
