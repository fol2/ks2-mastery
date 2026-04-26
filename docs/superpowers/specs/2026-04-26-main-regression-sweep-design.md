---
name: Main-branch regression sweep — 2026-04-26
description: 15 `npm test` failures on `main` caused by 5 same-day PR merges (#300/#301/#303/#305/#308) landing without a CI gate. Fix all 7 root-cause clusters in one bundled PR and re-install a minimum `test-on-pr.yml` workflow so the ecosystem cannot regress the same way again.
type: fix
status: draft
date: 2026-04-26
sessions: [radiant-sprouting-sunrise worktree]
---

# Main-branch regression sweep — 2026-04-26

## Overview

After a cluster of five same-day merges to `main` on 2026-04-26
(PRs #300, #301, #303, #305, #308), `npm test` on a fresh `main`
checkout reports **15 failing tests out of 3909**. Every failure maps to
one of seven disjoint root-cause clusters. The repository's only active
workflow is `mega-invariant-nightly.yml` — the previous `Delivery
pipeline` workflow was deleted 2026-04-19, so PR merges were gated only
by Copilot code review and GitGuardian, neither of which runs the test
suite. PR #301 in fact merged with a GitGuardian **FAILURE** check.

This document specifies a single bundled fix PR that resolves all
seven clusters and installs a minimum `test-on-pr.yml` workflow so
future PRs cannot land with broken tests or forbidden bundle content.

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

### Cluster B — client bundle leaks the full spelling dataset (critical security, 1 test failure)

`npm run audit:client` against `src/bundles/app.bundle.meta.json`
reports three forbidden modules:

```
src/subjects/spelling/data/content-data.js
src/subjects/spelling/data/word-data.js  (×2 reason codes)
```

The import chain inside the client bundle is:

```
service-contract.js
  → achievements.js
    → events.js
      → ./data/word-data.js  (≈ 450 KB)
        → ./data/content-data.js  (full seeded dataset with answers)
```

`achievements.js:34` imports only `SPELLING_EVENT_TYPES` from
`events.js`, but `events.js:1` top-level-imports `WORD_BY_SLUG` from
`data/word-data.js`. ESM static import pulls the entire transitive
graph into the tree-shaken bundle output regardless of which symbols
are used, so the full word-bank (with per-word answer metadata) ships
to every client.

Production impact: every signed-in learner's browser receives the
complete spelling answer key in the main bundle. This also blocks the
`public build emits the React app bundle entrypoint` test, which
calls `audit-client-bundle.mjs` and expects exit code 0.

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

### Cluster G — `client-error-capture` backoff timer flake (flake, 1 test failure)

`tests/client-error-capture.test.js:391` — the 2.8s wait for a
scheduled retry is tight under full-suite load. Runs in isolation:
green. Runs in suite: intermittently fails with
`consecutive-failure counter reset` off by one schedule tick.

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
- **R2.** `npm run audit:client` reports zero forbidden modules after
  a fresh `npm run build`.
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
- **R7.** Existing events.js consumer contract (server side + tests
  that import `wordFields`) remains intact; only the import surface
  changes.
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
- `src/subjects/spelling/events.js:1` — top-level import of
  `WORD_BY_SLUG`.
- `src/subjects/spelling/achievements.js:34` — only needs
  `SPELLING_EVENT_TYPES`.
- `src/subjects/spelling/service-contract.js` — entry point that
  transitively pulls `achievements.js` into the client bundle.
- `shared/spelling/service.js:16` — server-side consumer of
  `events.js`; can tolerate the import graph (server does not ship
  the client bundle).
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
- `.github/workflows/mega-invariant-nightly.yml` — reference shape for
  a new YAML (node 20, ubuntu-latest, `npm ci --no-audit --no-fund`).

### Institutional learnings

- `project_d1_atomicity_batch_vs_withtransaction.md` — unrelated, but
  confirms that prior large-blast sprints always end with a
  completion report; this regression sweep should produce one too.
- `project_windows_nodejs_pitfalls.md` — "concurrent test temp-dir
  races" already documented; U5 reuses the retry-with-backoff
  playbook.
- `feedback_autonomous_sdlc_cycle.md` — names the
  "test-harness-vs-production pattern" that this PR demonstrates
  (three inline writers added without running the tests).
- `feedback_git_fetch_before_branch_work.md` — followed at session
  start; worktree clean on `main`.

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

### D2 — Cluster B fix: split `events.js` into two files

Create `src/subjects/spelling/events/types.js` with
`SPELLING_EVENT_TYPES` and `SPELLING_MASTERY_MILESTONES` (both pure
constants, no imports). Create `src/subjects/spelling/events/word-enricher.js`
with `wordFields()` and the event constructors that require
`WORD_BY_SLUG`. The existing `src/subjects/spelling/events.js` becomes
a barrel re-export: `export * from './events/types.js'; export * from
'./events/word-enricher.js';` so every existing consumer
(`shared/spelling/service.js`, tests) continues to work unchanged.

`achievements.js:34` changes to import from `./events/types.js`
directly. This breaks the static import chain from the client bundle
to `word-data.js`.

Rationale: option C (single constants file, leave events.js
untouched) was rejected because the `events/` directory better
reflects the two-file reality; the barrel re-export preserves
consumer contracts.

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

Rationale: option C (test + audit) was upgraded from the recommended
baseline because Cluster B specifically requires the audit step to
catch bundle-leak regressions. `npm run build` is the prerequisite.

---

## Unit breakdown

| U  | Cluster  | Files touched                                                                       | Review gates                                                                              |
|----|----------|-------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| U1 | A        | `src/subjects/spelling/repository.js`                                               | ce-correctness, ce-data-integrity-guardian, ce-testing                                    |
| U2 | B        | `src/subjects/spelling/events/types.js` (new), `src/subjects/spelling/events/word-enricher.js` (new), `src/subjects/spelling/events.js`, `src/subjects/spelling/achievements.js` | ce-security-reviewer, ce-correctness, ce-maintainability                                  |
| U3 | C        | `tests/punctuation-release-smoke.test.js`                                           | ce-testing, ce-maintainability                                                            |
| U4 | D        | `tests/app-controller.test.js`, `tests/route-change-audio-cleanup.test.js`, `tests/helpers/microtasks.js` (new) | ce-testing, ce-julik-frontend-races                                                       |
| U5 | E        | `scripts/build-spelling-word-audio.mjs`                                             | ce-reliability-reviewer, ce-testing                                                       |
| U6 | F        | `tests/capacity-proxy.test.js`                                                      | ce-testing, ce-performance-reviewer                                                       |
| U7 | G        | `tests/client-error-capture.test.js`                                                | ce-testing                                                                                |
| U8 | CI gate  | `.github/workflows/test-on-pr.yml` (new)                                            | ce-cli-readiness-reviewer, ce-reliability-reviewer                                        |

Units are implemented sequentially on a single branch
`fix/main-regression-sweep-2026-04-26`. One PR.

---

## Build sequence

1. **U1** — highest severity (production crash path).
2. **U2** — client-bundle leak (security + blocking the audit gate).
3. **U3** — wrangler.jsonc (isolated).
4. **U4** — microtask helper (isolated).
5. **U5** — Windows rename retry (isolated).
6. **U6** — benchmark threshold (isolated).
7. **U7** — backoff wait (isolated).
8. **U8** — CI workflow last, after all tests green.

---

## Testing strategy

### Per-unit gates

- **U1**: `node --test tests/spelling-persistence-warning.test.js
  tests/spelling-achievements.test.js tests/spelling-pattern-quest.test.js`
  → all green.
- **U2**: `npm run build && npm run audit:client` → exit 0.
  `node --test tests/spelling-achievements.test.js
  tests/spelling-guardian.test.js tests/spelling-boss.test.js`
  (barrel re-export still resolves).
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
- **U8**: local `gh workflow view` + a throwaway PR push to confirm
  the new workflow fires.

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
- **Should Cluster B use lazy import or file split?** File split
  (D2). Lazy import at module-load time would re-introduce the
  dependency when any caller awaits the event constructor, which is
  exactly what the bundle audit is designed to prevent.
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

- `npm test` exits 0 on the fix branch and on `main` after merge.
- `npm run build && npm run audit:client` reports zero forbidden
  modules on the fix branch.
- The new `.github/workflows/test-on-pr.yml` runs to completion on
  the fix PR itself and on one subsequent throwaway PR.
- No learner-visible behaviour change: all storage-CAS semantics,
  achievement unlock rules, persistence-retry guarantees, and
  audio-cleanup contracts preserved.
- PR description lists all seven clusters with one-line fix
  summaries, links to the owning prior PRs (#300, #301, #305), and
  cites this design doc.
