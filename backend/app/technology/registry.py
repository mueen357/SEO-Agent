"""Central registry of recognizable web technologies, categories, and signature patterns.

Provides an API-compatible layer on top of the versioned TechnologyCatalog.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from app.technology.fingerprints.catalog import TechnologyCatalog
from app.technology.models import TechnologyCategory


@dataclass
class TechnologyDefinition:
    """Static metadata for a supported technology."""
    id: str
    name: str
    category: TechnologyCategory
    website: str
    description: str
    implies: List[str] = field(default_factory=list)  # e.g. nextjs implies react; nuxt implies vue
    subcategory: str = ""
    vendor_or_type: str = ""
    limitations: str = ""


class TechnologyRegistry:
    """Registry maintaining authoritative definitions of detectable technologies."""

    _DEFINITIONS: Optional[Dict[str, TechnologyDefinition]] = None

    @classmethod
    def _initialize(cls) -> None:
        if cls._DEFINITIONS is not None:
            return

        defs: Dict[str, TechnologyDefinition] = {}
        for tech_id, fp in TechnologyCatalog.get_catalog().items():
            defs[tech_id] = TechnologyDefinition(
                id=fp.id,
                name=fp.name,
                category=fp.category,
                website=fp.website,
                description=fp.description,
                implies=list(fp.implies),
                subcategory=fp.subcategory,
                vendor_or_type=fp.vendor_or_type,
                limitations=fp.limitations,
            )
        cls._DEFINITIONS = defs

    @classmethod
    def get(cls, tech_id: str) -> Optional[TechnologyDefinition]:
        cls._initialize()
        return cls._DEFINITIONS.get(tech_id) if cls._DEFINITIONS else None

    @classmethod
    def get_all(cls) -> Dict[str, TechnologyDefinition]:
        cls._initialize()
        return dict(cls._DEFINITIONS) if cls._DEFINITIONS else {}

    @classmethod
    def get_by_category(cls, category: TechnologyCategory) -> List[TechnologyDefinition]:
        cls._initialize()
        if not cls._DEFINITIONS:
            return []
        return [t for t in cls._DEFINITIONS.values() if t.category == category]
