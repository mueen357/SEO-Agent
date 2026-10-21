import { describe, it, expect } from 'vitest';
import { InBrowserCrawler } from '../standalone/crawler/inBrowserCrawler';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import { StandaloneExporter } from '../standalone/export/exporter';

export function parseRfc4180Csv(text: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (ch === ',') {
        currentRecord.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (ch === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        currentRecord.push(currentField);
        records.push(currentRecord);
        currentRecord = [];
        currentField = '';
        i++;
        continue;
      } else if (ch === '\n') {
        currentRecord.push(currentField);
        records.push(currentRecord);
        currentRecord = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += ch;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    records.push(currentRecord);
  }

  return records;
}

export function toChromeMatchPattern(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch {
    return urlStr;
  }
}

describe('Phase 4D Release Hardening & Least-Privilege Verification', () => {
  describe('1. Least-Privilege Match Pattern & Port Isolation', () => {
    it('converts port-specific URLs to valid Chrome match patterns without ports', () => {
      expect(toChromeMatchPattern('http://127.0.0.1:4321/')).toBe('http://127.0.0.1/*');
      expect(toChromeMatchPattern('http://127.0.0.1:4321/page/5')).toBe('http://127.0.0.1/*');
      expect(toChromeMatchPattern('https://example.com/about')).toBe('https://example.com/*');
      expect(toChromeMatchPattern('http://localhost:8080/app')).toBe('http://localhost/*');
    });

    it('enforces strict application-level port scope in crawler', () => {
      const crawler = new InBrowserCrawler('http://127.0.0.1:4321/', { maxPages: 5 });

      // In-scope: same origin and same port
      expect(crawler.isInScope('http://127.0.0.1:4321/about')).toBe(true);
      expect(crawler.isInScope('http://127.0.0.1:4321/products/item')).toBe(true);

      // Out-of-scope: same host but different port (e.g. 8000 or 3000)
      expect(crawler.isInScope('http://127.0.0.1:8000/')).toBe(false);
      expect(crawler.isInScope('http://127.0.0.1:3000/admin')).toBe(false);

      // Out-of-scope: different host
      expect(crawler.isInScope('http://127.0.0.2:4321/')).toBe(false);
      expect(crawler.isInScope('https://example.com/')).toBe(false);

      // Out-of-scope: credentials in URL
      expect(crawler.isInScope('http://user:pass@127.0.0.1:4321/')).toBe(false);
    });

    it('rejects cloud metadata endpoints and unauthorized loopbacks', () => {
      const crawler = new InBrowserCrawler('https://example.com/', { maxPages: 5 });
      expect(crawler.isPrivateOrForbiddenHost('metadata.google.internal')).toBe(true);
      expect(crawler.isPrivateOrForbiddenHost('169.254.169.254')).toBe(true);
      expect(crawler.isPrivateOrForbiddenHost('127.0.0.1')).toBe(true);
      expect(crawler.isPrivateOrForbiddenHost('localhost')).toBe(true);
      expect(crawler.isPrivateOrForbiddenHost('192.168.1.1')).toBe(true);
      expect(crawler.isPrivateOrForbiddenHost('10.0.0.1')).toBe(true);
    });
  });

  describe('2. RFC 4180 CSV Parser Verification', () => {
    it('correctly handles quoted fields with embedded commas', () => {
      const raw = 'Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation\n' +
        '"PAGE","http://example.com/","200","200","Example Domain, Welcome!","Check canonical, title, and meta"';

      const parsed = parseRfc4180Csv(raw);
      expect(parsed.length).toBe(2);
      expect(parsed[1]?.[4]).toBe('Example Domain, Welcome!');
      expect(parsed[1]?.[5]).toBe('Check canonical, title, and meta');
    });

    it('correctly handles multiline fields with embedded newlines', () => {
      const raw = 'Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation\n' +
        '"FINDING","http://example.com/","title-length","high","Title too short:\nLine 2 details","Provide descriptive\nmultiline recommendation"';

      const parsed = parseRfc4180Csv(raw);
      expect(parsed.length).toBe(2);
      expect(parsed[1]?.[4]).toBe('Title too short:\nLine 2 details');
      expect(parsed[1]?.[5]).toBe('Provide descriptive\nmultiline recommendation');
    });

    it('correctly handles escaped double quotes ("")', () => {
      const raw = 'Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation\n' +
        '"FINDING","http://example.com/","meta-desc","warning","Found meta tag with ""custom"" value","Ensure valid quote"';

      const parsed = parseRfc4180Csv(raw);
      expect(parsed.length).toBe(2);
      expect(parsed[1]?.[4]).toBe('Found meta tag with "custom" value');
    });

    it('preserves Unicode and international characters without corruption', () => {
      const raw = 'Type,Page URL,Rule / Status,Severity / HTTP,Title / Evidence,Recommendation\n' +
        '"PAGE","http://example.com/ja/","200","200","ウェブサイト監査エージェント • 素晴らしい","日本語のタイトルとメタタグを確認してください"';

      const parsed = parseRfc4180Csv(raw);
      expect(parsed.length).toBe(2);
      expect(parsed[1]?.[4]).toBe('ウェブサイト監査エージェント • 素晴らしい');
      expect(parsed[1]?.[5]).toBe('日本語のタイトルとメタタグを確認してください');
    });
  });

  describe('3. Production Export Integrity & Sanitization', () => {
    it('StandaloneExporter produces valid CSV with RFC 4180 compliance', () => {
      const mockAudit = {
        id: 'test-audit-rfc4180',
        targetUrl: 'http://127.0.0.1:4321/',
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:4321',
        status: 'completed' as const,
        progressPercent: 100,
        currentStage: 'Completed',
        startedAt: Date.now() - 5000,
        updatedAt: Date.now(),
        config: { maxPages: 5 },
        discoveredUrls: [],
        pendingQueue: [],
        crawledUrls: ['http://127.0.0.1:4321/'],
        failedUrls: [],
        scorecard: {
          overallScore: 95,
          grade: 'A' as const,
          available: true,
          onPageScore: 90,
          technicalScore: 100,
          sitewideScore: 95,
          pagesCrawled: 1,
          usablePagesCount: 1,
          attemptedPagesCount: 1,
          failedPagesCount: 0,
          totalIssuesCount: 1,
          criticalIssuesCount: 0,
          highIssuesCount: 0,
          mediumIssuesCount: 1,
          lowIssuesCount: 0,
          coverage: {
            scoreState: 'substantial_coverage' as const,
            scoreStateLabel: 'Substantial',
            coverageRatio: 0.8,
            expectedRulesTotal: 51,
            implementedRulesCount: 51,
            executedRulesTotal: 40,
            applicableRulesCount: 40,
            missingRulesTotal: 11,
            passedRulesCount: 39,
            failedRulesCount: 1,
            warningRulesCount: 0,
            notApplicableRulesCount: 11,
            notEvaluatedRulesCount: 0,
            unavailableEvidenceCount: 0,
            passedChecksCount: 39,
            failedChecksCount: 1,
            warningChecksCount: 0,
            unknownCount: 0,
            familyCoverage: {
              on_page: { executed: 15, total: 20, ratio: 0.75 },
              technical: { executed: 15, total: 20, ratio: 0.75 },
              sitewide: { executed: 10, total: 11, ratio: 0.91 },
            },
            policyVersion: '2.0.0-standalone' as const,
          },
          calculatedAt: Date.now(),
        },
      };

      const mockPages = [
        {
          id: 'p1',
          auditId: 'test-audit-rfc4180',
          url: 'http://127.0.0.1:4321/',
          requestedUrl: 'http://127.0.0.1:4321/',
          finalUrl: 'http://127.0.0.1:4321/',
          depth: 0,
          httpStatus: 200,
          fetchStatus: 'success' as const,
          redirectCount: 0,
          redirectChain: [],
          redirectLoopDetected: false,
          canonicalHrefs: [],
          canonicalCount: 0,
          title: 'Home "Welcome", Alpha Corp',
          headings: { h1: ['Main Heading'], h2: [], h3: [] },
          links: [],
          images: [],
          headers: {},
          htmlSize: 1000,
          responseTimeMs: 25,
          fetchedAt: Date.now(),
          isInSitemap: true,
          contentTypeCategory: 'HTML_DOCUMENT' as const,
        },
      ];

      const mockFindings = [
        {
          id: 'f1',
          auditId: 'test-audit-rfc4180',
          ruleId: 'title-length',
          canonicalRuleId: 'TITLE_LENGTH_OPTIMAL',
          severity: 'medium' as const,
          status: 'fail' as const,
          category: 'on_page' as const,
          title: 'Title has quotes: "Welcome, user"',
          description: 'Title should be concise,\nclear and descriptive.',
          recommendation: 'Update title tag,\nensuring proper length.',
          targetUrl: 'http://127.0.0.1:4321/',
          pageUrl: 'http://127.0.0.1:4321/',
        },
      ];

      const csvString = StandaloneExporter.generateCsv(mockAudit, mockPages, mockFindings, []);
      const parsedRecords = parseRfc4180Csv(csvString);

      expect(parsedRecords.length).toBeGreaterThanOrEqual(3);
      expect(parsedRecords[0]).toEqual([
        'Type',
        'Page URL',
        'Rule / Status',
        'Severity / HTTP',
        'Title / Evidence',
        'Recommendation',
      ]);

      // Assert no unescaped tokens or secrets
      expect(csvString).not.toContain('Bearer ');
      expect(csvString).not.toContain('password');
      expect(csvString).not.toContain('secret');
    });
  });
});
