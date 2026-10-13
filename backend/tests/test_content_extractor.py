"""Comprehensive unit tests for deterministic main content extraction, normalization, and SimHash."""

import pytest
from app.content.extractor import MainContentExtractor
from app.content.fingerprint import compute_content_sha256, compute_simhash64
from app.content.normalizer import (
    case_fold_text,
    clean_text_for_comparison,
    extract_word_ngrams,
    generate_word_ngrams,
    normalize_text,
    normalize_unicode_and_entities,
    tokenize,
    tokenize_words,
)
from app.content.similarity import length_similarity, simhash_hamming_distance, simhash_similarity


def test_unicode_and_entity_normalization():
    raw = "Caf&eacute; &amp; &quot;b&eacute;b&eacute;&quot; \u201cquotes\u201d \u2014 dash"
    normalized = normalize_unicode_and_entities(raw)
    assert "Café" in normalized
    assert "&" in normalized
    assert '"bébé"' in normalized
    assert "quotes" in normalized
    assert "dash" in normalized


def test_clean_text_for_comparison():
    raw = "   HELLO,   \n\tWorld! \r\n This is a TEST...   "
    cleaned = clean_text_for_comparison(raw)
    assert "hello" in cleaned
    assert "world" in cleaned
    assert "test" in cleaned
    assert "\n" not in cleaned
    assert "\t" not in cleaned


def test_tokenize_and_ngrams():
    text = "the quick brown fox jumps over the lazy dog"
    tokens = tokenize_words(text)
    assert len(tokens) == 9
    assert tokens[0] == "the"
    assert tokens[1] == "quick"

    bigrams = generate_word_ngrams(tokens, n=2)
    assert len(bigrams) == 8
    assert bigrams[0] == "the quick"
    assert bigrams[1] == "quick brown"


def test_simhash_stability_and_hex_format():
    text1 = "Antigravity site-wide SEO audit engine provides deterministic content analysis."
    hash1 = compute_simhash64(text1)
    hash2 = compute_simhash64(text1)

    # Deterministic stability
    assert hash1 == hash2
    # Exactly 16-character lowercase hex string (unsigned 64-bit safe representation)
    assert len(hash1) == 16
    assert all(c in "0123456789abcdef" for c in hash1)


def test_hamming_distance_and_similarity():
    # Identical text
    h1 = compute_simhash64("Deterministic SEO duplicate content detection and analysis.")
    h2 = compute_simhash64("Deterministic SEO duplicate content detection and analysis.")
    dist = simhash_hamming_distance(h1, h2)
    assert dist == 0
    assert simhash_similarity(h1, h2) == 1.0
    assert simhash_similarity(dist) == 1.0

    # Completely different text
    h_unrelated = compute_simhash64("Quantum electrodynamics in relativistic particle physics.")
    dist_unrelated = simhash_hamming_distance(h1, h_unrelated)
    assert dist_unrelated > 10
    assert simhash_similarity(h1, h_unrelated) < 0.85


def test_length_similarity():
    assert length_similarity(100, 100) == 1.0
    assert length_similarity(80, 100) == 0.8
    assert length_similarity(0, 50) == 0.0
    assert length_similarity(0, 0) == 1.0


def test_main_content_extraction_article_and_boilerplate_removal():
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>Test Article</title></head>
    <body>
        <nav>
            <ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul>
        </nav>
        <header>
            <h1>Site Header Menu</h1>
        </header>
        <main>
            <article>
                <h1>Primary Article Title</h1>
                <p>This is the first paragraph of the primary article body explaining SEO architecture.</p>
                <p>This is the second paragraph providing deep technical details about internal link graphs.</p>
            </article>
        </main>
        <aside>
            <p>Related sidebar widgets and promotional banners that should be excluded.</p>
        </aside>
        <footer>
            <p>Copyright 2026 Example Corp. All rights reserved. Privacy Policy.</p>
        </footer>
        <script>console.log("tracking");</script>
    </body>
    </html>
    """
    result = MainContentExtractor.extract_from_html(html)

    assert result.status == "usable"
    assert result.source == "main"
    assert "Primary Article Title" in result.cleaned_text
    assert "SEO architecture" in result.cleaned_text
    # Boilerplate removed
    assert "Privacy Policy" not in result.cleaned_text
    assert "Site Header Menu" not in result.cleaned_text
    assert "console.log" not in result.cleaned_text
    assert result.character_count > 50
    assert result.word_count > 10
    assert len(result.simhash) == 16
    assert len(result.normalized_text_sha256) == 64


def test_main_content_extraction_fallback_without_main_or_article():
    html = """
    <html>
    <body>
        <div id="content">
            <h2>Welcome to our product showcase</h2>
            <p>We provide comprehensive website audit services for enterprise software applications.</p>
            <p>Our tools scan for broken links, missing canonicals, and duplicate pages.</p>
        </div>
    </body>
    </html>
    """
    result = MainContentExtractor.extract_from_html(html)
    assert result.status == "usable"
    assert "Welcome to our product showcase" in result.cleaned_text
    assert result.word_count > 10


def test_main_content_extraction_empty_or_whitespace():
    empty_result = MainContentExtractor.extract_from_html("")
    assert empty_result.status == "empty"
    assert empty_result.word_count == 0
    assert empty_result.normalized_text_sha256 == ""
    assert empty_result.simhash == "0000000000000000"

    whitespace_html = "<html><body>   <p>   \n\t  </p></body></html>"
    ws_result = MainContentExtractor.extract_from_html(whitespace_html)
    assert ws_result.status == "empty"


def test_main_content_extraction_thin_boilerplate_only():
    html = """
    <html>
    <body>
        <nav><a href="/">Home</a></nav>
        <footer>Copyright 2026</footer>
    </body>
    </html>
    """
    result = MainContentExtractor.extract_from_html(html)
    # After stripping nav and footer, body has 0 primary content
    assert result.status in ("empty", "thin")
    assert result.word_count < 15
