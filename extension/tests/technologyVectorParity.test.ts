/**
 * Technology Vector Parity, Confidence Calibration & Catalog Validation Tests.
 *
 * Verifies:
 * 1. Multi-signal confidence calibration & false-positive guards
 * 2. Weak Framer asset embed on WordPress (isolated as third_party_embed <= 0.40)
 * 3. Strong Framer detection (confirmed >= 0.95)
 * 4. Inferred dependencies (WordPress -> PHP, Next.js -> React)
 * 5. HTML attributes, observable cookie names, link rels, and asset URLs
 * 6. Duplicate asset URLs do not inflate evidence count
 * 7. Structured DOM marker matching prevents loose substring false positives
 * 8. All 173 technology catalog entries compile and execute safely
 */

import { describe, it, expect } from 'vitest';
import { UniversalTechEngine } from '../standalone/technologies/universalTechEngine';
import type { ParsedHtmlEvidence } from '../standalone/audit/domParserEngine';
import catalogJson from '../standalone/technologies/technology_catalog.json';

describe('Technology Vector Parity & False-Positive Defenses', () => {
  it('prevents a single embedded Framer asset on a WordPress site from claiming the site is Framer-built', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Enterprise WordPress Publication',
      metaGenerators: ['WordPress 6.4.3'],
      headings: { h1: ['Welcome to Tech News'], h2: [], h3: [] },
      links: ['/wp-content/themes/custom/about'],
      images: [],
      scriptSources: [
        'https://example.com/wp-includes/js/wp-embed.min.js',
        'https://example.com/wp-content/plugins/seo/script.js',
      ],
      stylesheetHrefs: ['https://example.com/wp-content/themes/twentytwentyfour/style.css'],
      domMarkers: ['class:wp-embed-responsive'],
      bodyClasses: ['wp-custom-logo', 'home'],
      inlineMarkers: ['wp.apiFetch', 'wp-json'],
      // Foreign embedded image from Framer CDN
      assetUrls: ['https://framerusercontent.com/images/partner-showcase-badge.png'],
    };

    const headers = {
      server: 'Apache/2.4.58 (Ubuntu)',
      'x-powered-by': 'PHP/8.2.14',
    };

    const findings = UniversalTechEngine.evaluate(evidence, headers, 'audit-wp-framer');

    // 1. WordPress MUST be confirmed as the primary first-party CMS
    const wp = findings.find((f) => f.technologyId === 'wordpress');
    expect(wp).toBeDefined();
    expect(wp?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(wp?.status).toBe('confirmed');
    expect(wp?.provenance).toBe('first_party');

    // 2. Framer MUST be downgraded and isolated as third-party embed
    const framer = findings.find((f) => f.technologyId === 'framer');
    if (framer) {
      expect(framer.provenance).toBe('third_party_embed');
      expect(framer.confidence).toBeLessThanOrEqual(0.40);
      expect(framer.status).toBe('possible');
    }
  });

  it('detects strong Framer site with high confidence (>= 0.95) when multiple direct signals exist', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Design Agency Built on Framer',
      metaGenerators: ['Framer 2024.1'],
      headings: { h1: ['Design Freedom'], h2: [], h3: [] },
      links: [],
      images: [],
      scriptSources: [
        'https://events.framer.com/script.js',
        'https://framerusercontent.com/sites/abc/chunk.js',
      ],
      stylesheetHrefs: ['https://framercdn.com/bundle.css'],
      domMarkers: ['data-framer-hydrate-v2', 'id:__framer-badge-container'],
      bodyClasses: [],
      inlineMarkers: ['__framer__', 'framer.site'],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-framer-strong');
    const framer = findings.find((f) => f.technologyId === 'framer');

    expect(framer).toBeDefined();
    expect(framer?.confidence).toBeGreaterThanOrEqual(0.95);
    expect(framer?.status).toBe('confirmed');
    expect(framer?.provenance).toBe('first_party');
    expect(framer?.versionOrNull).toBe('2024.1');
  });

  it('infers PHP dependency from confirmed WordPress installation without claiming direct observation', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Simple WordPress Site',
      metaGenerators: ['WordPress 6.4.3'],
      headings: { h1: ['Blog'], h2: [], h3: [] },
      links: [],
      images: [],
      scriptSources: ['/wp-includes/js/jquery.js'],
      stylesheetHrefs: [],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: ['wp.apiFetch'],
    };

    // No PHP header provided
    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-wp-inference');

    const php = findings.find((f) => f.technologyId === 'php');
    expect(php).toBeDefined();
    expect(php?.provenance).toBe('inferred_dependency');
    expect(php?.status).toBe('inferred');
    expect(php?.confidence).toBeLessThanOrEqual(0.65);
    expect(php?.evidenceSummary).toContain('Inferred architectural dependency from confirmed WordPress');
  });

  it('deduplicates asset URLs so repeated same-URL signals do not inflate confidence', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Asset Test',
      headings: { h1: ['Heading'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: [],
      stylesheetHrefs: [],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: [],
      // Duplicate asset URLs
      assetUrls: [
        'https://framerusercontent.com/image.png',
        'https://framerusercontent.com/image.png',
        'https://framerusercontent.com/image.png',
      ],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-dedup');
    const framer = findings.find((f) => f.technologyId === 'framer');

    // Distinct asset count is only 1 (< min_assets_for_detection: 2)
    // Thus it should not match or if matched must remain weak embed <= 0.40
    if (framer) {
      expect(framer.confidence).toBeLessThanOrEqual(0.40);
    }
  });

  it('matches structured HTML attributes safely without false positives', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Webflow Agency Site',
      headings: { h1: ['Agency'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: ['https://assets.website-files.com/64a1/js/webflow.js'],
      stylesheetHrefs: ['https://assets.website-files.com/64a1/css/webflow.css'],
      domMarkers: ['data-wf-site'],
      htmlAttributes: {
        'data-wf-site': '602938472910394827',
        'data-wf-page': '602938472910394828',
      },
      bodyClasses: [],
      inlineMarkers: ['Webflow.require'],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-webflow');
    const webflow = findings.find((f) => f.technologyId === 'webflow');

    expect(webflow).toBeDefined();
    expect(webflow?.status).toBe('confirmed');
    expect(webflow?.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('evaluates cookie names safely without reading or exposing cookie values or tokens', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Shopify Store',
      headings: { h1: ['Store'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: ['https://cdn.shopify.com/s/files/1/theme.js'],
      stylesheetHrefs: [],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: ['Shopify.theme'],
      // Only cookie names are passed, values are strictly omitted
      cookieNames: ['_shopify_y', '_shopify_s'],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-cookie');
    const shopify = findings.find((f) => f.technologyId === 'shopify');

    expect(shopify).toBeDefined();
    expect(shopify?.status).toBe('confirmed');
    expect(shopify?.evidenceSummary).toContain('cookie');
    // Ensure no secret or credential was stored
    expect(shopify?.evidenceSummary).not.toContain('secret');
    expect(shopify?.evidenceSummary).not.toContain('password');
    expect(shopify?.evidenceSummary).not.toContain('credential');
  });

  it('rejects loose substring DOM marker matches to prevent cross-framework false positives', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Non-Elementor Page',
      headings: { h1: ['Clean Site'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: ['/app.js'],
      stylesheetHrefs: ['/styles.css'],
      // A class name that merely contains the substring 'elementor' in a different context
      domMarkers: ['class:not-elementor-compatible-theme-container'],
      bodyClasses: ['not-elementor-class'],
      inlineMarkers: [],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-dom-fp');
    const elementor = findings.find((f) => f.technologyId === 'elementor');

    // Should NOT be detected because structured selector matching rejects loose substring matches
    expect(elementor).toBeUndefined();
  });
});

describe('Catalog Integrity & Safe Regex Compilation (173 Technologies)', () => {
  it('confirms catalog metadata reports version 2.0.0 and exactly 173 technologies', () => {
    expect(UniversalTechEngine.getCatalogVersion()).toBe('2.0.0');
    expect(UniversalTechEngine.getEngineVersion()).toBe('2.0.0');
    expect(UniversalTechEngine.getCatalogSize()).toBe(173);
    expect(catalogJson.technologies.length).toBe(173);
  });

  it('compiles and validates all regex patterns across all 173 catalog entries without catastrophic backtracking', () => {
    let totalRegexCount = 0;
    const startTime = Date.now();

    for (const tech of catalogJson.technologies) {
      const sigs = tech.signatures;

      // Meta generators regexes
      for (const pattern of sigs.meta_generators || []) {
        totalRegexCount++;
        const rx = new RegExp(pattern, 'i');
        expect(rx).toBeInstanceOf(RegExp);
        // Safe execution test with bounded input
        expect(rx.test('WordPress 6.4.3 / Test Sample string')).toBeTypeOf('boolean');
      }

      // Script sources regexes
      for (const pattern of sigs.script_sources || []) {
        totalRegexCount++;
        const rx = new RegExp(pattern, 'i');
        expect(rx).toBeInstanceOf(RegExp);
        expect(rx.test('https://cdn.example.org/assets/script.min.js?v=1.2.3')).toBeTypeOf('boolean');
      }

      // Stylesheet hrefs regexes
      for (const pattern of sigs.stylesheet_hrefs || []) {
        totalRegexCount++;
        const rx = new RegExp(pattern, 'i');
        expect(rx).toBeInstanceOf(RegExp);
        expect(rx.test('https://cdn.example.org/themes/style.css?v=2.0')).toBeTypeOf('boolean');
      }

      // Headers regexes
      for (const [hdr, pattern] of Object.entries(sigs.headers || {})) {
        totalRegexCount++;
        const rx = new RegExp(pattern, 'i');
        expect(rx).toBeInstanceOf(RegExp);
        expect(rx.test('Apache/2.4.58 (Ubuntu) Server Header Value')).toBeTypeOf('boolean');
      }

      // Version rules regexes
      for (const vr of tech.version_rules || []) {
        totalRegexCount++;
        const rx = new RegExp(vr.regex, 'i');
        expect(rx).toBeInstanceOf(RegExp);
        const match = 'WordPress 6.4.2'.match(rx);
        expect(Array.isArray(match) || match === null).toBe(true);
      }
    }

    const durationMs = Date.now() - startTime;
    expect(totalRegexCount).toBeGreaterThan(150);
    // Bounded execution: all regex compilations and runs must finish in under 2000ms
    expect(durationMs).toBeLessThan(2000);
  });
});
