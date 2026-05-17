# Arithmetic production-hardening execution contract

## Title and purpose

Title: Arithmetic question-quality, answer-acceptance, due-review, and reward-connectivity hardening.

Purpose: make the current Arithmetic feature robust enough for production validation without adding new learner-facing features. The first priority is flawless question generation and answer acceptance. Secondary priorities are safe due-review behaviour, stable reward/Codex/monster connectivity, and evidence strong enough for a reviewer to trust deployment readiness.

## Source authority

Primary source authority for this package: uploaded ZIP snapshot `ks2-mastery-lean-05161311.zip`.

ZIP path in ChatGPT environment: `/mnt/data/ks2-mastery-lean-05161311.zip`.

ZIP SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`.

ZIP shape: rootless lean archive, no `.git` metadata. Integrity check passed. `.nvmrc` expects Node `22`; local ChatGPT container had Node `v18.20.4`, npm `9.2.0`.

GitHub repository identified through connector: `fol2/ks2-mastery`, default branch `main`.

GitHub files fetched for comparison:

- `shared/arithmetic/content.js` at GitHub `main`, blob SHA from connector: `f8eb7d6ff4e8530188eff684d9e2e87a39cc98eb`.
- `worker/src/subjects/arithmetic/engine.js` at GitHub `main`, blob SHA from connector: `3a47f805b39a319125ca82e4942a00cbbcf43d00`.

Local ZIP blob SHAs for the same paths:

- `shared/arithmetic/content.js`: `9764a27ceb889c390995f5ab7e17793f050bb448`.
- `worker/src/subjects/arithmetic/engine.js`: `88bd323d31ebb04975b7ec16ead48a7efd9a11da`.

Interpretation: ZIP and GitHub `main` are divergent for the core Arithmetic source files. This package is ZIP-authoritative and the patch is generated against the uploaded ZIP snapshot. Before applying to GitHub `main`, the local agent must reconcile the patch with current `main` or the target branch/ref and record any drift.

Production authority: not proven. The public homepage at `https://ks2.eugnel.uk` was reachable and described Spelling, Grammar, and Punctuation. Demo fetch timed out. A live Arithmetic learner journey was not verified.

## Patch root and apply assumptions

Patch root: repository root matching the rootless ZIP layout.

Patch file: `patches/001-arithmetic-question-acceptance-and-due-review-hardening.patch`.

Expected apply command from repository root:

```bash
patch -p1 --dry-run < patches/001-arithmetic-question-acceptance-and-due-review-hardening.patch
patch -p1 < patches/001-arithmetic-question-acceptance-and-due-review-hardening.patch
```

The patch was dry-run and applied successfully against a fresh extraction of `ks2-mastery-lean-05161311.zip`.

## Scope

In scope:

- Arithmetic generated-question correctness.
- Arithmetic answer parser and marker acceptance/rejection rules.
- Arithmetic due-review goal behaviour where the existing goal can produce weak learner experience.
- Arithmetic stem rendering and formal-layout regressions.
- Arithmetic reward-unit/Codex/monster projection connectivity checks.
- Local and CI-ready validation evidence.
- Production verification wording and final-status discipline.

## Non-goals

Do not add new modes, new subjects, new reward economies, new monster art, new shop/currency mechanics, new dashboards, new Hero Mode surfaces, or new curriculum scope.

Do not redesign the whole Arithmetic mastery model in this pass. If evidence semantics are judged too weak for production, report it as a blocker/advisory with a minimal follow-up contract.

## No-go areas

Do not touch unrelated Spelling, Grammar, Punctuation, Reading, Reasoning, Stars, Hero Mode, monster rosters, subject progression, production config, auth/session plumbing, Cloudflare/D1 migrations, or deployment configuration unless an Arithmetic acceptance criterion directly requires it.

Do not change reward/mastery/Stars/Hero/monster semantics except to validate that current Arithmetic reward-unit projection remains connected and does not mutate other subjects.

Do not weaken stale-session, stale-question, duplicate-submit, redaction, or idempotency checks.

## Files likely to change

The included patch changes only:

- `shared/arithmetic/content.js`
- `worker/src/subjects/arithmetic/engine.js`
- `tests/worker-arithmetic-runtime.test.js`

Areas to inspect, but not necessarily change:

- `shared/arithmetic/metadata.js`
- `worker/src/subjects/arithmetic/commands.js`
- `worker/src/subjects/arithmetic/read-models.js`
- `src/subjects/arithmetic/components/ArithmeticPracticeSurface.jsx`
- `src/subjects/arithmetic/components/ArithmeticQuestionStem.jsx`
- `src/subjects/arithmetic/stem-renderer.js`
- `src/platform/game/mastery/arithmetic.js`
- `src/platform/game/monsters.js`
- `worker/src/projections/rewards.js`
- `worker/src/hero/providers/arithmetic.js`
- `worker/src/hero/launch-adapters/arithmetic.js`
- `scripts/arithmetic-production-smoke.mjs`

## Exact implementation tasks

1. Reconcile source authority.
   - Identify the exact target ref/branch/commit before modifying code.
   - Compare the target ref with this ZIP patch for `shared/arithmetic/content.js` and `worker/src/subjects/arithmetic/engine.js` because ZIP and GitHub `main` diverged in this review.
   - Apply the patch only after confirming the target source contains equivalent vulnerable logic or manually adapt it.

2. Harden numeric answer acceptance.
   - Reject digit-spaced malformed answers such as `4 4`, `8 7 8`, `12 34`, and `1 2 3 4`.
   - Continue accepting plain digits (`1234`), well-formed comma grouping (`1,234`), and well-formed space grouping (`1 234`) where appropriate.
   - Continue rejecting malformed comma grouping such as `12,34` and `1,23,4`.
   - Preserve zero-remainder notation only where the question explicitly allows it.

3. Remove zero-value expanded terms from generated place-value partition questions.
   - A stem like `456,702 = 400,000 + 50,000 + 6,000 + □ + 0 + 2` is not production-polished.
   - Generated expanded notation must omit zero-value terms while preserving the missing-value box and correct expected answer.

4. Harden the existing due-review goal.
   - If due work exists, the first generated practice item in a `goal: 'due'` session must target a currently due skill or due retry queue item where possible.
   - If no due work exists, `goal: 'due'` must not become an endless session. It may fall back to a bounded smart-practice target.
   - A wrong due-review answer must not mark the due review complete.

5. Preserve Worker-owned Arithmetic command safety.
   - Session start, submit, continue, finish, and end must remain Worker-owned.
   - Browser read models must not expose expected answers.
   - Stale session/question submissions and duplicate submits must remain rejected.

6. Validate reward/Codex/monster connectivity without changing unrelated systems.
   - Confirm Arithmetic reward unit projection still updates the shared monster Codex for Arithmetic only.
   - Confirm monster IDs used by Arithmetic mastery still exist in `src/platform/game/monsters.js`.
   - Confirm no Arithmetic hardening change mutates Spelling/Grammar/Punctuation reward state or Hero state.

7. Estimate learning-curve/fine-tuning risk for rollout.
   - Record whether the current 30-template/90-reward-unit model is sufficient for a thin-slice launch or only for controlled internal/demo use.
   - Check early learner tuning for difficulty bands, due-review selection, retry queue, and reward-unit inflation.
   - Do not inflate “production ready” status from local test pass alone.

## Previous-work validation tasks

Treat any prior claim that Arithmetic is working as a claim to validate, not proof.

Validate:

- All 30 Arithmetic templates generate across difficulty bands and accept their generated correct answer.
- Answer parser rejects malformed units, malformed grouping, malformed mixed numbers, multi-character digit answers, and answer-shape mismatches.
- Formal written-method visuals remain readable and do not use thousands commas inside algorithm rows.
- Place-value stems do not include zero expanded terms.
- Due-review goal targets due skills and has bounded fallback when no due work is available.
- Practice session question isolation still holds after submit.
- Test mode still delays marking until finish.
- Blank submissions do not poison adaptive mastery.
- Browser read model redacts answers.
- Reward projection updates only Arithmetic Codex state.
- Hero provider/launch-adapter connectivity is not broken by Arithmetic changes.
- Production evidence, if claimed, includes live origin/timestamp/release id/hard-refresh/user journey/log notes.

## Acceptance criteria

A change may be called `DEPLOYMENT READY` only when all local/CI/reviewer checks pass and the change can be directly deployed.

A change may be called `DONE — LIVE VERIFIED` only when it is deployed or already present on `https://ks2.eugnel.uk`, verified after hard refresh, and usable on the live site.

`DONE` by itself is forbidden.

Minimum acceptance:

- Patch applies cleanly to the target source or is manually reconciled with documented drift.
- No correct generated Arithmetic answer is rejected across the audited template/difficulty/seed window.
- No malformed digit-spaced integer answer is accepted.
- No place-value partition question displays zero-value expanded terms.
- Due-review sessions target due skills when due work exists.
- Due-review sessions have a bounded path when no due work exists.
- Targeted Arithmetic Worker runtime tests pass.
- Targeted Arithmetic renderer tests pass.
- Full project test/check suite passes in the proper Node 22 environment, or every failure is proven unrelated and accepted by reviewers.
- Arithmetic reward/Codex/monster connectivity is explicitly verified.
- No unrelated reward, Stars, Hero Mode, monster roster, subject progression, auth, routing, or production config changes are introduced.

## Required commands/tests/audits

Run from the target repository root after installing dependencies in Node 22.

Required environment check:

```bash
node --version
npm --version
cat .nvmrc
npm install
```

Patch check:

```bash
patch -p1 --dry-run < patches/001-arithmetic-question-acceptance-and-due-review-hardening.patch
```

Targeted tests:

```bash
node --test tests/worker-arithmetic-runtime.test.js
node --test tests/arithmetic-stem-renderer.test.js tests/arithmetic-renderer-css.test.js
```

Full checks, using the repo's current canonical scripts:

```bash
npm test
npm run check
```

If `npm run check` is not the canonical script on the target ref, inspect `package.json` and run the closest full validation suite. Record the exact commands.

Adversarial audit equivalent to the included `validation/audit-arithmetic-question-acceptance.mjs`:

- all 30 templates;
- difficulties 0, 1, 2;
- at least seeds 1..2000 per difficulty;
- correct answer acceptance;
- malformed digit-space rejection;
- place-value zero-term rejection.

Suggested command after copying the audit script to repo root:

```bash
node audit-arithmetic-question-acceptance.mjs
```

Production smoke, after deployment or when checking an already deployed release:

```bash
node scripts/arithmetic-production-smoke.mjs --origin=https://ks2.eugnel.uk
```

If this script requires flags or credentials, record the exact working command and evidence.

## Regression checks

Check these after implementation:

- Arithmetic current question remains visible during feedback and cannot be marked twice.
- Continue-session requires fresh expected session/question identifiers.
- Test mode does not leak answers and does not mutate mastery until finish-test.
- Blank saves/blank test answers are handled without poisoning adaptive mastery.
- Fraction/mixed-number support remains intact, including Unicode vulgar fractions already covered by tests.
- Percentage/currency/unit handling remains strict.
- Formal written-method visuals are not degraded.
- Arithmetic reward projection does not touch other subjects.
- Monster/Codex state remains stable for Arithmetic monster IDs.
- Hero provider/launch adapters still return sane Arithmetic task envelopes and launch prefs.
- Hard refresh of deployed app does not lose routes/state needed for the checked Arithmetic journey.

## Production deployment and verification requirement

Production site: `https://ks2.eugnel.uk`.

Final live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- timestamp
- release/version/commit/build identifier where available
- deployment command or deployment source if applicable
- hard-refresh/browser check performed
- specific user journey checked
- pass/fail result
- logs/screenshots/console/network notes where relevant

Specific user journey to verify:

1. Hard refresh `https://ks2.eugnel.uk`.
2. Enter demo or authenticated learner path that exposes Arithmetic.
3. Start Arithmetic smart practice.
4. Answer at least one plain-number item correctly.
5. Try malformed digit-spaced equivalent and confirm it is rejected.
6. Check at least one generated place-value partition item if available, or run a seeded production smoke proving no zero expanded terms.
7. Create or simulate due-work state and verify due-review targets due work.
8. Confirm reward/Codex/monster projection for Arithmetic updates only Arithmetic state.
9. Note console/network errors and Worker logs where relevant.

If production cannot be checked, final status must be:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

not `DONE`.

## Required final evidence

The local agent's final response/report must include:

- target repo/ref/commit and source-authority decision;
- exact patch or commit SHA;
- commands run and pass/fail output;
- audit JSON/report for Arithmetic answer acceptance and generated-question quality;
- reward/Codex/monster connectivity evidence;
- source drift notes against this ZIP package if target source differs;
- production evidence if checked;
- explicit status using the required wording.

## Reviewer loop requirement

After implementation, the local agent must run two independent review passes:

- Code Reviewer.
- Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, good-to-have comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.
