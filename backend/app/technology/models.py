"""Data models and value objects for the technology and CMS detection engine."""

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class TechnologyCategory(str, Enum):
    """Categorization of detected web technologies."""
    cms = "cms"
    frontend = "frontend"
    backend = "backend"
    ecommerce = "ecommerce"
    hosting = "hosting"
    language = "language"
    database = "database"
    analytics = "analytics"
    advertising = "advertising"
    ux = "ux"
    payments = "payments"
    security = "security"
    search = "search"
    marketing = "marketing"
    fonts = "fonts"
    other = "other"


class ConfidenceLevel(str, Enum):
    """Normalized confidence tier."""
    high = "high"
    medium = "medium"
    low = "low"


class DetectionStatus(str, Enum):
    """Classification status based on accumulated evidence."""
    detected = "detected"          # High confidence (>= 0.70)
    possible = "possible"          # Moderate or single weak signal (0.40 - 0.69)
    inferred = "inferred"          # Indirect architectural implication
    unknown = "unknown"            # Insufficient or conflicting evidence (< 0.40)
    not_observed = "not_observed"  # No matching signals found in evidence


class EvidenceProvenance(str, Enum):
    """Source origin of observed evidence."""
    first_party = "first_party"
    third_party_embed = "third_party_embed"
    asset_host = "asset_host"
    inferred_dependency = "inferred_dependency"


class VersionType(str, Enum):
    """Verifiability class of extracted version numbers."""
    explicit_version = "explicit_version"
    asset_hint_unverified = "asset_hint_unverified"
    inferred_version = "inferred_version"
    unknown = "unknown"


class EvidenceType(str, Enum):
    """Type of technical observation."""
    meta_generator = "meta_generator"
    header = "header"
    script_url = "script_url"
    stylesheet_url = "stylesheet_url"
    dom_attribute = "dom_attribute"
    asset_path = "asset_path"
    body_marker = "body_marker"
    render_marker = "render_marker"
    inline_script = "inline_script"


class DetectionMethod(str, Enum):
    """Mechanism used to extract the observation."""
    passive_html = "passive_html"
    header_analysis = "header_analysis"
    asset_analysis = "asset_analysis"
    dom_inspection = "dom_inspection"
    rendered_analysis = "rendered_analysis"


@dataclass
class EvidenceItem:
    """An individual observed technical signal."""
    evidence_type: str
    evidence_source: str
    evidence_summary: str
    observed_page_or_url: str
    detection_method: str
    raw_signal: Optional[str] = None
    weight: float = 1.0
    provenance: str = "first_party"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WordPressThemeCandidate:
    """A WordPress theme candidate discovered from publicly observed assets."""
    slug: str
    name: Optional[str] = None
    version: Optional[str] = None
    status: str = "unknown"  # 'active', 'referenced', 'unknown'
    evidence_source: str = ""
    confidence: float = 0.5
    confidence_level: str = "medium"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WordPressPluginCandidate:
    """A WordPress plugin candidate discovered from publicly observed assets."""
    slug: str
    name: Optional[str] = None
    version: Optional[str] = None
    evidence_source: str = ""
    confidence: float = 0.5
    confidence_level: str = "medium"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TechnologyFinding:
    """A finalized, evidence-backed technology determination."""
    technology_id: str
    technology_name: str
    technology_category: str
    confidence: float
    confidence_level: str
    version_or_null: Optional[str]
    evidence_type: str
    evidence_source: str
    evidence_summary: str
    observed_page_or_url: str
    detection_method: str
    status: str = "detected"
    evidence_items: List[EvidenceItem] = field(default_factory=list)
    page_count: int = 1
    affected_urls: List[str] = field(default_factory=list)
    provenance: str = "first_party"
    version_type: str = "unknown"
    subcategory: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "technology_id": self.technology_id,
            "technology_name": self.technology_name,
            "technology_category": self.technology_category,
            "subcategory": self.subcategory,
            "status": self.status,
            "confidence": round(self.confidence, 4),
            "confidence_level": self.confidence_level,
            "version_or_null": self.version_or_null,
            "version_type": self.version_type,
            "provenance": self.provenance,
            "evidence_type": self.evidence_type,
            "evidence_source": self.evidence_source,
            "evidence_summary": self.evidence_summary,
            "observed_page_or_url": self.observed_page_or_url,
            "detection_method": self.detection_method,
            "page_count": self.page_count,
            "affected_urls": self.affected_urls[:50],  # Bounded list
            "evidence_items": [e.to_dict() for e in self.evidence_items[:20]],  # Bounded evidence
        }


@dataclass
class TechnologySummary:
    """Aggregated summary of technologies across an audit."""
    primary_cms: Optional[str] = None
    frontend_frameworks: List[str] = field(default_factory=list)
    backend_runtimes: List[str] = field(default_factory=list)
    total_detected: int = 0
    confidence_distribution: Dict[str, int] = field(
        default_factory=lambda: {"high": 0, "medium": 0, "low": 0}
    )
    detected_technologies_count: int = 0
    possible_technologies_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
