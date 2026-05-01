---
title: "System Hardening Optimisation P7 — Post-Change Run Report"
type: diagnostic-report
status: operator-gated
date: 2026-05-01
phase: P7
run_id: p7-local-query-shape-reduction
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
  - reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json
  - tests/worker-bootstrap-capacity.test.js
  - tests/worker-query-budget.test.js
---

# System Hardening Optimisation P7 — Post-Change Run Report

## Run Boundary

No post-change production 60-learner diagnostic has been run from this worktree.

Reason: the P7 code is still uncommitted and not deployed. James required two independent reviews before commit, PR and merge; those review findings are closed. Running the approved production diagnostic before deployment would measure the old production code, not this P7 optimisation.

## Local Post-Change Evidence

The local focused regression test `P7 public demo bootstrap reuses authenticated account snapshot and ratchets query count` validates the intended D1 query-shape reduction on the production/demo public bootstrap path:

```sh
node --test tests/worker-bootstrap-capacity.test.js
```

Observed local result:

| Metric | P6 approved production shape | P7 local focused result | Status |
| --- | ---: | ---: | --- |
| Full-bootstrap query count | 11 | 9 | reduced |
| D1 rows written | 0 | 0 | preserved |
| Bootstrap capacity metadata | present | present | preserved |
| Bootstrap mode | `selected-learner-bounded` | `selected-learner-bounded` | preserved |
| Capacity mode | `public-bounded` | `public-bounded` | preserved |

The reduction removes:

- the duplicate bootstrap account row read, because the authenticated route already refreshed and returned the account row via `ensureAccount()`;
- the valid-demo active-account guard read, because the authenticated account snapshot already proves the demo account is active, with fallback to the existing D1 guard when the snapshot is absent or stale.

The general bounded three-learner GET/POST bootstrap query-budget regression now records a local count of 10, reduced from the previous measured 11:

```sh
node --test tests/worker-query-budget.test.js
```

This second count is higher than the valid-demo public path because it covers the broader bounded account fixture rather than the single valid-demo route shape.

## Not-Modified Route-Cost Status

P7-U3 remains operator-gated for route-cost closure.

The local tests continue to cover the `POST /api/bootstrap` not-modified path and cache invalidation behaviour, but no post-change production route-cost refresh has been generated from this undeployed worktree. Therefore `not-modified-bootstrap` remains a missing/gated route family in the 1000-learner budget with the existing `requires-production-operator` reason until the deployed post-change diagnostic and route-cost refresh are run.

## Production Diagnostic Status

Required P7 run shape remains pending:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- raw Worker tail captured outside the repository
- redacted tail correlation committed
- redacted statement map committed
- route-cost/budget regenerated from the post-change evidence

This report does not claim that bootstrap P95 improved in production.

## Certification Boundary

60 learners remain uncertified.

The local query-count reduction is implementation evidence only. It is not a 60-learner certification candidate and does not change the public capacity status.
