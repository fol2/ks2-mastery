# Hero Mode pA2 — Risk Register

**Phase:** A2 (Internal Cohort Measurement)
**Date:** 2026-04-30
**Status:** ACTIVE - HOLD AND HARDEN

## Risk Matrix

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|------------|--------|
| 1 | D1 tail latency variance (P95 = 4.2× P50) | Certain | Low | Accept as platform characteristic; do not set tight P95 thresholds | ACCEPTED |
| 2 | Grammar breadth-maintenance dead CTA | Eliminated | — | Fixed by PR #663 (mini-test → satsset mapping) | RESOLVED |
| 3 | Privacy validator misses nested fields | Eliminated | — | Fixed by PR #660 (recursive validation with depth limit) | RESOLVED |
| 4 | Internal cohort too small for meaningful baselines | High | Medium | Accept `insufficient-data` honestly; hold before external widening until richer evidence exists | ACTIVE |
| 5 | Duplicate daily coin award under concurrent tabs | Low | High | Three-tier idempotency proven in P4; still requires real repeated-use cohort verification | MONITORING |
| 6 | Camp debit race under refresh | Low | High | Deterministic entry ID + stale-write retry proven in P5; still requires real repeated-use cohort verification | MONITORING |
| 7 | Rollback cannot preserve dormant state | Very Low | Critical | Proven in pA1 Ring 1 (PR #617); re-verify post-cohort | MONITORING |
| 8 | Non-internal accounts see Hero surfaces | Very Low | Critical | Override mechanism proven (PRs #620, #627, #671); ops probe shows override status | MONITORING |
| 9 | Telemetry sink not receiving events | Low | Medium | Ops probe verifies event count; cohort smoke script detects gaps | MONITORING |
| 10 | Raw child content in metrics/ops output | Very Low | High | Recursive privacy validator + output stripping (PRs #660, #662) | RESOLVED |
| 11 | Simulation evidence is mistaken for elapsed production observation | Medium | High | Label #684 simulation rows in evidence, baseline, and recommendation; hold external widening | ACTIVE |
| 12 | Goal 6 learning and reward-health signals remain probe-limited | High | Medium | Add direct telemetry or D1 analysis for start/completion, abandonment, subject mix, claim rejection, and mastery drift before A3 | ACTIVE |

## Residual Risks for A3

The current recommendation is HOLD AND HARDEN, so A3 should not start yet.

Before any later A3 proposal proceeds:
- Risk 4 (sample size) must move from `insufficient-data` to at least a low-confidence real cohort baseline
- Risks 5-6 (economy integrity) must be verified clean over real repeated-use observation, not only simulation
- Risk 8 (exposure control) requires another non-team account verification before external widening
- Risk 11 must be closed by either collecting real calendar evidence or explicitly changing the rollout contract
- Risk 12 must be reduced by richer Goal 6 telemetry extraction or a documented D1 analysis procedure
