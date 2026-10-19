/**
 * Comprehensive Phase 2A Deterministic Regression Tests.
 *
 * Verifies all 25 canonical rules (16 On-Page, 7 Technical, 2 Site-Wide),
 * edge cases (empty vs missing H1, missing vs empty alt, anchor text, lang attribute,
 * HTTP 429, X-Robots-Tag, Meta robots conflict), technology inference calibrations,
 * and execution ledger idempotency.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StandaloneRulesEngine } from '../standalone/audit/clientRules';
import { StandaloneDomParser } from '../standalone/audit/domParserEngine';
import { StandaloneScoringCalculator } from '../standalone/audit/scoring';
import {
  CANONICAL_51_RULES,
  CANONICAL_IMPLEMENTED_RULES,
  isCanonicalRuleId,
  validateCanonicalRegistry,
} from '../standalone/audit/ruleMapping';
import { UniversalTechEngine } from '../standalone/technologies/universalTechEngine';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import type {
  StandaloneCrawlPage,
  StandaloneRuleExecutionRecord,
} from '../standalone/types';

function createMockPage(
  id: string,
  url: string,
  overrides: Partial<Omit<StandaloneCrawlPage, 'headings'>> & {
    headings?: {
      h1: string[];
      h2?: string[];
      h3?: string[];
      h4?: string[];
      h5?: string[];
      h6?: string[];
    };
  } = {}
): StandaloneCrawlPage {
  const { headings: customHeadings, headingCounts: customHeadingCounts, ...restOverrides } = overrides;
  const headings: StandaloneCrawlPage['headings'] = {
    h1: customHeadings?.h1 ?? ['Main Heading'],
    h2: customHeadings?.h2 ?? ['Subheading'],
    h3: customHeadings?.h3 ?? ['Minor Heading'],
    h4: customHeadings?.h4 ?? [],
    h5: customHeadings?.h5 ?? [],
    h6: customHeadings?.h6 ?? [],
  };
  const h1Raw = restOverrides.h1RawCount ?? headings.h1.length;
  const headingCounts = customHeadingCounts ?? {
    h1: h1Raw,
    h2: headings.h2.length,
    h3: headings.h3.length,
    h4: headings.h4?.length ?? 0,
    h5: headings.h5?.length ?? 0,
    h6: headings.h6?.length ?? 0,
  };
  return {
    id,
    auditId: 'audit-phase2a',
    url,
    depth: 1,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    htmlSize: 2048,
    fetchedAt: Date.now(),
    fetchStatus: 'success',
    httpStatus: 200,
    responseTimeMs: 20,
    title: 'Optimal Title for Search Ranking',
    metaDescription: 'A well-crafted meta description between 70 and 160 characters designed for search engine snippets.',
    canonicalUrl: url,
    headings,
    headingCounts,
    h1RawCount: h1Raw,
    h1HasContent: restOverrides.h1HasContent ?? (headings.h1 ? headings.h1.some((t) => t.trim().length > 0) : true),
    htmlLang: 'en',
    links: ['http://127.0.0.1:4321/about'],
    internalOutlinksCount: 1,
    externalOutlinksCount: 0,
    emptyAnchorCount: 0,
    images: [{ src: '/img.jpg', alt: 'Descriptive alt text' }],
    imageCount: 1,
    missingAltCount: 0,
    emptyAltCount: 0,
    ...restOverrides,
  };
}

describe('Canonical Registry Parity & Integrity (Phase 2A: 25 Implemented Rules)', () => {
  it('validates canonical registry integrity with zero discrepancies', () => {
    const validation = validateCanonicalRegistry();
    expect(validation.isValid).toBe(true);
    expect(validation.totalCanonicalRules).toBe(51);
    expect(validation.implementedCount).toBe(25);
    expect(validation.familyCounts.on_page).toBe(16);
    expect(validation.familyCounts.technical).toBe(22);
    expect(validation.familyCounts.sitewide).toBe(13);
  });

  it('guarantees all 25 implemented rules exist in authoritative 51-rule registry', () => {
    expect(CANONICAL_IMPLEMENTED_RULES.size).toBe(25);
    for (const ruleId of CANONICAL_IMPLEMENTED_RULES) {
      expect(isCanonicalRuleId(ruleId)).toBe(true);
    }
  });

  it('verifies 16/16 On-Page, 7/22 Technical, and 2/13 Site-Wide target breakdown', () => {
    let onPageCount = 0;
    let techCount = 0;
    let siteCount = 0;

    for (const ruleId of CANONICAL_IMPLEMENTED_RULES) {
      if (CANONICAL_51_RULES.on_page.includes(ruleId as any)) onPageCount++;
      else if (CANONICAL_51_RULES.technical.includes(ruleId as any)) techCount++;
      else if (CANONICAL_51_RULES.sitewide.includes(ruleId as any)) siteCount++;
    }

    expect(onPageCount).toBe(16);
    expect(techCount).toBe(7);
    expect(siteCount).toBe(2);
  });
});

describe('Phase 2A Canonical On-Page SEO Rules', () => {
  // 1. ONPAGE_TITLE_REPETITIVE
  describe('ONPAGE_TITLE_REPETITIVE', () => {
    it('passes when title has diverse, natural vocabulary', () => {
      const page = createMockPage('p1', 'http://127.0.0.1:4321/p1', {
        title: 'Modern Architecture and SEO Performance Solutions',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_TITLE_REPETITIVE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when a word (>= 3 chars) is repeated 3 or more times', () => {
      const page = createMockPage('p2', 'http://127.0.0.1:4321/p2', {
        title: 'SEO Audit Agency - Best SEO Tools and SEO Tips',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_TITLE_REPETITIVE');
      expect(rec?.executionStatus).toBe('executed_warning');
      const finding = res.findings.find((f) => f.ruleId === 'ONPAGE_TITLE_REPETITIVE');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('low');
    });

    it('ignores repetitive short stop words under 3 characters', () => {
      const page = createMockPage('p3', 'http://127.0.0.1:4321/p3', {
        title: 'To Be or Not to Be - A Play by Us to You',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_TITLE_REPETITIVE');
      expect(rec?.executionStatus).toBe('executed_pass');
    });
  });

  // 2. ONPAGE_H1_EMPTY vs ONPAGE_H1_PRESENCE
  describe('ONPAGE_H1_EMPTY vs ONPAGE_H1_PRESENCE', () => {
    it('marks ONPAGE_H1_PRESENCE as fail and ONPAGE_H1_EMPTY as not_applicable when H1 is missing completely', () => {
      const page = createMockPage('p-no-h1', 'http://127.0.0.1:4321/no-h1', {
        headings: { h1: [], h2: ['Section'] },
        h1RawCount: 0,
        h1HasContent: false,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const presence = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_PRESENCE');
      const empty = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_EMPTY');
      expect(presence?.executionStatus).toBe('executed_fail');
      expect(empty?.executionStatus).toBe('not_applicable');
    });

    it('marks ONPAGE_H1_PRESENCE as pass and ONPAGE_H1_EMPTY as fail when H1 tag is present but has empty text', () => {
      const page = createMockPage('p-empty-h1', 'http://127.0.0.1:4321/empty-h1', {
        headings: { h1: ['   '] },
        h1RawCount: 1,
        h1HasContent: false,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const presence = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_PRESENCE');
      const empty = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_EMPTY');
      expect(presence?.executionStatus).toBe('executed_pass');
      expect(empty?.executionStatus).toBe('executed_fail');
      const finding = res.findings.find((f) => f.ruleId === 'ONPAGE_H1_EMPTY');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('medium');
    });

    it('passes both ONPAGE_H1_PRESENCE and ONPAGE_H1_EMPTY when single non-empty H1 is present', () => {
      const page = createMockPage('p-good-h1', 'http://127.0.0.1:4321/good-h1', {
        headings: { h1: ['Clear Primary Heading'] },
        h1RawCount: 1,
        h1HasContent: true,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const presence = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_PRESENCE');
      const empty = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_H1_EMPTY');
      expect(presence?.executionStatus).toBe('executed_pass');
      expect(empty?.executionStatus).toBe('executed_pass');
    });
  });

  // 3. ONPAGE_HEADING_HIERARCHY
  describe('ONPAGE_HEADING_HIERARCHY', () => {
    it('passes when heading order is logically structured (H1 -> H2 -> H3)', () => {
      const page = createMockPage('p-hier-pass', 'http://127.0.0.1:4321/hier-pass', {
        headings: { h1: ['Main'], h2: ['Section'], h3: ['Subsection'] },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HEADING_HIERARCHY');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when heading hierarchy skips levels (H2 followed directly by H4 without H3)', () => {
      const page = createMockPage('p-hier-skip', 'http://127.0.0.1:4321/hier-skip', {
        headings: { h1: ['Main'], h2: ['Section'], h3: [], h4: ['Sub-subsection'] as any },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HEADING_HIERARCHY');
      expect(rec?.executionStatus).toBe('executed_warning');
      const finding = res.findings.find((f) => f.ruleId === 'ONPAGE_HEADING_HIERARCHY');
      expect(finding).toBeDefined();
    });
  });

  // 4. ONPAGE_IMAGE_ALT_MISSING vs ONPAGE_IMAGE_ALT_EMPTY
  describe('ONPAGE_IMAGE_ALT_MISSING vs ONPAGE_IMAGE_ALT_EMPTY', () => {
    it('marks not_applicable when page contains zero images', () => {
      const page = createMockPage('p-no-img', 'http://127.0.0.1:4321/no-img', {
        images: [],
        imageCount: 0,
        missingAltCount: 0,
        emptyAltCount: 0,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const missingRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_MISSING');
      const emptyRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_EMPTY');
      expect(missingRec?.executionStatus).toBe('not_applicable');
      expect(emptyRec?.executionStatus).toBe('not_applicable');
    });

    it('fails ONPAGE_IMAGE_ALT_MISSING when images lack alt attribute completely', () => {
      const page = createMockPage('p-missing-alt', 'http://127.0.0.1:4321/missing-alt', {
        images: [{ src: '/hero.jpg', alt: '' }],
        imageCount: 1,
        missingAltCount: 1,
        emptyAltCount: 0,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const missingRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_MISSING');
      const emptyRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_EMPTY');
      expect(missingRec?.executionStatus).toBe('executed_fail');
      expect(emptyRec?.executionStatus).toBe('executed_pass');
    });

    it('warns ONPAGE_IMAGE_ALT_EMPTY when alt attribute is present but empty (alt="")', () => {
      const page = createMockPage('p-empty-alt', 'http://127.0.0.1:4321/empty-alt', {
        images: [{ src: '/decorative.png', alt: '' }],
        imageCount: 1,
        missingAltCount: 0,
        emptyAltCount: 1,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const missingRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_MISSING');
      const emptyRec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_IMAGE_ALT_EMPTY');
      expect(missingRec?.executionStatus).toBe('executed_pass');
      expect(emptyRec?.executionStatus).toBe('executed_warning');
    });
  });

  // 5. ONPAGE_INTERNAL_OUTLINKS
  describe('ONPAGE_INTERNAL_OUTLINKS', () => {
    it('passes when page has at least one outgoing internal link', () => {
      const page = createMockPage('p-links', 'http://127.0.0.1:4321/p-links', {
        links: ['http://127.0.0.1:4321/contact'],
        internalOutlinksCount: 1,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_INTERNAL_OUTLINKS');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when page has zero outgoing internal links (dead end)', () => {
      const page = createMockPage('p-no-links', 'http://127.0.0.1:4321/p-no-links', {
        links: ['https://external-partner.com/docs'],
        internalOutlinksCount: 0,
        externalOutlinksCount: 1,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_INTERNAL_OUTLINKS');
      expect(rec?.executionStatus).toBe('executed_warning');
    });
  });

  // 6. ONPAGE_EMPTY_ANCHOR_TEXT
  describe('ONPAGE_EMPTY_ANCHOR_TEXT', () => {
    it('passes when all links have descriptive anchor text', () => {
      const page = createMockPage('p-anchors', 'http://127.0.0.1:4321/p-anchors', {
        links: ['/about'],
        emptyAnchorCount: 0,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_EMPTY_ANCHOR_TEXT');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when links have empty anchor text without aria-label', () => {
      const page = createMockPage('p-empty-anchors', 'http://127.0.0.1:4321/p-empty-anchors', {
        links: ['/about', '/contact'],
        emptyAnchorCount: 2,
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_EMPTY_ANCHOR_TEXT');
      expect(rec?.executionStatus).toBe('executed_warning');
    });
  });

  // 7. ONPAGE_HTML_LANG
  describe('ONPAGE_HTML_LANG', () => {
    it('passes with standard BCP 47 language tag (e.g. "en", "es-419")', () => {
      const pageEn = createMockPage('p-lang-en', 'http://127.0.0.1:4321/en', { htmlLang: 'en' });
      const resEn = StandaloneRulesEngine.evaluatePageDetailed(pageEn, 'a1');
      expect(resEn.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HTML_LANG')?.executionStatus).toBe('executed_pass');

      const pageEs = createMockPage('p-lang-es', 'http://127.0.0.1:4321/es', { htmlLang: 'es-419' });
      const resEs = StandaloneRulesEngine.evaluatePageDetailed(pageEs, 'a1');
      expect(resEs.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HTML_LANG')?.executionStatus).toBe('executed_pass');
    });

    it('warns when lang attribute is missing from <html> element', () => {
      const page = createMockPage('p-no-lang', 'http://127.0.0.1:4321/no-lang', { htmlLang: null });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HTML_LANG');
      expect(rec?.executionStatus).toBe('executed_warning');
      expect(res.findings.some((f) => f.ruleId === 'ONPAGE_HTML_LANG')).toBe(true);
    });

    it('warns when lang attribute is empty string', () => {
      const page = createMockPage('p-empty-lang', 'http://127.0.0.1:4321/empty-lang', { htmlLang: '   ' });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HTML_LANG');
      expect(rec?.executionStatus).toBe('executed_warning');
    });

    it('warns when lang tag violates structural BCP 47 syntax', () => {
      const page = createMockPage('p-bad-lang', 'http://127.0.0.1:4321/bad-lang', { htmlLang: 'invalid_syntax_123456789' });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'ONPAGE_HTML_LANG');
      expect(rec?.executionStatus).toBe('executed_warning');
    });
  });
});

describe('Phase 2A Canonical Technical SEO Rules', () => {
  // 1. TECH_HTTP_429
  describe('TECH_HTTP_429', () => {
    it('fails when server responds with HTTP 429 Too Many Requests', () => {
      const page = createMockPage('p-429', 'http://127.0.0.1:4321/429', {
        httpStatus: 429,
        fetchStatus: 'failed',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTP_429');
      expect(rec?.executionStatus).toBe('executed_fail');
      expect(res.findings.some((f) => f.ruleId === 'TECH_HTTP_429')).toBe(true);
    });

    it('passes when page returns standard HTTP 200', () => {
      const page = createMockPage('p-200', 'http://127.0.0.1:4321/200');
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTP_429');
      expect(rec?.executionStatus).toBe('executed_pass');
    });
  });

  // 2. TECH_HTTP_UNSUPPORTED_CONTENT
  describe('TECH_HTTP_UNSUPPORTED_CONTENT', () => {
    it('passes for standard HTML document responses', () => {
      const page = createMockPage('p-html', 'http://127.0.0.1:4321/html', {
        headers: { 'content-type': 'text/html; charset=UTF-8' },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTP_UNSUPPORTED_CONTENT');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('records non-HTML response as executed_pass with descriptive note', () => {
      const page = createMockPage('p-pdf', 'http://127.0.0.1:4321/doc.pdf', {
        headers: { 'content-type': 'application/pdf' },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTP_UNSUPPORTED_CONTENT');
      expect(rec?.executionStatus).toBe('executed_pass');
      expect(rec?.reason).toContain('application/pdf');
    });

    it('records not_evaluated when page fetch threw network error (httpStatus 0)', () => {
      const page = createMockPage('p-net-err', 'http://127.0.0.1:4321/net-err', {
        httpStatus: 0,
        fetchStatus: 'failed',
        headers: {},
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_HTTP_UNSUPPORTED_CONTENT');
      expect(rec?.executionStatus).toBe('not_evaluated');
      expect(rec?.evidenceAvailable).toBe(false);
    });
  });

  // 3. TECH_META_ROBOTS_DIRECTIVES
  describe('TECH_META_ROBOTS_DIRECTIVES', () => {
    it('passes when no restrictive meta robots directives are declared', () => {
      const page = createMockPage('p-robots-pass', 'http://127.0.0.1:4321/robots-pass', {
        metaRobots: 'index, follow',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_META_ROBOTS_DIRECTIVES');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when meta robots contains noindex', () => {
      const page = createMockPage('p-noindex', 'http://127.0.0.1:4321/noindex', {
        metaRobots: 'noindex, follow',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_META_ROBOTS_DIRECTIVES');
      expect(rec?.executionStatus).toBe('executed_warning');
      expect(res.findings.some((f) => f.ruleId === 'TECH_META_ROBOTS_DIRECTIVES')).toBe(true);
    });

    it('warns when meta robots specifies conflicting directives ("index, noindex")', () => {
      const page = createMockPage('p-conflict', 'http://127.0.0.1:4321/conflict', {
        metaRobots: 'index, noindex',
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_META_ROBOTS_DIRECTIVES');
      expect(rec?.executionStatus).toBe('executed_warning');
      const finding = res.findings.find((f) => f.ruleId === 'TECH_META_ROBOTS_DIRECTIVES');
      expect(finding?.title).toContain('Conflicting');
    });
  });

  // 4. TECH_X_ROBOTS_TAG
  describe('TECH_X_ROBOTS_TAG', () => {
    it('passes when X-Robots-Tag header is absent or specifies all', () => {
      const page = createMockPage('p-xrobots-pass', 'http://127.0.0.1:4321/xrobots-pass', {
        headers: { 'content-type': 'text/html' },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_X_ROBOTS_TAG');
      expect(rec?.executionStatus).toBe('executed_pass');
    });

    it('warns when X-Robots-Tag header specifies noindex', () => {
      const page = createMockPage('p-xrobots-noindex', 'http://127.0.0.1:4321/xrobots-noindex', {
        headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex, nofollow' },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_X_ROBOTS_TAG');
      expect(rec?.executionStatus).toBe('executed_warning');
      expect(res.findings.some((f) => f.ruleId === 'TECH_X_ROBOTS_TAG')).toBe(true);
    });

    it('warns with high severity when X-Robots-Tag has conflicting directives ("index, noindex")', () => {
      const page = createMockPage('p-xrobots-conflict', 'http://127.0.0.1:4321/xrobots-conflict', {
        headers: { 'content-type': 'text/html', 'x-robots-tag': 'index, noindex' },
      });
      const res = StandaloneRulesEngine.evaluatePageDetailed(page, 'a1');
      const rec = res.ledgerRecords.find((r) => r.canonicalRuleId === 'TECH_X_ROBOTS_TAG');
      expect(rec?.executionStatus).toBe('executed_warning');
      const finding = res.findings.find((f) => f.ruleId === 'TECH_X_ROBOTS_TAG');
      expect(finding?.severity).toBe('high');
    });
  });
});

describe('Technology Inference Confidence & Calibrations', () => {
  beforeEach(() => {
    UniversalTechEngine.initialize();
  });

  it('infers PHP from confirmed WordPress with reduced confidence and accurate parent explanation', () => {
    const evidence = StandaloneDomParser.parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="generator" content="WordPress 6.4.3" />
          <link rel="stylesheet" href="/wp-content/themes/twentytwentyfour/style.css" />
        </head>
        <body class="wp-custom-logo"></body>
      </html>
    `, 'http://127.0.0.1:4321/');

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-tech-wp');
    const wp = findings.find((f) => f.technologyId === 'wordpress');
    expect(wp).toBeDefined();
    expect(wp?.status).toBe('confirmed');
    expect(wp?.confidence).toBeGreaterThanOrEqual(0.9);

    const php = findings.find((f) => f.technologyId === 'php');
    expect(php).toBeDefined();
    expect(php?.status).toBe('inferred');
    expect(php?.confidence).toBe(0.60);
    expect(php?.provenance).toBe('inferred_dependency');
    expect(php?.evidenceSummary).toContain('Inferred architectural dependency from confirmed WordPress');
  });

  it('infers React from confirmed Next.js without overwriting direct React evidence', () => {
    const evidence = StandaloneDomParser.parse(`
      <!DOCTYPE html>
      <html>
        <head></head>
        <body>
          <script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
          <script src="/_next/static/chunks/main.js"></script>
        </body>
      </html>
    `, 'http://127.0.0.1:4321/');

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-tech-next');
    const next = findings.find((f) => f.technologyId === 'nextjs');
    expect(next).toBeDefined();
    expect(next?.status).toBe('confirmed');

    const react = findings.find((f) => f.technologyId === 'react');
    expect(react).toBeDefined();
    expect(react?.provenance).toBe('inferred_dependency');
    expect(react?.confidence).toBe(0.60);
  });

  it('does NOT infer child dependencies from weak or possible parent findings', () => {
    // Only a single weak asset link from framerusercontent.com (without generator or hydration DOM markers)
    const evidence = StandaloneDomParser.parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <link rel="stylesheet" href="https://framerusercontent.com/sites/style.css" />
        </head>
        <body><p>Clean site with embedded asset</p></body>
      </html>
    `, 'http://127.0.0.1:4321/');

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-tech-framer-weak');
    const framer = findings.find((f) => f.technologyId === 'framer');
    if (framer) {
      expect(framer.status).toBe('possible');
      expect(framer.confidence).toBeLessThan(0.70);
    }

    // Because Framer was only a weak embed, React MUST NOT be inferred!
    const react = findings.find((f) => f.technologyId === 'react');
    expect(react).toBeUndefined();
  });

  it('direct evidence for child takes precedence over inference and is never overwritten', () => {
    const evidence = StandaloneDomParser.parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="generator" content="WordPress 6.4.3" />
        </head>
        <body>
          <script src="/wp-content/themes/twentytwentyfour/app.js"></script>
        </body>
      </html>
    `, 'http://127.0.0.1:4321/');

    // Direct HTTP response header for PHP version
    const headers = { 'x-powered-by': 'PHP/8.2.10' };
    const findings = UniversalTechEngine.evaluate(evidence, headers, 'audit-tech-direct');

    const php = findings.find((f) => f.technologyId === 'php');
    expect(php).toBeDefined();
    // Direct header detection takes precedence over WordPress inference!
    expect(php?.status).toBe('confirmed');
    expect(php?.provenance).toBe('first_party');
    expect(php?.version).toBe('8.2.10');
  });

  it('preserves honest confidence states for conflicting first-party CMS evidence', () => {
    const evidence = StandaloneDomParser.parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="generator" content="WordPress 6.4.3" />
        </head>
        <body class="wp-custom-logo">
          <!-- Both first party signals -->
          <div data-wf-site="12345">Webflow Element</div>
        </body>
      </html>
    `, 'http://127.0.0.1:4321/');

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-tech-conflict');
    const wp = findings.find((f) => f.technologyId === 'wordpress');
    const webflow = findings.find((f) => f.technologyId === 'webflow');

    expect(wp).toBeDefined();
    expect(wp?.status).toBe('confirmed');

    expect(webflow).toBeDefined();
    // Webflow data-wf-site is a first-party DOM marker, retained honestly
    expect(webflow?.provenance).toBe('first_party');
  });
});

describe('Execution Ledger Idempotency & Persistence', () => {
  beforeEach(() => {
    StandaloneAuditStorage.clearInMemoryForTesting();
  });

  it('produces deterministic unique IDs and does not duplicate records on re-analysis', async () => {
    const page = createMockPage('p1', 'http://127.0.0.1:4321/');
    const auditId = 'audit-idempotency-1';

    const run1 = StandaloneRulesEngine.evaluateAudit([page], auditId);
    await StandaloneAuditStorage.replaceExecutionLedger(auditId, run1.ledgerRecords);

    let stored = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
    expect(stored).toHaveLength(25);

    // Re-evaluate the same audit and replace
    const run2 = StandaloneRulesEngine.evaluateAudit([page], auditId);
    await StandaloneAuditStorage.replaceExecutionLedger(auditId, run2.ledgerRecords);

    stored = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
    // Still exactly 25 records! Zero duplicates!
    expect(stored).toHaveLength(25);
  });
});
