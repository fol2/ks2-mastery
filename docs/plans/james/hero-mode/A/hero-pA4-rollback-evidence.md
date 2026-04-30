# Hero Mode pA4 — Rollback Evidence Note

**Phase:** A4 (Productionisation Path and Limited External Release)
**Date:** 2026-04-30
**Status:** VERIFIED

---

## Purpose

This document records the verified rollback mechanism for Hero Mode pA4. The mechanism ensures that disabling Hero Mode for any or all cohort accounts preserves all Hero state in a dormant condition, with zero data loss and full re-enablement capability.

---

## Verified Rollback Mechanism: Flag-Off Preserves State

The pA4 rollback mechanism is identical to the pA3 proven procedure. Hero Mode uses per-account flags (internal and external allowlists) rather than global default-on. Removing an account from the allowlist hides Hero surfaces but does not delete any underlying state.

This was first proven in pA1 Ring 1 (PR #617), re-verified in pA2 (PR #671), and rehearsed as a browser QA step in pA3 Ring A3-3.

---

## Three-Step Rollback Procedure

### Step 1: Flags Off

Remove the target account(s) from the external cohort allowlist:

```txt
HERO_EXTERNAL_ACCOUNTS = [] (for full emergency rollback)
HERO_EXTERNAL_ACCOUNTS = [remaining accounts] (for targeted narrowing)
```

This is the single action required to disable Hero surfaces. No code deployment is needed.

### Step 2: Verify Hidden

After flag-off, verify that Hero surfaces are completely hidden:

- No Hero Quest card visible on the learner dashboard.
- No Hero Camp link or entry point visible.
- No Hero Coins display visible.
- No Hero-related network requests initiated by the client.
- Hero command routes reject requests with appropriate non-500 errors.

### Step 3: State Preserved

After flag-off, verify that all Hero state remains intact and dormant:

- Ledger entries exist and are unchanged in D1.
- Balance is derivable from the preserved ledger.
- Camp ownership records are intact in KV.
- Progress state (completed quests, daily history) is preserved.
- Quest history and task completion records are unchanged.
- No deletion, truncation, or zeroing has occurred.

---

## What Is Preserved During Rollback

| State Category | Storage | Preserved | Notes |
|----------------|---------|-----------|-------|
| Ledger entries | D1 | Yes | All coin award and spend records remain |
| Hero Coins balance | Derived from ledger | Yes | Re-derivable on re-enablement |
| Camp ownership | KV | Yes | Monster invite/grow state unchanged |
| Progress state | KV | Yes | Daily completion history intact |
| Quest history | D1 event_log | Yes | All task selection and completion records |
| Telemetry events | D1 | Yes | Historical observation data preserved |

---

## What Changes During Rollback

| Aspect | Before Rollback | After Rollback |
|--------|-----------------|----------------|
| UI visibility | Hero surfaces shown | Hero surfaces hidden |
| Command acceptance | Hero commands accepted | Hero commands rejected |
| Telemetry | Active event emission | Dormant (no new events) |
| Read model | Returns Hero state | Returns no-access response |
| Ops probe | Reports enabled | Reports disabled/dormant |

---

## Re-Enable Produces Identical Readiness

When a rolled-back account is re-added to the allowlist, the learner resumes exactly where they left off. This is verified by the `hero-p6-rollback.test.js` test suite, which proves:

1. A learner with existing Hero state is flagged off.
2. All Hero surfaces become hidden.
3. The learner is re-enabled.
4. Hero surfaces return with identical state: same balance, same Camp ownership, same progress.
5. No "fresh start" occurs — the learner does not lose earned coins, owned monsters, or completion history.

This test has been passing since P6 production hardening and is included in CI.

---

## Hero State Is Never Deleted During Rollback

This is the critical invariant. Under no circumstances does the rollback procedure delete Hero state:

- `HERO_EXTERNAL_ACCOUNTS = []` hides Hero Mode. It does not delete ledger rows, KV entries, or event_log records.
- `HERO_INTERNAL_ACCOUNTS = []` hides Hero Mode. Same preservation guarantee.
- Global flags remaining OFF is the default safe posture. State is dormant behind the flags.
- There is no "hard reset" or "clean slate" command in the rollback procedure. If state deletion is ever required (e.g. for a data-protection request), it would be a separate, explicitly authorised operation — not part of the rollback flow.

---

## Relationship to pA3 Rollback Procedure

This evidence note references the full operational procedure documented in:

```txt
docs/plans/james/hero-mode/A/hero-pA3-rollback-procedure.md
```

The pA3 procedure covers:
- Planned narrowing (remove one account)
- Emergency rollback (clear all accounts)
- Re-enablement after rollback
- Decision matrix for different situations

The pA4 rollback mechanism is identical. The only difference is that pA4 adds the `HERO_EXTERNAL_ACCOUNTS` allowlist alongside the existing `HERO_INTERNAL_ACCOUNTS`. Both follow the same flags-off-preserves-state pattern.

---

## Evidence Summary

| Evidence Point | Source | Status |
|----------------|--------|--------|
| Flag-off preserves state | pA1 Ring 1 (PR #617) | PROVEN |
| Re-enable restores identical readiness | `hero-p6-rollback.test.js` | PASSING IN CI |
| Browser QA rollback rehearsal | pA3 Ring A3-3 | REHEARSED |
| State never deleted during rollback | Architectural invariant — no delete path exists | VERIFIED |
| External cohort uses same mechanism | pA4 resolver (same flag resolution logic) | VERIFIED |

---

*Evidence note created 2026-04-30.*
