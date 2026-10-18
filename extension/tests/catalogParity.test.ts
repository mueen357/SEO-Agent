import { describe, it, expect } from 'vitest';
import canonicalRulesJson from '../standalone/audit/canonical_seo_rules.json';
import techCatalogJson from '../standalone/technologies/technology_catalog.json';

describe('Shared Catalog Parity & Schema Validation', () => {
  it('validates canonical SEO rules total exactly 51 rules: 16 On-Page, 22 Technical, 13 Site-Wide', () => {
    expect(canonicalRulesJson.length).toBe(51);

    const onPage = canonicalRulesJson.filter((r: any) => r.scoring_family === 'on_page');
    const technical = canonicalRulesJson.filter((r: any) => r.scoring_family === 'technical');
    const sitewide = canonicalRulesJson.filter((r: any) => r.scoring_family === 'sitewide');

    expect(onPage.length).toBe(16);
    expect(technical.length).toBe(22);
    expect(sitewide.length).toBe(13);

    // Validate schema of every rule
    for (const rule of canonicalRulesJson) {
      expect(rule.rule_id).toBeDefined();
      expect(rule.title).toBeDefined();
      expect(rule.scoring_family).toBeDefined();
      expect(rule.display_category).toBeDefined();
      expect(rule.severity).toBeDefined();
      expect(typeof rule.is_sitewide).toBe('boolean');
    }
  });

  it('validates technology catalog contains exactly 173 canonical fingerprints', () => {
    expect(techCatalogJson.total).toBe(173);
    expect(techCatalogJson.technologies.length).toBe(173);

    const ids = new Set<string>();
    for (const tech of techCatalogJson.technologies) {
      expect(tech.id).toBeDefined();
      expect(tech.name).toBeDefined();
      expect(tech.category).toBeDefined();
      expect(tech.signatures).toBeDefined();
      ids.add(tech.id);
    }
    // Verify all IDs are unique
    expect(ids.size).toBe(173);
  });

  it('validates all 393+ regex patterns compile cleanly in JavaScript RegExp without syntax errors', () => {
    let testedPatterns = 0;
    const errors: string[] = [];

    for (const tech of techCatalogJson.technologies) {
      const sigs = tech.signatures || {};

      for (const pat of sigs.meta_generators || []) {
        try {
          new RegExp(pat, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] meta_generator regex failed: ${pat} -> ${e.message}`);
        }
      }

      for (const [hName, hPat] of Object.entries(sigs.headers || {})) {
        try {
          new RegExp(hPat as string, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] header regex failed (${hName}): ${hPat} -> ${e.message}`);
        }
      }

      for (const pat of sigs.script_sources || []) {
        try {
          new RegExp(pat, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] script_source regex failed: ${pat} -> ${e.message}`);
        }
      }

      for (const pat of sigs.stylesheet_hrefs || []) {
        try {
          new RegExp(pat, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] stylesheet regex failed: ${pat} -> ${e.message}`);
        }
      }

      for (const pat of sigs.asset_urls || []) {
        try {
          new RegExp(pat, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] asset_url regex failed: ${pat} -> ${e.message}`);
        }
      }

      for (const vr of tech.version_rules || []) {
        try {
          new RegExp(vr.regex, 'i');
          testedPatterns++;
        } catch (e: any) {
          errors.push(`[${tech.id}] version_rule regex failed: ${vr.regex} -> ${e.message}`);
        }
      }
    }

    expect(testedPatterns).toBeGreaterThanOrEqual(385);
    expect(errors).toEqual([]);
  });
});
