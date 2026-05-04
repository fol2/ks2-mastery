# Contract: Local-First CI — Minimum GitHub Minutes

**Date:** 2026-05-04
**Owner:** James To
**Priority:** High — free tier budget (2,000 min/month) exceeded by 6x

---

## Problem Statement

The current 80-shard CI burns **~80 billable minutes per PR push**. At ~150 pushes/month, that's **12,000 min/month** — far exceeding the GitHub Free tier (2,000 min/month for private repos). The test suite (630+ files, ~6700 tests) must remain a hard gate with zero coverage loss.

---

## Strategy

Run the full test suite **locally before push** (free compute, ~80s on 8-core dev machines). CI's job is to **re-run the same suite on Linux** as a cross-platform verification signal — not for speed, but for deploy-target parity (Cloudflare Workers runs on Linux). This reduces CI to a single job (~5-7 min, 5-7 billable min) while the local hook provides fast feedback.

---

## Scope

**In scope:**
- Fix `npm test` to work on Windows (ENAMETOOLONG — prerequisite)
- Add a pre-push hook that runs `npm test` locally before allowing push
- Collapse 4 CI workflows into 1 unified `ci.yml` with a single job
- Inline audit + punctuation checks as sequential steps in that job
- Preserve the `Node Tests (gate)` check name for branch protection
- Cross-platform hook compatibility (Linux, Mac, Windows)
- Agent worktree compatibility (hooks must propagate to worktrees)

**Out of scope:**
- Self-hosted runners (no new infrastructure)
- External services (no VPS, no Oracle, no cloud providers)
- Changing the Playwright workflow (stays separate, opt-in via label)
- Changing the nightly workflows
- Deleting tests or reducing assertion coverage

---

## Requirements

### R1: Fix ENAMETOOLONG on Windows (prerequisite)

`npm test` currently fails on Windows because 639 file paths exceed the spawn argv limit.

**Acceptance criteria:**
- `npm test` works on Windows, Mac, and Linux without error
- Solution: use `node --test --test-shard=1/1` internally (Node enumerates files itself, keeping argv small)
- `scripts/run-node-tests.mjs` is the only file modified (minimal patch)
- No change to test behaviour — same files discovered, same execution order

### R2: Pre-push hook (local test gate)

A git pre-push hook runs `npm test` locally before allowing `git push`.

**Acceptance criteria:**
- Hook logic lives in `scripts/hooks/pre-push.mjs` (Node.js — cross-platform)
- Shell stub at `.githooks/pre-push`: `exec node scripts/hooks/pre-push.mjs "$@"`
- Installed via `simple-git-hooks` (configured in `package.json`, runs on `postinstall`)
- Does NOT use `core.hooksPath` (so worktrees inherit hooks via `$GIT_COMMON_DIR/hooks/`)
- Works identically on Linux, Mac, and Windows (Git Bash)
- Runs `npm test` — the exact same command CI runs
- Blocks push on test failure (exit 1)
- Supports `--no-verify` (standard git escape hatch)
- Supports `SKIP_PREPUSH=1` environment variable (for agents needing to bypass with audit trail)
- Docs-only detection: if all changed files match `^(docs/|.*\.md$)`, skip tests and print "docs-only — skipping tests"
- On infra error (Node not found, disk full): print warning and exit 1 (fail-closed, retry or use `--no-verify`)

### R3: Agent worktree compatibility

The hook must work for autonomous agents pushing from worktrees.

**Acceptance criteria:**
- `simple-git-hooks` writes to `.git/hooks/pre-push` (the common dir)
- Worktrees resolve hooks from `$GIT_COMMON_DIR/hooks/` (default git behaviour)
- One `npm install` on the parent clone installs the hook for all present and future worktrees
- `git push` from Node.js `spawn` (how agents push) triggers the hook
- Verified: hook fires from worktree context with correct `pwd`

### R4: Unified CI workflow

Collapse `node-test.yml`, `audit.yml`, and `punctuation-content-audit.yml` into a single `ci.yml`.

**Acceptance criteria:**
- Single workflow file: `.github/workflows/ci.yml`
- Single job: `ci-gate` with `name: "Node Tests (gate)"` (preserves branch protection)
- Sequential steps in one job: checkout → setup-node → npm ci → build → `npm test` → audit:client → punctuation-audit → wrangler-check (continue-on-error)
- Docs-only classification preserved (skip job on docs-only changes)
- `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`
- Triggers: `pull_request` + `push: branches: [main]` + `workflow_dispatch`
- `permissions: contents: read`
- `timeout-minutes: 15`
- Runner: `ubuntu-latest` (2-vCPU on private free tier)
- Delete old workflows: `node-test.yml`, `audit.yml`, `punctuation-content-audit.yml`
- Keep `playwright.yml` separate (opt-in, needs Chromium install)

### R5: Budget target

**Acceptance criteria:**
- Single job per push = ceil(wall-clock / 60) billable minutes
- Estimated wall-clock: 5-7 min (npm ci ~15s cached, build ~10s, tests ~5 min on 2-vCPU, audits ~30s)
- Billable: ~7 min/push × 150 pushes = **~1,050 min/month**
- Well within 2,000 min free tier with 950 min headroom
- `cancel-in-progress` saves ~120 min/month on force-push cascades

### R6: Cross-platform parity

**Acceptance criteria:**
- Hook and CI run the identical command: `npm test`
- `scripts/run-node-tests.mjs` is the single source of truth for test file discovery
- Playwright files excluded by the script (not by glob differences)
- `preflight-test.mjs` runs via npm's `pretest` hook on both local and CI
- If local passes (any OS) but CI fails: indicates a real cross-platform bug (feature, not bug in CI design)

### R7: Transition without downtime

**Acceptance criteria:**
- Phase 1: Land `ci.yml` alongside existing workflows (both run for 1 week)
- Phase 2: Verify `ci.yml` reports green on 20+ PRs
- Phase 3: Delete old workflows in a single PR
- Branch protection check name `Node Tests (gate)` is unchanged throughout
- Rollback: `git revert` the deletion PR restores old workflows immediately

---

## Non-functional Requirements

- **Maintainability:** one workflow file, one test command, one hook script
- **Cost:** ~1,050 min/month (52% of free tier)
- **Wall-clock:** ~80s local (fast feedback) + ~5-7 min CI (authoritative Linux signal)
- **Observability:** each CI step has a distinct name in Actions UI; failures are immediately attributable

---

## Verification Plan

1. Run `npm test` on Windows — passes without ENAMETOOLONG
2. Run `npm test` on Mac/Linux — passes identically
3. Push with tests passing → CI green, hook ran locally
4. Push with `--no-verify` → CI still runs and catches failures
5. Push docs-only → hook skips tests, CI skips via classifier
6. Push from a worktree → hook fires correctly
7. Break a test → hook blocks push locally
8. Monthly billing stays under 1,050 min

---

## Edge Cases (documented)

| Scenario | Behaviour |
|---|---|
| GitHub web UI edit (no hook) | CI catches it via `push: branches: [main]` trigger |
| Dependabot PR | CI runs normally (no hook on their side) |
| Agent uses `--no-verify` | CI is the backstop — fails if tests fail |
| Fresh clone without `npm install` | Hook not installed; CI catches failures; `npm test` outputs warning |
| Mac passes, Linux fails | Cross-platform bug — exactly what CI exists to catch |
| Tests pass locally, fail on CI | Investigate OS difference; fix the test or the code |
| Hook crashes (infra error) | Push blocked; developer uses `--no-verify` and CI is the gate |
| `cancel-in-progress` kills run | New push triggers fresh run; old run's minutes partially saved |

---

## Prior Art & Constraints

- `simple-git-hooks` is zero-runtime-dep, writes to `.git/hooks/` directly (no `core.hooksPath`)
- Git worktrees share hooks from `$GIT_COMMON_DIR/hooks/` — verified empirically
- ubuntu-latest on private repos = 2-vCPU / 8GB (NOT 4-vCPU)
- `scripts/run-node-tests.mjs` handles file discovery + Playwright exclusion + CLI forwarding
- `--test-shard=1/1` makes Node enumerate files internally (solves ENAMETOOLONG without argv explosion)
