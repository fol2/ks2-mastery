# Validation summary

## Verdict

The uploaded ZIP Arithmetic implementation is functioning at a basic/runtime-test level but is not production-grade on question and answer acceptance without hardening.

Two learner-facing issues were found in the ZIP snapshot:

1. Numeric answer acceptance was too permissive: malformed digit-spaced answers such as `4 4` and `8 7 8` could be accepted as `44` and `878`.
2. Place-value partition stems sometimes displayed zero-value expanded terms, e.g. an unnecessary `+ 0` in expanded notation.

One flow-quality issue was found:

3. `goal: 'due'` did not reliably target currently due skills, and a no-due due-review session had no bounded completion target.

The included patch is minimal and targets those issues only.

## Source boundary

ZIP primary snapshot: `/mnt/data/ks2-mastery-lean-05161311.zip`.

ZIP SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`.

GitHub repository identified: `fol2/ks2-mastery`, default branch `main`.

ZIP and GitHub `main` are divergent for `shared/arithmetic/content.js` and `worker/src/subjects/arithmetic/engine.js`. This package does not claim the ZIP patch applies cleanly to GitHub `main` without reconciliation.

Local-run evidence proves only the extracted ZIP snapshot in this environment.

Production evidence is not proven for Arithmetic.

## Baseline local evidence from ZIP

Runtime environment in ChatGPT container:

- Node: `v18.20.4`
- npm: `9.2.0`
- ZIP `.nvmrc`: `22`
- `node_modules`: missing

Baseline targeted tests:

- `node --test tests/worker-arithmetic-runtime.test.js`: PASS, 18/18.
- `node --test tests/arithmetic-stem-renderer.test.js tests/arithmetic-renderer-css.test.js`: PASS, 11/11.
- `npm test -- tests/worker-arithmetic-runtime.test.js`: not runnable here because preflight reported missing `node_modules`.

Baseline adversarial audit:

- Generated cases checked: 180,000.
- Correct generated answers rejected: 0.
- Malformed digit-spaced answers accepted: 93,471.
- Place-value zero expanded terms found: 2,003.

Baseline due-review probe:

- Due work existed for `number_bonds`.
- First due-review question targeted `column_subtraction`, not the due skill.
- No-due due-review remained in session after 10 correct answers.

## Patch summary

Patch file: `patches/001-arithmetic-question-acceptance-and-due-review-hardening.patch`.

Files changed:

- `shared/arithmetic/content.js`
- `worker/src/subjects/arithmetic/engine.js`
- `tests/worker-arithmetic-runtime.test.js`

Patch effects:

- Adds disciplined number grouping validation while preserving plain numbers, valid comma grouping, and valid space grouping.
- Rejects malformed digit-spaced number answers.
- Removes zero-value expanded terms from place-value partition generated stems.
- Adds due-skill targeting for due-review sessions.
- Adds bounded smart-practice fallback for due-review when no work is due.
- Prevents due-review completion unless the latest due-clearing answer is correct.
- Adds tests for the new acceptance and due-review behaviour.

## Patched local evidence

Patch dry-run against a fresh ZIP extraction: PASS.

Patch apply against a fresh ZIP extraction: PASS.

Patched targeted tests:

- `node --test tests/worker-arithmetic-runtime.test.js`: PASS, 19/19.
- `node --test tests/arithmetic-stem-renderer.test.js tests/arithmetic-renderer-css.test.js`: PASS, 11/11.
- `npm test -- tests/worker-arithmetic-runtime.test.js`: not runnable here because preflight reported missing `node_modules`.

Patched adversarial audit:

- Generated cases checked: 180,000.
- Correct generated answers rejected: 0.
- Malformed digit-spaced answers accepted: 0.
- Place-value zero expanded terms found: 0.

Patched due-review probe:

- Due work existed for `number_bonds`.
- First due-review question targeted `bonds_missing` / `number_bonds`.
- No-due due-review completed as a bounded 10-question smart session.

## Monster/Codex connectivity observation

The ZIP contains Arithmetic reward and monster/Codex integration paths:

- `src/platform/game/mastery/arithmetic.js`
- `src/platform/game/monsters.js`
- `worker/src/projections/rewards.js`
- `worker/src/hero/providers/arithmetic.js`
- `worker/src/hero/launch-adapters/arithmetic.js`

The targeted runtime test suite includes `arithmetic reward projection updates the shared monster codex without touching other subjects`, and it passed before and after the patch.

The patch does not change reward, Stars, Hero Mode, monster roster, subject progression, or production configuration.

## Production check

Origin reached: `https://ks2.eugnel.uk`.

Observed homepage text listed KS2 Spelling, Grammar, and Punctuation practice. Demo fetch timed out. A live Arithmetic journey was not verified.

Production status for Arithmetic: NOT PROVEN.

Required final status if no further live check is performed: `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`.
