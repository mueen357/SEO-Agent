/**
 * Universal Client-Side Technology Fingerprint Matching Engine.
 * 
 * Evaluates the full 173-technology catalog in-browser without external network calls,
 * APIs, or Python runtime. Pre-compiles signatures, validates regex patterns,
 * extracts versions, enforces defensive asset thresholds, and resolves technology implications.
 */

import type { StandaloneTechFinding } from '../types';
import type { ParsedHtmlEvidence } from '../audit/domParserEngine';
import catalogJson from './technology_catalog.json';

export interface CatalogFingerprintSignatures {
  meta_generators?: string[];
  headers?: Record<string, string>;
  cookies?: string[];
  script_sources?: string[];
  stylesheet_hrefs?: string[];
  dom_markers?: string[];
  inline_markers?: string[];
  html_comments?: string[];
  asset_urls?: string[];
  html_attributes?: Record<string, string>;
  body_classes?: string[];
  link_rels?: string[];
  min_assets_for_detection?: number;
  requires_corroboration?: boolean;
  excluded_domains?: string[];
}

export interface CatalogVersionExtractionRule {
  source_type: string;
  regex: string;
  version_type: string;
}

export interface CatalogTechnology {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  vendor_or_type: string;
  website: string;
  description: string;
  implies: string[];
  confidence_weight: number;
  default_provenance: string;
  signatures: CatalogFingerprintSignatures;
  version_rules: CatalogVersionExtractionRule[];
  known_false_positives: string[];
  limitations: string;
}

export interface CatalogData {
  catalog_version: string;
  engine_version: string;
  total: number;
  technologies: CatalogTechnology[];
}

interface CompiledSignatures {
  metaGenerators: RegExp[];
  headers: Record<string, RegExp>;
  scriptSources: RegExp[];
  stylesheetHrefs: RegExp[];
  assetUrls: RegExp[];
  htmlComments: string[];
  domMarkers: string[];
  inlineMarkers: string[];
  bodyClasses: string[];
  versionRules: Array<{
    source_type: string;
    regex: RegExp;
    version_type: string;
  }>;
}

export class UniversalTechEngine {
  private static compiledCatalog = new Map<string, { tech: CatalogTechnology; compiled: CompiledSignatures }>();
  private static isInitialized = false;

  public static initialize(customCatalog?: CatalogData): void {
    const data = customCatalog || (catalogJson as unknown as CatalogData);
    this.compiledCatalog.clear();

    for (const tech of data.technologies) {
      const sigs = tech.signatures || {};

      // 1. Meta generators
      const metaGenerators: RegExp[] = [];
      for (const pat of sigs.meta_generators || []) {
        try {
          metaGenerators.push(new RegExp(pat, 'i'));
        } catch (e) {
          // Safe error handling for incompatible regexes
        }
      }

      // 2. Headers
      const headersMap: Record<string, RegExp> = {};
      for (const [hName, hPat] of Object.entries(sigs.headers || {})) {
        try {
          headersMap[hName.toLowerCase()] = new RegExp(hPat, 'i');
        } catch (e) {}
      }

      // 3. Script sources
      const scriptSources: RegExp[] = [];
      for (const pat of sigs.script_sources || []) {
        try {
          scriptSources.push(new RegExp(pat, 'i'));
        } catch (e) {}
      }

      // 4. Stylesheet hrefs
      const stylesheetHrefs: RegExp[] = [];
      for (const pat of sigs.stylesheet_hrefs || []) {
        try {
          stylesheetHrefs.push(new RegExp(pat, 'i'));
        } catch (e) {}
      }

      // 5. Asset URLs
      const assetUrls: RegExp[] = [];
      for (const pat of sigs.asset_urls || []) {
        try {
          assetUrls.push(new RegExp(pat, 'i'));
        } catch (e) {}
      }

      // 6. Version extraction rules
      const versionRules: Array<{ source_type: string; regex: RegExp; version_type: string }> = [];
      for (const vr of tech.version_rules || []) {
        try {
          versionRules.push({
            source_type: vr.source_type,
            regex: new RegExp(vr.regex, 'i'),
            version_type: vr.version_type,
          });
        } catch (e) {}
      }

      this.compiledCatalog.set(tech.id, {
        tech,
        compiled: {
          metaGenerators,
          headers: headersMap,
          scriptSources,
          stylesheetHrefs,
          assetUrls,
          htmlComments: sigs.html_comments || [],
          domMarkers: sigs.dom_markers || [],
          inlineMarkers: sigs.inline_markers || [],
          bodyClasses: sigs.body_classes || [],
          versionRules,
        },
      });
    }

    this.isInitialized = true;
  }

  public static getCatalogSize(): number {
    if (!this.isInitialized) this.initialize();
    return this.compiledCatalog.size;
  }

  public static evaluate(
    evidence: ParsedHtmlEvidence,
    headers: Record<string, string>,
    auditId: string
  ): StandaloneTechFinding[] {
    if (!this.isInitialized) {
      this.initialize();
    }

    const detectedMap = new Map<string, StandaloneTechFinding>();
    const loweredHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      loweredHeaders[k.toLowerCase()] = v;
    }

    for (const [techId, { tech, compiled }] of this.compiledCatalog.entries()) {
      let matched = false;
      let summary = '';
      let extractedVersion: string | null = null;
      let assetMatchesCount = 0;

      // 1. Meta generators (highest confidence explicit declaration)
      if (compiled.metaGenerators.length > 0 && evidence.metaGenerators) {
        for (const gen of evidence.metaGenerators) {
          for (const rx of compiled.metaGenerators) {
            if (rx.test(gen)) {
              matched = true;
              summary = `Declared in meta generator tag: "${gen}"`;

              // Check version rule
              for (const vr of compiled.versionRules) {
                if (vr.source_type === 'meta_generator') {
                  const m = gen.match(vr.regex);
                  if (m && m[1]) {
                    extractedVersion = m[1];
                    break;
                  }
                }
              }
              if (!extractedVersion) {
                const genericMatch = gen.match(/\b(\d+(?:\.\d+)+)\b/);
                if (genericMatch && genericMatch[1]) extractedVersion = genericMatch[1];
              }
              break;
            }
          }
          if (matched) break;
        }
      }

      // 2. HTTP Response Headers
      if (!matched && Object.keys(compiled.headers).length > 0) {
        for (const [hName, rx] of Object.entries(compiled.headers)) {
          const headerVal = loweredHeaders[hName];
          if (headerVal && rx.test(headerVal)) {
            matched = true;
            summary = `Disclosed in HTTP response header "${hName}: ${headerVal}"`;

            for (const vr of compiled.versionRules) {
              if (vr.source_type === 'header') {
                const m = headerVal.match(vr.regex);
                if (m && m[1]) {
                  extractedVersion = m[1];
                  break;
                }
              }
            }
            if (!extractedVersion) {
              const genericMatch = headerVal.match(/\b(\d+(?:\.\d+)+)\b/);
              if (genericMatch && genericMatch[1]) extractedVersion = genericMatch[1];
            }
            break;
          }
        }
      }

      // 3. Script sources (with asset threshold check)
      if (!matched && compiled.scriptSources.length > 0 && evidence.scriptSources) {
        for (const src of evidence.scriptSources) {
          for (const rx of compiled.scriptSources) {
            if (rx.test(src)) {
              assetMatchesCount++;
              if (!matched) {
                summary = `Referenced script resource: "${src.slice(0, 60)}"`;
              }
              // Version check
              if (!extractedVersion) {
                for (const vr of compiled.versionRules) {
                  if (vr.source_type === 'script_url') {
                    const m = src.match(vr.regex);
                    if (m && m[1]) {
                      extractedVersion = m[1];
                      break;
                    }
                  }
                }
              }
              break;
            }
          }
        }
        const minAssets = tech.signatures.min_assets_for_detection ?? 1;
        if (assetMatchesCount >= minAssets) {
          matched = true;
        }
      }

      // 4. Stylesheet hrefs (with asset threshold check)
      if (!matched && compiled.stylesheetHrefs.length > 0 && evidence.stylesheetHrefs) {
        let styleMatchesCount = 0;
        let firstStyleSummary = '';
        for (const href of evidence.stylesheetHrefs) {
          for (const rx of compiled.stylesheetHrefs) {
            if (rx.test(href)) {
              styleMatchesCount++;
              if (!firstStyleSummary) {
                firstStyleSummary = `Referenced stylesheet: "${href.slice(0, 60)}"`;
              }
              break;
            }
          }
        }
        const minAssets = tech.signatures.min_assets_for_detection ?? 1;
        if (styleMatchesCount >= minAssets) {
          matched = true;
          summary = firstStyleSummary;
        }
      }

      // 5. DOM Markers
      if (!matched && compiled.domMarkers.length > 0 && evidence.domMarkers) {
        for (const marker of compiled.domMarkers) {
          const hasMarker =
            evidence.domMarkers.includes(marker) ||
            evidence.domMarkers.some(
              (evm) =>
                marker.includes(evm) ||
                evm.includes(marker) ||
                (marker.includes('[') && marker.includes(evm.replace(/^[a-z]+:/i, '')))
            );
          if (hasMarker) {
            matched = true;
            summary = `Identified DOM signature marker: "${marker}"`;
            break;
          }
        }
      }

      // 6. Inline Markers
      if (!matched && compiled.inlineMarkers.length > 0 && evidence.inlineMarkers) {
        for (const marker of compiled.inlineMarkers) {
          if (evidence.inlineMarkers.includes(marker)) {
            matched = true;
            summary = `Identified runtime JavaScript token: "${marker}"`;
            break;
          }
        }
      }

      if (matched) {
        const confidence = tech.confidence_weight ?? 0.95;
        const status =
          confidence >= 0.95 ? 'confirmed' : confidence >= 0.75 ? 'detected' : 'possible';
        const provenance = (tech.default_provenance || 'first_party') as any;

        detectedMap.set(tech.id, {
          id: `${auditId}-${tech.id}`,
          auditId,
          technologyId: tech.id,
          name: tech.name,
          category: tech.category,
          confidence,
          status,
          provenance,
          evidenceSummary: summary,
          version: extractedVersion || undefined,
          versionOrNull: extractedVersion || null,
        });

        // 7. Resolve technology implications (e.g., wordpress implies php)
        for (const impliedId of tech.implies || []) {
          if (!detectedMap.has(impliedId) && this.compiledCatalog.has(impliedId)) {
            const impliedTech = this.compiledCatalog.get(impliedId)!.tech;
            detectedMap.set(impliedId, {
              id: `${auditId}-${impliedId}`,
              auditId,
              technologyId: impliedId,
              name: impliedTech.name,
              category: impliedTech.category,
              confidence: 0.85,
              status: 'inferred',
              provenance: 'inferred_dependency',
              evidenceSummary: `Inferred dependency of detected technology "${tech.name}"`,
              version: undefined,
              versionOrNull: null,
            });
          }
        }
      }
    }

    return Array.from(detectedMap.values());
  }
}
