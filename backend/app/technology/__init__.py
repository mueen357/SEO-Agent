"""Technology and CMS detection engine package."""

from app.technology.models import (
    ConfidenceLevel,
    DetectionMethod,
    DetectionStatus,
    EvidenceItem,
    EvidenceProvenance,
    EvidenceType,
    TechnologyCategory,
    TechnologyFinding,
    TechnologySummary,
    VersionType,
    WordPressPluginCandidate,
    WordPressThemeCandidate,
)
from app.technology.registry import TechnologyRegistry
from app.technology.detector import TechnologyDetector
from app.technology.wordpress import WordPressAssetDetector
from app.technology.fingerprints.catalog import TechnologyCatalog
from app.technology.fingerprints.engine import UniversalFingerprintEngine
from app.technology.fingerprints.schema import TechnologyFingerprint
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
    "EvidenceProvenance",
    "EvidenceType",
    "FrontendClassifier",
    "TechnologyCategory",
    "TechnologyCatalog",
    "TechnologyDetector",
    "TechnologyFingerprint",
    "TechnologyFinding",
    "TechnologySummary",
    "TechnologyRegistry",
    "UniversalFingerprintEngine",
    "VersionType",
    "WordPressAssetDetector",
    "WordPressPluginCandidate",
    "WordPressThemeCandidate",
]
