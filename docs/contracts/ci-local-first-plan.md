# Implementation Plan: Local-First CI

**Contract:** `docs/contracts/ci-local-first.md`
**Date:** 2026-05-04

---

## Unit 1: Fix ENAMETOOLONG on Windows (R1)

**Files to modify:**
- `scripts/run-node-tests.mjs` — replace `spawn(execPath, ['--test', ...files])` with the programmatic `node:test` `run()` API, which passes file paths in-process (no argv limit)

**Implementation:**
The root cause is `spawn(process.execPath, ['--test', ...argv, ...630files])` where 630 file paths as argv exceed Windows' 32K CreateProcess limit.

Fix: Switch from shelling out to Node's programmatic test runner API:

```js
import { run } from 'node:test';

const files = await resolveTestFiles();
const stream = run({
  files,
  concurrency: true,  // uses os.availableParallelism()
  // CLI flags like --test-shard are handled by passing them to the options
});
// pipe stream to spec reporter, propagate exit code
```

This keeps all 630 file paths in-process memory — never touches OS argv. The `run()` API supports `shard` option (`{ index, total }`) for CI sharding, and `concurrency` for local parallelism.

The existing `resolveTestFiles()` function (file discovery + Playwright exclusion) stays unchanged — it already returns the correct file list. Only the execution mechanism changes from `spawn` to `run()`.

The `hasUserPositional` and `buildSpawnArgs` functions remain exported for backward compatibility with existing tests, but the CLI entrypoint switches to `run()` when no positional is supplied.

**Existing tests to update:**
- `tests/run-node-tests-runner.test.js`: update to verify the new execution path
- `tests/ci-shard-coverage.test.js`: update file-count assertion if the API changes what's exported

**Tests to add:**
- Verify `resolveTestFiles()` discovers 630+ files (unchanged from current)
- Verify Playwright files are excluded (unchanged)
- Verify the `run()` invocation works on Windows without ENAMETOOLONG
- Verify `--test-shard` CLI arg is translated to `shard: { index, total }` option

**Acceptance criteria:**
- `npm test` works on Windows without ENAMETOOLONG
- `npm test` still works on Mac/Linux
- Existing shard usage (`--test-shard=N/M`) unaffected

---

## Unit 2: Pre-push hook + simple-git-hooks (R2, R3, R6)

**Files to create:**
- `scripts/hooks/pre-push.mjs` — Node.js hook logic
- `.githooks/pre-push` — thin shell stub (`exec node scripts/hooks/pre-push.mjs "$@"`)

**Files to modify:**
- `package.json` — add `simple-git-hooks` config + `postinstall` script + devDependency

**Implementation:**
The hook:
1. Reads stdin for pushed refs (standard pre-push protocol)
2. Computes changed files via `git diff --name-only <remote-sha>..<local-sha>`
3. If all files match docs pattern (`^(docs/|.*\.md$)`), prints "docs-only — skipping tests" and exits 0
4. If `SKIP_PREPUSH=1` env var is set, prints warning and exits 0
5. Otherwise runs `npm test` via `child_process.spawn` with stdio inherited
6. Exits with the test process exit code (0 = pass → push proceeds, non-0 = fail → push blocked)

**Tests:**
- `tests/pre-push-hook.test.js`:
  - Verify docs-only detection (all `.md` files → skip)
  - Verify mixed changes (code + docs → run tests)
  - Verify `SKIP_PREPUSH=1` bypasses
  - Verify stdin ref parsing (4-tuple per line)

**Acceptance criteria:**
- Hook works on Linux, Mac, Windows (Git Bash)
- `simple-git-hooks` installs hook to `.git/hooks/pre-push` on `npm install`
- Worktrees inherit the hook (verified by checking `$GIT_COMMON_DIR/hooks/`)
- `--no-verify` bypasses (standard git)
- Same `npm test` command as CI

---

## Unit 3: Unified CI workflow (R4, R5, R7)

**Files to create:**
- `.github/workflows/ci.yml` — the unified workflow

**Files to delete (in separate transition PR):**
- `.github/workflows/node-test.yml`
- `.github/workflows/audit.yml`
- `.github/workflows/punctuation-content-audit.yml`

**Implementation:**
Single workflow with:
- `classify` job: docs-only detection (reuses existing `.github/actions/classify-docs-only`)
- `ci-gate` job (named `"Node Tests (gate)"` for branch protection): checkout → setup-node → npm ci → npm run build → npm test → npm run audit:client → npm run audit:punctuation-content → npm run check (continue-on-error)
- Triggers: `pull_request`, `push: branches: [main]`, `workflow_dispatch`
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`
- `permissions: contents: read`
- `timeout-minutes: 15`

**Transition (R7):**
- Phase 1: Land `ci.yml` alongside existing workflows (both run in parallel)
- Phase 2: After 20+ green PRs, delete old workflows in a follow-up PR

**Tests:**
- `tests/ci-workflow-structure.test.js`: structural assertions on the YAML (same pattern as existing `ci-shard-coverage.test.js`)
  - Verify `ci-gate` job exists with correct name
  - Verify `npm test` step exists
  - Verify `concurrency` and `cancel-in-progress`
  - Verify `timeout-minutes: 15`

**Acceptance criteria:**
- Single job per push = ~7 billable min (budget: 1,050 min/month)
- `Node Tests (gate)` check name preserved
- All existing checks (tests, audit, punctuation) run in the single job
- Docs-only PRs skip the job
- Old workflows can coexist during transition

---

## Unit 4: Delete old workflows (R7 Phase 3)

**Files to delete:**
- `.github/workflows/node-test.yml`
- `.github/workflows/audit.yml`
- `.github/workflows/punctuation-content-audit.yml`

**Also delete (cleanup):**
- `tests/ci-shard-coverage.test.js` (tests the 80-shard structure that no longer exists)

**Acceptance criteria:**
- Only `ci.yml` and `playwright.yml` (+ nightlies) remain
- Branch protection still works (check name unchanged)
- No orphaned workflow runs

---

## Ordering

```
Unit 1 (ENAMETOOLONG fix) — prerequisite for local testing
  ↓
Unit 2 (pre-push hook) — depends on npm test working locally
  ↓
Unit 3 (unified ci.yml) — can run in parallel with old workflows
  ↓
Unit 4 (delete old workflows) — only after ci.yml proven green
```

Units 1-3 can be delivered as separate PRs. Unit 4 follows after verification.

---

## DEFERRED: requires human

- **Verification Plan items 3, 6, 7** (push with --no-verify, push from worktree, break a test): These are interactive verification steps. The autonomous equivalent is the test coverage in Units 2 and 3 which validate the same behaviour programmatically.
- **R7 "20+ green PRs"**: The transition period cannot be compressed — it requires real pushes over time. The contract will be delivered with both old and new workflows running in parallel. A follow-up (Unit 4) deletes old workflows once confidence is established.
