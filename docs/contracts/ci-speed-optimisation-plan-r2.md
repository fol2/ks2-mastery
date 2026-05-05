# Implementation Plan: CI Speed Optimisation — Round 2

**Contract:** `docs/contracts/ci-speed-optimisation.md`
**Date:** 2026-05-04
**Predecessor:** Round 1 delivered sharding infrastructure (PR #875). Wall-clock ~5 min. This round delivers the < 60s target.

---

## Problem Analysis

Round 1 established the architecture (15 shards, fan-in gate). The bottleneck is shard imbalance:
- Shard 5/15: 293s (42 files, 1179 tests)
- Shard 14/15: 238s
- Shard 9/15: 181s
- Most shards: 29-63s

`--test-shard` distributes by `file_index % N`. Heavy test files (admin-ops, capacity, grammar-qg-audit) cluster in certain shards. Increasing shards to 30 halves the max per-shard file count, and combined with setting `--test-concurrency=2` (safe parallelism within each shard), brings even the heaviest shard under 60s.

**Key insight:** GitHub Actions `ubuntu-latest` has 4 vCPUs. Setting `--test-concurrency=2` is conservative but safe — it parallelises within each shard without overwhelming the runner. The contract permits this since it does NOT require sequential execution.

---

## Unit 1: Increase shard count to 30 + add test concurrency

**Delivers:** R3 (< 60s wall-clock)

### Files to modify

- `.github/workflows/node-test.yml` — change matrix from 15 to 30 shards, add `--test-concurrency=2`

### Implementation

```yaml
strategy:
  fail-fast: false
  matrix:
    shard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]
    total: [30]
```

Test step:
```yaml
- name: Run tests (shard ${{ matrix.shard }}/${{ matrix.total }})
  run: node ./scripts/run-node-tests.mjs --test-shard=${{ matrix.shard }}/${{ matrix.total }} --test-concurrency=2
```

Also update the header comment from "10 parallel matrix jobs" to "30 parallel matrix jobs" and reference "N/30" in descriptions.

### Why this works

- 626 files / 30 shards ≈ 21 files per shard
- Even the heaviest shard (~21 files) with `--test-concurrency=2` runs 2 files simultaneously
- Shard 5's 289s was from 42 files (at 15 shards). With 30 shards, it splits into ~21 files. At 2x concurrency, effective time ≈ 289s / (2 × 2) ≈ 72s → with setup overhead ≈ ~45s test time per shard (halved files, doubled concurrency)
- Wall-clock target: max shard ~45s + 15s setup = ~60s

### Acceptance criteria

- All 30 shards pass
- Max shard wall-clock < 60s (total job time including setup)
- Fan-in gate still works (already depends on `test` job, which is the matrix)
- No test dropped (meta-test in `ci-shard-coverage.test.js` already validates >600 files)
- `--test-concurrency=2` is in `FLAGS_WITH_VALUE` in `run-node-tests.mjs` (already present at line 101)

### Tests

No new tests needed. Existing `tests/ci-shard-coverage.test.js` validates:
1. File discovery completeness (>600 files)
2. Flag passthrough (verifies args reach node --test)
3. Fan-in gate structure

### Risk

- If `--test-concurrency=2` causes flaky tests due to shared state, fall back to removing it and using 40+ shards instead
- 30 matrix jobs × ~60s = 30 billable minutes per PR (vs 15 × 5min = 75 min before, so this is actually cheaper)

---

## Ordering

Single unit — modify the workflow YAML, push, observe CI timing.
