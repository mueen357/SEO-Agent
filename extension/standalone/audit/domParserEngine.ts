/**
 * In-Browser HTML Parser using native DOMParser.
 * Blazingly fast V8 C++ execution; extracts SEO nodes and technology markers.
 */

export interface ParsedHtmlEvidence {
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  metaRobots?: string;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  links: string[];
  images: Array<{ src: string; alt: string }>;
  metaGenerators: string[];
  scriptSources: string[];
  stylesheetHrefs: string[];
  domMarkers: string[];
  bodyClasses: string[];
  inlineMarkers: string[];
}

export class StandaloneDomParser {
  public static parse(html: string, pageUrl: string): ParsedHtmlEvidence {
    if (typeof DOMParser === 'undefined') {
      return this.fallbackParse(html, pageUrl);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Title
    const titleEl = doc.querySelector('title');
    const title = titleEl?.textContent?.trim() || undefined;

    // Meta Description
    const metaDescEl = doc.querySelector('meta[name="description" i]');
    const metaDescription = metaDescEl?.getAttribute('content')?.trim() || undefined;

    // Canonical
    const canonicalEl = doc.querySelector('link[rel="canonical" i]');
    const canonicalUrl = canonicalEl?.getAttribute('href')?.trim() || undefined;

    // Meta Robots
    const metaRobotsEl = doc.querySelector('meta[name="robots" i]');
    const metaRobots = metaRobotsEl?.getAttribute('content')?.trim() || undefined;

    // Headings
    const h1 = Array.from(doc.querySelectorAll('h1')).map((h) => h.textContent?.trim() || '').filter(Boolean);
    const h2 = Array.from(doc.querySelectorAll('h2')).map((h) => h.textContent?.trim() || '').filter(Boolean);
    const h3 = Array.from(doc.querySelectorAll('h3')).map((h) => h.textContent?.trim() || '').filter(Boolean);

    // Links (resolved to absolute URLs)
    const baseHref = pageUrl;
    const links: string[] = [];
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const resolved = new URL(href, baseHref).href;
          links.push(resolved);
        } catch {
          // Ignore invalid URL
        }
      }
    });

    // Images
    const images: Array<{ src: string; alt: string }> = [];
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      const alt = img.getAttribute('alt') || '';
      if (src) {
        try {
          images.push({ src: new URL(src, baseHref).href, alt });
        } catch {
          images.push({ src, alt });
        }
      }
    });

    // Technology extraction vectors
    const metaGenerators: string[] = [];
    doc.querySelectorAll('meta[name="generator" i]').forEach((m) => {
      const c = m.getAttribute('content');
      if (c) metaGenerators.push(c.trim());
    });

    const scriptSources: string[] = [];
    doc.querySelectorAll('script[src]').forEach((s) => {
      const src = s.getAttribute('src');
      if (src) scriptSources.push(src);
    });

    const stylesheetHrefs: string[] = [];
    doc.querySelectorAll('link[rel="stylesheet" i]').forEach((l) => {
      const h = l.getAttribute('href');
      if (h) stylesheetHrefs.push(h);
    });

    const domMarkers: string[] = [];
    if (doc.getElementById('__next')) domMarkers.push('id:__next');
    if (doc.getElementById('___gatsby')) domMarkers.push('id:___gatsby');
    if (doc.querySelector('[data-framer-hydrate-v2]')) domMarkers.push('data-framer-hydrate-v2');
    if (doc.querySelector('[data-wf-site]')) domMarkers.push('data-wf-site');
    if (doc.querySelector('[ng-version]')) domMarkers.push('ng-version');
    if (doc.querySelector('astro-island')) domMarkers.push('astro-island');
    if (doc.querySelector('.elementor')) domMarkers.push('elementor');

    const bodyClasses = (doc.body?.className || '').split(/\s+/).filter(Boolean);

    // Bounded inline markers search
    const inlineMarkers: string[] = [];
    doc.querySelectorAll('script:not([src])').forEach((s) => {
      const content = s.textContent || '';
      if (content.includes('__NEXT_DATA__')) inlineMarkers.push('__NEXT_DATA__');
      if (content.includes('__framer__')) inlineMarkers.push('__framer__');
      if (content.includes('Shopify.theme')) inlineMarkers.push('Shopify.theme');
      if (content.includes('window.dataLayer')) inlineMarkers.push('window.dataLayer');
      if (content.includes('wp.apiFetch')) inlineMarkers.push('wp.apiFetch');
    });

    return {
      title,
      metaDescription,
      canonicalUrl,
      metaRobots,
      headings: { h1, h2, h3 },
      links: Array.from(new Set(links)),
      images,
      metaGenerators,
      scriptSources,
      stylesheetHrefs,
      domMarkers,
      bodyClasses,
      inlineMarkers,
    };
  }

  /** Regex fallback when DOMParser is unavailable (e.g. isolated test environments) */
  private static fallbackParse(html: string, pageUrl: string): ParsedHtmlEvidence {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/gi);

    return {
      title: titleMatch && titleMatch[1] ? titleMatch[1].trim() : undefined,
      metaDescription: metaDescMatch && metaDescMatch[1] ? metaDescMatch[1].trim() : undefined,
      headings: {
        h1: h1Match ? h1Match.map((h) => h.replace(/<[^>]+>/g, '').trim()) : [],
        h2: [],
        h3: [],
      },
      links: [],
      images: [],
      metaGenerators: [],
      scriptSources: [],
      stylesheetHrefs: [],
      domMarkers: [],
      bodyClasses: [],
      inlineMarkers: [],
    };
  }
}
