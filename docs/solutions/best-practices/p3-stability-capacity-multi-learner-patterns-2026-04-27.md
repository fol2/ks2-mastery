---
title: "P3 convergent sprint patterns: characterisation-first, measure-first budgets, client-vs-server boundary checks"
date: 2026-04-27
category: best-practices
module: capacity-and-multi-learner
problem_type: best_practice
component: development_workflow
severity: high
applies_when:
  - "Converging two or more hardening streams (security, capacity, correctness) into a single branch"
  - "Capacity claims exist in a plan but have no production evidence yet"
  - "A multi-learner or multi-tenant scenario has been implied correct but never tested as a fixture"
  - "Designing admin actions that reset client-side state (browser memory, localStorage)"
  - "Query budget ceilings are being locked for the first time"
  - "Splitting a large monolithic module with deeply entangled internal helpers"
tags:
  - multi-learner
  - bootstrap-contract
  - capacity-evidence
  - circuit-breaker
  - d1-query-budget
  - adversarial-review
  - vacuous-truth
  - measure-first
related_components:
  - database
  - testing_framework
---

# P3 convergent sprint patterns: characterisation-first, measure-first budgets, client-vs-server boundary checks

## Context

The P3 sprint converged three distinct concerns — multi-learner bootstrap correctness, capacity evidence certification, and circuit breaker hardening residuals — onto a single branch (PR #377, 7 units, 49 new test scenarios). Each concern had accumulated a correctness debt that individually seemed manageable but compounded when touched together:

1. **Multi-learner correctness gap.** PR #316 proved that capacity optimisation can silently break sibling learner stats (bounding per-learner SELECT to selected-only broke `child_subject_state` for siblings). No 4-learner regression fixture existed. `child_game_state` had zero test coverage. Viewer-role learners had zero test coverage.

2. **Capacity claims without evidence.** Phase 2 shipped bounded bootstrap (96% payload reduction), circuit breakers, and telemetry infrastructure. But the evidence table in `docs/operations/capacity.md` was still "pending first run." Tools existed; proof did not.

3. **Converging hardening streams.** Circuit breaker follow-ups (U9.1), repository split, and CSP/HSTS residuals came from different origin streams. Running them on one branch created risk that a finding in one unit would invalidate assumptions in another — particularly where admin-role gates, client-side state, and server endpoints intersect.

The sprint produced 7 reusable patterns that apply to future convergent work. (auto memory [claude]: P2 had 25 blockers caught by review; P3 continued the pattern with 12 findings including 4 HIGH, confirming adversarial review is the highest-ROI review type across sprints.)

## Guidance

### 1. Characterisation-first, always

Lock current behaviour as a test fixture before writing a single line of production code. In P3, U1 created a 4-learner bootstrap regression matrix (13 scenarios) before any capacity or refactor work began. Every subsequent unit then got free regression coverage at zero marginal cost.

**Pattern:**
- Write tests that describe what the system does today, including edge paths
- Commit them as a dedicated "characterisation" unit (U1)
- All later units pass or fail against that locked baseline

**Why it compounds:** U1's fixture caught a latent Punctuation bug in U4 — the `'active-item'` phase was used instead of `'session'`, causing the test loop to execute zero iterations silently. Without U1's baseline, this bug would have merged to main.

### 2. Feasibility review must include client-vs-server boundary check

Before approving any plan that involves resetting, clearing, or re-seeding state, explicitly ask: **where does this state actually live?**

P3's plan proposed a `POST /api/admin/ops/breaker-reset` server endpoint to reset the `bootstrapCapacityMetadata` circuit breaker. A feasibility review (100% confidence) caught that this breaker lives in browser memory + `localStorage` — a server endpoint cannot reach it. The fix was to piggyback the reset signal onto the existing bootstrap `meta.capacity` response field, eliminating the endpoint entirely.

**Pattern:** For every plan action of the form "admin resets / clears / re-seeds X":
- Identify the storage location (D1 row, KV, browser memory, IndexedDB, service worker cache)
- If client-side, the server can only signal intent on the next response — it cannot push a reset
- If server-side, the client must poll or subscribe for the change

### 3. Measure-first-then-lock for query budgets

Never write a budget ceiling from first principles and enforce it. Always run the actual query path against a representative fixture, observe the real count, and lock that number.

P3's plan said `queryCount <= 12` for bootstrap. The actual codebase already showed 13 (Phase D/U14 added one query). A ceiling of 12 would have produced a failing test on merge day — not because of a regression, but because the plan was wrong.

**Pattern:**
1. Run the hot path against the real fixture. Record actual count = N.
2. Set ceiling = N (or N+1 if N is at a natural boundary).
3. Pin as a named constant with rationale comment. Adjusting requires updating both.

### 4. Guard against vacuous-truth assertions

An adversarial review found `[].every(() => false)` returning `true` — three tests were passing because they iterated over an empty array. The tests gave zero signal about the actual invariant.

**Pattern:** Any test that uses `.every()`, `.some()`, or `.filter().length` must assert `array.length > 0` first (or pin the exact expected length).

```js
// BEFORE: silently passes when results = []
assert.ok(results.every(r => r.score >= 0));

// AFTER: empty array cannot sneak through
assert.ok(results.length > 0, 'fixture must be non-empty');
assert.ok(results.every(r => r.score >= 0));
```

### 5. Single-assertion targeted tests catch cross-unit bugs

U4's dense-history command-loop test contained one line: `assert.ok(seq > 1)` ("at least one answer submitted"). That single assertion caught a real Punctuation bug: the engine uses `'active-item'` as its session phase, not `'session'`, so the loop guard was wrong and executed zero iterations.

**Pattern:** At natural phase transitions (session start → answer submission → session end), add a targeted count assertion. These are higher signal than broad integration assertions because they catch "the loop body never ran" — a class of bug that broad assertions miss.

### 6. `Object.freeze` does not protect Set instances

An external review (Copilot) identified that `Object.freeze(new Set(['admin']))` does not prevent `.add()` or `.delete()` calls. `Object.freeze` only prevents property reassignment on the object itself, not mutations via the Set's prototype methods.

```js
// BEFORE: exported constant is silently mutable
export const ALLOWED_ROLES = Object.freeze(new Set(['admin', 'teacher']));
// ALLOWED_ROLES.add('attacker') — succeeds with no error

// AFTER: private Set + exported predicate
const _ALLOWED_ROLES = new Set(['admin', 'teacher']);
export const isAllowedRole = (role) => _ALLOWED_ROLES.has(role);
```

### 7. Repository split targets: extract cleanly separable concerns first

A 60% line-count reduction target for `repository.js` (9163 lines) was optimistic. The core functions (`bootstrapBundle`, `runSubjectCommandMutation`) have row-transform logic woven through dozens of internal helpers. Attempting to hit the target by force-splitting entangled code produces fragile modules with circular dependencies.

**Correct first step:** Extract concerns with no import surface into the core mutations (membership queries, bootstrap constants, shared pure utilities, mutation envelope). Document the remaining entanglement as technical debt with a concrete description of what must be refactored before the next extraction pass.

P3 achieved 4 modules / 955 lines extracted (7.7% reduction) — the right outcome given the dependency structure.

## Why This Matters

| Pattern | Cost of ignoring |
|---------|-----------------|
| Characterisation-first | Refactor units have no safety net. P3's U4 Punctuation bug would have merged silently. |
| Client-vs-server boundary check | A server endpoint that resets client-side state would have been built, tested, deployed, and discovered non-functional in production. Days of work wasted. |
| Measure-first budgets | A ceiling lower than reality produces a red test suite on merge day — not a regression, just a wrong plan. Erodes trust in the test suite. |
| Vacuous-truth guards | Tests that pass on empty fixtures provide false confidence. P3 had three such tests across bootstrap, command loop, and hub pagination. |
| Targeted count assertions | "The loop body never ran" is invisible to broad assertions. One `seq > 1` line caught a real bug. |
| Freeze-vs-Set | Exporting a frozen Set as a public constant looks safe but is silently mutable at runtime. |
| Split-first-separable | A 60% split target against a deeply entangled monolith produces circular dependencies and fragile modules. |

## When to Apply

- Any sprint converging 2+ origin streams (capacity, security, correctness) onto one branch
- Any plan proposing an admin "reset" action for a circuit breaker, flag, or counter — run the boundary check
- Any new test asserting invariants over a collection — add the non-empty guard
- Any new query-budget ceiling — measure the real fixture first
- Any exported constant intended to be immutable and is a `Set`, `Map`, or `Array` — use private-reference-plus-predicate
- Any repository split with a percentage-reduction target — inventory dependency trees before committing
- Any characterisation test that uses `.every()` on a derived array — pin the expected length first

## Examples

### Client-vs-server boundary (U5 feasibility fix)

**Before (plan proposal):**
```
POST /admin/reset-bootstrap-capacity
→ clears bootstrapCapacityMetadata circuit breaker
→ learner resets on next load
```

**After (correct design):**
```
Bootstrap response already returns meta.capacity.
Server sets meta.capacity.forceBreakerReset = 'bootstrapCapacityMetadata'
when admin header is present (role-gated).
Client reads the field and calls breakers[name].reset().
No new endpoint needed.
```

### Measure-first query budget (U3)

**Before (plan):**
```js
// Plan said: hot path must not exceed 12 queries
assert.ok(queryCount <= 12);
```

**After (measure-first):**
```js
// Ran actual 3-learner fixture → measured 12 queries.
// Existing single-learner path already at 13 (Phase D/U14 bump).
const BUDGET_BOOTSTRAP_MULTI_LEARNER = 13; // measured: 12, headroom: +1
assert.ok(queryCount <= BUDGET_BOOTSTRAP_MULTI_LEARNER);
```

### Characterisation-first sequence (U1 → U4)

**Without U1:** U4 adds dense-history command-loop test. No existing fixture. `'active-item'` phase bug goes undetected — `seq` never increments past 1 but no test asserts it.

**With U1 in place:** U4 asserts `assert.ok(seq > 1)`. Test fails. Root cause traced: Punctuation phase key `'active-item'` not in loop guard. Bug fixed before merge.

## Related

- [P2 autonomous sprint learnings](../workflow-issues/sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md) — parent pattern for scrum-master orchestration; P3 confirms and applies the same adversarial-first approach
- [P3 completion report](../../plans/james/sys-hardening/sys-hardening-p3-completion-report.md) — full sprint metrics, per-unit breakdown, reviewer findings
- [P3 formal plan](../../plans/2026-04-27-001-feat-stability-capacity-evidence-multi-learner-correctness-plan.md) — decision artifact
- [Capacity operations runbook](../../operations/capacity.md) — operational counterpart; updated by P3 U2 with first dated evidence
- [Bootstrap learner-stats hotfix](../../../.claude/projects/C--James-Private-Repo-ks2-mastery/memory/project_bootstrap_learner_stats_hotfix.md) — (auto memory [claude]) motivating incident for U1's 4-learner fixture
