# Hero Mode pA5 — Live Rollout Log

**Phase:** A5 (Staged Default-On)
**Status:** TEMPLATE — no rollout entries yet
**Contract reference:** §12.2

---

## Rollout Timeline

| Date/Time | Flag or Secret Changed | Population Affected | Operator | Smoke Result | Stop/Warning Conditions | Decision |
|-----------|----------------------|---------------------|----------|--------------|------------------------|----------|
<!-- example row only, do not count -->
| 2026-XX-XX 00:00 UTC | HERO_ROLLOUT_PERCENT 0→5 | ~30 accounts (5% bucket) | [operator] | all-green | none triggered | continue |

---

## Decision Key

| Decision | Meaning |
|----------|---------|
| continue | Smoke passes, no warnings — proceed to next step |
| hold | Warning condition triggered — hold at current level, investigate |
| narrow | Narrow population (reduce percent or remove specific accounts) |
| roll-back | Stop condition met — set HERO_EMERGENCY_DISABLED=true |

---

## Stop Conditions (from §14)

Any of these require immediate `roll-back` decision:

1. Duplicate daily coin award detected (safety-01)
2. Negative balance in any ledger (safety-03)
3. Non-cohort learner exposed to Hero surfaces (safety-06)
4. Raw child content in any telemetry payload (safety-07)
5. Rollback rehearsal fails (safety-10)
6. 5xx spike >5% of Hero route requests sustained 5+ minutes

## Warning Conditions (from §15)

Any of these require `hold` decision until resolved:

1. Start rate drops below 20% for 2 consecutive days
2. Parent confusion reports exceed 3 in any 7-day window
3. Camp-before-learning ratio exceeds 0.5
4. Abandonment at same point for >30% of starts
5. Claim rejection rate exceeds 5%

---

*Template created 2026-04-30. Entries will be added during staged default-on rollout.*
