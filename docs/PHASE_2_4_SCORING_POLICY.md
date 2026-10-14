# Phase 2 Task 2.4 — Scoring Policy & Formula

## 1. Policy Version: `2026.1`
The scoring policy defines transparent weights, status evaluation mappings, severity penalties, and normalizations.

## 2. Category Weights
Overall Audit Health is a weighted linear composite of three distinct categories:
| Category | Weight ($W_c$) | Rationale |
| :--- | :---: | :--- |
| **Technical Health** | **0.40 (40%)** | Crawlability, indexability, canonicals, status codes, and security form the foundation of search discovery. |
| **On-Page Health** | **0.35 (35%)** | Content relevance, title tags, metadata, heading structures, image accessibility, and structured data. |
| **Site-Wide Health** | **0.25 (25%)** | Site architecture, duplicate content clusters, link equity distribution, orphan pages, and internal graph integrity. |

Sum of category weights: $0.35 + 0.40 + 0.25 = 1.00$ (100%).

## 3. Assessment Status Multipliers
Every evaluated rule assessment produces a status score multiplier:
- **`pass` = 1.00**: Full credit earned.
- **`warning` = 0.50**: Suboptimal or advisory finding (e.g., title slightly too long).
- **`fail` = 0.00**: Definite error or non-compliance (e.g., missing title, broken link).
- **`unknown` = 0.00**: Inconclusive or unverified evidence. **Unknown is never treated as a pass.**
- **`not_applicable` = Excluded**: The rule is omitted from denominator calculations and does not penalize or reward the score.

## 4. Severity Multipliers
When aggregating rule findings across multiple pages or site-wide checks, severity weights determine the baseline importance of the rule:
- **`critical` = 4.0**
- **`high` = 3.0**
- **`medium` = 2.0**
- **`low` = 1.0**

## 5. Mathematical Formula

### Step 1: Rule-Level Score ($S_r$)
For a given rule $r$ assessed across $N_r$ eligible instances (pages or site assessments):
$$S_r = \frac{\sum_{i=1}^{N_r} \text{multiplier}(\text{status}_i)}{N_r} \times 100$$
If all instances pass, $S_r = 100.0$. If 1 of 4 fails and 3 pass, $S_r = \frac{0 + 1 + 1 + 1}{4} \times 100 = 75.0$.

### Step 2: Category Score ($C_c$)
For category $c$ containing active rules $R_c$:
$$C_c = \frac{\sum_{r \in R_c} (S_r \times \text{severity\_weight}_r)}{\sum_{r \in R_c} \text{severity\_weight}_r}$$
If no rules in category $c$ have eligible assessments, $C_c = \text{null}$.

### Step 3: Overall Composite Audit Health Score ($S_{\text{audit}}$)
$$S_{\text{audit}} = \frac{\sum_{c \in \{\text{OnPage, Technical, SiteWide}\}} (C_c \times W_c)}{\sum_{c \in \text{ActiveCategories}} W_c}$$
Where $S_{\text{audit}}$ is rounded to one decimal place and strictly bounded $[0.0, 100.0]$.

### Step 4: Special Cases
- **Empty Audits:** If no pages or rule assessments exist, score is **`null`** with state **`not_analyzed`**. Empty audits never score 100.
- **Overlapping Findings Deduplication:** Multiple links pointing to the same broken target on one page are grouped into a single root-cause finding to prevent double-penalizing the rule score.
