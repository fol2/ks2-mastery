# Contract R7: CI Shard Balance — Split Parity + Weight-Aware Assignment (<120s target)

**Date:** 2026-05-05
**Owner:** James To
**Priority:** Medium — tighten wall-clock within existing budget
**Supersedes partial:** R6 residual imbalance (shards 3/1 at 160s/141s)
**Revision:** v2 — grounded in per-file timing data from CI run 25370279508

---

## Problem Statement

Post-R6 measured shard durations (main branch, 6 shards, seed `v242`):

| Shard | Duration | Heaviest file(s) |
|-------|---------:|------------------|
| 3/6   | 160s     | **grammar-selection-parity.test.js (122.5s)** + 4 others |
| 1/6   | 141s     | grammar-selection-core-weights-1 (84.4s) + 3 others |
| 4/6   | 89s      | — |
| 2/6   | 83s      | — |
| 6/6   | 76s      | — |
| 5/6   | 54s      | — |

**Root cause is now identified — it is a single file, not a distribution problem:**

- `grammar-selection-parity.test.js` takes **122.5s** — the single heaviest file in the entire suite.
- Any LPT/seeded/hash assignment places that file on *some* shard, which becomes that shard's hard floor.
- The R6 parity harness runs **384 cases × 2 functions = 768 queue builds** — the PR-gate tier was sized to exceed R6.AC2's `>=200` minimum and is currently 192% over the floor.
- **Math:** Any shard containing this file is ≥122.5s + setup overhead. `<120s` is mathematically impossible without splitting this file (or moving it to full-sweep-only, which relaxes R6.AC2's PR-gate commitment).

**Correct lever:** split the parity harness into 2 files, each running a disjoint half of the 384 cases (~192 cases / ~61s each). Combined with weight-aware LPT assignment to handle the remaining secondary-heavy files, heaviest shard falls from 160s to predicted ~95s.

---

## Scope

**In scope:**
1. **Split `grammar-selection-parity.test.js` into 2 sibling files** along a natural case-partition boundary (mode axis).
2. **Weight-aware LPT assignment** in `scripts/shard-shuffle.mjs` using a committed `shard-weights.json` manifest captured from a green main CI run.
3. Manifest regeneration tooling (`npm run ci:regen-weights`).
4. Phased tripwire tightening (warn at 2.0x in addition to existing 2.5x).

**Out of scope:**
- Adding more shards (stays at 6).
- Moving parity harness to full-sweep-only — violates R6.AC2 PR-gate commitment.
- Reducing the 384-case count — would drop below R6.AC2's `>=200` minimum once distributed.
- Production code changes (R6 memoization already harvested).
- Seed re-sweeps — dominated by LPT once weights are known.
- Rebuild-hoisting O2, worker cache sharing — unnecessary once the outlier file is split.

---

## Requirements

### R1: Split grammar-selection-parity.test.js

Partition the 384-case PR-gate sweep into two files along the `MODES` axis:

- `tests/grammar-selection-parity-smart-satsset.test.js` — modes `['smart', 'satsset']` — 192 cases
- `tests/grammar-selection-parity-surgery-builder.test.js` — modes `['surgery', 'builder']` — 192 cases

**Acceptance criteria:**
- Each file's `enumerateCases()` emits exactly 192 cases under the PR-gate tier (no full-sweep env var).
- Combined case keys across both files equal the original 384-case set, with no overlap and no gap. A tiny unit test verifies this.
- Both files import and compare against the **same** `tests/fixtures/grammar-selection-parity-snapshot.json` — no snapshot duplication.
- Full-sweep tier (`GRAMMAR_PARITY_FULL_SWEEP=1`) adds the concept × mode × seed cross to each file proportionally, so the sum remains the original ~2,300 cases.
- Each file targets ≤70s wall-clock on the CI runner (was 122.5s / 2 = 61.3s expected; headroom for variance).
- The ordering-hook from the original (snapshot-import-at-load-time) is preserved in both files.
- Delete the original `grammar-selection-parity.test.js`.

**Rationale for mode-axis split:** modes are top-level iteration and produce fully independent case keys; no shared snapshot rows span modes. Partitioning here keeps each file self-contained with no need to share test state.

### R2: Weight manifest committed

A single file `scripts/shard-weights.json` stores per-file millisecond timings, taken from a representative green CI run on main **after R1 has merged** (so the split files have their own weights captured).

**Acceptance criteria:**
- File shape: `{ "seed": "v242", "capturedAt": "2026-05-05T...Z", "sourceRun": "<actions-run-id>", "files": { "<relative-path>": <duration_ms>, ... } }`
- Contains every file currently assigned to a shard by `run-node-tests.mjs` on main.
- Weights come from CI runner measurements only (Linux), not local.
- Regenerated manually via R4 script — not on every run (deterministic is the point).

### R3: Weight-aware LPT assignment

Replace `getShardFiles` in `scripts/shard-shuffle.mjs` with a deterministic Longest Processing Time bin-packing algorithm:

1. Load weights manifest. Missing files receive the median known weight.
2. Sort files by weight descending (tie-break on path lex for determinism).
3. Walk the sorted list; place each file on the shard with currently lowest total weight (ties broken by lowest shard index).
4. Return per-shard file lists in **path-sorted** order so `node:test` sees stable input order within a shard.

**Acceptance criteria:**
- Same input + same manifest → same output on every run.
- Post-R1 predicted heaviest shard ≤95s (≤120s with ≥25s safety margin).
- Post-R1 predicted imbalance ratio ≤1.5x (was 2.96x).
- Existing `v242` hash shuffle preserved as `seededShuffleFallback` for the no-manifest degraded path and for unit-test parity against the current algorithm.
- `--test-shard=N/M` CLI semantics unchanged.

### R4: Manifest regeneration script

`npm run ci:regen-weights` (backed by `scripts/regen-shard-weights.mjs`) reads `shard-*-timings.json` artifacts from `./ci-artifacts/` (downloaded via `gh run download <run-id>`) and writes a refreshed `shard-weights.json`.

**Acceptance criteria:**
- Pure function of inputs; no side effects outside writing the manifest.
- Rejects with non-zero exit if <6 artifact files present.
- Rejects if any single file weight is 0 or missing.
- Output JSON keys sorted alphabetically for clean diffs.
- One-line entry in `scripts/README.md`; full prose in this contract.

### R5: New-file graceful degradation

**Acceptance criteria:**
- Test files absent from the manifest get the median weight and are LPT-placed alongside known files.
- No manual manifest edit required to merge a PR that adds test files.
- Warning annotation fires when ≥10% of active files are missing from the manifest (signal to regenerate).

### R6: Tripwire tightening (phased)

**Phase A (this contract):**
- Keep existing warn-only at 2.5x.
- Add a second warn at 2.0x: `::warning::Shard imbalance ratio X.XX exceeds target 2.0x — consider regenerating shard-weights.json`.
- Add a third warn for ≥10% manifest-miss rate per R5.

**Phase B (deferred to R8 if R7 holds for 7 days on main):** convert 2.5x to failure.

### R7: Test coverage

**Acceptance criteria:**
- Unit test: LPT algorithm places weights [10,9,8,7,6,5] across 3 shards into balanced groups.
- Unit test: missing weights resolve to median of known weights.
- Unit test: determinism — two invocations return identical output.
- Unit test: partition completeness — `∪ getShardFiles(files, i, N)` for `i=1..N` equals `files`.
- Unit test: the two split parity files together emit all 384 PR-gate cases (no overlap, no gap).

### R8: Zero production code changes

**Acceptance criteria:**
- No edits under `src/**`, `public/**`, or `worker/**`.
- Only edits: two new test files + deleted original + `scripts/shard-shuffle.mjs` + `scripts/run-node-tests.mjs` (if needed) + new `scripts/shard-weights.json` + new `scripts/regen-shard-weights.mjs` + algorithm tests.
- `npm test` pass/fail outcomes identical to R6 baseline — the combined split parity suite produces the same assertions as the original.

---

## Success Metrics

Measured on a representative main-branch CI run post-merge (commit run twice, averaged):

| Metric | Pre-R7 (R6 baseline) | Predicted post-R7 | Target | Failure threshold |
|--------|---------------------:|------------------:|-------:|------------------:|
| Heaviest shard duration | 160s | ~95s | <120s | ≥130s |
| Lightest shard duration | 54s | ~85s | ≥80s | <65s |
| Imbalance ratio | 2.96x | ~1.3x | ≤1.8x | >2.4x |
| Timeout headroom (7min / heaviest) | 2.6x | ~4.4x | ≥3.5x | <3.2x |
| Test pass/fail vs R6 | baseline | identical | identical | any divergence |
| R6.AC2 PR-gate case count | 384 | 384 (192+192) | ≥200 | <200 |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------:|-------:|------------|
| Split file pair drifts (one edited without the other) | Medium | Medium | R7 partition-completeness test catches it; test file names make the pair obvious; contract reference comment in both |
| Shared snapshot double-load doubles disk IO | Low | Low | Snapshot is ~KB; load is ms; acceptable |
| Second-heaviest file (grammar-selection-core-weights-1, 84.4s) becomes new bottleneck | Medium | Low | Still <120s; acceptable. If drift pushes it over, apply R1-style split as R7.1 patch |
| LPT misses because weights captured on an outlier CI run | Medium | Medium | R4 rejects incomplete runs; regen re-run if heaviest shard >120s on two consecutive runs |
| Full-sweep env var path breaks after split | Medium | High | R1 AC requires full-sweep case count preserved; test both modes during PR |
| Manifest grows stale as tests drift | Medium | Low | R5 10%-miss tripwire flags regeneration need |

---

## Sizing

- **R1 split:** ~50 lines moved + ~30 lines glue (shared helpers + partition test). Mechanical refactor.
- **R2 manifest:** one-time data capture; ~640 files × ~25 bytes = ~16KB JSON.
- **R3 algorithm:** ~40 lines in `scripts/shard-shuffle.mjs`.
- **R4 regen script:** ~60 lines.
- **R7 tests:** ~100 lines across 2 files.
- **Total LoC change:** ~250 production + 1 data file + 2 new test files (offset by 1 deletion).

---

## Delivery Plan

Recommended ordering — serial dependency (R2 weights capture must come **after** R1 split or the manifest will be stale on day 1):

1. **PR 1 (R1):** Split parity file into two. Tests prove set equality and per-file runtime <70s. No manifest changes.
2. **PR 2 (R2 + R3 + R7):** Capture fresh weights from PR 1's CI run; commit manifest; LPT algorithm; tests. Atomic.
3. **PR 3 (R4 + R6):** Regen tooling + tripwire tightening.

Single-PR alternative: bundle R1+R2+R3+R4+R6+R7. Downside: manifest must be captured from a pre-merge run on the R1 split, making the PR sequence awkward. Recommend 3 PRs.

---

## Why this, not the alternatives

| Lever | Expected reduction | Risk | Verdict |
|-------|-------------------:|-----:|---------|
| **Split parity + LPT (R7)** | 160s → ~95s (provable) | Low — mechanical + deterministic | **CHOSEN** |
| LPT alone (weights, no split) | 160s → ~130s (floored by 122.5s file) | Low | Insufficient — misses <120s target |
| Split parity alone (no LPT) | 160s → ~120s (still weight-blind on secondary files) | Low | Marginal — fragile to future drift |
| Move parity to full-sweep-only | 160s → ~90s | **High** — violates R6.AC2 PR-gate commitment | Rejected |
| Reduce PR-gate case count | Variable | **High** — violates R6.AC2 `>=200` floor | Rejected |
| Seed re-sweep | 10-30s (weight-blind) | Low | Dominated by weight-aware |
| Rebuild O2 | ~15% of shard | Medium — prod code | Unnecessary once outlier split |
| Worker cache sharing | Unknown | High — novel infra | Unnecessary once outlier split |

The single insight: one outlier file created a hard floor. The fix is to remove the floor (split) and then balance the rest deterministically (LPT). Both halves of the fix are mechanical and reversible.

---

## Exit Criteria

- All R1-R8 acceptance criteria met.
- Measured heaviest shard <120s on 3 consecutive green main-branch runs post-merge.
- Imbalance ratio <1.8x on those runs.
- R6.AC2 PR-gate case count remains ≥200 (split preserves 384).
- R8 (hard-fail tripwire) opened only if the 2.5x tightening is pursued; R7 is otherwise the terminal contract for shard balance.

---

## Open questions for council review

1. **Snapshot file sharing vs duplication:** R1 assumes both split files read the same `grammar-selection-parity-snapshot.json`. Acceptable to engineer/architect, or should the snapshot also be split for locality?
2. **`node-test.yml` vs `ci.yml` divergence** (flagged separately to team-lead): the 80-shard `node-test.yml` still exists on main. Should R7 delete it, or is that a separate cleanup PR outside this contract?
3. **PR ordering:** 3 serial PRs (recommended) vs 1 bundled. Ops preference?
