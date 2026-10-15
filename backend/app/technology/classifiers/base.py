"""Base class and common scoring utilities for technology classifiers."""

from abc import ABC, abstractmethod
import re
from typing import Dict, List, Optional, Tuple

from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import (
    ConfidenceLevel,
    DetectionMethod,
    DetectionStatus,
    EvidenceItem,
    EvidenceType,
    TechnologyFinding,
)


class BaseClassifier(ABC):
    """Abstract base class for domain-specific technology classifiers."""

    @abstractmethod
    def classify(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
    ) -> List[TechnologyFinding]:
        """Classify technologies observed on a single page."""
        pass

    @staticmethod
    def calculate_confidence(
        strong_signals: int = 0,
        moderate_signals: int = 0,
        weak_signals: int = 0,
        implied: bool = False,
        parent_confidence: float = 0.0,
    ) -> float:
        """Calculate deterministic confidence score between 0.0 and 1.0."""
        if implied and parent_confidence > 0:
            # Implied technology (e.g. Next.js implies React)
            return min(0.95, round(parent_confidence * 0.95, 4))

        if strong_signals >= 2:
            conf = min(0.99, 0.85 + (strong_signals - 1) * 0.05 + moderate_signals * 0.02)
        elif strong_signals == 1:
            conf = min(0.92, 0.85 + moderate_signals * 0.03 + weak_signals * 0.01)
        elif moderate_signals >= 2:
            conf = min(0.75, 0.65 + (moderate_signals - 1) * 0.05 + weak_signals * 0.02)
        elif moderate_signals == 1:
            conf = min(0.60, 0.55 + weak_signals * 0.02)
        elif weak_signals >= 2:
            conf = 0.45
        elif weak_signals == 1:
            conf = 0.30
        else:
            conf = 0.0

        return round(conf, 4)

    @staticmethod
    def determine_confidence_level(confidence: float) -> str:
        """Map numeric confidence to high / medium / low tier."""
        if confidence >= 0.85:
            return ConfidenceLevel.high.value
        elif confidence >= 0.50:
            return ConfidenceLevel.medium.value
        return ConfidenceLevel.low.value

    @staticmethod
    def determine_detection_status(confidence: float) -> str:
        """Map numeric confidence to detected / possible / unknown status."""
        if confidence >= 0.70:
            return DetectionStatus.detected.value
        elif confidence >= 0.40:
            return DetectionStatus.possible.value
        return DetectionStatus.unknown.value

    @staticmethod
    def extract_version_from_string(regex_pattern: str, text: str) -> Optional[str]:
        """Safely extract semantic version string using regex."""
        if not text:
            return None
        match = re.search(regex_pattern, text, re.IGNORECASE)
        if match and match.group(1):
            ver = match.group(1).strip()
            # Basic sanity check on extracted version (e.g. 1-20 chars, contains digits)
            if any(c.isdigit() for c in ver) and len(ver) <= 20:
                return ver
        return None
