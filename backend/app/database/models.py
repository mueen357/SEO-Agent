"""Database models for persistent audit records, crawler data, and idempotency."""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
    Float,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


class AuditMode(str, Enum):
    quick = "quick"
    full = "full"
    verified_owner = "verified_owner"


class AuditStatus(str, Enum):
    created = "created"
    queued = "queued"
    crawling = "crawling"
    analyzing = "analyzing"
    enriching = "enriching"
    generating_recommendations = "generating_recommendations"
    completed = "completed"
    partially_completed = "partially_completed"
    failed = "failed"
    cancelled = "cancelled"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4
    )
    target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    normalized_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(50), nullable=False, default=AuditMode.quick.value)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=AuditStatus.created.value, index=True)
    max_pages: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pages_discovered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    pages_crawled: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    configuration_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urls_json: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)

    # Worker lease & progress tracking
    worker_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    progress_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    robots_txt_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    robots_txt_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    pages: Mapped[List["CrawlPage"]] = relationship("CrawlPage", back_populates="audit", cascade="all, delete-orphan")
    links: Mapped[List["CrawlLink"]] = relationship("CrawlLink", back_populates="audit", cascade="all, delete-orphan")
    sitemaps: Mapped[List["CrawlSitemap"]] = relationship("CrawlSitemap", back_populates="audit", cascade="all, delete-orphan")
    renders: Mapped[List["CrawlPageRender"]] = relationship("CrawlPageRender", back_populates="audit", cascade="all, delete-orphan")
    issues: Mapped[List["SeoIssue"]] = relationship("SeoIssue", back_populates="audit", cascade="all, delete-orphan")
    site_finding_groups: Mapped[List["SiteFindingGroup"]] = relationship("SiteFindingGroup", back_populates="audit", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_audits_status_created_at", "status", "created_at"),
        Index("ix_audits_hostname_created_at", "hostname", "created_at"),
    )


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now
    )


class CrawlPage(Base):
    __tablename__ = "crawl_pages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False, index=True)

    requested_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    final_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fetch_status: Mapped[str] = mapped_column(String(50), nullable=False, default="success", index=True)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    redirect_chain_json: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    headers_json: Mapped[Optional[Dict[str, str]]] = mapped_column(JSON, nullable=True, default=dict)

    # SEO extracted data
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    canonical_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    canonical_tag_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    canonical_hrefs_json: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)

    # Main content extraction and fingerprints
    normalized_main_text_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    main_text_simhash: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, index=True)
    main_text_word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    main_text_character_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    extraction_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default="empty")
    extraction_version: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, default="1.0.0")
    content_quality_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, default="empty")

    meta_robots: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    html_lang: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    headings_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Media & links summary
    image_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_alt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    empty_alt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    internal_link_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    external_link_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urls_json: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="pages")
    links: Mapped[List["CrawlLink"]] = relationship("CrawlLink", back_populates="source_page", cascade="all, delete-orphan")
    render: Mapped[Optional["CrawlPageRender"]] = relationship("CrawlPageRender", back_populates="page", uselist=False, cascade="all, delete-orphan")
    issues: Mapped[List["SeoIssue"]] = relationship("SeoIssue", back_populates="page", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_crawl_pages_audit_url", "audit_id", "requested_url", unique=True),
        Index("ix_crawl_pages_audit_depth", "audit_id", "depth"),
    )


class CrawlLink(Base):
    __tablename__ = "crawl_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False, index=True)
    source_page_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("crawl_pages.id", ondelete="CASCADE"), nullable=True, index=True)

    destination_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    link_text: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="links")
    source_page: Mapped[Optional["CrawlPage"]] = relationship("CrawlPage", back_populates="links")

    __table_args__ = (
        Index("ix_crawl_links_dest", "audit_id", "destination_url"),
    )


class CrawlSitemap(Base):
    __tablename__ = "crawl_sitemaps"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False, index=True)

    sitemap_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="valid")
    url_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urls_json: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="sitemaps")


class CrawlPageRender(Base):
    __tablename__ = "crawl_page_renders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    crawl_page_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("crawl_pages.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True
    )
    audit_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    render_status: Mapped[str] = mapped_column(String(50), nullable=False, default="success", index=True)
    render_strategy: Mapped[str] = mapped_column(String(50), nullable=False, default="HTTP_ONLY")
    render_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Rendered DOM extraction
    rendered_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    rendered_meta_description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    rendered_canonical_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    canonical_tag_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    rendered_meta_robots: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rendered_headings_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    rendered_image_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rendered_link_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Structured comparison and laboratory performance measurements
    comparison_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    performance_metrics_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Screenshot paths
    screenshot_desktop_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    screenshot_mobile_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    urls_json: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)
    rendered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    page: Mapped["CrawlPage"] = relationship("CrawlPage", back_populates="render")
    audit: Mapped["Audit"] = relationship("Audit", back_populates="renders")


class IssueCategory(str, Enum):
    on_page = "on_page"
    images = "images"
    links = "links"
    technical = "technical"
    content = "content"
    structured_data = "structured_data"
    local_seo = "local_seo"
    technology = "technology"
    ai_search = "ai_search"


class IssueSeverity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"
    info = "info"


class IssueStatus(str, Enum):
    pass_status = "pass"
    warning = "warning"
    fail = "fail"
    unknown = "unknown"
    not_applicable = "not_applicable"


class IssueSourceType(str, Enum):
    raw_http = "raw_http"
    rendered_browser = "rendered_browser"
    derived_from_crawl = "derived_from_crawl"
    unknown = "unknown"


class SeoIssue(Base):
    """Normalized finding generated by deterministic audit rule engines."""

    __tablename__ = "seo_issues"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False, index=True)
    crawl_page_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("crawl_pages.id", ondelete="CASCADE"), nullable=True, index=True)

    rule_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    subcategory: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    evidence_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(String(30), nullable=False, default="raw_http")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    documentation_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    rule_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="issues")
    page: Mapped[Optional["CrawlPage"]] = relationship("CrawlPage", back_populates="issues")

    __table_args__ = (
        Index("ix_seo_issues_audit_fingerprint", "audit_id", "fingerprint"),
        Index("ix_seo_issues_audit_category", "audit_id", "category"),
        Index("ix_seo_issues_audit_severity", "audit_id", "severity"),
        Index("ix_seo_issues_audit_status", "audit_id", "status"),
    )


class SiteFindingGroup(Base):
    """Persisted site-wide findings group (e.g. duplicate content groups, duplicate titles)."""

    __tablename__ = "site_finding_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    audit_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audits.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    rule_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    group_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    group_type: Mapped[str] = mapped_column(String(50), nullable=False)
    affected_page_ids_json: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    affected_urls_json: Mapped[List[str]] = mapped_column(JSON, nullable=False, default=list)
    evidence_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="site_finding_groups")

    __table_args__ = (
        Index("ix_site_finding_groups_audit_rule", "audit_id", "rule_id"),
        Index("ix_site_finding_groups_fingerprint", "audit_id", "group_fingerprint", unique=True),
    )
