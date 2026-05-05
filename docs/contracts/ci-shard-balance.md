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

---

# Amendment 1: Production Algorithm Performance Optimisation

**Date:** 2026-05-05
**Owner:** James To
**Trigger:** Infrastructure levers (R1-R5) shipped. Heaviest shard 268s vs <180s target. Remaining gap is production algorithm cost in `buildGrammarPracticeQueue` / `buildGrammarMiniPack`, not shard topology.
**Council:** Engineer + Architect + Ops reviewed; all three APPROVED v2 on 2026-05-05.

---

## Why this amendment exists

R1-R5 assumed shard redistribution alone could reach <3 min wall-clock. After 10+ iterations (seeded shuffle, file splits, session reduction 80→25, disk caching, seed tuning) the remaining floor is production algorithm cost:

- `buildGrammarPracticeQueue` is invoked ~175× across the simulation suite
- Each invocation calls `candidateVariantMetadata()` / `createGrammarQuestion()` for every generative template (~51) via the four pick-lane rebuilds at selection.js:583-584, 614-615, 634-635, 664-665
- ~35,000 question generations × ~7ms = ~245s minimum floor

No shard redistribution can reduce that floor. This amendment authorises a strictly-scoped, bit-identical refactor gated by a parity harness and a perf tripwire.

---

## R6: Production algorithm performance optimisation

Optimise `buildGrammarPracticeQueue` and `buildGrammarMiniPack` in `worker/src/subjects/grammar/selection.js` via **per-iteration rebuild hoisting** and **per-invocation memoisation of `candidateVariantMetadata`**, so that the heaviest shard clears the wall-clock target with bit-identical output.

### What MAY change (performance profile only)

**Memoisation of `candidateVariantMetadata()`:**
- Cache key (generative templates): `` `${template.id}:${candidateSeed >>> 0}` ``
- Cache key (non-generative templates): `template.id` alone (early short-circuit; no seed component)
- **No other inputs are permitted in the key.** Any additional key component is a contract violation.
- Cache value shape: `{ generatorFamilyId, variantSignature }` — no whole question objects.
- Cache lifetime: per-invocation only. A fresh `const memo = new Map();` declared at the top of each of `buildGrammarPracticeQueue` and `buildGrammarMiniPack`. **Module-scoped caches are PROHIBITED.**
- One-line comment at each cache site documents its lifetime and key format.
- `candidateVariantMetadata` retains its original function signature; if a memoised wrapper is introduced, it uses a new symbol name.

**Per-iteration rebuild hoist (O2 approach):**
- Within a single iteration, `recentTemplateIndex(workingRecent)` and `recentConceptIndex(workingRecent)` are built **once at the top of the iteration** and passed into all lanes for that iteration.
- **`pickTemplate` MUST NOT rebuild these indices.** Any call to `recentTemplateIndex` or `recentConceptIndex` nested inside `pickTemplate` or `weightFor` is a CONTRACT VIOLATION.
- All four existing rebuild sites — **selection.js:583-584, 614-615, 634-635, 664-665** — must be migrated to consume the shared per-iteration value.
- **Incremental maintenance across iterations is EXPLICITLY OUT OF SCOPE** — `slice(-40)` eviction makes it too fragile. Indices are rebuilt from scratch at each iteration's start.

**Micro-optimisations** (object reuse, avoiding array rebuilds, single-pass iteration) are permitted provided every invariant below holds.

### What MUST NOT change (hard invariants)

- **I1 — Output byte-identical.** `buildGrammarPracticeQueue(inputs)` and `buildGrammarMiniPack(inputs)` return the byte-identical ordered queue before and after R6 for every fixture case.
- **I2 — Selection policy unchanged.** Lane order (focus-saturation → retry → similar-problem → spaced-retrieval → priority-urgent → fallback), concept caps, template caps, variant freshness, tie-breaking, `SELECTION_WEIGHTS` constants, and the P19 audit allow-list all stay bit-for-bit as today.
- **I3 — `createGrammarQuestion` purity preserved.** Observable output for any `(templateId, seed)` pair is unchanged. If it is ever made non-pure in future, the memoisation must be removed (documented in a one-line comment at the cache site).
- **I4 — rng() call order unchanged.** The count and order of `rng()` invocations must be identical before and after R6. Verified by an instrumented rng wrapper that records call sequences; pre- and post-R6 arrays must match element-for-element for every harness case.
- **I5 — No existing test modified.** Every existing test file, assertion, fixture, snapshot, and coverage report stays bit-identical. Only net-new tests (parity harness, perf tripwire, call-count ceiling) may be added.

**Correctness theorem (narrowed):** R6 prohibits incremental index maintenance. Indices are rebuilt from scratch per iteration. Under this constraint, `workingRecent` is the sole state persisting across iterations; therefore queue-equivalence + rng-order consumption-equivalence is sufficient to prove behavioural equivalence at every `pickTemplate` call site. If a future amendment introduces incremental maintenance, intermediate Map snapshot verification MUST be reintroduced as an acceptance gate.

### Acceptance criteria

1. **Parity harness committed first.** The queue-equivalence harness lands as **PR N (harness only)** before the optimisation PR. The optimisation lands as **PR N+1**. The harness stays as a permanent regression test.
2. **Two-tier queue-equivalence sweep:**
   - **PR gate (runs on every PR in CI):** ≥200 cases = 8 seeds × 4 modes × 3 mastery shapes × 2 recent-attempt sizes. Byte-identical required.
   - **Pre-merge sweep:** full product ≥2,000 cases across all dimensions. Runs once on PR N+1 before merge.
3. **rng-order verification (I4).** Instrumented wrapper produces matching call sequences on every parity-harness case.
4. **Perf tripwire test.** `tests/grammar-selection-perf-tripwire.test.js` calls `buildGrammarPracticeQueue` N times with a fixed config, warm-up iterations (first 10) discarded, and asserts wall-clock < a pinned ceiling. Header comment records: measurement date, hardware (runner label), Node version, measured number, and headroom reasoning. Runs on every PR.
5. **`createGrammarQuestion` call-count ceiling.** Instrumented test pins maximum invocations per queue build. Post-R6 ceiling reflects memoised regime (≥2× reduction vs pre-R6 count; measured 3.0× — the per-invocation cache lifetime means `candidateSeed` varies per iteration, limiting deduplication to within-iteration pairs only; ≥5× would require module-scoped caching which is PROHIBITED). Regression raises CI failure.
6. **Audit byte-identical.** `scripts/audit-grammar-qg-p19-smart-practice.mjs` produces byte-identical output pre- and post-R6.
7. **Wall-clock AND improvement floor.** Heaviest shard < **180s** on `main` CI post-R6 (median of 3 consecutive runs) **AND** ≥30% improvement vs pre-R6 baseline. Both conditions must hold — if improvement is <30% the refactor complexity is not justified; R6 is reverted.
8. **R3 tripwire still passes:** `max_shard / min_shard < 2.5` preserved or improved.
9. **Pre-push hook preserved.** Local speedup applies without modification to hook config.
10. **Diff scope to selection.js only.** The optimisation PR touches **only** `worker/src/subjects/grammar/selection.js`. Changes to `content.js`, `certification-status.js`, or any other file are **PROHIBITED** — if a helper needs changing, it is a separate amendment.
11. **Memo scope documented.** One-line comment at each `const memo = new Map();` states lifetime (per-invocation) and key format.
12. **Benchmark script in-tree.** A reusable benchmark at `scripts/bench-grammar-selection.mjs` kept in-tree. Output includes Node version. No throwaway one-off scripts.

### Scale horizon

Optimisation is designed for **≤1,000 templates and ≤40 recent attempts** (the `normaliseRecentAttempts` ceiling). CI warning fires when template count exceeds **80** pointing to reassessment. Template count beyond **500** triggers a fresh perf audit. Memo is bounded by `templates × sizeRequested` entries per invocation — safe to 500+ templates without re-optimisation.

### Rollback

**Git revert of PR N+1 is the only rollback mechanism.** No runtime feature flags, no shadow-compute, no dual-path execution. The parity harness (PR N) remains even after revert, ensuring any re-attempt runs against the same test bar.

### Billing note

R6 targets wall-clock latency for developer velocity. Billable Actions minutes are a function of shard count (unchanged at 6) and per-shard setup overhead (~40s, outside R6 scope); R6 does not aim to reduce GitHub Actions billing.

### Explicit non-goals

- Not a rewrite. Structural reorganisation only where required to hoist or memoise.
- Not incremental-maintenance of `recentTemplateIndex` / `recentConceptIndex` across iterations.
- Not a change to punctuation or spelling selection — separate contracts.
- Not a shard-count change; 6 shards, timeout 7 min, billing unchanged.
- Not a runtime feature flag or shadow-compute path.

---

## Updated wall-clock mechanism

The original `Wall-clock target: < 3m` is retained; achievement depends on R6 rather than R1-R5 alone. R1-R5 establish balance; R6 establishes per-shard floor.

- Floor after R1-R5 only: ~245s (proven).
- Floor after R6: target <180s. If R6 cannot reach <180s within the invariants, the engineer raises it in verification; R6 does not ship at the cost of any invariant.

---

## Verification Plan (R6 addendum)

8. Capture parity fixture set from `main` pre-R6 (PR N) — ≥200 PR-tier cases + ≥2,000 full-sweep cases, plus rng-order snapshots.
9. Merge PR N (harness only) before PR N+1 (optimisation). PR N+1 CI runs PR-tier parity sweep + rng-order verification on every push; must pass byte-identical.
10. Run full sweep once on PR N+1 before merge; record result in PR description.
11. Measure heaviest-shard wall-clock on `main` post-R6, median of 3 runs; must be <180s AND ≥30% improvement vs pre-R6 baseline.
12. Re-confirm R3 tripwire does not fire.
13. Confirm `scripts/audit-grammar-qg-p19-smart-practice.mjs` output is byte-identical.
14. Confirm `createGrammarQuestion` call-count ceiling test passes (≥5× reduction).
15. Verify pre-push hook still functions and is faster locally.
16. PR description includes: enumerated test-file list (via `grep -l "buildGrammarPracticeQueue\|buildGrammarMiniPack" tests/*.js`), Node version, benchmark results table.

---

## Prior Art addendum

- Round 10+ CI optimisation exhausted infrastructure levers — see `project_ci_speed_optimisation.md`.
- Memoisation of pure selection helpers has precedent in `pickBySeed`-style utilities; extended here to `candidateVariantMetadata`.
- Two-tier parity gating (PR vs full-sweep) mirrors the CERTIFIED_PRE_DEPLOY pattern from Grammar/Punctuation QG sprints.
- Pilot-reversal pattern applies if R6 extends to other subjects in future — grammar's refined approach becomes canonical, but that work is a separate contract.
