"""Pydantic schemas for SEO issues, findings, and site-wide intelligence."""

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
    engine_version: str = "2.3.0"
    summary: IssueSummaryResponse
    message: Optional[str] = None


class SiteFindingGroupResponse(BaseModel):
    """Structured response schema for site-wide finding groups (e.g. duplicate clusters)."""

    id: uuid.UUID
    audit_id: uuid.UUID
    rule_id: str
    rule_version: str
    group_fingerprint: str
    group_type: str
    affected_page_ids: List[str] = Field(default_factory=list)
    affected_urls: List[str] = Field(default_factory=list)
    evidence: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedFindingGroupsResponse(BaseModel):
    """Paginated collection of site-wide finding groups."""

    audit_id: uuid.UUID
    total: int
    page: int
    page_size: int
    total_pages: int
    items: List[SiteFindingGroupResponse] = Field(default_factory=list)


class LinkGraphNodeResponse(BaseModel):
    """Graph node representing an observed in-scope page."""

    url: str
    crawl_page_id: Optional[str] = None
    http_status: Optional[int] = None
    inbound_internal_count: int = 0
    outbound_internal_count: int = 0
    crawl_depth: int = 0
    is_sitemap_only: bool = False
    is_seed: bool = False


class LinkGraphSummaryResponse(BaseModel):
    """Deterministic internal link graph metrics and topology."""

    audit_id: uuid.UUID
    total_nodes: int = 0
    total_internal_edges: int = 0
    unique_destinations: int = 0
    orphan_count: int = 0
    low_inlink_count: int = 0
    broken_link_destinations: int = 0
    redirect_destinations: int = 0
    max_crawl_depth: int = 0
    sitemap_only_count: int = 0
    crawl_completeness_caveat: str
    nodes: List[LinkGraphNodeResponse] = Field(default_factory=list)


class SiteWideSummaryResponse(BaseModel):
    """Site-wide intelligence summary counts and evidence coverage."""

    audit_id: uuid.UUID
    total_assessments: int = 0
    actionable_findings: int = 0
    pass_count: int = 0
    warning_count: int = 0
    fail_count: int = 0
    unknown_count: int = 0
    exact_duplicate_groups_count: int = 0
    near_duplicate_groups_count: int = 0
    duplicate_metadata_groups_count: int = 0
    canonical_conflict_groups_count: int = 0
    pages_analyzed: int = 0
    pages_excluded: int = 0
    evidence_coverage: str = "sampled_crawl"
    rules_executed_count: int = 13
