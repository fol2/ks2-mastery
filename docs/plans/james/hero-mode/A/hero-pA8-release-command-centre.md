# Hero Mode pA8 - Release Command Centre

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** LIVE PRODUCTION BOUNDARY CLOSED - known dormant, no widening
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`
**Machine-readable evidence summary:** `reports/hero/hero-pA8-release-boundary.json`

---

## Owner Register

| Role | Named owner | Status | Boundary |
|------|-------------|--------|----------|
| Product owner | James | RECORDED FOR DORMANT DECISION | Must supply the next product release window and known account before any exposure |
| Engineering owner | Codex on branch `hero-mode` | REPO-SIDE IMPLEMENTATION/PR ONLY | Completed boundary closure artefacts and live operational checks |
| Support owner | James | RECORDED FOR DORMANT DECISION | No live family watch window is active while exposure is zero |
| Daily review owner | James | RECORDED FOR DORMANT DECISION | Review is only needed before a future owned release window |
| Rollback operator | James/Codex operator using OAuth-safe Wrangler scripts | REHEARSED FOR DORMANT BOUNDARY | Emergency-off set true, verified, then restored false |

---

## Current Live Exposure Boundary

Observed and changed with live production Cloudflare OAuth-safe commands on 2026-05-02.

| Field | Live boundary |
|-------|---------------|
| `HERO_INTERNAL_ACCOUNTS` | Rotated to a reviewed empty JSON array; known count 0 |
| `HERO_EXTERNAL_ACCOUNTS` | Created as a reviewed empty JSON array; known count 0 |
| `HERO_ROLLOUT_PERCENT` | Created as `0`; rollout-bucket exposure 0 percent |
| `HERO_ROLLOUT_SALT` | Absent; unnecessary while rollout percentage is 0 |
| `HERO_EXCLUDED_ACCOUNTS` | Created as a reviewed empty JSON array; opt-out/exclusion path present, known count 0 |
| `HERO_EMERGENCY_DISABLED` | Created and restored to `false` after rehearsal |
| Checked-in global Hero flags | All six `HERO_MODE_*_ENABLED` flags are `false` in `wrangler.jsonc` |
| Production Hero state rows | 0 rows in `child_game_state` where `system_id='hero-mode'` |
| Production Hero event rows | 0 rows in `event_log` where `system_id='hero-mode'` |
| Exposed production accounts | 0 known accounts after rotation |

A8 closes the pA7 blocker by replacing the write-only unknown internal allowlist with a known empty allowlist. This narrows exposure. It does not leave any account widened.

Because no known enabled account was supplied, A8 could not execute the full release-smoke path. The production secret writes recorded here are operational boundary-closure side effects, not evidence that the full pA8 release execution completed.

---

## Day 0 Decision

```txt
KEEP DORMANT UNTIL OWNED
```

Reason: the production exposure boundary is now known, emergency-off and exclusion controls exist, and rollback hiding was rehearsed. No named known real/internal account and owned release window were supplied for the enabled-account smoke, so A8 must not normalise, widen, or create A9.
