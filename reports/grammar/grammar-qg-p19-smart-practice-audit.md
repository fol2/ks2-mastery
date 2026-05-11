# Grammar QG P21 — smart-practice surface audit

Content release: `grammar-qg-p21-2026-05-11`
Generated: `2026-05-11T13:56:36.077Z`
Sessions: 330 (11 profiles × 30 seeds, size=5)
Status: **PASS** — 0 failures, 0 advisories.

## Per-profile spread

| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |
|---|---|---|---|---|---|---|---|
| firstTime | 30 | 546 | 4.63 | 3.33 | 48.0% | 28.7% | 2 / 147 |
| returning | 30 | 99 | 4.50 | 3.70 | 48.0% | 25.3% | 2 / 148 |
| weak | 30 | 259 | 4.73 | 3.37 | 49.3% | 31.3% | 3 / 147 |
| dueHeavy | 30 | 382 | 4.67 | 3.47 | 48.7% | 30.7% | 2 / 148 |
| postMega | 30 | 320 | 4.53 | 3.37 | 42.7% | 26.7% | 4 / 146 |
| focusConcept | 30 | 29 | 1.40 | 3.47 | 40.7% | 35.3% | 21 / 128 |
| recentMisses | 30 | 101 | 4.07 | 3.63 | 52.0% | 27.3% | 1 / 149 |
| retryActive | 30 | 67 | 3.13 | 3.30 | 41.3% | 21.3% | 10 / 130 |
| similarProblemEligible | 30 | 68 | 4.00 | 3.50 | 47.3% | 29.3% | 4 / 146 |
| spacedRetrievalDue | 30 | 133 | 4.60 | 3.53 | 52.0% | 30.7% | 4 / 146 |
| troubleMode | 30 | 66 | 3.87 | 3.53 | 48.0% | 34.0% | 4 / 146 |

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
