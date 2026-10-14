"""Comprehensive mathematical regression suite verifying exact scoring calculations.

Tests deterministic exact-value requirements A through S from Phase 2 Task 2.4B:
A. Five passes and five unknowns.
B. Five failures and five unknowns.
C. Ten unknowns only.
D. Ten not_applicable only.
E. No assessments.
F. One healthy page.
G. Partial crawl.
H. All required families completed.
I. Technical family missing.
J. All warning assessments.
K. Mixed severity weights.
L. Overlapping findings.
M. Reordered database rows.
N. Stale score after new evidence.
O. Policy version changes.
P. Repeated calculation.
Q. Category missing.
R. All known applicable checks pass.
S. Mixed unknown/not_applicable statuses.
"""

import copy
import random
import uuid
import pytest

from app.scoring.calculator import (
    calculate_rule_score,
    calculate_category_scores,
    calculate_composite_score,
)
from app.scoring.coverage import calculate_coverage, CoverageReport
from app.scoring.engine import compute_input_fingerprint
from app.scoring.explainability import generate_explanation
from app.scoring.policy import DEFAULT_SCORING_POLICY, ScoringPolicy


class TestScoringMathematicalRegressions:
    """Exact-value deterministic regression test suite."""

    def test_scenario_a_five_passes_five_unknowns(self):
        """A: 5 passes and 5 unknowns -> RuleScore = 100.0, known checks not penalized."""
        evals = [{"status": "pass"} for _ in range(5)] + [{"status": "unknown"} for _ in range(5)]
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["pass_count"] == 5
        assert res["warn_count"] == 0
        assert res["fail_count"] == 0
        assert res["unknown_count"] == 5
        assert res["known_applicable_count"] == 5
        assert res["eligible_count"] == 10
        assert res["score"] == 100.0
        assert res["deduction"] == 0.0

    def test_scenario_b_five_failures_five_unknowns(self):
        """B: 5 failures and 5 unknowns -> RuleScore = 0.0."""
        evals = [{"status": "fail"} for _ in range(5)] + [{"status": "unknown"} for _ in range(5)]
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["pass_count"] == 0
        assert res["fail_count"] == 5
        assert res["unknown_count"] == 5
        assert res["known_applicable_count"] == 5
        assert res["score"] == 0.0
        assert res["deduction"] == 100.0

    def test_scenario_c_ten_unknowns_only(self):
        """C: 10 unknowns only -> RuleScore = None, known_applicable_count = 0.
        Never assign 100 to a rule with no known applicable observations.
        """
        evals = [{"status": "unknown"} for _ in range(10)]
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["score"] is None
        assert res["known_applicable_count"] == 0
        assert res["unknown_count"] == 10
        assert res["pass_count"] == 0
        assert res["fail_count"] == 0

    def test_scenario_d_ten_not_applicable_only(self):
        """D: 10 not_applicable only -> rule is completely excluded, returns None."""
        evals = [{"status": "not_applicable"} for _ in range(10)]
        res = calculate_rule_score(evals)

        assert res is None

    def test_scenario_e_no_assessments(self):
        """E: No assessments -> returns None."""
        res = calculate_rule_score([])
        assert res is None

    def test_scenario_f_one_healthy_page(self):
        """F: One healthy page crawled -> passes on evaluated rules score 100%."""
        onpage_evals = [{"status": "pass"} for _ in range(16)]
        tech_evals = [{"status": "pass"} for _ in range(20)]

        rule_scores = {
            "on_page": {f"ONPAGE_{i}": calculate_rule_score([onpage_evals[i]], default_severity="medium") for i in range(16)},
            "technical": {f"TECH_{i}": calculate_rule_score([tech_evals[i]], default_severity="medium") for i in range(20)},
            "sitewide": {},
        }

        cat_scores, breakdown = calculate_category_scores(rule_scores)
        assert cat_scores["on_page"] == 100.0
        assert cat_scores["technical"] == 100.0
        assert cat_scores["sitewide"] is None

        # Composite score with provisional partial calculation
        comp_score, label = calculate_composite_score(cat_scores, score_state="provisional")
        assert comp_score == 100.0
        assert label == "excellent"

    def test_scenario_g_partial_crawl(self):
        """G: Partial crawl where crawl limit was hit or pages failed -> insufficient/provisional."""
        evals = [{"category": "on_page", "status": "pass"} for _ in range(10)]
        cov = calculate_coverage(
            total_pages=20,
            evaluated_pages=10,
            failed_pages=10,
            evaluations=evals,
            audit_status="crawling",
            max_pages_limit=20,
        )
        assert cov.score_state in ("provisional", "insufficient_evidence")
        assert cov.crawl_limit_hit is True
        assert cov.coverage_ratio < 1.0

    def test_scenario_h_all_required_families_completed(self):
        """H: All required families completed -> full weighted score: 0.35*OnPage + 0.40*Tech + 0.25*Site."""
        cat_scores = {
            "on_page": 90.0,
            "technical": 80.0,
            "sitewide": 100.0,
        }
        comp_score, label = calculate_composite_score(cat_scores, score_state="available")
        # 0.35 * 90.0 + 0.40 * 80.0 + 0.25 * 100.0 = 31.5 + 32.0 + 25.0 = 88.5
        assert comp_score == 88.5
        assert label == "good"

    def test_scenario_i_technical_family_missing(self):
        """I: Technical family missing -> explicit provisional partial score with effective weights."""
        cat_scores = {
            "on_page": 90.0,
            "technical": None,
            "sitewide": 80.0,
        }
        comp_score, label = calculate_composite_score(cat_scores, score_state="provisional")
        # Available weights: on_page=0.35, sitewide=0.25 -> sum = 0.60
        # (90.0 * 0.35 + 80.0 * 0.25) / 0.60 = (31.5 + 20.0) / 0.60 = 51.5 / 0.60 = 85.833... -> 85.8
        assert comp_score == 85.8
        assert label == "good"

        # Check explainability metadata
        expl = generate_explanation(
            overall_score=comp_score,
            score_label=label,
            score_state="provisional",
            cat_scores=cat_scores,
            category_breakdown={},
            coverage_ratio=0.6,
        )
        assert expl["is_provisional_partial"] is True
        assert expl["missing_categories"] == ["technical"]
        assert expl["included_categories"] == ["on_page", "sitewide"]
        assert expl["effective_weights"]["on_page"] == pytest.approx(0.35 / 0.60, abs=0.001)
        assert expl["effective_weights"]["sitewide"] == pytest.approx(0.25 / 0.60, abs=0.001)

    def test_scenario_j_all_warning_assessments(self):
        """J: All warning assessments -> 50.0 score (0.5 multiplier for warning)."""
        evals = [{"status": "warning"} for _ in range(10)]
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["warn_count"] == 10
        assert res["score"] == 50.0
        assert res["deduction"] == 50.0

    def test_scenario_k_mixed_severity_weights(self):
        """K: Mixed severity weights in category aggregation."""
        # Rule 1: critical severity (weight 1.0), score 50.0
        # Rule 2: low severity (weight 0.2), score 100.0
        rule_scores = {
            "technical": {
                "TECH_CRIT": {"score": 50.0, "weight": 1.0, "deduction": 50.0},
                "TECH_LOW": {"score": 100.0, "weight": 0.2, "deduction": 0.0},
            }
        }
        cat_scores, breakdown = calculate_category_scores(rule_scores)
        # Weighted avg: (50.0 * 1.0 + 100.0 * 0.2) / (1.0 + 0.2) = 70.0 / 1.2 = 58.333... -> 58.3
        assert cat_scores["technical"] == 58.3
        assert breakdown["technical"]["rules_scored"] == 2

    def test_scenario_l_overlapping_findings(self):
        """L: Overlapping findings on same page; verify bounded deductions and proper sorting."""
        rule_scores = {
            "on_page": {
                "R1": {"score": 80.0, "weight": 0.8, "deduction": 20.0, "fail_count": 1},
                "R2": {"score": 60.0, "weight": 0.5, "deduction": 40.0, "fail_count": 2},
            }
        }
        _, breakdown = calculate_category_scores(rule_scores)
        deductions = breakdown["on_page"]["deductions"]
        assert len(deductions) == 2
        # Impact: R2 = 40.0 * 0.5 = 20.0, R1 = 20.0 * 0.8 = 16.0 -> R2 sorted before R1
        assert deductions[0]["rule_id"] == "R2"
        assert deductions[1]["rule_id"] == "R1"

    def test_scenario_m_reordered_database_rows(self):
        """M: Reordering database rows produces exact same evidence fingerprint (deterministic)."""
        issues = [
            {"rule_id": f"RULE_{i}", "category": "on_page", "page_url": f"https://example.com/p{i}", "status": "fail"}
            for i in range(20)
        ]
        fp1 = compute_input_fingerprint(issues, pages_count=20)

        issues_shuffled = copy.deepcopy(issues)
        random.seed(42)
        random.shuffle(issues_shuffled)
        fp2 = compute_input_fingerprint(issues_shuffled, pages_count=20)

        assert fp1 == fp2
        assert len(fp1) == 64  # SHA-256 hex string

    def test_scenario_n_stale_score_after_new_evidence(self):
        """N: Stale score detection after new evidence is added."""
        base_issues = [
            {"rule_id": "TECH_SSL", "category": "technical", "page_url": "https://example.com/", "status": "pass"}
        ]
        fp_initial = compute_input_fingerprint(base_issues, pages_count=1)

        # New issue discovered in crawl
        updated_issues = base_issues + [
            {"rule_id": "TECH_404", "category": "technical", "page_url": "https://example.com/broken", "status": "fail"}
        ]
        fp_updated = compute_input_fingerprint(updated_issues, pages_count=2)

        assert fp_initial != fp_updated

    def test_scenario_o_policy_version_changes(self):
        """O: Policy version tracking and custom policy support."""
        custom_policy = ScoringPolicy(
            version="2026.2",
            category_weights={"on_page": 0.50, "technical": 0.30, "sitewide": 0.20},
        )
        cat_scores = {"on_page": 100.0, "technical": 80.0, "sitewide": 90.0}
        comp_score, label = calculate_composite_score(cat_scores, score_state="available", policy=custom_policy)
        # 0.50 * 100 + 0.30 * 80 + 0.20 * 90 = 50 + 24 + 18 = 92.0
        assert comp_score == 92.0
        assert label == "excellent"

    def test_scenario_p_repeated_calculation(self):
        """P: Repeated calculation is completely idempotent."""
        rule_scores = {
            "on_page": {"R1": {"score": 85.0, "weight": 0.8, "deduction": 15.0}},
            "technical": {"R2": {"score": 95.0, "weight": 1.0, "deduction": 5.0}},
            "sitewide": {"R3": {"score": 75.0, "weight": 0.5, "deduction": 25.0}},
        }
        cat1, b1 = calculate_category_scores(rule_scores)
        cat2, b2 = calculate_category_scores(rule_scores)
        assert cat1 == cat2
        assert b1 == b2

        comp1, lbl1 = calculate_composite_score(cat1, score_state="available")
        comp2, lbl2 = calculate_composite_score(cat2, score_state="available")
        assert comp1 == comp2
        assert lbl1 == lbl2

    def test_scenario_q_category_missing(self):
        """Q: Only on-page category present; partial score equals on-page score."""
        cat_scores = {
            "on_page": 84.0,
            "technical": None,
            "sitewide": None,
        }
        comp_score, label = calculate_composite_score(cat_scores, score_state="provisional")
        # On-page weight is 0.35, available weight sum is 0.35 -> (84.0 * 0.35) / 0.35 = 84.0
        assert comp_score == 84.0
        assert label == "good"

    def test_scenario_r_all_known_applicable_checks_pass(self):
        """R: All known applicable checks pass with some unknown assessments."""
        evals = [{"status": "pass"} for _ in range(3)] + [{"status": "unknown"} for _ in range(7)]
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["pass_count"] == 3
        assert res["known_applicable_count"] == 3
        assert res["unknown_count"] == 7
        assert res["score"] == 100.0
        assert res["deduction"] == 0.0

    def test_scenario_s_mixed_unknown_not_applicable_statuses(self):
        """S: Mixed unknown/not_applicable statuses:
        3 passes, 2 warnings, 1 fail, 4 unknowns, 5 not_applicable.
        known_applicable_count = 3 + 2 + 1 = 6.
        earned_points = 3*1.0 + 2*0.5 + 1*0.0 = 4.0.
        RuleScore = (4.0 / 6) * 100.0 = 66.67.
        """
        evals = (
            [{"status": "pass"} for _ in range(3)]
            + [{"status": "warning"} for _ in range(2)]
            + [{"status": "fail"} for _ in range(1)]
            + [{"status": "unknown"} for _ in range(4)]
            + [{"status": "not_applicable"} for _ in range(5)]
        )
        res = calculate_rule_score(evals)

        assert res is not None
        assert res["pass_count"] == 3
        assert res["warn_count"] == 2
        assert res["fail_count"] == 1
        assert res["unknown_count"] == 4
        assert res["known_applicable_count"] == 6
        assert res["eligible_count"] == 10  # 15 total minus 5 not_applicable
        assert res["score"] == 66.67
        assert res["deduction"] == 33.33
