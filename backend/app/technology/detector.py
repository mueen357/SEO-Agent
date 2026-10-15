"""Technology detection coordinator and multi-page aggregator."""

from typing import Dict, List, Optional
from app.technology.classifiers.backend import BackendClassifier
from app.technology.classifiers.cms import CMSClassifier
from app.technology.classifiers.frontend import FrontendClassifier
from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import (
    ConfidenceLevel,
    DetectionStatus,
    EvidenceItem,
    TechnologyCategory,
    TechnologyFinding,
    TechnologySummary,
)
from app.technology.registry import TechnologyRegistry


class TechnologyDetector:
    """Central engine running classifiers and aggregating findings across crawl pages."""

    def __init__(self):
        self.cms_classifier = CMSClassifier()
        self.frontend_classifier = FrontendClassifier()
        self.backend_classifier = BackendClassifier()

    def detect_page(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
    ) -> List[TechnologyFinding]:
        """Analyze a single page's HTML evidence and headers."""
        findings: List[TechnologyFinding] = []

        # 1. CMS Classification
        cms_findings = self.cms_classifier.classify(
            evidence=evidence,
            headers=headers,
            page_url=page_url,
        )
        findings.extend(cms_findings)

        # Check if WordPress is detected for PHP runtime implication
        wp_finding = next((f for f in cms_findings if f.technology_id == "wordpress"), None)
        implied_php = wp_finding is not None and wp_finding.confidence >= 0.5
        wp_conf = wp_finding.confidence if wp_finding else 0.0

        # 2. Frontend Frameworks
        frontend_findings = self.frontend_classifier.classify(
            evidence=evidence,
            headers=headers,
            page_url=page_url,
        )
        findings.extend(frontend_findings)

        # 3. Backend Runtimes & Frameworks
        backend_findings = self.backend_classifier.classify(
            evidence=evidence,
            headers=headers,
            page_url=page_url,
            implied_php=implied_php,
            parent_conf=wp_conf,
        )
        findings.extend(backend_findings)

        return findings

    def aggregate_findings(
        self,
        page_findings_list: List[List[TechnologyFinding]],
    ) -> List[TechnologyFinding]:
        """Deduplicate and aggregate technology findings across multiple crawl pages.

        - Boosts confidence slightly for corroborating evidence across pages.
        - Collects affected page URLs (bounded to 50).
        - Merges evidence items (deduplicated by (type, source, raw_signal), bounded to 20).
        - Selects verified version if present.
        - Sorts deterministically.
        """
        if not page_findings_list:
            return []

        grouped: Dict[str, List[TechnologyFinding]] = {}
        for page_findings in page_findings_list:
            for finding in page_findings:
                grouped.setdefault(finding.technology_id, []).append(finding)

        aggregated: List[TechnologyFinding] = []

        for tech_id, findings in grouped.items():
            base_conf = max(f.confidence for f in findings)
            page_count = len(findings)

            # Corroboration boost across pages (e.g. +0.02 per extra page, capped at 0.99)
            if page_count > 1 and base_conf >= 0.5:
                corroborated_conf = min(0.99, round(base_conf + (page_count - 1) * 0.02, 4))
            else:
                corroborated_conf = base_conf

            # Determine status & level
            if corroborated_conf >= 0.70:
                status = DetectionStatus.detected.value
            elif corroborated_conf >= 0.40:
                status = DetectionStatus.possible.value
            else:
                status = DetectionStatus.unknown.value

            if corroborated_conf >= 0.85:
                level = ConfidenceLevel.high.value
            elif corroborated_conf >= 0.50:
                level = ConfidenceLevel.medium.value
            else:
                level = ConfidenceLevel.low.value

            # Pick version: first non-null version observed
            version = next((f.version_or_null for f in findings if f.version_or_null), None)

            # Deduplicate affected URLs
            seen_urls = set()
            affected_urls: List[str] = []
            for f in findings:
                for u in f.affected_urls:
                    if u and u not in seen_urls:
                        seen_urls.add(u)
                        affected_urls.append(u)
                        if len(affected_urls) >= 50:
                            break

            # Deduplicate evidence items
            seen_ev = set()
            merged_evidence: List[EvidenceItem] = []
            for f in findings:
                for it in f.evidence_items:
                    key = (it.evidence_type, it.evidence_source, it.raw_signal)
                    if key not in seen_ev:
                        seen_ev.add(key)
                        merged_evidence.append(it)
                        if len(merged_evidence) >= 20:
                            break

            primary = findings[0]
            # Select primary evidence item with highest weight
            best_ev = max(merged_evidence, key=lambda x: x.weight) if merged_evidence else None

            agg_finding = TechnologyFinding(
                technology_id=tech_id,
                technology_name=primary.technology_name,
                technology_category=primary.technology_category,
                confidence=corroborated_conf,
                confidence_level=level,
                status=status,
                version_or_null=version,
                evidence_type=best_ev.evidence_type if best_ev else primary.evidence_type,
                evidence_source=best_ev.evidence_source if best_ev else primary.evidence_source,
                evidence_summary=best_ev.evidence_summary if best_ev else primary.evidence_summary,
                observed_page_or_url=affected_urls[0] if affected_urls else primary.observed_page_or_url,
                detection_method=best_ev.detection_method if best_ev else primary.detection_method,
                evidence_items=merged_evidence,
                page_count=page_count,
                affected_urls=affected_urls,
            )
            aggregated.append(agg_finding)

        # Deterministic ordering:
        # 1. Category rank (cms, frontend, backend, ecommerce, other)
        # 2. Confidence descending
        # 3. Technology name ascending
        category_order = {
            TechnologyCategory.cms.value: 1,
            TechnologyCategory.frontend.value: 2,
            TechnologyCategory.backend.value: 3,
            TechnologyCategory.ecommerce.value: 4,
            TechnologyCategory.hosting.value: 5,
            TechnologyCategory.other.value: 6,
        }

        aggregated.sort(
            key=lambda f: (
                category_order.get(f.technology_category, 99),
                -f.confidence,
                f.technology_name,
            )
        )

        return aggregated

    def summarize(self, findings: List[TechnologyFinding]) -> TechnologySummary:
        """Generate high-level technology summary for executive dashboards."""
        primary_cms: Optional[str] = None
        frontend_frameworks: List[str] = []
        backend_runtimes: List[str] = []
        confidence_dist = {"high": 0, "medium": 0, "low": 0}

        detected_count = 0
        possible_count = 0

        # Find highest confidence detected CMS
        cms_candidates = [
            f for f in findings
            if f.technology_category == TechnologyCategory.cms.value
            and f.status in (DetectionStatus.detected.value, DetectionStatus.possible.value)
        ]
        if cms_candidates:
            cms_candidates.sort(key=lambda x: -x.confidence)
            primary_cms = cms_candidates[0].technology_name

        for f in findings:
            if f.status == DetectionStatus.detected.value:
                detected_count += 1
            elif f.status == DetectionStatus.possible.value:
                possible_count += 1

            if f.confidence_level in confidence_dist:
                confidence_dist[f.confidence_level] += 1

            if f.technology_category == TechnologyCategory.frontend.value and f.status in (
                DetectionStatus.detected.value,
                DetectionStatus.possible.value,
            ):
                if f.technology_name not in frontend_frameworks:
                    frontend_frameworks.append(f.technology_name)

            if f.technology_category == TechnologyCategory.backend.value and f.status in (
                DetectionStatus.detected.value,
                DetectionStatus.possible.value,
            ):
                if f.technology_name not in backend_runtimes:
                    backend_runtimes.append(f.technology_name)

        return TechnologySummary(
            primary_cms=primary_cms,
            frontend_frameworks=frontend_frameworks,
            backend_runtimes=backend_runtimes,
            total_detected=detected_count,
            detected_technologies_count=detected_count,
            possible_technologies_count=possible_count,
            confidence_distribution=confidence_dist,
        )
