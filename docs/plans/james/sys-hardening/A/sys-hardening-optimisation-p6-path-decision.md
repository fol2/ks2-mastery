---
title: "System Hardening Optimisation P6 — Path Decision"
type: decision-record
status: complete
date: 2026-05-01
phase: P6
exit_state: p7a-bootstrap-d1-selected
certifying: false
language: en-GB
source_context:
  - docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md
  - reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json
  - reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json
  - reports/capacity/evidence/2026-05-01-p6-60-statement-map.json
  - reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json
  - reports/capacity/latest-1000-learner-budget.json
---

# System Hardening Optimisation P6 — Path Decision

## Evidence Boundary

Inputs:

- `docs/plans/james/sys-hardening/A/sys-hardening-optimisation-p6-60-approved-run-report.md`
- `reports/capacity/evidence/2026-05-01-p6-60-diagnostic.json`
- `reports/capacity/evidence/2026-05-01-p6-60-tail-correlation.json`
- `reports/capacity/evidence/2026-05-01-p6-60-statement-map.json`
- `reports/capacity/evidence/2026-05-01-p6-60-tail-classification.md`
- `reports/capacity/evidence/2026-05-01-p6-route-costs-after-60-diagnostic.json`
- `reports/capacity/latest-1000-learner-budget.json`
- `docs/operations/capacity-1000-learner-free-tier-budget.md`

The budget remains `modellingOnly: true` and `certifying: false`. It is not production certification evidence.

## Required Questions

1. **Did the 60-learner diagnostic reach production app-load?**
   Yes. The approved 2026-05-01 run completed 260/260 expected production requests.

2. **Did it pass the 60-learner diagnostic thresholds?**
   No. Bootstrap P95 wall time was 1057.3 ms against the configured 750 ms limit. Command P95, response bytes, 5xx, network failures and capacity signals passed.

3. **Were Worker CPU/wall samples joined for top-tail requests?**
   Yes. The redacted Worker tail join matched invocation and statement logs for 10/10 retained top-tail samples with no warnings.

4. **Were D1 statement maps complete enough to classify D1 cost?**
   Yes. The statement map covered 260/260 requests, observed 4484/4484 expected statements, and reported no truncation.

5. **Which route family dominates latency risk?**
   Full bootstrap. The failed threshold was bootstrap P95, and the top-tail classification was mostly `d1-dominated`.

6. **Which route family dominates D1 read risk?**
   Full bootstrap dominates the immediate failed 60-learner diagnostic. The wider 1000-learner model still shows command traffic as a major lower-bound D1 read contributor, but the 60-learner certification blocker is bootstrap latency.

7. **Which route family dominates D1 write risk?**
   Command traffic remains the 1000-learner write-budget risk, but D1 writes did not drive the failed 60-learner diagnostic. Grammar command P95 passed at 383.8 ms.

8. **Does the expected 1000-learner scenario still fail D1 rows written?**
   Yes. Expected 1000-learner D1 rows written remain red and lower-bound in the regenerated non-certifying model.

9. **Does the expected 1000-learner scenario still fail D1 rows read?**
   Yes. Expected 1000-learner D1 rows read remain red and lower-bound in the regenerated non-certifying model.

10. **Is Worker CPU still red, partial or unknown?**
    Partial. The approved run measured full-bootstrap Worker CPU for retained top-tail samples, but non-bootstrap Worker CPU coverage remains incomplete. The failed 60-learner gate is better explained by D1/bootstrap latency than by Worker CPU alone.

11. **Which optimisation path should be P7?**
    `P7A — Bootstrap/D1 query-shape and cache-contract optimisation`.

## Selected Exit State

`p7a-bootstrap-d1-selected`

The approved production run is telemetry-complete, but it failed the 60-learner stretch threshold. The selected next path is bootstrap/D1 optimisation, not certification.

## Rejected Alternatives

- **P7G — Repeat-policy governance for 60-learner certification candidate:** rejected because the approved diagnostic failed the bootstrap P95 threshold.
- **P7B — Worker CPU, JSON construction and response rewrite reduction:** rejected as the primary path because top-tail classification was 8 `d1-dominated` and 2 `worker-cpu-dominated`.
- **P7D — Command write-amplification and batching design:** rejected as the immediate 60-learner certification blocker because command P95 passed. It remains relevant to the non-certifying 1000-learner budget.
- **P6 continuation:** rejected because the approved diagnostic, Worker tail join and statement map are now complete.

## Next Action

Start P7A with a narrow bootstrap/D1 query-shape and cache-contract plan. Keep 60 learners uncertified until a post-optimisation diagnostic passes and repeat-governance evidence exists.
