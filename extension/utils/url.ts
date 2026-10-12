/**
 * URL parsing, validation, and domain classification utilities
 */

export interface ParsedLinkInfo {
  isValid: boolean;
  normalizedHref: string;
  resolvedUrl: string;
  isHttp: boolean;
  protocol: string;
  isInternal: boolean;
  hostname: string;
}

/**
 * Checks whether a tab URL is auditable.
 * Chrome internal pages, extension pages, and local system URLs cannot be inspected.
 */
export function isAuditableUrl(rawUrl?: string): { isAuditable: boolean; auditable: boolean; reason?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isAuditable: false, auditable: false, reason: 'No URL available for active tab.' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isAuditable: false, auditable: false, reason: 'Empty URL.' };
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol === 'chrome:' || protocol === 'chrome-extension:' || protocol === 'edge:' || protocol === 'about:' || protocol === 'view-source:') {
      return {
        isAuditable: false,
        auditable: false,
        reason: `Restricted browser page (${protocol}//). Extension cannot inspect browser system pages.`
      };
    }

    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        isAuditable: false,
        auditable: false,
        reason: `Unsupported URL protocol (${protocol}). Only HTTP and HTTPS pages are supported.`
      };
    }

    return { isAuditable: true, auditable: true };
  } catch {
    return { isAuditable: false, auditable: false, reason: 'Malformed or unparseable URL.' };
  }
}

/**
 * Safely extracts hostname from a URL string.
 */
export function extractHostname(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    return new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Safely normalizes a URL.
 */
export function normalizeUrl(rawUrl?: string): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    return new URL(rawUrl.trim()).href;
  } catch {
    return null;
  }
}

/**
 * Normalizes and classifies hyperlinks relative to the current page origin.
 *
 * Subdomain classification rule:
 * - By default (strict hostname consistency), a link is classified as INTERNAL if its hostname
 *   matches the base hostname exactly (e.g. example.com == example.com).
 * - Subdomains (e.g., blog.example.com when visiting example.com) are classified as EXTERNAL
 *   under strict hostname matching.
 * - If includeSubdomains is set to true, subdomains are treated as internal.
 * - Cross-domain hostnames are always classified as EXTERNAL.
 * - Non-HTTP schemes (mailto:, tel:, javascript:) are classified as non-HTTP other.
 */
export function classifyLink(
  rawHref: string,
  baseLocationHref: string,
  options: { includeSubdomains?: boolean } = {}
): ParsedLinkInfo {
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
      } else if (options.includeSubdomains && linkHostname.endsWith(`.${baseHostname}`)) {
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
