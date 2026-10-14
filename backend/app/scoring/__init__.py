"""SEO Health Scoring, Prioritization, and Coverage Subsystem."""

from app.scoring.calculator import (
    calculate_category_scores,
    calculate_composite_score,
    calculate_rule_score,
)
from app.scoring.coverage import CoverageReport, calculate_coverage
from app.scoring.engine import ScoringEngine, compute_input_fingerprint
from app.scoring.explainability import generate_explanation
from app.scoring.grouping import group_findings_by_rule_and_cause
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy
from app.scoring.priorities import compute_priority_items

__all__ = [
    "ScoringPolicy",
    "DEFAULT_SCORING_POLICY",
    "CoverageReport",
    "calculate_coverage",
    "calculate_rule_score",
    "calculate_category_scores",
    "calculate_composite_score",
    "group_findings_by_rule_and_cause",
    "compute_priority_items",
    "generate_explanation",
    "compute_input_fingerprint",
    "ScoringEngine",
]
