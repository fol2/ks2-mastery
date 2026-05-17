# Grammar production-grade hardening contract

## Title and purpose

Grammar production-grade hardening: question quality, answer acceptance, and validation reliability.

Purpose: make current Grammar features robust enough for production use without adding new features. The first priority is learner-facing question quality and answer acceptance. Every generated or fixed Grammar question must be clear, fair, non-leaking, correctly marked, and regression-tested. Adjacent reward, Stars, Hero/monster, routing, UI, deployment, and hard-refresh behaviour must be checked only to the extent they can regress Grammar correctness or learner trust.

## Source authority

Primary authority for this package:

- Uploaded ZIP: `ks2-mastery-lean-05161311.zip`
- ZIP SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`
- ZIP size: `8065602` bytes
- ZIP integrity: `unzip -t` passed
- ZIP shape: rootless archive
- `.git` metadata: absent
- Runtime target: `.nvmrc` = `22`

Supplementary evidence:

- GitHub repo: `fol2/ks2-mastery`
- GitHub ref: `main`, exact-file fetch only
- GitHub was used to compare missing docs and implementation context. It is not authoritative over the uploaded ZIP unless the agent is explicitly implementing against GitHub `main`.

Authoritative source for implementation:

- If working from this package, apply the patch to the root of the uploaded ZIP extraction or an equivalent checkout containing the same files.
- If working from GitHub `main`, first confirm whether `main` still has the same bug. If it does, port the patch; if it does not, prove the same acceptance criteria with current source and record the divergence.

## Patch root and apply assumptions

Patch root: repository root. In the uploaded ZIP this is the rootless extraction directory containing `package.json`, `worker/`, `src/`, `tests/`, and `scripts/`.

Apply:

```bash
patch -p0 --dry-run < patches/001-grammar-tense-prompt-leak.patch
patch -p0 < patches/001-grammar-tense-prompt-leak.patch
```

If using Git instead of a ZIP extraction, `git apply` may also work, but `patch -p0` is the tested path for this package.

## Scope

In scope:

- Grammar question quality.
- Grammar answer acceptance.
- Learner-facing copy for current Grammar items.
- Regression tests/audits that prove current Grammar content is safe.
- Validation reliability where broken checks would allow bad Grammar content through.
- Adjacent checks for Grammar reward/Stars/monster/Hero connectivity only where they prove the Grammar patch did not regress those systems.
- Production deployment and live verification evidence after hard refresh.

Non-goals:

- No new Grammar feature work.
- No expansion of the content pool unless required to remove or replace a defective item.
- No reward redesign.
- No new Hero Mode behaviour.
- No new monster economy or Hero Pool work.
- No subject progression redesign.
- No production config changes unless deployment verification proves they are required.

## No-go areas unless directly required by a proven blocker

Do not touch:

- Reward/mastery/Stars semantics.
- Hero Mode, Hero scheduler, Hero economy, Hero Pool, or monster ownership logic.
- Subject progression and cross-subject scheduler rules.
- Production deployment configuration.
- Spelling/Punctuation/Arithmetic/Reasoning/Reading subject engines.
- Authentication/session infrastructure.
- Visual assets.

If any of these areas must be touched, document the blocker, isolate the minimal change, and re-run the full adjacent regression set.

## Files/areas likely to change

Expected patch files:

- `worker/src/subjects/grammar/content.js`
- `tests/grammar-qg-p20-answer-acceptance.test.js`

Possible follow-up files if further validation reveals issues:

- `worker/src/subjects/grammar/answer-spec.js`
- `tests/grammar-answer-spec.test.js`
- `tests/grammar-answer-spec-audit.test.js`
- `tests/grammar-qg-p20-quality-hardening.test.js`
- `tests/grammar-qg-p24-distractor-quality.test.js`
- `scripts/audit-grammar-qg-p21-local-repetition.mjs`
- `scripts/audit-grammar-question-generator.mjs`
- `scripts/audit-grammar-content-quality.mjs`

## Exact implementation tasks

1. Apply or port `patches/001-grammar-tense-prompt-leak.patch`.
2. Confirm `qg_p18_p16_tense_aspect_fix_wrong_form` no longer serialises prompts that reveal the corrected answer after `→` or `->`.
3. Confirm the item remains `manualReviewOnly` and `nonScored`; do not convert it to auto-marking.
4. Add/keep the regression test that checks seeds `1..30` for this family.
5. Run a full Grammar prompt-surface leak scan across all templates and seeds `1..30`. Flag answer leaks, placeholder copy, broken punctuation, awkward generated wording, and any prompt that reveals the response for a fix/rewrite task.
6. Review remaining arrow prompts. Active/passive explanation prompts may be acceptable only if the task is explicitly to explain a shown transformation; record this as reviewed rather than assuming it is safe.
7. Confirm P20c hyphen/dash answer acceptance still rejects dash substitutions for hyphen tasks and still accepts dash marks only where the target answer is a dash label.
8. Confirm answer-spec audit denominators match current content: no missing answer specs, no invalid answer specs, no accidental auto-marking for open writing tasks.
9. Fix or prove the `npm run audit:grammar-qg:p21-local-repetition` lifecycle issue. It must pass and exit `0`; printing pass while hanging is not acceptable for CI/release gates.
10. Resolve the doc-backed audit test boundary. In a full repo checkout, `tests/grammar-answer-spec-audit.test.js` must pass. In a lean ZIP validation package, either include the required docs or make the test explicitly source-boundary aware without weakening the full-checkout gate.
11. Review P24/P25 render-harness behaviour. A missing optional browser dependency should not produce a misleading source failure in lean review environments, while full CI must still run the render checks with dependencies installed.
12. Run adjacent Grammar reward/monster/UI model checks to prove no regression in Grammar event projection, Stars, monster roster, Concordium invariants, or Hero notification boundary.
13. Do not mark the work `DONE` until live production is verified as described below.

## Previous-work validation tasks

Validate these prior claims from source/tests, not reports alone:

- P20c hyphen/dash fix is present: punctuationPattern tasks must not fold en/em dashes into hyphens.
- Generated source compaction preserves `manualReviewOnly` and `nonScored` fairness flags.
- Grammar answer-spec audit denominator and answer-spec kind counts are internally consistent with current content.
- Recovered closed-auto-mark families are truly deterministic and do not accept broad open text.
- Manual-review-only tasks stay non-scored and cannot accidentally create Stars/mastery evidence through auto-marking.
- Grammar reward/monster hooks react to Grammar events only and do not mutate Hero/monster state from the question patch.

## Acceptance criteria

The implementation is accepted only when all of the following are true:

- No Grammar fix/rewrite/fill learner prompt exposes the corrected answer unless the question is explicitly an explanation task showing both sides of a transformation.
- `qg_p18_p16_tense_aspect_fix_wrong_form` prompts are rewritten from answer-leaking form into instruction-only form, for example: `Fix this sentence so it uses the present perfect: I finish my homework.`
- The patched family remains `manualReviewOnly: true` and `nonScored: true`.
- P20c hyphen/dash regression remains fixed.
- All Grammar answer-spec and answer-acceptance tests pass.
- All Grammar QG audits listed below pass.
- `npm run audit:grammar-qg:p21-local-repetition` passes and exits `0` without hanging.
- Doc-backed answer-spec audit passes in a full checkout, or the lean-ZIP boundary is explicitly handled without weakening full-checkout validation.
- No reward/mastery/Stars/Hero/monster/progression/production-config files change unless separately justified by a proven blocker.
- Browser/hard-refresh Grammar journey works on production after deployment.
- Reviewer loop returns exact PASS lines from both reviewers.

## Required commands/tests/audits

From repository root, using Node matching `.nvmrc`:

```bash
node --version
npm --version
npm ci

patch -p0 --dry-run < patches/001-grammar-tense-prompt-leak.patch
patch -p0 < patches/001-grammar-tense-prompt-leak.patch

node --test tests/grammar-answer-spec.test.js tests/grammar-answer-spec-audit.test.js tests/grammar-qg-p20-answer-acceptance.test.js
node --test tests/grammar-question-generator-audit.test.js tests/grammar-qg-p20-quality-hardening.test.js tests/grammar-qg-p21-pool-expansion.test.js tests/grammar-qg-p21-local-repetition.test.js tests/grammar-qg-p24-distractor-quality.test.js tests/grammar-qg-p25-feedback-learning-cue.test.js

npm run audit:grammar-qg
npm run audit:grammar-qg:deep
npm run audit:grammar-qg:p20-quality
npm run audit:grammar-qg:open-response-fairness
npm run audit:grammar-qg:p21-local-repetition

node --test tests/grammar-rewards.test.js tests/grammar-monster-roster.test.js tests/grammar-concordium-invariant.test.js tests/grammar-phase5-invariants.test.js tests/grammar-star-trust-contract.test.js tests/grammar-star-events.test.js tests/grammar-ui-model.test.js
```

Add a custom prompt-leak scan over all Grammar templates and seeds `1..30`. The scan must record every arrow prompt and every prompt containing the expected answer for fix/rewrite/fill tasks. The local agent must include the scan code or command output in final evidence.

Run any repo-wide command normally used before deployment, such as `npm run check`, `npm test`, or CI workflow equivalents, if available in the target checkout. If a command cannot run, explain why and provide the strongest valid substitute; do not fabricate a pass.

## Regression checks

- Hard-refresh Grammar route after deployment.
- Start Grammar session, answer at least one selected-response item, one constructed deterministic item, and one manual-review-only item.
- Confirm wrong answers are rejected where the target punctuation/grammar feature is missing.
- Confirm harmless formatting is accepted only where answer-spec rules allow it.
- Confirm manual-review-only items do not award score/mastery/Stars as if auto-marked.
- Confirm reward/Stars/monster UI still reflects subject-owned Grammar evidence only.
- Confirm Hero/monster notifications are not created by the patch except normal existing session-end behaviour.
- Confirm browser console has no new errors and network calls do not show stale cached bundles after hard refresh.
- Confirm `/demo` or the authenticated route does not time out in the verification environment.

## Production deployment and verification requirement for `ks2.eugnel.uk`

`DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.

`DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.

`DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.

Live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- Timestamp
- Release/version/commit/build identifier where available
- Deployment command or deployment source if applicable
- Hard-refresh/browser check performed
- Specific user journey checked
- Pass/fail result
- Logs/screenshots/console/network notes where relevant

If production cannot be checked, final status must be:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

It must not be reported as `DONE`.

## Required final evidence

The local agent must produce:

- Source authority statement with ZIP hash or GitHub commit/ref actually used.
- Diff/patch summary.
- Exact changed files.
- All command outputs or links to logs.
- Prompt-leak scan output.
- Answer-acceptance evidence, including hyphen/dash vectors and manual-review-only non-scored proof.
- Grammar QG audit outputs.
- Adjacent reward/Stars/monster/UI model regression outputs.
- Reviewer outputs from Code Reviewer and Contract Auditor.
- Production verification evidence or explicit `PRODUCTION NOT PROVEN` status.

## Reviewer loop requirement

After implementation, run two independent review passes:

- Code Reviewer.
- Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, “good to have” comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.
