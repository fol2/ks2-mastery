---
title: "Autonomous certification phase — wave execution, adversarial composition-gap detection, and honest threshold recording"
date: "2026-04-27"
category: workflow-issues
module: sdlc-autonomous-certification
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - "Executing 10+ unit autonomous certification phases with parallel subagent workers"
  - "Converting provisional stability guarantees into enforceable production readiness"
  - "Coordinating overlapping file edits across parallel worktree-isolated PRs"
  - "Adversarial review catches composition gaps between independently-authored units"
tags:
  - autonomous-sdlc
  - certification
  - parallel-workers
  - adversarial-review
  - worktree-isolation
  - composition-gap
  - wave-execution
  - production-readiness
related_components:
  - testing_framework
  - tooling
---

# Autonomous certification phase — wave execution, adversarial composition-gap detection, and honest threshold recording

## Context

P4 Production Certification was a 12-unit, 12-PR phase executed over 2 calendar days (2026-04-27 to 2026-04-28) to convert P3's provisional 30-learner stability into enforceable production readiness. No new learner-visible features — only hardening, evidence, revalidation.

The challenge: how to maintain quality across a dozen parallel workstreams touching overlapping files, with zero human PR review, while enforcing a "no regression" constraint. The answer: wave-based parallel dispatch with mandatory adversarial review gates and honest failure recording.

This extends the autonomous SDLC pattern established in the [P2 13-unit sprint](./sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md), adding certification-specific methodology: evidence schema upgrades, production capacity threshold pinning, provenance anti-fabrication, and honest failure recording when thresholds fail.

## Guidance

### 1. Plan with adversarial review before code ships

Write a formal implementation plan (P4's was 695 lines, "Deep" depth classification). Before the first worker is dispatched, run three parallel plan reviewers:

- **Coherence reviewer** — contradictions, terminology drift, dependency graph consistency
- **Feasibility reviewer** — can each unit be implemented against the actual codebase?
- **Scope reviewer** — does any unit exceed its stated boundary?

P4 findings integrated before execution:
- Mermaid diagram had a circular U4↔U6 dependency (coherence)
- Row-transform extraction assumed all functions were pure — 3 are not (feasibility)
- U6/U9/U10 were on U11's critical path without justification (scope)

### 2. Group units into dependency waves

Map hard dependencies (Unit X produces an artefact Unit Y consumes) vs soft dependencies (both touch nearby code but don't share data). Only hard dependencies gate execution order.

```
Wave 1 (foundations, parallel):     U1, U2, U4, U9, U10
Wave 2 (hardening, parallel):       U3, U6, U7, U8
Wave 3 (sequential, needs U3):      U5
Wave 4 (certification, needs W1-3): U11
Wave 5 (preflight, needs W4):       U12
```

Soft dependencies (U4/U6/U9/U10) run in Wave 1 but don't gate U11 — they're parallel validation tracks. This distinction saved ~6 hours of serial wall-clock time.

### 3. Isolate each worker in a dedicated git worktree

Each unit gets `isolation: "worktree"` — a fresh git worktree branched from `origin/main`. The main repo never changes branch. Workers create PRs from their worktree. Benefits:
- No cross-contamination between parallel units
- Failed units don't block other waves
- Main checkout stays clean for the orchestrator

### 4. Gate every PR on adversarial review

No PR merges without passing adversarial review. The reviewer is not a linter — it constructs failure scenarios to break the implementation:

**Composition gaps** (highest value finding class):
- Gate reads a field (`queryCount`) that its data source (`summariseCapacityResults`) never populates → gate has no teeth
- Two calls to `resolveCommitSha()` can return different SHAs → TOCTOU gap
- `thresholdConfigHash='unknown'` silently skips hash verification → bypass
- Every successful bootstrap fires `clearStaleFetchGuards()` → defeats storm-prevention guard

**Type safety gaps:**
- `NaN !== undefined && NaN !== null` is `true` → gate accepts garbage
- `JSON.stringify(NaN)` produces `null` → evidence on disk contradicts runtime

**Tautology tests:**
- Test uses `true ? 'string A' : 'string B'` → asserts a literal equals itself, never touches module code

P4 yield: **2 HIGH, 13 WARN, 0 BLOCK** across 12 reviews. All HIGHs fixed before merge.

### 5. Record certification outcomes honestly

When the 30-learner cert run exceeded `maxBootstrapP95Ms` by 12.6% (1126ms vs 1000ms threshold), the evidence was committed with `decision=fail`. No threshold was relaxed. The 60-learner preflight failed on test-infra IP rate-limiting — also recorded as-is.

```javascript
// Honest failure recording pattern
evidence = {
  metric: 'maxBootstrapP95Ms',
  observed: 1126,
  threshold: 1000,
  passed: false,
  decision: 'fail',
  attribution: 'suspected cold D1 statement cache',
  nextAction: 're-run after warm-cache window'
};
```

If a 12.6% overshoot is silently forgiven, every future threshold becomes negotiable. `decision=fail` preserves trust in the certification regime.

### 6. Evidence schema must compose end-to-end

The highest-value P4 finding: `requireBootstrapCapacity` gate was implemented correctly in isolation (checked `queryCount !== undefined && !== null`), but the upstream data producer (`summariseCapacityResults()`) never aggregated `queryCount` onto the endpoint summary. The gate checked a field that was always `undefined` in practice — a gate with no teeth.

**Rule:** Any gate that reads fields from a data structure produced by a different module must have an end-to-end test exercising the full producer→consumer pipeline, not just the consumer in isolation.

## Why This Matters

**Composition gaps are invisible to unit-scoped review.** A function that passes all its own tests can still be dead code if its caller never populates the field it reads. Adversarial review catches these because it asks "does this change compose correctly with the rest of the system?" rather than "does this change work in isolation?"

**Parallel execution without isolation causes cascade failures.** Without worktree isolation, a failed unit on a shared branch blocks every subsequent unit. With isolation, a failing PR is simply not merged — other waves proceed unaffected.

**Honest failure recording preserves trust.** The quantitative yield across P4: 2 HIGH findings (silent production bugs caught pre-merge), 13 WARN findings (tech debt prevented), zero human review cycles consumed.

## When to Apply

Apply when ALL of:
- Phase has 8+ implementation units with a mix of independent and dependent work
- No human reviews individual PRs (fully autonomous execution)
- Codebase has existing invariants or contracts that new code must compose with
- Goal is certification or hardening (not greenfield feature development)
- Tooling supports isolated worktrees and automated PR creation

Do NOT apply when:
- Units are tightly sequential (waves degenerate to serial execution)
- Phase is exploratory/prototyping (adversarial review overhead exceeds value)
- Fewer than 5 units (coordination cost exceeds parallelism benefit)
- Human is reviewing every PR anyway (adversarial review is redundant)

## Examples

### Before: Serial execution without adversarial review

```
U1 → PR → merge → U2 → PR → merge → ... → U12 → PR → merge
                                                    ↑
                                    Composition bug ships undetected
                                    (gate reads field never populated)
```

Wall-clock: ~24 hours serial. Composition bugs discovered in production or never.

### After: Wave-based parallel execution with adversarial gates

```
Wave 1 (5 parallel workers in isolated worktrees):
  worker-u1  → PR #425 → adversarial → fix 2 HIGH → merge  ─┐
  worker-u2  → PR #422 → adversarial → fix 1 LOW  → merge   │
  worker-u4  → PR #421 → adversarial → clean      → merge   ├─ all W1 merged
  worker-u9  → PR #424 → adversarial → clean      → merge   │
  worker-u10 → PR #420 → adversarial → fix 2 WARN → merge  ─┘

Wave 2 (4 parallel workers, based on latest main):
  worker-u3  → PR #434 → adversarial → fix 1 WARN → merge  ─┐
  worker-u6  → PR #435 → adversarial → fix 2 WARN → merge   ├─ all W2 merged
  worker-u7  → PR #432 → adversarial → fix 2 WARN → merge   │
  worker-u8  → PR #433 → adversarial → fix 2 WARN → merge  ─┘

Wave 3 (depends on U3):
  worker-u5  → PR #443 → adversarial → fix 1 WARN → merge

Wave 4+5 (operational — production load tests):
  operator   → PR #464 → 30-learner cert (FAIL: P95 +12.6%)
  operator   → PR #466 → 60-learner preflight (FAIL: IP rate-limit)
```

Wall-clock: ~14 hours for code. 2 HIGH bugs caught before reaching production.

### Composition gap: gate vs producer

```javascript
// Producer (classroom-load-test.mjs) — BEFORE fix:
function summariseCapacityResults(measurements) {
  return { count, p50WallMs, p95WallMs, maxResponseBytes };
  // queryCount and d1RowsRead NEVER aggregated onto endpoint summary
}

// Consumer (capacity-evidence.mjs) — checks field that doesn't exist:
const qc = bootstrapEntry.queryCount;  // always undefined
if (qc !== undefined && qc !== null) { /* never reached */ }

// AFTER fix — producer aggregates:
function summariseCapacityResults(measurements) {
  const queryCount = Math.max(...measurements.map(m => m.capacity?.queryCount ?? 0));
  const d1RowsRead = Math.max(...measurements.map(m => m.capacity?.d1RowsRead ?? 0));
  return { count, p50WallMs, p95WallMs, maxResponseBytes, queryCount, d1RowsRead };
}
```

### Type safety: NaN passes nullish check

```javascript
// BEFORE — NaN slips through:
const qc = bootstrapEntry.queryCount;  // could be NaN from parseInt('garbage')
if (qc !== undefined && qc !== null) { /* NaN passes! */ }

// AFTER — numeric type check:
if (typeof qc === 'number' && Number.isFinite(qc) && qc >= 0) { /* NaN rejected */ }
```

## Related

- [P2 13-unit autonomous sprint learnings](./sys-hardening-p2-13-unit-autonomous-sprint-learnings-2026-04-26.md) — canonical SDLC orchestration reference (parent pattern)
- [P3 stability/capacity/multi-learner patterns](../best-practices/p3-stability-capacity-multi-learner-patterns-2026-04-27.md) — direct predecessor; measure-first budgets, characterisation-first testing
- [Admin Console P4 hardening](../architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md) — sibling P4 doc for admin console; same adversarial review techniques
- [Grammar P7 quality trust consolidation](../architecture-patterns/grammar-p7-quality-trust-consolidation-and-autonomous-sdlc-2026-04-27.md) — wave-based dispatch with file-overlap checking
- [Punctuation P7 stabilisation contract](../architecture-patterns/punctuation-p7-stabilisation-contract-and-autonomous-sdlc-2026-04-28.md) — scope-by-outcomes pattern complementary to certification-by-evidence
- GitHub issues: [#455](https://github.com/fol2/ks2-mastery/issues/455) (30-learner cert), [#456](https://github.com/fol2/ks2-mastery/issues/456) (60-learner preflight)
- P4 completion report: `docs/plans/james/sys-hardening/sys-hardening-p4-completion-report.md`
