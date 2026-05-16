# Hero Mode E2E Flow Fix Contract

## Title and purpose

Fix the Hero Mode end-to-end learner flow so a learner can start the daily Hero Quest, complete a subject task, claim completion, advance to the next uncompleted Hero task, and receive capped Hero Coins on daily completion without being trapped in a repeat-start loop or stale read-model state.

This contract is intentionally narrow. It fixes task progression, stale-claim projection, and completed-task relaunch protection. It does not redesign Hero Mode, add new rewards, mutate subject mastery, or change production rollout policy by itself.

## Source authority

Primary authority for this package: uploaded ZIP snapshot.

- ZIP: `ks2-mastery-lean-05161145.zip`
- ZIP path in review environment: `/mnt/data/ks2-mastery-lean-05161145.zip`
- ZIP SHA-256: `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`
- ZIP size: `7,988,805 bytes`
- ZIP integrity: `unzip -t` passed with no errors
- ZIP shape: rootless archive, no `.git` metadata
- ZIP manifest: review profile, `mode=omit`, `copied=1544`, `omitted=3594`, `placeholders=0`; docs/reports/assets/output omitted by profile

Supplementary GitHub evidence:

- Repository metadata checked only: `fol2/ks2-mastery`, default branch `main`, public repository.
- No exact GitHub file/ref was used as patch authority.
- If applying to GitHub `main` or another branch, compare the current repo files against this ZIP before applying. The patch is ZIP-primary, not GitHub-main-certified.

Production authority:

- None in this package. No live proof from `https://ks2.eugnel.uk` is included.
- The final status after applying this package locally must not be `DONE` unless live production is deployed or already contains the change and is verified after a hard refresh.

## Patch root and apply assumptions

Patch root is the repository root / ZIP extraction root containing `src/`, `worker/`, `tests/`, `package.json`, and `wrangler.jsonc`.

Apply instructions from repo root:

```bash
git apply --check patches/001-hero-mode-e2e-flow-fix.patch
git apply patches/001-hero-mode-e2e-flow-fix.patch
```

Fallback if not using Git:

```bash
patch -p1 < patches/001-hero-mode-e2e-flow-fix.patch
```

If `git apply --check` fails, do not hand-merge blindly. First identify whether the target branch/ref has drifted from the ZIP snapshot, then port the same behaviour with equivalent tests.

## Scope

In scope:

1. Make the Hero dashboard choose the next uncompleted, unblocked, launchable task rather than the first merely launchable task.
2. Project a just-claimed task into the local UI model before the refreshed read model arrives, so the learner sees the next task or daily completion state immediately.
3. Prevent server-side `start-task` from launching a task that Hero progress already marks completed, completed-unclaimed, blocked, or in progress.
4. Treat stale/completed-task launch errors as refreshable client state rather than learner-facing hard errors.
5. Add regression tests for the task progression loop, stale claim projection, final daily completion CTA suppression, and completed-task relaunch rejection.
6. Preserve Hero Coins as a capped daily-completion economy, not per-question reward.

## Non-goals

Do not redesign Hero scheduler selection.
Do not change Hero Coin amounts, cap policy, ledger format, or economy award semantics.
Do not change subject Stars, mastery evidence, Mega rules, reward projection, subject progression, or monster ownership.
Do not add loot boxes, random shop behaviour, streak pressure, or correctness-based coin awards.
Do not change production rollout flags unless the deployment owner explicitly authorises a separate rollout step.

## No-go areas

Do not touch unrelated files under:

- subject mastery/reward engines unless directly required by a failing Hero E2E test;
- Stars, Mega, monster evolution, subject progression, or reward projection;
- production Cloudflare config/secrets/routes except as part of a separately approved deployment/flag rollout;
- Grammar/Punctuation/Spelling answer marking logic except to confirm Hero-launched subject sessions still complete and claim correctly.

## Files likely to change

The packaged patch changes only:

- `src/platform/hero/hero-ui-model.js`
- `src/main.js`
- `worker/src/hero/launch.js`
- `tests/hero-ui-progress-flow.test.js`
- `tests/hero-completion-flow-e2e.test.js`

## Exact implementation tasks

1. Apply the patch at repo root and confirm it applies cleanly.
2. In `buildHeroHomeModel`, ensure `nextTask` filters by both `launchStatus` and Hero progress status. A completed, completed-unclaimed, blocked, active, or just-claimed task must not be selected as the next Start CTA.
3. In `buildHeroHomeModel`, project a matching `lastClaim` into `completedTaskIds` and `effortCompleted` while the read model is stale, but only when `questId`, `questFingerprint`, and `dateKey` match the current read model.
4. In `resolveHeroStartTaskCommand`, load Hero progress state when progress is enabled and pass it into `buildHeroShadowReadModel` using the resolved Hero flags.
5. In `resolveHeroStartTaskCommand`, reject relaunch of tasks with completion statuses:
   - `completed` -> `hero_task_already_completed`
   - `completed-unclaimed` -> `hero_task_claim_pending`
   - `in-progress` -> `hero_active_session_conflict`
   - `blocked` -> `hero_task_blocked`
6. In `src/main.js`, add the new progress-conflict error codes to the refreshable Hero stale-state path so stale clicks trigger a read-model refresh instead of trapping the learner in an error state.
7. Keep claim/economy idempotency unchanged. Daily coins must still be awarded only by the claim/economy path when daily completion criteria are satisfied.
8. Check `wrangler.jsonc` and actual deployment variables. In the ZIP snapshot, default Hero flags are `false`; public learners cannot earn coins unless production has a valid override, rollout, or enabled flags.

## Previous-work validation tasks

Validate these claims against source/tests, not completion prose:

1. Hero Mode read model exposes task `completionStatus` and progress fields.
2. Claim flow updates progress and remains idempotent for duplicate claims.
3. Economy awards daily Hero Coins once, not per question and not per duplicate claim.
4. Hero task launch rejects client-supplied `subjectId` and `payload`.
5. Claim evidence is learner-bound and rejects cross-learner or no-evidence claims.
6. Subject sessions launched through Hero still use the subject engine and do not mutate subject Stars/mastery directly from Hero commands.
7. Production rollout flags and account overrides actually make Hero visible and economy-enabled for the intended learner cohort.

## Acceptance criteria

Local acceptance:

1. A learner who completes and claims task 1 no longer sees task 1 as the next Hero Start CTA.
2. A stale UI immediately advances after a matching claim response using strict quest identity: `questId`, `questFingerprint`, and `dateKey`.
3. If all planned effort is complete, the UI does not offer another Hero task start.
4. Server `start-task` cannot relaunch a completed task when progress is enabled.
5. Duplicate claim remains idempotent and does not double-count effort or coins.
6. Daily Hero Coins remain awarded only once after daily completion, when economy is enabled.
7. Hero Mode does not mutate subject Stars, subject mastery, Mega status, monsters, or subject progression.
8. Existing Hero launch, claim, completion, economy, and pA7 OAuth tests pass.

Production acceptance:

1. The change is live on `https://ks2.eugnel.uk` or already present there.
2. A hard-refresh browser check confirms the learner journey works end-to-end:
   - open `https://ks2.eugnel.uk`;
   - sign in or use an authorised demo/internal learner;
   - verify Hero Mode is visible and all required flags/overrides are active;
   - start today’s Hero Quest;
   - complete the subject task;
   - claim completion or observe auto-claim repair;
   - verify the next uncompleted Hero task appears, or the daily quest completes;
   - finish daily planned effort;
   - verify daily Hero Coins are awarded once;
   - hard refresh and verify the state persists without double-award;
   - verify console/network logs contain no task loop, stale error loop, or duplicate coin award.

## Required commands/tests/audits

Run from repo root after applying the patch:

```bash
node --version
cat .nvmrc

git apply --check patches/001-hero-mode-e2e-flow-fix.patch

node --test \
  tests/hero-ui-progress-flow.test.js \
  tests/hero-completion-flow-e2e.test.js \
  tests/hero-launch-flow-e2e.test.js \
  tests/hero-claim-flow-e2e.test.js \
  tests/hero-p4-economy-e2e.test.js \
  tests/worker-hero-command.test.js \
  tests/hero-economy-award.test.js \
  tests/hero-claim-contract.test.js

npm run verify:hero-pA7
```

Also run these in the local agent/CI environment before deployment readiness:

```bash
npm run check
npm run build
npm test
```

If a command cannot be run, record the exact reason and downgrade the status. Do not replace a failed or unrun command with a prose claim.

## Regression checks

1. Hero launch still rejects client-supplied `subjectId` and `payload`.
2. Hero launch still returns `already-started` only for a genuinely active same task, not a completed task.
3. Active non-Hero subject sessions still block Hero launch.
4. Stale quest/fingerprint handling still refreshes rather than launching the wrong task.
5. Pending completed sessions still auto-repair/claim from read-model evidence.
6. Claim before subject completion still rejects with no-evidence.
7. Cross-learner claim remains rejected.
8. Duplicate claim does not double-award effort or coins.
9. Hero dashboard shows only one primary next action and does not create loops after hard refresh.
10. Spelling, Grammar, and Punctuation Hero-launched sessions still complete through subject-owned engines.

## Production deployment and verification requirement for `ks2.eugnel.uk`

`DONE` is forbidden unless the change is live and verified on `ks2.eugnel.uk`.

`DEPLOYMENT READY` means all local/CI/reviewer checks pass and the change can be directly deployed, but it is not the same as live proof.

`DONE — LIVE VERIFIED` means the change is deployed or already present on `ks2.eugnel.uk`, verified after a hard refresh, and usable on the live site.

Live evidence must include:

- URL/origin: `https://ks2.eugnel.uk`
- timestamp
- release/version/commit/build identifier where available
- deployment command or deployment source if applicable
- hard-refresh/browser check performed
- specific user journey checked
- pass/fail result
- logs/screenshots/console/network notes where relevant

If production cannot be checked, the final status must be `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`, not done.

## Required final evidence from the local agent

The final handoff must include:

1. Applied commit SHA or patch application evidence.
2. Diff summary and file list.
3. Output from required local commands/tests/audits.
4. Confirmation that no subject Stars/mastery/Mega/monster progression files were changed unless explicitly justified.
5. Hero flags/rollout state used for local/staging/live validation.
6. Live production evidence for `https://ks2.eugnel.uk`, or the explicit status `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`.
7. Any remaining blockers/advisories with exact source evidence.

## Reviewer loop requirement

After implementation, run two independent review passes:

1. Code Reviewer.
2. Contract Auditor.

Both reviewers must return exactly:

`PASS — no blockers, no advisories, findings=[]`

Anything else fails the review. Blockers, advisories, “good to have” comments, uncertainties, weak evidence, overclaims, and task-related regressions must be fixed. Repeat implementation, validation, and both reviewer passes until both reviewers return the exact PASS line.
