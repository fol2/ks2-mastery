# Grammar QG P23 Validation Summary

## Source ZIP

`ks2-mastery-lean-05121226.zip`

SHA-256:

`a0f99b47f8268e73f79aa7d95fe1b1fb63dba0a7aef87ff9ed6d744cf00e9dbe`

ZIP integrity: passed.

## Patch

`patches/001-grammar-qg-p23-table-row-options-and-practice-rhythm.patch`

SHA-256:

`282a3ac58620efa5189976258a224f6fca4abcfacbd6e2cbae5a20e4c77ac1e9`

Patch application on fresh ZIP extraction:

- `git apply --check`: passed
- `git apply`: passed

## Runtime note

The local container is Node `v18.20.4`; the repository `.nvmrc` expects Node `22`. P23 updates the perf tripwire so Node 18 lean validation skips only the Node-22-only module-mocking call-count probe instead of failing incorrectly. Full release validation should still run under Node 22.

## Baseline findings

### Table-choice read model

Template: `qg_p4_word_class_noun_phrase_transfer`

Before patch:

- rows with raw row options: `2`
- rows with safe read-model row options: `0`

After patch:

- rows with raw row options: `2`
- rows with safe read-model row options: `2`

### Question-type rhythm

Baseline deterministic scan:

- cases with same-question-type run `>= 4`: `1084`
- worst run: `9`

Patched deterministic scan:

- cases with same-question-type run `>= 4`: `0`

## Fresh-applied targeted tests

All commands below were run after applying the patch to a fresh ZIP extraction.

| Check | Result |
|---|---:|
| `node --check worker/src/subjects/grammar/read-models.js` | pass |
| `node --check worker/src/subjects/grammar/selection.js` | pass |
| `node --test tests/grammar-engine-generation.test.js` | pass, `18/18` |
| `node --test tests/grammar-selection-core-freshness.test.js` | pass, `8/8` |
| `node --test tests/grammar-selection-perf-tripwire.test.js` | pass; Node/runtime-specific skips only |
| `node --test tests/grammar-qg-p9-table-choice-contract.test.js tests/grammar-qg-p10-table-render.test.js` | pass, `3449/3449` |
| `node --test tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p21-pool-expansion.test.js` | pass, `5/5` |
| `node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json` | pass, `0` violations, `0` warnings |
| `node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json` | pass, `1638` checks, `0` hard failures, `0` advisories |
| `npm run verify:grammar-qg-p21` | pass, `10/10` |

## Unverified limits

This package does not certify live production. It also does not certify visual asset completeness from the lean ZIP because lean archives may omit or placeholder heavy assets.
