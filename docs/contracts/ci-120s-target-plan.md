---
title: "perf: CI <120s seed swap + tripwires"
type: feat
status: active
date: 2026-05-05
origin: docs/contracts/ci-120s-target.md
---

# CI <120s Seed Swap + Tripwires

## Overview

Single PR delivering: seed swap from 'v242' to 'ks2-9597' in `scripts/shard-shuffle.mjs`, plus 3 tripwires in `.github/workflows/ci.yml` ci-gate job. Predicted: 160s → ~101s heaviest shard.

---

## Requirements Trace

- R1 — Seed swap ('v242' → 'ks2-9597')
- R2 — Hard ceiling tripwire (max shard > 120s = FAIL)
- R3 — Balance tripwire (max/min > 2.0 = warning, tightened from 2.5)
- R4 — Single-file ceiling warning (file > 90s = warning)

---

## Implementation Units

- U1. **Seed swap + tripwires (single PR)**

**Goal:** Swap seed constant and add all 3 tripwires in one atomic PR.

**Requirements:** R1, R2, R3, R4

**Dependencies:** None

**Files:**
- Modify: `scripts/shard-shuffle.mjs` (line 3: SEED constant)
- Modify: `.github/workflows/ci.yml` (ci-gate job: add ceiling check, tighten balance, add file warning)
- Modify: `tests/shard-shuffle.test.js` (update seed reference if any test asserts on SEED value)

**Approach:**

*R1 — Seed swap:*
- `scripts/shard-shuffle.mjs` line 3: `const SEED = 'v242';` → `const SEED = 'ks2-9597';`

*R2 — Hard ceiling (in ci-gate "Check shard balance" step):*
- After computing max/min, add: if `max > 120000`, emit `::error::Heaviest shard ${max}ms exceeds 120s ceiling — seed sweep or file split required` and `process.exit(1)`
- Guard: if `files.length < 2`, skip (partial run)

*R3 — Balance tripwire tightened:*
- Change existing threshold from 2.5 to 2.0
- Existing code already emits `::warning::` — just change the number

*R4 — Single-file ceiling:*
- After loading all shard timing JSONs, iterate all files entries across all shards
- For any file with duration > 90000ms, emit `::warning::File ${filename} took ${ms}ms — consider splitting if this recurs`

**Test scenarios:**
- Happy path: CI passes with new seed (heaviest shard <120s)
- Happy path: shard-shuffle determinism test still passes with new seed
- Edge case: R2 guard skips when <2 artifacts present
- Edge case: R4 fires for grammar-selection-parity.test.js (122.5s > 90s) — warning only, not fail

**Verification:**
- PR's own CI run shows heaviest shard <120s
- R2 does NOT fire
- R3 does NOT fire (ratio < 2.0)
- R4 DOES fire for parity harness (expected warning)
- All existing tests pass unchanged
- shard-shuffle.test.js passes with new seed

---

## DEFERRED: requires human

- **3 consecutive CI runs on same SHA (Verification Plan step 3):** Agent can trigger `gh workflow run` but runner variance means the "same SHA" measurement needs human adjudication if any single run is marginal (>115s). Infrastructure is in place for the agent to measure.
