# Contract: CI Speed Optimisation

**Date:** 2026-05-04
**Owner:** James To
**Priority:** High — blocking developer velocity

---

## Problem Statement

The PR CI pipeline currently takes **~12 minutes** wall-clock, with the `Node Tests (PR)` workflow consuming **~700 seconds** (651s in the test step alone). The other 3 parallel workflows (`Client Bundle Audit` 51s, `Punctuation Content Audit` 44s, `Playwright` 28s) are already within acceptable bounds.

626 test files run sequentially in a single job. GitHub Actions provides `--test-shard` (Node.js built-in since v20) and matrix strategies that can parallelise this trivially.

---

## Scope

**In scope:**
- Shard the `node-test.yml` workflow into parallel matrix jobs using `node --test --test-shard`
- Target: total CI wall-clock < 60 seconds from PR push to all checks green
- Maintain docs-only skip behaviour (existing `classify-docs-only` action)
- Maintain `continue-on-error` on the wrangler dry-run step (only runs in one shard)
- Keep concurrency group and cancel-in-progress behaviour

**Out of scope:**
- Changing the Playwright, Client Bundle Audit, or Punctuation Content Audit workflows (already fast)
- Changing test file organisation or splitting the test suite into separate packages
- Adding third-party CI services or test-splitting tools
- Changing the nightly workflows (`mega-invariant-nightly.yml`, `playwright-nightly.yml`)
- Modifying individual test files

---

## Requirements

### R1: Matrix sharding of Node Tests

Shard the 626 test files across N parallel GitHub Actions jobs using a matrix strategy and `node --test --test-shard=<index>/<total>`.

**Acceptance criteria:**
- The workflow uses a matrix with a configurable shard count (initial: 10 shards)
- Each shard runs `node ./scripts/run-node-tests.mjs` (or equivalent) with `--test-shard=i/N`
- All shards run in parallel on separate runners
- If any shard fails, the overall check reports failure
- The `classify-docs-only` gate still skips all shards for docs-only PRs

### R2: Wrangler dry-run isolated to one shard

The `npm run check` (wrangler deploy dry-run) step currently runs after tests. It must continue to run exactly once per PR, not N times.

**Acceptance criteria:**
- The wrangler dry-run step runs in only one shard (e.g., shard 1/N) or in a separate lightweight job
- It retains `continue-on-error: true`
- It does not block other shards

### R3: Total wall-clock target < 60 seconds

The complete CI pass (all 4 workflows running in parallel, with the node-test shards as the dominant factor) must complete in under 60 seconds.

**Acceptance criteria:**
- Measured from PR push to all checks reporting success
- The test step in each shard completes in < 45 seconds (651s / 10 shards ≈ 65s theoretical, but disk I/O is the bottleneck on startup — 10 shards should bring real time under 45s given GitHub's 2-4 core runners)
- If 10 shards is insufficient, increase to 12 or 15 — the shard count is the tuning knob
- npm ci + setup overhead per shard remains under 15 seconds (already proven at 13s total for single job)

### R4: Robustness preservation

The delivery cycle's integrity must not degrade.

**Acceptance criteria:**
- No test is silently dropped — the union of all shards covers exactly the 626 files
- A single test failure in any shard fails the entire PR check (no "merge with 9/10 green")
- The `concurrency` group + `cancel-in-progress` still cancels stale runs
- The `workflow_dispatch` trigger still works for manual re-runs
- Node version remains pinned to `22` (matching other workflows)
- `npm ci --no-audit --no-fund` caching behaviour unchanged
- The `timeout-minutes` per shard is proportionally reduced (2 minutes per shard vs 15 for monolith)

### R5: Single status check for merge gating

GitHub required status checks reference job names. The sharded jobs must report a single aggregate status that can serve as the merge gate.

**Acceptance criteria:**
- A final "fan-in" job depends on all shards and the wrangler-check job
- This fan-in job name is stable (does not change with shard count) so it can be configured as a required check
- The fan-in job passes only if ALL shards + wrangler-check passed (or were skipped due to docs-only)

### R6: No modification to run-node-tests.mjs

The `scripts/run-node-tests.mjs` helper already handles file discovery and Playwright exclusion. The sharding must be passed through via CLI args (Node.js `--test-shard` is a `node --test` native flag).

**Acceptance criteria:**
- `scripts/run-node-tests.mjs` is NOT modified
- The `--test-shard` flag is passed as a CLI arg to the script's `node --test` subprocess
- If `run-node-tests.mjs` does not forward `--test-shard` natively, a minimal patch (< 5 lines) ensures unknown flags pass through — but verify first (it may already forward args via `process.argv.slice(2)`)

---

## Non-functional Requirements

- **Maintainability:** The shard count is a single `strategy.matrix` value, trivially adjustable
- **Cost:** 10 parallel jobs × ~60s each = 10 billable minutes per PR (vs current 12 min single job). Net cost is approximately neutral.
- **Observability:** If a shard fails, the matrix job name includes the shard index so maintainers know which slice to investigate

---

## Verification Plan

1. After implementation, push a code PR (not docs-only) and measure wall-clock time
2. Confirm all 4 workflows complete
3. Confirm the total time from push to all-green is < 60 seconds
4. Push a docs-only PR and confirm all workflows skip (fast-path)
5. Intentionally break one test file and confirm the aggregate check fails

---

## Prior Art & Constraints

- Node.js `--test-shard` splits by file index, not by test count — uneven file sizes may cause imbalance. This is acceptable for a first pass; if one shard is consistently slow, the shard count can be bumped.
- GitHub Actions matrix supports up to 256 jobs. 10-15 shards is well within limits.
- The existing `scripts/run-node-tests.mjs` discovers files and passes them to `node --test`. Verify it forwards extra CLI args (`process.argv.slice(2)`) — the current code shows it does.
- The ENAMETOOLONG error seen locally (Windows, 626 files as positional args) does not affect CI (Linux, `--test-shard` avoids the arg explosion).
