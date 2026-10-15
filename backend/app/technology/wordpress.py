"""Passive, observable WordPress theme and plugin detection engine (CP3).

Strict compliance rules:
- Detect observable candidates ONLY from public asset paths, comments, and classes.
- NEVER perform directory brute-forcing, admin enumeration, or credential testing.
- NEVER invent or guess a theme or plugin name or version.
- Distinguish 'active', 'referenced', and 'unknown' theme status based on evidence.
- Fully deterministic confidence calculations.
"""

import re
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import parse_qs, urlparse

from app.technology.extractors.html_extractor import RawPageEvidence
from app.technology.models import (
    ConfidenceLevel,
    WordPressPluginCandidate,
    WordPressThemeCandidate,
)


class WordPressAssetDetector:
    """Discovers observable WordPress theme and plugin candidates from passive crawl evidence."""

    # Curated dictionary of verifiable official / popular WordPress themes
    VERIFIABLE_THEMES: Dict[str, str] = {
        "twentytwentyfour": "Twenty Twenty-Four",
        "twentytwentythree": "Twenty Twenty-Three",
        "twentytwentytwo": "Twenty Twenty-Two",
        "twentytwentyone": "Twenty Twenty-One",
        "twentytwenty": "Twenty Twenty",
        "twentynineteen": "Twenty Nineteen",
        "twentyseventeen": "Twenty Seventeen",
        "twentyfifteen": "Twenty Fifteen",
        "twentyfourteen": "Twenty Fourteen",
        "twentythirteen": "Twenty Thirteen",
        "twentytwelve": "Twenty Twelve",
        "twentyeleven": "Twenty Eleven",
        "twentyten": "Twenty Ten",
        "astra": "Astra",
        "generatepress": "GeneratePress",
        "oceanwp": "OceanWP",
        "divi": "Divi",
        "hello-elementor": "Hello Elementor",
        "kadence": "Kadence",
        "neve": "Neve",
        "flatsome": "Flatsome",
        "avada": "Avada",
        "enfold": "Enfold",
        "woodmart": "Woodmart",
        "storefront": "Storefront",
        "blocksy": "Blocksy",
        "sydney": "Sydney",
        "popularis": "Popularis",
    }

    # Curated dictionary of verifiable official / popular WordPress plugins
    VERIFIABLE_PLUGINS: Dict[str, str] = {
        "elementor": "Elementor",
        "elementor-pro": "Elementor Pro",
        "contact-form-7": "Contact Form 7",
        "woocommerce": "WooCommerce",
        "wordpress-seo": "Yoast SEO",
        "yoast-seo": "Yoast SEO",
        "all-in-one-seo-pack": "All in One SEO",
        "w3-total-cache": "W3 Total Cache",
        "wp-rocket": "WP Rocket",
        "litespeed-cache": "LiteSpeed Cache",
        "wordfence": "Wordfence Security",
        "revslider": "Slider Revolution",
        "akismet": "Akismet Anti-Spam",
        "jetpack": "Jetpack",
        "wpforms-lite": "WPForms",
        "wpforms": "WPForms",
        "mailchimp-for-wp": "Mailchimp for WordPress",
        "google-analytics-for-wordpress": "MonsterInsights",
        "advanced-custom-fields": "Advanced Custom Fields",
        "advanced-custom-fields-pro": "Advanced Custom Fields Pro",
        "autoptimize": "Autoptimize",
        "site-kit-by-google": "Site Kit by Google",
        "really-simple-ssl": "Really Simple SSL",
        "updraftplus": "UpdraftPlus",
        "classic-editor": "Classic Editor",
        "duplicate-post": "Yoast Duplicate Post",
        "rank-math": "Rank Math SEO",
        "seo-by-rank-math": "Rank Math SEO",
    }

    THEME_PATH_REGEX = re.compile(r"/wp-content/themes/([a-zA-Z0-9_\-]+)/", re.IGNORECASE)
    PLUGIN_PATH_REGEX = re.compile(r"/wp-content/plugins/([a-zA-Z0-9_\-]+)/", re.IGNORECASE)

    @classmethod
    def detect_themes(
        cls,
        evidence: RawPageEvidence,
        page_url: str = "",
    ) -> List[WordPressThemeCandidate]:
        """Extract WordPress theme candidates from page evidence."""
        candidates_by_slug: Dict[str, Dict] = {}

        # 1. Inspect stylesheets (strongest indicator of active theme style.css)
        for href in evidence.stylesheet_hrefs:
            match = cls.THEME_PATH_REGEX.search(href)
            if match:
                slug = match.group(1).lower()
                c_data = candidates_by_slug.setdefault(slug, {
                    "slug": slug,
                    "evidence_sources": [],
                    "has_style_css": False,
                    "version": None,
                })
                c_data["evidence_sources"].append(href[:120])
                if "style.css" in href.lower() or "style.min.css" in href.lower():
                    c_data["has_style_css"] = True
                    ver = cls._extract_version_param(href)
                    if ver and not c_data["version"]:
                        c_data["version"] = ver

        # 2. Inspect script sources
        for src in evidence.script_sources:
            match = cls.THEME_PATH_REGEX.search(src)
            if match:
                slug = match.group(1).lower()
                c_data = candidates_by_slug.setdefault(slug, {
                    "slug": slug,
                    "evidence_sources": [],
                    "has_style_css": False,
                    "version": None,
                })
                c_data["evidence_sources"].append(src[:120])
                # Only extract version if script is theme-specific (e.g. contains theme slug)
                if slug in src.lower():
                    ver = cls._extract_version_param(src)
                    if ver and not c_data["version"]:
                        c_data["version"] = ver

        # 3. Inspect body classes for theme signatures
        body_theme_slugs: Set[str] = set()
        for b_cls in evidence.body_classes:
            low_cls = b_cls.lower()
            if low_cls.startswith("theme-"):
                s = low_cls.replace("theme-", "")
                if s:
                    body_theme_slugs.add(s)
            elif low_cls.endswith("-theme"):
                s = low_cls.replace("-theme", "")
                if s:
                    body_theme_slugs.add(s)

        results: List[WordPressThemeCandidate] = []
        for slug, data in candidates_by_slug.items():
            has_style = data["has_style_css"]
            has_body_class = slug in body_theme_slugs
            src_count = len(data["evidence_sources"])

            if has_style or has_body_class:
                status = "active"
                conf = 0.90 if src_count >= 2 else 0.85
                level = ConfidenceLevel.high.value
            else:
                status = "referenced"
                conf = 0.70 if src_count >= 2 else 0.55
                level = ConfidenceLevel.medium.value

            name = cls.VERIFIABLE_THEMES.get(slug)
            primary_src = data["evidence_sources"][0] if data["evidence_sources"] else ""

            results.append(
                WordPressThemeCandidate(
                    slug=slug,
                    name=name,
                    version=data["version"],
                    status=status,
                    evidence_source=f"asset_url: {primary_src}",
                    confidence=conf,
                    confidence_level=level,
                )
            )

        # Sort: active first, then confidence desc, slug asc
        results.sort(key=lambda t: (0 if t.status == "active" else 1, -t.confidence, t.slug))
        return results

    @classmethod
    def detect_plugins(
        cls,
        evidence: RawPageEvidence,
        page_url: str = "",
    ) -> List[WordPressPluginCandidate]:
        """Extract observable WordPress plugin candidates from page evidence."""
        plugins_by_slug: Dict[str, Dict] = {}

        # 1. Inspect scripts and stylesheets for plugin paths
        for asset_url in evidence.script_sources + evidence.stylesheet_hrefs:
            match = cls.PLUGIN_PATH_REGEX.search(asset_url)
            if match:
                slug = match.group(1).lower()
                p_data = plugins_by_slug.setdefault(slug, {
                    "slug": slug,
                    "evidence_sources": [],
                    "version": None,
                })
                p_data["evidence_sources"].append(asset_url[:120])
                ver = cls._extract_version_param(asset_url)
                if ver and not p_data["version"]:
                    p_data["version"] = ver

        # 2. Inspect HTML comments for verifiable plugin signatures
        for marker in evidence.inline_markers:
            if marker.startswith("comment:wordpress:"):
                comment_text = marker.replace("comment:wordpress:", "")
                if "yoast" in comment_text.lower():
                    p_data = plugins_by_slug.setdefault("wordpress-seo", {
                        "slug": "wordpress-seo",
                        "evidence_sources": [],
                        "version": None,
                    })
                    p_data["evidence_sources"].append(f"comment: {comment_text}")
                    # Try extracting version e.g. v21.8
                    ver_match = re.search(r"v([\d\.]+)", comment_text)
                    if ver_match and not p_data["version"]:
                        p_data["version"] = ver_match.group(1)
                elif "all in one seo" in comment_text.lower():
                    p_data = plugins_by_slug.setdefault("all-in-one-seo-pack", {
                        "slug": "all-in-one-seo-pack",
                        "evidence_sources": [],
                        "version": None,
                    })
                    p_data["evidence_sources"].append(f"comment: {comment_text}")
                elif "w3 total cache" in comment_text.lower():
                    p_data = plugins_by_slug.setdefault("w3-total-cache", {
                        "slug": "w3-total-cache",
                        "evidence_sources": [],
                        "version": None,
                    })
                    p_data["evidence_sources"].append(f"comment: {comment_text}")
                elif "slider revolution" in comment_text.lower():
                    p_data = plugins_by_slug.setdefault("revslider", {
                        "slug": "revslider",
                        "evidence_sources": [],
                        "version": None,
                    })
                    p_data["evidence_sources"].append(f"comment: {comment_text}")
                elif "akismet" in comment_text.lower():
                    p_data = plugins_by_slug.setdefault("akismet", {
                        "slug": "akismet",
                        "evidence_sources": [],
                        "version": None,
                    })
                    p_data["evidence_sources"].append(f"comment: {comment_text}")

        results: List[WordPressPluginCandidate] = []
        for slug, data in plugins_by_slug.items():
            src_count = len(data["evidence_sources"])
            has_version = data["version"] is not None

            if src_count >= 2 and has_version:
                conf = 0.90
                level = ConfidenceLevel.high.value
            elif src_count >= 2 or has_version:
                conf = 0.85
                level = ConfidenceLevel.high.value
            else:
                conf = 0.70
                level = ConfidenceLevel.medium.value

            name = cls.VERIFIABLE_PLUGINS.get(slug)
            primary_src = data["evidence_sources"][0] if data["evidence_sources"] else ""

            results.append(
                WordPressPluginCandidate(
                    slug=slug,
                    name=name,
                    version=data["version"],
                    evidence_source=primary_src,
                    confidence=conf,
                    confidence_level=level,
                )
            )

        # Sort: confidence desc, name/slug asc
        results.sort(key=lambda p: (-p.confidence, p.slug))
        return results

    @classmethod
    def aggregate_themes(
        cls,
        theme_lists: List[List[WordPressThemeCandidate]],
    ) -> List[WordPressThemeCandidate]:
        """Aggregate theme candidates observed across multiple pages of an audit."""
        if not theme_lists:
            return []

        grouped: Dict[str, List[WordPressThemeCandidate]] = {}
        for t_list in theme_lists:
            for theme in t_list:
                grouped.setdefault(theme.slug, []).append(theme)

        aggregated: List[WordPressThemeCandidate] = []
        for slug, items in grouped.items():
            # If any observation is 'active', theme is considered 'active'
            is_active = any(i.status == "active" for i in items)
            status = "active" if is_active else items[0].status

            # Pick highest confidence
            base_conf = max(i.confidence for i in items)
            # Pick verifiable version if present
            ver = next((i.version for i in items if i.version), None)
            name = next((i.name for i in items if i.name), None)

            # Page corroboration boost
            if len(items) > 1 and base_conf >= 0.70:
                start_conf = 0.90 if is_active else base_conf
                conf = min(0.95, round(start_conf + (len(items) - 1) * 0.02, 4))
            else:
                conf = base_conf

            level = ConfidenceLevel.high.value if conf >= 0.85 else ConfidenceLevel.medium.value

            aggregated.append(
                WordPressThemeCandidate(
                    slug=slug,
                    name=name,
                    version=ver,
                    status=status,
                    evidence_source=items[0].evidence_source,
                    confidence=conf,
                    confidence_level=level,
                )
            )

        aggregated.sort(key=lambda t: (0 if t.status == "active" else 1, -t.confidence, t.slug))
        return aggregated

    @classmethod
    def aggregate_plugins(
        cls,
        plugin_lists: List[List[WordPressPluginCandidate]],
    ) -> List[WordPressPluginCandidate]:
        """Aggregate plugin candidates observed across multiple pages of an audit."""
        if not plugin_lists:
            return []

        grouped: Dict[str, List[WordPressPluginCandidate]] = {}
        for p_list in plugin_lists:
            for plugin in p_list:
                grouped.setdefault(plugin.slug, []).append(plugin)

        aggregated: List[WordPressPluginCandidate] = []
        for slug, items in grouped.items():
            base_conf = max(i.confidence for i in items)
            ver = next((i.version for i in items if i.version), None)
            name = next((i.name for i in items if i.name), None)

            if len(items) > 1 and base_conf >= 0.70:
                conf = min(0.95, round(base_conf + (len(items) - 1) * 0.02, 4))
            else:
                conf = base_conf

            level = ConfidenceLevel.high.value if conf >= 0.85 else ConfidenceLevel.medium.value

            aggregated.append(
                WordPressPluginCandidate(
                    slug=slug,
                    name=name,
                    version=ver,
                    evidence_source=items[0].evidence_source,
                    confidence=conf,
                    confidence_level=level,
                )
            )

        aggregated.sort(key=lambda p: (-p.confidence, p.slug))
        return aggregated

    @staticmethod
    def _extract_version_param(url: str) -> Optional[str]:
        """Safely extract and validate 'ver' query parameter from an asset URL."""
        try:
            parsed = urlparse(url)
            qs = parse_qs(parsed.query)
            ver_vals = qs.get("ver")
            if ver_vals and ver_vals[0]:
                raw_ver = ver_vals[0].strip()
                # Basic sanity validation: max 20 chars, contains at least one digit
                if any(c.isdigit() for c in raw_ver) and len(raw_ver) <= 20 and " " not in raw_ver:
                    return raw_ver
        except Exception:
            pass
        return None
