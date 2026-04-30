# Hero Mode pA2 — A3 Decision Recommendation

**Date:** 2026-04-30
**Status:** COMPLETE
**Recommendation:** HOLD AND HARDEN
**Owner:** Codex, for James

## Decision

Hero Mode should **hold and harden before any A3 external cohort**.

The A2 code and production enablement path are ready, and the operator-accepted A2-3 simulation closes the mechanical decision gate. The evidence is not strong enough to widen to external accounts because only one production observation has actually elapsed, the remaining A2-3 rows are simulated, and the metrics baseline still classifies all health-test dimensions as `insufficient-data`.

## Evidence Summary

| Ring | Status | Key Finding |
|------|--------|-------------|
| A2-0 | COMPLETE | pA1 recommendation finalised; Rings 2-4 superseded by A2 |
| A2-1 | COMPLETE | Privacy recursion, launchability, ops probe, override verification, certification manifest, and cohort scripts landed across the A2 PR set |
| A2-2 | COMPLETE | Production internal cohort configured and verified in PR #704; listed internal account received Hero read-model access, non-listed demo account remained hidden |
| A2-3 | COMPLETE WITH LIMITATION | One real production observation plus four operator-accepted simulation rows from issue #684; zero stop conditions in the recorded packet |
| A2-4 | COMPLETE | Decision is `HOLD AND HARDEN`; metrics baseline and risk register are updated |

## Metrics Review

`docs/plans/james/hero-mode/A/hero-pA2-metrics-baseline.md` now records:

- 5 dated rows and 5 date keys
- 1 unique learner
- readiness: 5 `ready`
- reconciliation: 5 `no-gap`
- override: 5 `override-active`
- stop conditions: 0

The baseline also records the evidence boundary: four rows are simulation rows, not elapsed production days. All A2 health-test dimensions remain `insufficient-data`, so the core A2 question has not been answered strongly enough for external widening:

```txt
Hero Mode increased clarity and completion without increasing spam, dead ends, duplicate rewards, privacy risk, or mastery distortion.
```

## Stop Condition Review

| Stop condition | Result | Evidence |
|----------------|--------|----------|
| Duplicate daily award | Not observed | No stop condition in the real A2-2 row; simulation rows also modelled none |
| Negative balance | Not observed | Balance bucket remained `0` throughout the recorded packet |
| Dead CTA | Not observed | Readiness stayed `ready` throughout the recorded packet |
| Privacy violation | Not observed | Recursive privacy validator and output stripping are in place; no stop condition recorded |
| Reconciliation gap | Not observed | Reconciliation stayed `no-gap` throughout the recorded packet |

No stop condition requires rollback. The limitation is evidence strength, not an observed safety failure.

## Privacy Assessment

Privacy is acceptable for continued internal hardening:

- recursive privacy validation rejects forbidden fields at nested paths;
- ops output is recursively stripped before it reaches operators;
- the production telemetry probe remains admin-protected;
- non-listed production/demo accounts remain outside the Hero read-model exposure path.

This is sufficient for internal observation. It is not, by itself, enough to justify external widening without real repeated-use telemetry.

## Rollout Blast Radius

The current blast radius is limited to the configured `HERO_INTERNAL_ACCOUNTS` cohort while global Hero flags remain off. A3 should not start until the hold items below are complete or the A3 contract is explicitly rewritten to accept synthetic evidence.

## Hold-And-Harden Items

1. Collect five actual production calendar days for the internal cohort, or record an explicit product decision that simulation evidence is acceptable for A3 risk.
2. Add or run direct Goal 6 telemetry extraction for start rate, completion rate, abandonment reasons, subject mix, claim rejection, duplicate prevention, Camp actions, and mastery/star drift.
3. Re-run cohort checks with at least two browser/device sessions and more than one learner profile, including first-time, low-balance, Camp-sufficient, Grammar-ready, and Punctuation-ready states.
4. Close the #684 evidence boundary explicitly before any external account is added.
5. Re-run the certification validator and update this recommendation if the real cohort evidence changes the risk posture.

## Rollback And Dormancy Note

Rollback does not require data deletion. If any later stop condition appears, keep Hero state dormant by clearing or narrowing `HERO_INTERNAL_ACCOUNTS` and keeping the global Hero flags off. Existing balances, ledgers, ownership, and dormant camp state should be preserved.

## A3 Scope If Later Approved

If the hold items complete cleanly, the next A3 proposal should remain small:

- 10 external accounts maximum for the first external cohort;
- 14 calendar days minimum;
- explicit support owner and daily review owner;
- same stop conditions as A2, with immediate rollback for negative balance, dead CTA, privacy leak, duplicate award, or reconciliation gap;
- no six-subject widening unless Arithmetic, Reasoning, and Reading have their own Worker-backed subject engines and Hero providers.
