"""Pydantic schemas for SEO Health Score, coverage, and priority actions."""

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ScorecardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    policy_version: str
    overall_score: Optional[float] = None
    score_label: str
    overall_state: str
    on_page_score: Optional[float] = None
    technical_score: Optional[float] = None
    sitewide_score: Optional[float] = None
    pages_evaluated: int
    rules_evaluated: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    pass_count: int
    category_scores: Dict[str, Any] = Field(default_factory=dict)
    coverage: Dict[str, Any] = Field(default_factory=dict)
    explanation: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class PriorityItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    scorecard_id: Optional[uuid.UUID] = None
    priority_tier: str
    priority_rank: int
    group_fingerprint: str
    rule_id: str
    category: str
    title: str
    description: str
    recommendation: str
    affected_page_count: int
    affected_urls: List[str] = Field(default_factory=list)
    score_impact: float
    created_at: datetime


class PrioritiesListResponse(BaseModel):
    items: List[PriorityItemResponse]
    total: int
    limit: int
    offset: int
    tier_counts: Dict[str, int]


class ScoreBreakdownResponse(BaseModel):
    audit_id: uuid.UUID
    overall_score: Optional[float] = None
    overall_state: str
    score_label: str
    category_scores: Dict[str, Any]
    top_deductions: List[Dict[str, Any]]
    formula: str
    disclaimer: str


class ScoreCoverageResponse(BaseModel):
    audit_id: uuid.UUID
    score_state: str
    coverage_ratio: float
    coverage_label: str
    total_pages_crawled: int
    pages_evaluated: int
    pages_failed: int
    rule_evaluations_total: int
    rule_family_completion: Dict[str, float]
    has_rendering_evidence: bool
    crawl_limit_hit: bool
    details: Dict[str, Any] = Field(default_factory=dict)
