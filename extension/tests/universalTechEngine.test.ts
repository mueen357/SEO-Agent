import { describe, it, expect } from 'vitest';
import { UniversalTechEngine } from '../standalone/technologies/universalTechEngine';
import type { ParsedHtmlEvidence } from '../standalone/audit/domParserEngine';

describe('UniversalTechEngine (173-Technology Shared In-Browser Matching)', () => {
  it('loads all 173 canonical technology definitions into memory', () => {
    UniversalTechEngine.initialize();
    const count = UniversalTechEngine.getCatalogSize();
    expect(count).toBe(173);
  });

  it('detects WordPress 6.4.3 via meta generator and infers PHP dependency', () => {
    const evidence: ParsedHtmlEvidence = {
      title: 'Blog Page',
      headings: { h1: ['Blog'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: ['WordPress 6.4.3'],
      scriptSources: ['/wp-includes/js/jquery/jquery.min.js'],
      stylesheetHrefs: ['/wp-content/themes/twentytwentyfour/style.css'],
      domMarkers: [],
      bodyClasses: ['logged-out', 'wp-custom-logo'],
      inlineMarkers: [],
    };

    const headers = {};
    const findings = UniversalTechEngine.evaluate(evidence, headers, 'audit-wp');

    const wpFinding = findings.find((f) => f.technologyId === 'wordpress');
    expect(wpFinding).toBeDefined();
    expect(wpFinding?.name).toBe('WordPress');
    expect(wpFinding?.status).toBe('confirmed');
    expect(wpFinding?.version).toBe('6.4.3');
    expect(wpFinding?.provenance).toBe('first_party');

    // WordPress implies PHP: verify PHP was inferred
    const phpFinding = findings.find((f) => f.technologyId === 'php');
    expect(phpFinding).toBeDefined();
    expect(phpFinding?.name).toBe('PHP');
    expect(phpFinding?.status).toBe('inferred');
    expect(phpFinding?.provenance).toBe('inferred_dependency');
  });

  it('detects Apache 2.4.58 server from HTTP response headers', () => {
    const emptyEvidence: ParsedHtmlEvidence = {
      headings: { h1: [], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: [],
      stylesheetHrefs: [],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: [],
    };

    const headers = {
      'server': 'Apache/2.4.58 (Ubuntu)',
      'x-powered-by': 'PHP/8.2.10',
    };

    const findings = UniversalTechEngine.evaluate(emptyEvidence, headers, 'audit-apache');

    const apacheFinding = findings.find((f) => f.technologyId === 'apache');
    expect(apacheFinding).toBeDefined();
    expect(apacheFinding?.name).toBe('Apache HTTP Server');
    expect(apacheFinding?.version).toBe('2.4.58');
    expect(apacheFinding?.status).toBe('confirmed');

    const phpFinding = findings.find((f) => f.technologyId === 'php');
    expect(phpFinding).toBeDefined();
    expect(phpFinding?.version).toBe('8.2.10');
  });

  it('detects Framer website builder via meta generator', () => {
    const evidence: ParsedHtmlEvidence = {
      headings: { h1: ['Welcome'], h2: [], h3: [] },
      links: [],
      images: [],
      metaGenerators: ['Framer v1.0.0'],
      scriptSources: ['https://framerusercontent.com/sites/script.js'],
      stylesheetHrefs: [],
      domMarkers: ['[data-framer-name]'],
      bodyClasses: [],
      inlineMarkers: [],
    };

    const findings = UniversalTechEngine.evaluate(evidence, {}, 'audit-framer');
    const framer = findings.find((f) => f.technologyId === 'framer');
    expect(framer).toBeDefined();
    expect(framer?.name).toBe('Framer');
    expect(framer?.status).toBe('confirmed');
  });

  it('produces zero false positives on clean generic HTML evidence', () => {
    const cleanEvidence: ParsedHtmlEvidence = {
      title: 'Simple Clean Static Page',
      headings: { h1: ['Hello World'], h2: [], h3: [] },
      links: ['/about'],
      images: [],
      metaGenerators: [],
      scriptSources: ['/custom-app.js'],
      stylesheetHrefs: ['/main.css'],
      domMarkers: [],
      bodyClasses: ['home'],
      inlineMarkers: [],
    };

    const findings = UniversalTechEngine.evaluate(cleanEvidence, {}, 'audit-clean');
    expect(findings.length).toBe(0);
  });
});
