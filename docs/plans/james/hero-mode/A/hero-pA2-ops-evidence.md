# Hero Mode pA2 — Operations Evidence

**Phase:** A2 Ring A2-1 (Ops + Privacy + Launchability)
**Date:** 2026-04-30
**Status:** LOCAL PROOF COMPLETE (production verification pending cohort)

## Ops Probe Verification

| Check | Status | Evidence |
|-------|--------|----------|
| Probe route returns events | LOCAL PASS | `tests/hero-pA2-ops-probe.test.js` — 12/12 pass (PR #662) |
| Readiness checks return for learner | LOCAL PASS | `buildExpandedProbeResponse` tested with all readiness states |
| Health indicators populated | LOCAL PASS | Balance bucket, ledger count, reconciliation, spend pattern all tested |
| Override status visible | LOCAL PASS | Override status correctly reports internal vs non-internal |
| Privacy stripping verified | LOCAL PASS | Recursive strip removes forbidden fields at all depths |
| Non-internal account hidden | LOCAL PASS | `tests/hero-pA2-internal-override-surface.test.js` — 16/16 pass (PR #671) |

**Note:** "LOCAL PASS" means unit tests pass in the test harness. Production verification requires the ops probe route to be deployed and queried against real D1 state during the internal cohort (Ring A2-2).

## Privacy Validation Evidence

- Recursive validator test: **PASS** — 16/16 scenarios (PR #660)
  - Detects forbidden fields at root, 1-deep, 3-deep, inside arrays
  - Reports dotted paths for each violation
  - Depth limit of 10 prevents infinite recursion
  - `stripPrivacyFields` removes all forbidden keys recursively
- No forbidden fields in probe output: **LOCAL PASS** — probe test verifies stripping on expanded output

## Launchability Evidence

- Grammar mini-test mapped to satsset: **VERIFIED** (PR #663)
- All learner states produce launchable CTA: **PASS** — 9/9 scenarios (PR #663)
  - Weak-only learner → `trouble-practice` → launchable
  - Due-only learner → `smart-practice` → launchable
  - Retention-after-secure learner → `smart-practice` → launchable
  - Secure-only learner (secureCount ≥ 3) → `mini-test` → launchable (mode: satsset)
  - All envelopes launchable → no fallback needed
  - Unknown launcher → correctly returns non-launchable with reason

## Certification Validator Output (2026-04-30)

```
Status: CERTIFIED_WITH_LIMITATIONS
  [PASS] A2-0: Evidence close-out
  [PASS] A2-1: Ops + Privacy + Launchability
  [FAIL] A2-2: Internal production enablement (0 observations)
  [FAIL] A2-3: Multi-day internal cohort (0 observations, 0 date keys)
  [FAIL] A2-4: A3 recommendation (metrics baseline missing)
```

Rings A2-2 through A2-4 require production execution tracked as GitHub issues.

## Test Summary

| Test Suite | Pass | Fail | PR |
|------------|------|------|-----|
| hero-pA2-privacy-recursive | 16 | 0 | #660 |
| hero-pA2-ops-probe | 12 | 0 | #662 |
| hero-pA2-launchability-secure-grammar | 9 | 0 | #663 |
| hero-pA2-internal-override-surface | 16 | 0 | #671 |
| hero-pA2-certification-evidence | 16 | 0 | #672 |
| **Total** | **69** | **0** | |
