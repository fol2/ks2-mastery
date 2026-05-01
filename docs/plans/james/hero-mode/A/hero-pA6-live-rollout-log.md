# Hero Mode pA6 - Live Rollout Log

**Phase:** A6 (Production close-out, normalisation, or stop)
**Date:** 2026-05-01
**Status:** POPULATED - no widening executed; repo-side hold recorded
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA6.md`

---

## Rollout Timeline

| Date/Time | Flag or Secret Changed | Population Affected | Operator | Smoke Result | Stop/Warning Conditions | Decision |
|-----------|------------------------|---------------------|----------|--------------|-------------------------|----------|
| 2026-05-01 16:46 UTC | None | No new production accounts widened by this branch; checked-in global Hero flags remain false; rollout-bucket path is effectively 0%; `HERO_INTERNAL_ACCOUNTS` secret exists but its size is not readable by this workflow | Codex worktree `hero-mode-pA6` | Production smoke not run; focused local resolver/safety tests passed | No live rollout evidence supplied; exact internal allowlist size not verified; A6 metric truth gap closed; owner and support approval evidence missing | HOLD AT CURRENT ROLLOUT PERCENTAGE |

---

## Evidence Boundary

This log is intentionally not a normalisation log. It records the A6 release brake.

- pA5 example/template rows are ignored.
- No percentage rollout was executed by this branch.
- No allowlist was widened by this branch.
- The rollout-bucket path is effectively 0% from tracked vars and the observed secret-name list.
- `HERO_INTERNAL_ACCOUNTS` is present, but its value and size are not readable by this workflow.
- This is therefore a repo-side hold record, not a contract-complete production HOLD certification.
- No production D1 export was supplied to the A6 extractor.
- The current checked-in Worker vars keep global Hero flags off.

---

## Decision Key

| Decision | Meaning |
|----------|---------|
| NORMALISE HERO MODE | Not supported by the available A6 evidence |
| HOLD AT CURRENT ROLLOUT PERCENTAGE | Selected; do not widen until owners, support approval, live metrics, smoke, and rollback evidence exist |
| ROLL BACK TO COHORT ONLY | Not selected; no live breach was observed by this branch |
| KEEP DORMANT AND REWORK | Not selected; no serious product/privacy/economy architecture failure was observed by this branch |
