# Hero Mode pA7 - Final Decision

**Phase:** A7 release execution sprint
**Date:** 2026-05-01
**Status:** LIVE PRODUCTION HOLD RECORDED - pA7 close not contract-complete
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA7.md`
**Machine evidence:** `reports/hero/hero-pA7-release-boundary.json`

---

## Selected Outcome

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

Hero Mode is not normalised by this branch. The live production boundary was inspected without widening, but the evidence does not satisfy pA7's valid-hold contract because exact exposure remains unknown.

---

## Why Hold

1. Checked-in production Hero flags remain false.
2. Production secret names show `HERO_INTERNAL_ACCOUNTS` present, but the value and account count are write-only and unknown.
3. `HERO_EXTERNAL_ACCOUNTS`, `HERO_ROLLOUT_PERCENT`, `HERO_ROLLOUT_SALT`, `HERO_EXCLUDED_ACCOUNTS`, and `HERO_EMERGENCY_DISABLED` secret names are absent.
4. Production D1 has 0 Hero state rows and 0 Hero event rows.
5. A fresh production demo/non-cohort session correctly received 404 `hero_shadow_disabled`.
6. No known allowlisted account production smoke passed.
7. No emergency-off production rollback rehearsal ran.
8. Opt-out/exclusion is not live because `HERO_EXCLUDED_ACCOUNTS` is absent.
9. Support signoff and daily support zeroes/issues are not complete.
10. Production release ownership and support cadence are not evidenced strongly enough for pA7 close.

---

## Hold Boundary

| Field | Value |
|-------|-------|
| Selected outcome | HOLD AT CURRENT ROLLOUT PERCENTAGE |
| Rollout-bucket percentage | 0 percent for the bucket path because `HERO_ROLLOUT_PERCENT` and `HERO_ROLLOUT_SALT` are absent |
| Internal allowlist | `HERO_INTERNAL_ACCOUNTS` present; exact count unknown |
| Total exposed account count | Unknown because internal allowlist exposure may still exist |
| External allowlist | absent |
| Exclusion/opt-out control | absent |
| Emergency brake secret | absent |
| Global checked-in Hero flags | all false |
| Live Hero state rows | 0 |
| Live Hero event rows | 0 |
| Valid pA7 hold boundary | Not satisfied |
| pA7 release close allowed | No |
| Review-by date | 2026-05-15 |
| Owner for review | James |

The unknown internal allowlist count is itself a release blocker. A7 must not widen, normalise, or claim contract-complete closure until that value is recorded or rotated to a known reviewed value.

---

## Outcomes Not Selected

| Outcome | Reason not selected |
|---------|---------------------|
| NORMALISE HERO MODE | Missing known-account smoke, rollback rehearsal, opt-out control, support signoff, and live Hero metrics |
| ROLL BACK TO COHORT ONLY | No stop condition was observed, and no known cohort activity exists to narrow |
| KEEP DORMANT AND REWORK | No serious product, privacy, economy, or architecture failure was observed; the blocker is release operations evidence |

`KEEP DORMANT UNTIL OWNED` remains the operational guardrail if James cannot confirm production owners, support cadence, and the current allowlist count by the review date.

---

## Evidence Required To Move Off Hold

1. Record or rotate `HERO_INTERNAL_ACCOUNTS` to a known reviewed value.
2. Add `HERO_EXCLUDED_ACCOUNTS` or an equivalent exclusion/opt-out control.
3. Run known-account production smoke: read model, child surface, start-task, normal subject command path, subject completion, claim, one daily coin award, Camp invite/grow or blocked-by-balance, excluded account hidden, and non-cohort command denial.
4. Rehearse production rollback with `HERO_EMERGENCY_DISABLED=true` or equivalent.
5. Record support zeroes or issues for the live review window.
6. Run `scripts/hero-pA6-metrics-extract.mjs` against live exported Hero rows once rows exist.
7. Revisit no later than 2026-05-15.

---

## Final Statement

This branch records a live production no-widening hold, not a contract-complete pA7 close. The product remains safe from this branch because no rollout secret or global Hero flag was changed. The next step is an operational release decision with known owners, known exposure, known-account smoke, rollback rehearsal, and support cadence; it should not become another feature-building A-series phase.
