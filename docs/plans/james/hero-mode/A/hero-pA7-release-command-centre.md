# Hero Mode pA7 - Release Command Centre

**Phase:** A7 release execution sprint
**Date:** 2026-05-01
**Status:** LIVE PRODUCTION HOLD RECORDED - contract-incomplete, no widening
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA7.md`
**Machine evidence:** `reports/hero/hero-pA7-release-boundary.json`

---

## Owner Register

| Role | Named owner | Status | Boundary |
|------|-------------|--------|----------|
| Product owner | James | RECORDED FOR THIS A7 BRANCH | Final product signoff is still required before widening, normalisation, or contract-complete close |
| Engineering owner | Codex on branch `hero-mode-pA7` | REPO-SIDE IMPLEMENTATION/PR ONLY | Ends at merge/handoff; not a durable production release owner |
| Support owner | James | RECORDED FOR THIS A7 BRANCH | No separate support-team handoff or active watch window was observed |
| Daily review owner | James | RECORDED FOR THIS A7 BRANCH | No live daily review cadence has run yet |
| Rollback operator | James/Codex operator using OAuth-safe Wrangler scripts | REPO-SIDE OPERATOR ONLY | No emergency-off production rehearsal was run |

These are enough to stop the A7 artefacts from using anonymous placeholders. They are not enough for contract-complete pA7 close. Support signoff, daily review evidence, durable production ownership, known exposure, and production rollback evidence remain required before live family exposure widens.

---

## Current Live Exposure Boundary

Observed with read-only live production checks on 2026-05-01.

| Field | Live boundary |
|-------|---------------|
| `HERO_INTERNAL_ACCOUNTS` | Secret name present; value and account count not readable through Cloudflare secret list; exact exposure remains unknown |
| `HERO_EXTERNAL_ACCOUNTS` | Secret name absent |
| `HERO_ROLLOUT_PERCENT` | Secret name absent; checked-in vars also absent, so the rollout-bucket path is 0 percent |
| `HERO_ROLLOUT_SALT` | Secret name absent; no value written to docs |
| `HERO_EXCLUDED_ACCOUNTS` | Secret name absent |
| `HERO_EMERGENCY_DISABLED` | Secret name absent |
| Checked-in global Hero flags | all six `HERO_MODE_*_ENABLED` flags are `false` in `wrangler.jsonc` |
| Production Hero state rows | 0 rows in `child_game_state` where `system_id='hero-mode'` |
| Production Hero event rows | 0 rows in `event_log` where `system_id='hero-mode'` |
| Demo/non-cohort smoke | New production demo session received 404 `hero_shadow_disabled` from `/api/hero/read-model` |

A7 must not widen from this state because the internal allowlist size is still unknown and the required known-account cohort smoke has not passed. This is a no-widening hold record, not a valid pA7 hold boundary.

---

## Support Posture

| Requirement | Evidence | Status |
|-------------|----------|--------|
| Parent-facing explanation | `hero-pA4-parent-explainer.md` exists | AVAILABLE, not newly signed off in A7 |
| Opt-out procedure | Requires `HERO_EXCLUDED_ACCOUNTS` or equivalent; secret name absent | BLOCKED |
| Support-log capture path | `hero-pA4-support-pack.md` defines fields and triage | AVAILABLE |
| Rule for zeroes | A7 support summary records explicit zero supplied rows | AVAILABLE FOR REPORTING |
| Escalation rules | pA4 support pack has escalation categories but several lead slots remain unassigned | PARTIAL |

Support posture is not ready for widening or contract-complete pA7 close. It is sufficient to keep the release held and to define the next evidence required.

---

## Day 0 Decision

```txt
HOLD AT CURRENT ROLLOUT PERCENTAGE
```

Reason: production was inspected live, but A7 does not yet have known allowlist size, durable production owners, known-account smoke, production rollback rehearsal, opt-out secret, or support signoff. No production rollout secret was changed by this branch. This decision must not be presented as contract-complete pA7 closure.
