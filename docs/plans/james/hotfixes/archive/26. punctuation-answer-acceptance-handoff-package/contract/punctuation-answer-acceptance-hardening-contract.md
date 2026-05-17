# Local Codex Execution Contract — Punctuation Answer Acceptance Hardening

## Title and purpose

Harden the current Punctuation answer-acceptance layer for KS2 Mastery so existing Punctuation questions and answers are robust, learner-facing, and production-grade. This is not a feature-add task. The purpose is to remove false-positive marking glitches in the current Punctuation runtime while preserving existing generator breadth, learner copy quality, reward/Stars behaviour, monster connectivity, and Hero/Codex-adjacent surfaces.

The first priority is question and answer acceptance quality. A learner must not receive correct feedback for malformed punctuation answers such as duplicated terminal marks, missing final punctuation where the model requires it, or lower-case starts where the model requires an initial capital.

## Source authority

Primary patch authority:

- Uploaded ZIP: `ks2-mastery-lean-05161311.zip`
- ZIP SHA-256: `e45296872ddb84c23f725d1a81eaf3aaf5fc55dde2f7d8ec38523023707f465d`
- ZIP size: `8065602` bytes
- ZIP integrity: `unzip -t` passed; no errors detected
- Archive shape: rootless repository snapshot; no `.git` metadata
- Runtime seen locally: Node `v22.16.0`, npm `10.9.2`, `.nvmrc` = `22`

Supplementary GitHub authority:

- GitHub repo: `fol2/ks2-mastery`
- Default branch: `main`
- GitHub is supplementary for this handoff unless a named branch/ref/PR/commit is explicitly supplied by the project owner or local agent.
- Exact GitHub snippet comparison was made for `shared/punctuation/marking.js` on `main`; it showed the same relevant marking logic around direct-speech punctuation and paragraph passage shape that the ZIP probes exercised. This does not prove the entire ZIP equals GitHub `main`.

Production authority:

- No production authority is established by this package.
- Production is proven only by live evidence from `https://ks2.eugnel.uk` with timestamp, release/build/commit identifier, hard-refresh browser verification, and a checked user journey.

Authoritative source for this task:

- Use the uploaded ZIP snapshot as the patch base.
- Use GitHub `main` only to check drift before implementation and before final handoff.
- If the ZIP and GitHub differ, report the divergence and either rebase the patch onto the authoritative current branch/ref or request the project owner’s source-of-truth decision. Do not blend ZIP and GitHub claims.

## Patch root and apply assumptions

Patch file:

- `patches/001-punctuation-answer-acceptance-hardening.patch`

Apply root:

- Repository root / rootless ZIP extraction root.
- Expected paths from patch root:
  - `shared/punctuation/marking.js`
  - `tests/punctuation-marking.test.js`

Dry-run and apply commands:

```bash
git apply --check patches/001-punctuation-answer-acceptance-hardening.patch
git apply patches/001-punctuation-answer-acceptance-hardening.patch
```

If applying without Git metadata, initialise a temporary repo only for patch application checks:

```bash
git init
git apply --check patches/001-punctuation-answer-acceptance-hardening.patch
```

Do not apply the patch blindly to a different ref. First compare the relevant hunks in `shared/punctuation/marking.js` and `tests/punctuation-marking.test.js`.

## Scope

In scope:

- Punctuation answer marking and answer acceptance.
- Direct speech terminal-punctuation acceptance.
- Reporting-after direct speech acceptance.
- Paragraph-repair terminal-punctuation acceptance.
- Paragraph-repair initial capitalisation acceptance.
- Bullet-list repair stem capitalisation/preservation.
- Regression tests for the above.
- Validation of generated and fixed Punctuation runtime items with adversarial probes.
- Adjacent regression checks for reward/Stars/monster/Hero surfaces where the patch could accidentally affect them.

Non-goals:

- Do not add new learner features.
- Do not redesign the Punctuation question generator.
- Do not alter reward/mastery/Stars semantics.
- Do not change Hero Mode, Hero coins, Hero Camp, monsters, subject progression, or production config.
- Do not change Grammar, Spelling, Arithmetic, Reasoning, or Reading except to run cross-subject regression checks if needed.
- Do not loosen answer acceptance to improve pass rates.
- Do not hide acceptance failures behind copy changes.

## No-go areas that must not be touched

Do not change these areas unless a task-caused regression is directly proven and the change is explicitly documented:

- Punctuation reward projection and Star semantics.
- Punctuation monster evolution/migration state.
- Hero Mode / Hero backdrop / Hero routing.
- Global subject registry and subject progression.
- Worker production configuration, Wrangler configuration, deployment scripts, secrets, auth, or D1 bindings.
- Grammar/Spelling/other subject answer engines.
- Asset manifests or monster assets, except for validation notes where omitted lean-ZIP assets block checks.

## Files and areas likely to change

Expected changed files for the supplied patch:

- `shared/punctuation/marking.js`
- `tests/punctuation-marking.test.js`

Expected validation artefacts:

- Punctuation P20 expansion reports under `reports/punctuation/` after local runs.
- Adversarial probe outputs for baseline and patched acceptance.
- Production smoke evidence only after live verification.

## Exact implementation tasks

1. Apply the supplied patch or re-implement the same minimal changes on the authoritative current branch/ref.

2. Direct speech acceptance:
   - Require exactly one terminal mark inside the quoted speech.
   - Reject duplicated inside-quote terminals such as `??`, `!!`, `..`.
   - Keep existing support for straight, curly, single, and double quote pairs.
   - Preserve existing rejection for punctuation immediately outside the closing quote.

3. Reporting-after direct speech acceptance:
   - Require the reporting clause after the closing speech mark to end with exactly one full stop.
   - Reject missing reporting-clause final stop, for example: `"Where are we meeting?" asked Zara`.
   - Reject duplicated reporting-clause final stop, for example: `"Where are we meeting?" asked Zara..`.
   - Keep legitimate reporting-after answers accepted.

4. Paragraph repair acceptance:
   - Preserve the full expected wording.
   - Require expected final terminal punctuation when the model has it.
   - Reject duplicated terminal runs anywhere in the passage, such as `..` or `??`.
   - Require the expected initial capital where the model starts with a capital.
   - Keep existing paragraph skill checks for apostrophe forms, speech, colon/semicolon, parenthesis, bullets, and other validator checks.

5. Bullet-list repair acceptance:
   - Make the preserved bullet-list stem case-sensitive where the model/validator stem starts with a capital.
   - Reject lower-case stem starts such as `bring:` where the model requires `Bring:`.
   - Preserve existing line-break and bullet-marker rules.

6. Tests:
   - Add or keep regression tests for duplicated speech terminals, reporting-after missing/duplicated final stop, paragraph missing/duplicated final stop, paragraph lower-case start, and bullet stem lower-case start.
   - Do not only test one fixed item; include representative fixed items and all-runtime adversarial probes.

7. Previous-work validation:
   - Treat completion reports as claims only.
   - Validate source files, scripts, generated reports, review registers, reviewer packs, logs, and runtime behaviour.
   - Confirm what is genuinely complete, incomplete, overclaimed, or regressed.
   - Specifically audit whether review evidence is item-level, family-level, or inherited fixed-bank evidence.

8. Review-pack validation:
   - Run the Punctuation review pack command and inspect decision coverage.
   - If item-level decisions are sparse, do not claim every item has individual adult approval.
   - Distinguish generated-family approval from per-item approval.

9. Monster / Codex / Hero connectivity validation:
   - Confirm the patch does not mutate reward/Stars/monster/Hero state or event projection code.
   - Run the reward/Stars/monster subset tests listed below.
   - Where Hero UI tests require omitted lean-ZIP dependencies/assets, record the limitation and rerun in a full checkout.
   - Confirm no new subject-engine-to-game-layer coupling was introduced.

10. Source drift validation:
    - Compare the authoritative working branch/ref against the uploaded ZIP for the two changed files before applying.
    - If the target branch already contains related changes, merge carefully and rerun all probes.
    - If GitHub `main` or a PR branch differs materially from this ZIP, report the divergence and state which source is authoritative.

## Acceptance criteria

The local agent may call the result `DEPLOYMENT READY` only when all of these pass on the authoritative branch/ref:

1. Patch applies cleanly or equivalent source changes are implemented with no unrelated diffs.
2. All golden/model answers remain accepted.
3. Adversarial probes over the full Punctuation runtime show:
   - `duplicateTerminal`: `0` incorrect acceptances.
   - `noTerminal`: `0` incorrect acceptances.
   - `lowercaseStart`: `0` incorrect acceptances for paragraph/bullet/current strict-preservation surfaces.
4. Any remaining `appendExtra`/free-writing tolerance is explicitly audited and either fixed or justified as product policy.
5. Targeted Punctuation marking/speech/paragraph tests pass.
6. `npm run verify:punctuation-qg:p20-expansion` passes.
7. Reward/Stars/monster subset tests pass.
8. Broader Hero/UI checks either pass in a full checkout or have a clearly documented lean-ZIP dependency limitation.
9. `npm run check` or the project’s deploy dry-run passes in a full checkout with real assets; if it cannot run from a lean ZIP, the final evidence must say so.
10. No unrelated changes are made to reward, mastery, Stars, Hero Mode, monsters, subject progression, or production config.
11. Production verification is completed before using `DONE` wording.
12. Two independent reviewer passes return the exact required PASS line described below.

## Required commands, tests, and audits

Run and record output:

```bash
node --version
npm --version
cat .nvmrc
```

Patch application:

```bash
git apply --check patches/001-punctuation-answer-acceptance-hardening.patch
git apply patches/001-punctuation-answer-acceptance-hardening.patch
```

Targeted Punctuation marking tests:

```bash
node --test \
  tests/punctuation-marking.test.js \
  tests/punctuation-paragraph.test.js \
  tests/punctuation-speech-oracle-hardening.test.js
```

P20 expansion gate:

```bash
npm run verify:punctuation-qg:p20-expansion
```

Review pack:

```bash
node scripts/review-punctuation-questions.mjs --json --out /tmp/punctuation-review.json
```

Adversarial full-runtime probe:

```bash
node validation/probe-punctuation-answer-acceptance.mjs
```

If copying the probe from this package, run it from the repository root or adjust its path imports.

Reward/Stars/monster regression subset:

```bash
node --test \
  tests/punctuation-rewards.test.js \
  tests/punctuation-reward-parity.test.js \
  tests/punctuation-star-projection.test.js \
  tests/punctuation-star-view-parity.test.js \
  tests/punctuation-monster-migration.test.js
```

Hero/UI adjacent checks in a full checkout with dependencies/assets available:

```bash
node --test \
  tests/punctuation-map-hero-backdrop.test.js \
  tests/punctuation-session-hero-backdrop.test.js \
  tests/punctuation-summary-hero-backdrop.test.js \
  tests/punctuation-setup-hero-backdrop.test.js
```

Full deploy/build dry-run in a full checkout with assets:

```bash
npm run check
```

Production evidence validation after live smoke evidence exists:

```bash
npm run verify:punctuation-qg:p20-live
```

If there is a newer production smoke command for P20, use that first, then run the validator. The package ZIP showed P13/P14 smoke scripts and a P20 validator; do not fabricate a P20 smoke result if the correct live smoke runner is missing.

## Regression checks

Check these user journeys and behaviours after applying the patch:

- Direct speech insert/fix/transfer:
  - Correct quoted answers remain accepted.
  - Missing quote marks are rejected.
  - Missing reporting comma is rejected.
  - Punctuation outside the closing quote is rejected.
  - Duplicated inside-quote terminal punctuation is rejected.
  - Reporting-after clause missing final full stop is rejected.
  - Reporting-after clause with duplicated final full stop is rejected.

- Paragraph repair:
  - Fully repaired paragraph answers remain accepted.
  - Missing final stop is rejected where expected.
  - Duplicated final stop is rejected.
  - Lower-case paragraph start is rejected where the model starts with a capital.
  - Existing apostrophe/colon/semicolon/parenthesis/speech/bullet validators still isolate failed facets.

- Bullet repair:
  - Correct line breaks and bullet markers remain accepted.
  - Lower-case preserved stem is rejected where the model starts with a capital.
  - Inline list formatting and mixed bullet punctuation remain rejected.

- Generator/review quality:
  - P20 runtime still has 15,072 items unless the authoritative branch has moved.
  - No duplicate learner-facing surfaces.
  - Generated-family depth and review governance remain intact.
  - Review evidence claims remain source-bound and not overclaimed.

- Reward/Stars/Monster/Hero:
  - Correct/incorrect marking still emits expected subject result semantics.
  - Punctuation Stars are not inflated by false positives.
  - Monster migration and dashboard projection remain stable.
  - Hero backdrop/map/session/summary surfaces do not regress in a full checkout.

## Production deployment and verification requirement for `ks2.eugnel.uk`

The final implementation status must follow this wording exactly:

- `DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.
- `DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.
- `DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.
- If production cannot be checked, the final status must be `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`, not done.

Live evidence must include all of the following:

- URL/origin: `https://ks2.eugnel.uk`
- Timestamp
- Release/version/commit/build identifier where available
- Deployment command or deployment source if applicable
- Hard-refresh/browser check performed
- Specific user journey checked
- Pass/fail result
- Logs/screenshots/console/network notes where relevant

Required live user journey:

1. Hard refresh `https://ks2.eugnel.uk`.
2. Confirm the deployed build/release/commit where available.
3. Start a Punctuation practice journey.
4. Exercise at least one direct-speech item and one paragraph/bullet repair item.
5. Confirm correct answers still pass.
6. Confirm the previously accepted malformed variants are rejected.
7. Complete the session.
8. Confirm feedback, reward/Stars projection, monster-facing summary, and Hero/Codex-adjacent surfaces remain stable.
9. Record console/network notes and screenshots/logs where relevant.

## Required final evidence from local Codex agent

Final handoff must include:

- Source boundary: ZIP, GitHub/ref, local-run, CI, and production evidence separated.
- Exact commit SHA/branch/ref used.
- Patch/diff or PR link.
- Changed file list.
- `git diff --stat` and full diff summary.
- Command logs for all required local tests/audits.
- Adversarial probe output before and after the change, or a clear explanation if baseline cannot be rerun.
- Review-pack decision coverage summary.
- Reward/Stars/monster/Hero regression evidence.
- Production smoke evidence or the exact status `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`.
- Any remaining blockers/advisories with source-bound evidence.

## Reviewer loop requirement

After implementation, run two independent review passes:

1. Code Reviewer.
2. Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, “good to have” comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.

## Current package verdict for local agent

This package’s status is:

`IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`

The patch is minimal and local validation is strong for the supplied ZIP snapshot. Production is not proven because the required P20 production smoke evidence is missing and no authenticated hard-refresh browser journey on `https://ks2.eugnel.uk` was performed in this package.
