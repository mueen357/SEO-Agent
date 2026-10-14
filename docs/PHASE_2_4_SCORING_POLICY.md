# Phase 2 Task 2.4 / 2.4B — Scoring Policy & Mathematical Specification

## 1. Policy Version: `2026.1` (Corrected Task 2.4B)
The scoring policy defines deterministic weights, evidence-based status evaluation mappings, severity multipliers, category gating, and evidence coverage thresholds.

## 2. Category Diagnostic Policy Weights
Overall Audit Health is a weighted linear composite of three distinct categories:
| Category | Weight ($W_c$) | Rationale |
| :--- | :---: | :--- |
| **Technical Health** | **0.40 (40%)** | Crawlability, indexability, canonicals, HTTP status codes, and transport security form the discovery foundation. |
| **On-Page Health** | **0.35 (35%)** | Content relevance, title tags, metadata, heading structures, image accessibility, and structured data. |
| **Site-Wide Health** | **0.25 (25%)** | Site architecture, duplicate content clusters, link equity distribution, orphan pages, and internal graph integrity. |

Sum of category weights: $0.35 + 0.40 + 0.25 = 1.00$ (100%).

> **Diagnostic Disclaimer:** These weights represent internal technical diagnostic policy for hygiene and best practices. They do NOT represent, emulate, or predict Google's proprietary search ranking factors, traffic, or search revenue.

---

## 3. Assessment Status Multipliers & Known vs Unknown Evidence

### Known Applicable Statuses (Affect Direct Rule Health):
- **`pass` = 1.00**: Verified compliance earned.
- **`warning` = 0.50**: Suboptimal or advisory finding (e.g., title slightly too long, near-duplicate content).
- **`fail` = 0.00**: Definite error or non-compliance (e.g., missing title, broken internal link, 5xx error).

### Excluded from Direct Health Penalties:
- **`unknown` = Excluded from health penalty**: Inconclusive, unverified, or missing observation. Missing evidence is NOT an observed failure. Unknown assessments reduce **Evidence Coverage** and scoring confidence.
- **`not_applicable` = Excluded**: The rule was evaluated but found not applicable to the page context. Tracked separately and omitted from applicable rule scoring.

---

## 4. Corrected Mathematical Formulas

### Step 1: Rule-Level Score ($S_r$)
For a given rule $r$ assessed across eligible instances:
$$S_r = 100 \times \frac{\text{pass\_count} \times 1.0 + \text{warning\_count} \times 0.5 + \text{fail\_count} \times 0.0}{\text{known\_applicable\_count}}$$

Where:
$$\text{known\_applicable\_count} = \text{pass\_count} + \text{warning\_count} + \text{fail\_count}$$

**Critical Rule Gating:**
If $\text{known\_applicable\_count} == 0$:
$$S_r = \text{null}$$
*Never assign 100 to a rule with no known applicable observations.*

**Example:**
5 passes and 5 unknowns:
- $\text{known\_applicable\_count} = 5$
- Known-check health score $S_r = 100 \times \frac{5 \times 1.0}{5} = 100.0$
- Evidence coverage ratio = 50.0% (provisional/insufficient badge indicated).

### Step 2: Category Score ($C_c$)
For category $c$ containing rules $R_c$:
Only rules with non-null scores ($S_r \neq \text{null}$) contribute:
$$C_c = \frac{\sum_{r \in R_c, S_r \neq \text{null}} (S_r \times \text{severity\_weight}_r)}{\sum_{r \in R_c, S_r \neq \text{null}} \text{severity\_weight}_r}$$

If no rules in category $c$ have non-null scores, $C_c = \text{null}$.

### Step 3: Composite Audit Health Score ($S_{\text{audit}}$)
If any categories are missing or unavailable, the composite score uses proportional effective weights:
$$S_{\text{audit}} = \frac{\sum_{c \in \text{IncludedCategories}} (C_c \times W_c)}{\sum_{c \in \text{IncludedCategories}} W_c}$$

- When all 3 categories are evaluated: $\sum W_c = 1.00$, yielding standard weights (35% On-Page, 40% Technical, 25% Site-Wide).
- When a category is missing: score state is marked `provisional`, and included categories and effective weights are transparently disclosed.
- If all categories are null or evidence is below minimum threshold ($\text{coverage} < 0.30$ or $\text{known\_evals} == 0$): $S_{\text{audit}} = \text{null}$ with state `insufficient_evidence` or `not_analyzed`.

---

## 5. Priority Classification Engine (P0–P3)
Remediation items are prioritized deterministically into 4 tiers:
- **P0 (Critical Blockers):** Verified server 5xx errors, crawl blockers, robots.txt blocks, and catastrophic indexability failures affecting critical landing pages.
- **P1 (High Priority):** Broken internal links, missing canonicals, duplicate title tags, and missing metadata on indexable pages.
- **P2 (Medium Priority):** Near-duplicate content clusters, suboptimal meta descriptions, missing alt text on content images.
- **P3 (Low / Advisory):** Minor heading hierarchy warnings, cosmetic URL structure warnings.

### Priority Tie-Breaking Order:
1. Priority tier ascending (`P0` < `P1` < `P2` < `P3`)
2. Score impact descending (`-score_impact`)
3. Affected page count descending (`-affected_page_count`)
4. Rule title alphabetically
5. Rule ID alphabetically
6. Group fingerprint alphabetically (stable unique tie-breaking)

Inconclusive `unknown` assessments are strictly excluded from remediation grouping to prevent unverified findings from becoming false-positive P0/P1 blockers.

---

## 6. Near-Duplicate Content Clustering Performance Limits
- **Algorithm:** Bounded Bron-Kerbosch maximal clique enumeration over SimHash-64 Hamming distance graphs (threshold $\le 3$ bits, $\ge 95.3\%$ similarity).
- **Iteration Bound:** Hard safety limit of 10,000 steps (`MAX_BRON_KERBOSCH_STEPS = 10_000`) prevents exponential worst-case performance on dense adversarial graphs.
- **Overlap Prevention:** Greedy disjoint clique selection prevents overlapping cliques from double-counting affected pages or inflating score impact.
- **Transparency:** If limits are hit, `safety_limit_hit = True` and `incomplete_analysis = True` are explicitly recorded in evidence metadata.
