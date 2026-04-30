# Hero Mode pA3 — Risk Register

**Phase:** A3 (Real-Cohort Evidence Hardening)
**Date:** 2026-04-30
**Status:** ACTIVE

---

## Carried Forward from pA2

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|------------|--------|
| 1 | D1 tail latency variance (P95 = 4.2x P50) | Certain | Low | Accept as platform characteristic; do not set tight P95 thresholds | ACCEPTED |
| 2 | Grammar breadth-maintenance dead CTA | Eliminated | — | Fixed by PR #663 (mini-test to satsset mapping) | RESOLVED |
| 3 | Privacy validator misses nested fields | Eliminated | — | Fixed by PR #660 (recursive validation with depth limit) | RESOLVED |
| 4 | Internal cohort too small for meaningful baselines | High | Medium | A3 Ring A3-1 must collect 5+ real production days with 3+ learners | ACTIVE |
| 5 | Duplicate daily coin award under concurrent tabs | Low | High | Three-tier idempotency proven in P4; requires real repeated-use verification in A3 | MONITORING |
| 6 | Camp debit race under refresh | Low | High | Deterministic entry ID + stale-write retry proven in P5; requires real verification in A3 | MONITORING |
| 7 | Rollback cannot preserve dormant state | Very Low | Critical | Proven in pA1 Ring 1 (PR #617); must be re-rehearsed in A3 Ring A3-3 | MONITORING |
| 8 | Non-internal accounts see Hero surfaces | Very Low | Critical | Override mechanism proven (PRs #620, #627, #671); verified in A2 Ring A2-2 | MONITORING |
| 9 | Telemetry sink not receiving events | Low | Medium | Ops probe verifies event count; cohort smoke script detects gaps | MONITORING |
| 10 | Raw child content in metrics/ops output | Very Low | High | Recursive privacy validator + output stripping (PRs #660, #662) | RESOLVED |
| 11 | Simulation evidence mistaken for real production | Medium | High | A3 adds Source column, provenance requirements, validator separation | ACTIVE — A3 remediation target |
| 12 | Goal 6 signals remain probe-limited | High | Medium | A3 Ring A3-2 must deliver direct telemetry extraction for learning/reward-health signals | ACTIVE — A3 remediation target |

---

## A3-Specific Risks

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|------------|--------|
| 13 | Evidence strength insufficient after A3 internal cohort | Medium | High | Require 5+ real days, 3+ learners, 2+ devices; hold if not achieved | ACTIVE |
| 14 | External micro-cohort reveals issues not seen internally | Medium | Medium | Cap at 10 accounts, 14 days, daily review, immediate rollback; keep in A3-5 optional ring | MONITORING |
| 15 | Telemetry extraction gaps — some Goal 6 signals remain unmeasurable | Medium | Medium | Explicitly list unmeasurable signals; accept bounded uncertainty rather than overclaim | ACTIVE |
| 16 | Documentation drift between pA2 artifacts creates misleading A3 baseline | Medium | Medium | U4 drift reconciliation in Ring A3-0 corrects known drift before evidence collection begins | ACTIVE — Ring A3-0 target |
| 17 | Rollback rehearsal reveals state deletion (not dormancy) | Very Low | Critical | A3-3 browser QA includes preserve-state proof; emergency rollback procedure documented | MONITORING |
| 18 | New code merged during A3 observation breaks Hero integrity | Low | High | Minimise Hero-touching PRs during observation; re-run smoke after any merge | MONITORING |
| 19 | Operator fatigue during 14-day observation window | Medium | Medium | Automate daily smoke; limit manual review to warnings and anomalies | ACTIVE |
| 20 | Evidence template mismatch — rows recorded without required Source column | Low | Medium | Template enforces 9-column format; validator rejects rows without Source | MITIGATED |

---

## Stop Conditions as Risk Rows

Every stop condition from pA3 section 8, expressed as a risk:

| # | Risk (from §8 stop condition) | Likelihood | Impact | Mitigation | Status |
|---|------|-----------|--------|------------|--------|
| S1 | Duplicate daily coin award | Low | High | Three-tier idempotency (dateKey + learnerId + CAS); smoke script detects | MONITORING |
| S2 | Duplicate Camp debit | Low | High | Deterministic entry ID + stale-write retry; ledger reconciliation check | MONITORING |
| S3 | Negative balance from normal flows | Very Low | Critical | Balance derivation from ledger sum; probe reconciliation; emergency rollback | MONITORING |
| S4 | Claim succeeds without Worker verification | Very Low | Critical | Completion evidence required by command handler; event_log cross-check | MONITORING |
| S5 | Hero mutates subject state | Very Low | Critical | Architectural impossibility — no Hero-to-subject write path exists; code review | MONITORING |
| S6 | Dead CTA (no valid launch path) | Low | Medium | Launch adapters for all ready subjects; Grammar fix proven; new mappings tested | MONITORING |
| S7 | Non-internal account sees Hero surfaces | Very Low | Critical | Override mechanism + global flags OFF; ops probe override status | MONITORING |
| S8 | Telemetry sink misses key events | Low | Medium | Smoke script event count check; D1 batch success monitoring | MONITORING |
| S9 | Raw child content in any output path | Very Low | Critical | Recursive privacy validator at write-time + strip at read-time | MONITORING |
| S10 | Rollback cannot preserve dormant state | Very Low | Critical | Rehearsed in A3-3; preserve-state proof required | MONITORING |
| S11 | Locked subjects create broken UI | Low | Medium | Placeholder rendering tested; Hero scheduler excludes locked subjects | MONITORING |
| S12 | Task selection unexplainable | Low | Medium | Deterministic scheduling from known inputs; operator can replay with same seed | MONITORING |
| S13 | Evidence rows not traceable to source | Low | Medium | 9-column provenance template; validator enforces Source classification | MITIGATED |
| S14 | Simulated rows presented as real | Low | High | Source column + evidence boundary statement + validator separation | MITIGATED |
| S15 | Camp directed before learning mission | Very Low | Medium | UI ordering enforced by component hierarchy; QA checklist item 14 | MONITORING |
| S16 | Pressure, scarcity, or gambling copy | Very Low | Medium | hero-copy.js vocabulary allowlist; QA checklist item 15 | MONITORING |

---

## Residual Risks for A4

Before A4 proceeds (if recommended):

- Risk 4 (sample size) must have moved from `insufficient-data` to at least low-confidence real baseline.
- Risk 5-6 (economy integrity) must be verified clean over real repeated-use observation.
- Risk 11 (simulation vs real) must be closed — A3 provenance model must be working.
- Risk 12 (Goal 6 signals) must be reduced by working telemetry extraction.
- Risk 13 (evidence strength) must be satisfied by A3 internal cohort results.
- Risk 14 (external findings) is accepted as the purpose of A4 — discovery is expected.

---

*Risk register created 2026-04-30. Updated as A3 rings progress.*
