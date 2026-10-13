"""Database models for persistent audit records, crawler data, and idempotency."""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean,
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

    # Worker lease & progress tracking
    worker_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    progress_json: Mapped[Dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

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

    # SEO extracted data
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    canonical_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
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
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="pages")
    links: Mapped[List["CrawlLink"]] = relationship("CrawlLink", back_populates="source_page", cascade="all, delete-orphan")

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
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    audit: Mapped["Audit"] = relationship("Audit", back_populates="sitemaps")
