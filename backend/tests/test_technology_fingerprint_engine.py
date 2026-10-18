"""Unit tests for the Universal Technology Fingerprint Engine and Catalog (CP1)."""

import pytest
from app.technology.fingerprints.catalog import TechnologyCatalog, CATALOG_VERSION, ENGINE_VERSION
from app.technology.fingerprints.engine import UniversalFingerprintEngine
from app.technology.fingerprints.schema import (
    FingerprintSignatures,
    TechnologyFingerprint,
    VersionExtractionRule,
)
from app.technology.models import (
    DetectionStatus,
    EvidenceProvenance,
    EvidenceType,
    TechnologyCategory,
    VersionType,
)
from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.registry import TechnologyRegistry


def test_catalog_integrity():
    """Verify catalog loads and satisfies schema constraints."""
    catalog = TechnologyCatalog.get_catalog()
    assert len(catalog) >= 50
    assert CATALOG_VERSION == "2.0.0"
    assert ENGINE_VERSION == "2.0.0"

    for tech_id, fp in catalog.items():
        assert fp.id == tech_id
        assert fp.name
        assert fp.category in TechnologyCategory
        assert fp.website.startswith("http")
        assert fp.confidence_weight > 0
        assert fp.limitations

        # Verify version rules
        for vrule in fp.version_rules:
            assert vrule.compiled is not None
            assert vrule.regex


def test_registry_bridge_to_catalog():
    """Verify TechnologyRegistry bridges TechnologyCatalog seamlessly."""
    all_defs = TechnologyRegistry.get_all()
    assert len(all_defs) == len(TechnologyCatalog.get_catalog())

    wp = TechnologyRegistry.get("wordpress")
    assert wp is not None
    assert wp.name == "WordPress"
    assert wp.category == TechnologyCategory.cms
    assert "php" in wp.implies

    cms_list = TechnologyRegistry.get_by_category(TechnologyCategory.cms)
    assert len(cms_list) >= 6
    cms_ids = {c.id for c in cms_list}
    assert {"wordpress", "shopify", "wix", "webflow", "squarespace", "framer"}.issubset(cms_ids)


def test_universal_engine_detection_and_version():
    """Verify engine detects technology and extracts explicit version."""
    engine = UniversalFingerprintEngine()

    evidence = RawPageEvidence(
        meta_generators=["WordPress 6.4.3"],
        script_sources=["https://example.com/wp-includes/js/wp-emoji-release.min.js?ver=6.4.3"],
    )
    headers = {"server": "nginx"}

    findings = engine.match_page(evidence, headers, page_url="https://example.com")
    wp_finding = next((f for f in findings if f.technology_id == "wordpress"), None)

    assert wp_finding is not None
    assert wp_finding.status == DetectionStatus.detected.value
    assert wp_finding.confidence >= 0.95
    assert wp_finding.version_or_null == "6.4.3"
    assert wp_finding.version_type == VersionType.explicit_version.value
    assert wp_finding.provenance == EvidenceProvenance.first_party.value


def test_universal_engine_dependency_inference():
    """Verify Next.js implies React with inferred status and provenance."""
    engine = UniversalFingerprintEngine()

    evidence = RawPageEvidence(
        dom_markers=["id:__next"],
        inline_markers=["script_id:__NEXT_DATA__"],
        script_sources=["https://example.com/_next/static/chunks/main.js"],
    )
    headers = {"x-powered-by": "Next.js"}

    findings = engine.match_page(evidence, headers, page_url="https://example.com")
    tech_ids = {f.technology_id for f in findings}

    assert "nextjs" in tech_ids
    assert "react" in tech_ids

    nextjs_f = next(f for f in findings if f.technology_id == "nextjs")
    assert nextjs_f.status == DetectionStatus.detected.value
    assert nextjs_f.confidence >= 0.90

    react_f = next(f for f in findings if f.technology_id == "react")
    assert react_f.status == DetectionStatus.inferred.value
    assert react_f.provenance == EvidenceProvenance.inferred_dependency.value
    assert react_f.confidence <= 0.65


def test_universal_engine_false_positive_single_asset_guard():
    """Verify a single foreign asset does not trigger full platform detection when min_assets_for_detection is enforced."""
    engine = UniversalFingerprintEngine()

    # Suppose a WordPress site simply hosts an image on framerusercontent.com
    evidence = RawPageEvidence(
        meta_generators=["WordPress 6.4.2"],
        asset_urls=["https://framerusercontent.com/images/example.png"],  # only 1 asset
    )
    headers = {}

    findings = engine.match_page(evidence, headers, page_url="https://example.com")
    framer_f = next((f for f in findings if f.technology_id == "framer"), None)

    # With only 1 asset and no other Framer signals, framer should NOT be detected (min_assets_for_detection=2)
    assert framer_f is None

    # Now provide 2 assets matching the signature
    evidence_multi = RawPageEvidence(
        meta_generators=["WordPress 6.4.2"],
        asset_urls=[
            "https://framerusercontent.com/images/example1.png",
            "https://framerusercontent.com/images/example2.png",
        ],
    )
    findings_multi = engine.match_page(evidence_multi, headers, page_url="https://example.com")
    framer_multi = next((f for f in findings_multi if f.technology_id == "framer"), None)
    assert framer_multi is not None
    assert framer_multi.provenance == EvidenceProvenance.asset_host.value
