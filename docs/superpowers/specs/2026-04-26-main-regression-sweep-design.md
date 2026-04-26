---
name: Main-branch regression sweep — 2026-04-26
description: 14 `npm test` failures on `main` after 5 same-day PR merges (#300/#301/#303/#305/#308) plus SH2-U10 code-split (#322) landed without a PR test gate. Fix six remaining root-cause clusters in one sequential scrum-master sprint (Cluster B already patched by merged PR #320 via seeded-default pattern) and install a minimum `test-on-pr.yml` workflow so the ecosystem cannot regress the same way again.
type: fix
status: approved
date: 2026-04-26
sessions: [radiant-sprouting-sunrise worktree]
revision: "2 — 2026-04-26 19:48 rebased after #320/#321/#322 merged; Cluster B dropped; Cluster H added for code-split test regression"
---

# Main-branch regression sweep — 2026-04-26

## Overview

After a cluster of same-day merges to `main` on 2026-04-26 (PRs
#300/#301/#303/#305/#308 and later #321/#322), `npm test` reports **14
failing tests out of 3965** on a fresh post-rebase `main`. The
repository's only active workflows are `mega-invariant-nightly.yml`
(scheduled) and `SH2-U11 Playwright CI` (#321, journey only) — the
previous `Delivery pipeline` workflow that ran the node test suite was
deleted 2026-04-19. PR #301 merged with a GitGuardian **FAILURE**
check; #300/#305/#308 merged without test coverage at all.

During spec authoring, one cluster was resolved by a separate merged
hotfix (**Cluster B** — client bundle leaking the full spelling
dataset; fixed by PR #320 via a seeded-default pattern now captured
in memory: `project_client_bundle_audit_input_graph.md`). One new
cluster (**Cluster H** — `public build emits the React app bundle
entrypoint` assertion stale after #322's code-split moved the monster
`manifestHash` from `app.bundle.js` into `chunk-SZHUV5JR.js`) was
discovered during the rebase.

This document specifies a scrum-master-driven sequential sprint that
resolves all six remaining clusters and installs a minimum
`test-on-pr.yml` workflow so future PRs cannot land with broken
tests or forbidden bundle content.

### Execution model

The implementation runs as a **fully autonomous scrum-master cycle**:

1. Orchestrator dispatches each unit to an independent worker
   subagent (fresh context, single unit scope).
2. Worker creates a PR against `main`.
3. Orchestrator runs ce-* reviewer subagents in parallel against the
   PR diff.
4. Orchestrator dispatches an independent follower subagent that
   addresses reviewer blockers.
5. Orchestrator re-runs targeted ce-* reviewers on the fresh diff.
6. When no blockers remain, PR merges.
7. Next unit starts from a rebased `main`.

Stop condition: all 7 units merged, `npm test` green, `npm run
audit:client` green, completion report written.

---

## Problem Frame

### Cluster A — `ReferenceError: current is not defined` (critical production, 8 test failures)

`src/subjects/spelling/repository.js` defines three write paths in
`storage.setItem` — `pattern`, `persistenceWarning`, and
`achievements` — that reference a local variable named `current`
without ever declaring it in scope:

- `setItem` line 456-459 (pattern)
- `setItem` line 467-470 (persistenceWarning)
- `setItem` line 507-510 (achievements)
- `removeItem` line 543 (pattern)
- `removeItem` line 550 (persistenceWarning)
- `removeItem` line 561 (achievements)

The `postMega` sibling at line 435-443 works correctly because it is
computed **inside** the `projectForField` callback, where `current` is
locally bound via `const current = readSpellingData(...)`. The three
newer siblings were added without noticing that `projectForField` is
the only scope where `current` exists. The closure for `setItem` /
`removeItem` has no `current` binding at all, so every invocation of
these paths throws `ReferenceError: current is not defined` at runtime.

Production impact: the first time any learner wobbles in Pattern Quest,
experiences a persistence failure, or unlocks an achievement, the write
throws. Because `createSpellingPersistence` returns a `storage` proxy
consumed via `saveJson` try/catch, production may surface this as
`feedback.persistenceWarning` — which itself would throw on write, so
the error path is structurally broken too.

PRs that landed the regression:
- **PR #301 (U9)** — persistenceWarning sibling.
- **PR #305 (U12)** — achievements sibling.
- The pattern sibling (U11, Pattern Quest wobble) shares the same
  inline-writer shape and is fixed alongside U9 and U12 for internal
  consistency; its tests currently fail in the same full-suite run.

### Cluster B — client bundle leaks the full spelling dataset (resolved by PR #320, no unit)

**Status: resolved before spec finalised.** A parallel hotfix branch
(`hotfix/spelling-events-decouple-word-dataset`, merged as PR #320 at
2026-04-26 19:46 UTC) decoupled `events.js` from `word-data.js` via a
**seeded-default** pattern rather than a file split:
`__defaultWordBySlug` is a module-scoped `let`, exported setter
`__setDefaultSpellingWordBySlug(map)` is called once per test file
via `tests/helpers/seed-spelling-events-default.js`. Production
callers always pass `wordMeta` explicitly, so the seed stays `null`
in production and the dataset never crosses the client boundary. A
source-level regression pin in `tests/bundle-audit.test.js` fires at
`npm test` without needing a full build.

The pattern is captured in
`project_client_bundle_audit_input_graph.md` memory — future spec
reviews must check for default-parameter imports of heavy datasets
reachable from client entry points.

### Cluster C — `wrangler.jsonc` parsed as strict JSON (test-infra, 1 test failure)

`tests/punctuation-release-smoke.test.js:17` reads `wrangler.jsonc` and
calls `JSON.parse(source)`. The file contains line comments (`//`)
which strict JSON rejects. The test fails with
`SyntaxError: Expected double-quoted property name in JSON at
position 270 (line 11 column 3)`.

Root cause: `wrangler.toml` was renamed to `wrangler.jsonc` around
2026-04-19 but this test was never updated.

### Cluster D — `persistence-retry` microtask depth changed (regression, 2 test failures)

PR #300 (U5 storage-CAS, commit `d32f0c7`) changed
`src/platform/core/repositories/local.js:407-416` from a synchronous
`retryPersistence` to an `async` function that `await`s
`persistAllLocked`. The dispatcher at
`src/platform/app/create-app-controller.js:398-411` chains `.then(...)`
on the returned promise.

Before U5 the `.then` ran after a single microtask flush. After U5 it
requires two or more. The affected tests are:

- `tests/app-controller.test.js:468` — `await Promise.resolve()` once
  (insufficient).
- `tests/route-change-audio-cleanup.test.js:364` — `await
  Promise.resolve(); await Promise.resolve();` (still insufficient
  under certain schedulers).

These are test-side timing assumptions. The product code change is
correct — `navigator.locks.request` legitimately requires an `await`.

### Cluster E — Windows `EPERM` on concurrent `rename` (platform-specific, 1 test failure)

`scripts/build-spelling-word-audio.mjs:402-412` writes state via
`writeFile(tmpPath) → rename(tmpPath, statePath)`. When eight worker
promises race via `Promise.all`, Windows `MoveFileEx` fails with
`EPERM` when the target file is held open by another worker — even
briefly.

POSIX `rename(2)` is atomic and overwrites; Windows requires either
`ReplaceFile` semantics or retry-on-EPERM. The memory file
`project_windows_nodejs_pitfalls.md` already documents "concurrent
test temp-dir races" as a known pattern with the NUL-byte merge
playbook as the prior art.

### Cluster F — Capacity micro-benchmark thresholds too tight (flake, 1 test failure)

`tests/capacity-proxy.test.js` — `U3 overhead benchmark` compares raw
vs proxied D1 call timings over 500 iterations. Raw mean is 0.03ms,
proxy mean 0.04ms. The threshold is mean ≤ +10% and p95 ≤ +15%. At
sub-0.1ms timings, scheduler jitter under concurrent-test load
(`node --test` parallelises) produces mean deltas of 20-30% routinely.

### Cluster G — `client-error-capture` backoff timer flake (flake, 0-1 test failures)

`tests/client-error-capture.test.js:391` — the 2.8s wait for a
scheduled retry is tight under full-suite load. Runs in isolation:
green. Runs in suite: intermittently fails with
`consecutive-failure counter reset` off by one schedule tick. Not
always reproducible; included as a defensive fix.

### Cluster H — `public build` test asserts manifestHash in pre-split bundle (regression, 1 test failure)

PR #322 (SH2-U10 bundle hygiene, 2026-04-26) introduced code-splitting
for three adult surfaces. esbuild now emits the bulk of the React
runtime and shared React helpers into `chunk-SZHUV5JR.js`, with
`app.bundle.js` containing only the critical-path entry code.

`tests/build-public.test.js:28` asserts:
```js
assert.match(appBundle, new RegExp(manifestHash));
```
where `appBundle = readFileSync('dist/public/src/bundles/app.bundle.js')`.
The monster visual manifest hash (`3a5e0d699d815b618fb66964` at the
time of writing) now lives in `chunk-SZHUV5JR.js`, not
`app.bundle.js`. The assertion fires a 700+ KB regex mismatch log.

Fix: assert the hash appears in any `.js` chunk under
`dist/public/src/bundles/`. Functionally equivalent — the client
still loads the chunk — and aligned with the audit script's own
`FORBIDDEN_MODULES` scan which walks all chunks from the metafile.

### Ecosystem gap — no PR test gate

`.github/workflows/` contains a single file: `mega-invariant-nightly.yml`
(scheduled only). The `Delivery pipeline` workflow that previously
gated PRs was deleted 2026-04-19. Merges #300/#301/#303/#305/#308 ran
only Copilot code review + GitGuardian. PR #301 merged with
GitGuardian in `FAILURE` state — clear evidence that the review
discipline does not substitute for an automated test gate.

---

## Requirements Trace

- **R1.** `npm test` on `main` exits 0 with zero failing tests on
  Windows and Linux.
- **R2.** `npm run audit:client` continues to report zero forbidden
  modules (guaranteed by PR #320; new code must not reintroduce a
  top-level import of heavy datasets).
- **R3.** Pattern Quest wobble, persistenceWarning, and achievements
  write paths do not throw `ReferenceError` at runtime on any
  supported browser.
- **R4.** New `.github/workflows/test-on-pr.yml` workflow runs
  `npm ci → npm test → npm run build → npm run audit:client` on every
  pull-request event against `main` and on every push to `main`.
- **R5.** Existing PR #300 U5 storage-CAS semantics (navigator.locks +
  writeVersion CAS) remain intact; the test-side timing fixes must
  not weaken the production async invariants.
- **R6.** Existing PR #305 U12 achievements INSERT-OR-IGNORE for
  unlock rows and MONOTONIC accept-incoming for progress rows remain
  intact; only the scope of `current` changes.
- **R7.** Existing PR #322 SH2-U10 code-split contract remains intact
  (byte budget 214 KB gzip, chunk boundaries). Cluster H fix only
  relaxes the test's bundle-location assumption.
- **R8.** New CI workflow does NOT require Cloudflare secrets or
  wrangler OAuth — PR gate is hermetic.

---

## Scope Boundaries

- No revert of PRs #300/#301/#303/#305/#308; all shipped genuine value.
- No restoration of the deleted `Delivery pipeline` workflow — we
  install a minimum PR gate instead. The full pipeline's deploy +
  capacity-verify steps remain manual until a separate decision.
- No audit of test-harness-vs-production parity across the codebase —
  this pattern is already documented in
  `feedback_autonomous_sdlc_cycle.md`; one-off fix here only.
- No change to `audit-client-bundle.mjs` policy — the script's
  `FORBIDDEN_MODULES` list is correct; only the underlying bundle
  leak is fixed.
- No migration of the mega-invariant-nightly workflow into the PR
  gate — it's long-running and owns a distinct responsibility.
- No widening of tests that pass; only the failing ones are touched.

---

## Context & Research

### Relevant code

- `src/subjects/spelling/repository.js:399-519` — `setItem`: `current`
  binding lives only inside `projectForField()` (line 420-446). All
  siblings that need to merge with existing bundle state must compute
  inside that callback for CAS correctness.
- `src/platform/core/repositories/local.js:407-416` — `retryPersistence`
  post-U5.
- `src/platform/app/create-app-controller.js:398-411` —
  `persistence-retry` dispatcher.
- `scripts/build-spelling-word-audio.mjs:402-412` — `writeStateFile`.
- `tests/punctuation-release-smoke.test.js:15-18` — `JSON.parse` on
  `wrangler.jsonc`.
- `tests/capacity-proxy.test.js` — U3 overhead benchmark.
- `tests/client-error-capture.test.js:391-414` — consecutive-failure
  reset test.
- `tests/build-public.test.js:28` — stale `manifestHash` assertion
  against `app.bundle.js` post-code-split.
- `.github/workflows/mega-invariant-nightly.yml` — reference shape for
  a new YAML (node 20, ubuntu-latest, `npm ci --no-audit --no-fund`).
- `.github/workflows/playwright-ci.yml` (PR #321) — second reference
  shape, confirms the repository accepts Ubuntu-latest + node 20
  workflow invocations.

### Institutional learnings

- `project_d1_atomicity_batch_vs_withtransaction.md` — unrelated, but
  confirms that prior large-blast sprints always end with a
  completion report; this regression sweep should produce one too.
- `project_windows_nodejs_pitfalls.md` — "concurrent test temp-dir
  races" already documented; U5 reuses the retry-with-backoff
  playbook.
- `feedback_autonomous_sdlc_cycle.md` — names the
  "test-harness-vs-production pattern" that this sprint demonstrates
  (three inline writers added without running the tests) and the
  scrum-master cycle at 12-14 unit scale.
- `feedback_subagent_tool_availability.md` — ce-* reviewers are
  orchestrator-only; workers need distinct worktrees when parallel.
  This sprint is **sequential**, so workers share the session
  worktree.
- `feedback_git_fetch_before_branch_work.md` — followed at session
  start and at rebase checkpoint; session picked up #320/#321/#322
  merges.
- `project_client_bundle_audit_input_graph.md` — seeded-default
  pattern from PR #320; U8 includes `audit:client` in the PR gate
  so this class of regression is caught automatically.

### External references

- Node.js docs on [`child_process.execFileSync`](https://nodejs.org/api/child_process.html#child_processexecfilesyncfile-args-options) —
  PR #301 merged with a `GitGuardian FAILURE` because the check was
  not a required status check. GitHub's branch-protection UI is the
  proper place to require a check, not the PR itself.
- Node.js docs on [filesystem atomicity](https://nodejs.org/api/fs.html#fspromisesrenameoldpath-newpath) —
  Windows `rename` semantics differ from POSIX; retry-on-EPERM is the
  standard workaround.

---

## Key Technical Decisions

### D1 — Cluster A fix: move inline writers into `projectForField`

The three failing write paths (pattern, persistenceWarning,
achievements) move into the `projectForField()` callback that already
owns `postMega`. This preserves U5 storage-CAS semantics: every retry
re-reads the bundle, recomputes the merged sibling, and re-commits
against a fresh writeVersion. Copy-paste was the original trap; the
fix collapses all four siblings into a single
`projectForField`-style switch.

Rationale: option A (chosen) preserves the CAS contract. Option B
(read `current` ourselves before the write) would open a cross-tab
race window that U5's HIGH-priority reviewer findings explicitly
closed.

### D2 — Cluster B: superseded by merged PR #320

Revision 1 of this spec proposed splitting `events.js` into a
`types.js` + `word-enricher.js` pair. PR #320 landed first with a
different approach — the seeded-default pattern — and resolved the
audit failure without a file-split. D2 is retained in the decision
log as historical context but produces no work in this sprint.

Future recurrences: prefer the seeded-default pattern (module-scoped
`let` + exported setter) for default-parameter imports of heavy
datasets. See `project_client_bundle_audit_input_graph.md`.

### D3 — Cluster C fix: strip comments before `JSON.parse`

`tests/punctuation-release-smoke.test.js:15-18` gets a minimal
`stripJsonComments` helper (10 lines, line-comment and block-comment
aware, string-aware). Wrangler itself uses the `jsonc-parser`
package; we do not add a dependency for a one-line test.

### D4 — Cluster D fix: flush microtasks properly in tests

Replace `await Promise.resolve();` with a helper that flushes until
the microtask queue is empty:

```js
async function flushMicrotasks(maxTicks = 8) {
  for (let i = 0; i < maxTicks; i += 1) {
    await Promise.resolve();
  }
}
```

placed in `tests/helpers/microtasks.js` and imported by both affected
tests. 8 ticks gives generous headroom against any future async-depth
change without being timing-dependent.

### D5 — Cluster E fix: retry-on-EPERM for Windows `rename`

`scripts/build-spelling-word-audio.mjs:writeStateFile` wraps the
`rename` call in a 3-attempt retry with 10ms backoff, only catching
`EPERM` / `EBUSY` / `EACCES` errors. Other errors rethrow
immediately. The retry is cheap in the success path and matches the
NUL-byte merge playbook from `project_windows_nodejs_pitfalls.md`.

### D6 — Cluster F fix: widen micro-benchmark thresholds

`tests/capacity-proxy.test.js`'s `U3 overhead benchmark` raises mean
threshold from 10% to 20% and p95 from 15% to 25% for the
micro-benchmark variant only. Rationale: sub-0.1ms timings are
dominated by scheduler jitter under concurrent test load; tighter
thresholds measure the test harness, not the proxy. The macro
benchmark (50 iterations) keeps its existing threshold.

### D7 — Cluster G fix: widen the backoff wait window

`tests/client-error-capture.test.js:391` extends the 2.8s wait to
4.0s. The test asserts a 2xx resets the counter after a single
retry; the exact timing does not matter, only the eventual state.
Widening absorbs scheduler delays without masking real regressions.

### D8 — Install `test-on-pr.yml` workflow

New file `.github/workflows/test-on-pr.yml`:

- Triggers: `pull_request` to `main`, `push` to `main`.
- Runs: `npm ci --no-audit --no-fund → npm test → npm run build →
  npm run audit:client`.
- Timeout: 15 minutes (headroom above the ~3 min local wall clock).
- Concurrency: cancel-in-progress per PR branch.
- No secrets required — hermetic.

The workflow does NOT replace `mega-invariant-nightly.yml`. It does
NOT attempt deployment or capacity verification (those require
secrets + manual review).

Rationale: include `audit:client` so a future recurrence of
Cluster B (any static import of a heavy dataset) is caught on every
PR — the same mechanism that surfaced the PR #320 hotfix in the
first place. `npm run build` is the prerequisite.

### D9 — Cluster H fix: assert manifestHash in any bundle chunk

`tests/build-public.test.js:28` changes from:

```js
assert.match(appBundle, new RegExp(manifestHash));
```

to a walk of every `.js` file under `dist/public/src/bundles/`:

```js
const bundleChunks = readdirSync('dist/public/src/bundles/')
  .filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(`dist/public/src/bundles/${f}`, 'utf8'));
assert.ok(
  bundleChunks.some((content) => content.includes(manifestHash)),
  'manifestHash must be present in at least one production bundle chunk',
);
```

Rationale: after PR #322's code-split, the manifest content is in
`chunk-SZHUV5JR.js`, not `app.bundle.js`. The invariant the test
protects — "the manifest hash reaches the client" — is preserved;
only the chunk location is no longer fixed. Other assertions on the
same test (home.bundle.js absence, spelling dataset absence, grammar
runtime absence) remain unchanged since they are about what MUST NOT
be present, which is independent of the code-split.

---

## Unit breakdown

| U  | Cluster | Files touched | Review gates |
|----|---------|---------------|--------------|
| U1 | A       | `src/subjects/spelling/repository.js` | ce-correctness, ce-data-integrity-guardian, ce-testing |
| U3 | C       | `tests/punctuation-release-smoke.test.js` | ce-testing, ce-maintainability |
| U4 | D       | `tests/app-controller.test.js`, `tests/route-change-audio-cleanup.test.js`, `tests/helpers/microtasks.js` (new) | ce-testing, ce-julik-frontend-races |
| U5 | E       | `scripts/build-spelling-word-audio.mjs` | ce-reliability-reviewer, ce-testing |
| U6 | F       | `tests/capacity-proxy.test.js` | ce-testing, ce-performance-reviewer |
| U7 | G       | `tests/client-error-capture.test.js` | ce-testing |
| U8 | CI gate | `.github/workflows/test-on-pr.yml` (new) | ce-cli-readiness-reviewer, ce-reliability-reviewer |
| U9 | H       | `tests/build-public.test.js` | ce-testing, ce-maintainability |

Numbering preserves the original unit IDs — U2 is intentionally
vacant (resolved by PR #320). Each unit ships as its own PR per the
scrum-master execution model; seven PRs total, merged sequentially.

---

## Build sequence

1. **U1** — highest severity (production crash path).
2. **U9** — unblocks `npm test` green baseline (trivial one-line test fix).
3. **U3** — wrangler.jsonc (isolated).
4. **U4** — microtask helper (isolated).
5. **U5** — Windows rename retry (isolated).
6. **U6** — benchmark threshold (isolated).
7. **U7** — backoff wait (isolated).
8. **U8** — CI workflow last, only after all tests green so the gate
   does not immediately fire red on its own PR.

---

## Testing strategy

### Per-unit gates

- **U1**: `node --test tests/spelling-persistence-warning.test.js
  tests/spelling-achievements.test.js tests/spelling-pattern-quest.test.js`
  → all green.
- **U3**: `node --test tests/punctuation-release-smoke.test.js` → green.
- **U4**: `node --test tests/app-controller.test.js
  tests/route-change-audio-cleanup.test.js` → green in isolation AND
  under `npm test`.
- **U5**: `node --test tests/build-spelling-word-audio.test.js` →
  green on Windows.
- **U6**: `npm test -- tests/capacity-proxy.test.js` → green two
  consecutive runs.
- **U7**: `npm test -- tests/client-error-capture.test.js` → green
  two consecutive runs under concurrent-test load.
- **U8**: local `gh workflow view` + the workflow fires green on the
  PR that introduces it (no post-merge throwaway PR required since
  U8 itself is a PR).
- **U9**: `node --test tests/build-public.test.js` → green; then
  `npm test` full-suite confirms the chunk-assertion is stable.

### Final gate

`npm test` on Windows and (via the new CI workflow) Linux → zero
failing tests.

---

## Open Questions

### Resolved during planning

- **Should Cluster A preserve CAS-aware writes or revert to simple
  semantics?** CAS-aware (D1). U5 storage-CAS is a recent
  investment; weakening it for a bug fix would undo deliberate
  reviewer-closed HIGH findings.
- **Should we still re-do Cluster B with the file-split approach
  proposed in revision 1?** No. PR #320 (seeded-default pattern)
  already merged and is memorialised in
  `project_client_bundle_audit_input_graph.md`. Re-splitting would
  churn files a second time for the same outcome.
- **Should Cluster D change product code or test code?** Test code
  (D4). Product code correctly awaits `navigator.locks`; the test's
  microtask count was an accidental coincidence pre-U5.
- **Should CI gate include `npm run check` (wrangler dry-run)?** No.
  `npm run check` requires Cloudflare OAuth; a hermetic PR gate keeps
  the failure surface tight and debuggable. A follow-up "nightly
  deploy check" workflow is the right place for wrangler validation.
- **Should CI gate include Playwright?** No. `@playwright/test` is a
  devDependency and the PR gate already runs `npm test`. The journey
  runner is invoked via `npm run journey`, not `npm test`.

### Deferred to implementation

- Exact backoff ms for Cluster E — tune during U5 based on local CI
  observation (starting point 10ms × 3 attempts).
- Exact `flushMicrotasks` tick count for Cluster D — U4 will tune if
  8 proves insufficient; otherwise left at 8.
- Whether to label the new workflow as a required status check on
  `main` branch protection — documented in the PR description;
  repository admin toggles it post-merge.

---

## Success Criteria

- `npm test` exits 0 on `main` after all 7 unit PRs merge.
- `npm run build && npm run audit:client` continues to report zero
  forbidden modules (preserved from PR #320).
- The new `.github/workflows/test-on-pr.yml` runs to completion on
  its own PR (U8), green.
- No learner-visible behaviour change: all storage-CAS semantics,
  achievement unlock rules, persistence-retry guarantees, and
  audio-cleanup contracts preserved.
- Each unit's PR description cites this design doc and names the
  cluster it addresses.
- Completion report under `docs/plans/` summarises the 7-unit sprint
  including wall-clock, ce-reviewer blocker counts, and any new
  learnings promoted to memory.
