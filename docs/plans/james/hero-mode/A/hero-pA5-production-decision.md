# Hero Mode pA5 — Production Decision

**Phase:** A5 (Staged Default-On)
**Date:** 2026-04-30
**Status:** TEMPLATE — decision pending rollout evidence
**Contract reference:** §12.5, §16

---

## Decision

**Selected outcome: [PENDING — complete after staged default-on evidence closes]**

---

## Outcome 1: NORMALISE HERO MODE

Hero Mode becomes a permanent, default-on feature for all eligible learners.

### Required evidence (all must be true — §16.1):

- [ ] All 10 safety metrics at target for full observation period
- [ ] Zero stop conditions triggered during rollout
- [ ] Start rate sustained above 20% at 100% rollout
- [ ] Next-day return rate sustained above 15%
- [ ] No unresolved boundary issues in support log
- [ ] Rollback rehearsal passed within final 7 days
- [ ] No parent confusion reports exceeding warning threshold
- [ ] Rollout percentage reached 100% without narrowing
- [ ] Support volume manageable without dedicated staffing
- [ ] No Hero-attributable mastery drift beyond epsilon
- [ ] Product owner sign-off on value delivery
- [ ] Engineering owner sign-off on operational stability

### Action on selection:

1. Remove HERO_ROLLOUT_PERCENT and HERO_ROLLOUT_SALT (all accounts get Hero)
2. Remove HERO_INTERNAL_ACCOUNTS and HERO_EXTERNAL_ACCOUNTS (no longer needed)
3. Keep HERO_EMERGENCY_DISABLED and HERO_EXCLUDED_ACCOUNTS as safety nets
4. Transition monitoring from rollout cadence to standard operational cadence

---

## Outcome 2: HOLD AT CURRENT ROLLOUT PERCENTAGE

Hero Mode remains active at its current rollout percentage; no further expansion.

### Applicable conditions (any of — §16.2):

- [ ] Warning condition triggered but not a stop condition
- [ ] Product metrics acceptable but not clearly positive
- [ ] Support volume at capacity — cannot absorb more
- [ ] Pending investigation into ambiguous metric signal
- [ ] External dependency (e.g. content pipeline) constraining expansion

### Action on selection:

1. Document specific percentage and reason for hold
2. Set review-by date (maximum 14 calendar days)
3. Continue monitoring at current cadence
4. Resolve blocking issue before next expansion step

---

## Outcome 3: ROLL BACK TO COHORT ONLY

Hero Mode rolled back to internal + external allowlist only; percentage rollout disabled.

### Applicable conditions (any of — §16.3):

- [ ] Stop condition triggered during rollout
- [ ] Safety metric breached zero-tolerance target
- [ ] Multiple warning conditions triggered simultaneously
- [ ] Non-cohort learner exposed to Hero surfaces
- [ ] Rollback rehearsal failed
- [ ] 5xx spike exceeding SLA threshold sustained >5 minutes

### Action on selection:

1. Set HERO_ROLLOUT_PERCENT to '0'
2. Optionally set HERO_EMERGENCY_DISABLED to 'true' for immediate effect
3. Confirm excluded accounts remain excluded
4. Document root cause and remediation plan
5. Require full re-certification before any future expansion

---

## Outcome 4: KEEP DORMANT AND REWORK

Hero Mode completely disabled for all accounts; requires design or engineering rework.

### Applicable conditions (any of — §16.4):

- [ ] Fundamental product value not demonstrated (start rate <10% sustained)
- [ ] Irreconcilable safety issue (e.g. mastery drift beyond remediation)
- [ ] Economy model proven unworkable at scale
- [ ] Parent comprehension too low despite explainer iteration
- [ ] Architecture limitation requiring redesign (e.g. ledger atomicity)
- [ ] Repeated stop-condition triggers across multiple rollout attempts

### Action on selection:

1. Set HERO_EMERGENCY_DISABLED to 'true'
2. Clear all rollout secrets (percent, salt, allowlists)
3. Document lessons learned and specific rework requirements
4. Archive all A5 evidence and metrics
5. Hero surfaces hidden from all learners until rework complete
6. Rework scope requires new contract and phase plan

---

## Evidence Boundary

| Field | Value |
|-------|-------|
| Rollout start date | [TBD] |
| Rollout end date | [TBD] |
| Maximum rollout percentage reached | [TBD] |
| Total accounts exposed | [TBD] |
| Total observation days | [TBD] |
| Stop conditions triggered | [TBD] |
| Warning conditions triggered | [TBD] |

---

## Signatures

| Role | Name | Date | Selected Outcome |
|------|------|------|-----------------|
| Product owner | [TBD] | | |
| Engineering owner | [TBD] | | |
| Support owner | [TBD] | | |

---

*Template created 2026-04-30. Decision will be recorded after staged default-on evidence closes.*
