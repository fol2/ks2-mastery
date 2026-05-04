# Implementation Plan: CI Speed Optimisation — Round 3

**Contract:** `docs/contracts/ci-speed-optimisation.md`
**Date:** 2026-05-04
**Predecessor:** Round 2 attempted 30 shards + concurrency. Shards 5/9/14 still timeout due to heavy individual test files.

---

## Root Cause

`--test-shard` distributes by `sorted_file_index % N`. Heavy files cluster together by coincidence of their alphabetical position. The fix is to split the heaviest files so no single file dominates a shard.

## Target Files

From CI timing analysis, the slowest shards contain these heavy files:
- `tests/verify-capacity-evidence.test.js` — 2719 lines (shard 9)
- `tests/spelling-boss.test.js` — 1563 lines (shard 9)
- `tests/worker-projection-hot-path.test.js` — 997 lines (shard 14)
- `tests/build-spelling-word-audio.test.js` — 946 lines (shard 5)

## Strategy

Revert to **15 shards** (simpler, fewer billable minutes) but split the 4 heaviest files. Each split creates 2-3 files with the same total assertions. This redistributes weight across different shards (since the new filenames will sort to different indices).

Additionally, remove `--test-concurrency=2` as it introduces flakiness risk without solving the fundamental imbalance.

---

## Unit 1: Revert workflow to 15 shards, remove concurrency

**Files to modify:**
- `.github/workflows/node-test.yml` — revert to 15 shards, timeout 5min, remove `--test-concurrency`

---

## Unit 2: Split heavy test files

**Files to split:**

1. `tests/verify-capacity-evidence.test.js` (2719 lines) → split into:
   - `tests/verify-capacity-evidence-schema.test.js` (schema/structure assertions)
   - `tests/verify-capacity-evidence-certification.test.js` (certification logic)
   - `tests/verify-capacity-evidence-metrics.test.js` (metrics/KPI assertions)

2. `tests/spelling-boss.test.js` (1563 lines) → split into:
   - `tests/spelling-boss-lifecycle.test.js` (session lifecycle)
   - `tests/spelling-boss-scoring.test.js` (scoring/progression)

3. `tests/worker-projection-hot-path.test.js` (997 lines) → split into:
   - `tests/worker-projection-hot-path-read.test.js` (read projections)
   - `tests/worker-projection-hot-path-write.test.js` (write/mutation projections)

4. `tests/build-spelling-word-audio.test.js` (946 lines) → split into:
   - `tests/build-spelling-word-audio-plan.test.js` (planning/selection)
   - `tests/build-spelling-word-audio-generate.test.js` (generation/upload)

**Rules:**
- Every test assertion must survive the split — zero deletions
- Shared fixtures/helpers extracted to the top of each new file (copy, don't share)
- Each new file must be independently runnable with `node --test <file>`
- The original file is deleted after split

**Acceptance criteria:**
- `npm test` passes with zero failures
- Test count is unchanged or increased (never decreased)
- The new files sort to different shard indices, breaking up the cluster
- Max shard time < 60s on CI

---

## Ordering

Unit 1 → Unit 2 → push → observe CI → verify <60s
