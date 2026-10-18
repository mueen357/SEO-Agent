/**
 * Client-Side SEO Rules Engine.
 * Evaluates Core On-Page, Technical, and Site-Wide SEO Rules in-browser.
 */

import type { StandaloneCrawlPage, StandaloneSeoFinding } from '../types';

export class StandaloneRulesEngine {
  public static evaluatePage(page: StandaloneCrawlPage, auditId: string): StandaloneSeoFinding[] {
    const findings: StandaloneSeoFinding[] = [];

    // Gate: Evaluate on-page HTML presence rules only when a usable HTML response was actually retrieved and parsed
    const isUsableHtml =
      page.fetchStatus === 'success' &&
      page.httpStatus >= 200 &&
      page.httpStatus < 400;

    if (!isUsableHtml) {
      // Inaccessible pages or failed fetches: do NOT report missing title, missing H1, missing canonical!
      // Keep failed URL diagnostics separate from SEO content findings.
      // Do not count 0 HTTP status as a valid HTTP response. Retain genuine HTTP 4xx/5xx reporting separately.
      if (page.httpStatus >= 400) {
        findings.push({
          id: `${auditId}-${page.id}-status-error`,
          auditId,
          ruleId: 'TECH_HTTP_STATUS',
          category: 'technical',
          severity: page.httpStatus >= 500 ? 'critical' : 'high',
          status: 'fail',
          title: `HTTP ${page.httpStatus} Error`,
          description: `The page returned an error status code: ${page.httpStatus}.`,
          recommendation: 'Investigate server configuration or update internal links pointing to this broken URL.',
          pageUrl: page.url,
          evidence: { httpStatus: page.httpStatus },
        });
      }
      return findings;
    }

    // 1. Title Tag
    if (!page.title) {
      findings.push({
        id: `${auditId}-${page.id}-title-missing`,
        auditId,
        ruleId: 'ONPAGE_TITLE_TAG',
        category: 'on_page',
        severity: 'critical',
        status: 'fail',
        title: 'Missing Page Title Tag',
        description: 'The page does not contain a <title> element.',
        recommendation: 'Add a descriptive, unique <title> tag between 30 and 60 characters.',
        pageUrl: page.url,
        evidence: { title: null },
      });
    } else {
      const len = page.title.length;
      if (len < 30 || len > 60) {
        findings.push({
          id: `${auditId}-${page.id}-title-length`,
          auditId,
          ruleId: 'ONPAGE_TITLE_TAG',
          category: 'on_page',
          severity: 'medium',
          status: 'warning',
          title: len < 30 ? 'Title Tag is Too Short' : 'Title Tag is Too Long',
          description: `Title tag length is ${len} characters. Ideal length is 30 to 60 characters.`,
          recommendation: 'Refactor title tag to be between 30 and 60 characters to optimize SERP display.',
          pageUrl: page.url,
          evidence: { title: page.title, length: len },
        });
      }
    }

    // 2. Meta Description
    if (!page.metaDescription) {
      findings.push({
        id: `${auditId}-${page.id}-desc-missing`,
        auditId,
        ruleId: 'ONPAGE_META_DESC',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Meta Description',
        description: 'The page is missing a meta description tag.',
        recommendation: 'Add a compelling meta description between 70 and 160 characters.',
        pageUrl: page.url,
        evidence: { metaDescription: null },
      });
    } else {
      const len = page.metaDescription.length;
      if (len < 70 || len > 160) {
        findings.push({
          id: `${auditId}-${page.id}-desc-length`,
          auditId,
          ruleId: 'ONPAGE_META_DESC',
          category: 'on_page',
          severity: 'low',
          status: 'warning',
          title: len < 70 ? 'Meta Description is Too Short' : 'Meta Description is Too Long',
          description: `Meta description length is ${len} characters. Ideal range is 70 to 160 characters.`,
          recommendation: 'Adjust description length to prevent truncation in search results.',
          pageUrl: page.url,
          evidence: { metaDescription: page.metaDescription, length: len },
        });
      }
    }

    // 3. H1 Heading
    const h1Count = page.headings.h1.length;
    if (h1Count === 0) {
      findings.push({
        id: `${auditId}-${page.id}-h1-missing`,
        auditId,
        ruleId: 'ONPAGE_H1_PRIMARY',
        category: 'on_page',
        severity: 'high',
        status: 'fail',
        title: 'Missing Primary H1 Heading',
        description: 'The page contains no <h1> elements.',
        recommendation: 'Ensure each page has exactly one clear, topic-defining <h1> heading.',
        pageUrl: page.url,
        evidence: { h1Count: 0 },
      });
    } else if (h1Count > 1) {
      findings.push({
        id: `${auditId}-${page.id}-h1-multiple`,
        auditId,
        ruleId: 'ONPAGE_H1_PRIMARY',
        category: 'on_page',
        severity: 'medium',
        status: 'warning',
        title: 'Multiple H1 Headings Detected',
        description: `Found ${h1Count} <h1> headings on the page.`,
        recommendation: 'Use a single <h1> heading per page for consistent semantic hierarchy.',
        pageUrl: page.url,
        evidence: { h1Count, headings: page.headings.h1 },
      });
    }

    // 4. Canonical Tag
    if (!page.canonicalUrl) {
      findings.push({
        id: `${auditId}-${page.id}-canonical-missing`,
        auditId,
        ruleId: 'ONPAGE_CANONICAL',
        category: 'on_page',
        severity: 'medium',
        status: 'warning',
        title: 'Missing Canonical Tag',
        description: 'The page does not specify a rel="canonical" link.',
        recommendation: 'Add a self-referencing canonical URL to prevent duplicate content ambiguity.',
        pageUrl: page.url,
        evidence: { canonicalUrl: null },
      });
    }

    // 5. Image Alt Text
    const missingAlt = page.images.filter((img) => !img.alt || img.alt.trim() === '');
    if (missingAlt.length > 0) {
      findings.push({
        id: `${auditId}-${page.id}-images-alt`,
        auditId,
        ruleId: 'ONPAGE_IMAGES',
        category: 'on_page',
        severity: 'medium',
        status: 'warning',
        title: `${missingAlt.length} Image(s) Missing Alt Text`,
        description: `Found ${missingAlt.length} images without descriptive alt attributes.`,
        recommendation: 'Provide meaningful alt text for all informational images to aid accessibility and image search.',
        pageUrl: page.url,
        evidence: { missingCount: missingAlt.length, images: missingAlt.slice(0, 5) },
      });
    }

    // 6. HTTPS Security with local development fixture policy
    if (!page.url.startsWith('https://')) {
      const isLoopbackHost = (urlStr: string): boolean => {
        try {
          const h = new URL(urlStr).hostname.toLowerCase();
          return h === 'localhost' || h === '127.0.0.1' || h === '::1';
        } catch {
          return false;
        }
      };

      if (isLoopbackHost(page.url)) {
        // Explicitly authorized local development fixture: do not present as a production deployment defect
        findings.push({
          id: `${auditId}-${page.id}-https-local-dev`,
          auditId,
          ruleId: 'TECH_HTTPS_SECURITY',
          category: 'technical',
          severity: 'low',
          status: 'pass',
          title: 'Local Development Fixture (HTTP Permitted)',
          description: 'Local development and test loopback host is permitted over HTTP for authorized fixtures.',
          recommendation: 'Ensure HTTPS is configured with SSL/TLS certificates when deploying to a public production domain.',
          pageUrl: page.url,
          evidence: { protocol: 'http', environment: 'local_development' },
        });
      } else {
        findings.push({
          id: `${auditId}-${page.id}-https-insecure`,
          auditId,
          ruleId: 'TECH_HTTPS_SECURITY',
          category: 'technical',
          severity: 'critical',
          status: 'fail',
          title: 'Insecure HTTP Protocol',
          description: 'The page is served over unencrypted HTTP.',
          recommendation: 'Enforce HTTPS across all pages with an SSL/TLS certificate and HSTS.',
          pageUrl: page.url,
          evidence: { protocol: 'http' },
        });
      }
    }

    // 7. HTTP Status Code
    if (page.httpStatus >= 400) {
      findings.push({
        id: `${auditId}-${page.id}-status-error`,
        auditId,
        ruleId: 'TECH_HTTP_STATUS',
        category: 'technical',
        severity: page.httpStatus >= 500 ? 'critical' : 'high',
        status: 'fail',
        title: `HTTP ${page.httpStatus} Error`,
        description: `The page returned an error status code: ${page.httpStatus}.`,
        recommendation: 'Investigate server configuration or update internal links pointing to this broken URL.',
        pageUrl: page.url,
        evidence: { httpStatus: page.httpStatus },
      });
    }

    return findings;
  }

  public static evaluateSitewide(pages: StandaloneCrawlPage[], auditId: string): StandaloneSeoFinding[] {
    const findings: StandaloneSeoFinding[] = [];
    const usablePages = pages.filter(
      (p) => p.fetchStatus === 'success' && p.httpStatus >= 200 && p.httpStatus < 400
    );
    if (usablePages.length <= 1) return findings;

    // 1. Duplicate Title Tags
    const titleMap = new Map<string, string[]>();
    for (const p of usablePages) {
      if (p.title) {
        const norm = p.title.trim().toLowerCase();
        const list = titleMap.get(norm) || [];
        list.push(p.url);
        titleMap.set(norm, list);
      }
    }

    for (const [title, urls] of titleMap.entries()) {
      if (urls.length > 1) {
        findings.push({
          id: `${auditId}-sitewide-dup-title-${title.slice(0, 20)}`,
          auditId,
          ruleId: 'SITE_DUPLICATE_TITLES',
          category: 'sitewide',
          severity: 'high',
          status: 'fail',
          title: `Duplicate Title Tag Across ${urls.length} Pages`,
          description: `The title "${title}" is shared across multiple pages.`,
          recommendation: 'Ensure every indexed page has a distinct title that describes its specific content.',
          pageUrl: urls[0] ?? '',
          evidence: { title, duplicateUrls: urls },
        });
      }
    }

    // 2. Orphan Pages (inbound links = 0, excluding seed page)
    const inboundCounts = new Map<string, number>();
    for (const p of usablePages) {
      inboundCounts.set(p.url, 0);
    }

    for (const p of usablePages) {
      for (const dest of p.links) {
        if (inboundCounts.has(dest) && dest !== p.url) {
          inboundCounts.set(dest, (inboundCounts.get(dest) || 0) + 1);
        }
      }
    }

    const seedUrl = usablePages[0]?.url;
    for (const [url, count] of inboundCounts.entries()) {
      if (count === 0 && url !== seedUrl) {
        findings.push({
          id: `${auditId}-sitewide-orphan-${url.slice(-20)}`,
          auditId,
          ruleId: 'SITE_ORPHAN_PAGES',
          category: 'sitewide',
          severity: 'medium',
          status: 'warning',
          title: 'Orphan Page (No Inbound Internal Links)',
          description: `No crawled pages link to: ${url}.`,
          recommendation: 'Add internal links from related category or content pages so users and crawlers can find it.',
          pageUrl: url,
          evidence: { inboundLinks: 0 },
        });
      }
    }

    return findings;
  }
}
