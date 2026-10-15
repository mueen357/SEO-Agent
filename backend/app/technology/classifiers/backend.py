"""Backend runtime and framework classifiers (PHP, Node.js, Laravel, Django)."""

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


class BackendClassifier(BaseClassifier):
    """Detects server-side runtimes and backend frameworks from HTTP evidence."""

    def classify(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
        implied_php: bool = False,
        parent_conf: float = 0.0,
    ) -> List[TechnologyFinding]:
        findings: List[TechnologyFinding] = []
        lowered_headers = {str(k).lower(): str(v) for k, v in headers.items()}

        # 1. Laravel Detection (checked first because it implies PHP)
        laravel_finding = self._detect_laravel(evidence, lowered_headers, page_url)
        if laravel_finding:
            findings.append(laravel_finding)

        # 2. PHP Detection
        is_implied_php = implied_php or (laravel_finding is not None)
        php_parent_conf = max(parent_conf, laravel_finding.confidence if laravel_finding else 0.0)
        php_finding = self._detect_php(
            evidence,
            lowered_headers,
            page_url,
            implied=is_implied_php,
            parent_conf=php_parent_conf,
        )
        if php_finding:
            findings.append(php_finding)

        # 3. Node.js Detection
        nodejs_finding = self._detect_nodejs(evidence, lowered_headers, page_url)
        if nodejs_finding:
            findings.append(nodejs_finding)

        # 4. Django Detection
        django_finding = self._detect_django(evidence, lowered_headers, page_url)
        if django_finding:
            findings.append(django_finding)

        return findings

    def _detect_laravel(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check X-Powered-By
        x_pow = headers.get("x-powered-by", "")
        if "laravel" in x_pow.lower():
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:x-powered-by",
                    evidence_summary=f"HTTP X-Powered-By declares: {x_pow}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=x_pow,
                    weight=1.0,
                )
            )

        # Check Set-Cookie (laravel_session)
        set_cookie = headers.get("set-cookie", "")
        if "laravel_session" in set_cookie:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:set-cookie",
                    evidence_summary="Found standard Laravel session cookie (laravel_session)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal="cookie:laravel_session",
                    weight=0.95,
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
            technology_id="laravel",
            technology_name="Laravel",
            technology_category=TechnologyCategory.backend.value,
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

    def _detect_php(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
        implied: bool = False,
        parent_conf: float = 0.0,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []
        version: Optional[str] = None

        # Check X-Powered-By
        x_pow = headers.get("x-powered-by", "")
        if "php" in x_pow.lower():
            ver = self.extract_version_from_string(r"php\/([\d\.]+)", x_pow)
            if ver:
                version = ver
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:x-powered-by",
                    evidence_summary=f"HTTP X-Powered-By declares PHP: {x_pow}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=x_pow,
                    weight=1.0,
                )
            )

        # Check Server header
        server = headers.get("server", "")
        if "php" in server.lower():
            ver = self.extract_version_from_string(r"php\/([\d\.]+)", server)
            if ver and not version:
                version = ver
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:server",
                    evidence_summary=f"HTTP Server header declares PHP: {server}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=server,
                    weight=0.9,
                )
            )

        # Check Set-Cookie (PHPSESSID)
        set_cookie = headers.get("set-cookie", "")
        if "phpsessid" in set_cookie.lower():
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:set-cookie",
                    evidence_summary="Found standard PHP session cookie (PHPSESSID)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal="cookie:PHPSESSID",
                    weight=0.95,
                )
            )

        # Check URL extension (.php)
        if page_url and ".php" in page_url.lower():
            moderate_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.asset_path.value,
                    evidence_source="url_extension",
                    evidence_summary=f"Page URL utilizes .php endpoint extension: {page_url[:80]}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.asset_analysis.value,
                    raw_signal=".php",
                    weight=0.7,
                )
            )

        # Implied by WordPress / Laravel
        if implied and parent_conf > 0:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.body_marker.value,
                    evidence_source="runtime_dependency",
                    evidence_summary="PHP is native backend runtime for detected application (e.g. WordPress/Laravel)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.passive_html.value,
                    raw_signal="implied:php",
                    weight=0.95,
                )
            )

        if not strong_evidence and not moderate_evidence:
            return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
            implied=implied,
            parent_confidence=parent_conf,
        )
        all_ev = strong_evidence + moderate_evidence
        primary = strong_evidence[0] if strong_evidence else moderate_evidence[0]

        return TechnologyFinding(
            technology_id="php",
            technology_name="PHP",
            technology_category=TechnologyCategory.backend.value,
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

    def _detect_nodejs(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check X-Powered-By (Express / Node.js)
        x_pow = headers.get("x-powered-by", "")
        if "express" in x_pow.lower() or "node" in x_pow.lower():
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:x-powered-by",
                    evidence_summary=f"HTTP X-Powered-By declares Node.js framework: {x_pow}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=x_pow,
                    weight=0.95,
                )
            )

        # Check Server header (moderate / ambiguous signal)
        server = headers.get("server", "")
        if "express" in server.lower() or "node.js" in server.lower() or "nodejs" in server.lower():
            moderate_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:server",
                    evidence_summary=f"HTTP Server header indicates Node.js runtime: {server}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal=server,
                    weight=0.7,
                )
            )

        # Check Set-Cookie (connect.sid)
        set_cookie = headers.get("set-cookie", "")
        if "connect.sid" in set_cookie:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:set-cookie",
                    evidence_summary="Found Node.js Express session cookie (connect.sid)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal="cookie:connect.sid",
                    weight=0.9,
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
            technology_id="nodejs",
            technology_name="Node.js",
            technology_category=TechnologyCategory.backend.value,
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

    def _detect_django(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check Set-Cookie (csrftoken, django_language)
        set_cookie = headers.get("set-cookie", "")
        if "csrftoken" in set_cookie:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:set-cookie",
                    evidence_summary="Found standard Django CSRF token cookie (csrftoken)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal="cookie:csrftoken",
                    weight=0.85,
                )
            )
        if "django_language" in set_cookie:
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.header.value,
                    evidence_source="header:set-cookie",
                    evidence_summary="Found Django language preference cookie (django_language)",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.header_analysis.value,
                    raw_signal="cookie:django_language",
                    weight=0.9,
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
            technology_id="django",
            technology_name="Django",
            technology_category=TechnologyCategory.backend.value,
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
