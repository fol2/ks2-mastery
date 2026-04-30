---
title: "System Hardening Optimisation P4 — 1000-Learner Path Decision"
type: decision-record
status: complete
date: 2026-04-30
phase: P4
decision: "stay-blocked-by-missing-route-costs"
---

# P4 Decision: 1000-Learner Budget Path

## Decision

The 1000-learner budget stays blocked by missing measured route costs. Write-amplification work is premature until parent/admin/demo/Hero route costs are measured.

## Evidence (from latest-1000-learner-budget.json)

### Expected Scenario (1000 learners)

| Resource | Daily estimate | Free-tier limit | Usage % | Status |
|----------|-------------:|----------------:|--------:|--------|
| Dynamic requests | 36,015 | 100,000 | 36.02% | GREEN |
| D1 rows read | 825,300 | 5,000,000 | 16.51% | UNKNOWN (lower-bound) |
| D1 rows written | 1,008,000 | 100,000 | 1,008% | RED |
| Worker CPU | unknown | 10 ms/invocation | — | UNKNOWN |

### Red Surface

D1 rows written dominates at 1,008% of the free-tier daily limit. However, this estimate is based on the command write pattern observed at 30 learners extrapolated linearly to 1000. The actual write amplification at scale may differ if session batching or command compaction is introduced.

### Unknown Surfaces

- **Worker CPU**: P3 evidence files do not contain Cloudflare-joined CPU telemetry (the tail-correlation files do, but these are diagnostic-only and not integrated into the budget model's `normaliseRouteCost()` interface)
- **Parent/admin route costs**: No measured evidence for parent dashboard, admin panel, or operational route costs
- **Demo/session setup costs**: Setup routes not included in capacity-tier measurements
- **Hero route costs**: Hero Mode surfaces not included in route-cost model

## Rejected Alternatives

### Alternative A: Start write-amplification work immediately

**Rejected because:** The 1,008% figure is extrapolated from 30-learner evidence. Without measured parent/admin/demo/Hero route costs, we cannot confirm that D1 writes are truly the first ceiling at scale. Unknown routes may dominate.

### Alternative B: Integrate tail-correlation CPU data into ledger

**Rejected because:** The tail-correlation CPU data uses a different schema than `normaliseRouteCost()` expects. Integration would require schema adaptation work that belongs in a dedicated P5 unit, not as a side-effect of a diagnostic phase.

### Alternative C: Declare 1000-learner work unnecessary

**Rejected because:** 1,008% overshoot on D1 writes is a real constraint. The work is needed — just not yet actionable without route-cost coverage.

## Recommended Next Step

Before starting write-amplification mitigation (Phase 5D):
1. Measure parent/admin route costs (add to budget model)
2. Measure demo/session setup costs
3. Decide whether Hero route costs should be included
4. Integrate tail-correlation CPU data into `normaliseRouteCost()` format
5. Re-evaluate which resource hits the ceiling first with full route coverage

This is independent of the 60-learner diagnostic outcome — it concerns unit economics, not latency tail shape.
