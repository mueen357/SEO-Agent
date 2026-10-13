"""Pydantic schemas for SEO issues and findings."""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class SeoIssueResponse(BaseModel):
    """Normalized response schema for an individual SEO rule assessment."""

    id: uuid.UUID
    audit_id: uuid.UUID
    crawl_page_id: Optional[uuid.UUID] = None
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
    created_at: datetime
    page_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class IssueSummaryResponse(BaseModel):
    """Aggregate summary statistics of SEO rule assessments."""

    total_assessments: int = 0
    actionable_findings: int = 0
    pass_count: int = 0
    warning_count: int = 0
    fail_count: int = 0
    unknown_count: int = 0
    not_applicable_count: int = 0
    total_issues: int = 0
    by_category: Dict[str, int] = Field(default_factory=dict)
    by_severity: Dict[str, int] = Field(default_factory=dict)
    by_status: Dict[str, int] = Field(default_factory=dict)
    rules_executed_count: int = 0


class PaginatedIssuesResponse(BaseModel):
    """Paginated collection of SEO issues."""

    audit_id: Optional[uuid.UUID] = None
    total: int
    page: int
    page_size: int
    total_pages: Optional[int] = None
    items: List[SeoIssueResponse] = Field(default_factory=list)
    issues: List[SeoIssueResponse] = Field(default_factory=list)
    summary: Optional[IssueSummaryResponse] = None
    message: Optional[str] = None


class AnalyzeAuditResponse(BaseModel):
    """Response returned when an SEO rule analysis execution completes."""

    audit_id: uuid.UUID
    pages_analyzed: int
    total_issues: int
    issues_found: int = 0
    status: str = "completed"
    engine_version: str = "2.2.0"
    summary: IssueSummaryResponse
    message: Optional[str] = None
