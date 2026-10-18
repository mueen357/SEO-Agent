/**
 * Client-Side Universal Technology Stack Detection Engine.
 * Evaluates multi-vector fingerprints in-browser with zero backend calls.
 */

import type { StandaloneTechFinding } from '../types';
import type { ParsedHtmlEvidence } from './domParserEngine';

interface TechSignature {
  id: string;
  name: string;
  category: string;
  confidence: number;
  provenance: 'first_party' | 'third_party_embed' | 'asset_host' | 'inferred_dependency';
  metaGenerators?: RegExp[];
  scriptUrls?: RegExp[];
  stylesheetHrefs?: RegExp[];
  domMarkers?: string[];
  headers?: Record<string, RegExp>;
  inlineMarkers?: string[];
}

const SIGNATURES: TechSignature[] = [
  // CMS & Builders
  {
    id: 'wordpress',
    name: 'WordPress',
    category: 'cms',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/WordPress/i],
    scriptUrls: [/\/wp-includes\//i, /\/wp-content\//i],
    stylesheetHrefs: [/\/wp-content\//i],
    domMarkers: ['class:wp-embed-responsive'],
    inlineMarkers: ['wp.apiFetch'],
  },
  {
    id: 'framer',
    name: 'Framer',
    category: 'cms',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/Framer/i],
    scriptUrls: [/framerusercontent\.com/i],
    domMarkers: ['data-framer-hydrate-v2'],
    inlineMarkers: ['__framer__'],
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'cms',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/Shopify/i],
    scriptUrls: [/cdn\.shopify\.com/i],
    inlineMarkers: ['Shopify.theme'],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    category: 'cms',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/Webflow/i],
    scriptUrls: [/website-files\.com/i, /webflow\.js/i],
    domMarkers: ['data-wf-site'],
  },
  {
    id: 'wix',
    name: 'Wix',
    category: 'cms',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/Wix/i],
    scriptUrls: [/parastorage\.com/i, [/wix-thunderbolt/i] as any],
  },
  {
    id: 'elementor',
    name: 'Elementor',
    category: 'cms',
    confidence: 0.95,
    provenance: 'first_party',
    domMarkers: ['elementor'],
    scriptUrls: [/\/plugins\/elementor\//i],
    stylesheetHrefs: [/\/plugins\/elementor\//i],
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    category: 'cms',
    confidence: 0.95,
    provenance: 'first_party',
    metaGenerators: [/WooCommerce/i],
    scriptUrls: [/\/plugins\/woocommerce\//i],
    stylesheetHrefs: [/\/plugins\/woocommerce\//i],
  },

  // Frontend Frameworks
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'frontend',
    confidence: 1.0,
    provenance: 'first_party',
    scriptUrls: [/\/_next\/static\//i],
    domMarkers: ['id:__next'],
    inlineMarkers: ['__NEXT_DATA__'],
    headers: { 'x-powered-by': /Next\.js/i },
  },
  {
    id: 'react',
    name: 'React',
    category: 'frontend',
    confidence: 0.85,
    provenance: 'first_party',
    scriptUrls: [/react(\.production)?(\.min)?\.js/i, /react-dom/i],
    domMarkers: ['id:__next'],
  },
  {
    id: 'vue',
    name: 'Vue.js',
    category: 'frontend',
    confidence: 0.85,
    provenance: 'first_party',
    scriptUrls: [/vue(\.runtime)?(\.global)?(\.min)?\.js/i],
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'frontend',
    confidence: 1.0,
    provenance: 'first_party',
    scriptUrls: [/\/_nuxt\//i],
    inlineMarkers: ['__NUXT__'],
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'frontend',
    confidence: 1.0,
    provenance: 'first_party',
    metaGenerators: [/Astro/i],
    domMarkers: ['astro-island'],
  },
  {
    id: 'jquery',
    name: 'jQuery',
    category: 'frontend',
    confidence: 0.9,
    provenance: 'first_party',
    scriptUrls: [/jquery(\.min)?\.js/i],
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'frontend',
    confidence: 0.75,
    provenance: 'first_party',
    stylesheetHrefs: [/tailwind/i],
  },
  {
    id: 'bootstrap',
    name: 'Bootstrap',
    category: 'frontend',
    confidence: 0.85,
    provenance: 'first_party',
    scriptUrls: [/bootstrap(\.bundle)?(\.min)?\.js/i],
    stylesheetHrefs: [/bootstrap(\.min)?\.css/i],
  },

  // Hosting & CDN
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    category: 'hosting',
    confidence: 0.95,
    provenance: 'first_party',
    headers: { server: /cloudflare/i, 'cf-ray': /.+/i },
    scriptUrls: [/cloudflareinsights\.com/i],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'hosting',
    confidence: 0.95,
    provenance: 'first_party',
    headers: { server: /vercel/i, 'x-vercel-id': /.+/i },
  },
  {
    id: 'netlify',
    name: 'Netlify',
    category: 'hosting',
    confidence: 0.95,
    provenance: 'first_party',
    headers: { server: /netlify/i, 'x-nf-request-id': /.+/i },
  },
  {
    id: 'nginx',
    name: 'Nginx',
    category: 'backend',
    confidence: 0.9,
    provenance: 'first_party',
    headers: { server: /nginx/i },
  },
  {
    id: 'apache',
    name: 'Apache HTTP Server',
    category: 'backend',
    confidence: 0.9,
    provenance: 'first_party',
    headers: { server: /apache/i },
  },

  // Languages & Runtimes (Strictly evidence-based)
  {
    id: 'php',
    name: 'PHP',
    category: 'language',
    confidence: 0.9,
    provenance: 'first_party',
    headers: { 'x-powered-by': /PHP/i, 'set-cookie': /PHPSESSID/i },
  },

  // Analytics & Third-Party Services
  {
    id: 'google_analytics',
    name: 'Google Analytics (GA4)',
    category: 'analytics',
    confidence: 0.95,
    provenance: 'third_party_embed',
    scriptUrls: [/googletagmanager\.com\/gtag\/js/i, /google-analytics\.com\/analytics\.js/i],
  },
  {
    id: 'google_tag_manager',
    name: 'Google Tag Manager',
    category: 'analytics',
    confidence: 0.95,
    provenance: 'third_party_embed',
    scriptUrls: [/googletagmanager\.com\/gtm\.js/i],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payments',
    confidence: 0.95,
    provenance: 'third_party_embed',
    scriptUrls: [/js\.stripe\.com\/v/i],
  },
  {
    id: 'intercom',
    name: 'Intercom',
    category: 'ux',
    confidence: 0.95,
    provenance: 'third_party_embed',
    scriptUrls: [/widget\.intercom\.io/i],
    inlineMarkers: ['window.intercomSettings'],
  },
];

export class StandaloneTechDetector {
  public static detect(
    evidence: ParsedHtmlEvidence,
    headers: Record<string, string>,
    auditId: string
  ): StandaloneTechFinding[] {
    const findings: StandaloneTechFinding[] = [];
    const loweredHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      loweredHeaders[k.toLowerCase()] = v;
    }

    for (const sig of SIGNATURES) {
      let matched = false;
      let summary = '';
      let version: string | null = null;

      // 1. Meta generators
      if (sig.metaGenerators) {
        for (const gen of (evidence.metaGenerators || [])) {
          for (const rx of sig.metaGenerators) {
            if (rx.test(gen)) {
              matched = true;
              summary = `Declared in meta generator tag: "${gen}"`;
              const vMatch = gen.match(/\b(\d+(?:\.\d+)+)\b/);
              if (vMatch && vMatch[1]) version = vMatch[1];
              break;
            }
          }
          if (matched) break;
        }
      }

      // 2. Headers
      if (!matched && sig.headers) {
        for (const [hName, rx] of Object.entries(sig.headers)) {
          const val = loweredHeaders[hName.toLowerCase()];
          if (val && rx.test(val)) {
            matched = true;
            summary = `Disclosed in HTTP response header "${hName}: ${val}"`;
            const vMatch = val.match(/\b(\d+(?:\.\d+)+)\b/);
            if (vMatch && vMatch[1]) version = vMatch[1];
            break;
          }
        }
      }

      // 3. Script URLs
      if (!matched && sig.scriptUrls) {
        for (const src of (evidence.scriptSources || [])) {
          for (const rx of sig.scriptUrls) {
            if (rx && typeof rx.test === 'function' && rx.test(src)) {
              matched = true;
              summary = `Referenced script resource: "${src.slice(0, 60)}"`;
              const vMatch = src.match(/@(\d+(?:\.\d+)+)/) || src.match(/-(\d+(?:\.\d+)+)\.js/);
              if (vMatch && vMatch[1]) version = vMatch[1];
              break;
            }
          }
          if (matched) break;
        }
      }

      // 4. Stylesheets
      if (!matched && sig.stylesheetHrefs) {
        for (const href of (evidence.stylesheetHrefs || [])) {
          for (const rx of sig.stylesheetHrefs) {
            if (rx.test(href)) {
              matched = true;
              summary = `Referenced stylesheet: "${href.slice(0, 60)}"`;
              break;
            }
          }
          if (matched) break;
        }
      }

      // 5. DOM Markers
      if (!matched && sig.domMarkers) {
        for (const marker of sig.domMarkers) {
          if ((evidence.domMarkers || []).includes(marker)) {
            matched = true;
            summary = `Identified DOM signature marker: "${marker}"`;
            break;
          }
        }
      }

      // 6. Inline Markers
      if (!matched && sig.inlineMarkers) {
        for (const marker of sig.inlineMarkers) {
          if ((evidence.inlineMarkers || []).includes(marker)) {
            matched = true;
            summary = `Identified runtime JavaScript variable or object: "${marker}"`;
            break;
          }
        }
      }

      if (matched) {
        findings.push({
          id: `${auditId}-${sig.id}`,
          auditId,
          technologyId: sig.id,
          name: sig.name,
          category: sig.category,
          confidence: sig.confidence,
          status: sig.confidence >= 0.95 ? 'confirmed' : sig.confidence >= 0.7 ? 'detected' : 'inferred',
          provenance: sig.provenance,
          evidenceSummary: summary,
          version: version || undefined,
          versionOrNull: version || null,
        });
      }
    }

    return findings;
  }
}
