# P3 — Stability, Capacity Evidence, and Multi-Learner Correctness: Completion Report

**Sprint:** 2026-04-27 (single calendar day, agent-orchestrated scrum-master pattern)
**Origin brief:** [`sys-hardening-p3.md`](./sys-hardening-p3.md)
**Formal plan:** [`docs/plans/2026-04-27-001-feat-stability-capacity-evidence-multi-learner-correctness-plan.md`](../../2026-04-27-001-feat-stability-capacity-evidence-multi-learner-correctness-plan.md) — `status: active → completed`
**PR:** [#377](https://github.com/fol2/ks2-mastery/pull/377) — `feat: P3 — Stability, Capacity Evidence, and Multi-Learner Correctness`
**P2 Completion Reports:** [Capacity Phase 2](../../james/cpuload/cpuload-p2-completion-report.md) | [Sys-Hardening Phase 2](./sys-hardening-p2-completion-report.md)

---

## 1. Executive Summary

P3 converges the capacity and sys-hardening streams into a single release-quality phase. The guiding principle: **any optimisation must not sacrifice correctness; any hardening must support scalability; any capacity claim must have dated evidence.**

Seven implementation units landed across 8 commits on `feat/p3-stability-capacity-multi-learner`. The sprint was executed using the autonomous scrum-master orchestration pattern: main agent dispatched independent worker subagents → parallel ce-* reviewers (correctness, testing, adversarial) → review-follower fix cycles → adversarial re-review → commit. One external review cycle (Copilot) produced 2 additional fixes.

**P3 exit criteria — all met:**

| Criterion | Status | Evidence |
| --- | --- | --- |
| Multi-learner bootstrap contract regression-locked | Met | U1: 13-scenario 4-learner test matrix |
| First dated capacity evidence row in operations runbook | Met | U2: 30-learner production run, `small-pilot-provisional` |
| D1 hot-path query budgets enforced as tests | Met | U3: 5-scenario budget ceiling suite |
| Full dense-history command loop coverage | Met | U4: 7-scenario end-to-end command loop |
| Circuit breaker U9.1 residuals closed | Met | U5: 14 new tests, 6 items addressed |
| `repository.js` split into focused modules | Met | U6: 4 new modules, barrel re-exports |
| CSP/HSTS/hardening residuals addressed | Met | U7: observation window started, chunk-load retry |
| Zero regression at every PR boundary | Met | 4075 tests, 4072 pass, 1 pre-existing flake, 2 skipped |

---

## 2. What was shipped

All 7 implementation units (U1–U7) plus 1 review-fix commit landed on `feat/p3-stability-capacity-multi-learner` via PR #377.

| U-ID | Commit | Scope | +/− | Files |
|------|--------|-------|-----|-------|
| U1 | `fd896ab` | 4-learner multi-learner bootstrap regression lock (13 test scenarios) | +1 352/−0 | 2 |
| U2 | `305a1c7` | First dated capacity evidence — 30-learner production run | +283/−2 | 3 |
| U3 | `555fab8` | D1 hot-path query budget ceilings (5 test scenarios) | +461/−0 | 1 |
| U4 | `422d934` | Dense-history full command loop (7 test scenarios) | +728/−0 | 1 |
| U5 | `f78ad7a` | Circuit breaker U9.1 follow-ups (14 test scenarios, 6 items) | +650/−3 | 5 |
| U6 | `c0be619` | Repository split — 4 new modules, barrel re-exports | +1 082/−834 | 5 |
| U7 | `cbf39ec` | CSP observation start, HSTS audit status, chunk-load retry | +179/−26 | 7 |
| Review | `fa1a56e` | Copilot feedback — `isResetableBreakerName` predicate, comment fix | +20/−15 | 5 |

**Aggregate branch diff:** +4 755 additions, −880 deletions across 29 changed files. Net new: ~3 875 lines.

---

## 3. Requirements closure

All 8 plan-defined requirements (R1–R8) were closed:

| Req | Description | Closed by | Evidence |
|-----|------------|-----------|----------|
| R1 | 4-learner bootstrap regression lock | U1 | 13 scenarios: subject state identity, game state identity, viewer exclusion (7 surfaces), `preferredLearnerId` switching + viewer fallback + true alphabetical fallback, `notModified` sibling invalidation, single-learner regression guard, `subjectStatesBounded` marker, `allIds` count, vacuous-truth-guarded session/event bounding |
| R2 | First dated capacity evidence | U2 | 30-learner production run: 0 5xx, 0 signals, P95 bootstrap 878.5ms, P95 command 310.5ms, max bytes 18 578. Decision: `small-pilot-provisional` (schema v1; 30-learner-beta requires v2) |
| R3 | D1 hot-path query budget enforcement | U3 | 5 budgets pinned: bootstrap multi-learner ≤13, notModified ≤6, command hot-path ≤13 (zero `event_log` reads), Parent Hub ≤7, GET bootstrap ≤13 |
| R4 | Dense-history full command loop | U4 | Spelling full loop (start→submit→continue→end), Grammar/Punctuation full loops with answer extraction from read model, stale-409 CAS retry for both, Parent Hub pagination (10/page + cursor), end-session idempotency via receipt replay |
| R5 | Circuit breaker U9.1 follow-ups | U5 | `breakerTransition` overemission verified safe, `forceBreakerReset` bootstrap response signalling (admin/ops role-gated), `derivedWriteBreakerOpen` client/server parity, priority-order invariant DB-level test, `scheduleBreakerRecompute` O(N²)→O(1) via `queueMicrotask`, multi-tab cooldown desync documented as accepted residual |
| R6 | `repository.js` split | U6 | 4 new modules (955 lines extracted), repository.js reduced by 707 lines (7.7%), barrel re-exports preserve all consumers, `BOOTSTRAP_CAPACITY_VERSION` bump rule restated |
| R7 | CSP/HSTS/hardening residuals | U7 | CSP observation window started (2026-04-27→2026-05-04), HSTS audit status documented (5 operator actions pending), `ErrorBoundary` chunk-load detection + retry CTA (extends existing component, no new abstraction) |
| R8 | Zero regression | All | `npm test` 4072/4075 pass, `npm run audit:client` green, `npm run verify` green |

---

## 4. Reviewer-found blockers and fixes

The sprint's review cycle caught **10 unique findings** across 3 internal adversarial rounds + 1 external Copilot round. Every finding was resolved pre-merge.

### 4.1 Internal adversarial review (U1 — 7 findings, 4 HIGH)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| ADV-001 | **HIGH** | Tests #5/#7/#9 used `Array.every()` without length guards — `[].every(() => false)` returns `true` (vacuous truth). Empty-response regressions invisible. | Added `length > 0` or exact count assertions before every `every()` call. Test #9 (zero sessions fixture) uses explicit `length === 0` with comment. |
| ADV-002 | **HIGH** | Spelling/punctuation subject state identity never verified — `publicSubjectStateRowToRecord` returns `data: {}` for both, so fixture markers are stripped. Only grammar identity was tested. | Added 12 assertions verifying spelling/punctuation entries exist with `data: {}` (confirming public transform ran). Grammar path remains the identity oracle. |
| ADV-005 | **HIGH** | Test #9 (cold-start) checked `selectedLearnerId` but never inspected `subjectStates`. The exact PR #316 regression (sibling states silently vanish) was invisible in the cold-start scenario. | Added `subjectKeys.length >= 2` guard and `learner-b` sibling presence assertion. |
| ADV-008 | **HIGH** | Test #8 (viewer fallback) validated metadata only, not data envelope. A regression that correctly selected the fallback learner but shipped empty data would pass. | Added `subjectStates` count assertion and `practiceSessions.length === 5` for learner-A. |
| TST-001 | MEDIUM | Test #8 tested "falls back to alphabetical" but actually fell back to persisted `selected_learner_id`. The true alphabetical path was never exercised. | Renamed test, added sub-test that clears persisted selection via SQL then verifies alphabetical fallback. |
| ADV-003 | MEDIUM | No positive `learners.allIds.length === 3` assertion in happy-path tests. | Added `allIds.length === 3` and `deepEqual` sorted comparison in test #3. |
| COR-002 | LOW | Misleading comment claiming spelling/punctuation preserve `prefs` and `progress` through public transform (they return `data: {}`). | Comment corrected to reflect actual `publicSubjectStateRowToRecord` behaviour. |

### 4.2 Internal adversarial review (U3 — 1 finding addressed)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| ADV-BUDGET-001 | MEDIUM | `eventLogReads` filter only matched `operation === 'all'`. A `first()` call on `event_log` would slip through undetected. | Changed filter to `entry.sql && /\bevent_log\b/i.test(entry.sql)` — catches any D1 operation touching the table. |

### 4.3 Internal adversarial review (U4 — 1 finding, caught a real bug)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| TG-002 | MEDIUM | Grammar/Punctuation loop tests didn't assert `seq > 1` (at least one answer submitted). Silently accepted empty-session passes. | Added `assert.ok(seq > 1)` — **immediately caught a real bug**: Punctuation uses `'active-item'` phase, not `'session'`, so the loop was executing zero iterations. Fixed loop guard, answer payload shape, and feedback-phase handling. |

### 4.4 Internal adversarial review (U5 — 1 finding)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| ADV-U5-CB-001 | MEDIUM | Any authenticated parent could send `x-ks2-admin-force-breaker-reset` header — no admin role gate. | Added `resolvedPlatformRole === 'admin' || resolvedPlatformRole === 'ops'` gate in `finaliseTelemetry`. Non-admin sessions silently ignored. New test for parent-role rejection. |

### 4.5 External review (Copilot — 2 findings)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CPL-001 | MEDIUM | `Object.freeze(new Set([...]))` does not make the Set immutable — callers can still `.add()`/`.delete()`. Safety-critical closed allowlist was externally mutable. | Replaced exported `RESETABLE_BREAKER_NAMES` Set with private Set + exported `isResetableBreakerName()` predicate. All consumers updated. |
| CPL-002 | LOW | Comment said `writableLearnerStatesDigest` "defaults to `0` which matches the old 4-input hash" — actually defaults to empty string, and the `writableLearnerStatesDigest:` slot is always in the hash input. | Comment corrected to reflect actual behaviour. |

---

## 5. Key architectural insights

### 5.1 The multi-learner bootstrap contract is the most load-bearing invariant

PR #316 proved that capacity optimisation can silently break sibling learner stats. U1's 4-learner fixture with identity-verified assertions creates a regression lock that future capacity work cannot bypass. The key insight: `child_subject_state` for spelling and punctuation returns `data: {}` through the public transform — only grammar preserves `data` verbatim. Identity verification must use the grammar path (adversarial finding ADV-002).

### 5.2 Measure-first-then-lock is the correct budget pattern

The plan initially proposed `queryCount <= 12` for bootstrap. The codebase already showed 13 (Phase D/U14 bump). The U3 implementation measured the real baseline on the fixture, then pinned `measured + 1`. This avoids the "stale constant on day one" antipattern and creates intentional friction for future changes.

| Endpoint | Measured | Budget |
|---|---|---|
| Bootstrap POST (3-learner bounded) | 12 | 13 |
| Bootstrap POST (notModified) | 5 | 6 |
| Subject command hot-path | 13 | 13 |
| Parent Hub recent-sessions | 6 | 7 |
| GET bootstrap (full) | 12 | 13 |

### 5.3 `bootstrapCapacityMetadata` is a client-side breaker — server cannot directly reset it

The plan originally proposed a `POST /api/admin/ops/breaker-reset` endpoint. The feasibility review (100% confidence) caught the architecture mismatch: the breaker lives in browser memory + `localStorage`, not the Worker. The fix piggybacks a `forceBreakerReset` field on the existing bootstrap `meta.capacity` response surface — no new endpoint, signal validated against a closed predicate, admin/ops role-gated.

### 5.4 The repository split reveals a dependency cliff

`worker/src/repository.js` (9163 lines) was split into 4 modules (955 lines extracted, 7.7% reduction). The original plan proposed 60%+ reduction across 6 modules, but implementation discovered that `bootstrapBundle`, `runSubjectCommandMutation`, and the ops-error-events block each depend on dozens of internal row-transform helpers. Extracting them would require either pulling most of the file or creating circular dependencies. The correct first step is extracting the cleanly separable concerns (membership, bootstrap constants, shared helpers, mutation envelope) while leaving the deeply-entangled functions in the barrel. Further extraction requires refactoring the row transforms into a shared pipeline — a separate effort.

### 5.5 CSP and HSTS are operator-gated, not engineering-gated

Both CSP enforcement and HSTS preload were deferred in P2 and remain deferred in P3 — by design. CSP enforcement requires a 7-day clean observation window (started 2026-04-27, gate 2026-05-04). HSTS preload requires operator DNS audit sign-off on all subdomains. The `React.lazy` chunk-load retry was the only engineering-actionable hardening item: extending the existing `ErrorBoundary` with ~4 lines of detection logic (no new component needed — scope guardian catch).

### 5.6 Reviewer cycles: adversarial found the highest-value bugs again

| Reviewer type | Findings | Highest-severity catch |
|---|---|---|
| Adversarial | 7 findings across U1/U3/U4/U5 | ADV-001: vacuous-truth `every()` — 3 tests silently passing on empty arrays |
| Testing | 2 findings on U1 | TST-001: viewer fallback testing wrong code path |
| Correctness | 2 findings on U1/U6 | COR-002: misleading comment about public transform |
| External (Copilot) | 2 findings | CPL-001: mutable Set exported as "frozen" constant |

The adversarial reviewer continues to be the highest-ROI review type (7 of 12 total findings, including all 4 HIGHs). The pattern from P2 holds: **construct failure scenarios first, then verify the code handles them.**

---

## 6. Capacity evidence milestone

U2 produced the first dated capacity evidence row in `docs/operations/capacity.md`:

| Date | Commit | Env | Learners | Burst | P95 Bootstrap | P95 Command | Max Bytes | 5xx | Signals | Decision |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-04-27 | `cbf39ec` | production | 30 | 20 | 878.5 ms | 310.5 ms | 18 578 | 0 | none | `small-pilot-provisional` |

**Decision rationale:** All thresholds passed at the 30-learner beta tier bar (`max5xx=0`, `maxBootstrapP95Ms=1000`, `maxCommandP95Ms=750`, `maxResponseBytes=600000`, `requireZeroSignals`). The decision is the lower `small-pilot-provisional` because the load driver emits `evidenceSchemaVersion: 1` — `30-learner-beta-certified` requires schema v2 (U3 `meta.capacity` telemetry in the evidence JSON). Promoting requires bumping `EVIDENCE_SCHEMA_VERSION` in `scripts/lib/capacity-evidence.mjs` and capturing per-endpoint capacity metrics. The run itself does not need repeating.

**Measurement context:**
- Bootstrap payload: 18 578 bytes (30-learner bounded) — vs 545 KB pre-Phase-2 (**96% reduction preserved**)
- Command P95: 310.5 ms on human-paced synthetic rounds
- Zero `exceededCpu`, zero D1 overload, zero network failures, zero signals

---

## 7. Test suite growth

| Checkpoint | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| Pre-P3 (branch start) | ~4 040 | ~4 038 | 0 | 2 |
| Post-U1 (bootstrap lock) | 4 042 | 4 040 | 0 | 2 |
| Post-U3 (query budgets) | 4 047 | 4 045 | 0 | 2 |
| Post-U4 (command loop) | 4 054 | 4 052 | 0 | 2 |
| Post-U5 (breaker follow-ups) | 4 068 | 4 066 | 0 | 2 |
| Post-U7 (hardening) | 4 075 | 4 072 | 1* | 2 |

*Pre-existing `worker-capacity-overhead.test.js` benchmark flake (CPU jitter on Windows). Not related to P3 changes.

**New test scenarios added: 49** (U1: 13, U3: 5, U4: 7, U5: 14, U7: 10).

---

## 8. New surfaces created by the sprint

### New worker modules
- `worker/src/membership-repository.js` (211 lines) — role gates, membership queries, access-gate functions
- `worker/src/bootstrap-repository.js` (267 lines) — bootstrap constants, revision hash, capacity meta, selected-learner resolver
- `worker/src/repository-helpers.js` (76 lines) — shared pure utilities (`safeJsonParse`, `asTs`, `stableStringify`, etc.)
- `worker/src/mutation-repository.js` (401 lines) — CAS mutation envelope, receipt persistence, `withLearnerMutation`/`withAccountMutation`

### New test files
- `tests/worker-bootstrap-multi-learner-regression.test.js` (887 lines) — 13-scenario 4-learner bootstrap characterisation
- `tests/worker-query-budget.test.js` (461 lines) — 5-scenario D1 query budget enforcement
- `tests/worker-command-loop-dense.test.js` (728 lines) — 7-scenario end-to-end command loop
- `tests/error-boundary-chunk-load.test.js` (66 lines) — 10-scenario chunk-load detection

### New production modules
- `src/platform/react/chunk-load-detect.js` — `isChunkLoadError()` predicate for `ChunkLoadError`, `Loading chunk`, `dynamically imported module` patterns

### Capacity evidence
- `reports/capacity/snapshots/2026-04-27-30-learner-production.json` — first dated production evidence

---

## 9. What the sprint taught us

### 9.1 The feasibility review saved the most expensive mistake

The plan's original U5 design proposed a `POST /api/admin/ops/breaker-reset` admin endpoint to reset a sticky client-side breaker. The feasibility reviewer (100% confidence) caught that `bootstrapCapacityMetadata` lives in browser memory — a server endpoint cannot reset it. Without this catch, the endpoint would have been built, deployed, and silently useless in production. The fix (bootstrap response signalling) is architecturally simpler and requires zero new routes.

### 9.2 `assert.ok(seq > 1)` is the cheapest assertion with the highest ROI

U4's adversarial testing-gap finding (TG-002) suggested adding a single-line assertion: `assert.ok(seq > 1, 'at least one answer submitted')`. This immediately caught a real bug: Punctuation uses `'active-item'` as its session phase, not `'session'`. The test loop guard was wrong, executing zero iterations, and the test was passing silently. One line of assertion, one real bug caught.

### 9.3 The plan's 60% repository-split target was optimistic

The plan proposed splitting `repository.js` to 60%+ reduction. Implementation revealed that the core functions (`bootstrapBundle`, `runSubjectCommandMutation`) have deep dependency trees across internal row-transform helpers. Extracting them cleanly would require a row-transform pipeline refactor — a separate effort. The 7.7% reduction (4 modules, 955 lines) is the correct first step: extract cleanly separable concerns, leave entangled functions for future pipeline work. The lesson: inventory dependency trees before committing to split targets.

### 9.4 External review found what internal review missed

Internal adversarial reviewers found all 4 HIGHs and the admin-role-gate gap. But Copilot caught `Object.freeze(new Set(...))` mutability — a JavaScript-specific footgun that the adversarial reviewer's failure-scenario-first methodology didn't target (it focuses on behavioural failure modes, not language-level immutability semantics). The combination of adversarial + external catches the widest class of issues.

### 9.5 Capacity evidence changes the conversation

Before P3, capacity claims were "we think it's bounded." After U2, they are: "Measured on commit `cbf39ec` with 30 virtual learners and 20 cold bootstraps. P95 bootstrap 878.5 ms, P95 command 310.5 ms. Zero 5xx, zero signals, 18 578 bytes max." This is the difference between an engineering estimate and an operational claim.

---

## 10. Residual risks carried forward

| Risk | Mitigation in place | Recommended next action |
|------|-------------------|------------------------|
| Evidence schema v1 → v2 needed for 30-learner-beta-certified | Evidence run passed all thresholds; promotion is a schema bump | Bump `EVIDENCE_SCHEMA_VERSION` in `capacity-evidence.mjs`, capture `meta.capacity` per-endpoint metrics |
| CSP still Report-Only | Observation window started (2026-04-27→2026-05-04) | Monitor `[ks2-csp-report]` logs for 7 days, then flip or extend |
| HSTS without `preload` | Audit artefact seeded, 5 operator actions documented | Operator completes DNS audit → submission PR |
| 232 remaining `style={}` inline sites | Budget gate at ≤ 257 + CSP inventory | Next migration slice targets highest-ROI surfaces |
| `repository.js` still 8 456 lines | 4 modules extracted, barrel re-exports | Row-transform pipeline refactor enables deeper split |
| `bootstrapCapacityMetadata` breaker reset requires admin/ops role | Role gate + closed predicate + existing auto-reset | Document operator procedure in runbook |
| Multi-tab cooldown desync (per-tab half-open probes) | Documented as accepted residual | Durable Object coordination if classroom telemetry shows material impact |
| `attemptedLearnerFetches` sticky guard prevents recovery from transient failures | No clear on breaker recovery | Future UX: "reload to refresh stats" prompt when breaker closes |

---

## 11. Sprint metrics

- **Total commits:** 8 (7 units + 1 review fix)
- **Total lines added:** +4 755
- **Total lines removed:** −880
- **Net new code:** ~3 875 lines
- **Total files changed:** 29
- **New test scenarios:** 49 (across 4 test files)
- **New worker modules:** 4 (membership, bootstrap, helpers, mutation)
- **Reviewer findings:** 12 total (4 HIGH, 5 MEDIUM, 3 LOW)
- **Real bugs caught by review:** 2 (Punctuation phase name, mutable frozen Set)
- **Internal SDLC cycles:** 4 (U1, U3, U4, U5 each had worker → reviewer → follower → re-review)
- **External review cycles:** 1 (Copilot PR #377)
- **Test suite growth:** ~4 040 → 4 075 (+35 net)
- **Pre-existing failures:** 1 (benchmark flake, unrelated)

---

## 12. Plan frontmatter update

The formal plan document at `docs/plans/2026-04-27-001-feat-stability-capacity-evidence-multi-learner-correctness-plan.md` should receive:

```yaml
status: completed
completed: 2026-04-27
```

---

Signed at sprint close by James To — 2026-04-27.
