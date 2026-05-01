---
title: "System Hardening Optimisation P6 — Approved 60-Learner Run Report"
type: diagnostic-report
status: completed-threshold-failed
date: 2026-05-01
phase: P6
run_id: 2026-05-01-p6-60-diagnostic
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6.md
  - reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-01-p6-60-statement-map.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-classification.md
---

# System Hardening Optimisation P6 — Approved 60-Learner Run Report

## Approval Boundary

James explicitly approved the operator-gated 60-learner production diagnostic on 2026-05-01.

That approval authorised the production diagnostic run. It did not, by itself, certify 60 learners.

## Execution Summary

The approved run completed:

- run id: `2026-05-01-p6-60-diagnostic`
- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- started at: `2026-05-01T13:07:38.685Z`
- finished at: `2026-05-01T13:08:54.588Z`

The session manifest was prepared outside the repository at `/tmp/ks2-p6-60-manifest.json`.

Raw Worker tail JSONL was captured outside the repository at `/tmp/ks2-p6-60-worker-tail.jsonl`. It is not commit-eligible.

## Request Outcome

The load driver completed every planned request:

- expected requests: 260
- observed requests: 260
- HTTP 200 responses: 260
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

## Threshold Outcome

The run failed the 60-learner stretch gate:

| Threshold | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 1057.3 ms | failed |
| Command P95 wall time | 400 ms | 383.8 ms | passed |
| Max response bytes | 600000 bytes | 29602 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

The diagnostic evidence is therefore `ok: false`.

## Tail And Statement Evidence

The redacted Worker tail correlation completed with no warnings:

- top-tail samples: 10
- invocation matches: 10/10
- statement-log matches: 10/10
- `d1-dominated`: 8
- `worker-cpu-dominated`: 2

The statement map is complete:

- total requests: 260
- requests with statement logs: 260
- missing statement-log requests: 0
- truncated requests: 0
- observed statement total: 4484
- statement coverage ratio: 1.0

## Certification Decision

60 learners are not certified.

The run reached production app-load and produced telemetry-complete evidence, but it failed the bootstrap P95 threshold. A failed diagnostic cannot become a certification candidate.

## P7 Direction

The primary next path is:

`P7A — Bootstrap/D1 query-shape and cache-contract optimisation`

Reason: the failed top-tail bootstrap samples are mostly D1 dominated, with complete statement-map coverage and bootstrap D1 duration P95 at 597.6092 ms.

Rejected alternatives:

- `P7G — 60-learner repeat governance`: rejected because the diagnostic failed.
- `P7B — Worker CPU/JSON`: rejected as primary because top-tail classification is mostly D1 dominated and Worker CPU P95 for full bootstrap is 21 ms, while D1 duration is the dominant latency component.
- `P6 continuation`: rejected because the live diagnostic and telemetry join are now complete.

## Commit Boundary

Commit only the redacted diagnostic evidence, redacted correlation, statement map, classification, route-cost aggregate and updated modelling budget.

Do not commit `/tmp/ks2-p6-60-manifest.json` or `/tmp/ks2-p6-60-worker-tail.jsonl`.
