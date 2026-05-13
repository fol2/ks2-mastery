# Grammar QG P24 — Post-Hardening Review, Distractor Quality, and Extra-Challenge Feedback Contract

Status: apply-ready patch package and repository candidate
Base: `ks2-mastery-lean-05130813.zip`
Primary evidence layer: uploaded ZIP and local ZIP runs
GitHub layer: supplementary only
Production layer: pending post-merge live smoke

## Purpose

P21 expanded the Grammar pool, P22 hardened selection performance and explanation quality, and P23 hardened table-choice fidelity plus practice rhythm. The current post-hardening snapshot is broadly healthy, but a deeper learner-visible scan found an old quality issue in manual-expansion explanation questions: older selected-response explanation items still use generic distractors such as “shortest option” and “sounds more exciting”.

P24 removes that learner-facing weakness and adds a small non-scored stretch cue after correct independent practice feedback. The goal is better KS2 preparation plus an optional beyond-KS2 thinking prompt without adding reward pressure or changing mastery.

## Required implementation

### R1. Remove generic learner-visible explanation distractors

Every generated Grammar question across the audited template/seed window must avoid these visible option labels:

- `It only depends on the final punctuation mark.`
- `It is correct because it is the shortest option.`
- `It is correct because it sounds more exciting.`
- `It is correct because the sentence has a capital letter.`
- `It is correct because the sentence mentions a person or thing.`

Manual-expansion selected-response questions must replace those labels at runtime with concept-specific misconception options. The generated source pack does not need to be rewritten.

### R2. Preserve deterministic marking and option uniqueness

The replacement must not change the correct answer, answer-spec kind, marks, template id, release id, or scheduler metadata. Replacement distractors must remain unique and must not equal the correct answer after smart-punctuation normalisation.

### R3. Strengthen the regression gate

Add a Grammar QG P24 test that scans all live templates across seeds `1..30` and fails if any of the generic distractor labels appear in learner-visible choices across `inputSpec.options`, `inputSpec.columns`, `inputSpec.rows[].options`, and `inputSpec.fields[].options`.

### R4. Add non-scored stretch feedback after correct answers

The Grammar session feedback panel should show one optional extra challenge after a correct answer only. It must not appear for incorrect, manual-review, or non-scored feedback.

The stretch cue should be question-type aware:

- choose/classify/identify/fill: explain why one wrong option is a trap;
- fix/rewrite/build: write one more example using the same rule;
- explain: turn the reason into one precise sentence using the grammar term;
- fallback: name the rule used in one sentence.

### R5. Regenerate active P21 evidence

The active P21 certification artefacts must not continue to show stale generic explanation labels after the runtime fix. Regenerate the P21 render inventory, quality register, distractor audit, and certification manifest, then prove the active `reports/grammar/grammar-qg-p21-*` artefacts contain none of the blocked labels.

### R6. Keep release gates stable

If the default full test gate exposes a generated-manifest race, the fix may be limited to atomic writes in `scripts/generate-monster-visual-manifest.mjs`. This is a release-gate stability fix only: it must not change monster assets, generated manifest content, reward/mastery behaviour, or any learner-facing monster semantics.

### R7. No scope creep

The patch must not change:

- `GRAMMAR_CONTENT_RELEASE_ID`;
- content template denominator;
- reward, Stars, mastery, Hero Mode, monster assets, monster manifest content, or event projection;
- spelling, punctuation, reading, arithmetic, or reasoning;
- D1 schema or Worker cross-subject runtime.

## Acceptance checks

Minimum checks for this package:

```bash
git apply --check patches/001-grammar-qg-p24-distractor-quality-and-stretch-feedback.patch patches/002-release-gate-atomic-monster-manifest-write.patch
node --check worker/src/subjects/grammar/content.js
node --check src/subjects/grammar/session-ui.js
node --check scripts/grammar-production-smoke.mjs
node --check tests/grammar-production-smoke.test.js
node --check tests/helpers/grammar-visible-choice-collector.js
node --check tests/helpers/grammar-render-harness.js
node --check tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-production-smoke.test.js tests/grammar-qg-p24-distractor-quality.test.js
node --test tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-ui-model.test.js
node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js
node scripts/audit-grammar-content-quality.mjs --seeds=1,2,3 --json
node scripts/audit-grammar-qg-p21-local-repetition.mjs --steps=60 --json
node scripts/audit-grammar-qg-p19-smart-practice.mjs --seeds=1..3 --json-out=... --md-out=...
node scripts/audit-grammar-open-response-fairness.mjs --seeds=1,2,3 --out=...
node scripts/generate-grammar-qg-render-inventory.mjs --out-prefix=grammar-qg-p21
node scripts/generate-grammar-qg-quality-register.mjs --out reports/grammar/grammar-qg-p21-quality-register.json
node scripts/audit-grammar-distractor-quality.mjs --out reports/grammar/grammar-qg-p21-distractor-audit.json
node scripts/generate-grammar-qg-certification-manifest.mjs --release=grammar-qg-p21-2026-05-11 --phase=grammar-qg-p21
npm test
npm run check
```

Expected results:

- Patch applies cleanly to the supplied ZIP snapshot.
- Generic explanation distractor count drops from non-zero to `0`.
- Grammar template denominator remains `546`.
- Content quality remains `0` hard failures and `0` advisories for seeds `1..3`.
- P21 local repetition remains `pass`, with `0` violations and `0` warnings.
- P19 smart practice remains `pass`, with `0` failures and `0` advisories for seeds `1..3`.
- Open-response fairness remains `pass`, with `0` findings for seeds `1..3`.
- The active P21 evidence bundle contains no blocked generic labels.
- The monster manifest generator can be rerun with no diff to `src/platform/game/monster-asset-manifest.js`.
- The production smoke harness includes P24 live template/seed cases and fails if those live read models expose any blocked generic labels.

## Non-goals

P24 does not add a new content release, expand template count, change scheduler weights, change marking semantics, change monster assets or monster semantics, or certify live production before the post-merge smoke evidence is attached.

## Release-readiness boundary

This package proves local ZIP-snapshot and repository candidate behaviour. Before live closure, run the normal Node 22 release gate, push through the GitHub main deployment path, and attach production smoke evidence from `https://ks2.eugnel.uk`.
