---
title: "feat: R6 Production Algorithm Performance Optimisation"
type: feat
status: active
date: 2026-05-05
origin: docs/contracts/ci-shard-balance.md
---

# R6 Production Algorithm Performance Optimisation

## Overview

Optimise `buildGrammarPracticeQueue` and `buildGrammarMiniPack` in `worker/src/subjects/grammar/selection.js` to reduce the heaviest CI shard from 268s to <180s. The optimisation uses per-invocation memoisation of `candidateVariantMetadata` and elimination of redundant per-lane `recentTemplateIndex`/`recentConceptIndex` rebuilds. Output must remain bit-identical.

---

## Problem Frame

The CI wall-clock bottleneck is `buildGrammarPracticeQueue`, called ~175x across simulation test files. Each call generates questions for every generative template (~51) multiple times per pick iteration to compute variant freshness. ~35,000 redundant `createGrammarQuestion` invocations produce a ~245s irreducible floor — above the 180s target.

---

## Requirements Trace

- R6.I1 — Output byte-identical for all inputs
- R6.I2 — Selection policy unchanged (lane order, weights, caps)
- R6.I3 — `createGrammarQuestion` purity preserved; memo depends on this
- R6.I4 — rng() call order unchanged
- R6.I5 — No existing test modified
- R6.AC1 — Parity harness committed first (PR N before PR N+1)
- R6.AC2 — Two-tier sweep: >=200 PR gate + >=2,000 pre-merge
- R6.AC3 — rng-order verification
- R6.AC4 — Perf tripwire test with pinned ceiling
- R6.AC5 — createGrammarQuestion call-count ceiling (>=5x reduction)
- R6.AC6 — Audit byte-identical (strict: not "structurally equivalent")
- R6.AC7 — Wall-clock <180s AND >=30% improvement (median of 3 CI runs)
- R6.AC8 — R3 tripwire still passes (max/min < 2.5)
- R6.AC9 — Pre-push hook preserved; local test time reduced
- R6.AC10 — Diff scoped to selection.js only
- R6.AC11 — Memo scope documented
- R6.AC12 — Benchmark script in-tree

---

## Scope Boundaries

- Only `worker/src/subjects/grammar/selection.js` is modified for optimisation
- Changes to `content.js`, `certification-status.js` PROHIBITED
- No runtime feature flags, no shadow-compute
- No incremental index maintenance across iterations
- No shard count change, no timeout change (stays 7 min per `feedback_ci_shard_timeout_headroom.md`)
- Punctuation/spelling selection untouched
- R6 targets wall-clock latency for developer velocity. Billable Actions minutes are a function of shard count (unchanged at 6) and per-shard setup overhead (~40s); R6 does not aim to reduce GitHub Actions billing.

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/subjects/grammar/selection.js` — 775 lines
- `candidateVariantMetadata(template, seed)` at L147-156 — pure; calls `createGrammarQuestion` for generative templates
- `recentTemplateIndex(recentAttempts)` at L103-119 — rebuilds Map from scratch
- `recentConceptIndex(recentAttempts)` at L121-140 — rebuilds Map from scratch
- `pickTemplate` at L357 — already accepts `recentTemplates` and `recentConcepts` as params; does NOT rebuild internally
- `workingRecentVariants` already maintained incrementally via `addPlannedGeneratedVariant` at L234-244
- **Caller-side rebuild sites in `buildGrammarPracticeQueue`:**
  - similar-problem lane: L582-584 (rebuilds both)
  - spaced-retrieval lane: L613-615 (rebuilds both)
  - priority-urgent lane: L633-635 (rebuilds both; `recentConcepts` also consumed by `urgentTemplatePool` at L638)
  - fallback while loop: L663-665 (rebuilds both, runs once per remaining slot)
  - retry lane: L550-561 — does NOT rebuild (uses only `recentLastScoredMiss` + `workingRecentVariants`)
  - focus-saturation lane: L524-545 — does NOT rebuild
- **Caller-side rebuild site in `buildGrammarMiniPack`:**
  - pack while loop: L746-747 (rebuilds both per iteration)
- Module-scoped helpers (`pickTemplate`, `weightFor`, `hasRecentGeneratedVariant`, `variantFreshTemplates`, `variantFreshPoolWithBroadFallback`, `candidateVariantMetadata`, `addPlannedGeneratedVariant`, `recentAttemptForQueueTemplate`) — all declared at module scope, not inside entry functions
- `tests/helpers/grammar-simulation.js` — CANONICAL_SEEDS = [1, 7, 13, 42, 100, 2025, 31415, 65535], SIM_NOW_MS = 1_777_000_000_000
- `scripts/audit-grammar-qg-p19-smart-practice.mjs` — 11 profiles x 30 seeds = 330 queue builds

### Institutional Learnings

- `project_ci_speed_optimisation.md` — 3 rounds exhausted infrastructure levers
- `project_pickbyseed_prng_pattern.md` — subtle clustering bugs in seeded selection; reason I4 is critical
- `feedback_ci_shard_timeout_headroom.md` — 2x headroom; timeout stays 7 min

---

## Key Technical Decisions

- **Eliminate redundant caller-side rebuilds:** The 4 rebuild sites in `buildGrammarPracticeQueue` (similar-problem, spaced-retrieval, priority-urgent, fallback) and 1 in `buildGrammarMiniPack` compute fresh `recentTemplateIndex`/`recentConceptIndex` on every lane entry or loop iteration. Since `workingRecent` only grows by one entry per `pushQueueEntry`, rebuilding 4x per iteration is wasteful. Fix: rebuild once per iteration, reuse across all lanes within that iteration.
- **`pickTemplate` already receives indices as params:** No signature change needed. The fix is at the caller level only.
- **Memo key exact:** `${template.id}:${candidateSeed >>> 0}` for generative; `template.id` alone for non-generative (seed irrelevant per L150 short-circuit).
- **Memo per-invocation:** Fresh `Map` inside each entry function. Module-scoped caches PROHIBITED.
- **Memo plumbing strategy:** Since `candidateVariantMetadata`, `hasRecentGeneratedVariant`, `weightFor`, etc. are module-scoped, the memo `Map` must be threaded via parameter addition to these helpers OR the memoised wrapper must be a closure variable captured in a locally-scoped wrapper passed down. The implementer chooses; either approach is acceptable provided I1-I4 hold.
- **Rollback = git revert:** No feature flags. Parity harness remains as permanent regression gate.

### Correctness Theorem (narrowed)

R6 prohibits incremental index maintenance. Indices are rebuilt from scratch per iteration. Under this constraint, `workingRecent` is the sole state persisting across iterations; therefore queue-equivalence + rng-order consumption-equivalence is sufficient to prove behavioural equivalence at every `pickTemplate` call site. **If a future amendment introduces incremental maintenance, intermediate Map snapshot verification MUST be reintroduced as an acceptance gate.**

---

## High-Level Technical Design

> *Directional guidance for review, not implementation specification.*

```
buildGrammarPracticeQueue(inputs):
  const variantMemo = new Map()
  // Per-invocation. Key: "id:seed>>>0" (generative) or "id" (non-generative).
  // Depends on I3 (createGrammarQuestion purity). If I3 is ever violated, remove memo.

  const rng = seededRandom(seed)
  const workingRecent = [...recentAttempts]
  const workingRecentVariants = recentVariantIndex(recentAttempts)

  // Focus-saturation lane: no rebuild needed (doesn't use indices)
  // Retry lane: no rebuild needed (uses recentLastScoredMiss only)

  // Similar-problem lane:
  recentTemplates = recentTemplateIndex(workingRecent)  // rebuild once
  recentConcepts = recentConceptIndex(workingRecent)    // rebuild once
  pickTemplate({ ..., recentTemplates, recentConcepts })  // pass pre-built

  // Spaced-retrieval lane: same pattern — rebuild once at lane entry
  // Priority-urgent lane: same — urgentTemplatePool also consumes recentConcepts

  // Fallback while loop:
  while (queue.length < safeSize):
    recentTemplates = recentTemplateIndex(workingRecent)  // rebuilt per iteration
    recentConcepts = recentConceptIndex(workingRecent)    // rebuilt per iteration
    pickTemplate({ ..., recentTemplates, recentConcepts })
    pushQueueEntry(...)
    // workingRecent grows by 1 → next iteration rebuilds fresh

  // All candidateVariantMetadata calls use variantMemo for dedup
```

---

## Implementation Units

- U1. **Parity harness + baseline capture (PR N)**

**Goal:** Establish regression gates and capture pre-optimisation baselines. Lands on main BEFORE optimisation PR.

**Requirements:** R6.AC1, R6.AC2, R6.AC3, R6.I4, R6.I5, R6.AC6 (baseline)

**Dependencies:** None

**Files:**
- Create: `tests/grammar-selection-parity.test.js`
- Create: `tests/fixtures/grammar-selection-parity-snapshot.json` (generated on first run)
- Create: `tests/fixtures/grammar-r6-baseline.json` (pre-R6 benchmark: call counts, p95 timing)
- Create: `tests/fixtures/grammar-p19-audit-baseline.txt` (audit script stdout snapshot)
- Read (no modify): `worker/src/subjects/grammar/selection.js`
- Read (no modify): `tests/helpers/grammar-simulation.js`

**Approach:**
- **Parity sweep test:** imports `buildGrammarPracticeQueue` and `buildGrammarMiniPack`; generates 8 CANONICAL_SEEDS x 4 modes (smart, satsset, surgery, builder) x 3 mastery shapes (empty, one-weak-concept, secured-overdue) x 2 recent-attempt sizes ([], 40-entry) x 2 size variants (1, 5) = 384 cases (exceeds 200 minimum). For each: capture queue JSON + rng call sequence via instrumented wrapper around `seededRandom`. Assert byte-identical to committed snapshot.
- **Full sweep mode:** `GRAMMAR_PARITY_FULL_SWEEP=1` env var expands to 2,000+ cases (adds 18 focus concepts x 3 sizes).
- **rng wrapper:** proxy around `seededRandom` that pushes each return value to an array; compared element-for-element post-run.
- **Baseline capture:** measure `createGrammarQuestion` invocation count per queue build (instrument via counter wrapper), record p95 wall-clock for canonical config (seed=1, smart, empty mastery, 40 recent, size=10, 90 iterations after 10 warm-up). Write to `tests/fixtures/grammar-r6-baseline.json`.
- **Audit baseline:** run `scripts/audit-grammar-qg-p19-smart-practice.mjs`, capture stdout, write to `tests/fixtures/grammar-p19-audit-baseline.txt`.
- **Ordering enforcement:** U2's parity test `require`s the snapshot file — if it's absent (U1 not merged), the test fails at import time. Hard constraint, not process guideline.

**Patterns to follow:**
- `tests/helpers/grammar-simulation.js` for CANONICAL_SEEDS and SIM_NOW_MS
- `tests/grammar-learning-integrity-a1-1.test.js` for seed-sweep pattern

**Test scenarios:**
- Happy path: all 384 cases produce byte-identical output on re-run
- Happy path: rng call sequence arrays match element-for-element
- Edge case: secured-overdue mastery triggers spaced-retrieval lane
- Edge case: 40-entry recentAttempts with recent miss triggers retry + similar-problem
- Edge case: focus concept exercises focus-saturation lane
- Integration: `buildGrammarMiniPack` covered with same sweep
- Baseline: call-count numbers captured and committed

**Verification:**
- Test passes green on current `main` (no code changes to selection.js)
- Snapshot + baseline files committed
- Full sweep (2,000+ cases) green via env var
- Audit baseline captured

---

- U2. **Optimisation: memoisation + rebuild elimination (PR N+1)**

**Goal:** Apply per-invocation memo of `candidateVariantMetadata` and eliminate redundant per-lane index rebuilds in both functions. All parity gates must remain green.

**Requirements:** R6.I1-I5, R6.AC7, R6.AC8, R6.AC9, R6.AC10, R6.AC11

**Dependencies:** U1 (snapshot file required at import time)

**Files:**
- Modify: `worker/src/subjects/grammar/selection.js`

**Approach:**

*Memoisation:*
- Declare `const variantMemo = new Map();` inside `buildGrammarPracticeQueue` and `buildGrammarMiniPack`.
- Comment at declaration: `// Per-invocation memo. Key: "templateId:seed>>>0" (generative) or "templateId" (non-generative). Depends on I3 (createGrammarQuestion purity); remove if I3 violated. See R6 contract.`
- Create memoised access (closure or param-threaded helper — implementer's choice) that wraps `candidateVariantMetadata`:
  - Non-generative: key = `template.id`, return cached or compute+store
  - Generative: key = `` `${template.id}:${candidateSeed >>> 0}` ``, return cached or compute+store
- Replace ALL call sites where `candidateVariantMetadata` is invoked within both entry functions with memoised access:
  - `hasRecentGeneratedVariant` → `candidateVariantMetadata` at L249
  - `weightFor` → `candidateVariantMetadata` at L311
  - `addPlannedGeneratedVariant` → `candidateVariantMetadata` at L235
  - `recentAttemptForQueueTemplate` → `candidateVariantMetadata` at L428-429
  - `variantFreshTemplates` / `variantFreshPoolWithBroadFallback` filters

*Rebuild elimination in `buildGrammarPracticeQueue`:*
- The 4 caller-side rebuild sites each call `recentTemplateIndex(workingRecent)` and `recentConceptIndex(workingRecent)` then pass results to `pickTemplate`. Since `pickTemplate` already accepts these as params (L357 — no signature change needed), the fix is purely at the caller:
  - similar-problem lane (L582-584): rebuild once at lane entry
  - spaced-retrieval lane (L613-615): rebuild once at lane entry
  - priority-urgent lane (L633-635): rebuild once; also pass `recentConcepts` to `urgentTemplatePool` at L638
  - fallback while loop (L663-665): rebuild once per iteration (workingRecent grew by 1)
- Key insight: within a SINGLE iteration (lanes fire sequentially), after each `pushQueueEntry` workingRecent grows by 1 — so if priority-urgent fires and adds an entry, the NEXT lane/loop iteration must rebuild. But lanes within the same "slot" share indices.
- For `size=5` queue: the main while loop runs ~5 iterations. Special lanes fire at most once each before the while loop takes over. So the real optimisation is: rebuild once per slot (not once per lane attempt within a slot).

*Rebuild elimination in `buildGrammarMiniPack`:*
- L746-747: rebuilds per pack iteration. Same pattern — rebuild once at loop top.

*Plumbing note:* `candidateVariantMetadata`, `hasRecentGeneratedVariant`, `weightFor`, `variantFreshTemplates`, `variantFreshPoolWithBroadFallback`, `addPlannedGeneratedVariant`, `recentAttemptForQueueTemplate` are all module-scoped. The memo must reach them via one of:
  - (a) Add `variantMemo` param to each helper's signature (~7 functions)
  - (b) Create locally-scoped closures inside entry functions that capture the memo
  - Either is acceptable; (a) is more explicit, (b) produces smaller diff. Implementer decides.

**Patterns to follow:**
- `addPlannedGeneratedVariant` L234-244 — existing incremental update on `workingRecentVariants`
- Current caller pattern at L582-595 — rebuild-then-pass is the target shape

**Test scenarios:**
- Happy path: U1 parity harness passes byte-identical (I1)
- Happy path: rng-order arrays match (I4)
- Happy path: all existing 600+ grammar tests pass unchanged (I5)
- Edge case: non-generative templates use `template.id`-only key
- Edge case: same (templateId, candidateSeed) from multiple sites returns cached value
- Edge case: memo fresh per invocation — sequential calls don't contaminate
- Integration: `buildGrammarMiniPack` also memoised and passes parity

**Verification:**
- U1 parity test green (PR gate: 384 cases)
- Full sweep green (2,000+ cases via env var)
- All existing grammar tests pass unchanged
- Audit byte-identical: `node scripts/audit-grammar-qg-p19-smart-practice.mjs` stdout === `tests/fixtures/grammar-p19-audit-baseline.txt`
- Pre-push hook functions and is measurably faster (AC9)
- R3 tripwire does not fire (AC8): max/min < 2.5 on post-R6 CI runs
- PR description includes enumerated test-file list from `grep -l "buildGrammarPracticeQueue\|buildGrammarMiniPack" tests/*.js` (contract Verification Plan step 16)

---

- U3. **Perf tripwire + benchmark + kill-switch gate**

**Goal:** Add durable regression gates, benchmark script, and autonomous kill-switch mechanism. Prove speedup delivered.

**Requirements:** R6.AC4, R6.AC5, R6.AC6, R6.AC7, R6.AC12

**Dependencies:** U2

**Files:**
- Create: `tests/grammar-selection-perf-tripwire.test.js`
- Create: `tests/grammar-p19-audit-parity.test.js`
- Create: `scripts/bench-grammar-selection.mjs`

**Approach:**

*Perf tripwire test:*
- Calls `buildGrammarPracticeQueue` 100x with fixed config: seed=1, mode='smart', empty mastery, 40 recentAttempts, size=10
- Discards first 10 warm-up iterations
- Measures p95 wall-clock of remaining 90
- Asserts `< CEILING_MS` (measured post-opt value x 2 headroom)
- Header comment: measurement date, Node version (`process.version`), measured value, headroom reasoning
- Instruments `createGrammarQuestion` call count per invocation; asserts <= `MAX_CQ_CALLS` (post-memo count + 10% headroom, must be >=5x less than baseline from `tests/fixtures/grammar-r6-baseline.json`)
- Scale-horizon: `if (GRAMMAR_TEMPLATE_METADATA.length > 80) console.warn('Template count exceeds 80 — reassess R6 per docs/contracts/ci-shard-balance.md Scale Horizon');`

*Audit parity test (`tests/grammar-p19-audit-parity.test.js`):*
- Runs `scripts/audit-grammar-qg-p19-smart-practice.mjs` programmatically (import its exported function or spawn child process)
- Captures stdout
- Asserts `=== readFileSync('tests/fixtures/grammar-p19-audit-baseline.txt', 'utf8')` (strict byte-identical, no "structurally equivalent")

*Benchmark script (`scripts/bench-grammar-selection.mjs`):*
- Standalone CLI: `node scripts/bench-grammar-selection.mjs`
- 100 iterations canonical config, discards first 10 warm-up
- Reports: p50, p95, max wall-clock; createGrammarQuestion call count; Node version; template count
- Outputs markdown table for PR description
- Reads baseline from `tests/fixtures/grammar-r6-baseline.json`, computes % improvement, prints verdict

*Kill-switch gate:*
- Benchmark script exits non-zero if improvement < 30% vs baseline. This runs in U2's PR CI (or U3's merge-prerequisite) as the autonomous kill-switch: if the optimization doesn't deliver, CI blocks merge.
- Post-merge: the perf tripwire test serves as ongoing regression gate. If a future commit degrades beyond the ceiling, CI fails.

*AC7 measurement:*
- After U2 merges, trigger 3 CI runs via `gh workflow run ci.yml` on main
- Extract heaviest-shard wall-clock from shard timing artifacts (`shard-*-timings.json`)
- Compute median; record in PR description
- If median >= 180s or improvement < 30%, open revert PR automatically

**Patterns to follow:**
- `scripts/audit-grammar-qg-p19-smart-practice.mjs` for CLI structure
- `tests/grammar-learning-integrity-a1-1.test.js` for assertion patterns

**Test scenarios:**
- Happy path: tripwire passes under ceiling
- Happy path: call-count ceiling passes (>=5x reduction)
- Happy path: audit parity test passes byte-identical
- Happy path: benchmark reports >=30% improvement
- Edge case: scale-horizon warning fires at template count >80
- Error path: benchmark exits non-zero when improvement <30%

**Verification:**
- Tripwire test green in CI
- Call-count ceiling green
- Audit parity green
- Benchmark script produces output table
- CI heaviest shard <180s (median of 3 runs)
- Improvement >=30% vs baseline
- R3 tripwire does not fire (AC8)
- Pre-push hook still functions locally (AC9)

---

## System-Wide Impact

- **Interaction graph:** `candidateVariantMetadata` is called only within `buildGrammarPracticeQueue` and `buildGrammarMiniPack`. Memoisation scoped to these two entry points.
- **Error propagation:** No new error paths. Memo bounded by ~510 entries per invocation.
- **State lifecycle risks:** None — memo is local `const`, GC'd on function return.
- **API surface parity:** Both function signatures unchanged.
- **Integration coverage:** Parity harness (U1) covers all modes, lanes, mastery/seed combos.
- **Unchanged invariants:** Lane triggering order, `SELECTION_WEIGHTS`, `KNOWN_REASONS`, `ALLOWED_DUPLICATE_REASONS`, P19 audit allow-lists.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Memo key collision | Key includes templateId AND seed; non-generative short-circuits. Parity harness proves no collision across 2,000+ cases. |
| rng() consumption order drift | I4 enforced by instrumented wrapper. Any drift fails CI immediately. |
| Module-scope memo in future | One-line comment + contract clause. Code review catches. |
| Optimization delivers <30% | Kill-switch: benchmark exits non-zero; CI blocks merge. Revert if landed. |
| Memo plumbing increases diff size | 7 function signatures gain a param OR closure pattern used. Both feasible; implementer chooses minimal-diff approach. |
| I3 violated in future (createGrammarQuestion becomes non-pure) | Comment at memo site documents dependency. Memo must be removed if I3 breaks. |

---

## Ordering and Session Guardrails

```
U1 (parity harness + baselines) — PR N on main
  |
  v
U2 (optimisation) — PR N+1, branched from post-U1 main
  |
  v
U3 (tripwire + benchmark + kill-switch) — PR N+2
```

**Ordering enforcement:** U2's parity test imports the snapshot fixture from U1. If absent, test fails at load time. U2 MUST NOT be combined with U1 in the same PR. U2 MUST branch from post-U1 `main`.

U3 depends on U2 being merged (measures optimised code). U3 could optionally be combined with U2 if the reviewer set accepts the larger diff.
