# Grammar QG P19 — smart-practice surface audit

Content release: `grammar-qg-p19-2026-05-04`
Generated: `2026-05-04T01:29:25.529Z`
Sessions: 240 (8 profiles × 30 seeds, size=5)
Status: **PASS** — 0 failures, 0 advisories.

## Per-profile spread

| Profile | Sessions | Eligible pool | Concept-distinct mean | Q-type-distinct mean | Constructed share | ManualReview share | Repeated surfaces |
|---|---|---|---|---|---|---|---|
| firstTime | 30 | 510 | 4.73 | 3.27 | 44.0% | 22.0% | 3 / 147 |
| returning | 30 | 93 | 4.83 | 3.60 | 47.3% | 19.3% | 1 / 149 |
| weak | 30 | 243 | 4.87 | 3.37 | 40.7% | 14.0% | 3 / 147 |
| dueHeavy | 30 | 358 | 4.80 | 3.40 | 46.0% | 18.7% | 2 / 148 |
| postMega | 30 | 300 | 4.73 | 3.57 | 47.3% | 15.3% | 3 / 147 |
| focusConcept | 30 | 27 | 1.40 | 3.50 | 39.3% | 15.3% | 21 / 127 |
| recentMisses | 30 | 95 | 4.67 | 3.67 | 47.3% | 14.7% | 5 / 145 |
| troubleMode | 30 | 62 | 4.53 | 3.67 | 43.3% | 16.0% | 2 / 148 |

## Notes

- The grammar selection module emits queue entries without per-item retry/spaced-retrieval reasons. The audit therefore fails closed on duplicate templates or surfaces. Adding a `reason` field to `queueEntry()` in `worker/src/subjects/grammar/selection.js` would enable explicit exceptions via the `ALLOWED_DUPLICATE_REASONS` allow-list (Contract D criterion 4).
- "Eligible pool" is computed from `GRAMMAR_TEMPLATE_METADATA` filtered by the profile's mastered concepts and (when set) focus concept. Sessions with eligible pool < 5 record a `pool-too-small` advisory rather than a hard failure.
