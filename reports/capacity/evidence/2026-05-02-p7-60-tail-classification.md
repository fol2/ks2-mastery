---
title: "P7 60-Learner Post-Change Diagnostic Tail Classification"
type: capacity-tail-classification
date: 2026-05-02
run_id: 2026-05-02-p7-60-diagnostic
classification: positive-single-run
certifying: false
modellingOnly: false
diagnosticOnly: true
---

# P7 60-Learner Post-Change Diagnostic Tail Classification

## Source Boundary

This classification covers the approved P7 post-change 60-learner production diagnostic run against:

- origin: `https://ks2.eugnel.uk`
- learners: 60
- bootstrap burst: 20
- rounds: 1
- threshold config: `reports/capacity/configs/60-learner-stretch.json`
- diagnostic evidence: `reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json`
- redacted tail correlation: `reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json`
- redacted statement map: `reports/capacity/evidence/2026-05-02-p7-60-statement-map.json`

Raw Worker tail JSONL was captured outside the repository at `/tmp/ks2-p7-60-worker-tail.jsonl` and must not be committed.

## Run Outcome

The run reached production app-load and completed all expected requests:

- expected requests: 260
- observed requests: 260
- status counts: 260 x HTTP 200
- 5xx responses: 0
- network failures: 0
- capacity signals: 0

## Threshold Result

The run passed the configured 60-learner stretch thresholds:

| Threshold | Limit | Observed | Result |
| --- | ---: | ---: | --- |
| Bootstrap P95 wall time | 750 ms | 489.2 ms | passed |
| Command P95 wall time | 400 ms | 332.1 ms | passed |
| Max response bytes | 600000 bytes | 30165 bytes | passed |
| 5xx responses | 0 | 0 | passed |
| Network failures | 0 | 0 | passed |
| Capacity signals | 0 | 0 | passed |

Classification: `positive-single-run`

## Tail Join Result

The redacted Worker tail join completed with no warnings:

- top-tail samples: 10
- invocation matches: 10/10
- statement-log matches: 10/10

Top-tail classification counts:

- `client-network-or-platform-overhead`: 8
- `d1-dominated`: 1
- `worker-cpu-dominated`: 1

Because the threshold gate passed, these top-tail classifications are diagnostic context rather than a failed-run blocker.

## Statement Map Result

The statement map coverage is complete:

- total requests: 260
- requests with statement logs: 260
- missing statement-log requests: 0
- truncated requests: 0
- observed statements: 4330
- statement coverage ratio: 1.0

The statement map does not produce a new query-plan recommendation for this passing run.

## Certification Boundary

This artefact does not certify 60 learners.

The approved run passed once with complete telemetry. Under the P7 contract, one passing post-change 60-learner diagnostic moves the work to repeat-governance consideration, not public 60-learner certification.
