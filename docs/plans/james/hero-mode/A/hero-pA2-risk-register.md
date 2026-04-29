# Hero Mode pA2 — Risk Register

**Phase:** A2 (Internal Cohort Measurement)
**Date:** 2026-04-30
**Status:** ACTIVE

## Risk Matrix

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|------------|--------|
| 1 | D1 tail latency variance (P95 = 4.2× P50) | Certain | Low | Accept as platform characteristic; do not set tight P95 thresholds | ACCEPTED |
| 2 | Grammar breadth-maintenance dead CTA | Eliminated | — | Fixed by PR #663 (mini-test → satsset mapping) | RESOLVED |
| 3 | Privacy validator misses nested fields | Eliminated | — | Fixed by PR #660 (recursive validation with depth limit) | RESOLVED |
| 4 | Internal cohort too small for meaningful baselines | Medium | Medium | Accept insufficient_data honestly; recommend extended observation in A3 | ACCEPTED |
| 5 | Duplicate daily coin award under concurrent tabs | Low | High | Three-tier idempotency proven in P4; verify during cohort | MONITORING |
| 6 | Camp debit race under refresh | Low | High | Deterministic entry ID + stale-write retry proven in P5; verify during cohort | MONITORING |
| 7 | Rollback cannot preserve dormant state | Very Low | Critical | Proven in pA1 Ring 1 (PR #617); re-verify post-cohort | MONITORING |
| 8 | Non-internal accounts see Hero surfaces | Very Low | Critical | Override mechanism proven (PRs #620, #627, #671); ops probe shows override status | MONITORING |
| 9 | Telemetry sink not receiving events | Low | Medium | Ops probe verifies event count; cohort smoke script detects gaps | MONITORING |
| 10 | Raw child content in metrics/ops output | Very Low | High | Recursive privacy validator + output stripping (PRs #660, #662) | RESOLVED |

## Residual Risks for A3

If A2 proceeds to A3 (limited external cohort), these risks transfer:
- Risk 4 (sample size) escalates — A3 must define minimum cohort size for statistical significance
- Risk 5-6 (economy integrity) must be verified clean over A2 observation window
- Risk 8 (exposure control) requires additional verification with non-team external accounts
