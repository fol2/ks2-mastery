# Hero Mode pA1 — Ring 3 Evidence (Staging Multi-Day)

**Date range:** [Day 1 date] to [Day N date]
**Status:** PENDING

## Daily Observations

### Day 1: [date]

| Check | Result | Notes |
|-------|--------|-------|
| Quest generated (new dateKey) | — | |
| Task launched successfully | — | |
| Claim completed | — | |
| Daily award (+100 coins) | — | |
| Balance correct | — | |
| No duplicate awards | — | |

### Day 2: [date]

| Check | Result | Notes |
|-------|--------|-------|
| New dateKey generated | — | |
| Previous day stable | — | |
| New quest independent | — | |
| Award idempotent (Day 1 refresh) | — | |
| CAS revision incremented | — | |
| Camp monster still owned | — | |

## Multi-Day Invariants

- [ ] Balance monotonically non-decreasing across days
- [ ] Zero duplicate awards across all days
- [ ] Date keys are distinct per calendar day
- [ ] Europe/London timezone rollover correct
- [ ] Camp spend idempotent (repeated invite = safe replay)
- [ ] Scheduler output explainable for each day

## Ring 3 Verdict

**Verdict:** [PASS / FAIL / HOLD]
**Assessed by:** [name]
