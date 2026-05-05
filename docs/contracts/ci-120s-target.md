# Contract: CI <120s Wall-Clock Target

**Date:** 2026-05-05
**Owner:** James To
**Priority:** High — achieve <120s heaviest-shard wall-clock
**Council:** Contract Writer + Engineer + Architect + Ops reviewed; all four APPROVED on 2026-05-05.

---

## Problem Statement

Post-R6, the heaviest shard (Shard 3) runs 160s. Target is <120s. Total test CPU-time across 6 shards is 603s. Node:test runs files concurrently within each shard (effective parallelism ~3.3x on ubuntu-latest 4 vCPUs). Fitted model: `wall_ms = 0.305 × sum(file_ms) + 11,600ms` (measured 2026-05-05, Node v22, ±5s error).

Current seed 'v242' produces max-shard-sum = 365s → predicted wall 123s → CI reported 160s (with ~20s job overhead). A better seed distributes file-sums more evenly.

Engineer's 120k-seed sweep found 'ks2-9597' produces max-shard-sum = 228s → predicted wall 81s → CI ~101s. This clears <120s with 19s headroom.

---

## Scope

**In scope:**
- Swap seed constant in `scripts/shard-shuffle.mjs`
- Add hard ceiling tripwire in `ci-gate` job
- Tighten balance tripwire from 2.5x to 2.0x
- Add single-file duration warning

**Out of scope:**
- Timing manifest or LPT bin-packing (only 2s better than seed; not worth 250 LoC)
- File splitting (concurrent execution means 122s CPU-time file = ~37s wall contribution; no split needed)
- Production code changes
- Shard count changes (stays at 6)
- Timeout changes (stays at 7 min)
- Pre-push hook changes

---

## Requirements

### R1: Seed swap

**Acceptance criteria:**
- `scripts/shard-shuffle.mjs` line 3: `const SEED = 'ks2-9597';` (replaces `'v242'`)
- Same seeded-shuffle mechanism (MD5 hash), only the constant changes
- Deterministic: same file list + same seed = same assignment
- One-line change, zero test regression

### R2: Hard ceiling tripwire (FAIL gate)

**Acceptance criteria:**
- In the `ci-gate` job, after downloading shard timing artifacts:
- If `max(shard_wallMs) > 120000`, emit `::error::` and `exit 1`
- Error message includes: which shard, its wallMs, and guidance ("seed swap or file split required")
- Guarded: skip check if fewer than 2 timing artifacts present (partial runs)
- This is a **hard gate** — CI fails, PR cannot merge

### R3: Balance tripwire (tightened)

**Acceptance criteria:**
- Replace existing 2.5x warning with 2.0x threshold
- If `max(shard_wallMs) / min(shard_wallMs) > 2.0`, emit `::warning::`
- Warning-only (does NOT fail CI) — drift signal for future council
- Delete the dead 2.5x code path

### R4: Single-file ceiling warning

**Acceptance criteria:**
- After collecting per-file timings from `shard-*-timings.json`:
- If any single file's duration exceeds 90,000ms, emit `::warning::File <path> took <X>ms — consider splitting if this recurs`
- Warning-only (does NOT fail CI)
- Signals files that may become problematic if concurrency model changes

---

## Non-functional Requirements

- **Budget:** unchanged (6 shards, same monthly cost)
- **Wall-clock target:** <120s heaviest shard (down from 160s)
- **Timeout:** stays at 7 min (3.5x headroom over target; satisfies 2x rule)
- **Maintenance:** zero ongoing — seed is static, tripwires are self-correcting
- **Concurrency model assumption:** `wall ≈ 0.305 × sum(file_ms) + 11.6s` measured 2026-05-05 on ubuntu-latest Node v22. If coefficient drifts (runner change, Node upgrade), R2 will naturally fire and force a re-sweep.

---

## Verification Plan

1. Deploy seed swap + tripwires in single PR
2. PR's own CI run shows heaviest shard <120s
3. Confirm 3 consecutive CI runs on same main SHA all show max shard <110s
4. Confirm R2 does NOT fire (max < 120s)
5. Confirm R3 does NOT fire (ratio < 2.0)
6. Confirm R4 fires for grammar-selection-parity.test.js (122.5s CPU-time > 90s threshold) — expected warning, not failure
7. Confirm all existing tests pass unchanged

---

## Predicted Outcome

| Metric | Baseline (post-R6) | Predicted |
|--------|--------------------:|----------:|
| Heaviest shard wall | 160s | ~101s |
| Imbalance ratio | 2.96x | <2.0x |
| Timeout headroom | 2.6x | ~4.2x |
| Test outcomes | baseline | identical |

---

## Delivery

Single atomic PR. Contains:
- 1-line seed swap in `scripts/shard-shuffle.mjs`
- ~15 lines tripwire additions in `.github/workflows/ci.yml` (ci-gate job)
- Test for shard-shuffle determinism with new seed

---

## Rollback

Revert the seed: `'ks2-9597'` → `'v242'`. One-line change. R2 tripwire will fire on the revert PR (as expected — reverting knowingly degrades).

---

## Prior Art

- R6 memoisation reduced total test CPU-time by 48.7%
- Seed 'v242' was optimised for a pre-parity-harness file list
- Engineer's concurrency model validated across 6 shards with <5s error
- 120k-seed sweep exhaustive; marginal LPT gains <2s
- Council confirmed: file-splitting unnecessary under concurrent execution (122s CPU = ~37s wall)
