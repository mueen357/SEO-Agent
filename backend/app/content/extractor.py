"""Main content extraction from HTML, stripping boilerplate and computing fingerprints."""

from dataclasses import dataclass
import logging
from typing import Any, List, Optional, Union
from bs4 import BeautifulSoup

from app.content.fingerprint import compute_content_sha256, compute_simhash64
from app.content.normalizer import extract_word_ngrams, normalize_text, tokenize

logger = logging.getLogger(__name__)

# Boilerplate tags to remove before main-content parsing
BOILERPLATE_TAGS = (
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "header",
    "footer",
    "nav",
    "aside",
    "form",
    "menu",
    "dialog",
)

# Common main content container selectors in priority order
PRIMARY_CONTAINERS = (
    "main",
    "article",
    '[role="main"]',
    "#content",
    ".content",
    "#main",
    ".main-content",
    ".post-content",
    ".entry-content",
    "#primary",
    ".article-content",
)


@dataclass
class MainContentResult:
    """Structured result of main content extraction and fingerprinting."""

    main_text_excerpt: str
    word_count: int
    character_count: int
    normalized_main_text_hash: str
    main_text_simhash: str
    extraction_source: str
    extraction_version: str = "1.0.0"
    content_quality_status: str = "empty"

    @property
    def status(self) -> str:
        return self.content_quality_status

    @property
    def source(self) -> str:
        return self.extraction_source

    @property
    def cleaned_text(self) -> str:
        return self.main_text_excerpt

    @property
    def simhash(self) -> str:
        return self.main_text_simhash

    @property
    def normalized_text_sha256(self) -> str:
        return self.normalized_main_text_hash


class MainContentExtractor:
    """Extracts meaningful primary text from HTML and produces deterministic fingerprints."""

    @classmethod
    def extract_from_html(cls, html: Any) -> MainContentResult:
        return cls.extract(html)

    @staticmethod
    def extract(html_bytes: Any) -> MainContentResult:
        if not html_bytes:
            return MainContentResult(
                main_text_excerpt="",
                word_count=0,
                character_count=0,
                normalized_main_text_hash="",
                main_text_simhash="0" * 16,
                extraction_source="empty",
                content_quality_status="empty",
            )

        if isinstance(html_bytes, str):
            html_bytes = html_bytes.encode("utf-8")

        try:
            soup = BeautifulSoup(html_bytes, "lxml")
        except Exception:
            try:
                soup = BeautifulSoup(html_bytes, "html.parser")
            except Exception as e:
                logger.warning(f"Failed to parse HTML for content extraction: {e}")
                return MainContentResult(
                    main_text_excerpt="",
                    word_count=0,
                    character_count=0,
                    normalized_main_text_hash="",
                    main_text_simhash="0" * 16,
                    extraction_source="non_html",
                    content_quality_status="non_html",
                )

        # 1. Remove all boilerplate elements
        for tag_name in BOILERPLATE_TAGS:
            for el in soup.find_all(tag_name):
                el.decompose()

        for el in soup.find_all(attrs={"role": lambda r: r and r.lower() in ("navigation", "banner", "contentinfo", "menu")}):
            el.decompose()

        # 2. Priority extraction: Look for primary content containers
        selected_container = None
        source_name = "body_fallback"

        for selector in PRIMARY_CONTAINERS:
            found = soup.select_one(selector)
            if found:
                text = found.get_text(separator=" ", strip=True)
                if len(text) > 40:
                    selected_container = found
                    source_name = selector.split("[")[0].replace("#", "").replace(".", "")
                    break

        if selected_container is not None:
            raw_text = selected_container.get_text(separator=" ", strip=True)
        else:
            body = soup.find("body")
            if body:
                raw_text = body.get_text(separator=" ", strip=True)
            else:
                raw_text = soup.get_text(separator=" ", strip=True)

        normalized_text = normalize_text(raw_text)
        tokens = tokenize(normalized_text)
        word_count = len(tokens)
        char_count = len(normalized_text)

        # Classification
        if word_count == 0 or char_count == 0:
            quality = "empty"
        elif word_count < 15:
            quality = "thin"
        else:
            quality = "usable"

        # Fingerprints
        if quality != "empty":
            content_hash = compute_content_sha256(normalized_text)
            simhash_val = compute_simhash64(tokens)
        else:
            content_hash = ""
            simhash_val = "0" * 16

        # Excerpt bounded to 300 chars
        excerpt = normalized_text[:300] if len(normalized_text) > 300 else normalized_text

        return MainContentResult(
            main_text_excerpt=excerpt,
            word_count=word_count,
            character_count=char_count,
            normalized_main_text_hash=content_hash,
            main_text_simhash=simhash_val,
            extraction_source=source_name,
            extraction_version="1.0.0",
            content_quality_status=quality,
        )
