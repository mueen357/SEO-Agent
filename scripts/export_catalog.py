"""Deterministic export script for canonical SEO rules and technology fingerprints.

Exports:
- 51 Canonical SEO rules from RuleRegistry -> extension/standalone/audit/canonical_seo_rules.json
- 173 Technology fingerprints from TechnologyCatalog -> extension/standalone/technologies/technology_catalog.json
"""

import json
import os
import sys

# Ensure backend is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from app.audit_engine.registry import RuleRegistry
from app.scoring.rule_mapping import get_rule_scoring_family
from app.technology.fingerprints.catalog import _build_catalog

def export_seo_rules(output_path: str) -> int:
    reg = RuleRegistry()
    rules = []
    for r in reg.get_all_rules():
        doc = (r.__class__.__doc__ or '').strip()
        first_line = doc.split('\n')[0] if doc else ''
        sev = getattr(r, 'severity', 'medium')
        fam = get_rule_scoring_family(r.rule_id) or 'unknown'
        rules.append({
            'rule_id': r.rule_id,
            'title': getattr(r, 'title', r.rule_id),
            'scoring_family': fam,
            'display_category': r.category,
            'severity': sev,
            'is_sitewide': getattr(r, 'is_sitewide', False),
            'description': getattr(r, 'description', '') or first_line,
            'version': getattr(r, 'rule_version', '1.0.0'),
            'doc': doc
        })
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(rules, f, indent=2)
    return len(rules)

def export_tech_catalog(output_path: str) -> int:
    catalog = _build_catalog()
    technologies = []
    
    for tech_id, fp in catalog.items():
        sigs = fp.signatures
        sigs_dict = {
            'meta_generators': sigs.meta_generators,
            'headers': sigs.headers,
            'cookies': sigs.cookies,
            'script_sources': sigs.script_sources,
            'stylesheet_hrefs': sigs.stylesheet_hrefs,
            'dom_markers': sigs.dom_markers,
            'inline_markers': sigs.inline_markers,
            'html_comments': sigs.html_comments,
            'asset_urls': sigs.asset_urls,
            'html_attributes': sigs.html_attributes,
            'body_classes': sigs.body_classes,
            'link_rels': sigs.link_rels,
            'min_assets_for_detection': sigs.min_assets_for_detection,
            'requires_corroboration': sigs.requires_corroboration,
            'excluded_domains': sigs.excluded_domains,
        }

        vr_list = []
        for vr in fp.version_rules:
            vr_list.append({
                'source_type': vr.source_type,
                'regex': vr.regex,
                'version_type': vr.version_type.value if hasattr(vr.version_type, 'value') else str(vr.version_type)
            })

        cat_str = fp.category.value if hasattr(fp.category, 'value') else str(fp.category)
        prov_str = fp.default_provenance.value if hasattr(fp.default_provenance, 'value') else str(fp.default_provenance)

        technologies.append({
            'id': fp.id,
            'name': fp.name,
            'category': cat_str,
            'subcategory': fp.subcategory,
            'vendor_or_type': fp.vendor_or_type,
            'website': fp.website,
            'description': fp.description,
            'implies': fp.implies,
            'confidence_weight': fp.confidence_weight,
            'default_provenance': prov_str,
            'signatures': sigs_dict,
            'version_rules': vr_list,
            'known_false_positives': fp.known_false_positives,
            'limitations': fp.limitations,
        })

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump({
            'catalog_version': '2.0.0',
            'engine_version': '2.0.0',
            'total': len(technologies),
            'technologies': technologies
        }, f, indent=2)
    return len(technologies)

if __name__ == '__main__':
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    seo_out = os.path.join(root, 'extension', 'standalone', 'audit', 'canonical_seo_rules.json')
    tech_out = os.path.join(root, 'extension', 'standalone', 'technologies', 'technology_catalog.json')
    
    r_count = export_seo_rules(seo_out)
    t_count = export_tech_catalog(tech_out)
    print(f"Successfully exported {r_count} canonical SEO rules and {t_count} technology fingerprints.")
