---
title: "P3 — Stability, Capacity Evidence, and Multi-Learner Correctness"
type: feat
status: completed
completed: 2026-04-27
date: 2026-04-27
origin: docs/plans/james/sys-hardening/sys-hardening-p3.md
deepened: 2026-04-27
---

# P3 — Stability, Capacity Evidence, and Multi-Learner Correctness

## Overview

Converge the capacity and sys-hardening streams into a single release-quality phase. The goal is NOT "another optimisation round" — it is: **any optimisation must not sacrifice correctness; any hardening must support scalability; any capacity claim must have dated evidence.**

The phase locks the multi-learner bootstrap contract with a 4-learner regression matrix, produces the first dated capacity evidence rows, enforces hot-path query budgets, closes Phase 2 residual items (U5.5 full command loop, U9.1 breaker follow-ups), and splits the 9163-line `repository.js` behind locked tests.

---

## Problem Frame

KS2 Mastery supports multi-learner accounts (one Google login → up to 4 children with owner/member/viewer roles). Phase 2 built the capacity tooling: bounded bootstrap, `notModified` short-circuit, projection hot-path, circuit breakers, telemetry, and evidence infrastructure. But three critical gaps remain:

1. **The multi-learner bootstrap contract is not regression-locked.** PR #316 proved that capacity optimisation can silently break sibling learner stats (bounding per-learner SELECT to selected learner broke `child_subject_state` for siblings). No 4-learner fixture exists; `child_game_state` has zero test coverage; viewer-role learners have zero test coverage.

2. **Capacity claims have no dated evidence.** `docs/operations/capacity.md` evidence table is "pending first run." The tools exist; the proof does not.

3. **Phase 2 residuals accumulate risk.** U5.5 (full command loop), U9.1 (10 breaker follow-ups), CSP/HSTS hardening residuals, and `repository.js` size pressure each carry individually small risk that compounds.

(see origin: `docs/plans/james/sys-hardening/sys-hardening-p3.md`)

---

## Requirements Trace

- R1. 4-learner account bootstrap regression matrix locked in tests — 3 writable + 1 viewer fixture, covering `child_subject_state`, `child_game_state`, `preferredLearnerId`, `notModified` invalidation on sibling write, viewer exclusion
- R2. First dated capacity evidence row in `docs/operations/capacity.md` evidence table — 10-learner smoke, then 30-learner beta gate with committed JSON
- R3. D1 hot-path query budgets enforced as tests/gates for `/api/bootstrap`, subject command, and parent/classroom summary
- R4. Full dense-history command loop coverage — Spelling advance + submit + end-session; Grammar/Punctuation stale-409 retry; Parent Hub pagination smoke
- R5. U9.1 circuit breaker follow-ups — `breakerTransition` overemission fix, sticky breaker operator reset via bootstrap response signalling, `derivedWrite` client/server parity, priority-order write-never-masked-as-synced invariant
- R6. `worker/src/repository.js` split into focused modules behind locked multi-learner + capacity tests — pure code movement, zero behaviour change
- R7. CSP/HSTS/style hardening residuals — CSP enforcement decision gate, HSTS preload operator audit, `React.lazy` chunk-load inner retry
- R8. Zero regression — `npm test` green, `npm run audit:client` green, `npm run verify` green at every PR boundary

---

## Scope Boundaries

- NOT re-litigating bootstrap architecture, `notModified` protocol, or circuit breaker state machine
- NOT adding new capacity tiers beyond 30-learner beta certification (60/100+ are measurement exercises on the existing tooling)
- NOT implementing CI-signed provenance for evidence (documented Phase 2 residual; future hardening)
- NOT implementing Durable Object-backed coordination (tracked residual for incognito/managed-Chromebook fan-out)
- NOT touching subject runtime or spelling/grammar/punctuation business logic
- NOT adding new Worker routes — breaker reset uses bootstrap response signalling, not a standalone admin endpoint

### Deferred to Follow-Up Work

- 60-learner stretch and 100+ school certification: separate operator-led measurement exercises once 30-learner beta is certified
- CSP full inline-style migration (232 remaining `style={}` sites): multi-week effort tracked in `docs/hardening/csp-inline-style-inventory.md`
- Dark-mode visual baselines: tracked in SH2 completion report

---

## Context & Research

### Relevant Code and Patterns

- `worker/src/repository.js` (9163 lines) — all D1 access; `bootstrapBundle()` at ~line 6600; `computeBootstrapRevisionHash()` at ~line 6395; `runSubjectCommandMutation()` CAS path
- `worker/src/app.js` — route handlers, telemetry emission, subject command pipeline
- `src/platform/core/circuit-breaker.js` — 5 named client-side breakers; state machine primitive
- `worker/src/circuit-breaker-server.js` — server-side `readModelDerivedWrite` singleton
- `tests/worker-bootstrap-v2.test.js` — U1 hotfix tests (3-learner); B1 sibling invalidation (2-learner); no 4-learner, no game state, no viewer
- `tests/worker-bootstrap-capacity.test.js` — 2-learner high-history payload bounding
- `tests/store-select-learner-refetch.test.js` — client-side learner switching with in-flight/sticky/stale guards
- `tests/helpers/worker-server.js` + `tests/helpers/sqlite-d1.js` — in-process Worker with D1 test double
- `docs/operations/capacity.md` — capacity runbook, evidence table (placeholder row), threshold gates
- `docs/mutation-policy.md` — CAS + idempotency contract

### Institutional Learnings

- **Per-learner SELECT bounding must be justified per-table** — compact state rows (< 5KB) do not need bounding; only unbounded-history tables and heavyweight blobs justify the bound (bootstrap learner-stats hotfix memory)
- **D1 `batch()` is the canonical atomic write; `withTransaction` is a production no-op** — every multi-statement mutation must use `batch(db, [...])` (D1 atomicity memory)
- **Gate on direct post-conditions, not secondary signals** — proxy signals drift silently (Spelling TTS sentence-index PR 317 memory)
- **Same-PR atomicity for coupled changes** — if reverting any single file breaks the build, all files must ship together (SH2 learning)
- **Adversarial failure-scenarios-first** — 12 of 25 SH2 blockers came from adversarial reviewers (SH2 completion report)

---

## Key Technical Decisions

- **4-learner fixture shape**: 3 writable (owner + 2 member) + 1 viewer. Viewer is absent from practice-shell bootstrap (`writableOnly: true` query is correct for the practice shell). Viewer appears only through Parent Hub / Admin Hub surfaces via separate query paths. This matches current runtime behaviour and avoids changing query logic in a "tests only" PR.
- **PR #326 reconciled**: Commit `49645cc` merged to main on 2026-04-26. Circuit breaker code is on main. The P3 spec's concern about open-PR-vs-main drift is resolved — the docs reconciliation unit (originally P0 PR 2) is no longer needed.
- **Bootstrap query budget target**: Baseline first, then lock. The existing projection hot-path test already shows `queryCount <= 13` (Phase D/U14 added one query). A 4-learner fixture will add per-learner sibling state queries. U3 must measure the real baseline on the U1 fixture, THEN pin the constant — not assume 12. Subject command hot-path: 12 queries, 0 `event_log` reads (U6 established).
- **Capacity evidence progression**: 10-learner preview smoke → 30-learner beta gate. Do not jump to 60/100+ in this phase.
- **Repository split is pure code movement**: No behaviour change per step. Each step runs the full multi-learner matrix + bootstrap snapshot + capacity dry-run + access tests. `BOOTSTRAP_CAPACITY_VERSION` bump rule restated in the receiving module's header comment.
- **Sticky breaker reset is a client-side signalling problem**: `bootstrapCapacityMetadata` lives in browser memory + `localStorage`, not the Worker. A server-side admin endpoint cannot directly reset it. The existing auto-reset (line 2134 of `api.js`: `breakers.bootstrapCapacityMetadata.reset()` when metadata reappears) already fires when the server returns healthy `bootstrapCapacity`. The operator path is therefore: (1) fix the root cause (deploy a build that emits `bootstrapCapacity`), (2) client auto-resets on next bootstrap. If forced reset is needed before the next bootstrap, an admin `meta.capacity.forceBreakerReset: 'bootstrapCapacityMetadata'` field on the next bootstrap response triggers client-side `reset()`. No standalone admin endpoint needed — the signal piggybacks on the existing bootstrap response.
- **PR #326 docs reconciliation absorbed into U2**: The completion report's claim that "#326 merged" is now factually correct (commit `49645cc`). U2 updates the evidence table which is the remaining docs reconciliation task. No separate unit needed, but the mapping from origin PR #2 is stated here for traceability.

---

## Open Questions

### Resolved During Planning

- **Is PR #326 merged?** Yes — commit `49645cc`, merged 2026-04-26 21:46 UTC. Circuit breaker code confirmed on main.
- **Does `child_game_state` mutation via standard subject commands bump `state_revision`?** Yes — subject commands go through `runSubjectCommandMutation` → `withLearnerMutation` which bumps `learner_profiles.state_revision` via CAS. Only admin/dev-tool paths bypass this.
- **Should placeholder evidence row be removed when adding real evidence?** Yes — PR 3 (evidence) removes it when inserting the first dated row.
- **What happens if `preferredLearnerId` points at a viewer?** Silent fallback to alphabetical first writable learner. No error signal. Test added to U1 as a negative assertion.

### Deferred to Implementation

- **Exact module boundaries for repository split**: The proposed 6-module split is directional. Implementation may discover better seams (e.g., consolidating capacity-metadata into bootstrap-repository).
- **CSP enforcement flip timing**: Depends on 7-day observation window results. U7 decision gate inherited from SH2.
- **`attemptedLearnerFetches` clearing on breaker recovery**: Current behaviour (no clear) is acceptable. UI prompt for stale stats is a future UX polish, not a P3 blocker.

---

## Implementation Units

- U1. **Multi-learner bootstrap regression lock**

**Goal:** Lock the 4-learner bootstrap contract so future capacity optimisations cannot silently break sibling stats, game state, or viewer separation.

**Requirements:** R1, R8

**Dependencies:** None

**Files:**
- Create: `tests/worker-bootstrap-multi-learner-regression.test.js`
- Modify: `tests/helpers/worker-server.js` (if fixture helpers needed)
- Test: `tests/worker-bootstrap-multi-learner-regression.test.js`

**Approach:**
- Build a 4-learner account fixture: Learner A (owner, selected, heavy history: 5 sessions + 50 events), Learner B (member, moderate: 2 sessions + 20 events), Learner C (member, minimal: 0 sessions + 5 events), Learner D (viewer, read-only, some state seeded)
- Each learner gets distinct `child_subject_state` and `child_game_state` data so assertions can verify identity, not just presence
- Tests only — no production code changes

**Execution note:** Characterisation-first — lock current behaviour before any P3 code changes.

**Patterns to follow:**
- `tests/worker-bootstrap-v2.test.js` U1 hotfix tests (3-learner fixture shape)
- `insertLearner()` / `runSql()` seeding patterns from `tests/helpers/worker-server.js`
- `tests/worker-bootstrap-capacity.test.js` high-history fixture

**Test scenarios:**
- Happy path: POST `/api/bootstrap` with 4-learner account returns `child_subject_state` for all 3 writable learners (A, B, C) with correct per-learner data
- Happy path: POST `/api/bootstrap` returns `child_game_state` for all 3 writable learners with correct per-learner data
- Happy path: `account.learnerList` contains 2 unselected writable learners (B, C) as compact entries with `state_revision`
- Happy path: `practiceSessions` and `eventLog` contain only selected learner A's data (bounded)
- Happy path: GET `/api/bootstrap` returns same multi-learner structure as POST
- Edge case (viewer exclusion): Viewer learner D does NOT appear in `learnerList`, `learners.byId`, `subjectStates`, or `gameState`
- Edge case (`preferredLearnerId` switch): POST with `preferredLearnerId: B` returns B as selected with full first-paint data; A and C appear as compact siblings
- Edge case (`preferredLearnerId` → viewer): POST with `preferredLearnerId: D` (viewer) silently falls back to alphabetical first writable learner
- Edge case (cold-start alphabetical): No `preferredLearnerId`, no persisted selection → alphabetical first writable learner selected
- Integration (`notModified` sibling invalidation): Baseline hash H1 → sibling B subject-state write bumps `state_revision` → POST with H1 returns full bundle (not `notModified`)
- Integration (`notModified` sibling game-state invalidation): Sibling C game-state write via subject command (bumps `state_revision` via CAS) → POST with old hash returns full bundle
- Edge case (single-learner regression): 1-learner account still works identically to pre-P3
- Edge case (`bootstrapCapacity.subjectStatesBounded`): Marker is `false` for multi-learner (sibling states shipped) and `false` for single-learner

**Verification:**
- `npm test` green with zero new failures
- All multi-learner assertions verify per-learner data identity (not just count)
- Viewer learner negative assertions are falsifiable (seed viewer with data, assert absent)

---

- U2. **First dated capacity evidence**

**Goal:** Produce the first real capacity evidence rows — 10-learner preview smoke, then 30-learner beta gate — filling the evidence table with committed JSON.

**Requirements:** R2, R8

**Dependencies:** U1 (multi-learner tests locked before capacity runs)

**Files:**
- Modify: `docs/operations/capacity.md` (evidence table rows, remove placeholder)
- Create: `reports/capacity/snapshots/2026-04-27-10-learner-preview.json`
- Create: `reports/capacity/snapshots/2026-04-27-30-learner-beta.json`
- Test: `npm run verify` (cross-checks evidence rows)

**Approach:**
- Run `npm run capacity:classroom -- --local-fixture --origin http://localhost:8787 --demo-sessions --learners 10 --bootstrap-burst 10 --rounds 1 --output reports/capacity/snapshots/2026-04-27-10-learner-preview.json` first
- On pass, escalate to `npm run capacity:classroom:release-gate -- --production --origin https://ks2.eugnel.uk --confirm-production-load --confirm-high-production-load --demo-sessions --learners 30 --bootstrap-burst 20 --rounds 1`
- Replace placeholder row with real evidence rows
- Commit evidence JSON and updated `capacity.md`
- `npm run verify` must pass

**Patterns to follow:**
- Evidence recording procedure in `docs/operations/capacity.md` §Evidence To Record
- Tier config cross-check against `reports/capacity/configs/30-learner-beta.json`

**Test scenarios:**
- Happy path: 10-learner local-fixture run completes with 0 5xx, 0 signals, P95 bootstrap < 1000ms, P95 command < 750ms
- Happy path: 30-learner production release-gate run passes all thresholds
- Happy path: `npm run verify` passes with real evidence rows replacing placeholder
- Error path: If 30-learner gate fails, document the failure and defer 30-learner certification. 10-learner smoke-pass still ships.
- Edge case: Evidence JSON schema version >= 2 (U3 telemetry present)

**Verification:**
- `npm run verify` green
- Evidence table has at least one real `smoke-pass` or `30-learner-beta-certified` decision row
- Evidence JSON committed under `reports/capacity/snapshots/`

---

- U3. **Hot-path query budget enforcement**

**Goal:** Turn the observed D1 query counts from "observability" into "release gate" by writing budget-enforcement tests for the critical hot paths.

**Requirements:** R3, R8

**Dependencies:** U1 (multi-learner fixture available)

**Files:**
- Create: `tests/worker-query-budget.test.js`
- Modify: `tests/helpers/worker-server.js` (expose D1 query count from capacity collector if not already)
- Test: `tests/worker-query-budget.test.js`

**Approach:**
- Use the in-process Worker test harness with D1 capacity collector
- **Measure first, then lock.** The existing codebase shows `queryCount <= 13` for single-learner bootstrap (Phase D/U14 bump). A 4-learner fixture will add per-learner sibling state queries. Step 1: run bootstrap with the U1 4-learner fixture and record actual queryCount. Step 2: pin that measurement + 1 as the budget constant.
- Assert query budget ceilings per endpoint:
  - `/api/bootstrap` selected-learner-bounded (4-learner): `queryCount <= <measured + 1>`, `eventLogRowsRead` bounded
  - Subject command common hot path (2000-event learner): `queryCount <= 13`, `eventLogReads == 0`
  - Parent Hub summary: bounded query count (establish baseline then lock)
  - Classroom summary: bounded query count (establish baseline then lock)
- Budgets are pinned as named constants in the test file with rationale comments so regressions fail immediately and adjustments are intentional

**Patterns to follow:**
- U6 hot-path measurement pattern (completion report: "queryCount = 12, zero event_log reads")
- `meta.capacity` response surface in `docs/operations/capacity.md` § telemetry shape

**Test scenarios:**
- Happy path: `/api/bootstrap` POST (selected-learner-bounded, 4-learner fixture) stays within measured budget ceiling
- Happy path: `/api/bootstrap` POST (notModified short-circuit) uses <= 4 queries (probe + hash compare)
- Happy path: Subject command (Spelling submit-answer, 2000-event learner) stays within 13-query budget with 0 `event_log` reads
- Happy path: Parent Hub recent-sessions endpoint stays within established budget
- Edge case: Bootstrap with `full-legacy` mode (GET path) has a documented higher budget but still bounded
- Error path: Intentionally exceeding the budget (e.g., adding an unbounded query) fails the test

**Verification:**
- `npm test` green
- Budget constants documented in test file header comments
- Regressions caught before merge, not in production telemetry

---

- U4. **Dense-history full command loop**

**Goal:** Extend capacity smoke coverage from start-session to full advance + submit + end-session loops. Cover Grammar/Punctuation stale-409 retry and Parent Hub pagination.

**Requirements:** R4, R8

**Dependencies:** U3 (query budgets established)

**Files:**
- Modify: `scripts/spelling-dense-history-smoke.mjs` (extend to advance + submit + end-session)
- Create: `tests/worker-command-loop-dense.test.js`
- Test: `tests/worker-command-loop-dense.test.js`

**Approach:**
- Extend the existing spelling dense-history smoke to cover the full session lifecycle (not just start-session)
- Add Grammar and Punctuation command sequences that trigger stale-409 (seed a concurrent revision bump, then submit) and verify retry + no lost progress
- Add Parent Hub pagination smoke: seed learner with > 20 sessions, verify paginated fetch returns bounded pages
- All tests use the in-process Worker harness

**Patterns to follow:**
- `scripts/spelling-dense-history-smoke.mjs` existing start-session pattern
- `worker/src/subjects/spelling/commands.js` command dispatch
- CAS retry pattern in `runSubjectCommandMutation`

**Test scenarios:**
- Happy path: Spelling full loop — start-session → advance → submit-answer → end-session — all succeed, progress preserved
- Happy path: Grammar full loop — start-session → submit-answer (all questions) → end-session — final score persisted
- Happy path: Punctuation full loop — same shape as Grammar
- Error path: Grammar stale-409 — concurrent revision bump between start and submit → 409 returned → client retries with fresh revision → no lost progress
- Error path: Punctuation stale-409 — same pattern as Grammar
- Happy path: Parent Hub pagination — 25-session learner → first page returns <= 20 sessions with cursor → second page returns remainder
- Edge case: End-session on an already-ended session returns idempotent success (receipt replay)

**Verification:**
- `npm test` green
- Dense-history smoke script handles full loop without new error exit codes
- Stale-409 retry preserves all submitted answers (no data loss)

---

- U5. **Circuit breaker follow-ups (U9.1)**

**Goal:** Close the 10 tracked U9.1 advisory items: overemission fix, operator reset path, client/server parity, priority-order invariant enforcement.

**Requirements:** R5, R8

**Dependencies:** U1 (multi-learner lock), U3 (query budget locks breaker-related telemetry)

**Files:**
- Modify: `src/platform/core/circuit-breaker.js` (overemission fix, microtask batch)
- Modify: `src/platform/core/repositories/api.js` (forceBreakerReset response handler)
- Modify: `src/platform/hubs/api.js`
- Modify: `worker/src/app.js` (forceBreakerReset field on bootstrap response when admin flag set)
- Modify: `worker/src/circuit-breaker-server.js`
- Modify: `worker/src/repository.js`
- Modify: `tests/circuit-breaker.test.js`
- Test: `tests/circuit-breaker.test.js`

**Approach:**
- Fix `breakerTransition` overemission: blocked calls should NOT re-emit a transition signal — only actual state changes emit
- Sticky breaker operator reset via bootstrap response signalling: add `meta.capacity.forceBreakerReset` field on `/api/bootstrap` response when an admin flag is set. Client checks this field and calls `breakers.bootstrapCapacityMetadata.reset()` on match. This avoids the architecture mismatch of a server endpoint trying to reset a client-side breaker. The existing auto-reset (`api.js` line 2134) already fires when `bootstrapCapacity` metadata reappears — the admin signal is a fallback for cases where the operator wants to force-reset before the metadata is fixed.
- Fix `breakersDegraded.derivedWrite` client-side: currently dead-false because the server-side breaker state is not surfaced to the client. Surface via `meta.capacity` response field.
- Verify priority order invariant: student answer write proceeds regardless of breaker state; `derivedWriteSkipped` emitted but primary state committed
- Fix `scheduleBreakerRecompute` O(N²) on N simultaneous transitions: batch with microtask defer
- Address multi-tab cooldown desync: document as accepted residual (per-tab half-open probes are by design)

**Patterns to follow:**
- Existing `meta.capacity` response surface pattern in `worker/src/logger.js`
- Existing `breakerTransition` signal emission via `addSignal()`
- Client-side bootstrap response processing in `src/platform/core/repositories/api.js`

**Test scenarios:**
- Happy path: Bootstrap response with `meta.capacity.forceBreakerReset: 'bootstrapCapacityMetadata'` triggers client-side `reset()` → breaker transitions from open to closed
- Happy path: Bootstrap response WITHOUT `forceBreakerReset` does not affect breaker state
- Happy path: Blocked call on open breaker does NOT emit `breakerTransition` signal (only actual transitions do)
- Integration: Subject command with `readModelDerivedWrite` breaker open → primary state write succeeds → `derivedWriteSkipped` in response → no "synced" false positive
- Edge case: `bootstrapCapacityMetadata` sticky breaker auto-resets when `bootstrapCapacity` metadata reappears (existing behaviour preserved)
- Happy path: N simultaneous breaker transitions batched via microtask (no O(N²))
- Edge case: `breakersDegraded.derivedWrite` client-side reflects server breaker state from `meta.capacity`

**Verification:**
- `npm test` green
- `breakerTransition` signal count in telemetry matches actual state transitions (not blocked-call count)
- Sticky breaker reset signal round-trips correctly in Worker harness test

---

- U6. **Repository split behind locked tests**

**Goal:** Split `worker/src/repository.js` (9163 lines) into focused modules. Pure code movement — zero behaviour change.

**Requirements:** R6, R8

**Dependencies:** U1 (multi-learner lock), U5 (all repository.js modifications merged before split)

**Files:**
- Create: `worker/src/bootstrap-repository.js`
- Create: `worker/src/history-repository.js`
- Create: `worker/src/read-model-repository.js`
- Create: `worker/src/subject-command-repository.js`
- Create: `worker/src/membership-repository.js`
- Modify: `worker/src/repository.js` (reduced to barrel re-exports + remaining helpers)
- Modify: `worker/src/app.js` (import paths if direct module imports preferred)
- Modify: `tests/worker-bootstrap-v2.test.js` (import paths)
- Modify: `tests/worker-bootstrap-multi-learner-regression.test.js` (import paths)
- Test: all existing tests must pass unchanged

**Approach:**
- Extract in dependency order: membership → bootstrap → history → read-model → subject-command
- Each extraction is a standalone commit: move functions, update imports, run full test suite
- `repository.js` retains barrel re-exports so existing consumers continue to work
- `BOOTSTRAP_CAPACITY_VERSION` moves to `bootstrap-repository.js` with the "same PR bump" rule restated in the header comment
- Capacity metadata helpers may merge into bootstrap-repository if the seam is cleaner than a separate file (implementation-time decision)
- Do NOT rename any exported function or change any parameter signature

**Execution note:** Each extraction step runs the full test suite before the next extraction starts. Any test failure means the extraction broke something — stop and fix before proceeding.

**Patterns to follow:**
- `worker/src/d1.js` helper module pattern (pure functions, explicit imports)
- `worker/src/errors.js` named-export pattern
- Same-PR atomicity constraint from SH2 learning: if reverting any single file breaks the build, all files ship together

**Test scenarios:**
- Happy path: After full split, `npm test` passes with zero new failures
- Happy path: After full split, `npm run audit:client` passes (client bundle does not import worker modules)
- Happy path: After full split, `npm run check` dry-deploy passes
- Integration: Multi-learner bootstrap regression matrix (U1 tests) passes after split
- Integration: Query budget tests (U3) pass after split
- Integration: Command loop tests (U4) pass after split
- Integration: Circuit breaker tests (U5) pass after split
- Edge case: `BOOTSTRAP_CAPACITY_VERSION` is importable from both the new module and the barrel re-export
- Edge case: `npm run audit:client` pattern covers the new `worker/src/*.js` files, not only `worker/src/repository.js` — verify the audit regex is anchored to `worker/src/` broadly, not a specific filename
- Test expectation: none — no new tests; all existing tests validate the split

**Verification:**
- `npm test` green (zero delta from pre-split)
- `npm run audit:client` green — confirm the audit walker inspects inputs from ALL `worker/src/*.js` files, not just `repository.js`
- `npm run check` green
- `repository.js` line count reduced by >= 60%

---

- U7. **CSP / HSTS / hardening residuals**

**Goal:** Close the sys-hardening Phase 2 residuals: CSP enforcement decision, HSTS preload operator audit, `React.lazy` chunk-load inner retry.

**Requirements:** R7, R8

**Dependencies:** U6 (repository split complete — avoids merge conflicts on shared files)

**Files:**
- Modify: `worker/src/security-headers.js` (CSP flip if observation window passed; otherwise document EXTEND)
- Modify: `docs/hardening/csp-enforcement-decision.md`
- Modify: `docs/hardening/hsts-preload-audit.md`
- Modify: `src/platform/react/ErrorBoundary.jsx` (add chunk-load detection + retry CTA in fallback)
- Modify: `src/surfaces/admin/AdminHubSurface.jsx` (pass chunk-load fallback prop to ErrorBoundary)
- Modify: `src/surfaces/parent/ParentHubSurface.jsx` (pass chunk-load fallback prop to ErrorBoundary)
- Test: `tests/error-boundary-chunk-load.test.js`

**Approach:**
- **CSP**: The observation window has NOT started (`docs/hardening/csp-enforcement-decision.md` observation start is still a placeholder). This unit starts the observation by deploying with Report-Only and recording the start date. The enforcement flip is a separate PR after 7+ days elapse. If the observation is already running when U7 executes, check the window and flip if ready.
- **HSTS**: The audit document exists (SH2-U9). Verify operator sign-off status. If DNS audit complete → add `preload` to HSTS header. If not → document current state, no header change. Both CSP and HSTS may produce documentation-only outcomes in this unit — that is acceptable.
- **`React.lazy` chunk-load retry**: Extend the existing `ErrorBoundary` with a chunk-load-specific `fallback` prop that detects `TypeError` from failed chunk loads and offers a "Reload" CTA. Avoid creating a new `LazyLoadErrorBoundary` component — the existing `ErrorBoundary` already accepts a `fallback` prop and adding chunk-load detection is ~4 lines in `getDerivedStateFromError`.

**Patterns to follow:**
- SH2-U8 CSP observation procedure in `docs/hardening/csp-enforcement-decision.md`
- SH2-U10 code-splitting pattern in `src/surfaces/`
- Existing `ErrorBoundary` component with `fallback` prop

**Test scenarios:**
- Happy path: CSP header is either enforcing or Report-Only with documented decision
- Happy path: `LazyLoadErrorBoundary` catches a chunk-load `TypeError` and renders retry CTA
- Happy path: Retry CTA reloads the chunk successfully
- Edge case: Non-chunk-load errors propagate to parent ErrorBoundary (not swallowed)
- Test expectation: HSTS preload — none (operator audit document, no code change if DNS audit incomplete)

**Verification:**
- `npm test` green
- `npm run audit:production -- --url https://ks2.eugnel.uk` confirms header state post-deploy
- `React.lazy` surfaces render correctly after deliberate offline-then-online cycle

---

## System-Wide Impact

- **Interaction graph:** U1 tests exercise the full `bootstrapBundle()` → `listMembershipRows()` → `resolveBootstrapSelectedLearnerId()` → `computeBootstrapRevisionHash()` pipeline. U5 adds a new admin route (`/api/admin/ops/breaker-reset`). U6 changes import paths but not behaviour.
- **Error propagation:** U5 ensures breaker-open state never masks failed writes. U7 ensures chunk-load failures are caught at the lazy-load boundary, not the app root.
- **State lifecycle risks:** U6 (repository split) is the highest-risk unit — any missed import or renamed export breaks the Worker. Mitigated by running the full test suite after each extraction step.
- **API surface parity:** U5 adds a `forceBreakerReset` field to the existing `meta.capacity` response surface — no new endpoints. All other units preserve the existing API surface.
- **Integration coverage:** U1 + U3 + U4 together provide end-to-end coverage from bootstrap through command loop through capacity evidence. U6 runs all of these as regression gates.
- **Unchanged invariants:** `BOOTSTRAP_CAPACITY_VERSION` bump rule, `notModified` hash input set, capacity telemetry signal allowlist, mutation CAS/idempotency contract — all preserved. The plan explicitly does not change these.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Repository split introduces import-path breakage | Each extraction step runs full test suite; barrel re-exports preserve backward compatibility |
| 30-learner capacity gate fails on production | 10-learner preview smoke runs first; failure documented, not hidden; 30-learner deferred if needed |
| CSP enforcement flip breaks Google Fonts / Turnstile | 7-day observation window must show zero unexpected violations before flip; `style-src 'unsafe-inline'` retained until inline-style migration completes |
| Breaker reset signal on bootstrap response could be spoofed by a crafted response | Signal is server-originated (`meta.capacity` is set by Worker, not client-controllable); client validates the breaker name against the closed set before calling `reset()` |
| U7 CSP/HSTS may produce documentation-only outcomes | Plan acknowledges conditional flip; observation window start is recorded; R7 is met by documenting the decision |
| Multi-learner regression matrix is too rigid, breaks on legitimate changes | Tests assert structural contracts (presence/absence, identity, bounding) not exact payload bytes |
| D1 query budget constants become stale | Budget tests document the rationale; adjusting a budget requires updating the test constant (intentional friction) |

---

## Sources & References

- **Origin document:** [docs/plans/james/sys-hardening/sys-hardening-p3.md](../james/sys-hardening/sys-hardening-p3.md)
- Phase 2 capacity completion report: [docs/plans/james/cpuload/cpuload-p2-completion-report.md](../james/cpuload/cpuload-p2-completion-report.md)
- Sys-hardening P2 completion report: [docs/plans/james/sys-hardening/sys-hardening-p2-completion-report.md](../james/sys-hardening/sys-hardening-p2-completion-report.md)
- Capacity operations runbook: [docs/operations/capacity.md](../../operations/capacity.md)
- Bootstrap learner-stats hotfix memory: `.claude/projects/C--James-Private-Repo-ks2-mastery/memory/project_bootstrap_learner_stats_hotfix.md`
- D1 atomicity memory: `.claude/projects/C--James-Private-Repo-ks2-mastery/memory/project_d1_atomicity_batch_vs_withtransaction.md`
- SH2 sprint learnings: `docs/solutions/workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md`
- Related PRs: #316 (bootstrap hotfix U1), #319 (client refetch U2), #326 (circuit breakers U9), #333-#339 (regression sweep)
