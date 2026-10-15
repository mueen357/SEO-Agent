"""Technology and CMS detection engine package."""

from app.technology.models import (
    ConfidenceLevel,
    DetectionMethod,
    DetectionStatus,
    EvidenceItem,
    EvidenceType,
    TechnologyCategory,
    TechnologyFinding,
    TechnologySummary,
    WordPressPluginCandidate,
    WordPressThemeCandidate,
)
from app.technology.registry import TechnologyRegistry
from app.technology.detector import TechnologyDetector
from app.technology.wordpress import WordPressAssetDetector
from app.technology.classifiers import (
    BackendClassifier,
    BaseClassifier,
    CMSClassifier,
    FrontendClassifier,
)

__all__ = [
    "BackendClassifier",
    "BaseClassifier",
    "CMSClassifier",
    "ConfidenceLevel",
    "DetectionMethod",
    "DetectionStatus",
    "EvidenceItem",
    "EvidenceType",
    "FrontendClassifier",
    "TechnologyCategory",
    "TechnologyDetector",
    "TechnologyFinding",
    "TechnologySummary",
    "TechnologyRegistry",
    "WordPressAssetDetector",
    "WordPressPluginCandidate",
    "WordPressThemeCandidate",
]
