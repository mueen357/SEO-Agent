"""Pydantic schemas for Technology & CMS Detection Engine API."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field, field_validator


class EvidenceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    evidence_type: str
    evidence_source: str
    evidence_summary: str
    observed_page_or_url: str
    detection_method: str
    raw_signal: Optional[str] = None
    weight: float = 1.0
    provenance: str = "first_party"
    version_type: Optional[str] = None


class WordPressThemeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: Optional[str] = None
    version: Optional[str] = None
    status: str
    evidence_source: str
    confidence: float
    confidence_level: str


class WordPressPluginResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: Optional[str] = None
    version: Optional[str] = None
    evidence_source: str
    confidence: float
    confidence_level: str


class TechnologyFindingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audit_id: uuid.UUID
    technology_id: str
    technology_name: str
    technology_category: str
    subcategory: Optional[str] = None
    status: str
    confidence: float
    confidence_level: str
    version_or_null: Optional[str] = None
    version_type: str = "unknown"
    provenance: str = "first_party"
    evidence_type: str
    evidence_source: str
    evidence_summary: str
    observed_page_or_url: str
    detection_method: str
    page_count: int = 1
    affected_urls: List[str] = Field(default_factory=list, validation_alias="affected_urls_json")
    evidence_items: List[Dict[str, Any]] = Field(default_factory=list, validation_alias="evidence_items_json")
    catalog_version: str = "2.0.0"
    engine_version: str = "2.0.0"
    limitations: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("evidence_items", mode="before")
    @classmethod
    def filter_meta(cls, v: Any) -> Any:
        if isinstance(v, list):
            return [it for it in v if isinstance(it, dict) and not it.get("_meta")]
        return v


class TechnologyListResponse(BaseModel):
    items: List[TechnologyFindingResponse]
    total: int
    limit: int
    offset: int
    wordpress_themes: List[WordPressThemeResponse] = Field(default_factory=list)
    wordpress_plugins: List[WordPressPluginResponse] = Field(default_factory=list)


class TechnologySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    audit_id: uuid.UUID
    primary_cms: Optional[str] = None
    frontend_frameworks: List[str] = Field(default_factory=list, validation_alias="frontend_frameworks_json")
    backend_runtimes: List[str] = Field(default_factory=list, validation_alias="backend_runtimes_json")
    total_detected: int = 0
    detected_technologies_count: int = 0
    possible_technologies_count: int = 0
    inferred_technologies_count: int = 0
    confidence_distribution: Dict[str, int] = Field(default_factory=dict, validation_alias="confidence_distribution_json")
    wordpress_themes: List[WordPressThemeResponse] = Field(default_factory=list, validation_alias="wordpress_themes_json")
    wordpress_plugins: List[WordPressPluginResponse] = Field(default_factory=list, validation_alias="wordpress_plugins_json")
    catalog_version: str = "2.0.0"
    engine_version: str = "2.0.0"
    evidence_coverage: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class AnalyzeTechnologiesResponse(BaseModel):
    message: str
    audit_id: uuid.UUID
    technologies_detected: int
    primary_cms: Optional[str] = None
    technologies: List[TechnologyFindingResponse] = Field(default_factory=list)
    wordpress_themes: List[WordPressThemeResponse] = Field(default_factory=list)
    wordpress_plugins: List[WordPressPluginResponse] = Field(default_factory=list)
    catalog_version: str = "2.0.0"
    engine_version: str = "2.0.0"
    evidence_coverage: Optional[Dict[str, Any]] = None

