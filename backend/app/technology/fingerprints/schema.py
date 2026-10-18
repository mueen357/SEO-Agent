"""Extensible schema definitions for technology stack fingerprints."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import re

from app.technology.models import TechnologyCategory, VersionType, EvidenceProvenance


@dataclass
class VersionExtractionRule:
    """Deterministic pattern for extracting version numbers from evidence."""
    source_type: str  # 'meta_generator', 'header', 'script_url', 'inline_marker', 'stylesheet_url'
    regex: str  # Must have at least 1 capture group
    version_type: VersionType = VersionType.explicit_version
    compiled: Optional[re.Pattern] = None

    def __post_init__(self):
        if not self.compiled and self.regex:
            self.compiled = re.compile(self.regex, re.IGNORECASE)


@dataclass
class FingerprintSignatures:
    """Observable technical signatures mapped across evidence vectors."""
    meta_generators: List[str] = field(default_factory=list)
    headers: Dict[str, str] = field(default_factory=dict)  # lowercased header name -> regex string
    cookies: List[str] = field(default_factory=list)  # cookie name or prefix
    script_sources: List[str] = field(default_factory=list)  # substring or regex
    stylesheet_hrefs: List[str] = field(default_factory=list)
    dom_markers: List[str] = field(default_factory=list)
    inline_markers: List[str] = field(default_factory=list)
    html_comments: List[str] = field(default_factory=list)
    asset_urls: List[str] = field(default_factory=list)
    html_attributes: Dict[str, str] = field(default_factory=dict)
    body_classes: List[str] = field(default_factory=list)
    link_rels: List[str] = field(default_factory=list)
    
    # Defensive controls & false-positive guards
    min_assets_for_detection: int = 2
    requires_corroboration: bool = False
    excluded_domains: List[str] = field(default_factory=list)


@dataclass
class TechnologyFingerprint:
    """Authoritative definition and detection rules for a web technology."""
    id: str
    name: str
    category: TechnologyCategory
    subcategory: str
    vendor_or_type: str
    website: str
    description: str
    signatures: FingerprintSignatures = field(default_factory=FingerprintSignatures)
    implies: List[str] = field(default_factory=list)
    confidence_weight: float = 0.95
    version_rules: List[VersionExtractionRule] = field(default_factory=list)
    known_false_positives: List[str] = field(default_factory=list)
    limitations: str = "Client-side observation only. Server-side configuration may vary."
    default_provenance: EvidenceProvenance = EvidenceProvenance.first_party

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category.value if isinstance(self.category, TechnologyCategory) else str(self.category),
            "subcategory": self.subcategory,
            "vendor_or_type": self.vendor_or_type,
            "website": self.website,
            "description": self.description,
            "implies": self.implies,
            "confidence_weight": self.confidence_weight,
            "limitations": self.limitations,
        }
