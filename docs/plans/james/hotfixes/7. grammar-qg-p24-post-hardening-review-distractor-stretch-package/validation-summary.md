# Grammar QG P24 Validation Summary

## Source ZIP

`ks2-mastery-lean-05130813.zip`

SHA-256:

`1c57a140600b2bb36e954c5814d626fac2ef451cf9d8ca733a87fc54b4e46c75`

ZIP integrity: passed.

## Patches

`patches/001-grammar-qg-p24-distractor-quality-and-stretch-feedback.patch`

SHA-256:

`be79c5c9afa7751ff99d599fca1a3219ea363b8a0a5bd8843a22c08369fb20ef`

`patches/002-release-gate-atomic-monster-manifest-write.patch`

SHA-256:

`86771176dc8da0c02d1bb321faec0bc5545cef94b75845cb732ec17e7f21b249`

Fresh ZIP application:

- `git apply --check` for both patches: passed
- `git apply` for both patches: passed
- Fresh syntax checks: passed
- Fresh generic distractor count after patch: `0`

## Baseline post-hardening review findings

Generic learner-visible explanation distractors before patch:

```json
{
  "occurrenceCount": 1680,
  "itemCount": 570,
  "templateCount": 19
}
```

Generic learner-visible explanation distractors after patch:

```json
{
  "occurrenceCount": 0,
  "itemCount": 0,
  "templateCount": 0
}
```

## Current working-tree checks

| Check | Result |
|---|---:|
| `node --check worker/src/subjects/grammar/content.js` | pass |
| `node --check src/subjects/grammar/session-ui.js` | pass |
| `node --check scripts/grammar-production-smoke.mjs` | pass |
| `node --check tests/grammar-production-smoke.test.js` | pass |
| `node --check tests/helpers/grammar-visible-choice-collector.js` | pass |
| `node --check tests/helpers/grammar-render-harness.js` | pass |
| `node --check tests/grammar-qg-p24-distractor-quality.test.js` | pass |
| `node --test tests/grammar-production-smoke.test.js tests/grammar-qg-p24-distractor-quality.test.js` | pass, `21/21` |
| `node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js` | pass, `142/142` |
| `node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js` | pass, `16/16` |
| `node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json` | pass, `1638` checks, `0` hard failures, `0` advisories |
| `node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json` | pass, `0` violations, `0` warnings |
| `node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3 ...` | pass, `33` sessions, `0` failures, `0` advisories |
| `node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3 ...` | pass, `0` findings |
| `npm test` | pass, `111505` tests, `0` failures |
| `node --test tests/build-public.test.js` | pass, `1/1` additional isolated build-public check |
| `npm run check` | pass, dry-run deploy completed |

## Evidence refresh

- Regenerated `reports/grammar/grammar-qg-p21-render-inventory.json`, `reports/grammar/grammar-qg-p21-render-inventory.md`, and `reports/grammar/grammar-qg-p21-render-inventory-redacted.md`.
- Regenerated `reports/grammar/grammar-qg-p21-quality-register.json` and `reports/grammar/grammar-qg-p21-quality-register.md`.
- Regenerated `reports/grammar/grammar-qg-p21-distractor-audit.json`.
- Regenerated `reports/grammar/grammar-qg-p21-certification-manifest.json`.
- Scanned `reports/grammar/grammar-qg-p21-*`: no blocked generic labels found.
- Added P24 production-smoke cases for `qg_p18_p15_active_passive_explain_voice` and `qg_p21_hyphen_ambiguity_explanation_choice_variety`, so the live smoke fails if either read model exposes blocked generic labels.

## Release-gate stability

The full `npm test` gate previously exposed a parallel generated-manifest race while `tests/build-public.test.js` rewrote `src/platform/game/monster-asset-manifest.js`. Patch `002` changes `scripts/generate-monster-visual-manifest.mjs` to write through a process-scoped temporary file and atomic rename.

Evidence:

- `npm test`: passed with the default parallel gate.
- `node scripts/generate-monster-visual-manifest.mjs` followed by `git diff --exit-code -- src/platform/game/monster-asset-manifest.js`: passed.
- `src/platform/game/monster-asset-manifest.js` content unchanged.

## Runtime/environment notes

- Node: `v22.15.1`
- npm: `11.6.2`
- `.nvmrc`: `22`

## Remaining release boundary

Local release gates are green. Production deployment and live smoke remain pending until this candidate is merged to `main`, pushed through the GitHub deployment path, and verified on `https://ks2.eugnel.uk`.
