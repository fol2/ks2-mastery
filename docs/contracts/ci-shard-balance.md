# Contract: CI Shard Balance Optimisation

**Date:** 2026-05-05
**Owner:** James To
**Priority:** Medium — improve wall-clock within existing budget

---

## Problem Statement

The 6-shard CI has severe imbalance: shards range from 1m17s to 4m12s (3.2x spread). The bottleneck is `--test-shard`'s modulo distribution (`file_index % 6`) which clusters alphabetically adjacent test files onto the same shard. Heavy test directories (`grammar-*`, `punctuation-*`, `admin-*`) land together by alphabetical proximity.

If perfectly balanced, each shard would be ~2m30s instead of 4m12s. Same budget, 40% faster wall-clock.

---

## Scope

**In scope:**
- Replace modulo distribution with seeded shuffle in `run-node-tests.mjs`
- Add per-shard timing artifact emission (for future diagnostics)
- Add imbalance tripwire warning in CI output
- Split any individual test file that exceeds 90s execution time (if identified)
- Ensure new test files are distributed deterministically without manual intervention

**Out of scope:**
- Changing the shard count (stays at 6)
- Adding new CI infrastructure (no bots, no scheduled workflows, no manifests)
- Changing the billing (same 6 jobs, same monthly cost)
- Modifying test logic or assertions

---

## Requirements

### R1: Seeded shuffle replaces modulo

Replace `--test-shard`'s modulo-based file distribution with a deterministic seeded shuffle.

**Acceptance criteria:**
- Shard assignment uses a seeded PRNG to shuffle the file list before slicing into N groups
- Seed is pinned in source (e.g., a constant string hash or derived from `package-lock.json` hash)
- Same file list + same seed = same assignment on every run (deterministic, reproducible)
- New test files get hashed into a shard deterministically (no "unassigned" fallback)
- The `--test-shard=N/M` CLI flag continues to work but uses the new shuffle-based distribution
- Existing `--test-shard` behaviour for targeted CI workflows is preserved

### R2: Per-shard timing artifact

Each shard emits a timing artifact for future diagnostics.

**Acceptance criteria:**
- After tests complete, write `shard-N-timings.json` as a GitHub Actions artifact
- Contents: `{ "shard": N, "total": M, "files": { "<path>": <duration_ms>, ... }, "wallMs": <total> }`
- Uses `test:pass` / `test:fail` event durations from the `run()` API (already in-process)
- Artifact retention: 14 days (default)
- Zero new workflows, zero PATs, zero committed files
- ~10 lines of code in `run-node-tests.mjs`

### R3: Imbalance tripwire

Warn when shard distribution drifts too far.

**Acceptance criteria:**
- In the `ci-gate` job, if `max_shard_duration / min_shard_duration > 2.5`, print a warning annotation
- Uses GitHub Actions `::warning::` syntax
- Does NOT fail the build — purely informational
- Reads shard durations from the timing artifacts or job step durations
- ~5-10 lines in the gate job

### R4: Future-proofing (new tests auto-balanced)

**Acceptance criteria:**
- Adding a new test file requires zero manual intervention for shard assignment
- The new file's path is hashed with the same seed and falls into a deterministic shard
- Balance degrades gracefully (linearly, not catastrophically) as files are added
- When the tripwire fires repeatedly, the fix is "split the heavy file" or "bump shard count" — not "regenerate a manifest"

### R5: Split any file >90s (if present)

**Acceptance criteria:**
- After deploying the shuffle, measure per-file durations from the timing artifact
- If any single file exceeds 90s, split it (same pattern as Round 2 — zero regression)
- This caps the theoretical maximum per-shard wall-clock
- May or may not be needed depending on shuffle effectiveness

---

## Non-functional Requirements

- **Budget:** unchanged (6 shards, ~1,650 min/month)
- **Wall-clock target:** < 3m (down from 4m12s)
- **Maintenance:** zero ongoing — no bots, no manifests, no scheduled regeneration
- **Complexity:** ~30-50 lines of code total across all changes

---

## Verification Plan

1. Deploy seeded shuffle to `ci.yml`
2. Push a code PR and measure all 6 shard wall-clocks
3. Confirm max/min ratio < 2.5 (balanced)
4. Confirm wall-clock < 3m
5. Verify timing artifact is uploaded
6. Add a new test file and confirm it auto-assigns to a shard
7. Confirm tripwire does NOT fire on balanced run

---

## Prior Art

- Round 2 proved that splitting heavy files works but creates maintenance debt (broken references)
- A/B test showed modulo clustering is the primary cause of imbalance (not inherent file weight)
- Engineer proved size ≠ execution time in this codebase (large files can be fast, small files can be slow)
- The seeded shuffle pattern is used by Jest, Vitest, and Playwright for shard distribution
