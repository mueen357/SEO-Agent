/**
 * Cross-Language Parity Test Suite: TypeScript Standalone vs Canonical Python Reference.
 * Verifies exact 1:1 mathematical and string normalization parity against Python golden vectors.
 * Ground truth generated from backend/app/content/normalizer.py, fingerprint.py, and similarity.py.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  normalizeText,
  caseFoldText,
  tokenizeWords,
  extractWordNgrams,
  computeContentSha256,
  computeSimHash64,
  simhashHammingDistance,
  simhashSimilarity,
  lengthSimilarity,
  unescapeHtml,
  unicodeCodePointCount,
} from '../standalone/audit/contentFingerprint';

interface PythonSingleVector {
  raw: string;
  norm: string;
  folded: string;
  tokens: string[];
  ngrams: string[];
  sha256: string;
  simhash: string;
}

interface PythonPairwiseVector {
  index1: number;
  index2: number;
  hex1: string;
  hex2: string;
  distance: number;
  similarity: number;
  lengthSimilarity: number;
}

describe('Cross-Language Parity (TypeScript vs Python 3.12 Reference)', () => {
  const fixturePath = path.resolve(__dirname, 'fixtures/pythonGoldenVectors.json');
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
    single: PythonSingleVector[];
    pairwise: PythonPairwiseVector[];
  };

  describe('1. Golden Vector Single String Normalization & Fingerprinting', () => {
    data.single.forEach((vector, idx) => {
      it(`matches Python golden vector #${idx + 1} (${vector.raw.slice(0, 35)}...)`, () => {
        // A. Unicode NFKC & HTML Entity Normalization Parity
        const tsNorm = normalizeText(vector.raw);
        expect(tsNorm).toBe(vector.norm);

        // B. Case Folding Parity
        const tsFolded = caseFoldText(vector.raw);
        expect(tsFolded).toBe(vector.folded);

        // C. Tokenization Parity (word boundaries, length >= 2, Arabic/Urdu/Latin scripts)
        const tsTokens = tokenizeWords(vector.raw);
        expect(tsTokens).toEqual(vector.tokens);

        // D. Word n-grams Parity (n=2)
        const tsNgrams = extractWordNgrams(tsTokens, 2);
        expect(tsNgrams).toEqual(vector.ngrams);

        // E. SHA-256 Digest Parity
        const tsSha = computeContentSha256(tsNorm);
        expect(tsSha).toBe(vector.sha256);

        // F. 64-bit SimHash Hex Signature Parity (MD5 prefix bit accumulator)
        const tsSim = computeSimHash64(tsTokens);
        expect(tsSim).toBe(vector.simhash);
      });
    });
  });

  describe('2. Golden Vector Pairwise Similarity & Hamming Distance', () => {
    data.pairwise.forEach((pair, idx) => {
      it(`matches pairwise comparison #${idx + 1} between item ${pair.index1} and ${pair.index2}`, () => {
        // A. Hamming Distance
        const dist = simhashHammingDistance(pair.hex1, pair.hex2);
        expect(dist).toBe(pair.distance);

        // B. SimHash Normalized Similarity
        const sim = simhashSimilarity(pair.hex1, pair.hex2);
        expect(Number(sim.toFixed(6))).toBe(Number(pair.similarity.toFixed(6)));

        // C. Length Similarity
        const norm1 = data.single[pair.index1]!.norm;
        const norm2 = data.single[pair.index2]!.norm;
        const lSim = lengthSimilarity(
          unicodeCodePointCount(norm1),
          unicodeCodePointCount(norm2)
        );
        expect(Number(lSim.toFixed(6))).toBe(Number(pair.lengthSimilarity.toFixed(6)));
      });
    });
  });

  describe('3. HTML Entity Decoding Edge Cases & Astral Plane Characters', () => {
    it('decodes decimal numeric entities including astral plane emojis', () => {
      // Decimal U+1F600 (Grinning Face)
      expect(unescapeHtml('&#128512;')).toBe('😀');
      // Hexadecimal U+1F680 (Rocket)
      expect(unescapeHtml('&#x1F680;')).toBe('🚀');
      // Hexadecimal lowercase U+1F4BB (Laptop)
      expect(unescapeHtml('&#x1f4bb;')).toBe('💻');
    });

    it('safely handles surrogates and out-of-range entity codes with unicode replacement', () => {
      // Surrogate code point U+D800
      expect(unescapeHtml('&#55296;')).toBe('\ufffd');
      // Surrogate code point U+DFFF
      expect(unescapeHtml('&#57343;')).toBe('\ufffd');
      // Code point > 0x10FFFF
      expect(unescapeHtml('&#x9999999;')).toBe('\ufffd');
      // Zero code point
      expect(unescapeHtml('&#0;')).toBe('\ufffd');
    });

    it('decodes extensive HTML5 named entities from official catalog', () => {
      expect(unescapeHtml('&copy;')).toBe('©');
      expect(unescapeHtml('&euro;')).toBe('€');
      expect(unescapeHtml('&amp;')).toBe('&');
      expect(unescapeHtml('&lt;')).toBe('<');
      expect(unescapeHtml('&gt;')).toBe('>');
      expect(unescapeHtml('&quot;')).toBe('"');
      expect(unescapeHtml('&nbsp;')).toBe('\u00a0');
      expect(unescapeHtml('&zwnj;')).toBe('\u200c');
      expect(unescapeHtml('&lambda;')).toBe('λ');
      expect(unescapeHtml('&aleph;')).toBe('ℵ');
      expect(unescapeHtml('&infin;')).toBe('∞');
      expect(unescapeHtml('&check;')).toBe('✓');
    });

    it('preserves unrecognized or malformed entity strings without throwing', () => {
      expect(unescapeHtml('&foobarunknown;')).toBe('&foobarunknown;');
      expect(unescapeHtml('&notanentity;')).toBe('¬anentity;'); // Exact parity with Python html.unescape for HTML5 prefix &not
      expect(unescapeHtml('&amp and text')).toBe('& and text');
      expect(unescapeHtml('just an & symbol')).toBe('just an & symbol');
    });
  });
});
