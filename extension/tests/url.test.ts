import { describe, it, expect } from 'vitest';
import { isAuditableUrl, classifyLink, normalizeUrl, extractHostname } from '../utils/url';

describe('URL Safety & Validation Utilities', () => {
  describe('isAuditableUrl', () => {
    it('allows standard http and https URLs', () => {
      expect(isAuditableUrl('http://example.com').isAuditable).toBe(true);
      expect(isAuditableUrl('https://my-site.org/page?query=1').isAuditable).toBe(true);
    });

    it('blocks chrome:// internal URLs', () => {
      const result = isAuditableUrl('chrome://extensions');
      expect(result.isAuditable).toBe(false);
      expect(result.reason).toContain('chrome://');
    });

    it('blocks chrome-extension:// URLs', () => {
      const result = isAuditableUrl('chrome-extension://abcdefghijklmnop/popup.html');
      expect(result.isAuditable).toBe(false);
      expect(result.reason).toContain('chrome-extension://');
    });

    it('blocks edge:// and brave:// browser pages', () => {
      expect(isAuditableUrl('edge://settings').isAuditable).toBe(false);
      expect(isAuditableUrl('brave://settings').isAuditable).toBe(false);
    });

    it('blocks about:blank and view-source: URLs', () => {
      expect(isAuditableUrl('about:blank').isAuditable).toBe(false);
      expect(isAuditableUrl('view-source:https://example.com').isAuditable).toBe(false);
    });

    it('blocks empty or invalid strings', () => {
      expect(isAuditableUrl('').isAuditable).toBe(false);
      expect(isAuditableUrl(undefined).isAuditable).toBe(false);
      expect(isAuditableUrl('not-a-url').isAuditable).toBe(false);
    });
  });

  describe('extractHostname', () => {
    it('correctly extracts hostname from valid URLs', () => {
      expect(extractHostname('https://audit.example.com/path')).toBe('audit.example.com');
      expect(extractHostname('http://localhost:8000/health')).toBe('localhost');
    });

    it('returns empty string for invalid URLs', () => {
      expect(extractHostname('invalid-url')).toBe('');
      expect(extractHostname(undefined)).toBe('');
    });
  });

  describe('classifyLink', () => {
    const base = 'https://example.com/about';

    it('classifies same-host links as internal', () => {
      const result = classifyLink('https://example.com/pricing', base);
      expect(result.isHttp).toBe(true);
      expect(result.isInternal).toBe(true);
      expect(result.resolvedUrl).toBe('https://example.com/pricing');
    });

    it('classifies relative links as internal', () => {
      const rel = classifyLink('/contact', base);
      expect(rel.isHttp).toBe(true);
      expect(rel.isInternal).toBe(true);
      expect(rel.resolvedUrl).toBe('https://example.com/contact');

      const hash = classifyLink('#section', base);
      expect(hash.isInternal).toBe(true);
    });

    it('classifies cross-domain links as external', () => {
      const ext = classifyLink('https://google.com/search', base);
      expect(ext.isHttp).toBe(true);
      expect(ext.isInternal).toBe(false);
      expect(ext.resolvedUrl).toBe('https://google.com/search');
    });

    it('classifies subdomains as external by default hostname rule', () => {
      const sub = classifyLink('https://blog.example.com/post', base);
      expect(sub.isHttp).toBe(true);
      expect(sub.isInternal).toBe(false);

      // With includeSubdomains option
      const subAllowed = classifyLink('https://blog.example.com/post', base, { includeSubdomains: true });
      expect(subAllowed.isInternal).toBe(true);
    });

    it('handles non-http schemes (mailto, tel, javascript) gracefully', () => {
      const mailto = classifyLink('mailto:user@example.com', base);
      expect(mailto.isHttp).toBe(false);
      expect(mailto.isInternal).toBe(false);

      const tel = classifyLink('tel:+1234567890', base);
      expect(tel.isHttp).toBe(false);

      const js = classifyLink('javascript:void(0)', base);
      expect(js.isHttp).toBe(false);
    });

    it('handles empty or malformed hrefs safely', () => {
      const empty = classifyLink('', base);
      expect(empty.isHttp).toBe(false);

      const malformed = classifyLink('http://[invalid', base);
      expect(malformed.isHttp).toBe(false);
    });
  });

  describe('normalizeUrl', () => {
    it('normalizes valid URLs', () => {
      expect(normalizeUrl('https://example.com:443/test/../test/')).toBe('https://example.com/test/');
    });

    it('returns null on invalid URLs', () => {
      expect(normalizeUrl('nonsense')).toBeNull();
    });
  });
});
