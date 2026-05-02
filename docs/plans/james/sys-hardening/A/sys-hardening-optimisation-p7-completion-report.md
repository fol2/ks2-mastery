---
title: "System Hardening Optimisation P7 - Completion Report"
type: completion-report
status: reviewed-repeat-governance-candidate
date: 2026-05-02
phase: P7
owner: james
route: system-hardening-optimisation
language: en-GB
certifying: false
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-path-decision.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-60-diagnostic-decision.md
  - reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json
  - reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json
  - reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json
  - reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-02-p7-60-statement-map.json
  - reports/capacity/evidence/2026-05-02-p7-60-tail-classification.md
  - reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
  - docs/operations/capacity-1000-learner-free-tier-budget.md
---

# System Hardening Optimisation P7 - Completion Report

## Status

P7 now has implementation evidence, deployed single-demo confirmation, and one approved post-change 60-learner production diagnostic pass.

This is not 60-learner certification. The selected exit state is `p8g-60-repeat-governance-candidate`: the next phase is repeat-governance consideration for the same 60-learner production shape.

Independent engineering and contract reviews are closed with no blockers before commit, PR, and merge.

## Completed Artefacts

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-path-decision.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-60-diagnostic-decision.md`
- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-completion-report.md`
- `reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json`
- `reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json`
- `reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json`
- `reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json`
- `reports/capacity/evidence/2026-05-02-p7-60-statement-map.json`
- `reports/capacity/evidence/2026-05-02-p7-60-tail-classification.md`
- `reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

P6 handoff ambiguity was already repaired in the earlier P7 merge by marking `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-diagnostic-decision.md` as historical pre-approval evidence superseded by the approved P6 run report and path decision.

## Implementation

P7 selected two safe statement families from the P6 statement-family summary:

1. `account-row-selected-learner`
2. `demo-active-account-guard`

The implementation passes the existing authenticated `ensureAccount()` row into bootstrap and uses the already-authenticated demo account snapshot before falling back to the existing D1 demo-active guard.

Observed effect on the P6 target path:

- P6 approved production full-bootstrap query count P95: 11.
- P7 post-change production full-bootstrap query count P95: 9.
- P6 approved production D1 rows read P95: 9.
- P7 post-change production D1 rows read P95: 7.
- D1 writes remain 0.
- Bootstrap capacity metadata remains present.
- Public capacity mode remains `public-bounded`.
- Bootstrap mode remains `selected-learner-bounded`.

## Diagnostic Evidence

Deployed single-demo confirmation:

- `reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json`
- production demo session returned HTTP 201;
- production `GET /api/bootstrap` returned HTTP 200;
- `meta.capacity.queryCount` was 9;
- `meta.capacity.d1RowsWritten` was 0.

Approved 60-learner production diagnostic:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- expected requests: 260
- observed requests: 260
- HTTP 200 responses: 260
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

Threshold outcome:

| Threshold | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 489.2 ms | passed |
| Command P95 wall time | 400 ms | 332.1 ms | passed |
| Max response bytes | 600000 bytes | 30165 bytes | passed |

Tail and statement evidence:

- top-tail invocation coverage: 10/10;
- top-tail statement-log coverage: 10/10;
- join warnings: 0;
- total requests with statement logs: 260/260;
- statement coverage ratio: 1.0;
- truncated requests: 0;
- statement-map recommendation status: `no-query-plan-recommendations`.

## Route-Cost And Budget

The route-cost evidence was regenerated from the P7 diagnostic and P7 tail correlation only, so the post-change budget no longer max-merges older P6 route-cost values into the full-bootstrap lane.

The diagnostic bootstrap P95 threshold result remains 489.2 ms across all bootstrap requests. The route-cost full-bootstrap `wallMsP95` is 615.4 ms because the route-cost refresh conservatively merges the retained top-tail Worker correlation sample into the route-family model.

Coverage:

| Route family | Status | Note |
| --- | --- | --- |
| `full-bootstrap` | measured | P7 post-change metrics are complete. |
| `grammar-command` | partial | Capacity-run metrics are present; Worker CPU and D1 duration joins remain incomplete for this command route. |
| `not-modified-bootstrap` | requires-production-operator | The approved 60-run shape did not exercise `POST /api/bootstrap` with `lastKnownRevision`. |
| Remaining route families | gated or missing | Explicitly represented as non-certifying gaps. |

The regenerated 1000-learner budget remains `modellingOnly: true` and `certifying: false`. The expected 1000-learner scenario still fails D1 rows read and D1 rows written as lower-bound modelling risks.

## Verification

Completed verification:

```sh
node --test tests/worker-bootstrap-capacity.test.js tests/worker-bootstrap-v2.test.js tests/worker-bootstrap-multi-learner-regression.test.js tests/worker-query-budget.test.js tests/capacity-statement-map.test.js tests/capacity-statement-family-summary.test.js tests/capacity-worker-log-join.test.js tests/capacity-budget-ledger.test.js tests/capacity-evidence.test.js tests/capacity-evidence-schema.test.js tests/verify-capacity-evidence.test.js tests/admin-production-evidence.test.js
node --test tests/capacity-route-cost-diagnostic.test.js tests/capacity-budget-ledger.test.js
npm run capacity:verify-evidence
npm test
npm run check
```

Results:

- focused P7/capacity suite: passed, 276 tests, 0 failures;
- route-cost/budget suite: passed, 22 tests, 0 failures;
- capacity evidence verifier: passed, 5 rows checked;
- full test suite: passed, 21,522 tests, 0 failures, 6 skipped;
- dry-run deploy check: passed, including build and client bundle audit.

## Independent Review Closure

James required two independent reviews before commit, PR, and merge. Both are closed:

- Engineering reviewer: no blockers; independently reran the route-cost/budget tests, capacity evidence verifier, and whitespace check.
- Contract reviewer: no blockers; confirmed the P7, P6, and P5 boundaries are preserved. The low packaging note is handled by including every referenced evidence artefact in this commit, and the low route-cost P95 clarity note is captured in the Route-Cost And Budget section above.

## Certification Boundary

30 learners remain `30-learner-beta-certified`.

60 learners remain uncertified.

1000 learners remain modelling-only and non-certifying.

P7 must not be described as public 60-learner certification. It supports only repeat-governance consideration after one passing post-change run.

## Remaining Evidence Boundary

The following route-cost item remains intentionally open:

- `not-modified-bootstrap` remains `requires-production-operator` until a production run explicitly exercises `POST /api/bootstrap` with `lastKnownRevision`.

The current path decision is therefore `p8g-60-repeat-governance-candidate`.
