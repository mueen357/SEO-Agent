/**
 * Website Audit Agent - Pure DOM Quick Audit Extractor
 *
 * Self-contained extraction function suitable for direct execution via
 * chrome.scripting.executeScript without external closure dependencies.
 */

import type {
  QuickAuditResult,
  HeadingItem,
  HeadingsAnalysis,
  ImageIssueItem,
  ImagesAnalysis,
  LinkItem,
  LinksAnalysis,
  AuditFinding
} from '../types/audit';

export function extractPageAudit(
  doc: Document = document,
  winOrUrl?: Window | string
): QuickAuditResult {
  // Self-contained link classifier to ensure executeScript has zero external module dependencies
  function classifyLinkInline(rawHref: string, baseLocationHref: string) {
    let baseHostname = '';
    try {
      baseHostname = new URL(baseLocationHref).hostname.toLowerCase();
    } catch {
      baseHostname = '';
    }

    if (!rawHref || typeof rawHref !== 'string') {
      return {
        isValid: false,
        normalizedHref: '',
        resolvedUrl: '',
        isHttp: false,
        protocol: 'invalid:',
        isInternal: false,
        hostname: ''
      };
    }

    try {
      const parsed = new URL(rawHref, baseLocationHref);
      const protocol = parsed.protocol.toLowerCase();
      const linkHostname = parsed.hostname.toLowerCase();
      const isHttp = protocol === 'http:' || protocol === 'https:';

      let isInternal = false;
      if (isHttp && baseHostname && linkHostname) {
        if (linkHostname === baseHostname) {
          isInternal = true;
        }
      }

      return {
        isValid: true,
        normalizedHref: parsed.href,
        resolvedUrl: parsed.href,
        isHttp,
        protocol,
        isInternal,
        hostname: linkHostname
      };
    } catch {
      return {
        isValid: false,
        normalizedHref: rawHref,
        resolvedUrl: rawHref,
        isHttp: false,
        protocol: 'malformed:',
        isInternal: false,
        hostname: ''
      };
    }
  }

  let currentUrl = 'http://localhost/';
  let currentOrigin = 'http://localhost';
  let currentHostname = 'localhost';

  if (typeof winOrUrl === 'string') {
    currentUrl = winOrUrl;
    try {
      const u = new URL(winOrUrl);
      currentOrigin = u.origin;
      currentHostname = u.hostname;
    } catch {
      // fallback
    }
  } else if (winOrUrl && (winOrUrl as Window).location) {
    const loc = (winOrUrl as Window).location;
    currentUrl = loc.href;
    currentOrigin = loc.origin;
    currentHostname = loc.hostname;
  } else if (typeof window !== 'undefined' && window.location) {
    currentUrl = window.location.href;
    currentOrigin = window.location.origin;
    currentHostname = window.location.hostname;
  }

  const timestamp = Date.now();

  // 1. Document Title
  const rawTitle = doc.title;
  const documentTitle = rawTitle !== undefined && rawTitle !== null && rawTitle.trim() !== ''
    ? rawTitle.trim()
    : null;

  // 2. SEO Meta Description (strictly independent of og:description)
  const metaDescEl = doc.querySelector<HTMLMetaElement>('meta[name="description" i]');
  const rawDesc = metaDescEl ? metaDescEl.getAttribute('content') : null;
  const metaDescription = rawDesc !== null && rawDesc.trim() !== '' ? rawDesc.trim() : null;

  // 3. Canonical URL
  const canonicalEl = doc.querySelector<HTMLLinkElement>('link[rel="canonical" i]');
  const rawCanonical = canonicalEl ? canonicalEl.getAttribute('href') : null;
  let canonicalUrl: string | null = null;
  if (rawCanonical && rawCanonical.trim() !== '') {
    try {
      canonicalUrl = new URL(rawCanonical.trim(), currentUrl).href;
    } catch {
      canonicalUrl = rawCanonical.trim();
    }
  }

  // 4. Meta Robots
  const robotsEl = doc.querySelector<HTMLMetaElement>('meta[name="robots" i]');
  const rawRobots = robotsEl ? robotsEl.getAttribute('content') : null;
  const metaRobots = rawRobots !== null && rawRobots.trim() !== '' ? rawRobots.trim() : null;

  // 5. HTML Language
  const htmlEl = doc.documentElement;
  const rawLang = htmlEl ? htmlEl.getAttribute('lang') : null;
  const htmlLang = rawLang !== null && rawLang.trim() !== '' ? rawLang.trim() : null;

  // 6. Headings H1-H6 in DOM order
  const headingElements = doc.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6');
  const items: HeadingItem[] = [];
  let h1Count = 0;
  let h2Count = 0;
  let h3Count = 0;
  let h4Count = 0;
  let h5Count = 0;
  let h6Count = 0;

  headingElements.forEach((el, index) => {
    const tagName = el.tagName.toLowerCase();
    const level = parseInt(tagName.replace('h', ''), 10);
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');

    if (level === 1) h1Count++;
    else if (level === 2) h2Count++;
    else if (level === 3) h3Count++;
    else if (level === 4) h4Count++;
    else if (level === 5) h5Count++;
    else if (level === 6) h6Count++;

    items.push({
      level,
      text,
      index
    });
  });

  const headings: HeadingsAnalysis = {
    items,
    h1Count,
    h2Count,
    h3Count,
    h4Count,
    h5Count,
    h6Count,
    totalCount: items.length
  };

  // 7. Image Analysis (Missing alt vs empty decorative alt)
  const imgElements = doc.querySelectorAll<HTMLImageElement>('img');
  let missingAltCount = 0;
  let emptyAltCount = 0;
  let withAltCount = 0;
  const imageIssues: ImageIssueItem[] = [];

  imgElements.forEach((img) => {
    const hasAlt = img.hasAttribute('alt');
    const altValue = img.getAttribute('alt');
    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';

    if (!hasAlt) {
      missingAltCount++;
      if (imageIssues.length < 50) {
        imageIssues.push({
          src,
          hasAlt: false,
          altText: null,
          issueType: 'missing_alt'
        });
      }
    } else if (altValue !== null && altValue.trim() === '') {
      emptyAltCount++;
      if (imageIssues.length < 50) {
        imageIssues.push({
          src,
          hasAlt: true,
          altText: '',
          issueType: 'empty_alt'
        });
      }
    } else {
      withAltCount++;
    }
  });

  const images: ImagesAnalysis = {
    totalCount: imgElements.length,
    missingAltCount,
    emptyAltCount,
    withAltCount,
    issues: imageIssues
  };

  // 8. Hyperlinks Analysis
  const anchorElements = doc.querySelectorAll<HTMLAnchorElement>('a[href]');
  let internalCount = 0;
  let externalCount = 0;
  let otherProtocolsCount = 0;
  const samples: LinkItem[] = [];

  anchorElements.forEach((anchor) => {
    const rawHref = anchor.getAttribute('href') || '';
    const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
    const classified = classifyLinkInline(rawHref, currentUrl);

    if (!classified.isValid || !classified.isHttp) {
      otherProtocolsCount++;
      return;
    }

    if (classified.isInternal) {
      internalCount++;
      if (samples.length < 50) {
        samples.push({
          href: classified.normalizedHref,
          text,
          isInternal: true,
          protocol: classified.protocol,
          isHttp: true
        });
      }
    } else {
      externalCount++;
      if (samples.length < 50) {
        samples.push({
          href: classified.normalizedHref,
          text,
          isInternal: false,
          protocol: classified.protocol,
          isHttp: true
        });
      }
    }
  });

  const links: LinksAnalysis = {
    totalCount: anchorElements.length,
    internalCount,
    externalCount,
    otherProtocolsCount,
    samples
  };

  // 9. Preliminary Findings
  const findings: AuditFinding[] = [];

  if (!documentTitle) {
    findings.push({
      id: 'missing-title',
      category: 'metadata',
      title: 'Missing Page Title',
      severity: 'critical',
      description: 'The document does not have a <title> tag. Page titles are critical for search appearance and indexing.',
      recommendation: 'Add a descriptive <title> tag between 50 and 60 characters.'
    });
  } else if (documentTitle.length < 20) {
    findings.push({
      id: 'short-title',
      category: 'metadata',
      title: 'Short Page Title',
      severity: 'warning',
      description: `The page title has ${documentTitle.length} characters, which may be underspecified.`,
      recommendation: 'Expand the title to accurately summarize the page content.'
    });
  } else if (documentTitle.length > 70) {
    findings.push({
      id: 'long-title',
      category: 'metadata',
      title: 'Long Page Title',
      severity: 'warning',
      description: `The page title has ${documentTitle.length} characters and may be truncated in search results.`,
      recommendation: 'Keep title lengths within 50 to 60 characters.'
    });
  }

  if (!metaDescription) {
    findings.push({
      id: 'missing-description',
      category: 'metadata',
      title: 'Missing Meta Description',
      severity: 'warning',
      description: 'No SEO meta description tag was found on the page.',
      recommendation: 'Add a compelling <meta name="description"> tag between 120 and 160 characters.'
    });
  }

  if (!htmlLang) {
    findings.push({
      id: 'missing-html-lang',
      category: 'metadata',
      title: 'Missing HTML Language Attribute',
      severity: 'warning',
      description: 'The root <html> element does not specify a lang attribute.',
      recommendation: 'Declare primary language using the lang attribute on <html>, e.g., <html lang="en">.'
    });
  }

  if (!canonicalUrl) {
    findings.push({
      id: 'missing-canonical',
      category: 'metadata',
      title: 'Missing Canonical Tag',
      severity: 'info',
      description: 'No canonical link relation was found. Canonical tags help search engines prevent duplicate content indexing.',
      recommendation: 'Review whether a self-referencing canonical tag should be added.'
    });
  } else {
    // Check if canonical URL points to the same page or a different URL
    let isSelfRef = false;
    try {
      const uCur = new URL(currentUrl);
      const uCan = new URL(canonicalUrl);
      const curNorm = (uCur.origin + uCur.pathname).replace(/\/+$/, '') + (uCur.search || '');
      const canNorm = (uCan.origin + uCan.pathname).replace(/\/+$/, '') + (uCan.search || '');
      isSelfRef = curNorm.toLowerCase() === canNorm.toLowerCase();
    } catch {
      isSelfRef = canonicalUrl.toLowerCase() === currentUrl.toLowerCase();
    }

    if (!isSelfRef) {
      findings.push({
        id: 'canonical-differs',
        category: 'metadata',
        title: 'Canonical Points to Different Page',
        severity: 'info',
        description: `The canonical URL (${canonicalUrl}) points to a different location than the current URL (${currentUrl}).`,
        recommendation: 'Confirm that canonicalizing to another URL is intentional (e.g. syndicated content or tracking parameters).'
      });
    }
  }

  if (h1Count === 0) {
    findings.push({
      id: 'missing-h1',
      category: 'headings',
      title: 'Missing H1 Heading',
      severity: 'warning',
      description: 'No <h1> heading was detected on the page.',
      recommendation: 'Add an <h1> heading representing the main topic of the page.'
    });
  } else if (h1Count > 1) {
    findings.push({
      id: 'multiple-h1',
      category: 'headings',
      title: 'Multiple H1 Headings Detected',
      severity: 'info',
      description: `Found ${h1Count} <h1> elements. While modern HTML allows multiple H1s, a single primary H1 is standard practice.`,
      recommendation: 'Review heading structure to verify logical content hierarchy.'
    });
  }

  if (missingAltCount > 0) {
    findings.push({
      id: 'images-missing-alt',
      category: 'images',
      title: 'Images Missing Alt Attributes',
      severity: 'warning',
      description: `${missingAltCount} images lack an alt attribute entirely.`,
      recommendation: 'Add informative alt attributes for meaningful images or alt="" for decorative images.'
    });
  }

  return {
    url: currentUrl,
    origin: currentOrigin,
    hostname: currentHostname,
    timestamp,
    documentTitle,
    metaDescription,
    canonicalUrl,
    metaRobots,
    htmlLang,
    headings,
    images,
    links,
    findings
  };
}
