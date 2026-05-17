# Local Codex execution contract: Reading production hardening

## Title and purpose

Reading production hardening: question quality, answer acceptance, learner-facing robustness, and evidence-safe deployment.

Purpose: make the current Reading feature robust enough for production-grade use without adding unrelated features. The first priority is the question and answer acceptance layer: no obvious false positives, no unhandled malformed learner payloads, no answer leaks, no stale-session glitches, no weak generated copy, and no overclaimed completion.

## Source authority

Primary authority for this package: uploaded ZIP `ks2-mastery-lean-05161311.zip`.

ZIP identity:

- ZIP SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`
- ZIP size: `8065602` bytes
- Integrity: `unzip -t` passed with no compressed-data errors
- Extraction shape: root-level repository snapshot, no `.git` metadata
- `.nvmrc`: `22`

GitHub layer:

- Repo discovered: `fol2/ks2-mastery`
- Default branch: `main`
- GitHub `main` is supplemental unless the local agent is explicitly instructed to work from GitHub `main` or another ref.
- The ZIP and GitHub `main` differ for at least `worker/src/subjects/reading/engine.js`; the ZIP original local Git-blob SHA was `0f9948d80521b73c4eb0ebb08b5d4b113930fa3c`, while a GitHub `main` fetch returned blob SHA `8cfec78e3ea93e69d185b7bbfcc77d5a8bd5714b`.
- Do not assume the ZIP and GitHub target are byte-identical. Before applying this package to GitHub work, compare the target branch/ref and re-run all validation on that exact local checkout.

Authoritative implementation target:

- If working from this uploaded ZIP snapshot, apply the patch exactly as supplied.
- If working from GitHub, the authoritative source becomes the named local checkout/ref/PR/commit. First verify whether the same defects exist on that checkout, then adapt the patch minimally.

## Patch root and apply assumptions

Patch root: repository root, the directory containing `package.json`, `worker/`, `src/`, `shared/`, and `tests/`.

Patch file:

`patches/001-reading-answer-acceptance-hardening.patch`

Dry-run:

```bash
patch --dry-run -p1 < patches/001-reading-answer-acceptance-hardening.patch
```

Apply:

```bash
patch -p1 < patches/001-reading-answer-acceptance-hardening.patch
```

The patch was dry-run and applied successfully on a fresh extraction of `ks2-mastery-lean-05161311.zip`.

## Scope

In scope:

- Reading answer acceptance and deterministic marking.
- Reading question-quality audit coverage.
- Reading content pool sufficiency and staged expansion planning.
- Reading UI robustness only where it affects saved answers, marking, delayed feedback, answer leaks, navigation, hard refresh, and learner-facing clarity.
- Reading read model boundaries and answer-safe metadata.
- Reading connectivity to Hero task envelopes and Reading-owned monster reward projection, but only to verify no regressions.
- Local, CI, reviewer, and production validation evidence.

## Non-goals

- Do not redesign the Reading product.
- Do not add a new Reading mode unless required to fix an acceptance defect.
- Do not expand the bank before acceptance and review gates are hardened.
- Do not change Spelling, Grammar, Punctuation, Arithmetic, Reasoning, subject progression, Hero economy, reward policy, Stars semantics, production configuration, deployment scripts, or monster ownership unless a Reading regression directly requires it.
- Do not claim production completion from local or CI checks.

## No-go areas

Must not be touched unless the final evidence proves a Reading-critical dependency:

- `worker/src/subjects/grammar/**`
- `worker/src/subjects/punctuation/**`
- `worker/src/subjects/spelling/**`
- `src/subjects/grammar/**`
- `src/subjects/punctuation/**`
- `src/subjects/spelling/**`
- reward/mastery/Stars semantics outside Reading-owned verification
- Hero Coins, Hero Camp, Hero Pool economy, or monster ownership
- production secrets, `wrangler.jsonc`, deployment account config
- unrelated UI styling or dashboard layout

## Files and areas likely to change

Likely:

- `worker/src/subjects/reading/engine.js`
- `tests/worker-reading-runtime.test.js`
- `scripts/audit-reading-content-quality.mjs`
- new focused Reading adversarial audit script if needed
- `tests/reading-content-contract.test.js`
- `tests/reading-phase*-*.test.js`
- `shared/reading/phase*-expansion.js` only after gates are green and expansion is explicitly approved
- `src/subjects/reading/components/ReadingPracticeSurface.jsx` only for answer-save/marking/feedback/hard-refresh issues
- `worker/src/subjects/reading/read-models.js` only for answer leak or read-model safety issues

## Exact implementation tasks

1. Apply or adapt the included answer-acceptance patch.

   The patch fixes two concrete defects:

   - Leading `not ` model-answer parrots could receive full marks across many short, evidenceShort, and open Reading checks.
   - Malformed non-array multi-select payloads could throw instead of being safely marked wrong.

2. Re-run the baseline probes on the target checkout before and after the patch.

   Required before/after evidence:

   - Count of negated model-answer false positives across short/evidenceShort/open questions.
   - Count of malformed multi-select throws.
   - At least five representative row IDs from any baseline failure set.
   - Confirm source-affirmed negation remains accepted where the text actually requires it, for example evidence such as `not a museum of dead things`.

3. Harden Reading audit coverage.

   Add or formalise an audit that checks:

   - model answers are accepted for all markable question types;
   - `not ${modelAnswer}` is not accepted for full marks unless an explicit source-affirmed negative phrase is the expected answer;
   - evidence-overlap fallback cannot bypass contradiction checks;
   - malformed payloads for every interactive type are wrong/rejected cleanly, not thrown;
   - answer metadata does not leak before marking in immediate, delayed, stretch, list, and test modes;
   - generated stems, model answers, hints, explanations, and passage text have no unresolved placeholders;
   - repeated stem-shape and repeated model-answer checks remain strict;
   - every evidence quote exists in the passage source;
   - strict papers remain 50 marks and use valid passage/question references.

4. Review Reading pool quality and expansion.

   Current ZIP count is `7112` questions, `714` passages, and `243` papers. The issue is no longer only raw count. The local agent must assess quality, coverage, repetition, and marking validity before any expansion.

   Expansion is allowed only after the answer-acceptance gate is green. If expansion proceeds, it must be staged, audited, and reviewer-gated toward `10K+`, with no generated-answer shortcuts accepted without negative vectors and human review samples.

5. Validate Reading UI and UX robustness.

   Check:

   - guided one-question flow;
   - list-mode section save;
   - mark-section flow;
   - stretch challenge delayed feedback;
   - strict paper flow;
   - hard refresh during an active session;
   - stale expected session/question/section ID rejection;
   - duplicate submit and back/next behaviour;
   - disabled states while pending command;
   - screen-reader/keyboard access for all input types;
   - no model answers or explanations before marking.

6. Verify adjacent systems without changing them.

   Confirm:

   - Reading stays a ready subject in the subject registry/runtime.
   - Hero reading provider and launch adapter still launch appropriate Reading envelopes.
   - Reading answer-completion events still project into Reading-owned monster rewards only.
   - Reading reward high-water/100-Star display remains release-scoped and does not mutate unrelated subjects.
   - No Hero economy/Coins or non-Reading monsters are touched.

7. Prepare production deployment evidence.

   Run the local and CI commands first. Then deploy or verify the already-deployed build. The final claim must use the required status wording below.

## Previous-work validation tasks

Validate all previous local-agent or completion-report claims against source, scripts, tests, generated reports, and observable behaviour. Do not trust prose-only completion notes.

Specifically verify:

- Reading is genuinely Worker-command-backed, not browser-local production marking.
- Reading content release/version/count claims match `shared/reading/content.js`, browser metadata, worker read models, smoke scripts, and generated audit output.
- Phase 5/6/7 expansion claims match actual passage/question/paper counts and quality gates.
- Any claim that Reading is live on production has live evidence from `https://ks2.eugnel.uk`, not only local scripts.
- Any claim that Hero or monsters work with Reading is validated by runtime tests and read-model checks, not only provider presence.
- Any claim that answer acceptance is fixed includes negative vectors and malformed payload probes.

## Acceptance criteria

Local/CI acceptance:

- Patch applies cleanly or is adapted minimally with an explained drift note.
- Reading answer acceptance tests pass.
- Reading content audit passes.
- Negated model-answer probe reports `0` suspicious full-mark acceptances, or every non-zero exception is justified as source-affirmed negative evidence and covered by a test.
- Malformed multi-select and malformed match/order/open/evidence payloads never crash the marking path.
- Model-answer acceptance remains intact.
- Source-affirmed negative evidence remains accepted.
- Delayed-feedback modes do not leak answers, explanations, model answers, matched rubric labels, or session result before marking.
- Hard refresh/resume does not lose saved answers or corrupt session identity.
- Stale/duplicate command safety is preserved.
- Reading Hero provider and Reading reward/monster projection tests still pass.
- No unrelated subject/reward/Hero/deployment config changes are present.

Production acceptance:

- `DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.
- `DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.
- `DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.
- If production cannot be checked, the final status must be `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`, not done.

Live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- timestamp
- release/version/commit/build identifier where available
- deployment command or deployment source if applicable
- hard-refresh/browser check performed
- specific user journey checked
- pass/fail result
- logs/screenshots/console/network notes where relevant

## Required commands, tests, and audits

Run from the exact target checkout with dependencies installed and Node matching `.nvmrc` where possible.

Minimum local commands:

```bash
node --version
npm --version
npm run audit:reading-content
node --test tests/worker-reading-runtime.test.js
node --test tests/reading-content-contract.test.js tests/reading-phase5-next1000-contract.test.js tests/reading-phase6-scale-contract.test.js tests/reading-phase7-scale-contract.test.js tests/reading-subject-registry.test.js tests/worker-reading-runtime.test.js
node --test tests/reading-session-interface.test.js
```

Also run any new Reading adversarial audit script added for this task.

Recommended wider checks:

```bash
npm test -- --test-name-pattern='reading|hero|reward|monster|subject runtime'
npm run check
```

Production smoke commands, once deployed or when validating live:

```bash
npm run smoke:production:reading
npm run smoke:production:reading-stretch
npm run smoke:production:reading-landing
```

If the production scripts require env/auth/session parameters, provide the exact command used and redact secrets.

## Regression checks

- No answer metadata leak before marking.
- No false full-credit result for simple negated model-answer parrots.
- No crash on malformed learner payloads.
- No regression in model-answer acceptance.
- No regression in `not only ...`, source-affirmed negative evidence, and explicit correction cases already covered by tests.
- No same-passage immediate repeat caused by abandoned session flow.
- No duplicate/stale response overwrite.
- No hard-refresh active-session loss.
- No Reading bundle leakage of answer-bearing content into browser metadata.
- No Hero launch adapter regression for Reading.
- No Reading monster/reward projection regression.
- No cross-subject reward/mastery mutation.

## Required final evidence

The local agent final note must include:

- exact source ref: ZIP hash or GitHub branch/ref/commit/PR
- exact patch/diff summary
- commands run and pass/fail results
- generated audit/report paths
- before/after adversarial probe counts
- reviewer outputs
- production status using the approved wording
- production evidence details if claiming live verified
- remaining limitations and explicit non-goals

## Reviewer loop requirement

After implementation, run two independent review passes:

- Code Reviewer
- Contract Auditor

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, good-to-have comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.

## Final status rule

Allowed final statuses only:

- `DEPLOYMENT READY` when local/CI/reviewer checks pass but live production is not verified.
- `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN` when implemented and locally verified but production cannot be checked.
- `DONE — LIVE VERIFIED` only with complete live evidence from `https://ks2.eugnel.uk` after hard refresh.

Never use plain `DONE` for this task.
