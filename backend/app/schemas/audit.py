"""Pydantic v2 schemas for Audit requests and responses."""

import math
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field

from app.database.models import AuditMode, AuditStatus


class AuditCreateRequest(BaseModel):
    target_url: str = Field(
        ...,
        description="Target website URL to audit (HTTP or HTTPS only)",
        examples=["https://example.com"]
    )
    mode: AuditMode = Field(
        default=AuditMode.quick,
        description="Audit execution mode ('quick', 'full', 'verified_owner')"
    )
    max_pages: Optional[int] = Field(
        default=None,
        ge=1,
        le=500,
        description="Maximum page crawl depth limit (defaults to 1 for quick, 50 for full)"
    )
    configuration: Dict[str, Any] = Field(
        default_factory=dict,
        description="Optional audit configuration options and user preferences"
    )


class AuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    target_url: str
    normalized_url: str
    hostname: str
    mode: str
    status: str
    max_pages: int
    pages_discovered: int
    pages_crawled: int
    configuration_json: Dict[str, Any]
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AuditListResponse(BaseModel):
    audits: List[AuditResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

    @classmethod
    def create(cls, audits: List[AuditResponse], total: int, page: int, page_size: int) -> "AuditListResponse":
        total_pages = math.ceil(total / page_size) if total > 0 else 0
        return cls(
            audits=audits,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
        )


class AuditCancelResponse(BaseModel):
    message: str
    audit: AuditResponse


class AuditPagesCollectionResponse(BaseModel):
    audit_id: uuid.UUID
    total: int = 0
    pages: List[Dict[str, Any]] = Field(default_factory=list)
    message: str = "Page crawling has not been executed yet. The core crawling pipeline is scheduled for Phase 1.4."


class AuditIssuesCollectionResponse(BaseModel):
    audit_id: uuid.UUID
    total: int = 0
    issues: List[Dict[str, Any]] = Field(default_factory=list)
    message: str = "Issue analysis has not been executed yet. The issue detection pipeline is scheduled for Phase 1.5."
