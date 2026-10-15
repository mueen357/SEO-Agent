"""Frontend framework classifiers (React, Next.js, Vue, Nuxt, Angular)."""

import re
from typing import Dict, List, Optional
from app.technology.classifiers.base import BaseClassifier
from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import (
    DetectionMethod,
    EvidenceItem,
    EvidenceType,
    TechnologyCategory,
    TechnologyFinding,
)


class FrontendClassifier(BaseClassifier):
    """Detects modern frontend frameworks and libraries from crawl evidence."""

    def classify(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
    ) -> List[TechnologyFinding]:
        findings: List[TechnologyFinding] = []
        lowered_headers = {str(k).lower(): str(v) for k, v in headers.items()}

        # 1. Next.js Detection (checked first because it implies React)
        next_finding = self._detect_nextjs(evidence, lowered_headers, page_url)
        if next_finding:
            findings.append(next_finding)

        # 2. React Detection
        react_finding = self._detect_react(
            evidence,
            lowered_headers,
            page_url,
            implied_by_next=next_finding is not None,
            parent_conf=next_finding.confidence if next_finding else 0.0,
        )
        if react_finding:
            findings.append(react_finding)

        # 3. Nuxt Detection (checked before Vue because it implies Vue)
        nuxt_finding = self._detect_nuxt(evidence, lowered_headers, page_url)
        if nuxt_finding:
            findings.append(nuxt_finding)

        # 4. Vue Detection
        vue_finding = self._detect_vue(
            evidence,
            lowered_headers,
            page_url,
            implied_by_nuxt=nuxt_finding is not None,
            parent_conf=nuxt_finding.confidence if nuxt_finding else 0.0,
        )
        if vue_finding:
            findings.append(vue_finding)

        # 5. Angular Detection
        angular_finding = self._detect_angular(evidence, lowered_headers, page_url)
        if angular_finding:
            findings.append(angular_finding)

        return findings

    def _detect_nextjs(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check __NEXT_DATA__
        for marker in evidence.inline_markers:
            if "__NEXT_DATA__" in marker:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary="Found Next.js hydration payload (__NEXT_DATA__)",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
                        weight=1.0,
                    )
                )

        # Check DOM id:__next
        if "id:__next" in evidence.dom_markers:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.dom_attribute.value,
                    evidence_source="dom_attribute",
                    evidence_summary="Found Next.js root element (id='__next')",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.dom_inspection.value,
                    raw_signal="id:__next",
                    weight=0.95,
                )
            )

        # Check /_next/ assets
        for src in evidence.script_sources + evidence.stylesheet_hrefs:
            if "/_next/static/" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.asset_path.value,
                        evidence_source="asset_url",
                        evidence_summary=f"Next.js build asset path: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        # Check headers (x-powered-by: Next.js or x-nextjs-*)
        for h_name, h_val in headers.items():
            if h_name == "x-powered-by" and "next.js" in h_val.lower():
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source="header:x-powered-by",
                        evidence_summary=f"HTTP X-Powered-By header: {h_val}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_val,
                        weight=1.0,
                    )
                )
            elif h_name.startswith("x-nextjs-"):
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Next.js infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.85,
                    )
                )

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="nextjs",
            technology_name="Next.js",
            technology_category=TechnologyCategory.frontend.value,
            confidence=conf,
            confidence_level=self.determine_confidence_level(conf),
            status=self.determine_detection_status(conf),
            version_or_null=None,
            evidence_type=primary.evidence_type,
            evidence_source=primary.evidence_source,
            evidence_summary=primary.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=primary.detection_method,
            evidence_items=all_ev,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )

    def _detect_react(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
        implied_by_next: bool = False,
        parent_conf: float = 0.0,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check DOM markers (data-reactroot, data-reactid)
        if "data-reactroot" in evidence.dom_markers:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.dom_attribute.value,
                    evidence_source="dom_attribute",
                    evidence_summary="Found React DOM container attribute (data-reactroot)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.dom_inspection.value,
                    raw_signal="data-reactroot",
                    weight=0.95,
                )
            )
        if "data-reactid" in evidence.dom_markers:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.dom_attribute.value,
                    evidence_source="dom_attribute",
                    evidence_summary="Found React component ID attribute (data-reactid)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.dom_inspection.value,
                    raw_signal="data-reactid",
                    weight=0.9,
                )
            )

        # Check script sources (react.development.js, react-dom)
        for src in evidence.script_sources:
            low_src = src.lower()
            if any(p in low_src for p in ("react.development.js", "react-dom.production", "react.production.min.js")):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Observed standalone React library script: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break
            elif "/react/" in low_src or "react-dom" in low_src:
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Observed React-related asset path: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.7,
                    )
                )
                break

        # Implied by Next.js
        if implied_by_next and parent_conf > 0:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.body_marker.value,
                    evidence_source="framework_dependency",
                    evidence_summary="React is core runtime foundation of Next.js",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.passive_html.value,
                    raw_signal="implied:nextjs",
                    weight=0.95,
                )
            )

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
            implied=implied_by_next,
            parent_confidence=parent_conf,
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="react",
            technology_name="React",
            technology_category=TechnologyCategory.frontend.value,
            confidence=conf,
            confidence_level=self.determine_confidence_level(conf),
            status=self.determine_detection_status(conf),
            version_or_null=None,
            evidence_type=primary.evidence_type,
            evidence_source=primary.evidence_source,
            evidence_summary=primary.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=primary.detection_method,
            evidence_items=all_ev,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )

    def _detect_nuxt(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check __NUXT__ or script_id:__NUXT_DATA__
        for marker in evidence.inline_markers:
            if "__NUXT__" in marker or "__NUXT_DATA__" in marker:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary="Found Nuxt.js hydration marker (__NUXT__)",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
                        weight=1.0,
                    )
                )

        # Check DOM id:__nuxt
        if "id:__nuxt" in evidence.dom_markers:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.dom_attribute.value,
                    evidence_source="dom_attribute",
                    evidence_summary="Found Nuxt.js root element (id='__nuxt')",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.dom_inspection.value,
                    raw_signal="id:__nuxt",
                    weight=0.95,
                )
            )

        # Check /_nuxt/ assets
        for src in evidence.script_sources + evidence.stylesheet_hrefs:
            if "/_nuxt/" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.asset_path.value,
                        evidence_source="asset_url",
                        evidence_summary=f"Nuxt.js build asset path: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="nuxt",
            technology_name="Nuxt.js",
            technology_category=TechnologyCategory.frontend.value,
            confidence=conf,
            confidence_level=self.determine_confidence_level(conf),
            status=self.determine_detection_status(conf),
            version_or_null=None,
            evidence_type=primary.evidence_type,
            evidence_source=primary.evidence_source,
            evidence_summary=primary.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=primary.detection_method,
            evidence_items=all_ev,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )

    def _detect_vue(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
        implied_by_nuxt: bool = False,
        parent_conf: float = 0.0,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check DOM markers (vue:data-v)
        if "vue:data-v" in evidence.dom_markers:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.dom_attribute.value,
                    evidence_source="dom_attribute",
                    evidence_summary="Found Vue.js scoped CSS DOM attribute (data-v-*)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.dom_inspection.value,
                    raw_signal="data-v-*",
                    weight=0.9,
                )
            )

        # Check scripts (vue.global.js, vue.runtime)
        for src in evidence.script_sources:
            low_src = src.lower()
            if any(p in low_src for p in ("vue.global", "vue.runtime", "vue.min.js")):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Observed standalone Vue.js library script: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break
            elif "/vue/" in low_src:
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Observed Vue-related asset path: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.7,
                    )
                )
                break

        # Implied by Nuxt
        if implied_by_nuxt and parent_conf > 0:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.body_marker.value,
                    evidence_source="framework_dependency",
                    evidence_summary="Vue.js is core runtime foundation of Nuxt.js",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.passive_html.value,
                    raw_signal="implied:nuxt",
                    weight=0.95,
                )
            )

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
            implied=implied_by_nuxt,
            parent_confidence=parent_conf,
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="vue",
            technology_name="Vue.js",
            technology_category=TechnologyCategory.frontend.value,
            confidence=conf,
            confidence_level=self.determine_confidence_level(conf),
            status=self.determine_detection_status(conf),
            version_or_null=None,
            evidence_type=primary.evidence_type,
            evidence_source=primary.evidence_source,
            evidence_summary=primary.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=primary.detection_method,
            evidence_items=all_ev,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )

    def _detect_angular(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []
        version: Optional[str] = None

        # Check ng-version attribute
        for dom_m in evidence.dom_markers:
            if dom_m.startswith("ng-version"):
                if ":" in dom_m:
                    v = dom_m.split(":", 1)[1].strip()
                    if v and any(c.isdigit() for c in v):
                        version = v
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.dom_attribute.value,
                        evidence_source="dom_attribute",
                        evidence_summary=f"Found Angular runtime attribute: {dom_m}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.dom_inspection.value,
                        raw_signal=dom_m,
                        weight=1.0,
                    )
                )
            elif dom_m in ("ng-app", "ng-controller"):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.dom_attribute.value,
                        evidence_source="dom_attribute",
                        evidence_summary=f"Found AngularJS root directive: {dom_m}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.dom_inspection.value,
                        raw_signal=dom_m,
                        weight=0.9,
                    )
                )

        # Check scripts (angular.js, @angular/core)
        for src in evidence.script_sources:
            low_src = src.lower()
            if any(p in low_src for p in ("angular.min.js", "angular.js", "@angular/core")):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Observed Angular framework script: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="angular",
            technology_name="Angular",
            technology_category=TechnologyCategory.frontend.value,
            confidence=conf,
            confidence_level=self.determine_confidence_level(conf),
            status=self.determine_detection_status(conf),
            version_or_null=version,
            evidence_type=primary.evidence_type,
            evidence_source=primary.evidence_source,
            evidence_summary=primary.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=primary.detection_method,
            evidence_items=all_ev,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )
