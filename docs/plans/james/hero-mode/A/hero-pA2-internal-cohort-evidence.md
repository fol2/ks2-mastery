# Hero Mode pA2 — Internal Cohort Evidence

**Phase:** A2 Ring A2-2 + A2-3
**Date:** 2026-04-30
**Status:** A2-3 SIMULATION ACCEPTED; REAL COHORT LIMITED

## Cohort Configuration

- Internal accounts: `adult-d9BHpWh3iAL4b5qB`, `adult-2dT1zFI9zZQ_p1Zs`, `adult-9jXhUwpAdIrKB_g5`, `adult-U55c3y_goAFsgkIH`
- Observation start: 2026-04-30
- Minimum duration: 5 calendar days
- Minimum date keys: 2

## Evidence Boundary

The 2026-04-30 row is real production A2-2 enablement evidence from PR #704.
The 2026-05-01 through 2026-05-04 rows are operator-accepted simulation rows from issue #684.
They are recorded to complete the A2-3 decision gate after operator confirmation, but they are not elapsed real calendar production observations.

## Observation Log

| Date | Learner | Readiness | Balance Bucket | Ledger Entries | Reconciliation | Override | Source | Status |
|------|---------|-----------|----------------|----------------|----------------|----------|--------|--------|
| 2026-04-30 | learner-mog9aal4-p1f8xbmp | ready | 0 | 0 | no-gap | override-active | real-production | OK |
| 2026-05-01 | learner-mog9aal4-p1f8xbmp | ready | 0 | 0 | no-gap | override-active | simulation | SIMULATION-OK |
| 2026-05-02 | learner-mog9aal4-p1f8xbmp | ready | 0 | 0 | no-gap | override-active | simulation | SIMULATION-OK |
| 2026-05-03 | learner-mog9aal4-p1f8xbmp | ready | 0 | 0 | no-gap | override-active | simulation | SIMULATION-OK |
| 2026-05-04 | learner-mog9aal4-p1f8xbmp | ready | 0 | 0 | no-gap | override-active | simulation | SIMULATION-OK |

> **A3 provenance annotation (added 2026-04-30):** The `Source` column was added retroactively during pA3 Ring A3-0 drift reconciliation. Row 1 is `real-production` (verified against live production Worker via PR #704). Rows 2-5 are `simulation` (operator-accepted modelled outcomes from issue #684, not elapsed real calendar observations).

## Stop Conditions

| Condition | Observed | Date | Details |
|-----------|----------|------|---------|
| Duplicate daily award | No | | No stop condition in the real A2-2 row; simulated A2-3 rows also modelled none |
| Negative balance | No | | No stop condition in the real A2-2 row; simulated A2-3 rows also modelled none |
| Dead CTA | No | | No stop condition in the real A2-2 row; simulated A2-3 rows also modelled none |
| Privacy violation | No | | No stop condition in the real A2-2 row; simulated A2-3 rows also modelled none |
| Reconciliation gap | No | | No stop condition in the real A2-2 row; simulated A2-3 rows also modelled none |
