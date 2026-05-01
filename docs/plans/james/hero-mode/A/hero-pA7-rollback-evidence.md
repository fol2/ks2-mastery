# Hero Mode pA7 - Rollback Evidence

**Phase:** A7 release execution sprint
**Date:** 2026-05-01
**Status:** BOUNDARY HIDDEN CHECK PASSED - emergency-off rehearsal not run, no close
**Machine evidence:** `reports/hero/hero-pA7-release-boundary.json`

---

## Evidence Collected

| Check | Evidence | Result |
|-------|----------|--------|
| Checked-in global Hero flags are off | `wrangler.jsonc` has all six `HERO_MODE_*_ENABLED` values as `false` | PASS |
| Non-cohort/demo production session sees no Hero read model | `/api/hero/read-model` returned 404 `hero_shadow_disabled` for a new production demo session | PASS |
| State preservation baseline | `child_game_state` has 0 rows for `system_id='hero-mode'` | PASS, but only because no Hero state exists |
| Event preservation baseline | `event_log` has 0 rows for `system_id='hero-mode'` | PASS, but only because no Hero telemetry exists |
| Emergency-off control present | `HERO_EMERGENCY_DISABLED` secret name absent | FAIL FOR WIDENING |
| Emergency-off production rehearsal | Not run | FAIL FOR WIDENING |

---

## Boundary

This is not a full A7 rollback rehearsal. It proves that the current production boundary hides Hero for a fresh demo/non-cohort session while global flags are off. It does not prove that `HERO_EMERGENCY_DISABLED=true` hides an already-exposed cohort account, rejects commands with controlled non-500 errors, and preserves existing Hero state.

No rollback secret was changed by this branch because `HERO_INTERNAL_ACCOUNTS` is write-only and the current intended allowlist cannot be restored from this workflow if overwritten.

---

## Required Full Rehearsal

Before any widening, run a production rehearsal that records:

1. Intended exposed account sees Hero before rollback.
2. `HERO_EMERGENCY_DISABLED=true` or equivalent brake is applied.
3. Hero read model hides surfaces.
4. Hero commands return controlled non-500 errors.
5. `child_game_state` rows remain preserved.
6. Ledger, balances, completed tasks, and Hero Pool ownership remain preserved.
7. Re-enablement restores access without state loss.

Until that evidence exists, the A7 rollout decision must remain HOLD and cannot be treated as contract-complete pA7 closure.
