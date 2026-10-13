"""Deterministic similarity and distance metrics for near-duplicate content analysis."""


def simhash_hamming_distance(hex1: str, hex2: str) -> int:
    """Calculate Hamming distance between two 16-character hex 64-bit SimHash signatures.

    Returns an integer distance between 0 (identical) and 64 (maximally distant).
    """
    if not hex1 or not hex2 or len(hex1) != 16 or len(hex2) != 16:
        return 64

    int1 = int(hex1, 16)
    int2 = int(hex2, 16)
    xor_val = int1 ^ int2
    return bin(xor_val).count("1")


def simhash_similarity(hex1: str, hex2: str = "") -> float:
    """Compute normalized similarity metric in range [0.0, 1.0] from SimHash signatures.

    If second argument is omitted and first is an integer distance, converts distance.
    Otherwise compares two hex strings directly: (64 - distance) / 64.0.
    """
    if isinstance(hex1, (int, float)):
        # Support calling with pre-computed distance
        dist = int(hex1)
        return max(0.0, min(1.0, (64 - dist) / 64.0))

    if not hex2:
        return 0.0

    dist = simhash_hamming_distance(hex1, hex2)
    return max(0.0, min(1.0, (64 - dist) / 64.0))


def length_similarity(len1: int, len2: int) -> float:
    """Compute bounded length ratio between two content strings in range [0.0, 1.0]."""
    if len1 == 0 and len2 == 0:
        return 1.0
    if len1 == 0 or len2 == 0:
        return 0.0
    min_len = min(len1, len2)
    max_len = max(len1, len2)
    return min_len / max_len
