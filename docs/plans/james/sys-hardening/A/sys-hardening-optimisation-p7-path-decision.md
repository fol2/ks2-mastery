---
title: "System Hardening Optimisation P7 - Path Decision"
type: decision-record
status: repeat-governance-candidate
date: 2026-05-02
phase: P7
exit_state: p8g-60-repeat-governance-candidate
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-baseline.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-statement-family-summary.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-post-change-run-report.md
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p7-60-diagnostic-decision.md
  - reports/capacity/evidence/2026-05-01-p7-statement-family-summary.json
  - reports/capacity/evidence/2026-05-02-p7-production-bootstrap-probe.json
  - reports/capacity/evidence/2026-05-02-p7-60-diagnostic.json
  - reports/capacity/evidence/2026-05-02-p7-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-02-p7-60-statement-map.json
  - reports/capacity/evidence/2026-05-02-p7-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P7 - Path Decision

## Decision

Selected exit state: `p8g-60-repeat-governance-candidate`.

P7 now has a reviewed and merged narrow implementation, local query-count proof, deployed single-demo confirmation, and one approved post-change 60-learner production diagnostic pass with complete retained top-tail telemetry.

This is not public 60-learner certification. The next step is repeat governance for the same 60-learner shape.

## Required Questions

1. **Did P7 reduce full-bootstrap D1 statement count or D1 duration?**
   Yes. The production 60-run observed full-bootstrap query count P95 of 9, down from 11 in the P6 approved run. D1 rows read P95 reduced from 9 to 7. The refreshed P7 route-cost artefact records full-bootstrap D1 duration P95 of 170.5609 ms.

2. **Did the post-change 60-learner run pass the bootstrap P95 threshold?**
   Yes. Bootstrap P95 was 489.2 ms against the 750 ms limit.

3. **Did Worker CPU become the new dominant blocker?**
   No blocker is selected from this passing run. One retained top-tail sample classified as `worker-cpu-dominated`; eight classified as `client-network-or-platform-overhead`; the threshold gate passed.

4. **Did any route-cost/budget risk worsen?**
   No full-bootstrap worsening is shown. The refreshed route-cost artefact is intentionally post-P7 only, so it measures `full-bootstrap`, partially measures `grammar-command`, and leaves unmeasured route families explicit. `not-modified-bootstrap` remains `requires-production-operator` because the approved 60-run shape did not exercise `POST /api/bootstrap` with `lastKnownRevision`.

5. **Is 60 learners still uncertified?**
   Yes. 60 learners remain uncertified.

6. **What is the next phase?**
   Repeat-governance consideration for the same 60-learner shape. A separate governance PR must decide whether repeated evidence is enough to promote any public wording.

## Rejected Decisions

- Public 60-learner certification: rejected because P7 permits only repeat-governance after one passing post-change run.
- `p8a-bootstrap-d1-continuation`: rejected as the immediate path because the P7 post-change run passed the previously failed bootstrap P95 gate.
- `p8b-worker-cpu-json-selected`: rejected because Worker CPU is not a failed-run blocker.
- `p8c-payload-reduction`: rejected because response bytes remain far below the configured threshold.
- `p8f-platform-investigation`: not selected as a blocker because the run passed, though platform overhead remains useful repeat-governance context.

## Certification Boundary

30 learners remain `30-learner-beta-certified`.

60 learners remain uncertified.

1000 learners remain modelling-only and non-certifying.
