/**
 * Universal Client-Side Technology Fingerprint Matching Engine.
 * 
 * Evaluates the full 173-technology catalog in-browser without external network calls,
 * APIs, or Python runtime. Pre-compiles signatures, validates regex patterns,
 * extracts versions, enforces defensive asset thresholds, and resolves technology implications.
 * 
 * Implements multi-signal confidence calibration, weak asset isolation (e.g. Framer embed on WordPress),
 * structured DOM marker matching, and corroboration rules.
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
  htmlAttributes: Record<string, RegExp>;
  linkRels: RegExp[];
  cookies: RegExp[];
  minAssets: number;
  requiresCorroboration: boolean;
  excludedDomains: string[];
  versionRules: Array<{
    source_type: string;
    regex: RegExp;
    version_type: string;
  }>;
}

interface MatchedSignal {
  type:
    | 'meta_generator'
    | 'header'
    | 'dom_marker'
    | 'html_attribute'
    | 'html_comment'
    | 'inline_marker'
    | 'script_source'
    | 'stylesheet_href'
    | 'asset_url'
    | 'link_rel'
    | 'cookie';
  strength: 'strong' | 'moderate' | 'weak';
  summary: string;
  version?: string | null;
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
        } catch {}
      }

      // 2. Headers
      const headersMap: Record<string, RegExp> = {};
      for (const [hName, hPat] of Object.entries(sigs.headers || {})) {
        try {
          headersMap[hName.toLowerCase()] = new RegExp(hPat, 'i');
        } catch {}
      }

      // 3. Script sources
      const scriptSources: RegExp[] = [];
      for (const pat of sigs.script_sources || []) {
        try {
          scriptSources.push(new RegExp(pat, 'i'));
        } catch {}
      }

      // 4. Stylesheet hrefs
      const stylesheetHrefs: RegExp[] = [];
      for (const pat of sigs.stylesheet_hrefs || []) {
        try {
          stylesheetHrefs.push(new RegExp(pat, 'i'));
        } catch {}
      }

      // 5. Asset URLs
      const assetUrls: RegExp[] = [];
      for (const pat of sigs.asset_urls || []) {
        try {
          assetUrls.push(new RegExp(pat, 'i'));
        } catch {}
      }

      // 6. HTML Attributes
      const htmlAttributes: Record<string, RegExp> = {};
      for (const [aName, aPat] of Object.entries(sigs.html_attributes || {})) {
        try {
          htmlAttributes[aName.toLowerCase()] = new RegExp(aPat, 'i');
        } catch {}
      }

      // 7. Link Rels
      const linkRels: RegExp[] = [];
      for (const pat of sigs.link_rels || []) {
        try {
          linkRels.push(new RegExp(pat, 'i'));
        } catch {}
      }

      // 8. Cookies
      const cookies: RegExp[] = [];
      for (const pat of sigs.cookies || []) {
        try {
          cookies.push(new RegExp(pat, 'i'));
        } catch {}
      }

      // 9. Version extraction rules
      const versionRules: Array<{ source_type: string; regex: RegExp; version_type: string }> = [];
      for (const vr of tech.version_rules || []) {
        try {
          versionRules.push({
            source_type: vr.source_type,
            regex: new RegExp(vr.regex, 'i'),
            version_type: vr.version_type,
          });
        } catch {}
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
          htmlAttributes,
          linkRels,
          cookies,
          minAssets: sigs.min_assets_for_detection ?? 1,
          requiresCorroboration: sigs.requires_corroboration ?? false,
          excludedDomains: sigs.excluded_domains || [],
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

  public static getCatalogVersion(): string {
    return (catalogJson as any).catalog_version || '2.0.0';
  }

  public static getEngineVersion(): string {
    return (catalogJson as any).engine_version || '2.0.0';
  }

  /**
   * Structured DOM marker matching to avoid false positives from loose substring checks.
   */
  private static matchDomMarker(
    marker: string,
    evidence: Partial<ParsedHtmlEvidence>
  ): boolean {
    const normMarker = marker.trim();

    // 1. Exact match in observed DOM markers
    if (evidence.domMarkers && evidence.domMarkers.includes(normMarker)) {
      return true;
    }

    // 2. id selector (e.g. "id:__next")
    if (normMarker.startsWith('id:')) {
      const id = normMarker.slice(3);
      return evidence.domMarkers?.includes(`id:${id}`) || false;
    }

    // 3. class selector (e.g. "class:wp-embed-responsive")
    if (normMarker.startsWith('class:')) {
      const cls = normMarker.slice(6);
      return (
        evidence.domMarkers?.includes(normMarker) ||
        evidence.bodyClasses?.includes(cls) ||
        false
      );
    }

    // 4. attribute selector e.g. "html[data-wf-site]", "[data-wf-site]", or "data-wf-site"
    if (normMarker.includes('[') && normMarker.endsWith(']')) {
      const openIdx = normMarker.indexOf('[');
      const closeIdx = normMarker.lastIndexOf(']');
      const inside = normMarker.slice(openIdx + 1, closeIdx);
      const attrName = inside.split(/[=*~|^$]/)[0]?.toLowerCase().trim();
      if (attrName) {
        if (evidence.htmlAttributes && attrName in evidence.htmlAttributes) return true;
        if (evidence.domMarkers?.includes(attrName) || evidence.domMarkers?.includes(`[${attrName}]`)) return true;
      }
    } else if (normMarker.startsWith('data-') || normMarker.startsWith('ng-')) {
      if (evidence.htmlAttributes && normMarker in evidence.htmlAttributes) return true;
      if (evidence.domMarkers?.includes(normMarker)) return true;
    }

    // 5. custom tag e.g. "astro-island"
    if (evidence.domMarkers?.includes(normMarker)) {
      return true;
    }

    return false;
  }

  public static evaluate(
    evidence: Partial<ParsedHtmlEvidence>,
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

    // Extract cookie names safely from set-cookie headers (values are strictly ignored for security)
    const observedCookieNames = new Set<string>();
    if (evidence.cookieNames) {
      for (const cn of evidence.cookieNames) observedCookieNames.add(cn.toLowerCase());
    }
    const setCookieHeader = loweredHeaders['set-cookie'];
    if (setCookieHeader) {
      const rawCookies = setCookieHeader.split(/[,;\n]/);
      for (const rc of rawCookies) {
        const eqIdx = rc.indexOf('=');
        if (eqIdx > 0) {
          const cName = rc.slice(0, eqIdx).trim().toLowerCase();
          if (cName) observedCookieNames.add(cName);
        }
      }
    }

    for (const [techId, { tech, compiled }] of this.compiledCatalog.entries()) {
      const matchedSignals: MatchedSignal[] = [];
      let extractedVersion: string | null = null;

      // 1. Meta generators (Strong signal: explicit declaration)
      if (compiled.metaGenerators.length > 0 && evidence.metaGenerators) {
        for (const gen of evidence.metaGenerators) {
          for (const rx of compiled.metaGenerators) {
            if (rx.test(gen)) {
              matchedSignals.push({
                type: 'meta_generator',
                strength: 'strong',
                summary: `Declared in meta generator tag: "${gen}"`,
              });

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
          if (matchedSignals.some((s) => s.type === 'meta_generator')) break;
        }
      }

      // 2. HTTP Response Headers (Strong signal: direct server response)
      if (Object.keys(compiled.headers).length > 0) {
        for (const [hName, rx] of Object.entries(compiled.headers)) {
          const headerVal = loweredHeaders[hName];
          if (headerVal && rx.test(headerVal)) {
            matchedSignals.push({
              type: 'header',
              strength: 'strong',
              summary: `Disclosed in HTTP response header "${hName}: ${headerVal}"`,
            });

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

      // 3. HTML Attributes (Moderate signal: structured markup)
      if (Object.keys(compiled.htmlAttributes).length > 0 && evidence.htmlAttributes) {
        for (const [attrName, rx] of Object.entries(compiled.htmlAttributes)) {
          const attrVal = evidence.htmlAttributes[attrName];
          if (attrVal !== undefined && rx.test(attrVal)) {
            matchedSignals.push({
              type: 'html_attribute',
              strength: 'moderate',
              summary: `Matched structured HTML attribute [${attrName}="${attrVal.slice(0, 30)}"]`,
            });
            break;
          }
        }
      }

      // 4. HTML Comments (Moderate signal: embedded build/optimization signatures)
      if (compiled.htmlComments.length > 0 && evidence.htmlComments) {
        for (const comment of evidence.htmlComments) {
          for (const sig of compiled.htmlComments) {
            if (comment.includes(sig)) {
              matchedSignals.push({
                type: 'html_comment',
                strength: 'moderate',
                summary: `Matched HTML comment signature: "${sig.slice(0, 40)}"`,
              });
              break;
            }
          }
          if (matchedSignals.some((s) => s.type === 'html_comment')) break;
        }
      }

      // 5. DOM Markers (Moderate signal: structured DOM elements)
      if (compiled.domMarkers.length > 0 && evidence.domMarkers) {
        for (const marker of compiled.domMarkers) {
          if (this.matchDomMarker(marker, evidence)) {
            matchedSignals.push({
              type: 'dom_marker',
              strength: 'moderate',
              summary: `Identified DOM signature marker: "${marker}"`,
            });
            break;
          }
        }
      }

      // 6. Inline JavaScript Runtime Tokens (Moderate signal: runtime tokens)
      if (compiled.inlineMarkers.length > 0 && evidence.inlineMarkers) {
        for (const marker of compiled.inlineMarkers) {
          if (evidence.inlineMarkers.includes(marker)) {
            matchedSignals.push({
              type: 'inline_marker',
              strength: 'moderate',
              summary: `Identified runtime JavaScript token: "${marker}"`,
            });
            break;
          }
        }
      }

      // 7. Body Classes (Moderate signal: CMS/theme body classes)
      if (compiled.bodyClasses.length > 0 && evidence.bodyClasses) {
        for (const bc of evidence.bodyClasses) {
          if (compiled.bodyClasses.some((sig) => bc === sig || bc.startsWith(sig))) {
            matchedSignals.push({
              type: 'body_classes' as any,
              strength: 'moderate',
              summary: `Matched body class: "${bc}"`,
            });
            break;
          }
        }
      }

      // 8. Script Sources (Moderate signal: bundles and framework scripts)
      if (compiled.scriptSources.length > 0 && evidence.scriptSources) {
        const matchingScripts = new Set<string>();
        for (const src of evidence.scriptSources) {
          for (const rx of compiled.scriptSources) {
            if (rx.test(src)) {
              matchingScripts.add(src);
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

        if (matchingScripts.size > 0) {
          const hasOtherSignals = matchedSignals.length > 0;
          if (matchingScripts.size >= compiled.minAssets || hasOtherSignals) {
            const firstScript = Array.from(matchingScripts)[0] || '';
            matchedSignals.push({
              type: 'script_source',
              strength: 'moderate',
              summary: `Referenced script resource: "${firstScript.slice(0, 60)}" (${matchingScripts.size} matching)`,
            });
          }
        }
      }

      // 9. Stylesheet Hrefs (Moderate signal)
      if (compiled.stylesheetHrefs.length > 0 && evidence.stylesheetHrefs) {
        const matchingStyles = new Set<string>();
        for (const href of evidence.stylesheetHrefs) {
          for (const rx of compiled.stylesheetHrefs) {
            if (rx.test(href)) {
              matchingStyles.add(href);
              break;
            }
          }
        }

        if (matchingStyles.size > 0) {
          const hasOtherSignals = matchedSignals.length > 0;
          if (matchingStyles.size >= compiled.minAssets || hasOtherSignals) {
            const firstStyle = Array.from(matchingStyles)[0] || '';
            matchedSignals.push({
              type: 'stylesheet_href',
              strength: 'moderate',
              summary: `Referenced stylesheet: "${firstStyle.slice(0, 60)}" (${matchingStyles.size} matching)`,
            });
          }
        }
      }

      // 10. Link Rels (Weak signal: preconnect/dns-prefetch)
      if (compiled.linkRels.length > 0 && evidence.linkRels) {
        for (const lr of evidence.linkRels) {
          for (const rx of compiled.linkRels) {
            if (rx.test(lr.href)) {
              matchedSignals.push({
                type: 'link_rel',
                strength: 'weak',
                summary: `Referenced link relation [rel="${lr.rel}"]: "${lr.href.slice(0, 50)}"`,
              });
              break;
            }
          }
          if (matchedSignals.some((s) => s.type === 'link_rel')) break;
        }
      }

      // 11. Asset URLs (Weak signal: third-party images/fonts/assets)
      // Deduplicate asset URLs: do NOT count duplicate asset URLs as independent evidence!
      if (compiled.assetUrls.length > 0 && evidence.assetUrls) {
        const matchingAssetUrls = new Set<string>();
        for (const aUrl of evidence.assetUrls) {
          for (const rx of compiled.assetUrls) {
            if (rx.test(aUrl)) {
              matchingAssetUrls.add(aUrl);
              break;
            }
          }
        }

        if (matchingAssetUrls.size > 0) {
          const hasOtherSignals = matchedSignals.length > 0;
          if (matchingAssetUrls.size >= compiled.minAssets || hasOtherSignals) {
            const firstAsset = Array.from(matchingAssetUrls)[0] || '';
            matchedSignals.push({
              type: 'asset_url',
              strength: 'weak',
              summary: `Loaded asset resource: "${firstAsset.slice(0, 60)}" (${matchingAssetUrls.size} distinct URLs)`,
            });
          }
        }
      }

      // 12. Cookies (Weak signal: session/tracking cookie names)
      if (compiled.cookies.length > 0 && observedCookieNames.size > 0) {
        for (const cName of observedCookieNames) {
          for (const rx of compiled.cookies) {
            if (rx.test(cName)) {
              matchedSignals.push({
                type: 'cookie',
                strength: 'weak',
                summary: `Observed session cookie name: "${cName}" (values strictly unread)`,
              });
              break;
            }
          }
          if (matchedSignals.some((s) => s.type === 'cookie')) break;
        }
      }

      // Corroboration & Threshold Check
      if (matchedSignals.length === 0) continue;

      const hasStrong = matchedSignals.some((s) => s.strength === 'strong');
      const hasModerate = matchedSignals.some((s) => s.strength === 'moderate');
      const onlyWeak = matchedSignals.every((s) => s.strength === 'weak');

      // If corroboration is required, single weak signals or uncorroborated moderate signals are insufficient
      if (compiled.requiresCorroboration) {
        const distinctSignalTypes = new Set(matchedSignals.map((s) => s.type)).size;
        if (!hasStrong && distinctSignalTypes < 2) {
          continue; // Rejected: corroboration required but not met
        }
      }

      // Confidence & Provenance Calculation
      let confidence = tech.confidence_weight ?? 0.95;
      let provenance: StandaloneTechFinding['provenance'] = (tech.default_provenance || 'first_party') as any;

      if (onlyWeak) {
        // Weak asset-only signal (e.g. single embedded Framer asset or font link)
        confidence = 0.40;
        provenance = 'third_party_embed';
      } else if (hasStrong || matchedSignals.length >= 2) {
        // Strong explicit declaration or multiple corroborated signals
        confidence = tech.confidence_weight ?? 0.95;
      } else {
        // Single moderate signal without corroboration
        confidence = Math.min(confidence, 0.75);
      }

      let status: StandaloneTechFinding['status'] =
        confidence >= 0.95 ? 'confirmed' : confidence >= 0.70 ? 'detected' : 'possible';

      const primarySignal = matchedSignals[0];
      const summaryText = matchedSignals.map((s) => s.summary).join('; ');

      detectedMap.set(tech.id, {
        id: `${auditId}-${tech.id}`,
        auditId,
        technologyId: tech.id,
        name: tech.name,
        category: tech.category,
        confidence,
        status,
        provenance,
        evidenceSummary: summaryText,
        version: extractedVersion || undefined,
        versionOrNull: extractedVersion || null,
      });
    }

    // False-Positive Protection: Primary CMS vs Weak Embed (e.g. Framer asset on WordPress)
    const confirmedCms = Array.from(detectedMap.values()).find(
      (t) => t.category === 'cms' && t.confidence >= 0.90 && t.provenance === 'first_party'
    );

    if (confirmedCms) {
      for (const [techId, finding] of detectedMap.entries()) {
        if (
          finding.category === 'cms' &&
          techId !== confirmedCms.technologyId &&
          finding.provenance === 'third_party_embed'
        ) {
          // Downgrade weak third-party asset match when a full primary CMS is confirmed
          finding.confidence = 0.35;
          finding.status = 'possible';
          finding.evidenceSummary = `Third-party embedded asset only on ${confirmedCms.name} site; ${finding.evidenceSummary}`;
        }
      }
    }

    // Technology Implications Resolution (e.g., WordPress implies PHP, Next.js implies React)
    for (const [techId, finding] of Array.from(detectedMap.entries())) {
      // Do not infer dependencies from weak, possible, third-party embeds, or already-inferred dependencies
      if (
        finding.confidence < 0.70 ||
        finding.status === 'possible' ||
        finding.provenance === 'third_party_embed' ||
        finding.provenance === 'inferred_dependency'
      ) {
        continue;
      }

      const entry = this.compiledCatalog.get(techId);
      if (!entry) continue;

      const isParentConfirmed = finding.confidence >= 0.90 && finding.status === 'confirmed';

      for (const impliedId of entry.tech.implies || []) {
        if (!this.compiledCatalog.has(impliedId)) continue;
        const impliedTech = this.compiledCatalog.get(impliedId)!.tech;

        const existing = detectedMap.get(impliedId);
        // Direct evidence for the child always takes precedence over inference
        if (existing && existing.provenance !== 'inferred_dependency') {
          continue;
        }

        const inferredConfidence = isParentConfirmed ? 0.60 : 0.40;
        const inferredStatus = isParentConfirmed ? 'inferred' : 'possible';
        const parentConfidencePct = Math.round(finding.confidence * 100);
        const explanation = isParentConfirmed
          ? `Inferred architectural dependency from confirmed ${finding.name} (observed parent confidence: ${parentConfidencePct}%)`
          : `Tentative architectural dependency inferred from detected ${finding.name} (observed parent confidence: ${parentConfidencePct}%)`;

        if (!existing) {
          detectedMap.set(impliedId, {
            id: `${auditId}-${impliedId}`,
            auditId,
            technologyId: impliedId,
            name: impliedTech.name,
            category: impliedTech.category,
            confidence: inferredConfidence,
            status: inferredStatus,
            provenance: 'inferred_dependency',
            evidenceSummary: explanation,
            version: undefined,
            versionOrNull: null,
          });
        } else if (existing.provenance === 'inferred_dependency' && isParentConfirmed && existing.confidence < 0.60) {
          // Upgrade tentative inference to confirmed parent inference
          existing.confidence = 0.60;
          existing.status = 'inferred';
          existing.evidenceSummary = explanation;
        }
      }
    }

    return Array.from(detectedMap.values());
  }
}
