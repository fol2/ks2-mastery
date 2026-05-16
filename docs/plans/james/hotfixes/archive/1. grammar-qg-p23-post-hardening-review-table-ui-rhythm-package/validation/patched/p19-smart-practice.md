# Grammar QG P21 — smart-practice surface audit

Content release: `grammar-qg-p21-2026-05-11`
Generated: `2026-05-12T11:36:24.141Z`
Sessions: 33 (11 profiles × 3 seeds, size=5)
Status: **PASS** — 0 failures, 0 advisories.

## Per-profile spread

| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |
|---|---|---|---|---|---|---|---|
| firstTime | 3 | 546 | 5.00 | 3.67 | 33.3% | 26.7% | 0 / 15 |
| returning | 3 | 99 | 4.33 | 4.00 | 46.7% | 6.7% | 0 / 15 |
| weak | 3 | 259 | 5.67 | 4.00 | 53.3% | 33.3% | 0 / 15 |
| dueHeavy | 3 | 382 | 5.00 | 4.00 | 46.7% | 26.7% | 0 / 15 |
| postMega | 3 | 320 | 5.00 | 4.00 | 53.3% | 26.7% | 0 / 15 |
| focusConcept | 3 | 29 | 1.00 | 3.67 | 40.0% | 33.3% | 0 / 15 |
| recentMisses | 3 | 101 | 4.33 | 3.67 | 46.7% | 20.0% | 0 / 15 |
| retryActive | 3 | 67 | 3.00 | 3.67 | 53.3% | 33.3% | 0 / 15 |
| similarProblemEligible | 3 | 68 | 4.00 | 3.33 | 40.0% | 26.7% | 0 / 15 |
| spacedRetrievalDue | 3 | 133 | 5.00 | 3.67 | 46.7% | 46.7% | 0 / 15 |
| troubleMode | 3 | 66 | 3.33 | 4.00 | 60.0% | 46.7% | 0 / 15 |

## Selection lane reasons exercised

Contract D.4 — every queue entry carries an explicit lane reason. The table below shows how many entries each profile pulled from each lane across 3 seeds.

| Profile | fallback | priority-urgent | retry | similar-problem | spaced-retrieval | trouble-cluster |
|---|---|---|---|---|---|---|
| firstTime | 15 | 0 | 0 | 0 | 0 | 0 |
| returning | 9 | 3 | 0 | 3 | 0 | 0 |
| weak | 12 | 3 | 0 | 0 | 0 | 0 |
| dueHeavy | 12 | 3 | 0 | 0 | 0 | 0 |
| postMega | 15 | 0 | 0 | 0 | 0 | 0 |
| focusConcept | 15 | 0 | 0 | 0 | 0 | 0 |
| recentMisses | 9 | 3 | 0 | 3 | 0 | 0 |
| retryActive | 6 | 3 | 3 | 3 | 0 | 0 |
| similarProblemEligible | 9 | 3 | 0 | 3 | 0 | 0 |
| spacedRetrievalDue | 9 | 3 | 0 | 0 | 3 | 0 |
| troubleMode | 9 | 0 | 0 | 3 | 0 | 3 |

## Notes

- Every queue entry carries an explicit reason emitted by `queueEntry()` in `worker/src/subjects/grammar/selection.js`. Six lanes are exercised by the simulator profiles: fallback, priority-urgent, retry, similar-problem, spaced-retrieval, trouble-cluster. The seventh lane — focus-saturation — fires only when a focus concept's mode-eligible pool is smaller than the queue size (1..4 templates). With the current 510-template inventory the smallest mode-eligible per-concept pool is 16 (satsset/active_passive), so focus-saturation is unreachable in production today; the lane stays wired so a future content release that retires a concept down to ≤4 active templates would activate it without a code change.
- Duplicate templates within a 5-question round are only permitted when the reason is on the `ALLOWED_DUPLICATE_REASONS` allow-list — missing or unknown reasons hard-fail the audit (Contract D criterion 4).
- "Eligible pool" is computed from `GRAMMAR_TEMPLATE_METADATA` filtered by the profile's mastered concepts and (when set) focus concept. Sessions with eligible pool < 5 record a `pool-too-small` advisory rather than a hard failure.
