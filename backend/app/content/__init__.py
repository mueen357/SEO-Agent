"""Content extraction, normalization, and fingerprinting module."""

from app.content.extractor import MainContentExtractor, MainContentResult
from app.content.fingerprint import compute_content_sha256, compute_simhash64
from app.content.normalizer import case_fold_text, normalize_text, tokenize
from app.content.similarity import length_similarity, simhash_hamming_distance, simhash_similarity

__all__ = [
    "MainContentExtractor",
    "MainContentResult",
    "compute_content_sha256",
    "compute_simhash64",
    "normalize_text",
    "case_fold_text",
    "tokenize",
    "simhash_hamming_distance",
    "simhash_similarity",
    "length_similarity",
]
