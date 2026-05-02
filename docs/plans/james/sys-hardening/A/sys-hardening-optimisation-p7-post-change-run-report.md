---
title: "System Hardening Optimisation P7 - Post-Change Run Report"
type: diagnostic-report
status: post-change-diagnostic-captured
date: 2026-05-02
phase: P7
run_id: 2026-05-02-p7-60-diagnostic
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
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

# System Hardening Optimisation P7 - Post-Change Run Report

## Run Boundary

The approved P7 post-change 60-learner production diagnostic has been captured.

Run shape:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- session source: manifest
- started: `2026-05-02T06:38:52.944Z`
- finished: `2026-05-02T06:39:48.243Z`

Evidence paths:

- `reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json`
- `reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json`
- `reports/capacity/evidence/2026-05-02-p7-60-statement-map.json`
- `reports/capacity/evidence/2026-05-02-p7-60-tail-classification.md`

Raw Worker tail JSONL stayed outside the repository at `/tmp/ks2-p7-60-worker-tail.jsonl`.

## Deployed Merge Confirmation

Before the 60-learner diagnostic, a same-origin deployed demo bootstrap probe confirmed the merged Worker query shape:

- `reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json`

Observed production result:

| Metric | Observed |
| --- | ---: |
| Demo session HTTP status | 201 |
| Bootstrap HTTP status | 200 |
| Full-bootstrap query count | 9 |
| D1 rows written | 0 |
| Response learners | 1 |

Observed production mode:

- bootstrap mode: `selected-learner-bounded`
- capacity mode: `public-bounded`
- capacity version: 4

## 60-Learner Diagnostic Outcome

The run completed all expected requests:

| Metric | Observed |
| --- | ---: |
| Expected requests | 260 |
| Observed requests | 260 |
| HTTP 200 responses | 260 |
| 5xx responses | 0 |
| Network failures | 0 |
| Capacity signals | 0 |

Configured threshold result:

| Threshold | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 489.2 ms | passed |
| Command P95 wall time | 400 ms | 332.1 ms | passed |
| Max response bytes | 600000 bytes | 30165 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

## Bootstrap Shape

| Metric | P6 approved production shape | P7 post-change production shape | Status |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 1057.3 ms | 489.2 ms | improved |
| Bootstrap max wall time | 1128.8 ms | 615.4 ms | improved |
| Server wall P95 | 903 ms | 301 ms | improved |
| Full-bootstrap query count P95 | 11 | 9 | reduced |
| D1 rows read P95 | 9 | 7 | reduced |
| D1 rows written P95 | 0 | 0 | preserved |
| Response bytes P95 | 2449 bytes | 2448 bytes | preserved |

Bootstrap mode remained `selected-learner-bounded`. Capacity mode remained `public-bounded`.

## Tail And Statement Evidence

The redacted Worker tail join completed with no warnings:

- retained top-tail samples: 10
- invocation matches: 10/10
- statement-log matches: 10/10

Top-tail classification counts:

- `client-network-or-platform-overhead`: 8
- `d1-dominated`: 1
- `worker-cpu-dominated`: 1

The statement map is complete:

- total requests: 260
- requests with statement logs: 260
- missing statement-log requests: 0
- truncated requests: 0
- observed statements: 4330
- statement coverage ratio: 1.0

The statement map has `recommendationStatus: no-query-plan-recommendations` for this passing run.

## Route-Cost And Budget Refresh

Route-cost evidence was regenerated from the P7 diagnostic and P7 tail correlation:

- `reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json`

The diagnostic bootstrap P95 threshold result remains 489.2 ms across all bootstrap requests. The route-cost full-bootstrap `wallMsP95` is 615.4 ms because the route-cost refresh conservatively merges the retained top-tail Worker correlation sample into the route-family model.

Coverage:

| Route family | Status | Note |
| --- | --- | --- |
| `full-bootstrap` | measured | P7 post-change metrics are complete. |
| `grammar-command` | partial | Capacity-run metrics are present; Worker CPU/D1 duration metrics remain missing for the command route. |
| `not-modified-bootstrap` | requires-production-operator | The approved 60-run shape did not exercise `POST /api/bootstrap` with `lastKnownRevision`. |
| Remaining route families | gated or missing | Explicitly represented as non-certifying gaps. |

The 1000-learner budget artefacts were regenerated:

- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

They remain `modellingOnly: true` and `certifying: false`. The expected 1000-learner scenario still fails D1 rows read and D1 rows written as lower-bound modelling risks.

## Certification Boundary

60 learners remain uncertified.

This is a positive single diagnostic run. It creates a repeat-governance candidate and does not change the public capacity status.
