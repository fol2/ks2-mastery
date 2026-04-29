# Hero Mode pA2 — A3 Decision Recommendation

**Date:** 2026-04-30
**Status:** AWAITING COHORT EVIDENCE
**Recommendation:** [PROCEED TO A3 / HOLD AND HARDEN / ROLLBACK]

## Evidence Summary

| Ring | Status | Key Finding |
|------|--------|-------------|
| A2-0 | COMPLETE | pA1 recommendation finalised; Rings 2-4 superseded by A2 |
| A2-1 | COMPLETE | Privacy recursive (PR #660), launchability fix (PR #663), ops probe (PR #662), override verification (PR #671), certification manifest (PR #672) |
| A2-2 | AWAITING | Internal production enablement not yet executed |
| A2-3 | AWAITING | Multi-day observation not yet started |
| A2-4 | AWAITING | Depends on A2-2 + A2-3 evidence |

## Code Readiness Assessment

All A2 code work is complete:
- 7 PRs merged (#660, #662, #663, #671, #672, #674)
- 71+ new tests added (16 privacy + 9 launchability + 12 ops probe + 16 override + 16 certification + 2 scripts)
- Zero production regressions introduced
- Certification validator reports code readiness

## Pending: Operational Evidence

The A3 decision cannot be made until:
1. Internal cohort accounts are configured (HERO_INTERNAL_ACCOUNTS secret)
2. 5+ calendar days of observation with 2+ date key rollovers
3. No stop conditions fire during observation
4. Metrics baseline shows confidence ≥ low for key health dimensions
5. Certification validator reports CERTIFIED_PRE_A3

## Decision

[To be filled after cohort observation window closes]

**Rationale:** [evidence-based]

**If PROCEED:** A3 scope = limited external cohort (10-30 accounts), 14-day observation, support ownership defined

**If HOLD:** Remediation items = [list]

**If ROLLBACK:** State-dormancy preservation via flag disable; no data deletion
