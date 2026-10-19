/**
 * Offscreen Document Script for Manifest V3 DOM Parsing.
 * Runs in a secure isolated DOM environment with native DOMParser support.
 * Ensures zero arbitrary site scripts execute while extracting bounded evidence.
 */

import { StandaloneDomParser } from '../../standalone/audit/domParserEngine';
import { StandaloneSitemapParser } from '../../standalone/crawler/sitemapParser';

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    if (message && (message.type === 'PARSE_HTML_OFFSCREEN' || message.action === 'PARSE_HTML_OFFSCREEN')) {
      const { html, pageUrl } = message.payload || {};
      try {
        const evidence = StandaloneDomParser.parse(html || '', pageUrl || '');
        sendResponse({ success: true, type: 'PARSE_HTML_RESULT', evidence });
      } catch (err: any) {
        sendResponse({ success: false, type: 'PARSE_HTML_RESULT', error: err?.message || 'DOM parsing failed' });
      }
      return false; // Synchronous response
    }

    if (message && (message.type === 'PARSE_XML_OFFSCREEN' || message.action === 'PARSE_XML_OFFSCREEN')) {
      const { xml, sitemapUrl } = message.payload || {};
      try {
        const parser = new StandaloneSitemapParser();
        const result = parser.parseXml(xml || '', sitemapUrl || '');
        sendResponse({ success: true, type: 'PARSE_XML_RESULT', result });
      } catch (err: any) {
        sendResponse({ success: false, type: 'PARSE_XML_RESULT', error: err?.message || 'XML parsing failed' });
      }
      return false;
    }
  });
}
