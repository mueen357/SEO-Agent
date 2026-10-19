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

import { UniversalTechEngine } from '../technologies/universalTechEngine';

export class StandaloneTechDetector {
  public static detect(
    evidence: Partial<ParsedHtmlEvidence>,
    headers: Record<string, string>,
    auditId: string
  ): StandaloneTechFinding[] {
    return UniversalTechEngine.evaluate(evidence, headers, auditId);
  }
}

