"""Pydantic schemas for SEO issues, analysis results, and summaries."""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SeoIssueResponse(BaseModel):
    """Structured SEO issue response."""

    id: uuid.UUID
    audit_id: uuid.UUID
    crawl_page_id: Optional[uuid.UUID] = None
    page_url: Optional[str] = None
    rule_id: str
    category: str
    subcategory: str
    title: str
    description: str
    severity: str
    status: str
    evidence_json: Dict[str, Any] = Field(default_factory=dict)
    recommendation: str
    source_type: str
    confidence: float
    documentation_url: Optional[str] = None
    rule_version: str
    fingerprint: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class IssueSummaryResponse(BaseModel):
    """Aggregate counts of issues by severity, status, and category."""

    audit_id: uuid.UUID
    total_issues: int = 0
    by_category: Dict[str, int] = Field(default_factory=dict)
    by_severity: Dict[str, int] = Field(default_factory=dict)
    by_status: Dict[str, int] = Field(default_factory=dict)
    rules_executed_count: int = 0


class PaginatedIssuesResponse(BaseModel):
    """Paginated collection of audit SEO issues."""

    audit_id: uuid.UUID
    total: int
    page: int
    page_size: int
    total_pages: int
    issues: List[SeoIssueResponse]
    summary: Optional[IssueSummaryResponse] = None
    message: Optional[str] = None


class AnalyzeAuditResponse(BaseModel):
    """Response returned upon completing deterministic on-page rule analysis."""

    audit_id: uuid.UUID
    status: str
    message: str
    pages_analyzed: int
    issues_found: int
    summary: IssueSummaryResponse
