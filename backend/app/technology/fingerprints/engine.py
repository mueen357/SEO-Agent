"""Universal Technology Fingerprint Matching Engine.

Executes cataloged fingerprint signatures against raw page evidence and HTTP headers.
Applies bounded confidence scoring, version extraction, and dependency inference.
"""

import logging
import re
from typing import Dict, List, Optional, Set, Tuple

from app.technology.fingerprints.catalog import TechnologyCatalog
from app.technology.fingerprints.schema import (
    FingerprintSignatures,
    TechnologyFingerprint,
    VersionExtractionRule,
)
from app.technology.models import (
    ConfidenceLevel,
    DetectionMethod,
    DetectionStatus,
    EvidenceItem,
    EvidenceProvenance,
    EvidenceType,
    TechnologyCategory,
    TechnologyFinding,
    VersionType,
)
from app.technology.extractors.html_extractor import RawPageEvidence

logger = logging.getLogger(__name__)


class UniversalFingerprintEngine:
    """Pre-compiles signatures and performs fast, deterministic matching against page evidence."""

    def __init__(self, catalog: Optional[Dict[str, TechnologyFingerprint]] = None):
        self.catalog = catalog or TechnologyCatalog.get_catalog()
        self._compiled_headers: Dict[str, Dict[str, re.Pattern]] = {}
        self._compiled_meta: Dict[str, List[re.Pattern]] = {}
        self._compiled_scripts: Dict[str, List[re.Pattern]] = {}
        self._compiled_styles: Dict[str, List[re.Pattern]] = {}
        self._compiled_assets: Dict[str, List[re.Pattern]] = {}
        self._compile_signatures()

    def _compile_signatures(self) -> None:
        """Pre-compile regexes safely at startup."""
        for tech_id, fp in self.catalog.items():
            sigs = fp.signatures

            # 1. Meta generators
            compiled_meta = []
            for pat in sigs.meta_generators:
                try:
                    compiled_meta.append(re.compile(pat, re.IGNORECASE))
                except re.error as e:
                    logger.warning(f"Invalid meta regex for {tech_id}: {pat} - {e}")
            if compiled_meta:
                self._compiled_meta[tech_id] = compiled_meta

            # 2. Headers
            if sigs.headers:
                header_map = {}
                for h_name, h_pattern in sigs.headers.items():
                    try:
                        header_map[h_name.lower()] = re.compile(h_pattern, re.IGNORECASE)
                    except re.error as e:
                        logger.warning(f"Invalid header regex for {tech_id}: {h_name}:{h_pattern} - {e}")
                self._compiled_headers[tech_id] = header_map

            # 3. Script sources
            compiled_scripts = []
            for pat in sigs.script_sources:
                try:
                    compiled_scripts.append(re.compile(pat, re.IGNORECASE))
                except re.error as e:
                    logger.warning(f"Invalid script regex for {tech_id}: {pat} - {e}")
            if compiled_scripts:
                self._compiled_scripts[tech_id] = compiled_scripts

            # 4. Stylesheets
            compiled_styles = []
            for pat in sigs.stylesheet_hrefs:
                try:
                    compiled_styles.append(re.compile(pat, re.IGNORECASE))
                except re.error as e:
                    logger.warning(f"Invalid style regex for {tech_id}: {pat} - {e}")
            if compiled_styles:
                self._compiled_styles[tech_id] = compiled_styles

            # 5. Asset URLs
            compiled_assets = []
            for pat in sigs.asset_urls:
                try:
                    compiled_assets.append(re.compile(pat, re.IGNORECASE))
                except re.error as e:
                    logger.warning(f"Invalid asset regex for {tech_id}: {pat} - {e}")
            if compiled_assets:
                self._compiled_assets[tech_id] = compiled_assets

    def match_page(
        self,
        evidence: RawPageEvidence,
        headers: Dict[str, str],
        page_url: str = "",
    ) -> List[TechnologyFinding]:
        """Evaluate evidence against all cataloged fingerprints for a single page."""
        findings_map: Dict[str, TechnologyFinding] = {}
        lowered_headers = {str(k).lower().strip(): str(v).strip() for k, v in headers.items()}

        for tech_id, fp in self.catalog.items():
            matched_items: List[EvidenceItem] = []
            extracted_version: Optional[str] = None
            extracted_version_type: VersionType = VersionType.unknown

            # --- A. Meta Generator Tags ---
            for gen in evidence.meta_generators:
                gen_clean = gen[:200]
                # Check regexes
                for rx in self._compiled_meta.get(tech_id, []):
                    m = rx.search(gen_clean)
                    if m:
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.meta_generator.value,
                                evidence_source="meta:generator",
                                evidence_summary=f"Meta generator declares: {gen_clean}",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.passive_html.value,
                                raw_signal=gen_clean,
                                weight=1.0,
                                provenance=fp.default_provenance.value,
                            )
                        )
                        # Check version rules for meta generator
                        for vrule in fp.version_rules:
                            if vrule.source_type == "meta_generator" and vrule.compiled:
                                vm = vrule.compiled.search(gen_clean)
                                if vm and vm.groups():
                                    extracted_version = vm.group(1)
                                    extracted_version_type = vrule.version_type
                                    break
                        break

            # --- B. Response Headers ---
            if tech_id in self._compiled_headers:
                for h_name, h_rx in self._compiled_headers[tech_id].items():
                    if h_name in lowered_headers:
                        val = lowered_headers[h_name][:500]
                        if h_rx.search(val):
                            matched_items.append(
                                EvidenceItem(
                                    evidence_type=EvidenceType.header.value,
                                    evidence_source=f"header:{h_name}",
                                    evidence_summary=f"HTTP header {h_name}: {val}",
                                    observed_page_or_url=page_url,
                                    detection_method=DetectionMethod.header_analysis.value,
                                    raw_signal=f"{h_name}:{val}",
                                    weight=0.95,
                                    provenance=fp.default_provenance.value,
                                )
                            )
                            # Check version from header
                            if not extracted_version:
                                for vrule in fp.version_rules:
                                    if vrule.source_type == "header" and vrule.compiled:
                                        vm = vrule.compiled.search(val)
                                        if vm and vm.groups():
                                            extracted_version = vm.group(1)
                                            extracted_version_type = vrule.version_type
                                            break

            # --- C. Cookies ---
            if fp.signatures.cookies and "set-cookie" in lowered_headers:
                sc_val = lowered_headers["set-cookie"]
                for cookie_sig in fp.signatures.cookies:
                    if cookie_sig.lower() in sc_val.lower():
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.header.value,
                                evidence_source="cookie",
                                evidence_summary=f"Observed technical cookie identifier: {cookie_sig}",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.header_analysis.value,
                                raw_signal=cookie_sig,
                                weight=0.85,
                                provenance=fp.default_provenance.value,
                            )
                        )
                        break

            # --- D. Script Source URLs ---
            matched_scripts: List[str] = []
            for src in evidence.script_sources:
                src_clean = src[:500]
                for rx in self._compiled_scripts.get(tech_id, []):
                    if rx.search(src_clean):
                        matched_scripts.append(src_clean)
                        # Check version rules for script url
                        if not extracted_version:
                            for vrule in fp.version_rules:
                                if vrule.source_type == "script_url" and vrule.compiled:
                                    vm = vrule.compiled.search(src_clean)
                                    if vm and vm.groups():
                                        extracted_version = vm.group(1)
                                        extracted_version_type = vrule.version_type
                                        break
                        break
            if matched_scripts:
                matched_items.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.script_url.value,
                        evidence_source="script:src",
                        evidence_summary=f"Identified script reference: {matched_scripts[0]} ({len(matched_scripts)} match{'es' if len(matched_scripts) > 1 else ''})",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=matched_scripts[0],
                        weight=0.75 if len(matched_scripts) >= 2 else 0.60,
                        provenance=fp.default_provenance.value,
                    )
                )

            # --- E. Stylesheet Hrefs ---
            matched_styles: List[str] = []
            for href in evidence.stylesheet_hrefs:
                href_clean = href[:500]
                for rx in self._compiled_styles.get(tech_id, []):
                    if rx.search(href_clean):
                        matched_styles.append(href_clean)
                        if not extracted_version:
                            for vrule in fp.version_rules:
                                if vrule.source_type == "stylesheet_url" and vrule.compiled:
                                    vm = vrule.compiled.search(href_clean)
                                    if vm and vm.groups():
                                        extracted_version = vm.group(1)
                                        extracted_version_type = vrule.version_type
                                        break
                        break
            if matched_styles:
                matched_items.append(
                    EvidenceItem(
                        evidence_type=EvidenceType.stylesheet_url.value,
                        evidence_source="link:stylesheet",
                        evidence_summary=f"Identified stylesheet reference: {matched_styles[0]} ({len(matched_styles)} match{'es' if len(matched_styles) > 1 else ''})",
                        observed_page_or_url=page_url,
                        detection_method=DetectionMethod.passive_html.value,
                        raw_signal=matched_styles[0],
                        weight=0.70 if len(matched_styles) >= 2 else 0.55,
                        provenance=fp.default_provenance.value,
                    )
                )

            # --- F. DOM Markers ---
            for dom_pat in fp.signatures.dom_markers:
                # dom_pat can be exact or prefix match
                for marker in evidence.dom_markers:
                    if marker == dom_pat or marker.startswith(f"{dom_pat}:") or dom_pat in marker:
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.dom_attribute.value,
                                evidence_source="dom:marker",
                                evidence_summary=f"DOM marker identified: {marker}",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.dom_inspection.value,
                                raw_signal=marker,
                                weight=0.90,
                                provenance=fp.default_provenance.value,
                            )
                        )
                        # Check version rules for dom_marker
                        if not extracted_version:
                            for vrule in fp.version_rules:
                                if vrule.source_type == "dom_marker" and vrule.compiled:
                                    vm = vrule.compiled.search(marker)
                                    if vm and vm.groups():
                                        extracted_version = vm.group(1)
                                        extracted_version_type = vrule.version_type
                                        break
                        break

            # --- G. Inline Markers & Comments ---
            all_inline_pats = list(fp.signatures.inline_markers)
            for c in fp.signatures.html_comments:
                clean_c = c.replace("<!--", "").replace("-->", "").strip()
                all_inline_pats.append(clean_c)
            for inline_pat in all_inline_pats:
                for marker in evidence.inline_markers:
                    if inline_pat.lower() in marker.lower() or marker.startswith(f"{tech_id}:"):
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.inline_script.value,
                                evidence_source="inline:marker",
                                evidence_summary=f"Runtime inline/comment marker: {marker}",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.passive_html.value,
                                raw_signal=marker,
                                weight=0.85,
                                provenance=fp.default_provenance.value,
                            )
                        )
                        break

            # --- H. Body Classes ---
            for bc_pat in fp.signatures.body_classes:
                for bc in evidence.body_classes:
                    if bc_pat.lower() in bc.lower():
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.body_marker.value,
                                evidence_source="body:class",
                                evidence_summary=f"Body class marker: {bc}",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.passive_html.value,
                                raw_signal=bc,
                                weight=0.70,
                                provenance=fp.default_provenance.value,
                            )
                        )
                        break

            # --- I. Asset URLs (Guard against false-positives with min_assets_for_detection) ---
            if tech_id in self._compiled_assets:
                matched_assets: List[str] = []
                for asset in evidence.asset_urls:
                    asset_clean = asset[:500]
                    for rx in self._compiled_assets[tech_id]:
                        if rx.search(asset_clean):
                            matched_assets.append(asset_clean)
                            break

                # Check min_assets_for_detection rule
                if matched_assets:
                    has_other_signals = any(item.evidence_type != EvidenceType.asset_path.value for item in matched_items)
                    if len(matched_assets) >= fp.signatures.min_assets_for_detection or has_other_signals:
                        weight = 0.85 if len(matched_assets) >= 2 else 0.40
                        matched_items.append(
                            EvidenceItem(
                                evidence_type=EvidenceType.asset_path.value,
                                evidence_source="asset:media",
                                evidence_summary=f"Identified {len(matched_assets)} asset reference(s) (e.g. {matched_assets[0][:80]})",
                                observed_page_or_url=page_url,
                                detection_method=DetectionMethod.asset_analysis.value,
                                raw_signal=matched_assets[0],
                                weight=weight,
                                provenance=EvidenceProvenance.asset_host.value,
                            )
                        )

            # --- Score and Classify Findings ---
            if matched_items:
                finding = self._compute_finding(
                    fp=fp,
                    matched_items=matched_items,
                    version=extracted_version,
                    version_type=extracted_version_type,
                    page_url=page_url,
                )
                if finding and finding.confidence >= 0.40:
                    findings_map[tech_id] = finding

        # --- J. Dependency Inference (e.g. Next.js implies React) ---
        inferred_findings: List[TechnologyFinding] = []
        for tech_id, finding in list(findings_map.items()):
            fp = self.catalog.get(tech_id)
            if not fp or not fp.implies:
                continue

            for implied_id in fp.implies:
                # Do not downgrade or duplicate if already detected directly with high confidence
                if implied_id in findings_map:
                    continue

                implied_fp = self.catalog.get(implied_id)
                if not implied_fp:
                    continue

                # Derived confidence: proportional to parent, capped at 0.65 (possible / inferred)
                inferred_conf = round(min(0.65, finding.confidence * 0.80), 4)
                level = ConfidenceLevel.medium.value if inferred_conf >= 0.50 else ConfidenceLevel.low.value

                inferred_ev = EvidenceItem(
                    evidence_type="inferred_dependency",
                    evidence_source=f"inferred_from:{tech_id}",
                    evidence_summary=f"Architectural implication from confirmed {fp.name}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.rendered_analysis.value,
                    raw_signal=f"parent:{tech_id}",
                    weight=0.60,
                    provenance=EvidenceProvenance.inferred_dependency.value,
                )

                inferred_finding = TechnologyFinding(
                    technology_id=implied_id,
                    technology_name=implied_fp.name,
                    technology_category=implied_fp.category.value if isinstance(implied_fp.category, TechnologyCategory) else str(implied_fp.category),
                    subcategory=implied_fp.subcategory,
                    confidence=inferred_conf,
                    confidence_level=level,
                    status=DetectionStatus.inferred.value,
                    version_or_null=None,
                    version_type=VersionType.unknown.value,
                    provenance=EvidenceProvenance.inferred_dependency.value,
                    evidence_type="inferred_dependency",
                    evidence_source=f"inferred_from:{tech_id}",
                    evidence_summary=f"Indirect architectural implication: {fp.name} typically utilizes {implied_fp.name}",
                    observed_page_or_url=page_url,
                    detection_method=DetectionMethod.rendered_analysis.value,
                    evidence_items=[inferred_ev],
                    page_count=1,
                    affected_urls=[page_url] if page_url else [],
                )
                inferred_findings.append(inferred_finding)

        # Merge inferred findings
        for inf in inferred_findings:
            if inf.technology_id not in findings_map:
                findings_map[inf.technology_id] = inf

        return list(findings_map.values())

    def _compute_finding(
        self,
        fp: TechnologyFingerprint,
        matched_items: List[EvidenceItem],
        version: Optional[str],
        version_type: VersionType,
        page_url: str,
    ) -> Optional[TechnologyFinding]:
        """Aggregate evidence weights and establish deterministic confidence status."""
        if not matched_items:
            return None

        strong_items = [it for it in matched_items if it.weight >= 0.85]
        moderate_items = [it for it in matched_items if 0.50 <= it.weight < 0.85]
        weak_items = [it for it in matched_items if it.weight < 0.50]

        # Calculate base confidence from highest quality signals
        if strong_items:
            base_conf = fp.confidence_weight
            if len(strong_items) > 1 or moderate_items:
                base_conf = min(1.0, round(base_conf + 0.05, 4))
        elif len(moderate_items) >= 2:
            base_conf = min(0.80, round(fp.confidence_weight * 0.75, 4))
        elif len(moderate_items) == 1:
            base_conf = 0.45
        elif weak_items:
            # Only weak items
            base_conf = 0.40
        else:
            base_conf = 0.35

        # Determine status
        if base_conf >= 0.70:
            status = DetectionStatus.detected.value
        elif base_conf >= 0.40:
            status = DetectionStatus.possible.value
        else:
            status = DetectionStatus.unknown.value

        # Determine level
        if base_conf >= 0.85:
            level = ConfidenceLevel.high.value
        elif base_conf >= 0.50:
            level = ConfidenceLevel.medium.value
        else:
            level = ConfidenceLevel.low.value

        # Primary evidence representation
        best_ev = max(matched_items, key=lambda x: x.weight)

        # Provenance: if all evidence is asset_host, mark as asset_host
        if all(it.provenance == EvidenceProvenance.asset_host.value for it in matched_items):
            provenance = EvidenceProvenance.asset_host.value
        elif any(it.provenance == EvidenceProvenance.third_party_embed.value for it in matched_items):
            provenance = EvidenceProvenance.third_party_embed.value
        else:
            provenance = fp.default_provenance.value

        v_type_str = version_type.value if isinstance(version_type, VersionType) else str(version_type)
        if version and version_type == VersionType.asset_hint_unverified:
            v_type_str = "asset_hint_unverified"

        return TechnologyFinding(
            technology_id=fp.id,
            technology_name=fp.name,
            technology_category=fp.category.value if isinstance(fp.category, TechnologyCategory) else str(fp.category),
            subcategory=fp.subcategory,
            confidence=base_conf,
            confidence_level=level,
            status=status,
            version_or_null=version,
            version_type=v_type_str,
            provenance=provenance,
            evidence_type=best_ev.evidence_type,
            evidence_source=best_ev.evidence_source,
            evidence_summary=best_ev.evidence_summary,
            observed_page_or_url=page_url,
            detection_method=best_ev.detection_method,
            evidence_items=matched_items,
            page_count=1,
            affected_urls=[page_url] if page_url else [],
        )
