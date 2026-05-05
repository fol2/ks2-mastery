# Grammar QG P19 — smart-practice surface audit

Content release: `grammar-qg-p20-2026-05-05`
Generated: `2026-05-05T15:31:43.509Z`
Sessions: 330 (11 profiles × 30 seeds, size=5)
Status: **PASS** — 0 failures, 0 advisories.

## Per-profile spread

| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |
|---|---|---|---|---|---|---|---|
| firstTime | 30 | 510 | 4.73 | 3.23 | 42.7% | 27.3% | 3 / 147 |
| returning | 30 | 93 | 4.40 | 3.50 | 46.7% | 28.7% | 3 / 147 |
| weak | 30 | 243 | 4.87 | 3.37 | 39.3% | 27.3% | 3 / 147 |
| dueHeavy | 30 | 358 | 4.80 | 3.40 | 44.7% | 28.7% | 1 / 149 |
| postMega | 30 | 300 | 4.73 | 3.53 | 46.7% | 31.3% | 3 / 147 |
| focusConcept | 30 | 27 | 1.40 | 3.50 | 39.3% | 32.7% | 21 / 127 |
| recentMisses | 30 | 95 | 4.30 | 3.63 | 48.7% | 33.3% | 3 / 147 |
| retryActive | 30 | 63 | 3.13 | 3.47 | 40.7% | 23.3% | 16 / 124 |
| similarProblemEligible | 30 | 64 | 3.87 | 3.37 | 46.0% | 29.3% | 4 / 146 |
| spacedRetrievalDue | 30 | 125 | 4.73 | 3.73 | 48.7% | 31.3% | 2 / 148 |
| troubleMode | 30 | 62 | 3.77 | 3.47 | 42.7% | 32.0% | 8 / 142 |

## Selection lane reasons exercised

Contract D.4 — every queue entry carries an explicit lane reason. The table below shows how many entries each profile pulled from each lane across 30 seeds.

| Profile | fallback | priority-urgent | retry | similar-problem | spaced-retrieval | trouble-cluster |
|---|---|---|---|---|---|---|
| firstTime | 150 | 0 | 0 | 0 | 0 | 0 |
| returning | 90 | 30 | 0 | 30 | 0 | 0 |
| weak | 120 | 30 | 0 | 0 | 0 | 0 |
| dueHeavy | 120 | 30 | 0 | 0 | 0 | 0 |
| postMega | 150 | 0 | 0 | 0 | 0 | 0 |
| focusConcept | 150 | 0 | 0 | 0 | 0 | 0 |
| recentMisses | 90 | 30 | 0 | 30 | 0 | 0 |
| retryActive | 60 | 30 | 30 | 30 | 0 | 0 |
| similarProblemEligible | 90 | 30 | 0 | 30 | 0 | 0 |
| spacedRetrievalDue | 90 | 30 | 0 | 0 | 30 | 0 |
| troubleMode | 90 | 0 | 0 | 30 | 0 | 30 |

## Notes

- Every queue entry carries an explicit reason emitted by `queueEntry()` in `worker/src/subjects/grammar/selection.js`. Six lanes are exercised by the simulator profiles: fallback, priority-urgent, retry, similar-problem, spaced-retrieval, trouble-cluster. The seventh lane — focus-saturation — fires only when a focus concept's mode-eligible pool is smaller than the queue size (1..4 templates). With the current 510-template inventory the smallest mode-eligible per-concept pool is 16 (satsset/active_passive), so focus-saturation is unreachable in production today; the lane stays wired so a future content release that retires a concept down to ≤4 active templates would activate it without a code change.
- Duplicate templates within a 5-question round are only permitted when the reason is on the `ALLOWED_DUPLICATE_REASONS` allow-list — missing or unknown reasons hard-fail the audit (Contract D criterion 4).
- "Eligible pool" is computed from `GRAMMAR_TEMPLATE_METADATA` filtered by the profile's mastered concepts and (when set) focus concept. Sessions with eligible pool < 5 record a `pool-too-small` advisory rather than a hard failure.
