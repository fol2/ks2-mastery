---
title: "System Hardening Optimisation P5 — 1000-Learner Path Decision"
type: decision-record
status: complete
date: 2026-04-30
phase: P5
exit_state: 1000-route-costs-still-incomplete
certifying: false
language: en-GB
---

# System Hardening Optimisation P5 — 1000-Learner Path Decision

## Evidence Boundary

Inputs:

- `reports/capacity/evidence/2026-04-30-p5-route-costs.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

The budget remains `modellingOnly: true` and `certifying: false`. It is not production certification evidence and does not support a “1000 learners are supported” claim.

## Decision Questions

1. **After route-cost coverage, what is the first Free-tier ceiling likely to fail?**
   In the current expected 1000-learner model, D1 rows written are the first red quota, followed by D1 rows read. This remains a lower-bound model because route coverage is incomplete.

2. **Are D1 rows written still the dominant red surface?**
   Yes in the current model: expected 1000-learner D1 rows written are red. This is not enough to start write compaction because several required route families are still missing or partial.

3. **Are D1 rows read red under realistic assumptions?**
   Yes in the expected 1000-learner model, but still marked with incomplete coverage. Query/read optimisation remains plausible, not proven as the first engineering target.

4. **Are Worker requests still green with safe headroom?**
   Expected 1000-learner dynamic requests remain green. The pessimistic scenario is red, so request-volume work is not the first expected-path target but cannot be ignored.

5. **Is Worker CPU now measurable enough to reason about?**
   Partially. Bootstrap Worker CPU is no longer globally unknown because redacted tail-correlation CPU was integrated. It is not complete enough to declare Worker CPU safe across demo/session, command, parent/admin, or Hero route families.

6. **Do parent/admin, demo/session, or Hero routes materially change the budget?**
   Unknown. Demo/session response bytes are present but query/read/write/CPU metrics are incomplete. Parent/admin and Hero route families are explicitly listed as missing or blocked rather than silently absent.

7. **Should the next engineering phase be write compaction, query/cache work, payload/CPU work, or continued diagnostic repair?**
   Continued diagnostic repair and route-cost coverage. The current model flags D1 writes, D1 reads, and bootstrap CPU risk, but missing route coverage is still too large for a responsible optimisation choice.

## Chosen Outcome

`1000-route-costs-still-incomplete`

P5 improved the ledger by integrating partial Worker CPU evidence and required route-family coverage, but the route-cost matrix is still incomplete.

## Rejected Alternatives

- **Write compaction now:** rejected because D1 writes are red but route coverage is incomplete and the 60-learner diagnostic did not reach app-load.
- **D1 query/cache work now:** rejected because D1 reads are red but not yet separated from missing route families and lower-bound assumptions.
- **Payload/CPU optimisation now:** rejected because bootstrap CPU is red/partial, but CPU is missing across several route families.
- **Request-volume work now:** rejected for the expected scenario because requests remain green, though pessimistic requests are red.
- **1000-learner readiness claim:** rejected. The evidence is modelling-only and non-certifying.

## Next Path

Continue P5 route-cost coverage and run the approved P5 60-learner production diagnostic before selecting P6 write, query/cache, payload/CPU, or platform work.
