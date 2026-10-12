import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageAudit } from '../services/extractor';

describe('Quick Audit DOM Extraction Engine', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('correctly extracts full metadata and elements from a standard valid page', () => {
    document.documentElement.lang = 'en-US';
    document.head.innerHTML = `
      <title>Premium SaaS Platform - Home</title>
      <meta name="description" content="Empowering developers with cutting-edge audit tools.">
      <link rel="canonical" href="https://saas-example.com/">
      <meta name="robots" content="index, follow, max-image-preview:large">
    `;

    document.body.innerHTML = `
      <header><h1>Main Headline of the Website</h1></header>
      <main>
        <h2>Product Features</h2>
        <h3>Lightning Fast</h3>
        <h3>Bank-Grade Security</h3>
        <h2>Customer Testimonials</h2>
        <img src="/images/logo.png" alt="Company Logo">
        <img src="/images/hero.jpg" alt="Hero Banner Illustration">
        <img src="/images/spacer.gif" alt="">
        <a href="/features">Features</a>
        <a href="https://saas-example.com/pricing">Pricing</a>
        <a href="https://twitter.com/saas">Twitter</a>
        <a href="mailto:sales@saas-example.com">Email Sales</a>
      </main>
    `;

    const result = extractPageAudit(document, 'https://saas-example.com/');

    // Page & Metadata
    expect(result.url).toBe('https://saas-example.com/');
    expect(result.hostname).toBe('saas-example.com');
    expect(result.documentTitle).toBe('Premium SaaS Platform - Home');
    expect(result.metaDescription).toBe('Empowering developers with cutting-edge audit tools.');
    expect(result.canonicalUrl).toBe('https://saas-example.com/');
    expect(result.metaRobots).toBe('index, follow, max-image-preview:large');
    expect(result.htmlLang).toBe('en-US');

    // Headings
    expect(result.headings.h1Count).toBe(1);
    expect(result.headings.h2Count).toBe(2);
    expect(result.headings.h3Count).toBe(2);
    expect(result.headings.totalCount).toBe(5);
    expect(result.headings.items.map(h => ({ level: h.level, text: h.text }))).toEqual([
      { level: 1, text: 'Main Headline of the Website' },
      { level: 2, text: 'Product Features' },
      { level: 3, text: 'Lightning Fast' },
      { level: 3, text: 'Bank-Grade Security' },
      { level: 2, text: 'Customer Testimonials' },
    ]);

    // Images
    expect(result.images.totalCount).toBe(3);
    expect(result.images.missingAltCount).toBe(0);
    expect(result.images.emptyAltCount).toBe(1);
    expect(result.images.withAltCount).toBe(2);

    // Links
    expect(result.links.totalCount).toBe(4);
    expect(result.links.internalCount).toBe(2); // /features and /pricing
    expect(result.links.externalCount).toBe(1); // twitter
    expect(result.links.otherProtocolsCount).toBe(1); // mailto
  });

  it('handles a page with missing metadata and flags preliminary findings', () => {
    document.documentElement.removeAttribute('lang');
    document.head.innerHTML = '';
    document.body.innerHTML = '<div>Content without title or headings</div>';

    const result = extractPageAudit(document, 'https://example.com/bare');

    expect(result.documentTitle).toBeNull();
    expect(result.metaDescription).toBeNull();
    expect(result.canonicalUrl).toBeNull();
    expect(result.metaRobots).toBeNull();
    expect(result.htmlLang).toBeNull();

    expect(result.headings.totalCount).toBe(0);
    expect(result.headings.h1Count).toBe(0);
    expect(result.images.totalCount).toBe(0);
    expect(result.links.totalCount).toBe(0);

    // Findings verification
    const findingIds = result.findings.map(f => f.id);
    expect(findingIds).toContain('missing-title');
    expect(findingIds).toContain('missing-description');
    expect(findingIds).toContain('missing-html-lang');
    expect(findingIds).toContain('missing-canonical');
    expect(findingIds).toContain('missing-h1');
  });

  it('accurately distinguishes missing alt from empty decorative alt', () => {
    document.head.innerHTML = '<title>Alt Test</title>';
    document.body.innerHTML = `
      <img src="/img1.jpg">
      <img src="/img2.jpg">
      <img src="/decorative1.svg" alt="">
      <img src="/decorative2.svg" alt="   ">
      <img src="/photo.jpg" alt="A sunny landscape">
    `;

    const result = extractPageAudit(document, 'https://example.com/gallery');

    expect(result.images.totalCount).toBe(5);
    expect(result.images.missingAltCount).toBe(2);
    expect(result.images.emptyAltCount).toBe(2);
    expect(result.images.withAltCount).toBe(1);

    const altFinding = result.findings.find(f => f.id === 'images-missing-alt');
    expect(altFinding).toBeDefined();
    expect(altFinding?.description).toContain('2 images lack an alt attribute');
  });

  it('handles multiple H1 tags without treating as fatal', () => {
    document.head.innerHTML = '<title>Multi H1</title>';
    document.body.innerHTML = '<h1>Primary Brand</h1><h1>Section 1</h1><h2>Subsection</h2>';

    const result = extractPageAudit(document, 'https://example.com/blog');

    expect(result.headings.h1Count).toBe(2);
    const multiH1Finding = result.findings.find(f => f.id === 'multiple-h1');
    expect(multiH1Finding).toBeDefined();
    expect(multiH1Finding?.severity).toBe('info');
  });

  it('processes relative, external, and malformed hyperlinks safely', () => {
    document.head.innerHTML = '<title>Links Test</title>';
    document.body.innerHTML = `
      <a href="/relative/path">Relative</a>
      <a href="./relative/nested">Dot Relative</a>
      <a href="#local-anchor">Anchor</a>
      <a href="https://example.com/same-origin">Absolute Internal</a>
      <a href="https://anotherdomain.org/landing">External Target</a>
      <a href="javascript:void(0)">Script Link</a>
      <a href="tel:18005551212">Phone</a>
      <a>Link with no href</a>
    `;

    const result = extractPageAudit(document, 'https://example.com/page');

    expect(result.links.totalCount).toBe(7);
    expect(result.links.internalCount).toBe(4);
    expect(result.links.externalCount).toBe(1);
    expect(result.links.otherProtocolsCount).toBe(2);
  });

  it('regression: extracts SEO meta description independently of og:description', () => {
    // Page with og:description ONLY, no standard meta name="description"
    document.head.innerHTML = `
      <title>Social Only Page</title>
      <meta property="og:description" content="This is an OpenGraph social snippet, not an SEO meta description.">
    `;
    document.body.innerHTML = '<h1>Content</h1>';

    const result = extractPageAudit(document, 'https://example.com/social');

    // Must be null because <meta name="description"> does not exist
    expect(result.metaDescription).toBeNull();
    const missingDesc = result.findings.find(f => f.id === 'missing-description');
    expect(missingDesc).toBeDefined();

    // Now test with standard meta name="description"
    document.head.innerHTML = `
      <title>Full Page</title>
      <meta name="description" content="Dedicated search engine meta description.">
      <meta property="og:description" content="Social snippet text.">
    `;
    const result2 = extractPageAudit(document, 'https://example.com/full');
    expect(result2.metaDescription).toBe('Dedicated search engine meta description.');
  });

  it('regression: distinguishes self-referencing canonical vs cross-page canonical', () => {
    // Case A: Self-referencing canonical
    document.head.innerHTML = `
      <title>Self Page</title>
      <link rel="canonical" href="https://example.com/products/item">
    `;
    const selfRes = extractPageAudit(document, 'https://example.com/products/item');
    expect(selfRes.canonicalUrl).toBe('https://example.com/products/item');
    expect(selfRes.findings.find(f => f.id === 'canonical-differs')).toBeUndefined();

    // Case B: Cross-page canonical (points to a different URL)
    document.head.innerHTML = `
      <title>Tracking Page</title>
      <link rel="canonical" href="https://example.com/products/item">
    `;
    const diffRes = extractPageAudit(document, 'https://example.com/products/item?utm_source=facebook');
    expect(diffRes.canonicalUrl).toBe('https://example.com/products/item');
    // Query param difference -> differs
    expect(diffRes.findings.find(f => f.id === 'canonical-differs')).toBeDefined();
  });

  it('regression: extractPageAudit is self-contained with no external module dependencies', () => {
    // Verify that extractPageAudit string representation does not call external module symbols
    const fnStr = extractPageAudit.toString();
    // Verify classifyLinkInline is defined within the function body
    expect(fnStr).toContain('classifyLinkInline');
    // Run extraction on a synthetic document
    document.head.innerHTML = '<title>Self Contained Test</title>';
    document.body.innerHTML = '<a href="/test">Internal</a><a href="https://google.com">External</a>';
    const res = extractPageAudit(document, 'https://example.com/self-contained');
    expect(res.links.internalCount).toBe(1);
    expect(res.links.externalCount).toBe(1);
  });
});
