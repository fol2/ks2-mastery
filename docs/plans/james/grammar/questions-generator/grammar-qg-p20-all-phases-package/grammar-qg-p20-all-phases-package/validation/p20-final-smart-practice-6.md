# Grammar QG P19 — smart-practice surface audit

Content release: `grammar-qg-p20-2026-05-05`
Generated: `2026-05-05T13:02:51.268Z`
Sessions: 66 (11 profiles × 30 seeds, size=5)
Status: **PASS** — 0 failures, 0 advisories.

## Per-profile spread

| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |
|---|---|---|---|---|---|---|---|
| firstTime | 6 | 510 | 4.83 | 3.17 | 53.3% | 26.7% | 0 / 30 |
| returning | 6 | 93 | 4.33 | 3.50 | 40.0% | 20.0% | 0 / 30 |
| weak | 6 | 243 | 5.00 | 3.33 | 50.0% | 40.0% | 0 / 30 |
| dueHeavy | 6 | 358 | 4.83 | 3.83 | 70.0% | 46.7% | 0 / 30 |
| postMega | 6 | 300 | 4.83 | 4.00 | 46.7% | 26.7% | 0 / 30 |
| focusConcept | 6 | 27 | 1.33 | 3.83 | 40.0% | 30.0% | 1 / 29 |
| recentMisses | 6 | 95 | 3.67 | 3.83 | 43.3% | 30.0% | 0 / 30 |
| retryActive | 6 | 63 | 2.67 | 3.33 | 36.7% | 16.7% | 0 / 30 |
| similarProblemEligible | 6 | 64 | 3.67 | 3.33 | 43.3% | 23.3% | 0 / 30 |
| spacedRetrievalDue | 6 | 125 | 4.67 | 3.50 | 36.7% | 13.3% | 0 / 30 |
| troubleMode | 6 | 62 | 3.67 | 3.33 | 50.0% | 36.7% | 1 / 29 |

## Selection lane reasons exercised

Contract D.4 — every queue entry carries an explicit lane reason. The table below shows how many entries each profile pulled from each lane across 6 seeds.

| Profile | fallback | priority-urgent | retry | similar-problem | spaced-retrieval | trouble-cluster |
|---|---|---|---|---|---|---|
| firstTime | 30 | 0 | 0 | 0 | 0 | 0 |
| returning | 18 | 6 | 0 | 6 | 0 | 0 |
| weak | 24 | 6 | 0 | 0 | 0 | 0 |
| dueHeavy | 24 | 6 | 0 | 0 | 0 | 0 |
| postMega | 30 | 0 | 0 | 0 | 0 | 0 |
| focusConcept | 30 | 0 | 0 | 0 | 0 | 0 |
| recentMisses | 18 | 6 | 0 | 6 | 0 | 0 |
| retryActive | 12 | 6 | 6 | 6 | 0 | 0 |
| similarProblemEligible | 18 | 6 | 0 | 6 | 0 | 0 |
| spacedRetrievalDue | 18 | 6 | 0 | 0 | 6 | 0 |
| troubleMode | 18 | 0 | 0 | 6 | 0 | 6 |

## Notes

- Every queue entry carries an explicit reason emitted by `queueEntry()` in `worker/src/subjects/grammar/selection.js`. Six lanes are exercised by the simulator profiles: fallback, priority-urgent, retry, similar-problem, spaced-retrieval, trouble-cluster. The seventh lane — focus-saturation — fires only when a focus concept's mode-eligible pool is smaller than the queue size (1..4 templates). With the current 510-template inventory the smallest mode-eligible per-concept pool is 16 (satsset/active_passive), so focus-saturation is unreachable in production today; the lane stays wired so a future content release that retires a concept down to ≤4 active templates would activate it without a code change.
- Duplicate templates within a 5-question round are only permitted when the reason is on the `ALLOWED_DUPLICATE_REASONS` allow-list — missing or unknown reasons hard-fail the audit (Contract D criterion 4).
- "Eligible pool" is computed from `GRAMMAR_TEMPLATE_METADATA` filtered by the profile's mastered concepts and (when set) focus concept. Sessions with eligible pool < 5 record a `pool-too-small` advisory rather than a hard failure.
