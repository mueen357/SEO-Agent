"""Deterministic 64-bit SimHash and SHA-256 fingerprint algorithms."""

import hashlib
from typing import List, Union


def compute_content_sha256(normalized_text: str) -> str:
    """Compute hex SHA-256 digest of normalized main text."""
    if not normalized_text:
        return ""
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()


compute_sha256_hash = compute_content_sha256


def compute_simhash64(tokens: Union[List[str], str]) -> str:
    """Compute deterministic 64-bit SimHash signature as a 16-character hex string.

    Avoids SQLite signed 64-bit integer overflow by returning fixed-width hex.
    Accepts either a pre-tokenized list of tokens or a string (which will be split on whitespace).
    """
    if not tokens:
        return "0" * 16

    if isinstance(tokens, str):
        tokens = tokens.split()
        if not tokens:
            return "0" * 16

    # 64-bit accumulator vector
    vector = [0] * 64

    # Hash each token into 64 bits and accumulate weights
    for token in tokens:
        # Use MD5 prefix for fast, deterministic 64-bit integer hash
        token_hash = int.from_bytes(hashlib.md5(token.encode("utf-8")).digest()[:8], "big")

        for bit in range(64):
            if (token_hash >> bit) & 1:
                vector[bit] += 1
            else:
                vector[bit] -= 1

    # Form 64-bit integer signature: 1 if vector[i] > 0 else 0
    simhash_int = 0
    for bit in range(64):
        if vector[bit] > 0:
            simhash_int |= 1 << bit

    # Format as 16-character lowercase hex string
    return format(simhash_int, "016x")
