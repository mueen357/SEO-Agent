"""Scoring policy configuration, category weights, and status multipliers."""

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass(frozen=True)
class ScoringPolicy:
    """Configurable scoring weights, severities, and thresholds for Audit Health Score."""

    version: str = "2.4.0"

    # Category weights (Sum = 1.00 / 100%)
    category_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "on_page": 0.35,
            "technical": 0.40,
            "sitewide": 0.25,
        }
    )

    # Severity weights for penalty scaling
    severity_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "critical": 1.0,
            "high": 0.8,
            "medium": 0.5,
            "low": 0.2,
            "info": 0.0,
        }
    )

    # Status multipliers for page-level rule pass ratios among known applicable observations
    # 'unknown' reduces evidence coverage and confidence; excluded from direct health penalty
    # 'not_applicable' is tracked separately and excluded from applicable rule scoring
    status_multipliers: Dict[str, Optional[float]] = field(
        default_factory=lambda: {
            "pass": 1.0,
            "warning": 0.5,
            "fail": 0.0,
            "unknown": None,
            "not_applicable": None,
        }
    )

    # Coverage thresholds
    min_coverage_for_available: float = 0.80
    min_coverage_for_provisional: float = 0.30

    def get_score_label(self, score: Optional[float]) -> str:
        """Map score 0-100 to transparent rating label."""
        if score is None:
            return "unrated"
        if score >= 90.0:
            return "excellent"
        if score >= 75.0:
            return "good"
        if score >= 50.0:
            return "fair"
        return "poor"


DEFAULT_SCORING_POLICY = ScoringPolicy()
