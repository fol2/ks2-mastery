# Grammar QG P22 Validation Summary

## Source identity

Source ZIP: `ks2-mastery-lean-05111651.zip`  
Source ZIP SHA-256: `38146270e2edc1305d67375d775494e4954a15e7ce40f6d52d2f6fa054745c7f`  
Patch SHA-256: `cc2cd8cde01941515253c57a19bffe5adf64f8b69d467a3df8da407e99853c1c`

Primary authority: uploaded ZIP.  
Supplementary authority: GitHub recent Grammar commit metadata.  
Production authority: not proven by this package.

## Baseline implementation review

The uploaded ZIP contains the implemented P21 state:

- release id: `grammar-qg-p21-2026-05-11`
- total Grammar templates: `546`
- P21 templates: `36`
- P21 selected-response cases: `288`
- Grammar concept coverage: `18/18`

Baseline local checks from the uploaded ZIP:

| Check | Result |
|---|---:|
| `npm run verify:grammar-qg-p21` | pass, `9/9` tests |
| P21 local repetition, 60 steps | pass, `0` violations, `0` warnings |
| Content quality seeds 1..3 | pass, `1638` checks, `0` hard failures, `0` advisories |
| Open-response fairness seeds 1..3 | pass, `0` findings |
| P20 answer/spec targeted tests | pass, `53/53` |
| P19 smart-practice seeds 1..3 | pass, `33` sessions, `0` failures, `0` advisories |

## Findings

### Finding 1: Selection performance needs hardening

Baseline queue probe:

```json
{"calls":3687,"templateCount":546,"node":"v22.16.0","config":{"mode":"smart","seed":1,"size":10}}
```

Patched queue probe:

```json
{"calls":256,"templateCount":546,"node":"v22.16.0","config":{"mode":"smart","seed":1,"size":10}}
```

Baseline local benchmark:

```json
{
  "p50": 377.3154990000003,
  "p95": 416.7651329999999,
  "max": 429.9058779999996,
  "improvementPct": 20.615711518351553
}
```

Patched local benchmark:

```json
{
  "p50": 34.28295400000002,
  "p95": 40.59283300000004,
  "max": 40.88009800000009,
  "improvementPct": 92.26798762659595
}
```

### Finding 2: P21 explanation distractors need enrichment

Baseline P21 explanation templates reused generic filler distractors across all concepts. The patch replaces them with concept-specific misconception distractors and adds a regression test.

## Patched validation

Patch application against a fresh extraction:

| Check | Result |
|---|---:|
| `git apply --check` | pass |
| `git apply` | pass |
| `node --check worker/src/subjects/grammar/selection.js` | pass |
| `node --check worker/src/subjects/grammar/content.js` | pass |
| Targeted tests on fresh applied tree | pass, `8` pass, `2` skipped |

Patched working-tree validation:

| Check | Result |
|---|---:|
| `npm run verify:grammar-qg-p21` | pass, `10/10` tests |
| `node --test tests/grammar-selection-perf-tripwire.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js` | pass, `8` pass, `2` skipped |
| P21 local repetition, 60 steps | pass, `0` violations, `0` warnings |
| Content quality seeds 1..3 | pass, `1638` checks, `0` hard failures, `0` advisories |
| P19 smart-practice seeds 1..3 | pass, `33` sessions, `0` failures, `0` advisories |

The two skipped tests are the existing wall-clock kill-switch subtests that skip when the template catalogue exceeds the R6 calibration horizon. The new deterministic P22 call-count ceiling does run and passes.

## Files changed by patch

- `worker/src/subjects/grammar/selection.js`
- `worker/src/subjects/grammar/content.js`
- `tests/grammar-selection-perf-tripwire.test.js`
- `tests/grammar-qg-p21-pool-expansion.test.js`

## Scope limits

This package does not certify live production. It does not modify or validate non-Grammar subjects, reward/Stars/mastery writes, Hero Mode, monsters, cross-subject runtime, or visual asset completeness.
