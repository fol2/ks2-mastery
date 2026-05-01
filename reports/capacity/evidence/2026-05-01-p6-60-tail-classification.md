---
title: "P6 60-Learner Approved Diagnostic Tail Classification"
type: capacity-tail-classification
date: 2026-05-01
run_id: 2026-05-01-p6-60-diagnostic
classification: 60-diagnostic-threshold-failed
certifying: false
modellingOnly: false
diagnosticOnly: true
---

# P6 60-Learner Approved Diagnostic Tail Classification

## Source Boundary

This classification covers the approved 60-learner production diagnostic run against:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- diagnostic evidence: `reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json`
- redacted tail correlation: `reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json`
- redacted statement map: `reports/capacity/evidence/2026-05-01-p6-60-statement-map.json`

Raw Worker tail JSONL was captured outside the repository at `/tmp/ks2-p6-60-worker-tail.jsonl` and must not be committed.

## Run Outcome

The run reached production app-load and completed all expected requests:

- expected requests: 260
- observed requests: 260
- status counts: 260 x HTTP 200
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

## Threshold Result

The run failed the configured 60-learner stretch threshold:

| Threshold | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 1057.3 ms | failed |
| Command P95 wall time | 400 ms | 383.8 ms | passed |
| Max response bytes | 600000 bytes | 29602 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

Classification: `60-diagnostic-threshold-failed`

## Tail Join Result

The redacted Worker tail join completed with no warnings:

- top-tail samples: 10
- invocation matches: 10/10
- statement-log matches: 10/10

Top-tail classification counts:

- `d1-dominated`: 8
- `worker-cpu-dominated`: 2

## Statement Map Result

The statement map coverage is complete:

- total requests: 260
- requests with statement logs: 260
- missing statement-log requests: 0
- truncated requests: 0
- observed statements: 4484
- statement coverage ratio: 1.0

The statement map can support query-shape recommendations, but the redacted statement identifiers must remain opaque.

## Certification Boundary

This artefact does not certify 60 learners.

The approved run is telemetry-complete, but it failed the bootstrap P95 threshold. It is therefore diagnostic evidence for the next optimisation phase, not a certification candidate.
