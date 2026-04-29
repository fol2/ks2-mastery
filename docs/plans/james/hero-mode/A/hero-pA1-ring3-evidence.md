# Hero Mode pA1 — Ring 3 Evidence

**Status:** SUPERSEDED BY A2
**Date:** 2026-04-30

## Summary

Ring 3 (staging multi-day observation) is superseded by A2's internal cohort measurement.

**Original scope:** Run staging for 2+ calendar days, verify date key rollover, daily award idempotency, and balance monotonicity across days.

**Why superseded:** A2 Ring A2-3 (multi-day observation) provides the same evidence under production conditions with real accounts. The A2 cohort runs for 5+ calendar days with 2+ date key rollovers, which exceeds the original Ring 3 scope. Production conditions expose issues that staging alone cannot surface (real D1 latency, real Worker CPU time, real concurrent access patterns).

**A2 equivalents:**
- Internal cohort observation: Ring A2-3 (5+ days)
- Date key rollover verification: cohort smoke script (PR #674)
- Economy integrity: certification manifest (PR #672) tracks balance monotonicity
- Idempotency verification: ops probe (PR #662) detects reconciliation gaps
