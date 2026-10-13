"""HTML extraction and metadata parsing using BeautifulSoup and lxml."""

from dataclasses import dataclass, field
import hashlib
import json
import logging
import re
from typing import Any
from bs4 import BeautifulSoup

from app.content import MainContentExtractor
from app.crawler.normalizer import normalize_url
from app.crawler.scope import CrawlScope

logger = logging.getLogger(__name__)


@dataclass
class DiscoveredLink:
    """Discovered hyperlink from an HTML document."""

    destination_url: str
    link_text: str
    internal: bool


@dataclass
class ParsedPageData:
    """Extracted SEO and structural metadata from an HTML document."""

    title: str | None = None
    meta_description: str | None = None
    canonical_url: str | None = None
    canonical_tag_count: int | None = None
    canonical_hrefs: list[str] = field(default_factory=list)
    meta_robots: str | None = None
    html_lang: str | None = None
    headings_json: dict[str, Any] = field(default_factory=dict)
    image_count: int = 0
    missing_alt_count: int = 0
    empty_alt_count: int = 0
    internal_link_count: int = 0
    external_link_count: int = 0
    discovered_links: list[DiscoveredLink] = field(default_factory=list)
    content_hash: str | None = None

    # Main content extraction and fingerprints
    normalized_main_text_hash: str | None = None
    main_text_simhash: str | None = None
    main_text_word_count: int = 0
    main_text_character_count: int = 0
    extraction_source: str = "empty"
    extraction_version: str = "1.0.0"
    content_quality_status: str = "empty"


class HTMLPageParser:
    """Robust HTML document parser."""

    @staticmethod
    def parse(
        html_bytes: bytes,
        current_url: str,
        scope: CrawlScope,
        max_links: int = 200,
    ) -> ParsedPageData:
        """Extract structured SEO metadata and links from HTML bytes."""
        if not html_bytes:
            return ParsedPageData()

        # Compute raw content hash
        content_hash = hashlib.sha256(html_bytes).hexdigest()

        # Extract main text and content fingerprints
        content_res = MainContentExtractor.extract(html_bytes)

        try:
            soup = BeautifulSoup(html_bytes, "lxml")
        except Exception as e:
            logger.warning(f"HTML parsing failed with lxml, falling back to html.parser: {e}")
            try:
                soup = BeautifulSoup(html_bytes, "html.parser")
            except Exception:
                return ParsedPageData(
                    content_hash=content_hash,
                    normalized_main_text_hash=content_res.normalized_main_text_hash,
                    main_text_simhash=content_res.main_text_simhash,
                    main_text_word_count=content_res.word_count,
                    main_text_character_count=content_res.character_count,
                    extraction_source=content_res.extraction_source,
                    extraction_version=content_res.extraction_version,
                    content_quality_status=content_res.content_quality_status,
                )

        # 1. Title (bounded)
        title_tag = soup.find("title")
        title = None
        if title_tag and title_tag.string:
            title = title_tag.get_text().strip()[:500]

        # 2. Meta description (specifically standard meta description, NOT og:description)
        meta_desc = None
        for tag in soup.find_all("meta"):
            name = tag.get("name", "").strip().lower()
            if name == "description":
                content = tag.get("content", "")
                if content:
                    meta_desc = content.strip()[:1000]
                    break

        # 3. Canonical URLs and tag count
        canonical_url = None
        canonical_hrefs: list[str] = []
        canonical_tags = soup.find_all(
            "link",
            rel=lambda r: r and ("canonical" in r if isinstance(r, list) else "canonical" in str(r).lower()),
        )
        canonical_tag_count = len(canonical_tags)
        for tag in canonical_tags[:10]:
            raw_href = tag.get("href", "").strip()
            if raw_href:
                canonical_hrefs.append(raw_href)

        if canonical_hrefs:
            canonical_url = normalize_url(canonical_hrefs[0], base_url=current_url)

        # 4. Meta robots
        meta_robots = None
        robots_tag = soup.find("meta", attrs={"name": lambda n: n and n.lower() == "robots"})
        if robots_tag and robots_tag.get("content"):
            meta_robots = robots_tag.get("content", "").strip()[:200]

        # 5. HTML lang attribute
        html_tag = soup.find("html")
        html_lang = None
        if html_tag and html_tag.get("lang"):
            html_lang = html_tag.get("lang", "").strip()[:50]

        # 6. Headings (h1 to h6)
        headings_data: dict[str, Any] = {
            "h1": [],
            "h2": [],
            "h3": [],
            "h4": [],
            "h5": [],
            "h6": [],
            "counts": {"h1": 0, "h2": 0, "h3": 0, "h4": 0, "h5": 0, "h6": 0},
        }

        for level in ("h1", "h2", "h3", "h4", "h5", "h6"):
            found = soup.find_all(level)
            headings_data["counts"][level] = len(found)
            # Sample up to 10 headings per level with bounded text
            for h in found[:10]:
                text = h.get_text().strip()[:200]
                if text:
                    headings_data[level].append(text)

        # 7. Images and alt text analysis
        images = soup.find_all("img")
        image_count = len(images)
        missing_alt_count = 0
        empty_alt_count = 0

        for img in images:
            if "alt" not in img.attrs:
                missing_alt_count += 1
            else:
                alt_val = img.get("alt", "").strip()
                if not alt_val:
                    empty_alt_count += 1

        # 8. Links classification and discovery
        discovered_links: list[DiscoveredLink] = []
        internal_count = 0
        external_count = 0
        seen_destinations: set[str] = set()

        for a in soup.find_all("a", href=True):
            raw_href = a.get("href", "").strip()
            if not raw_href or raw_href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            normalized_link = normalize_url(raw_href, base_url=current_url)
            if not normalized_link:
                continue

            is_internal = scope.is_in_scope(normalized_link)
            if is_internal:
                internal_count += 1
            else:
                external_count += 1

            if normalized_link not in seen_destinations and len(discovered_links) < max_links:
                seen_destinations.add(normalized_link)
                link_text = a.get_text().strip()[:200]
                discovered_links.append(
                    DiscoveredLink(
                        destination_url=normalized_link,
                        link_text=link_text,
                        internal=is_internal,
                    )
                )

        return ParsedPageData(
            title=title,
            meta_description=meta_desc,
            canonical_url=canonical_url,
            canonical_tag_count=canonical_tag_count,
            canonical_hrefs=canonical_hrefs,
            meta_robots=meta_robots,
            html_lang=html_lang,
            headings_json=headings_data,
            image_count=image_count,
            missing_alt_count=missing_alt_count,
            empty_alt_count=empty_alt_count,
            internal_link_count=internal_count,
            external_link_count=external_count,
            discovered_links=discovered_links,
            content_hash=content_hash,
            normalized_main_text_hash=content_res.normalized_main_text_hash,
            main_text_simhash=content_res.main_text_simhash,
            main_text_word_count=content_res.word_count,
            main_text_character_count=content_res.character_count,
            extraction_source=content_res.extraction_source,
            extraction_version=content_res.extraction_version,
            content_quality_status=content_res.content_quality_status,
        )
