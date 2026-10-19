/**
 * Canonical SEO Rule Identity, Registry Mapping, and Migration Engine.
 * 
 * Maps legacy standalone IDs to the authoritative 51-rule canonical manifest.
 * Preserves historical findings while ensuring new audit evaluations emit canonical rule IDs.
 */

import type { StandaloneSeoFinding } from '../types';
import canonicalRulesJson from './canonical_seo_rules.json';

export interface CanonicalRuleDefinition {
  rule_id: string;
  title: string;
  scoring_family: 'on_page' | 'technical' | 'sitewide';
  display_category: string;
  severity: string;
  is_sitewide: boolean;
  description?: string;
  version?: string;
  doc?: string;
}

export interface LegacyRuleMappingEntry {
  legacyId: string;
  canonicalRuleIds: string[];
  actualImplementedBehavior: string;
  evidenceRequirements: string[];
  behavioralDifferences: string;
  verifiedImplementationStatus: 'implemented_split' | 'implemented_direct' | 'unmapped';
}

/**
 * Authoritative 51-rule manifest derived directly from canonical_seo_rules.json.
 * Single source of machine-readable truth.
 */
export const CANONICAL_RULES_MANIFEST: readonly CanonicalRuleDefinition[] =
  canonicalRulesJson as unknown as CanonicalRuleDefinition[];

export const CANONICAL_RULE_BY_ID = new Map<string, CanonicalRuleDefinition>(
  CANONICAL_RULES_MANIFEST.map((r) => [r.rule_id, r])
);

export const CANONICAL_51_RULES = {
  on_page: CANONICAL_RULES_MANIFEST.filter((r) => r.scoring_family === 'on_page').map((r) => r.rule_id),
  technical: CANONICAL_RULES_MANIFEST.filter((r) => r.scoring_family === 'technical').map((r) => r.rule_id),
  sitewide: CANONICAL_RULES_MANIFEST.filter((r) => r.scoring_family === 'sitewide').map((r) => r.rule_id),
} as const;

export const ALL_CANONICAL_RULE_IDS = new Set<string>(
  CANONICAL_RULES_MANIFEST.map((r) => r.rule_id)
);

export const ALL_CANONICAL_51_RULES: readonly string[] = CANONICAL_RULES_MANIFEST.map((r) => r.rule_id);

/**
 * 33 Canonical Rules verified and actively implemented in Standalone client rules engine:
 * - 16 On-Page (100% complete coverage)
 * - 15 Technical (15/22 coverage)
 * - 2 Sitewide (2/13 coverage)
 */
export const CANONICAL_IMPLEMENTED_RULES = new Set<string>([
  // On-Page (16/16 - 100% coverage)
  'ONPAGE_TITLE_PRESENT',
  'ONPAGE_TITLE_LENGTH',
  'ONPAGE_TITLE_REPETITIVE',
  'ONPAGE_META_DESC_PRESENT',
  'ONPAGE_META_DESC_LENGTH',
  'ONPAGE_H1_PRESENCE',
  'ONPAGE_H1_MULTIPLE',
  'ONPAGE_H1_EMPTY',
  'ONPAGE_HEADING_HIERARCHY',
  'ONPAGE_CANONICAL_PRESENCE',
  'ONPAGE_CANONICAL_VALID',
  'ONPAGE_IMAGE_ALT_MISSING',
  'ONPAGE_IMAGE_ALT_EMPTY',
  'ONPAGE_INTERNAL_OUTLINKS',
  'ONPAGE_EMPTY_ANCHOR_TEXT',
  'ONPAGE_HTML_LANG',
  // Technical (15/22 coverage)
  'TECH_HTTP_4XX',
  'TECH_HTTP_5XX',
  'TECH_HTTP_429',
  'TECH_HTTP_UNSUPPORTED_CONTENT',
  'TECH_META_ROBOTS_DIRECTIVES',
  'TECH_X_ROBOTS_TAG',
  'TECH_HTTPS_USAGE',
  // Phase 2B Checkpoint 1 Newly Implemented Technical Rules:
  'TECH_ROBOTS_FETCH_STATUS',
  'TECH_ROBOTS_DISALLOW',
  'TECH_ROBOTS_SITEMAP_DECLARATION',
  'TECH_SITEMAP_AVAILABILITY',
  'TECH_SITEMAP_PARSE_ERROR',
  'TECH_SITEMAP_URL_STATUS',
  'TECH_SITEMAP_NOINDEX_CONFLICT',
  'TECH_SITEMAP_CANONICAL_CONFLICT',
  // Sitewide (2/13)
  'SITE_TITLE_DUPLICATE',
  'SITE_NO_OBSERVED_INTERNAL_INLINKS',
]);

/**
 * Explicit mapping between legacy standalone IDs and canonical rule manifest IDs.
 */
export const LEGACY_TO_CANONICAL_RULE_MAP: Record<string, LegacyRuleMappingEntry> = {
  TECH_HTTP_STATUS: {
    legacyId: 'TECH_HTTP_STATUS',
    canonicalRuleIds: ['TECH_HTTP_4XX', 'TECH_HTTP_5XX'],
    actualImplementedBehavior: 'Evaluates HTTP response status; detects client errors (4xx) and server errors (5xx).',
    evidenceRequirements: ['page.httpStatus'],
    behavioralDifferences: 'Legacy emitted a single composite finding; canonical splits into 4xx client errors and 5xx server errors.',
    verifiedImplementationStatus: 'implemented_split',
  },
  ONPAGE_TITLE_TAG: {
    legacyId: 'ONPAGE_TITLE_TAG',
    canonicalRuleIds: ['ONPAGE_TITLE_PRESENT', 'ONPAGE_TITLE_LENGTH'],
    actualImplementedBehavior: 'Evaluates presence of <title> tag and verifies length between 30 and 60 characters.',
    evidenceRequirements: ['page.title'],
    behavioralDifferences: 'Legacy emitted single ID for missing or out-of-range title; canonical splits into existence check and length bounds check.',
    verifiedImplementationStatus: 'implemented_split',
  },
  ONPAGE_META_DESC: {
    legacyId: 'ONPAGE_META_DESC',
    canonicalRuleIds: ['ONPAGE_META_DESC_PRESENT', 'ONPAGE_META_DESC_LENGTH'],
    actualImplementedBehavior: 'Evaluates presence of meta description tag and verifies length between 70 and 160 characters.',
    evidenceRequirements: ['page.metaDescription'],
    behavioralDifferences: 'Legacy emitted single ID for missing or out-of-range description; canonical splits into existence check and length check.',
    verifiedImplementationStatus: 'implemented_split',
  },
  ONPAGE_H1_PRIMARY: {
    legacyId: 'ONPAGE_H1_PRIMARY',
    canonicalRuleIds: ['ONPAGE_H1_PRESENCE', 'ONPAGE_H1_MULTIPLE'],
    actualImplementedBehavior: 'Evaluates <h1> heading count; flags pages with 0 or >1 <h1> elements.',
    evidenceRequirements: ['page.headings.h1'],
    behavioralDifferences: 'Legacy emitted single ID for zero or multiple H1s; canonical splits into absence check (critical/high) and multiple check (warning).',
    verifiedImplementationStatus: 'implemented_split',
  },
  ONPAGE_CANONICAL: {
    legacyId: 'ONPAGE_CANONICAL',
    canonicalRuleIds: ['ONPAGE_CANONICAL_PRESENCE', 'ONPAGE_CANONICAL_VALID'],
    actualImplementedBehavior: 'Evaluates presence of rel="canonical" tag and checks URL validity.',
    evidenceRequirements: ['page.canonicalUrl'],
    behavioralDifferences: 'Legacy checked presence only; canonical splits presence from syntactic/target validity.',
    verifiedImplementationStatus: 'implemented_split',
  },
  ONPAGE_IMAGES: {
    legacyId: 'ONPAGE_IMAGES',
    canonicalRuleIds: ['ONPAGE_IMAGE_ALT_MISSING'],
    actualImplementedBehavior: 'Finds <img> elements lacking an alt attribute or having whitespace-only alt.',
    evidenceRequirements: ['page.images'],
    behavioralDifferences: 'Direct semantic alignment with canonical ONPAGE_IMAGE_ALT_MISSING.',
    verifiedImplementationStatus: 'implemented_direct',
  },
  TECH_HTTPS_SECURITY: {
    legacyId: 'TECH_HTTPS_SECURITY',
    canonicalRuleIds: ['TECH_HTTPS_USAGE'],
    actualImplementedBehavior: 'Verifies page URL protocol is HTTPS, permitting loopback localhost for local dev fixtures.',
    evidenceRequirements: ['page.url'],
    behavioralDifferences: 'Direct semantic alignment with canonical TECH_HTTPS_USAGE with local fixture exemption.',
    verifiedImplementationStatus: 'implemented_direct',
  },
  SITE_DUPLICATE_TITLES: {
    legacyId: 'SITE_DUPLICATE_TITLES',
    canonicalRuleIds: ['SITE_TITLE_DUPLICATE'],
    actualImplementedBehavior: 'Analyzes all crawled pages to detect identical normalized title tags.',
    evidenceRequirements: ['pages.map(p => p.title)'],
    behavioralDifferences: 'Direct semantic alignment with canonical SITE_TITLE_DUPLICATE.',
    verifiedImplementationStatus: 'implemented_direct',
  },
  SITE_ORPHAN_PAGES: {
    legacyId: 'SITE_ORPHAN_PAGES',
    canonicalRuleIds: ['SITE_NO_OBSERVED_INTERNAL_INLINKS'],
    actualImplementedBehavior: 'Identifies crawled pages having 0 internal inlinks, excluding seed page.',
    evidenceRequirements: ['pages.map(p => p.links)'],
    behavioralDifferences: 'Direct semantic alignment with canonical SITE_NO_OBSERVED_INTERNAL_INLINKS.',
    verifiedImplementationStatus: 'implemented_direct',
  },
};

export function isCanonicalRuleId(ruleId: string): boolean {
  return ALL_CANONICAL_RULE_IDS.has(ruleId);
}

export function getCanonicalRulesForLegacyId(legacyId: string): string[] {
  const mapping = LEGACY_TO_CANONICAL_RULE_MAP[legacyId];
  return mapping ? [...mapping.canonicalRuleIds] : [legacyId];
}

export function getCanonicalRuleCategory(ruleId: string): 'on_page' | 'technical' | 'sitewide' | 'unknown' {
  const def = CANONICAL_RULE_BY_ID.get(ruleId);
  if (def) return def.scoring_family;
  return 'unknown';
}

/**
 * Validates the canonical registry integrity against runtime expectations.
 */
export function validateCanonicalRegistry(): {
  valid: boolean;
  isValid: boolean;
  errors: string[];
  totalCanonicalRules: number;
  implementedCount: number;
  familyCounts: {
    on_page: number;
    technical: number;
    sitewide: number;
  };
} {
  const errors: string[] = [];
  if (CANONICAL_RULES_MANIFEST.length !== 51) {
    errors.push(`Expected 51 canonical rules, found ${CANONICAL_RULES_MANIFEST.length}`);
  }
  const seen = new Set<string>();
  for (const r of CANONICAL_RULES_MANIFEST) {
    if (seen.has(r.rule_id)) {
      errors.push(`Duplicate canonical rule_id: ${r.rule_id}`);
    }
    seen.add(r.rule_id);
    if (!['on_page', 'technical', 'sitewide'].includes(r.scoring_family)) {
      errors.push(`Invalid scoring family for ${r.rule_id}: ${r.scoring_family}`);
    }
  }
  for (const implId of CANONICAL_IMPLEMENTED_RULES) {
    if (!seen.has(implId)) {
      errors.push(`Implemented rule ${implId} does not exist in authoritative canonical manifest`);
    }
  }
  const familyCounts = {
    on_page: CANONICAL_51_RULES.on_page.length,
    technical: CANONICAL_51_RULES.technical.length,
    sitewide: CANONICAL_51_RULES.sitewide.length,
  };
  return {
    valid: errors.length === 0,
    isValid: errors.length === 0,
    errors,
    totalCanonicalRules: CANONICAL_RULES_MANIFEST.length,
    implementedCount: CANONICAL_IMPLEMENTED_RULES.size,
    familyCounts,
  };
}

/**
 * Non-destructive migration adapter for historical findings that were stored with legacy rule IDs.
 * New audits generate canonical IDs natively.
 */
export function migrateLegacyFinding(finding: StandaloneSeoFinding): StandaloneSeoFinding[] {
  // If already canonical, return unchanged
  if (isCanonicalRuleId(finding.ruleId)) {
    return [finding];
  }

  const mapping = LEGACY_TO_CANONICAL_RULE_MAP[finding.ruleId];
  if (!mapping) {
    // Unmapped legacy rule: retain finding as-is with original rule ID to preserve historical audit data
    return [finding];
  }

  const titleLower = (finding.title || '').toLowerCase();
  const descLower = (finding.description || '').toLowerCase();

  switch (finding.ruleId) {
    case 'TECH_HTTP_STATUS': {
      const status = Number(finding.evidence?.httpStatus || 0);
      const canonicalRuleId = status >= 500 ? 'TECH_HTTP_5XX' : 'TECH_HTTP_4XX';
      return [
        {
          ...finding,
          ruleId: canonicalRuleId,
          category: 'technical',
        },
      ];
    }

    case 'ONPAGE_TITLE_TAG': {
      if (titleLower.includes('missing') || descLower.includes('missing')) {
        return [{ ...finding, ruleId: 'ONPAGE_TITLE_PRESENT', category: 'on_page' }];
      }
      return [{ ...finding, ruleId: 'ONPAGE_TITLE_LENGTH', category: 'on_page' }];
    }

    case 'ONPAGE_META_DESC': {
      if (titleLower.includes('missing') || descLower.includes('missing')) {
        return [{ ...finding, ruleId: 'ONPAGE_META_DESC_PRESENT', category: 'on_page' }];
      }
      return [{ ...finding, ruleId: 'ONPAGE_META_DESC_LENGTH', category: 'on_page' }];
    }

    case 'ONPAGE_H1_PRIMARY': {
      if (titleLower.includes('multiple') || descLower.includes('multiple')) {
        return [{ ...finding, ruleId: 'ONPAGE_H1_MULTIPLE', category: 'on_page' }];
      }
      return [{ ...finding, ruleId: 'ONPAGE_H1_PRESENCE', category: 'on_page' }];
    }

    case 'ONPAGE_CANONICAL': {
      if (titleLower.includes('invalid') || descLower.includes('invalid')) {
        return [{ ...finding, ruleId: 'ONPAGE_CANONICAL_VALID', category: 'on_page' }];
      }
      return [{ ...finding, ruleId: 'ONPAGE_CANONICAL_PRESENCE', category: 'on_page' }];
    }

    case 'ONPAGE_IMAGES':
      return [{ ...finding, ruleId: 'ONPAGE_IMAGE_ALT_MISSING', category: 'on_page' }];

    case 'TECH_HTTPS_SECURITY':
      return [{ ...finding, ruleId: 'TECH_HTTPS_USAGE', category: 'technical' }];

    case 'SITE_DUPLICATE_TITLES':
      return [{ ...finding, ruleId: 'SITE_TITLE_DUPLICATE', category: 'sitewide' }];

    case 'SITE_ORPHAN_PAGES':
      return [{ ...finding, ruleId: 'SITE_NO_OBSERVED_INTERNAL_INLINKS', category: 'sitewide' }];

    default:
      return [finding];
  }
}
