---
title: "System Hardening Optimisation P7 - 60-Learner Diagnostic Decision"
type: decision-record
status: positive-single-run
date: 2026-05-02
phase: P7
run_id: 2026-05-02-p7-60-diagnostic
exit_state: p8g-60-repeat-governance-candidate
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
  - reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json
  - reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-02-p7-60-statement-map.json
  - reports/capacity/evidence/2026-05-02-p7-60-tail-classification.md
  - reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P7 - 60-Learner Diagnostic Decision

## Decision

Selected exit state: `p8g-60-repeat-governance-candidate`.

The approved post-change 60-learner production diagnostic passed once with complete top-tail invocation and statement-log coverage. This is a positive P7 outcome, but it is not a public 60-learner certification event.

## Run Shape

| Field | Value |
| --- | --- |
| Origin | `https://ks2.eugnel.uk` |
| Learners | 60 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Session source | manifest |
| Threshold config | `reports/capacity/configs/60-learner-stretch.json` |
| Started | `2026-05-02T06:38:52.944Z` |
| Finished | `2026-05-02T06:39:48.243Z` |

## Threshold Outcome

| Metric | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 489.2 ms | passed |
| Command P95 wall time | 400 ms | 332.1 ms | passed |
| Max response bytes | 600000 bytes | 30165 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

The run completed 260/260 expected requests, all HTTP 200.

## Bootstrap Evidence

| Metric | P6 approved run | P7 post-change run | Direction |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 1057.3 ms | 489.2 ms | improved |
| Bootstrap max wall time | 1128.8 ms | 615.4 ms | improved |
| Server wall P95 | 903 ms | 301 ms | improved |
| Query count P95 | 11 | 9 | reduced |
| D1 rows read P95 | 9 | 7 | reduced |
| D1 rows written P95 | 0 | 0 | preserved |
| Response bytes P95 | 2449 bytes | 2448 bytes | preserved |

Bootstrap mode remained `selected-learner-bounded`, and capacity mode remained `public-bounded`.

## Tail And Statement Coverage

The redacted tail correlation has complete retained top-tail coverage:

- invocation coverage: 10/10
- statement-log coverage: 10/10
- join warnings: 0

Top-tail classification counts:

- `client-network-or-platform-overhead`: 8
- `d1-dominated`: 1
- `worker-cpu-dominated`: 1

The statement map is complete:

- total requests: 260
- statement-log requests: 260
- observed statements: 4330
- statement coverage ratio: 1.0
- truncated requests: 0

## Route-Cost And Budget Outcome

P7 route-cost evidence was regenerated from the P7 diagnostic and P7 tail correlation only:

- `reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json`

The refreshed route-cost state is:

| Route family | Status | Important note |
| --- | --- | --- |
| `full-bootstrap` | measured | P7 post-change metrics are present. |
| `grammar-command` | partial | Capacity-run metrics are present, but command top-tail Worker CPU/D1 duration is not fully joined by the bootstrap-focused tail correlation. |
| `not-modified-bootstrap` | requires-production-operator | The approved 60-run shape did not exercise `POST /api/bootstrap` with `lastKnownRevision`. |
| Remaining route families | gated or missing | Coverage remains explicit and non-certifying. |

The 1000-learner budget was regenerated and remains `modellingOnly: true` and `certifying: false`. The expected 1000-learner scenario still fails D1 rows read and D1 rows written as lower-bound modelling risks.

## Required Answers

1. **Did P7 reduce full-bootstrap D1 statement count or D1 duration?**
   Yes. Query count P95 reduced from 11 to 9, D1 rows read P95 reduced from 9 to 7, and route-cost D1 duration P95 for full bootstrap is 170.5609 ms in the post-change evidence.

2. **Did the post-change 60-learner run pass the bootstrap P95 threshold?**
   Yes. Bootstrap P95 was 489.2 ms against a 750 ms limit.

3. **Did Worker CPU become the new dominant blocker?**
   No blocker is selected from this passing run. One retained top-tail sample classified as `worker-cpu-dominated`, but the run passed and eight retained top-tail samples classified as `client-network-or-platform-overhead`.

4. **Did any route-cost/budget risk worsen?**
   No P7 worsening is shown for full bootstrap. Route-family coverage remains incomplete, and `not-modified-bootstrap` remains explicitly gated because the approved 60-run shape did not measure it.

5. **Is 60 learners still uncertified?**
   Yes. 60 learners remain uncertified.

6. **What is the next phase?**
   Repeat-governance consideration: repeat the same 60-learner shape under the governance policy before any public capacity promotion is proposed.

## Rejected Decisions

- Public 60-learner certification: rejected because a single passing P7 run is not sufficient.
- `p8a-bootstrap-d1-continuation`: rejected as the immediate next step because the P7 post-change diagnostic passed the failed P6 bootstrap gate.
- `p8b-worker-cpu-json-selected`: rejected because Worker CPU did not become a failed-run blocker.
- `p8c-payload-reduction`: rejected because response bytes stayed far below the configured limit.
- `p8f-platform-investigation`: not selected as a blocking phase because the run passed, though platform overhead remains useful context for repeat governance.
