"""CMS and Website Builder classifiers (WordPress, Shopify, Wix, Webflow, Squarespace, Framer)."""

import re
from typing import Dict, List, Optional
import urllib.parse
from app.technology.classifiers.base import BaseClassifier
from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import (
    DetectionMethod,
    EvidenceItem,
    EvidenceType,
    TechnologyCategory,
    TechnologyFinding,
)
from app.technology.registry import TechnologyRegistry


class CMSClassifier(BaseClassifier):
    """Detects CMS and website builder platforms from crawl evidence."""

    def classify(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
    ) -> List[TechnologyFinding]:
        findings: List[TechnologyFinding] = []
        lowered_headers = {str(k).lower(): str(v) for k, v in headers.items()}

        # 1. WordPress Detection
        wp_finding = self._detect_wordpress(evidence, lowered_headers, page_url)
        if wp_finding:
            findings.append(wp_finding)

        # 2. Shopify Detection
        shopify_finding = self._detect_shopify(evidence, lowered_headers, page_url)
        if shopify_finding:
            findings.append(shopify_finding)

        # 3. Wix Detection
        wix_finding = self._detect_wix(evidence, lowered_headers, page_url)
        if wix_finding:
            findings.append(wix_finding)

        # 4. Webflow Detection
        webflow_finding = self._detect_webflow(evidence, lowered_headers, page_url)
        if webflow_finding:
            findings.append(webflow_finding)

        # 5. Squarespace Detection
        sqs_finding = self._detect_squarespace(evidence, lowered_headers, page_url)
        if sqs_finding:
            findings.append(sqs_finding)

        # 6. Framer Detection
        framer_finding = self._detect_framer(evidence, lowered_headers, page_url)
        if framer_finding:
            findings.append(framer_finding)

        return findings

    def _detect_wordpress(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []
        version: Optional[str] = None

        # Check meta generator
        for gen in evidence.meta_generators:
            if "wordpress" in gen.lower():
                ver = self.extract_version_from_string(r"wordpress\s*([\d\.]+)", gen)
                if ver:
                    version = ver
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # Check headers (X-Generator or Server)
        for h_name in ("x-generator", "server"):
            val = headers.get(h_name, "")
            if "wordpress" in val.lower():
                ver = self.extract_version_from_string(r"wordpress\s*([\d\.]+)", val)
                if ver and not version:
                    version = ver
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Header {h_name} declares WordPress: {val}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=val,
                        weight=1.0,
                    )
                )

        # Check asset paths (/wp-content/, /wp-includes/)
        wp_paths_found = set()
        for src in evidence.script_sources:
            if "/wp-content/" in src or "/wp-includes/" in src:
                wp_paths_found.add(src[:100])
        for href in evidence.stylesheet_hrefs:
            if "/wp-content/" in href or "/wp-includes/" in href:
                wp_paths_found.add(href[:100])

        if wp_paths_found:
            sample = list(wp_paths_found)[:3]
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.asset_path.value,
                    evidence_source="asset_url",
                    evidence_summary=f"Observed {len(wp_paths_found)} WordPress assets (e.g. {sample[0]})",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.asset_analysis.value,
                    raw_signal=sample[0],
                    weight=0.95,
                )
            )

        # Check inline markers (wp.apiFetch, wp-json)
        for marker in evidence.inline_markers:
            if "wordpress" in marker or "wp-json" in marker:
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script_or_comment",
                        evidence_summary=f"Inline WordPress marker: {marker}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
                        weight=0.8,
                    )
                )

        # Check body classes
        for b_cls in evidence.body_classes:
            if b_cls.startswith("wp-") or b_cls in ("logged-in", "admin-bar"):
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.body_marker.value,
                        evidence_source="body_class",
                        evidence_summary=f"WordPress standard body class: {b_cls}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.dom_inspection.value,
                        raw_signal=b_cls,
                        weight=0.6,
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
            technology_id="wordpress",
            technology_name="WordPress",
            technology_category=TechnologyCategory.cms.value,
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

    def _detect_shopify(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check meta generator
        for gen in evidence.meta_generators:
            if "shopify" in gen.lower():
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # Check headers (X-Shopify-* or cookies)
        for h_name, h_val in headers.items():
            if h_name.startswith("x-shopify-"):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Shopify infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.95,
                    )
                )
            if h_name == "set-cookie" and ("_shopify_y" in h_val or "_shopify_s" in h_val):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source="header:set-cookie",
                        evidence_summary="Identified Shopify tracking cookie (_shopify_y/_shopify_s)",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal="cookie:_shopify",
                        weight=0.9,
                    )
                )

        # Check scripts/assets (cdn.shopify.com)
        for src in evidence.script_sources:
            if "cdn.shopify.com" in src or "shopify-cloud" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Shopify CDN script: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        # Check inline markers (Shopify.theme, window.Shopify)
        for marker in evidence.inline_markers:
            if "shopify" in marker:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary=f"Shopify client runtime marker: {marker}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
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
            technology_id="shopify",
            technology_name="Shopify",
            technology_category=TechnologyCategory.cms.value,
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

    def _detect_wix(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check meta generator
        for gen in evidence.meta_generators:
            if "wix" in gen.lower():
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # Check headers (x-wix-*)
        for h_name in headers:
            if h_name.startswith("x-wix-"):
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Wix infrastructure header: {h_name}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=h_name,
                        weight=0.95,
                    )
                )

        # Check asset paths (static.parastorage.com, frog.wix.com)
        for src in evidence.script_sources + evidence.stylesheet_hrefs:
            if "parastorage.com" in src or "wix.com" in src or "wixmp.com" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.asset_path.value,
                        evidence_source="asset_url",
                        evidence_summary=f"Wix cloud asset: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        # Check inline markers (wixEmbedsAPI, wixBiSession)
        for marker in evidence.inline_markers:
            if "wix" in marker:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary=f"Wix client runtime marker: {marker}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
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
            technology_id="wix",
            technology_name="Wix",
            technology_category=TechnologyCategory.cms.value,
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

    def _detect_webflow(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check meta generator
        for gen in evidence.meta_generators:
            if "webflow" in gen.lower():
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # Check DOM attributes (data-wf-page, data-wf-site)
        for dom_m in evidence.dom_markers:
            if "data-wf" in dom_m or "webflow" in dom_m:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.dom_attribute.value,
                        evidence_source="dom_attribute",
                        evidence_summary=f"Webflow DOM attribute: {dom_m}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.dom_inspection.value,
                        raw_signal=dom_m,
                        weight=0.95,
                    )
                )

        # Check scripts (website-files.com, webflow.js)
        for src in evidence.script_sources:
            if "website-files.com" in src or "webflow.js" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Webflow asset: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.9,
                    )
                )
                break

        # Check inline markers
        for marker in evidence.inline_markers:
            if "webflow" in marker:
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary=f"Webflow client runtime marker: {marker}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
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
            technology_id="webflow",
            technology_name="Webflow",
            technology_category=TechnologyCategory.cms.value,
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

    def _detect_squarespace(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []

        # Check meta generator
        for gen in evidence.meta_generators:
            if "squarespace" in gen.lower():
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # Check assets (assets.squarespace.com, static1.squarespace.com)
        for src in evidence.script_sources + evidence.stylesheet_hrefs:
            if "squarespace.com" in src:
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.asset_path.value,
                        evidence_source="asset_url",
                        evidence_summary=f"Squarespace hosted asset: {src[:80]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=src[:100],
                        weight=0.95,
                    )
                )
                break

        # Check DOM markers (sqs-layout, sqs-block)
        for b_cls in evidence.body_classes:
            if b_cls.startswith("sqs-"):
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.body_marker.value,
                        evidence_source="body_class",
                        evidence_summary=f"Squarespace body class: {b_cls}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.dom_inspection.value,
                        raw_signal=b_cls,
                        weight=0.7,
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
            technology_id="squarespace",
            technology_name="Squarespace",
            technology_category=TechnologyCategory.cms.value,
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

    @staticmethod
    def _is_framer_domain(url_str: str) -> bool:
        """Exact host matching against authoritative Framer infrastructure domains."""
        if not url_str or not isinstance(url_str, str):
            return False
        try:
            norm = url_str if not url_str.startswith("//") else f"https:{url_str}"
            parsed = urllib.parse.urlparse(norm)
            hostname = (parsed.hostname or "").lower()
            if not hostname:
                return False
            framer_hosts = (
                "framerusercontent.com",
                "framerstatic.com",
                "framercdn.com",
                "framer.com",
                "framer.site",
            )
            return any(hostname == h or hostname.endswith("." + h) for h in framer_hosts)
        except Exception:
            return False

    def _detect_framer(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        strong_evidence: List[EvidenceItem] = []
        moderate_evidence: List[EvidenceItem] = []
        weak_evidence: List[EvidenceItem] = []
        version: Optional[str] = None

        # 1. Check meta generator: e.g. <meta name="generator" content="Framer 7788242">
        for gen in evidence.meta_generators:
            if "framer" in gen.lower():
                ver = self.extract_version_from_string(r"framer\s*([a-zA-Z0-9\.\-]+)", gen)
                if ver and not version:
                    version = ver
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.meta_generator.value,
                        evidence_source="meta:generator",
                        evidence_summary=f"Meta generator declares Framer: {gen}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=gen,
                        weight=1.0,
                    )
                )

        # 2. Check HTTP response headers: Server / X-Generator / X-Powered-By
        for h_name in ("server", "x-generator", "x-powered-by"):
            val = headers.get(h_name, "")
            if "framer" in val.lower():
                ver = self.extract_version_from_string(r"framer\/([a-zA-Z0-9\.\-]+)", val)
                if ver and not version:
                    version = ver
                strong_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.header.value,
                        evidence_source=f"header:{h_name}",
                        evidence_summary=f"Header {h_name} declares Framer: {val}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.header_analysis.value,
                        raw_signal=val,
                        weight=1.0,
                    )
                )

        # 3. Check structural DOM markers (data-framer-name, data-framer-hydrate-v2, etc.)
        for dom_m in evidence.dom_markers:
            if "framer" in dom_m.lower():
                if any(k in dom_m for k in ("hydrate", "data-framer-name", "component")):
                    strong_evidence.append(
                        EvidenceItem(
                            evidence_type=EvidenceType.dom_attribute.value,
                            evidence_source="dom_attribute",
                            evidence_summary=f"Framer structural DOM attribute: {dom_m}",
                            observed_page_or_url=page_url,
                            detection_method=DetectionMethod.dom_inspection.value,
                            raw_signal=dom_m,
                            weight=0.95,
                        )
                    )
                else:
                    moderate_evidence.append(
                        EvidenceItem(
                            evidence_type=EvidenceType.dom_attribute.value,
                            evidence_source="dom_attribute",
                            evidence_summary=f"Framer DOM indicator: {dom_m}",
                            observed_page_or_url=page_url,
                            detection_method=DetectionMethod.dom_inspection.value,
                            raw_signal=dom_m,
                            weight=0.75,
                        )
                    )

        # 4. Check script sources (exact host matching against Framer CDN domains)
        framer_scripts = [s for s in evidence.script_sources if self._is_framer_domain(s)]
        if len(framer_scripts) >= 2:
            sample = framer_scripts[0][:100]
            strong_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.script_url.value,
                    evidence_source="script:src",
                    evidence_summary=f"Observed {len(framer_scripts)} Framer runtime scripts (e.g. {sample})",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.asset_analysis.value,
                    raw_signal=sample,
                    weight=0.95,
                )
            )
        elif len(framer_scripts) == 1:
            sample = framer_scripts[0][:100]
            moderate_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.script_url.value,
                    evidence_source="script:src",
                    evidence_summary=f"Framer script resource: {sample}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.asset_analysis.value,
                    raw_signal=sample,
                    weight=0.75,
                )
            )

        # 5. Check inline runtime markers / hydration globals
        for marker in evidence.inline_markers:
            if "framer" in marker.lower():
                moderate_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.inline_script.value,
                        evidence_source="inline_script",
                        evidence_summary=f"Framer client runtime marker: {marker}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=marker,
                        weight=0.85,
                    )
                )

        # 6. Check asset & image URLs (framerusercontent.com, framerstatic.com, framercdn.com)
        all_assets = getattr(evidence, "asset_urls", []) + evidence.stylesheet_hrefs
        framer_assets = [a for a in all_assets if self._is_framer_domain(a)]
        if len(framer_assets) >= 3:
            sample = framer_assets[0][:100]
            moderate_evidence.append(
                EvidenceItem(
                    evidence_type=EvidenceType.asset_path.value,
                    evidence_source="asset_url",
                    evidence_summary=f"Observed {len(framer_assets)} Framer-hosted assets (e.g. {sample})",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.asset_analysis.value,
                    raw_signal=sample,
                    weight=0.70,
                )
            )
        elif len(framer_assets) in (1, 2):
            for sample in framer_assets:
                weak_evidence.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.asset_path.value,
                        evidence_source="asset_url",
                        evidence_summary=f"Framer-hosted asset URL: {sample[:100]}",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.asset_analysis.value,
                        raw_signal=sample[:100],
                        weight=0.35,
                    )
                )

        # False-positive guard: If no strong or moderate signals exist, an isolated weak asset embed
        # (e.g. a blog embedding 1 Framer image) must NOT trigger Framer CMS detection.
        if not strong_evidence and not moderate_evidence:
            if len(weak_evidence) < 2:
                return None

        conf = self.calculate_confidence(
            strong_signals=len(strong_evidence),
            moderate_signals=len(moderate_evidence),
            weak_signals=len(weak_evidence),
        )

        if conf < 0.40:
            return None

        all_ev = strong_evidence + moderate_evidence + weak_evidence
        primary = strong_evidence[0] if strong_evidence else (moderate_evidence[0] if moderate_evidence else weak_evidence[0])

        return TechnologyFinding(
            technology_id="framer",
            technology_name="Framer",
            technology_category=TechnologyCategory.cms.value,
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

