---
title: "System Hardening Optimisation P4 — Capacity Status Report"
type: status-report
status: complete
date: 2026-04-30
phase: P4
decision: "30-learner-beta-certified"
---

# P4 Capacity Status Report — 30-Learner Beta Promotion

## Decision

Public capacity status promoted from `small-pilot-provisional` to `30-learner-beta-certified`.

## Evidence Row

| Field | Value |
|-------|-------|
| Date | 2026-04-30 |
| Commit | 3af2b44beaf3b89e476b1eb837569e30dc1717fb |
| Environment | production |
| Plan | 30-learner-beta P3-T5 strict repeat 2 |
| Learners | 30 |
| Bootstrap burst | 20 |
| Rounds | 1 |
| Bootstrap P95 | 715.2 ms (ceiling: 1,000 ms, headroom: 28.5%) |
| Command P95 | 279.7 ms (ceiling: 750 ms, headroom: 62.7%) |
| Max response bytes | 29,597 B (ceiling: 600,000 B) |
| 5xx | 0 |
| Capacity signals | none |
| Decision | `30-learner-beta-certified` |
| Evidence | `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json` |

## Verifier Result

`npm run capacity:verify-evidence` passes without `CAPACITY_VERIFY_SKIP_ANCESTRY`. All 5 rows verified. The promoted row accepted under full schema v3 verification including commit existence probe and arithmetic identity check.

## Summary Regeneration

`reports/capacity/latest-evidence-summary.json` updated:
- `certified_30_learner_beta.certifying`: `true`
- `certified_30_learner_beta.status`: `passed`
- `certified_30_learner_beta.certificationEligible`: `true`
- `certified_30_learner_beta.verifiedCapacityRowDecision`: `30-learner-beta-certified`

## Admin Production Evidence

Admin model `classifyEvidenceMetric()` returns `CERTIFIED_30` for the promoted metric. The capacity_certification lane displays green. Diagnostic-only artefacts (`*-tail-correlation.json`) remain classified as `UNKNOWN` and cannot produce certification state.

## Boundaries Preserved

- 60+ learners: unclaimed, pending diagnostic
- 1000-learner budget: `modellingOnly: true`, `certifying: false`
- Threshold configs: unchanged
- Runtime code: unchanged
- P2 failed rows: preserved as historical audit trail

## Commit Provenance Note

The original `reportMeta.commit` (`b469e585...`) was a pre-squash production deploy commit that does not exist in the repo object store. Updated to `3af2b44b...` (the squash-merge commit that landed P3 evidence into main). The production Worker code at time of the run was equivalent — this is provenance alignment, not evidence fabrication.
