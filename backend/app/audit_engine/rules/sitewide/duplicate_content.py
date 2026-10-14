"""Site-wide rules for exact and near duplicate content detection."""

import hashlib
from typing import List
from app.audit_engine.context import SiteWideAuditContext
from app.audit_engine.result import RuleAssessment
from app.audit_engine.rules.base import BaseRule
from app.content.similarity import length_similarity, simhash_hamming_distance, simhash_similarity

GOOGLE_DUPLICATE_DOCS = "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls"


class DuplicateExactContentRule(BaseRule):
    rule_id = "SITE_CONTENT_DUPLICATE_EXACT"
    category = "content"
    subcategory = "duplicate_content"
    documentation_url = GOOGLE_DUPLICATE_DOCS
    default_severity = "high"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []

        # 1. Group pages by normalized main text hash (excluding failed crawls and thin content)
        hash_to_pages = {}
        for p in ctx.pages:
            if p.fetch_status != "success" or p.http_status != 200:
                continue
            if getattr(p, "content_quality_status", None) not in ("usable", "sufficient"):
                continue
            h = getattr(p, "normalized_main_text_hash", None)
            if not h:
                continue
            hash_to_pages.setdefault(h, []).append(p)

        duplicate_groups = {h: pages for h, pages in hash_to_pages.items() if len(pages) > 1}

        if not duplicate_groups:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No exact duplicate main content detected",
                    description="No multiple pages share identical normalized main content across the crawled pages.",
                    severity="info",
                    status="pass",
                    evidence={"pages_checked": len(ctx.pages)},
                    recommendation="No consolidation needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key="site:none",
                )
            )
            return assessments

        for h, pages in duplicate_groups.items():
            urls = [p.final_url or p.requested_url for p in pages]
            group_id = f"exact_{h[:16]}"
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Exact duplicate main content ({len(pages)} pages)",
                    description=(
                        f"{len(pages)} pages share identical normalized main-body text (SHA-256: {h[:12]}...). "
                        "When multiple pages have identical content, search engines must select one canonical version."
                    ),
                    severity="high",
                    status="fail",
                    evidence={
                        "group_id": group_id,
                        "content_hash": h,
                        "page_count": len(pages),
                        "sample_urls": urls[:10],
                        "all_urls": urls,
                        "page_ids": [str(p.id) for p in pages],
                    },
                    recommendation=(
                        "Consolidate duplicate pages using 301 redirects to the preferred version, "
                        "or specify a clear rel='canonical' target."
                    ),
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key=f"exact:{h}",
                )
            )

        return assessments


class DuplicateNearContentRule(BaseRule):
    rule_id = "SITE_CONTENT_DUPLICATE_NEAR"
    category = "content"
    subcategory = "near_duplicate"
    documentation_url = GOOGLE_DUPLICATE_DOCS
    default_severity = "medium"
    is_sitewide = True

    def evaluate_site(self, ctx: SiteWideAuditContext) -> List[RuleAssessment]:
        assessments: List[RuleAssessment] = []

        # Find eligible pages with sufficient content (>= 60 words) and valid simhash
        eligible_pages = [
            p for p in ctx.pages
            if p.fetch_status == "success"
            and p.http_status == 200
            and getattr(p, "content_quality_status", None) in ("usable", "sufficient")
            and (getattr(p, "main_text_word_count", 0) or 0) >= 60
            and getattr(p, "main_text_simhash", None)
            and len(getattr(p, "main_text_simhash", "")) == 16
        ]

        # Exclude exact duplicates from near-duplicate grouping
        hash_to_pages = {}
        for p in eligible_pages:
            h = getattr(p, "normalized_main_text_hash", "")
            hash_to_pages.setdefault(h, []).append(p)
        exact_hashes = {h for h, p_list in hash_to_pages.items() if len(p_list) > 1}

        # Keep one representative per exact hash for near-duplicate search
        rep_pages = []
        seen_exact = set()
        for p in eligible_pages:
            h = getattr(p, "normalized_main_text_hash", "")
            if h in exact_hashes:
                if h not in seen_exact:
                    rep_pages.append(p)
                    seen_exact.add(h)
            else:
                rep_pages.append(p)

        # Pairwise comparison with Disjoint Set Union (DSU) clustering
        parent = {str(p.id): str(p.id) for p in rep_pages}

        def find(i):
            if parent[i] == i:
                return i
            parent[i] = find(parent[i])
            return parent[i]

        def union(i, j):
            root_i = find(i)
            root_j = find(j)
            if root_i != root_j:
                parent[root_i] = root_j

        near_pairs = []
        # Bounded pairwise comparison (safe up to 500 pages)
        n = len(rep_pages)
        for i in range(n):
            p1 = rep_pages[i]
            w1 = getattr(p1, "main_text_word_count", 0) or 1
            sh1 = getattr(p1, "main_text_simhash", "")

            for j in range(i + 1, n):
                p2 = rep_pages[j]
                w2 = getattr(p2, "main_text_word_count", 0) or 1
                sh2 = getattr(p2, "main_text_simhash", "")

                # Check length similarity threshold (>= 0.8)
                if length_similarity(w1, w2) < 0.8:
                    continue

                # Check SimHash Hamming distance threshold (<= 3 bits difference -> >= 95.3% similarity)
                dist = simhash_hamming_distance(sh1, sh2)
                if dist <= 3:
                    sim = simhash_similarity(sh1, sh2)
                    union(str(p1.id), str(p2.id))
                    near_pairs.append((p1, p2, dist, sim))

        # Conservative cluster-consistency validation: prevent A-B-C similarity bridge chaining
        # Build near pair lookup
        near_pair_set = {
            frozenset({str(p1.id), str(p2.id)})
            for p1, p2, dist, sim in near_pairs
        }
        page_by_id = {str(p.id): p for p in rep_pages}

        # Initial connected components from DSU
        groups_by_root = {}
        for p in rep_pages:
            root = find(str(p.id))
            groups_by_root.setdefault(root, []).append(p)

        # Validate each connected component: ensure all pairs satisfy cluster criteria
        clusters = []
        for comp in groups_by_root.values():
            if len(comp) < 2:
                continue

            # Check if component is already a fully consistent clique
            comp_ids = [str(p.id) for p in comp]
            is_full_clique = True
            for i in range(len(comp_ids)):
                for j in range(i + 1, len(comp_ids)):
                    if frozenset({comp_ids[i], comp_ids[j]}) not in near_pair_set:
                        is_full_clique = False
                        break
                if not is_full_clique:
                    break

            if is_full_clique:
                clusters.append(comp)
            else:
                # Component contains an A-B-C bridge; decompose into maximal consistent cliques
                # to prevent dissimilar endpoints from being reported in the same group
                adj = {pid: set() for pid in comp_ids}
                for pid1 in comp_ids:
                    for pid2 in comp_ids:
                        if pid1 != pid2 and frozenset({pid1, pid2}) in near_pair_set:
                            adj[pid1].add(pid2)

                cliques = []
                def bron_kerbosch(R, P, X):
                    if not P and not X:
                        if len(R) >= 2:
                            cliques.append(sorted(list(R)))
                        return
                    pivot = next(iter(P | X))
                    for v in list(P - adj[pivot]):
                        bron_kerbosch(R | {v}, P & adj[v], X & adj[v])
                        P.remove(v)
                        X.add(v)

                bron_kerbosch(set(), set(comp_ids), set())
                # Sort cliques deterministically and map back to page objects
                cliques.sort(key=lambda c: (len(c), c), reverse=True)
                for c in cliques:
                    clusters.append([page_by_id[pid] for pid in c])

        if not clusters:
            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title="No near-duplicate main content detected",
                    description="No pages exhibit substantial textual similarity within the SimHash Hamming threshold (<= 3 bits).",
                    severity="info",
                    status="pass",
                    evidence={"pages_evaluated": len(rep_pages)},
                    recommendation="No action needed.",
                    source_type="derived_from_crawl",
                    confidence=1.0,
                    documentation_url=self.documentation_url,
                    fingerprint_key="site:none",
                )
            )
            return assessments

        for cluster in clusters:
            urls = [p.final_url or p.requested_url for p in cluster]
            root_url = sorted(urls)[0]
            group_key = f"near:{hashlib.sha256(root_url.encode()).hexdigest()[:16]}"

            assessments.append(
                RuleAssessment(
                    rule_id=self.rule_id,
                    category=self.category,
                    subcategory=self.subcategory,
                    title=f"Near-duplicate main content candidate group ({len(cluster)} pages)",
                    description=(
                        f"{len(cluster)} pages share very high textual similarity based on SimHash-64 fingerprinting "
                        "(Hamming distance <= 3, >= 95.3% feature similarity). Review whether these pages should be differentiated or consolidated."
                    ),
                    severity="medium",
                    status="warning",
                    evidence={
                        "group_id": f"near_{hashlib.sha256(root_url.encode()).hexdigest()[:16]}",
                        "page_count": len(cluster),
                        "sample_urls": urls[:10],
                        "all_urls": urls,
                        "page_ids": [str(p.id) for p in cluster],
                        "method": "SimHash-64 Hamming Distance <= 3 (token 1-grams & 2-grams)",
                    },
                    recommendation=(
                        "Inspect near-duplicate pages for unique value. If pages serve the same intent, "
                        "consolidate them or provide distinct, valuable content."
                    ),
                    source_type="derived_from_crawl",
                    confidence=0.9,
                    documentation_url=self.documentation_url,
                    fingerprint_key=group_key,
                )
            )

        return assessments
