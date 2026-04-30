---
title: "System Hardening Optimisation P5 — 60-Learner Diagnostic Decision"
type: decision-record
status: complete
date: 2026-04-30
phase: P5
classification: 60-diagnostic-setup-blocked
certifying: false
language: en-GB
---

# System Hardening Optimisation P5 — 60-Learner Diagnostic Decision

## 1. Source Boundary

This decision is bound to `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p5.md`, the repaired operator checklist, and the P5 diagnostic planners. It does not include a completed live production 60-learner load run.

The autonomous run repaired and validated the command contracts, but did not start production traffic because explicit production-run approval and a live raw Worker tail capture window were not available.

## 2. Run ID and Evidence Artefacts

Run id: `2026-04-30-p5-60-diagnostic`

Expected live-run artefacts:

- `reports/capacity/evidence/2026-04-30-p5-60-diagnostic.json`
- `reports/capacity/evidence/2026-04-30-p5-60-tail-correlation.json`
- `reports/capacity/evidence/2026-04-30-p5-60-statement-map.json`
- `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`

Committed blocked-run artefact:

- `reports/capacity/evidence/2026-04-30-p5-60-tail-classification.md`

## 3. Did the Run Reach Application Load?

No. The run stopped before production app-load by design. P5 now has an executable command plan, but production execution requires explicit approval, session-manifest preparation, and Worker JSON tail capture started before the load run.

## 4. Did Thresholds Pass?

Not measured. The threshold config remains `reports/capacity/configs/60-learner-stretch.json`; no threshold relaxation was made.

## 5. Tail Sample Classification

Classification: `60-diagnostic-setup-blocked`

No tail samples were collected in this autonomous run. The blocker is setup/telemetry capture, not an application-load performance result.

## 6. Query, Row, Write, and Payload Summary

No 60-learner query, row, write, or payload measurements were produced because the live run did not start.

The current route-cost evidence instead records a separate non-certifying route-cost diagnostic in `reports/capacity/evidence/2026-04-30-p5-route-costs.json`.

## 7. Worker CPU and Wall Summary

No 60-learner Worker CPU/wall samples were produced. Existing redacted P3 bootstrap tail correlation was integrated into the non-certifying route-cost model, but it is not a P5 60-learner diagnostic sample.

## 8. Is 60-Learner Certification Still Blocked?

Yes. 60 learners are not certified. A separate repeat policy and reviewed certification decision would still be required even after a positive diagnostic.

## 9. Chosen Next Path

P5 continuation: run the approved production diagnostic with the repaired checklist and planner once production approval and Worker tail capture are available.

## 10. Rejected Alternatives

- Claiming 60 learners are supported: rejected because no P5 60-learner app-load run completed.
- Certifying 60 learners from one future positive diagnostic: rejected by the P5 governance boundary.
- Moving directly to D1/query/cache optimisation: rejected because the 60-learner bottleneck has not been classified.
- Moving directly to write compaction: rejected because route-cost coverage remains incomplete and the 60-learner diagnostic did not reach app-load.
