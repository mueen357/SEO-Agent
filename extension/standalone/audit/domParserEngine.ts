import { extractMainContent } from './contentFingerprint';

export interface ParsedHtmlEvidence {
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  canonicalHrefs?: string[];
  canonicalCount?: number;
  metaRobots?: string;
  htmlLang?: string | null;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4?: string[];
    h5?: string[];
    h6?: string[];
  };
  headingCounts?: Record<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', number>;
  h1RawCount?: number;
  h1HasContent?: boolean;
  links: string[];
  linksDetailed?: Array<{ href: string; text: string; isInternal: boolean }>;
  internalOutlinksCount?: number;
  externalOutlinksCount?: number;
  emptyAnchorCount?: number;
  images: Array<{ src: string; alt: string; hasAlt?: boolean }>;
  imageCount?: number;
  missingAltCount?: number;
  emptyAltCount?: number;
  metaGenerators: string[];
  scriptSources: string[];
  stylesheetHrefs: string[];
  domMarkers: string[];
  bodyClasses: string[];
  inlineMarkers: string[];
  assetUrls?: string[];
  htmlAttributes?: Record<string, string>;
  linkRels?: Array<{ rel: string; href: string }>;
  htmlComments?: string[];
  cookieNames?: string[];
  normalizedMainTextHash?: string;
  mainTextWordCount?: number;
  mainTextSimhash?: string;
  contentQualityStatus?: 'empty' | 'thin' | 'usable' | 'sufficient' | 'non_html';
  extractionSource?: string;
  extractionVersion?: string;
  mainTextExcerpt?: string;
  isContentTruncated?: boolean;
  isExcerptTruncated?: boolean;
  isSourceContentTruncated?: boolean;
  processingLimitReached?: boolean;
}

let creatingOffscreenPromise: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.offscreen) {
    return;
  }

  // Check if offscreen document already exists (Chrome 116+)
  if (chrome.runtime?.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });
    if (contexts.length > 0) return;
  }

  if (creatingOffscreenPromise) {
    await creatingOffscreenPromise;
    return;
  }

  creatingOffscreenPromise = chrome.offscreen.createDocument({
    url: chrome.runtime.getURL('offscreen.html'),
    reasons: ['DOM_PARSER' as chrome.offscreen.Reason],
    justification: 'Parse crawled HTML into structured SEO and technology evidence without script execution',
  }).then(() => {
    creatingOffscreenPromise = null;
  }).catch((err: Error) => {
    creatingOffscreenPromise = null;
    // Ignore error if document already exists
    if (!err.message?.includes('already exists') && !err.message?.includes('Only a single offscreen document')) {
      console.warn('[Offscreen] Document creation note:', err.message);
    }
  });

  await creatingOffscreenPromise;
}

export class StandaloneDomParser {
  /**
   * Asynchronous HTML parsing. Uses native DOMParser in Window/Sidepanel contexts,
   * delegates to bounded chrome.offscreen in MV3 Service Worker context,
   * or falls back to robust regex extraction in non-browser unit test environments.
   */
  public static async parseAsync(html: string, pageUrl: string): Promise<ParsedHtmlEvidence> {
    // 1. Direct native DOMParser if available (Window, Sidepanel, Vitest jsdom)
    if (typeof DOMParser !== 'undefined') {
      return this.parse(html, pageUrl);
    }

    // 2. Chrome Offscreen Document if running inside Service Worker
    if (typeof chrome !== 'undefined' && chrome.offscreen && chrome.runtime?.sendMessage) {
      try {
        await ensureOffscreenDocument();
        const res = await chrome.runtime.sendMessage({
          type: 'PARSE_HTML_OFFSCREEN',
          payload: { html, pageUrl },
        });
        if (res && res.success && res.evidence) {
          return res.evidence as ParsedHtmlEvidence;
        }
      } catch (err: any) {
        console.warn('[StandaloneDomParser] Offscreen parse delegation failed, using fallback:', err?.message);
      }
    }

    // 3. Fallback extraction
    return this.fallbackParse(html, pageUrl);
  }

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

    // Canonical: capture ALL rel=canonical elements (not just first)
    const canonicalEls = Array.from(doc.querySelectorAll('link[rel~="canonical" i]'));
    const canonicalHrefs = canonicalEls
      .map((el) => el.getAttribute('href')?.trim())
      .filter((h): h is string => typeof h === 'string');
    const canonicalCount = canonicalEls.length;
    const canonicalUrl = canonicalHrefs[0] || undefined;

    // Meta Robots
    const metaRobotsEl = doc.querySelector('meta[name="robots" i]');
    const metaRobots = metaRobotsEl?.getAttribute('content')?.trim() || undefined;

    // HTML Lang
    const htmlEl = doc.documentElement;
    let htmlLang: string | null | undefined = undefined;
    if (htmlEl) {
      if (htmlEl.hasAttribute('lang')) {
        htmlLang = htmlEl.getAttribute('lang');
      } else {
        htmlLang = null;
      }
    }

    // Headings H1 through H6
    const h1Els = Array.from(doc.querySelectorAll('h1'));
    const h2Els = Array.from(doc.querySelectorAll('h2'));
    const h3Els = Array.from(doc.querySelectorAll('h3'));
    const h4Els = Array.from(doc.querySelectorAll('h4'));
    const h5Els = Array.from(doc.querySelectorAll('h5'));
    const h6Els = Array.from(doc.querySelectorAll('h6'));

    const h1RawCount = h1Els.length;
    const h1Texts = h1Els.map((h) => h.textContent?.trim() || '');
    const h1HasContent = h1Texts.some((t) => t.length > 0);

    const headings = {
      h1: h1Texts.filter(Boolean),
      h2: h2Els.map((h) => h.textContent?.trim() || '').filter(Boolean),
      h3: h3Els.map((h) => h.textContent?.trim() || '').filter(Boolean),
      h4: h4Els.map((h) => h.textContent?.trim() || '').filter(Boolean),
      h5: h5Els.map((h) => h.textContent?.trim() || '').filter(Boolean),
      h6: h6Els.map((h) => h.textContent?.trim() || '').filter(Boolean),
    };

    const headingCounts = {
      h1: h1RawCount,
      h2: h2Els.length,
      h3: h3Els.length,
      h4: h4Els.length,
      h5: h5Els.length,
      h6: h6Els.length,
    };

    // Links (resolved to absolute URLs)
    const baseHref = pageUrl;
    let baseOrigin = '';
    try {
      baseOrigin = new URL(baseHref).origin;
    } catch {}

    const linkStrings: string[] = [];
    const linksDetailed: Array<{ href: string; text: string; isInternal: boolean }> = [];
    let internalOutlinksCount = 0;
    let externalOutlinksCount = 0;
    let emptyAnchorCount = 0;

    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const resolved = new URL(href, baseHref).href;
          linkStrings.push(resolved);
          const text = (a.textContent || '').trim();
          const ariaLabel = (a.getAttribute('aria-label') || '').trim();
          const hasText = text.length > 0 || ariaLabel.length > 0;
          if (!hasText) {
            emptyAnchorCount++;
          }
          let isInternal = false;
          try {
            isInternal = Boolean(baseOrigin && new URL(resolved).origin === baseOrigin);
          } catch {}
          if (isInternal) {
            internalOutlinksCount++;
          } else {
            externalOutlinksCount++;
          }
          if (linksDetailed.length < 50) {
            linksDetailed.push({ href: resolved, text, isInternal });
          }
        } catch {
          // Ignore invalid URL
        }
      }
    });
    const links = Array.from(new Set(linkStrings));

    // Images
    const images: Array<{ src: string; alt: string }> = [];
    let missingAltCount = 0;
    let emptyAltCount = 0;
    const imgEls = Array.from(doc.querySelectorAll('img'));
    const imageCount = imgEls.length;

    imgEls.forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      const hasAlt = img.hasAttribute('alt');
      const rawAlt = img.getAttribute('alt');
      const alt = rawAlt ? rawAlt.trim() : '';

      if (!hasAlt) {
        missingAltCount++;
      } else if (alt === '') {
        emptyAltCount++;
      }

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
    doc.querySelectorAll('script').forEach((s) => {
      const content = s.textContent || '';
      const id = s.getAttribute('id') || '';
      if (content.includes('__NEXT_DATA__') || id === '__NEXT_DATA__') inlineMarkers.push('__NEXT_DATA__');
      if (content.includes('__framer__')) inlineMarkers.push('__framer__');
      if (content.includes('Shopify.theme') || content.includes('Shopify =') || content.includes('Shopify=')) inlineMarkers.push('Shopify.theme');
      if (content.includes('window.dataLayer') || content.includes('dataLayer')) inlineMarkers.push('window.dataLayer');
      if (content.includes('wp.apiFetch') || content.includes('wp =') || content.includes('wp.')) inlineMarkers.push('wp.apiFetch');
    });

    // HTML Comments
    const htmlComments: string[] = [];
    const commentRegex = /<!--([\s\S]*?)-->/g;
    let cmMatch: RegExpExecArray | null;
    while ((cmMatch = commentRegex.exec(html)) !== null) {
      if (cmMatch[0]) htmlComments.push(cmMatch[0]);
    }

    // Link rels
    const linkRels: Array<{ rel: string; href: string }> = [];
    doc.querySelectorAll('link[href]').forEach((l) => {
      const rel = l.getAttribute('rel') || '';
      const href = l.getAttribute('href') || '';
      if (href) linkRels.push({ rel, href });
    });

    // HTML Attributes
    const htmlAttributes: Record<string, string> = {};
    if (doc.documentElement) {
      for (let i = 0; i < doc.documentElement.attributes.length; i++) {
        const attr = doc.documentElement.attributes[i];
        if (attr) htmlAttributes[attr.name.toLowerCase()] = attr.value;
      }
    }
    doc.querySelectorAll('[data-wf-page], [data-wf-site], [data-framer-hydrate-v2], [ng-version]').forEach((el) => {
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        if (attr) htmlAttributes[attr.name.toLowerCase()] = attr.value;
      }
    });

    // Asset URLs (deduplicated)
    const assetUrlSet = new Set<string>();
    images.forEach((img) => { if (img.src) assetUrlSet.add(img.src); });
    scriptSources.forEach((s) => assetUrlSet.add(s));
    stylesheetHrefs.forEach((s) => assetUrlSet.add(s));
    linkRels.forEach((l) => assetUrlSet.add(l.href));
    doc.querySelectorAll('video[src], audio[src], source[src], iframe[src]').forEach((el) => {
      const src = el.getAttribute('src');
      if (src) {
        try {
          assetUrlSet.add(new URL(src, baseHref).href);
        } catch {
          assetUrlSet.add(src);
        }
      }
    });
    const assetUrls = Array.from(assetUrlSet);
    const contentResult = extractMainContent(html, pageUrl);

    return {
      title,
      metaDescription,
      canonicalUrl,
      canonicalHrefs,
      canonicalCount,
      metaRobots,
      htmlLang,
      headings,
      headingCounts,
      h1RawCount,
      h1HasContent,
      links,
      linksDetailed,
      internalOutlinksCount,
      externalOutlinksCount,
      emptyAnchorCount,
      images,
      imageCount,
      missingAltCount,
      emptyAltCount,
      metaGenerators,
      scriptSources,
      stylesheetHrefs,
      domMarkers,
      bodyClasses,
      inlineMarkers,
      assetUrls,
      htmlAttributes,
      linkRels,
      htmlComments,
      normalizedMainTextHash: contentResult.normalizedMainTextHash,
      mainTextWordCount: contentResult.wordCount,
      mainTextSimhash: contentResult.mainTextSimhash,
      contentQualityStatus: contentResult.contentQualityStatus,
      extractionSource: contentResult.extractionSource,
      extractionVersion: contentResult.extractionVersion,
      mainTextExcerpt: contentResult.mainTextExcerpt,
      isContentTruncated: contentResult.isTruncated,
      isExcerptTruncated: contentResult.isExcerptTruncated,
      isSourceContentTruncated: contentResult.isSourceContentTruncated,
      processingLimitReached: contentResult.processingLimitReached,
    };
  }

  private static fallbackParse(html: string, pageUrl: string): ParsedHtmlEvidence {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    const canonicalHrefs: string[] = [];
    const linkRegex = /<link\b([^>]+)>/gi;
    let linkM: RegExpExecArray | null;
    while ((linkM = linkRegex.exec(html)) !== null) {
      const attrs = linkM[1] || '';
      const relM = attrs.match(/rel=["']([^"']*)["']/i);
      if (relM && relM[1] && /\bcanonical\b/i.test(relM[1])) {
        const hrefM = attrs.match(/href=["']([^"']*)["']/i);
        if (hrefM && hrefM[1] !== undefined) {
          canonicalHrefs.push(hrefM[1].trim());
        }
      }
    }
    const canonicalCount = canonicalHrefs.length;
    const canonicalUrl = canonicalHrefs[0] || undefined;
    const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']robots["']/i);

    // HTML Lang
    let htmlLang: string | null | undefined = undefined;
    const htmlTagForLang = html.match(/<html\s+([^>]+)>/i);
    if (htmlTagForLang && htmlTagForLang[1]) {
      const langAttr = htmlTagForLang[1].match(/lang=["']([^"']*)["']/i);
      if (langAttr) {
        htmlLang = langAttr[1];
      } else {
        htmlLang = null;
      }
    } else if (/<html\b/i.test(html)) {
      htmlLang = null;
    }

    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
    const h3Match = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
    const h4Match = html.match(/<h4[^>]*>([\s\S]*?)<\/h4>/gi) || [];
    const h5Match = html.match(/<h5[^>]*>([\s\S]*?)<\/h5>/gi) || [];
    const h6Match = html.match(/<h6[^>]*>([\s\S]*?)<\/h6>/gi) || [];

    const h1RawCount = h1Match.length;
    const h1Texts = h1Match.map((h) => h.replace(/<[^>]+>/g, '').trim());
    const h1HasContent = h1Texts.some((t) => t.length > 0);

    const headings = {
      h1: h1Texts.filter(Boolean),
      h2: h2Match.map((h) => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean),
      h3: h3Match.map((h) => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean),
      h4: h4Match.map((h) => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean),
      h5: h5Match.map((h) => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean),
      h6: h6Match.map((h) => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean),
    };

    const headingCounts = {
      h1: h1RawCount,
      h2: h2Match.length,
      h3: h3Match.length,
      h4: h4Match.length,
      h5: h5Match.length,
      h6: h6Match.length,
    };

    // Links
    let baseOrigin = '';
    try {
      baseOrigin = new URL(pageUrl).origin;
    } catch {}

    const linkStrings: string[] = [];
    const linksDetailed: Array<{ href: string; text: string; isInternal: boolean }> = [];
    let internalOutlinksCount = 0;
    let externalOutlinksCount = 0;
    let emptyAnchorCount = 0;

    const linkMatches = html.matchAll(/<a\s+([^>]+)>([\s\S]*?)<\/a>/gi);
    for (const m of linkMatches) {
      const attrs = m[1] || '';
      const innerHtml = m[2] || '';
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
      const ariaMatch = attrs.match(/aria-label=["']([^"']*)["']/i);
      const href = hrefMatch ? hrefMatch[1] : '';

      if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
        try {
          const resolved = new URL(href, pageUrl).href;
          linkStrings.push(resolved);
          const text = innerHtml.replace(/<[^>]+>/g, '').trim();
          const ariaLabel = ariaMatch?.[1] ? ariaMatch[1].trim() : '';
          const hasText = text.length > 0 || ariaLabel.length > 0;
          if (!hasText) {
            emptyAnchorCount++;
          }
          let isInternal = false;
          try {
            isInternal = Boolean(baseOrigin && new URL(resolved).origin === baseOrigin);
          } catch {}
          if (isInternal) {
            internalOutlinksCount++;
          } else {
            externalOutlinksCount++;
          }
          if (linksDetailed.length < 50) {
            linksDetailed.push({ href: resolved, text, isInternal });
          }
        } catch {}
      }
    }
    const links = Array.from(new Set(linkStrings));

    // Images
    const images: Array<{ src: string; alt: string }> = [];
    let missingAltCount = 0;
    let emptyAltCount = 0;
    const imgMatches = Array.from(html.matchAll(/<img\s+([^>]+)>/gi));
    const imageCount = imgMatches.length;

    for (const m of imgMatches) {
      const tagAttrs = m[1] || '';
      const srcMatch = tagAttrs.match(/src=["']([^"']+)["']/i);
      const hasAlt = /alt\s*=/i.test(tagAttrs);
      const altMatch = tagAttrs.match(/alt=["']([^"']*)["']/i);
      const alt = (altMatch && altMatch[1]) ? altMatch[1].trim() : '';

      if (!hasAlt) {
        missingAltCount++;
      } else if (alt === '') {
        emptyAltCount++;
      }

      if (srcMatch && srcMatch[1]) {
        const srcStr: string = srcMatch[1];
        try {
          images.push({ src: new URL(srcStr, pageUrl).href, alt });
        } catch {
          images.push({ src: srcStr, alt });
        }
      }
    }

    // Meta Generators
    const metaGenerators: string[] = [];
    const genMatches = html.matchAll(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi);
    for (const m of genMatches) {
      if (m[1]) metaGenerators.push(m[1].trim());
    }
    const genMatchesAlt = html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/gi);
    for (const m of genMatchesAlt) {
      if (m[1] && !metaGenerators.includes(m[1].trim())) metaGenerators.push(m[1].trim());
    }

    // Script Sources
    const scriptSources: string[] = [];
    const scriptMatches = html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    for (const m of scriptMatches) {
      if (m[1]) scriptSources.push(m[1]);
    }

    // Stylesheet Hrefs
    const stylesheetHrefs: string[] = [];
    const linkTagMatches = html.matchAll(/<link[^>]+>/gi);
    for (const m of linkTagMatches) {
      const tag = m[0];
      if (/rel=["']stylesheet["']/i.test(tag)) {
        const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) stylesheetHrefs.push(hrefMatch[1]);
      }
    }

    // DOM Markers
    const domMarkers: string[] = [];
    if (/id=["']__next["']/i.test(html)) domMarkers.push('id:__next');
    if (/id=["']___gatsby["']/i.test(html)) domMarkers.push('id:___gatsby');
    if (/data-framer-hydrate-v2/i.test(html)) domMarkers.push('data-framer-hydrate-v2');
    if (/data-wf-site/i.test(html)) domMarkers.push('data-wf-site');
    if (/ng-version/i.test(html)) domMarkers.push('ng-version');
    if (/<astro-island/i.test(html)) domMarkers.push('astro-island');
    if (/class=["'][^"']*elementor[^"']*["']/i.test(html)) domMarkers.push('elementor');

    // Body Classes
    const bodyClassMatch = html.match(/<body[^>]+class=["']([^"']+)["']/i);
    const bodyClasses = (bodyClassMatch && bodyClassMatch[1]) ? bodyClassMatch[1].split(/\s+/).filter(Boolean) : [];

    // Inline Markers
    const inlineMarkers: string[] = [];
    if (html.includes('__NEXT_DATA__')) inlineMarkers.push('__NEXT_DATA__');
    if (html.includes('__framer__')) inlineMarkers.push('__framer__');
    if (html.includes('Shopify.theme')) inlineMarkers.push('Shopify.theme');
    if (html.includes('window.dataLayer')) inlineMarkers.push('window.dataLayer');
    if (html.includes('wp.apiFetch')) inlineMarkers.push('wp.apiFetch');

    // HTML Comments
    const htmlComments: string[] = [];
    const commentMatches = html.matchAll(/<!--([\s\S]*?)-->/gi);
    for (const cm of commentMatches) {
      if (cm[0]) htmlComments.push(cm[0]);
    }

    // Link Rels
    const linkRels: Array<{ rel: string; href: string }> = [];
    for (const m of linkTagMatches) {
      const tag = m[0];
      const relMatch = tag.match(/rel=["']([^"']+)["']/i);
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        const relStr = (relMatch && relMatch[1]) ? relMatch[1] : '';
        const hrefStr = hrefMatch[1] as string;
        linkRels.push({ rel: relStr, href: hrefStr });
      }
    }

    // HTML Attributes
    const htmlAttributes: Record<string, string> = {};
    const htmlTagMatch = html.match(/<html\s+([^>]+)>/i);
    if (htmlTagMatch && htmlTagMatch[1]) {
      const attrMatches = htmlTagMatch[1].matchAll(/([a-zA-Z0-9_\-]+)=["']([^"']*)["']/g);
      for (const am of attrMatches) {
        if (am[1]) htmlAttributes[am[1].toLowerCase()] = am[2] || '';
      }
    }
    const dataWfMatches = html.matchAll(/(data-wf-[a-zA-Z0-9_\-]+)=["']([^"']*)["']/gi);
    for (const dm of dataWfMatches) {
      if (dm[1]) htmlAttributes[dm[1].toLowerCase()] = dm[2] || '';
    }

    // Asset URLs (deduplicated)
    const assetUrlSet = new Set<string>();
    images.forEach((img) => { if (img.src) assetUrlSet.add(img.src); });
    scriptSources.forEach((s) => assetUrlSet.add(s));
    stylesheetHrefs.forEach((s) => assetUrlSet.add(s));
    linkRels.forEach((l) => assetUrlSet.add(l.href));
    const assetUrls = Array.from(assetUrlSet);
    const contentResult = extractMainContent(html, pageUrl);

    return {
      title: titleMatch && titleMatch[1] ? titleMatch[1].trim() : undefined,
      metaDescription: metaDescMatch && metaDescMatch[1] ? metaDescMatch[1].trim() : undefined,
      canonicalUrl,
      canonicalHrefs,
      canonicalCount,
      metaRobots: robotsMatch && robotsMatch[1] ? robotsMatch[1].trim() : undefined,
      htmlLang,
      headings,
      headingCounts,
      h1RawCount,
      h1HasContent,
      links,
      linksDetailed,
      internalOutlinksCount,
      externalOutlinksCount,
      emptyAnchorCount,
      images,
      imageCount,
      missingAltCount,
      emptyAltCount,
      metaGenerators,
      scriptSources,
      stylesheetHrefs,
      domMarkers,
      bodyClasses,
      inlineMarkers,
      assetUrls,
      htmlAttributes,
      linkRels,
      htmlComments,
      normalizedMainTextHash: contentResult.normalizedMainTextHash,
      mainTextWordCount: contentResult.wordCount,
      mainTextSimhash: contentResult.mainTextSimhash,
      contentQualityStatus: contentResult.contentQualityStatus,
      extractionSource: contentResult.extractionSource,
      extractionVersion: contentResult.extractionVersion,
      mainTextExcerpt: contentResult.mainTextExcerpt,
      isContentTruncated: contentResult.isTruncated,
      isExcerptTruncated: contentResult.isExcerptTruncated,
      isSourceContentTruncated: contentResult.isSourceContentTruncated,
      processingLimitReached: contentResult.processingLimitReached,
    };
  }
}
