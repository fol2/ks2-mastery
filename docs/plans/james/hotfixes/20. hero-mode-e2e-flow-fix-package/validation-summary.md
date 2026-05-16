# Hero Mode E2E Flow Fix — Validation Summary

## Verdict

A minimal source-level patch was feasible against the uploaded ZIP snapshot. The patch addresses the most likely learner-facing E2E blocker: after a Hero task is completed/claimed, the UI can continue selecting the first launchable task instead of the next uncompleted task, and the server launch path does not use Hero progress to reject relaunches of completed tasks.

The patch is locally validated against the ZIP snapshot. Production is not proven.

## Source boundary

- ZIP evidence: `/mnt/data/ks2-mastery-lean-05161145.zip`, SHA-256 `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`.
- GitHub evidence: repository metadata only (`fol2/ks2-mastery`, default branch `main`). No exact GitHub file was used as patch authority.
- Local-run evidence: tests and patch apply checks run in this container against ZIP extractions.
- Production evidence: none. `https://ks2.eugnel.uk` was not live-verified.

## Findings addressed by patch

### Blocker 1 — Hero dashboard can repeat a completed task

The original `buildHeroHomeModel` selected `dailyQuest.tasks.find(t => t.launchStatus === 'launchable')`, without excluding completed, completed-unclaimed, active, blocked, or just-claimed tasks. Because the Start CTA uses `hero.nextTask`, a stale/progress-aware read model can still drive the learner back into task 1 instead of task 2 or daily completion. That blocks smooth E2E completion and coin earning.

Patch outcome:

- `nextTask` now filters by `launchStatus` and Hero progress/completion state.
- Matching `lastClaim` is projected into `completedTaskIds` and `effortCompleted` before read-model refresh.
- Daily completion suppresses the Start CTA.

### Blocker 2 — Server launch path did not load progress state

The original `resolveHeroStartTaskCommand` built the Hero read model without passing `heroProgressState`/`progressEnabled`, so it could not reliably distinguish a launchable-but-completed task from a truly startable task. This left completed-task relaunch possible from stale clients.

Patch outcome:

- Launch command loads Hero progress when progress is enabled.
- Completed, completed-unclaimed, in-progress, and blocked statuses are rejected with typed errors before subject session launch.
- Same-task active-session branch also rejects completed/completed-unclaimed statuses instead of returning `already-started` after claim.

### Advisory — Production flags may still block public learners

The ZIP `wrangler.jsonc` defaults all Hero flags to `false`, including shadow, launch, child UI, progress, economy, and camp. Learners cannot earn coins on production unless production variables, account overrides, or rollout state enable the full required chain. This package does not change production rollout flags.

## Validation commands run

### Patch creation and fresh apply

Fresh extraction from the ZIP:

```bash
git apply --check /mnt/data/001-hero-mode-e2e-flow-fix.patch
git apply /mnt/data/001-hero-mode-e2e-flow-fix.patch
```

Result: PASS.

Evidence: `validation/patch-dry-run-and-apply.log` and `validation/hero-fresh-apply-smoke.log`.

### Targeted Hero tests on patched working tree

```bash
node --test \
  tests/hero-ui-progress-flow.test.js \
  tests/hero-completion-flow-e2e.test.js \
  tests/hero-launch-flow-e2e.test.js \
  tests/hero-claim-flow-e2e.test.js \
  tests/hero-p4-economy-e2e.test.js \
  tests/worker-hero-command.test.js \
  tests/hero-economy-award.test.js \
  tests/hero-claim-contract.test.js
```

Result: PASS.

Summary from run:

- tests: `131`
- suites: `6`
- pass: `131`
- fail: `0`
- duration: about `11.45s`

Evidence: `validation/hero-targeted-tests-patched.log`.

### Fresh apply smoke test

```bash
node --test tests/hero-ui-progress-flow.test.js tests/hero-completion-flow-e2e.test.js
```

Result: PASS.

Summary from run:

- tests: `56`
- suites: `6`
- pass: `56`
- fail: `0`

Evidence: `validation/hero-fresh-apply-smoke.log`.

### Hero pA7 verification

```bash
npm run verify:hero-pA7
```

Result: PASS.

Summary from run:

- tests: `2`
- suites: `1`
- pass: `2`
- fail: `0`

Evidence: `validation/hero-verify-pA7-patched.log`.

## Commands not run / not proven

- `npm run check` was not completed as a validation command. A help probe showed it invokes Wrangler dry-run tooling.
- `npm run build` was not run.
- Full `npm test` was not run.
- Live production smoke on `https://ks2.eugnel.uk` was not run.
- GitHub exact-file comparison was not run.

## Status label

Current status: `IMPLEMENTED + LOCAL VERIFIED — PRODUCTION NOT PROVEN`.

Do not use `DONE` until the change is live and verified on `https://ks2.eugnel.uk` after a hard refresh.
