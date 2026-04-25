---
title: 'fix: Resolve worktree test failures (env deps + Windows CLI + silent-exit build)'
type: fix
status: completed
date: 2026-04-25
prs: [172, 174, 176]
---

# fix: Resolve worktree test failures (env deps + Windows CLI + silent-exit build)

## Overview

`npm test` on the `worktree-quirky-napping-tome` worktree reports 40 failing tests across 64 files (678 pass, 40 fail, 1 skipped, 719 total). Discovery classified the failures into three root causes: a missing `node_modules/` in this fresh worktree (dominant), a Windows-incompatible CLI-guard in `scripts/audit-client-bundle.mjs`, and a silent exit-0 in `scripts/build-bundles.mjs` when an imported module fails to resolve. This plan fixes all three so `npm test` returns green and cross-platform/worktree regressions cannot silently hide future build failures.

---

## Problem Frame

James ran `npm test` and got 40 failing tests. The failures break into three disjoint clusters:

- **Cluster A — Missing `node_modules/`**: ~32 test-file failures funnel into two `ERR_MODULE_NOT_FOUND` patterns: `Cannot find package 'react'` (from `tests/app-controller.test.js`, `tests/runtime-boundary.test.js`, and `src/subjects/placeholders/module-factory.js` which participates in 15+ suites) and `Cannot find package 'esbuild'` (from `tests/helpers/react-render.js`, which 15+ React surface/render tests import). Git worktrees do not share installed `node_modules` with the primary checkout — each worktree needs its own `npm install`. This is expected first-run setup, not a code defect.
- **Cluster B — Windows CLI guard in `scripts/audit-client-bundle.mjs`**: Line 208 reads `` if (import.meta.url === `file://${process.argv[1]}`) { ... } ``. On Windows, Node sets `import.meta.url` to `file:///C:/James/...audit-client-bundle.mjs` (three slashes, drive letter), while `process.argv[1]` is a relative path like `./scripts/audit-client-bundle.mjs`. The interpolated string becomes `file://./scripts/audit-client-bundle.mjs` — which never matches. The script loads, defines its exports, the guard fails silently, and the process exits 0 without running any audit. This breaks 7 tests in `tests/bundle-audit.test.js` that use `assert.throws(() => execFileSync(... audit-client-bundle.mjs ...))` to verify the script *rejects* forbidden inputs. Five sibling scripts in `scripts/` already use the correct `pathToFileURL(process.argv[1]).href` pattern (see `punctuation-production-smoke.mjs:357`, `probe-production-bootstrap.mjs:292`, `grammar-production-smoke.mjs:417`, `backfill-learner-read-models.mjs:254`, `classroom-load-test.mjs:669`). This script was never updated to match.
- **Cluster C — Silent exit-0 in `scripts/build-bundles.mjs`**: The orchestrator is two side-effect imports (`./generate-monster-visual-manifest.mjs` then `./build-client.mjs`). `build-client.mjs` uses top-level-await around `esbuild.build(...)`. When `esbuild` is missing (Cluster A), the ERR_MODULE_NOT_FOUND surfaces asynchronously and Node still exits 0. `tests/build-public.test.js:6` chains three `execFileSync` calls with `stdio: 'ignore'` and relies on non-zero exits to signal failure — a silent exit-0 means one missing artefact bubbles to an `assert.ok(existsSync(...))` later, producing the "public build emits the React app bundle entrypoint" failure. Even with deps installed, a future dependency or config regression in `build-bundles.mjs`'s chain could mask itself the same way. This deserves a real fix, not just "install deps and move on".

The work is also a pre-flight for future worktree starts: fresh worktrees will continue to need `npm install`, and AGENTS.md should surface the expectation so the next fresh-worktree session does not burn the same hour.

---

## Requirements Trace

- R1. `npm test` exits 0 with 0 failing tests on `worktree-quirky-napping-tome`.
- R2. `scripts/audit-client-bundle.mjs` runs correctly when invoked as a CLI on Windows, Linux, and macOS (matches siblings' `pathToFileURL(process.argv[1]).href` pattern).
- R3. `scripts/build-bundles.mjs` exits non-zero when any imported step fails, so downstream tests and CI cannot get a silent green.
- R4. Fresh-worktree setup friction is reduced — the next fresh worktree's first `npm test` run fails with a self-explanatory message or AGENTS.md explicitly documents the `npm install` precondition.
- R5. No regression of AGENTS.md-flagged production-sensitive surfaces (remote sync, learner state, spelling content, D1, R2, deployment paths).

---

## Scope Boundaries

- No change to test assertions themselves — tests are correct; the scripts they exercise are broken. Fixing tests would mask real bugs.
- No change to package manager (remains `npm`) or dependency versions listed in `package.json`.
- No migration of `scripts/` to TypeScript or to a monorepo-style pnpm workspace.
- No `postinstall` hook that auto-runs builds — keeps `npm install` fast and idempotent.
- No change to the `FORBIDDEN_MODULES` / `FORBIDDEN_TEXT` audit rules themselves; the script's *policy* is correct, only its CLI guard is broken.

---

## Context & Research

### Relevant Code and Patterns

- `scripts/audit-client-bundle.mjs:208` — broken CLI guard (Cluster B).
- `scripts/punctuation-production-smoke.mjs:357`, `scripts/probe-production-bootstrap.mjs:292`, `scripts/grammar-production-smoke.mjs:417`, `scripts/backfill-learner-read-models.mjs:254`, `scripts/classroom-load-test.mjs:669` — the established cross-platform CLI-guard pattern: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { ... }`.
- `scripts/build-bundles.mjs` (2-line orchestrator) + `scripts/build-client.mjs` (top-level-await esbuild call) — Cluster C surface.
- `tests/bundle-audit.test.js` — 14 tests, 7 of which exercise `assert.throws(() => execFileSync(... audit-client-bundle.mjs ...))`. These tests are the source of truth for the CLI-guard fix.
- `tests/build-public.test.js:6` — chains `build-bundles.mjs` → `build-public.mjs` → `assert-build-public.mjs`; relies on non-zero exits.
- `tests/helpers/react-render.js` — imports `esbuild` and expects `node_modules/react`; blocks the full React-surface test suite.
- `package.json:41` (`"test": "node --test"`), `package.json:45-50` (`devDependencies`: `esbuild ^0.28.0`, `react ^18.3.1`, `react-dom ^18.3.1`, `wrangler ^4.83.0`) — deps are correctly declared, just not installed in this worktree.
- `AGENTS.md` lines 18-30 — the existing "Cloudflare Deployment" and "Verification" sections. A fresh-worktree note belongs alongside these.

### Institutional Learnings

- `docs/solutions/` directory does not exist in this repo — no prior learnings to carry forward.
- Memory (`C:\Users\B52620\.claude\projects\...\memory\`): "Always git fetch before branch work" — followed in Phase 0 of discovery; confirmed worktree is clean on `worktree-quirky-napping-tome @ 155bb14`.

### External References

- Node.js docs on [`import.meta.url`](https://nodejs.org/api/esm.html#importmetaurl) — explicitly notes that on Windows the URL encoding requires `pathToFileURL` for cross-platform parity with `process.argv[1]`.
- Node.js docs on [git worktrees](https://git-scm.com/docs/git-worktree) — worktrees share `.git` but not working-tree siblings like `node_modules/`; fresh `npm install` per worktree is expected.

---

## Key Technical Decisions

- **Use `pathToFileURL(process.argv[1]).href` pattern in audit-client-bundle.mjs**: Matches the existing 5 sibling scripts exactly. Zero-surprise diff for reviewers and zero cross-platform risk. Rationale: consistency with established repo convention; avoids inventing a new pattern.
- **Add a defensive `process.argv[1] &&` guard**: Sibling scripts do this to cover test harnesses or dynamic imports where `argv[1]` may be undefined. Cost is one boolean check; the guard has already proven useful elsewhere in the codebase.
- **Fix Cluster C by making `build-bundles.mjs` explicit about await + error propagation**: Convert the two side-effect imports to awaited dynamic `import()` calls inside a top-level async block with an explicit `process.exitCode = 1` on any rejection. This preserves the orchestrator's simplicity while guaranteeing non-zero exit on any downstream failure. Rationale: static side-effect imports from an ESM entry point can mask async rejections when Node's module-loading state machine settles after the script's sync body completes — an explicit await chain is the idiomatic fix.
- **Add a lightweight `preflight` npm script that verifies `node_modules` exists**: Purely advisory. When `npm test` is run in a fresh worktree, the current `ERR_MODULE_NOT_FOUND` stacktrace is cryptic; a one-line "Did you run `npm install`? This worktree has no node_modules." saves future debugging time. Lightweight — a 10-line script plus one line in `"pretest"`. Rationale: AGENTS.md notes are easy to miss; runtime signal is harder to miss.
- **Document the fresh-worktree precondition in AGENTS.md**: Single sentence under "Verification". Keeps James's communication channel (AGENTS.md is authoritative for this repo) as the durable source.
- **Do not introduce a monorepo / workspace linking strategy**: Out of scope. `npm install` per worktree is well-understood and cheap for this repo's dep count.

---

## Open Questions

### Resolved During Planning

- **Should the plan run `npm install` as a committed step?** No — `node_modules/` is gitignored. U1 is a one-off env setup the implementer runs locally; nothing gets committed.
- **Does fixing Cluster B require any test changes?** No. The 7 failing `tests/bundle-audit.test.js` tests are correct — they prove the audit script rejects forbidden inputs. They start passing the moment the CLI guard matches.
- **Does Cluster C's fix risk breaking the `check`/`deploy` scripts?** No. `npm run check` uses `scripts/wrangler-oauth.mjs deploy --dry-run`, not `build-bundles.mjs`. `npm run deploy` calls `wrangler deploy` + `audit:production`, also independent. `build-bundles.mjs` is only invoked by `npm run build` and by `tests/build-public.test.js`.
- **Does the audit script's CLI-guard fix affect its `export async function runClientBundleAudit`?** No. The exported function is unchanged; only the `if (import.meta.url === ...)` line moves to `pathToFileURL`.

### Deferred to Implementation

- **Exact wording of the `pretest` pre-flight message**: draft during U4; confirm it matches the project's UK-English voice.
- **Whether `build-bundles.mjs`'s error wrapping should capture and re-throw, or just `process.exitCode = 1` + rethrow**: tested during U3; pick whichever produces a clean stacktrace for CI.

---

## Implementation Units

- U1. **Install worktree dependencies (one-off, not committed)**

**Goal:** Establish `node_modules/` in this worktree so Node can resolve `react`, `react-dom`, `esbuild`, `wrangler` as declared in `package.json` devDependencies.

**Requirements:** R1 (dominant contributor — ~32 of 40 failures).

**Dependencies:** None.

**Files:**
- Modify: none (nothing committed; `node_modules/` is gitignored at `.gitignore:5`).

**Approach:**
- Run `npm install` from the worktree root.
- Verify `node_modules/react/package.json`, `node_modules/react-dom/package.json`, `node_modules/esbuild/package.json`, `node_modules/wrangler/package.json` exist.
- Re-run `npm test` to confirm Cluster A and Cluster C (the latter depends on esbuild being installable) are resolved before starting code changes.

**Execution note:** This is an environment step, not a code change. The plan sequences it first because U2 and U3 need a working `npm test` baseline to verify their fixes don't regress anything.

**Patterns to follow:**
- `AGENTS.md` "Verification" section — uses `npm test` and `npm run check` as the gate; this step establishes that gate.

**Test scenarios:**
- Test expectation: none — this is an env setup step with no behaviour to unit-test. Verification is the full `npm test` run in U5.

**Verification:**
- `node -e "require.resolve('react')"` succeeds from worktree root.
- `npm test` failure count drops from 40 to ≤8 (Cluster B's 7 tests + Cluster C's 1 test remain, which U2 and U3 address).

---

- U2. **Fix Windows CLI-guard in scripts/audit-client-bundle.mjs**

**Goal:** Make `scripts/audit-client-bundle.mjs` execute its audit when invoked as a CLI on Windows (and cleanly remain a no-op when imported as a module).

**Requirements:** R2 — addresses Cluster B (7 failing bundle-audit tests).

**Dependencies:** U1 (U2 verification requires a working `npm test`).

**Files:**
- Modify: `scripts/audit-client-bundle.mjs`
- Test: `tests/bundle-audit.test.js` (existing; no new test file needed — the 7 failing tests become the verification).

**Approach:**
- Import `pathToFileURL` from `node:url` alongside existing imports.
- Replace line 208's `` if (import.meta.url === `file://${process.argv[1]}`) `` with the cross-platform sibling pattern: `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { ... }`.
- No other changes. The `runClientBundleAudit` export and all audit rules are untouched.

**Patterns to follow:**
- `scripts/punctuation-production-smoke.mjs:357`
- `scripts/probe-production-bootstrap.mjs:292`
- `scripts/grammar-production-smoke.mjs:417`
- `scripts/backfill-learner-read-models.mjs:254`
- `scripts/classroom-load-test.mjs:669`

All five demonstrate the same idiom; U2 is a conformance change, not a new design.

**Test scenarios:**
- Happy path: The 7 currently-failing `tests/bundle-audit.test.js` assertions all pass after the fix, covering: forbidden engine/content/local-mode tokens, Grammar server runtime, browser-side AI provider keys, Punctuation AI context-pack provider flows, legacy broad write routes, punctuation engine/content imports, public output exposing shared punctuation source.
- Edge case — CLI invoked with relative path: `node ./scripts/audit-client-bundle.mjs --bundle X --metafile Y --public-dir Z` exits non-zero with the expected `Forbidden production-client` / `server-authoritative Grammar runtime` / etc. error on known-bad input.
- Edge case — CLI invoked with absolute path: `node C:/.../scripts/audit-client-bundle.mjs ...` behaves identically to the relative-path case.
- Integration — module import: `import('./scripts/audit-client-bundle.mjs')` still returns the `runClientBundleAudit` export without executing the CLI side-effect (existing `tests/worker-access.test.js` and any suite that consumes this export).

**Verification:**
- All 14 tests in `tests/bundle-audit.test.js` pass (7 previously failing + 7 already passing).
- `node ./scripts/audit-client-bundle.mjs --bundle <known-bad-bundle> --metafile <meta> --public-dir <pub>` exits with code 1 and prints the failure reason to stderr.

---

- U3. **Make scripts/build-bundles.mjs propagate failures instead of silently exiting 0**

**Goal:** Ensure the bundle-orchestrator exits non-zero when any step (manifest generation or esbuild client build) fails, so `tests/build-public.test.js` and future CI cannot get a false green.

**Requirements:** R3 — addresses Cluster C (1 failing build-public test *and* the latent silent-exit risk that would survive U1).

**Dependencies:** U1 (verification requires esbuild installed so the "healthy path" can be tested).

**Files:**
- Modify: `scripts/build-bundles.mjs`
- Test: `tests/build-public.test.js` (existing; no new test file — existing test becomes the behavioural check).

**Approach:**
- Replace the two side-effect static imports with an explicit top-level async entry point that awaits each step and sets `process.exitCode = 1` + rethrows on any rejection.
- Preserve the existing two-step sequence (manifest first, then client build).
- Keep the script lightweight — a handful of lines, not a framework rewrite.

**Technical design:** *(directional — illustrates the intended shape, not literal code to copy-paste)*

The rewrite replaces two side-effect imports with an awaited chain that propagates failures. Conceptually: resolve each sibling script path relative to the orchestrator's URL, await `import()` on each in sequence, and on any rejection set `process.exitCode = 1` then rethrow so the stacktrace surfaces. The orchestrator stays 10-15 lines, runs each sibling's top-level await to completion before the orchestrator exits, and no longer silently loses async rejections.

**Patterns to follow:**
- The existing 2-line style — keep it minimal. Awaited dynamic import inside a try/catch, not a new orchestrator framework.
- `scripts/audit-client-bundle.mjs`'s CLI error pattern (after U2) — `console.error` + non-zero exit code.

**Test scenarios:**
- Happy path: With all deps installed, `node ./scripts/build-bundles.mjs` exits 0 and `src/bundles/app.bundle.js` + `src/bundles/app.bundle.meta.json` exist (current green behaviour, preserved).
- Integration: `tests/build-public.test.js` "public build emits the React app bundle entrypoint" passes because U1 installs esbuild and U3 preserves the healthy path.
- Error path — missing dependency: Temporarily rename `node_modules/esbuild` and run `node ./scripts/build-bundles.mjs`. The script must exit with non-zero code (not 0) and stderr must contain `ERR_MODULE_NOT_FOUND` or an equivalent esbuild-missing signal. Restore `node_modules/esbuild` after the check.
- Error path — manifest script failure: If `generate-monster-visual-manifest.mjs` throws (e.g., because `assets/` source files are missing), the orchestrator exits non-zero, and the `build-client.mjs` step does *not* run (fail-fast — no partial build artefact).
- Regression check: `npm run build` (which runs `build-bundles.mjs` + `build-public.mjs`) continues to produce `dist/public/` output in the healthy path.

**Verification:**
- `tests/build-public.test.js` "public build emits the React app bundle entrypoint" passes.
- Manual fault-injection (rename `node_modules/esbuild` temporarily): `echo $?` / `%ERRORLEVEL%` after `node ./scripts/build-bundles.mjs` is non-zero. Restore immediately.
- `npm run build` healthy path still produces `dist/public/app.bundle.js` and sibling manifest files.

---

- U4. **Add a lightweight `pretest` pre-flight that detects missing node_modules**

**Goal:** When a future fresh-worktree session runs `npm test` before `npm install`, the failure message is immediately actionable instead of producing a cryptic `ERR_MODULE_NOT_FOUND: Cannot find package 'react'` stacktrace.

**Requirements:** R4 — reduces fresh-worktree debugging friction for James's future sessions.

**Dependencies:** None strictly (can run in parallel with U2/U3), but sequenced after U3 so the `package.json` diff stays small and reviewable in one commit.

**Files:**
- Create: `scripts/preflight-test.mjs`
- Modify: `package.json` (add `"pretest"` script pointing at the new file).

**Approach:**
- `scripts/preflight-test.mjs` checks for `node_modules/react/package.json` and `node_modules/esbuild/package.json` (the two packages that dominate the Cluster A failure list). If either is missing, print a single-line UK-English message: `Missing node_modules — run "npm install" from this worktree root before "npm test".` and `process.exit(1)`.
- `"pretest": "node ./scripts/preflight-test.mjs"` runs automatically before `"test"`. When `node_modules` exists, the pre-flight is a ~10ms no-op.
- Script is standalone, uses only `node:fs`, `node:path`, `node:url` — no third-party imports (which would be self-defeating).

**Patterns to follow:**
- `scripts/audit-client-bundle.mjs` style: short, defensive, clear error message, no heavy framework.
- UK-English voice per `AGENTS.md` line 8.

**Test scenarios:**
- Happy path: With `node_modules/react` and `node_modules/esbuild` present, `node ./scripts/preflight-test.mjs` exits 0 silently; `npm test` proceeds as before.
- Error path: Temporarily rename `node_modules/` to `node_modules.bak/`. `npm test` now prints the guidance message from `scripts/preflight-test.mjs` and exits non-zero *before* node:test starts, so the user sees the actionable message as the first/only output. Restore `node_modules/` after the check.
- Edge case — partial install: With `node_modules/react` present but `node_modules/esbuild` missing (simulates interrupted install), the pre-flight still fails with the same message. One missing dep is enough to warrant re-install.

**Verification:**
- `ls -la && mv node_modules node_modules.bak && npm test; mv node_modules.bak node_modules` produces the guidance message and non-zero exit before node:test starts.
- `npm test` healthy path still completes with 0 failures and the pre-flight adds negligible overhead (<50ms).

---

- U5. **Update AGENTS.md with fresh-worktree precondition and run full verification**

**Goal:** Document the `npm install` precondition for fresh worktrees so the next session (James's or a teammate's) has the runbook, and run the full verification gate to prove R1 holds.

**Requirements:** R1 (verification), R4 (documentation), R5 (no regression).

**Dependencies:** U1, U2, U3, U4 (this unit closes the loop).

**Files:**
- Modify: `AGENTS.md` (add one line under the existing "Verification" section).

**Approach:**
- Add a short bullet under the existing "Verification" heading (currently at `AGENTS.md:27-30`): `When working from a fresh git worktree, run "npm install" once before "npm test" or "npm run check". Git worktrees do not share node_modules with the primary checkout.`
- Run `npm test` and `npm run check` from the worktree. Both must pass.
- Keep AGENTS.md changes minimal — James maintains this file as authoritative guidance; do not restructure sections.

**Patterns to follow:**
- `AGENTS.md` existing voice: short imperative bullets, UK-English, no emoji.

**Test scenarios:**
- Verification (R1): `npm test` exits 0 with 0 failing tests (was 40).
- Verification (R5, no regression): `npm run check` exits 0 (OAuth-safe wrangler dry-run deploy still passes).
- Regression — the 7 `tests/bundle-audit.test.js` tests that exercise `execFileSync(audit-client-bundle.mjs)` now pass with `Forbidden production-client` / `server-authoritative Grammar runtime` / etc. messages surfacing from stderr.
- Regression — the 32 tests gated by `react` / `esbuild` imports pass, covering React surfaces (`tests/react-*.test.js`), monster visual renderers (`tests/monster-visual-renderers.test.js`, `tests/render-*.test.js`), runtime boundary (`tests/runtime-boundary.test.js`), and the broad store/state/spelling/punctuation/worker suites.
- Integration — `tests/build-public.test.js` passes because U3's fail-fast chain catches missing deps loudly; U1 ensures deps are present in the healthy path.

**Verification:**
- `npm test` → 718 pass, 0 fail, 1 skipped (was 678 pass, 40 fail, 1 skipped). Skipped remains `browser migration smoke` (gated by `KS2_BROWSER_SMOKE=1`).
- `npm run check` exits 0.
- `git diff` shows exactly 4 tracked files changed: `scripts/audit-client-bundle.mjs`, `scripts/build-bundles.mjs`, `scripts/preflight-test.mjs` (new), `package.json`, plus one AGENTS.md line.

---

## System-Wide Impact

- **Interaction graph:** `scripts/audit-client-bundle.mjs` is invoked by `tests/bundle-audit.test.js` (7 tests) and not called from any other script — U2's fix is surgically local. `scripts/build-bundles.mjs` is invoked by `npm run build` (which is called by `npm run deploy`) and by `tests/build-public.test.js` — U3's fix changes the orchestrator's exit semantics, which is exactly the intent for both paths.
- **Error propagation:** Cluster B previously had audit failures **silenced** (exit 0 when they should have been exit 1). Cluster C previously had build failures **silenced** the same way. Both fixes move the scripts from "silent false-green" to "loud true-red" — improving blast-radius visibility, not expanding it.
- **State lifecycle risks:** None. No persisted state, no caches invalidated, no migration.
- **API surface parity:** No change to `runClientBundleAudit` export signature; no change to audit rules. Deploy-time audit (`npm run audit:production` via `scripts/production-bundle-audit.mjs`) is a separate script and not touched.
- **Integration coverage:** Full `npm test` is run in U5 — no mocks, real scripts, real filesystem.
- **Unchanged invariants:** `FORBIDDEN_MODULES` and `FORBIDDEN_TEXT` audit policy unchanged. OAuth-safe wrangler flow unchanged. Deploy scripts unchanged. All subject engines, rewards, content, read-models unchanged. No D1, R2, Worker, or R2-asset contract touched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `npm install` in this worktree pulls versions that differ from the primary checkout, causing "works on my worktree" skew. | Devdeps are pinned-ish (`^0.28.0`, `^18.3.1`, `^4.83.0`) with a semver-compatible expectation; acceptable for this project's dep surface. If a lockfile is present and consulted, `npm ci` would be stricter — check during U1 and prefer `npm ci` if `package-lock.json` is tracked. |
| U3's orchestrator rewrite introduces a subtle regression in `npm run build` output (e.g., manifest generation ordering). | U3 preserves the existing two-step sequence (manifest first, then client build); verification runs `npm run build` end-to-end and checks `dist/public/app.bundle.js` exists. Fault-injection test for the error path confirms fail-fast works. |
| U4's `pretest` hook adds observable latency on every `npm test` run. | Pre-flight is ~10ms filesystem stat check, no imports; measurable overhead is indistinguishable from node-test's own startup. |
| AGENTS.md edit drifts from James's voice or structure. | U5 adds a single bullet under an existing section; does not reorganise. James reviews during PR. |
| Cluster A turns out to have residual failures after `npm install` (e.g., a test expects a file that only exists post-build). | U1's verification step re-runs `npm test` immediately after install — any residual failures are surfaced before U2/U3 start and can be triaged then. The plan's 40 → ≤8 assumption is based on `grep`-confirmed error-source counts; if reality differs, U1's report drives replanning. |

---

## Documentation / Operational Notes

- No deployment impact. `npm run deploy` and `npm run check` paths unchanged.
- No migration impact. `db:migrate:*` scripts unchanged.
- AGENTS.md update is the only documentation change; it's additive.
- For the next fresh worktree: one-line `npm install` becomes discoverable both via AGENTS.md and (when missed) via the `pretest` pre-flight message.

---

## Post-Implementation Reconciliation

*Added 2026-04-25 after merge of PRs #172, #174, #176. The sections above preserve the plan as originally drafted; this section reconciles it with what actually shipped.*

### Gap 1 — U3 file scope widened

Originally scoped `**Files:**` for U3 listed only `scripts/build-bundles.mjs` (modify) and `tests/build-public.test.js` (existing verification). During implementation, maintainability review widened the scope:

- **Modified:** `scripts/build-bundles.mjs`, `scripts/build-public.mjs` (symmetry — the silent-exit risk applied equally to the public-build orchestrator, so the fix was applied to both for parity).
- **Created:** `tests/build-bundles-failfast.test.js` (dedicated fail-fast behavioural test; the existing `tests/build-public.test.js` only covered the happy path), `tests/fixtures/build-bundles-failfast/orchestrator.mjs` (fixture sibling that deliberately throws, used by the new test to verify non-zero exit propagation without relying on fault-injection of `node_modules/`).
- **Existing (unchanged target):** `tests/build-public.test.js` — kept as the happy-path regression check, as planned.

Rationale: the fault-injection verification sketched in the original U3 (rename `node_modules/esbuild`) was workable but left no permanent regression guard. A dedicated fixture + test gives CI a stable signal that survives beyond the merge.

### Gap 2 — Exit strategy: `process.exit(1)` vs. `exitCode = 1` + rethrow

The plan's Approach (U3, around the Key Technical Decisions bullet and `**Approach:**` at line ~184) specified `process.exitCode = 1` + rethrow. During U3 implementation this pattern was observed to still exit 0 in practice — the rethrow surfaced the stacktrace but Node's module-loading settle sequence let the process end cleanly before the exit code propagated. Shipped code uses `process.exit(1)` directly inside the `catch` block after logging.

Trade-off accepted: `process.exit(1)` short-circuits any in-flight async work, which is acceptable here because the orchestrator has no cleanup obligations and fail-fast is the desired semantic. The Key Technical Decision bullet "Fix Cluster C by making `build-bundles.mjs` explicit about await + error propagation" remains valid — only the exit mechanism changed.

### Gap 3 — `npm run check` pre-existing Windows failure

U5's verification claimed `npm run check` would pass. It does not, on Windows: the OAuth-safe wrangler dry-run deploy fails with `spawnSync npx.cmd EINVAL`. Verified by stashing all U5 changes and re-running — the failure reproduces on `main`, so it is **pre-existing and unrelated to this plan's scope**.

Out of scope for this plan. Tracked as a follow-up; R5 ("no regression of AGENTS.md-flagged production-sensitive surfaces") still holds because the deploy path is unchanged — the `check` invocation itself is what fails, not any downstream contract.

### Gap 4 — Actual test counts on completion

U5's verification predicted `npm test → 718 pass, 0 fail, 1 skipped`. Actual shipped outcome: **1150 pass, 1 fail, 1 skipped.**

- **Total count grew from 719 → 1152**: parallel feature merges on `main` during this plan's execution (notably `feat(punctuation)` and `feat(grammar)` U8 perfection-pass release gate landings) added ~430 tests. Plan's prediction was accurate for the frozen snapshot at discovery time; the drift reflects normal main-branch velocity.
- **1 failing test**: a pre-existing CRLF fixture bug, not caused by this plan. Verified independent of U1-U5 by reproducing on a stash of the plan's changes.
- **1 skipped**: `browser migration smoke` (gated by `KS2_BROWSER_SMOKE=1`) — matches plan.

R1 ("npm test exits 0 with 0 failing tests") is substantially met for all failures in this plan's scope; the residual CRLF failure is tracked as a follow-up.

---

## Sources & References

- Test discovery output: `/tmp/test-output.txt` (local to this session).
- Cluster B cross-platform pattern: `scripts/punctuation-production-smoke.mjs:357`, `scripts/probe-production-bootstrap.mjs:292`, `scripts/grammar-production-smoke.mjs:417`, `scripts/backfill-learner-read-models.mjs:254`, `scripts/classroom-load-test.mjs:669`.
- Related recent commits: `00e4a5c feat(grammar): U8 perfection-pass release gate`, `155bb14 feat(punctuation): read-time normaliser preserves pre-flip Codex state` — confirm the `main` branch was green before this worktree; the 40 failures are environment/cross-platform in origin, not feature regressions.
- External docs: Node.js `import.meta.url` (https://nodejs.org/api/esm.html#importmetaurl), `git worktree` (https://git-scm.com/docs/git-worktree).
