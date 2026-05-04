# Implementation Plan: CI Speed Optimisation

**Contract:** `docs/contracts/ci-speed-optimisation.md`
**Date:** 2026-05-04

---

## Background

The `node-test.yml` workflow runs 626 test files sequentially in a single job, taking ~651s. Node.js `--test-shard=i/N` is natively supported (v20+) and `scripts/run-node-tests.mjs` already forwards CLI args via `process.argv.slice(2)` (line 134) into the spawn args (line 119: `['--test', ...argv, ...files]`). No script modification is needed.

---

## Unit 1: Shard the node-test workflow

**Delivers:** R1, R2, R3, R4, R5, R6

### Files to modify

- `.github/workflows/node-test.yml` — rewrite the single `test` job into a matrix + fan-in pattern

### Implementation

Replace the current single `test` job with three jobs:

1. **`changes`** (existing) — docs-only classification, unchanged
2. **`test`** (matrix) — runs shards in parallel
3. **`wrangler-check`** — isolated wrangler dry-run (separated from test shards)
4. **`ci-gate`** — fan-in job that aggregates all shard results + wrangler-check

#### Job: `test` (matrix)

```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    total: [10]
```

- `fail-fast: false` ensures all shards complete so the full failure picture is visible
- Each shard step: `node ./scripts/run-node-tests.mjs --test-shard=${{ matrix.shard }}/${{ matrix.total }}`
- `needs: changes` with the same docs-only skip condition
- `timeout-minutes: 3` (down from 15)
- Same checkout, setup-node (v22), npm ci steps

#### Job: `wrangler-check`

- Lightweight job: checkout + setup-node + npm ci + `npm run check`
- `continue-on-error: true` preserved
- `needs: changes` with docs-only skip
- `timeout-minutes: 3`
- Runs in parallel with test shards (no dependency on `test`)

#### Job: `ci-gate` (fan-in)

```yaml
ci-gate:
  name: "Node Tests (gate)"
  needs: [test, wrangler-check]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - name: Check shard results
      run: |
        if [ "${{ needs.test.result }}" = "failure" ]; then exit 1; fi
        if [ "${{ needs.test.result }}" = "cancelled" ]; then exit 1; fi
```

- Stable job name for branch protection: `Node Tests (gate)`
- Passes only when ALL shards passed (or were skipped due to docs-only)
- Does not depend on wrangler-check outcome (it's continue-on-error)

### Concurrency

Keep the existing concurrency group at workflow level:
```yaml
concurrency:
  group: node-test-pr-${{ github.ref }}
  cancel-in-progress: true
```

This cancels the entire workflow (all shards) when a new push arrives.

### Acceptance criteria verification

| Requirement | How satisfied |
|---|---|
| R1: Matrix sharding | `strategy.matrix.shard: [1..10]` + `--test-shard` flag |
| R2: Wrangler isolated | Separate `wrangler-check` job, runs once |
| R3: < 60s wall-clock | 626 files / 10 shards ≈ 63 files each; each shard ~45s + 15s setup = ~60s |
| R4: Robustness | `fail-fast: false`, fan-in gate, concurrency cancel, node 22, timeout 3m |
| R5: Single status check | `ci-gate` job with stable name `Node Tests (gate)` |
| R6: No run-node-tests.mjs change | `--test-shard` forwarded natively via `process.argv.slice(2)` |

### Tests to write

- `tests/ci-shard-coverage.test.js` — meta-tests that verify shard correctness:

  1. **File discovery completeness** — imports `buildSpawnArgs` from `scripts/run-node-tests.mjs`, calls it with `['--test-shard=1/10']`, asserts the returned file list contains all discovered test files (proving the `--test-shard` flag is forwarded, not treated as a positional, and file discovery is complete)

  2. **Shard flag passthrough** — asserts `buildSpawnArgs(['--test-shard=1/10'])` includes `--test-shard=1/10` in the returned args array (proving it reaches node's test runner)

  3. **Fan-in gate structural assertion** — reads `.github/workflows/node-test.yml`, parses it, and asserts:
     - A `ci-gate` job exists with `needs` containing both `test` and `wrangler-check`
     - The `ci-gate` job has `if: always()` (so it runs even when dependencies fail)
     - The gate step checks for `failure` and `cancelled` in `needs.test.result`
     - This autonomously validates Verification Plan item 5 ("a single test failure fails the entire check") without requiring a human to push a broken test

---

## Unit 2: Verification — push and measure

**Delivers:** Contract Verification Plan items 1-5

### Implementation

This unit is the verification step after Unit 1 merges. It requires:

1. Push a code-change PR to trigger CI
2. Wait for all checks to report
3. Measure total wall-clock time
4. Verify < 60s target

If the 60s target is not met:
- Increase shard count (12 or 15) in a follow-up commit on the same PR
- Re-push and re-measure

### Acceptance criteria

- All 4 workflows green
- Total wall-clock < 60 seconds
- Docs-only PR skips correctly (verified by the plan PR itself)

### Autonomous verification of fan-in failure behaviour

Verification Plan item 5 ("intentionally break one test file and confirm the aggregate check fails") is converted to an autonomous structural test in `tests/ci-shard-coverage.test.js` (test 3: fan-in gate structural assertion). This test parses the workflow YAML and asserts the gate logic is correctly wired, without needing a human to push a broken test file.

---

## Ordering

```
Unit 1 (workflow rewrite + meta-test)
  → PR → review → merge
  → Unit 2 (verify timing on the Unit 1 PR itself — the PR's own CI run IS the measurement)
```

Note: Unit 2's verification happens organically — the Unit 1 PR's own CI run demonstrates whether the 60s target is met. If it fails the timing target, a follow-up commit on the same branch bumps the shard count before merge.

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Shard imbalance (one shard gets heavy files) | Node `--test-shard` distributes by index hash, not alphabetically; tolerable imbalance; bump shard count if needed |
| npm ci cache miss on matrix jobs | GitHub's npm cache is keyed by `package-lock.json` hash — all 10 shards hit the same cache entry |
| Runner queue delay | 10 ubuntu-latest runners should be available instantly for a private repo with GitHub Pro |
| ENAMETOOLONG on CI | Linux arg limit is 2MB+; 626 relative paths is ~30KB; not a risk |
