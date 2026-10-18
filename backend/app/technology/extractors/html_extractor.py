"""Passive HTML technology evidence extractor using BeautifulSoup."""

from dataclasses import dataclass, field
import logging
import re
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

from app.technology.models import (
    DetectionMethod,
    EvidenceItem,
    EvidenceType,
)

logger = logging.getLogger(__name__)


@dataclass
class RawPageEvidence:
    """Bounded, passive technological observations extracted from HTML."""
    meta_generators: List[str] = field(default_factory=list)
    script_sources: List[str] = field(default_factory=list)
    stylesheet_hrefs: List[str] = field(default_factory=list)
    dom_markers: List[str] = field(default_factory=list)
    inline_markers: List[str] = field(default_factory=list)
    body_classes: List[str] = field(default_factory=list)
    html_attributes: Dict[str, str] = field(default_factory=dict)
    asset_urls: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "meta_generators": self.meta_generators[:10],
            "script_sources": self.script_sources[:100],
            "stylesheet_hrefs": self.stylesheet_hrefs[:100],
            "dom_markers": self.dom_markers[:50],
            "inline_markers": self.inline_markers[:50],
            "body_classes": self.body_classes[:50],
            "html_attributes": self.html_attributes,
            "asset_urls": self.asset_urls[:50],
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "RawPageEvidence":
        if not data:
            return cls()
        return cls(
            meta_generators=data.get("meta_generators", []),
            script_sources=data.get("script_sources", []),
            stylesheet_hrefs=data.get("stylesheet_hrefs", []),
            dom_markers=data.get("dom_markers", []),
            inline_markers=data.get("inline_markers", []),
            body_classes=data.get("body_classes", []),
            html_attributes=data.get("html_attributes", {}),
            asset_urls=data.get("asset_urls", []),
        )


class HTMLTechnologyExtractor:
    """Extracts passive, non-intrusive technology signatures from HTML bytes or string."""

    # Pre-compiled markers to search in inline scripts and comments
    INLINE_MARKER_PATTERNS = [
        ("__NEXT_DATA__", "nextjs", "Next.js hydration data marker (__NEXT_DATA__)"),
        ("__NUXT__", "nuxt", "Nuxt.js hydration data marker (__NUXT__)"),
        ("Shopify.theme", "shopify", "Shopify storefront JavaScript theme object"),
        ("window.Shopify", "shopify", "Shopify client-side global object"),
        ("wixEmbedsAPI", "wix", "Wix client embeds API runtime"),
        ("wixBiSession", "wix", "Wix business intelligence session marker"),
        ("Webflow.require", "webflow", "Webflow client modules runtime"),
        ("wp.apiFetch", "wordpress", "WordPress REST API client library"),
        ("wp-json", "wordpress", "WordPress REST API endpoint reference"),
        ("__framer__", "framer", "Framer client runtime global (__framer__)"),
        ("data-framer-hydrate-v2", "framer", "Framer v2 hydration marker"),
        ("data-framer-name", "framer", "Framer component naming marker"),
        ("framer.site", "framer", "Framer site runtime domain marker"),
        ("framerusercontent.com", "framer", "Framer user content domain reference"),
        ("framerstatic.com", "framer", "Framer static runtime domain reference"),
        ("__remixContext", "remix", "Remix hydration context object"),
        ("qwikevents", "qwik", "Qwik event handling runtime"),
        ("_$HY", "solidjs", "SolidJS hydration runtime marker"),
        ("window.Alpine", "alpinejs", "Alpine.js runtime global"),
        ("gsap.timeline", "gsap", "GSAP timeline constructor"),
        ("THREE.WebGLRenderer", "threejs", "Three.js WebGL renderer"),
        ("d3.select", "d3", "D3.js DOM selection runtime"),
        ("window.lodash", "lodash", "Lodash utility library"),
    ]

    COMMENT_MARKER_PATTERNS = [
        ("This site is optimized with the Yoast SEO plugin", "wordpress", "Yoast SEO WordPress plugin HTML comment"),
        ("All in One SEO Pack", "wordpress", "All in One SEO WordPress plugin HTML comment"),
        ("This site is powered by W3 Total Cache", "wordpress", "W3 Total Cache WordPress plugin HTML comment"),
        ("Powered by Slider Revolution", "wordpress", "Slider Revolution WordPress plugin HTML comment"),
        ("Performance optimized by W3 Total Cache", "wordpress", "W3 Total Cache HTML comment"),
        ("Protected by Akismet", "wordpress", "Akismet anti-spam WordPress plugin HTML comment"),
    ]

    @classmethod
    def extract(cls, html_input: bytes | str | None = None, soup: BeautifulSoup | None = None) -> RawPageEvidence:
        """Parse HTML safely and return bounded technology signals."""
        if not html_input and soup is None:
            return RawPageEvidence()

        html_str = ""
        if isinstance(html_input, bytes):
            html_str = html_input.decode("utf-8", errors="replace")
        elif isinstance(html_input, str):
            html_str = html_input

        if soup is None:
            try:
                soup = BeautifulSoup(html_str, "lxml")
            except Exception as e:
                logger.warning(f"Failed to parse with lxml, falling back to html.parser: {e}")
                try:
                    soup = BeautifulSoup(html_str, "html.parser")
                except Exception:
                    return RawPageEvidence()

        evidence = RawPageEvidence()

        # 1. Meta generators
        for meta in soup.find_all("meta"):
            name = (meta.get("name") or meta.get("property") or "").strip().lower()
            if name == "generator":
                content = (meta.get("content") or "").strip()
                if content and len(content) <= 200:
                    evidence.meta_generators.append(content)

        # 2. Script source URLs (capped at 100)
        seen_scripts = set()
        for script in soup.find_all("script", src=True):
            src = script.get("src", "").strip()
            if src and src not in seen_scripts and len(src) <= 500:
                seen_scripts.add(src)
                evidence.script_sources.append(src)
                if len(evidence.script_sources) >= 100:
                    break

        # 3. Stylesheet URLs (capped at 100)
        seen_links = set()
        for link in soup.find_all("link", rel=True):
            rel = link.get("rel")
            is_stylesheet = False
            if isinstance(rel, list):
                is_stylesheet = any(r.lower() == "stylesheet" for r in rel)
            elif isinstance(rel, str):
                is_stylesheet = "stylesheet" in rel.lower()

            if is_stylesheet:
                href = link.get("href", "").strip()
                if href and href not in seen_links and len(href) <= 500:
                    seen_links.add(href)
                    evidence.stylesheet_hrefs.append(href)
                    if len(evidence.stylesheet_hrefs) >= 100:
                        break

        # 4. DOM attributes & framework markers
        seen_dom = set()
        # HTML tag attributes
        html_tag = soup.find("html")
        if html_tag:
            for attr in ("data-wf-page", "data-wf-site", "ng-app", "ng-version"):
                if attr in html_tag.attrs:
                    marker = f"html[{attr}]"
                    if marker not in seen_dom:
                        seen_dom.add(marker)
                        evidence.dom_markers.append(marker)
            # Save relevant html attributes
            for k in ("lang", "class", "id", "data-wf-page", "data-wf-site"):
                if k in html_tag.attrs:
                    evidence.html_attributes[k] = str(html_tag[k])[:100]

        # Body tag classes
        body_tag = soup.find("body")
        if body_tag:
            for attr in ("data-wf-page", "data-wf-site", "ng-app", "ng-controller", "data-reactroot", "data-reactid"):
                if attr in body_tag.attrs:
                    marker = f"body[{attr}]"
                    if marker not in seen_dom:
                        seen_dom.add(marker)
                        evidence.dom_markers.append(marker)

            classes = body_tag.get("class", [])
            if isinstance(classes, list):
                for c in classes[:50]:
                    evidence.body_classes.append(str(c)[:50])
            elif isinstance(classes, str):
                for c in classes.split()[:50]:
                    evidence.body_classes.append(str(c)[:50])

        # Scan for React, Angular, Vue, Webflow attributes on any elements
        # Target specific queries instead of full DOM traverse to remain performant
        if soup.find(attrs={"data-reactroot": True}):
            evidence.dom_markers.append("data-reactroot")
        if soup.find(attrs={"data-reactid": True}):
            evidence.dom_markers.append("data-reactid")
        if soup.find(attrs={"ng-version": True}):
            ng_elem = soup.find(attrs={"ng-version": True})
            ng_ver = ng_elem.get("ng-version", "")
            evidence.dom_markers.append(f"ng-version:{ng_ver}" if ng_ver else "ng-version")
        if soup.find(attrs={"ng-app": True}):
            evidence.dom_markers.append("ng-app")
        if soup.find(attrs={"id": "__next"}):
            evidence.dom_markers.append("id:__next")
        if soup.find(attrs={"id": "__nuxt"}):
            evidence.dom_markers.append("id:__nuxt")
        if soup.find(attrs={"data-wf-page": True}) or soup.find(attrs={"data-wf-site": True}):
            evidence.dom_markers.append("webflow:data-wf")

        # Framer DOM attributes and badges
        framer_name_elem = soup.find(attrs={"data-framer-name": True})
        if framer_name_elem:
            val = str(framer_name_elem.get("data-framer-name", ""))[:50].strip()
            marker = f"framer:data-framer-name:{val}" if val else "framer:data-framer-name"
            if marker not in seen_dom:
                seen_dom.add(marker)
                evidence.dom_markers.append(marker)
        if soup.find(attrs={"data-framer-hydrate-v2": True}):
            if "framer:data-framer-hydrate-v2" not in seen_dom:
                seen_dom.add("framer:data-framer-hydrate-v2")
                evidence.dom_markers.append("framer:data-framer-hydrate-v2")
        if soup.find(attrs={"data-framer-component": True}):
            if "framer:data-framer-component" not in seen_dom:
                seen_dom.add("framer:data-framer-component")
                evidence.dom_markers.append("framer:data-framer-component")
        if soup.find(attrs={"id": "__framer-badge-container"}):
            if "id:__framer-badge-container" not in seen_dom:
                seen_dom.add("id:__framer-badge-container")
                evidence.dom_markers.append("id:__framer-badge-container")

        # Vue scoped CSS attributes (e.g. data-v-xxxx)
        for tag in soup.find_all(True, limit=100):
            for a in tag.attrs:
                if str(a).startswith("data-v-"):
                    if "vue:data-v" not in seen_dom:
                        seen_dom.add("vue:data-v")
                        evidence.dom_markers.append("vue:data-v")
                        break

        # Qwik DOM container
        if soup.find(attrs={"q:container": True}) or soup.find(attrs={"q:version": True}):
            if "q:container" not in seen_dom:
                seen_dom.add("q:container")
                evidence.dom_markers.append("q:container")

        # SolidJS hydration marker
        if soup.find(attrs={"data-hk": True}):
            if "data-hk" not in seen_dom:
                seen_dom.add("data-hk")
                evidence.dom_markers.append("data-hk")

        # Swiper slider container
        if soup.find(class_=re.compile(r"swiper-(container|wrapper|slide)")):
            if "swiper-container" not in seen_dom:
                seen_dom.add("swiper-container")
                evidence.dom_markers.append("swiper-container")

        # Alpine.js x-data / x-init
        if soup.find(attrs={"x-data": True}) or soup.find(attrs={"x-init": True}):
            if "x-data" not in seen_dom:
                seen_dom.add("x-data")
                evidence.dom_markers.append("x-data")

        # HTMX attributes
        if soup.find(lambda el: any(isinstance(k, str) and k.startswith("hx-") for k in el.attrs) if hasattr(el, 'attrs') else False):
            if "hx-get" not in seen_dom:
                seen_dom.add("hx-get")
                evidence.dom_markers.append("hx-get")

        # Material UI class conventions
        if soup.find(class_=re.compile(r"Mui[A-Z][a-zA-Z]+-")):
            if "MuiButton" not in seen_dom:
                seen_dom.add("MuiButton")
                evidence.dom_markers.append("MuiButton")

        # Chakra UI class conventions
        if soup.find(class_=re.compile(r"chakra-")):
            if "chakra-button" not in seen_dom:
                seen_dom.add("chakra-button")
                evidence.dom_markers.append("chakra-button")

        # Ant Design class conventions
        if soup.find(class_=re.compile(r"ant-(btn|layout|menu|row)")):
            if "ant-btn" not in seen_dom:
                seen_dom.add("ant-btn")
                evidence.dom_markers.append("ant-btn")

        # 5. Asset and image URL extraction (bounded, safe)
        TARGET_ASSET_DOMAINS = (
            "framerusercontent.com",
            "framerstatic.com",
            "framercdn.com",
            "ctfassets.net",
            "cdn.sanity.io",
            "storyblok.com",
            "graphassets.com",
            "datocms-assets.com",
            "shopify.com",
        )
        seen_assets = set()
        for img in soup.find_all("img", src=True, limit=50):
            src = img.get("src", "").strip()
            if src and src not in seen_assets and len(src) <= 500:
                low_src = src.lower()
                if any(d in low_src for d in TARGET_ASSET_DOMAINS):
                    seen_assets.add(src)
                    evidence.asset_urls.append(src)
                    if len(evidence.asset_urls) >= 50:
                        break

        if len(evidence.asset_urls) < 50:
            for source in soup.find_all("source", srcset=True, limit=50):
                srcset = source.get("srcset", "").strip()
                if srcset and any(d in srcset.lower() for d in TARGET_ASSET_DOMAINS):
                    match = re.search(r"(https?://[^\s,]+)", srcset)
                    if match:
                        u = match.group(1).strip()
                        if u not in seen_assets and len(u) <= 500:
                            seen_assets.add(u)
                            evidence.asset_urls.append(u)
                            if len(evidence.asset_urls) >= 50:
                                break

        # 6. Inline script inspection & HTML comments
        # Look for inline scripts
        for script in soup.find_all("script", src=False):
            content = script.string or script.get_text()
            if not content:
                continue
            # Check for script id
            s_id = script.get("id", "")
            if s_id in ("__NEXT_DATA__", "__NUXT_DATA__"):
                evidence.inline_markers.append(f"script_id:{s_id}")

            # Check pre-compiled inline marker patterns
            for pat, tech, desc in cls.INLINE_MARKER_PATTERNS:
                if pat in content:
                    marker_key = f"{tech}:{pat}"
                    if marker_key not in seen_dom:
                        seen_dom.add(marker_key)
                        evidence.inline_markers.append(marker_key)

        # Check HTML comments (scan top 50KB of HTML)
        top_slice = html_str[:50000]
        for pat, tech, desc in cls.COMMENT_MARKER_PATTERNS:
            idx = top_slice.find(pat)
            if idx != -1:
                end_idx = top_slice.find("-->", idx)
                if end_idx != -1 and (end_idx - idx) <= 200:
                    snippet = top_slice[idx:end_idx].strip()
                else:
                    snippet = top_slice[idx : idx + 100].strip()
                marker_key = f"comment:{tech}:{snippet}"
                if marker_key not in seen_dom:
                    seen_dom.add(marker_key)
                    evidence.inline_markers.append(marker_key)

        return evidence
