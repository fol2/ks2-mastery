# Validation summary

## Verdict

The uploaded Grammar snapshot is not production-grade yet. Core Grammar answer-spec and P20 answer acceptance tests are strong and the previous P20c hyphen/dash fix is present, but I found one real learner-facing question-quality blocker: `qg_p18_p16_tense_aspect_fix_wrong_form` displayed the corrected sentence after an arrow in the prompt, so the child could see the answer before responding.

The included patch removes that answer leak and adds a regression test. It does not touch rewards, mastery, Stars, Hero Mode, monsters, subject progression, or production configuration.

## Patch status

Patch file: `patches/001-grammar-tense-prompt-leak.patch`

Patch root: repository root / rootless extracted ZIP root.

Dry-run command:

```bash
patch -p0 --dry-run < patches/001-grammar-tense-prompt-leak.patch
```

Apply command:

```bash
patch -p0 < patches/001-grammar-tense-prompt-leak.patch
```

Observed on fresh extraction:

- `patch -p0 --dry-run` passed.
- `patch -p0` applied cleanly.
- Fresh patched answer-spec/answer-acceptance tests passed.

## Learner-facing blocker found

Baseline scan across all Grammar templates and seeds `1..30` found 60 prompts containing an arrow.

- `qg_p18_p16_tense_aspect_fix_wrong_form`: 30 prompts. These were a blocker because the prompt was a fix task but exposed the corrected answer, for example: `Fix this attempted present perfect sentence: I finish my homework. → i have finished my homework.`
- `qg_p18_p18_active_passive_application_transfer`: 30 prompts. These appear to be explanation prompts that show both active and passive sentences intentionally; they should still be reviewed, but they are not the same answer-leak class.

Patched scan result:

- Total arrow prompts: 30.
- Target tense/aspect fix-wrong-form arrow prompts: 0.
- Remaining arrow prompts are the active/passive explanation family only.

## Local commands run

Passed locally after patch:

```bash
node --test tests/grammar-answer-spec.test.js tests/grammar-qg-p20-answer-acceptance.test.js
npm run audit:grammar-qg
npm run audit:grammar-qg:deep
npm run audit:grammar-qg:p20-quality
npm run audit:grammar-qg:open-response-fairness
node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-quality-hardening.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js
node --test tests/grammar-rewards.test.js tests/grammar-monster-roster.test.js tests/grammar-concordium-invariant.test.js tests/grammar-phase5-invariants.test.js tests/grammar-star-trust-contract.test.js tests/grammar-star-events.test.js tests/grammar-ui-model.test.js
```

Observed counts:

- Patched answer-spec/answer-acceptance run: `35/35` pass.
- Patched core Grammar QG run: `25/25` pass.
- Patched adjacent reward/monster/UI model run: `288/288` pass.
- P20 quality audit: PASS.
- Open-response fairness audit: PASS, 0 findings.
- Grammar QG audit/deep audit: pass with no missing/invalid answer specs and no low-depth generated templates.

## Validation advisories

1. `tests/grammar-answer-spec-audit.test.js` fails in the lean ZIP because the ZIP profile omits `docs/plans/**`, while the test expects `docs/plans/james/grammar/grammar-answer-spec-audit.md`. GitHub `main` has that file, so this is a source-boundary/lean-ZIP packaging failure unless the agent is validating a full checkout.
2. `npm run audit:grammar-qg:p21-local-repetition` printed pass and wrote a JSON report, but the npm command did not reliably terminate in the ZIP run. The local agent must fix or prove this; a passing printed line is not enough if CI can hang.
3. Before `npm ci`, `tests/grammar-qg-p24-distractor-quality.test.js` hard-failed because it statically imports `jsdom`; the adjacent P25 render test already degrades by dynamically loading and skipping when the render harness is unavailable. After `npm ci`, the P24 test passed. This is a validation-environment hardening advisory, not a learner-facing bug.
4. Production is not proven. The landing page was reachable, but `/demo` timed out and no live Grammar journey or hard-refresh journey was verified.

## Files changed by patch

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-qg-p20-answer-acceptance.test.js`

No reward/mastery/Stars/Hero/monster/progression/production-config files are changed.
