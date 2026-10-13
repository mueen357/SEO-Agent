"""Text and Unicode normalization for deterministic content analysis."""

import html
import re
import unicodedata


def normalize_text(text: str) -> str:
    """Normalize raw text using Unicode NFKC, HTML entity decoding, and whitespace compaction."""
    if not text:
        return ""

    # Decode HTML entities (&amp;, &nbsp;, etc.)
    decoded = html.unescape(text)

    # Unicode NFKC normalization decomposes and maps compatible characters
    nfkc_text = unicodedata.normalize("NFKC", decoded)

    # Collapse any whitespace, tabs, newlines, non-breaking spaces ( ), zero-width spaces (​)
    cleaned = re.sub(r"[\s\u00a0\u200b\ufeff]+", " ", nfkc_text).strip()
    return cleaned


def case_fold_text(text: str) -> str:
    """Normalize text and fold case for case-insensitive matching."""
    return normalize_text(text).lower()


def tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase alphanumeric words for feature hashing."""
    normalized = case_fold_text(text)
    # Extract word tokens with length >= 2
    tokens = [t for t in re.findall(r"\b\w+\b", normalized) if len(t) >= 2]
    return tokens


def extract_word_ngrams(tokens: list[str], n: int = 2) -> list[str]:
    """Generate word n-grams to capture phrase-level features for near-duplicate analysis."""
    if len(tokens) < n:
        return tokens
    return [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


# Aliases for backward compatibility and test consistency
normalize_unicode_and_entities = normalize_text
clean_text_for_comparison = case_fold_text
tokenize_words = tokenize
generate_word_ngrams = extract_word_ngrams
