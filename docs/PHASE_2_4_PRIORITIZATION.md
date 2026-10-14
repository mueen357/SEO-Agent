# Phase 2 Task 2.4 — Prioritization Engine

## 1. Objectives
The prioritization engine converts raw SEO findings into an actionable, deduplicated, and ranked remediation plan.

## 2. Priority Tiers
| Tier | Name | Criteria & Examples |
| :---: | :--- | :--- |
| **P0** | **Confirmed Serious Blocker** | Issues that completely block indexing, waste crawl budget catastrophically, or sever critical site journeys. *Examples:* Sitewide crawl 5xx errors, circular redirects on main seed, internal broken links to key pages, or broken canonical loops. (Note: Intentional noindex on utilities like `/cart` or `/admin` is NOT P0). |
| **P1** | **High Priority** | Significant ranking, discovery, or indexing impediments. *Examples:* Missing title tags on indexable pages, duplicate content clusters, missing XML sitemaps, high-severity mixed content. |
| **P2** | **Medium Priority** | Structural and content quality improvements. *Examples:* Missing meta descriptions, multiple H1 tags, missing image alt attributes on informative images, redirect chains $\le 2$ hops. |
| **P3** | **Lower Priority** | Micro-optimizations, advisory warnings, or hygiene tasks. *Examples:* Title tag slightly exceeding pixel width, missing Open Graph tags, trailing slash inconsistencies with 301 redirects. |

## 3. Deterministic Grouping & Fingerprinting
Findings are clustered by root cause to prevent alert fatigue:
- **Fingerprint Formula:**
  $$\text{group\_fingerprint} = \text{SHA-256}(\text{audit\_id} + ":" + \text{rule\_id} + ":" + \text{root\_cause\_identifier})$$
- **Examples of Grouped Causes:**
  - Multiple internal links across 5 pages pointing to `/missing-page` $\rightarrow$ 1 action item with `affected_page_count = 5`.
  - Duplicate page titles sharing the exact string $\rightarrow$ 1 action item listing all matching URLs.

## 4. Priority Ranking Formula
Within each tier, items are sorted by a deterministic priority score:
$$\text{PriorityScore} = (\text{SeverityBase} \times 20.0) + \min(20.0, \log_2(\text{affected\_page\_count} + 1) \times 5.0) + (\text{Confidence} \times 10.0)$$
Ties are broken deterministically by rule ID and group fingerprint.
