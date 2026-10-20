import html5EntitiesData from './html5Entities.json';

const HTML5_ENTITIES: Record<string, string> = html5EntitiesData as Record<string, string>;

// ============================================================================
// 1. TEXT AND UNICODE NORMALIZATION
// ============================================================================

/**
 * Decodes HTML entities with full HTML5 named entity catalog, decimal, hex,
 * and astral-plane Unicode code point support.
 * Parallels Python's `html.unescape` with 100% precision.
 */
const INVALID_CHARREFS: Record<number, string> = {
  0: '\ufffd', 13: '\r', 128: '\u20ac', 129: '\x81', 130: '\u201a', 131: '\u0192',
  132: '\u201e', 133: '\u2026', 134: '\u2020', 135: '\u2021', 136: '\u02c6', 137: '\u2030',
  138: '\u0160', 139: '\u2039', 140: '\u0152', 141: '\x8d', 142: '\u017d', 143: '\x8f',
  144: '\x90', 145: '\u2018', 146: '\u2019', 147: '\u201c', 148: '\u201d', 149: '\u2022',
  150: '\u2013', 151: '\u2014', 152: '\u02dc', 153: '\u2122', 154: '\u0161', 155: '\u203a',
  156: '\u0153', 157: '\x9d', 158: '\u017e', 159: '\u0178',
};

const INVALID_CODEPOINTS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159,
  64976, 64977, 64978, 64979, 64980, 64981, 64982, 64983, 64984, 64985, 64986, 64987, 64988, 64989, 64990, 64991, 64992, 64993, 64994, 64995, 64996, 64997, 64998, 64999, 65000, 65001, 65002, 65003, 65004, 65005, 65006, 65007,
  65534, 65535, 131070, 131071, 196606, 196607, 262142, 262143, 327678, 327679, 393214, 393215, 458750, 458751, 524286, 524287, 589822, 589823, 655358, 655359, 720894, 720895, 786430, 786431, 851966, 851967, 917502, 917503, 983038, 983039, 1048574, 1048575, 1114110, 1114111,
]);

/**
 * Counts Unicode code points (characters) rather than UTF-16 code units.
 * Equivalent to Python's `len(str)`.
 */
export function unicodeCodePointCount(str: string): number {
  if (!str) return 0;
  return Array.from(str).length;
}

/**
 * Decodes HTML entities with full HTML5 named entity catalog, decimal, hex,
 * and astral-plane Unicode code point support.
 * Parallels Python's `html.unescape` with 100% precision.
 */
export function unescapeHtml(text: string): string {
  if (!text || !text.includes('&')) return text || '';
  return text.replace(/&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/g, (_match, s: string) => {
    if (s[0] === '#') {
      const isHex = s[1] === 'x' || s[1] === 'X';
      const clean = s.endsWith(';') ? s.slice(isHex ? 2 : 1, -1) : s.slice(isHex ? 2 : 1);
      const num = parseInt(clean, isHex ? 16 : 10);
      if (isNaN(num)) return '&' + s;
      if (INVALID_CHARREFS[num] !== undefined) return INVALID_CHARREFS[num];
      if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return '\ufffd';
      if (INVALID_CODEPOINTS.has(num)) return '';
      try {
        return String.fromCodePoint(num);
      } catch {
        return '\ufffd';
      }
    } else {
      if (HTML5_ENTITIES[s]) return HTML5_ENTITIES[s];
      // Longest matching prefix algorithm from HTML5 specification
      for (let x = s.length - 1; x > 1; x--) {
        const prefix = s.slice(0, x);
        if (HTML5_ENTITIES[prefix]) {
          return HTML5_ENTITIES[prefix] + s.slice(x);
        }
      }
      return '&' + s;
    }
  });
}

/**
 * Normalizes text using Unicode NFKC, HTML entity decoding, and whitespace compaction.
 * Matches backend `normalize_text` in app/content/normalizer.py.
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  // Decode HTML entities with full HTML5 specification
  const decoded = unescapeHtml(text);

  // Unicode NFKC normalization decomposes and maps compatible characters
  const nfkcText = decoded.normalize('NFKC');

  // Collapse whitespace, tabs, newlines, non-breaking spaces (\u00a0), zero-width spaces (\u200b), BOM (\ufeff)
  return nfkcText.replace(/[\s\u00a0\u200b\ufeff]+/g, ' ').trim();
}

/**
 * Normalizes text and folds case for case-insensitive matching.
 * Matches backend `case_fold_text`.
 */
export function caseFoldText(text: string): string {
  return normalizeText(text).toLowerCase();
}

/**
 * Tokenizes text into lowercase alphanumeric words for feature hashing.
 * Matches backend `tokenize` (extracts word tokens with length >= 2).
 */
export function tokenizeWords(text: string): string[] {
  const normalized = caseFoldText(text);
  // Match word characters (\w includes letters, digits, underscore)
  const matches = normalized.match(/[\p{L}\p{N}_]+/gu) || [];
  return matches.filter((t) => t.length >= 2);
}

/**
 * Generates word n-grams to capture phrase-level features for near-duplicate analysis.
 * Matches backend `extract_word_ngrams`.
 */
export function extractWordNgrams(tokens: string[], n: number = 2): string[] {
  if (tokens.length < n) return [...tokens];
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

// ============================================================================
// 2. DETERMINISTIC SYNCHRONOUS SHA-256 (FIPS 180-4)
// ============================================================================

function sha256Sync(str: string): string {
  const utf8Bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8Bytes.push(
        0xe0 | (charCode >> 12),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f)
      );
    } else {
      i++;
      const codePoint = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let H0 = 0x6a09e667,
    H1 = 0xbb67ae85,
    H2 = 0x3c6ef372,
    H3 = 0xa54ff53a,
    H4 = 0x510e527f,
    H5 = 0x9b05688c,
    H6 = 0x1f83d9ab,
    H7 = 0x5be0cd19;

  const bitLength = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while ((utf8Bytes.length + 8) % 64 !== 0) {
    utf8Bytes.push(0);
  }

  // 64-bit length big-endian
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  for (let i = 3; i >= 0; i--) utf8Bytes.push((highBits >>> (i * 8)) & 0xff);
  for (let i = 3; i >= 0; i--) utf8Bytes.push((lowBits >>> (i * 8)) & 0xff);

  const W = new Int32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const utf8Arr = new Uint8Array(utf8Bytes);

  for (let chunk = 0; chunk < utf8Arr.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = chunk + i * 4;
      W[i] =
        ((utf8Arr[idx] ?? 0) << 24) |
        ((utf8Arr[idx + 1] ?? 0) << 16) |
        ((utf8Arr[idx + 2] ?? 0) << 8) |
        (utf8Arr[idx + 3] ?? 0);
    }
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15] ?? 0;
      const w2 = W[i - 2] ?? 0;
      const w16 = W[i - 16] ?? 0;
      const w7 = W[i - 7] ?? 0;
      const s0 = rotr(7, w15) ^ rotr(18, w15) ^ (w15 >>> 3);
      const s1 = rotr(17, w2) ^ rotr(19, w2) ^ (w2 >>> 10);
      W[i] = (((w16 + s0) | 0) + ((w7 + s1) | 0)) | 0;
    }

    let a = H0,
      b = H1,
      c = H2,
      d = H3,
      e = H4,
      f = H5,
      g = H6,
      h = H7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const ki = K[i] ?? 0;
      const wi = W[i] ?? 0;
      const temp1 = (((((h + S1) | 0) + ch) | 0) + ((ki + wi) | 0)) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    H0 = (H0 + a) | 0;
    H1 = (H1 + b) | 0;
    H2 = (H2 + c) | 0;
    H3 = (H3 + d) | 0;
    H4 = (H4 + e) | 0;
    H5 = (H5 + f) | 0;
    H6 = (H6 + g) | 0;
    H7 = (H7 + h) | 0;
  }

  const hexParts = [H0, H1, H2, H3, H4, H5, H6, H7].map((val) =>
    (val >>> 0).toString(16).padStart(8, '0')
  );
  return hexParts.join('');
}

/**
 * Computes deterministic hex SHA-256 digest of normalized main text.
 * Matches backend `compute_content_sha256`.
 */
export function computeContentSha256(normalizedText: string): string {
  if (!normalizedText) return '';
  return sha256Sync(normalizedText);
}

// ============================================================================
// 3. DETERMINISTIC MD5 & 64-BIT SIMHASH (PARITY WITH PYTHON hashlib.md5)
// ============================================================================

/**
 * Standard RFC 1321 MD5 hash implementation returning raw 16 bytes.
 * Matches Python `hashlib.md5(token.encode('utf-8')).digest()`.
 */
function md5Bytes(str: string): Uint8Array {
  // UTF-8 encode
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) utf8.push(c);
    else if (c < 0x800) utf8.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0xd800 || c >= 0xe000)
      utf8.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      i++;
      const cp = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }

  const bitLength = utf8.length * 8;
  utf8.push(0x80);
  while ((utf8.length + 8) % 64 !== 0) utf8.push(0);

  // 64-bit length little-endian
  const lowBits = bitLength >>> 0;
  const highBits = Math.floor(bitLength / 0x100000000);
  for (let i = 0; i < 4; i++) utf8.push((lowBits >>> (i * 8)) & 0xff);
  for (let i = 0; i < 4; i++) utf8.push((highBits >>> (i * 8)) & 0xff);

  let a0 = 0x67452301,
    b0 = 0xefcdab89,
    c0 = 0x98badcfe,
    d0 = 0x10325476;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];

  const M = new Uint32Array(16);

  for (let chunk = 0; chunk < utf8.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const b0 = utf8[chunk + i * 4] ?? 0;
      const b1 = utf8[chunk + i * 4 + 1] ?? 0;
      const b2 = utf8[chunk + i * 4 + 2] ?? 0;
      const b3 = utf8[chunk + i * 4 + 3] ?? 0;
      M[i] = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
    }

    let A = a0,
      B = b0,
      C = c0,
      D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      const temp = D;
      D = C;
      C = B;
      const ki = K[i] ?? 0;
      const mg = M[g] ?? 0;
      const si = S[i] ?? 0;
      const sum = (A + F + ki + mg) | 0;
      const rot = (sum << si) | (sum >>> (32 - si));
      B = (B + rot) | 0;
      A = temp;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const out = new Uint8Array(16);
  const words = [a0, b0, c0, d0];
  for (let i = 0; i < 4; i++) {
    const w = words[i] ?? 0;
    out[i * 4] = w & 0xff;
    out[i * 4 + 1] = (w >>> 8) & 0xff;
    out[i * 4 + 2] = (w >>> 16) & 0xff;
    out[i * 4 + 3] = (w >>> 24) & 0xff;
  }
  return out;
}

/**
 * Computes deterministic 64-bit SimHash signature as a 16-character hex string.
 * Exact mathematical parity with Python `compute_simhash64` in app/content/fingerprint.py.
 */
export function computeSimHash64(tokens: string[] | string): string {
  let tokenList: string[];
  if (!tokens) return '0'.repeat(16);
  if (typeof tokens === 'string') {
    tokenList = tokens.trim().split(/\s+/).filter(Boolean);
  } else {
    tokenList = tokens;
  }
  if (tokenList.length === 0) return '0'.repeat(16);

  // 64-bit accumulator vector
  const vector = new Int32Array(64);

  // Hash each token into 64 bits and accumulate weights
  for (const token of tokenList) {
    const digest = md5Bytes(token);
    // Read first 8 bytes as big-endian 64-bit integer
    let tokenHash = 0n;
    for (let i = 0; i < 8; i++) {
      tokenHash = (tokenHash << 8n) | BigInt(digest[i] ?? 0);
    }

    for (let bit = 0; bit < 64; bit++) {
      const current = vector[bit] ?? 0;
      if (((tokenHash >> BigInt(bit)) & 1n) === 1n) {
        vector[bit] = current + 1;
      } else {
        vector[bit] = current - 1;
      }
    }
  }

  // Form 64-bit integer signature: 1 if vector[i] > 0 else 0
  let simhashInt = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if ((vector[bit] ?? 0) > 0) {
      simhashInt |= 1n << BigInt(bit);
    }
  }

  return simhashInt.toString(16).padStart(16, '0');
}

/**
 * Calculates Hamming distance between two 16-character hex 64-bit SimHash signatures.
 * Returns an integer between 0 (identical) and 64 (maximally distant).
 * Matches backend `simhash_hamming_distance`.
 */
export function simhashHammingDistance(hex1: string, hex2: string): number {
  if (!hex1 || !hex2 || hex1.length !== 16 || hex2.length !== 16) {
    return 64;
  }
  try {
    const int1 = BigInt('0x' + hex1);
    const int2 = BigInt('0x' + hex2);
    let xorVal = int1 ^ int2;
    let count = 0;
    while (xorVal > 0n) {
      if ((xorVal & 1n) === 1n) {
        count++;
      }
      xorVal >>= 1n;
    }
    return count;
  } catch {
    return 64;
  }
}

/**
 * Computes normalized similarity metric in range [0.0, 1.0] from SimHash signatures.
 * Matches backend `simhash_similarity`.
 */
export function simhashSimilarity(hex1OrDist: string | number, hex2?: string): number {
  if (typeof hex1OrDist === 'number') {
    return Math.max(0.0, Math.min(1.0, (64 - hex1OrDist) / 64.0));
  }
  if (!hex2) return 0.0;
  const dist = simhashHammingDistance(hex1OrDist, hex2);
  return Math.max(0.0, Math.min(1.0, (64 - dist) / 64.0));
}

/**
 * Computes bounded length ratio between two content strings or word counts in range [0.0, 1.0].
 * Matches backend `length_similarity`.
 */
export function lengthSimilarity(len1: number, len2: number): number {
  if (len1 === 0 && len2 === 0) return 1.0;
  if (len1 === 0 || len2 === 0) return 0.0;
  return Math.min(len1, len2) / Math.max(len1, len2);
}

// ============================================================================
// 4. MAIN CONTENT EXTRACTION & STRUCTURED EVIDENCE
// ============================================================================

export const BOILERPLATE_TAGS = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'header',
  'footer',
  'nav',
  'aside',
  'form',
  'menu',
  'dialog',
];

export const PRIMARY_CONTAINERS = [
  'main',
  'article',
  '[role="main"]',
  '#content',
  '.content',
  '#main',
  '.main-content',
  '.post-content',
  '.entry-content',
  '#primary',
  '.article-content',
];

export interface MainContentResult {
  mainTextExcerpt: string;
  wordCount: number;
  characterCount: number;
  normalizedMainTextHash: string;
  mainTextSimhash: string;
  extractionSource: string;
  extractionVersion: string;
  contentQualityStatus: 'empty' | 'thin' | 'usable' | 'sufficient' | 'non_html';
  isTruncated: boolean; // Backward compatibility (true if excerpt or source was truncated)
  isExcerptTruncated: boolean; // Excerpt truncated to 300 chars for UI/storage display
  isSourceContentTruncated: boolean; // Raw HTML input exceeded 150,000 char parsing budget
  processingLimitReached: boolean; // Safety budget reached during extraction
}

export const MAX_RAW_HTML_LENGTH = 150_000;

/**
 * Extracts meaningful primary text from HTML, stripping boilerplate and computing fingerprints.
 * Uses native DOMParser in browser/Vitest, or regex stripping fallback.
 * Parallels backend `MainContentExtractor` in app/content/extractor.py.
 */
export function extractMainContent(html: string, pageUrl?: string): MainContentResult {
  if (!html || !html.trim()) {
    return {
      mainTextExcerpt: '',
      wordCount: 0,
      characterCount: 0,
      normalizedMainTextHash: '',
      mainTextSimhash: '0'.repeat(16),
      extractionSource: 'empty',
      extractionVersion: '1.0.0',
      contentQualityStatus: 'empty',
      isTruncated: false,
      isExcerptTruncated: false,
      isSourceContentTruncated: false,
      processingLimitReached: false,
    };
  }

  let isSourceContentTruncated = false;
  let processingLimitReached = false;
  let workingHtml = html;

  if (workingHtml.length > MAX_RAW_HTML_LENGTH) {
    workingHtml = workingHtml.slice(0, MAX_RAW_HTML_LENGTH);
    isSourceContentTruncated = true;
    processingLimitReached = true;
  }

  let rawText = '';
  let sourceName = 'body_fallback';

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(workingHtml, 'text/html');

      // 1. Remove all boilerplate elements
      for (const tag of BOILERPLATE_TAGS) {
        doc.querySelectorAll(tag).forEach((el) => el.remove());
      }
      doc
        .querySelectorAll(
          '[role="navigation" i], [role="banner" i], [role="contentinfo" i], [role="menu" i]'
        )
        .forEach((el) => el.remove());

      // 2. Priority extraction: Look for primary content containers
      let selectedContainer: Element | null = null;
      for (const selector of PRIMARY_CONTAINERS) {
        try {
          const found = doc.querySelector(selector);
          if (found) {
            const text = (found.textContent || '').trim();
            if (text.length > 40) {
              selectedContainer = found;
              sourceName = selector.replace(/[[\]"'.#]/g, '').replace('role=', '');
              break;
            }
          }
        } catch {}
      }

      if (selectedContainer) {
        rawText = (selectedContainer.textContent || '').trim();
      } else {
        const body = doc.body;
        if (body) {
          rawText = (body.textContent || '').trim();
        } else {
          rawText = (doc.documentElement?.textContent || '').trim();
        }
      }
    } catch {
      rawText = stripHtmlWithRegex(workingHtml);
      sourceName = 'regex_fallback';
    }
  } else {
    rawText = stripHtmlWithRegex(workingHtml);
    sourceName = 'regex_fallback';
  }

  const normalizedText = normalizeText(rawText);
  const tokens = tokenizeWords(normalizedText);
  const wordCount = tokens.length;
  const characterCount = normalizedText.length;

  let quality: 'empty' | 'thin' | 'usable' | 'sufficient' | 'non_html';
  if (wordCount === 0 || characterCount === 0) {
    quality = 'empty';
  } else if (wordCount < 15) {
    quality = 'thin';
  } else {
    quality = 'usable';
  }

  let contentHash = '';
  let simhashVal = '0'.repeat(16);

  if (quality !== 'empty') {
    contentHash = computeContentSha256(normalizedText);
    simhashVal = computeSimHash64(tokens);
  }

  const isExcerptTruncated = normalizedText.length > 300;
  const excerpt = isExcerptTruncated ? normalizedText.slice(0, 300) : normalizedText;

  return {
    mainTextExcerpt: excerpt,
    wordCount,
    characterCount,
    normalizedMainTextHash: contentHash,
    mainTextSimhash: simhashVal,
    extractionSource: sourceName,
    extractionVersion: '2.0.0',
    contentQualityStatus: quality,
    isTruncated: isExcerptTruncated || isSourceContentTruncated,
    isExcerptTruncated,
    isSourceContentTruncated,
    processingLimitReached,
  };
}

function stripHtmlWithRegex(html: string): string {
  // Strip scripts, styles, boilerplates
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return clean;
}
