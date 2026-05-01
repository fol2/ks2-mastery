# Hero Mode pA7 - Live Rollout Log

**Phase:** A7 release execution sprint
**Date:** 2026-05-01
**Status:** LIVE PRODUCTION CHECKED - no rollout widening, exposure boundary incomplete
**Machine evidence:** `reports/hero/hero-pA7-release-boundary.json`

---

## Rollout Timeline

| Date/Time UTC | Flag or secret changed | Population affected | Operator | Smoke result | Stop/warning conditions | Decision |
|---------------|------------------------|---------------------|----------|--------------|-------------------------|----------|
| 2026-05-01 22:40-22:45 | None | No new production accounts widened by this branch. Global checked-in Hero flags remain false. `HERO_INTERNAL_ACCOUNTS` exists but count is unknown. Rollout-bucket path is 0 percent, but total exposure is unknown. | Codex on `hero-mode-pA7` | Demo/non-cohort `/api/hero/read-model` returned 404 `hero_shadow_disabled`. Known allowlisted account smoke was not run. | Warning: unknown internal allowlist size. Blockers: no known-account smoke, no emergency-off rehearsal, no opt-out secret, no live support log. | HOLD AT CURRENT ROLLOUT PERCENTAGE; not contract-complete |

---

## What Was Not Changed

- No `HERO_INTERNAL_ACCOUNTS` value was overwritten.
- No `HERO_EXTERNAL_ACCOUNTS` secret was created.
- No `HERO_ROLLOUT_PERCENT` or `HERO_ROLLOUT_SALT` secret was created.
- No `HERO_EXCLUDED_ACCOUNTS` or `HERO_EMERGENCY_DISABLED` secret was created.
- No checked-in Hero global flag was changed from `false`.

The release remains held because A7 must not widen from an unknown exposure state. The log does not certify a valid pA7 hold boundary until the allowlist count or reviewed rotation is recorded.

---

## Next Permitted Rollout Entry

The next live rollout-log row may only widen exposure if it records all of the following first:

1. Known `HERO_INTERNAL_ACCOUNTS` or `HERO_EXTERNAL_ACCOUNTS` count, or a reviewed rotation to a known value.
2. Named support owner actively watching the release window.
3. Opt-out or exclusion path available.
4. Known-account production smoke passing the A7 path.
5. Production rollback rehearsal passing.
6. Support log row containing real issues or explicit zeroes.
