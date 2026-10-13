"""Smart JavaScript detection heuristics for deciding when to render pages dynamically."""

import re
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

from app.renderer.render_policy import RenderDecision, RenderMode, RenderStrategy


# Common SPA root container selectors
SPA_ROOT_SELECTORS = [
    "#root",
    "#app",
    "#__next",
    "#main-root",
    "app-root",
    "[data-reactroot]",
]

# Client-side loading / disabled JS indicators
CLIENT_PLACEHOLDER_PATTERNS = [
    re.compile(r"you need to enable javascript", re.IGNORECASE),
    re.compile(r"please enable javascript", re.IGNORECASE),
    re.compile(r"javascript is required", re.IGNORECASE),
    re.compile(r"enable javascript to view this page", re.IGNORECASE),
    re.compile(r"loading application", re.IGNORECASE),
    re.compile(r"loading\.\.\.", re.IGNORECASE),
]

# Framework script markers
FRAMEWORK_SCRIPT_PATTERNS = [
    re.compile(r"react(?:\.production)?(?:\.min)?\.js", re.IGNORECASE),
    re.compile(r"vue(?:\.runtime)?(?:\.min)?\.js", re.IGNORECASE),
    re.compile(r"angular(?:\.min)?\.js", re.IGNORECASE),
    re.compile(r"_next/static", re.IGNORECASE),
    re.compile(r"vite/client", re.IGNORECASE),
    re.compile(r"main\.[a-zA-Z0-9_-]+\.js", re.IGNORECASE),
    re.compile(r"bundle\.[a-zA-Z0-9_-]+\.js", re.IGNORECASE),
]


class RenderDetector:
    """Evaluates raw HTML to determine whether dynamic browser rendering is required or beneficial."""

    @classmethod
    def detect(
        cls,
        raw_html: str,
        http_status: Optional[int] = 200,
        content_type: Optional[str] = "text/html",
        allow_public_rendering: bool = False,
        render_mode: RenderMode = RenderMode.auto,
    ) -> RenderDecision:
        """Evaluate page HTML and return a typed RenderDecision."""
        evidence: Dict[str, Any] = {
            "render_mode": render_mode.value,
            "allow_public_rendering": allow_public_rendering,
            "http_status": http_status,
            "content_type": content_type,
            "empty_roots": [],
            "client_placeholders": [],
            "framework_hints": [],
            "visible_text_length": 0,
            "tag_count": 0,
            "heading_count": 0,
            "ssr_content_present": False,
        }

        # 1. Non-200 responses or non-HTML content do not need browser rendering
        if http_status and http_status >= 400:
            return RenderDecision(
                strategy=RenderStrategy.HTTP_ONLY,
                reason=f"HTTP status {http_status} indicates client/server error; browser rendering not required.",
                evidence=evidence,
            )

        if content_type and "html" not in content_type.lower():
            return RenderDecision(
                strategy=RenderStrategy.HTTP_ONLY,
                reason=f"Content-Type '{content_type}' is not HTML; browser rendering not applicable.",
                evidence=evidence,
            )

        # 2. Mode 'never' overrides all heuristics
        if render_mode == RenderMode.never:
            return RenderDecision(
                strategy=RenderStrategy.HTTP_ONLY,
                reason="Policy configured to never render JavaScript (render_javascript=never).",
                evidence=evidence,
            )

        # 3. Parse HTML
        soup = BeautifulSoup(raw_html or "", "lxml")

        # Extract visible body text (excluding script and style tags)
        for s in soup(["script", "style", "noscript"]):
            s.decompose()

        body = soup.find("body") or soup
        visible_text = body.get_text(separator=" ", strip=True) if body else ""
        text_length = len(visible_text)
        evidence["visible_text_length"] = text_length

        headings = soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])
        evidence["heading_count"] = len(headings)
        evidence["tag_count"] = len(soup.find_all())

        # 4. Check for empty SPA root containers
        raw_soup = BeautifulSoup(raw_html or "", "lxml")
        empty_roots: List[str] = []
        for selector in SPA_ROOT_SELECTORS:
            try:
                elem = raw_soup.select_one(selector)
                if elem:
                    elem_text = elem.get_text(strip=True)
                    # Check if root is empty or only contains comments/loader
                    if len(elem_text) < 50:
                        empty_roots.append(selector)
            except Exception:
                pass
        evidence["empty_roots"] = empty_roots

        # 5. Check for client-side placeholders
        placeholders: List[str] = []
        for pat in CLIENT_PLACEHOLDER_PATTERNS:
            if pat.search(raw_html or ""):
                placeholders.append(pat.pattern)
        evidence["client_placeholders"] = placeholders

        # 6. Check for framework script tags
        frameworks: List[str] = []
        scripts = raw_soup.find_all("script", src=True)
        for sc in scripts:
            src = sc.get("src", "")
            for pat in FRAMEWORK_SCRIPT_PATTERNS:
                if pat.search(src):
                    frameworks.append(pat.pattern)
                    break

        if raw_soup.find("script", id="__NEXT_DATA__"):
            frameworks.append("__NEXT_DATA__")

        evidence["framework_hints"] = list(set(frameworks))

        # 7. Check for Server-Side Rendering (SSR)
        # If frameworks are present, but there is rich content (> 500 chars of text and headings)
        if len(frameworks) > 0 and text_length >= 250 and len(headings) >= 1:
            evidence["ssr_content_present"] = True
            # Server-rendered HTML is already complete!
            if render_mode != RenderMode.always:
                return RenderDecision(
                    strategy=RenderStrategy.HTTP_ONLY,
                    reason="Page uses modern JavaScript framework (SSR) but already contains complete server-rendered content and headings; browser rendering not required.",
                    evidence=evidence,
                )

        # 8. Evaluate if rendering is required or recommended
        is_spa_empty = len(empty_roots) > 0 and text_length < 250
        is_client_placeholder = len(placeholders) > 0
        is_sparse_with_scripts = text_length < 150 and len(scripts) >= 2

        requires_render = is_spa_empty or is_client_placeholder
        recommends_render = is_sparse_with_scripts or (render_mode == RenderMode.always)

        if requires_render:
            if not allow_public_rendering:
                return RenderDecision(
                    strategy=RenderStrategy.RENDER_UNAVAILABLE,
                    reason="Client-side rendered SPA detected with empty application root or placeholder, but public browser rendering is currently disabled due to missing network isolation.",
                    evidence=evidence,
                )
            return RenderDecision(
                strategy=RenderStrategy.RENDER_REQUIRED,
                reason="Client-rendered SPA detected with empty root element or placeholder text; JavaScript rendering required to extract DOM.",
                evidence=evidence,
            )

        if recommends_render:
            if not allow_public_rendering:
                return RenderDecision(
                    strategy=RenderStrategy.RENDER_UNAVAILABLE,
                    reason="Sparse initial content detected where dynamic rendering was recommended, but public browser rendering is currently disabled due to network isolation policy.",
                    evidence=evidence,
                )
            return RenderDecision(
                strategy=RenderStrategy.RENDER_RECOMMENDED,
                reason="Page has sparse initial content with client scripts; JavaScript rendering recommended.",
                evidence=evidence,
            )

        # 9. Default: HTTP only
        return RenderDecision(
            strategy=RenderStrategy.HTTP_ONLY,
            reason="Initial HTTP response provides complete HTML content and SEO metadata; dynamic browser rendering not required.",
            evidence=evidence,
        )
