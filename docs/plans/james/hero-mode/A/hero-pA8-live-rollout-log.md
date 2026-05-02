# Hero Mode pA8 - Live Rollout Log

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** JAMES-ONLY NAMED INTERNAL ROLLOUT - no global rollout
**Machine-readable evidence summary:** `reports/hero/hero-pA8-release-boundary.json`

---

## Rollout Timeline

| Date/Time UTC | Flag or secret changed | Population affected | Operator | Smoke result | Stop/warning conditions | Decision |
|---------------|------------------------|---------------------|----------|--------------|-------------------------|----------|
| 2026-05-02 20:30-20:37 | Rotated `HERO_INTERNAL_ACCOUNTS=[]`; created `HERO_EXTERNAL_ACCOUNTS=[]`, `HERO_EXCLUDED_ACCOUNTS=[]`, `HERO_EMERGENCY_DISABLED=false`, `HERO_ROLLOUT_PERCENT=0`; temporarily set `HERO_EMERGENCY_DISABLED=true` for rehearsal, then restored `false` | Exposure narrowed to known zero accounts. No account remained widened after the rotation. | Codex on `hero-mode` using OAuth-safe Wrangler wrapper | Emergency-off rehearsal passed for dormant boundary: demo read model returned hidden Hero shape, command returned controlled 403; post-rehearsal dormant read model returned 404 `hero_shadow_disabled` and command returned 404 `hero_launch_disabled` | Known enabled-account smoke not run because there is no supplied known real/internal account for a safe release window. Live Hero state and event rows remain zero. | KEEP DORMANT UNTIL OWNED; full pA8 release execution incomplete |
| 2026-05-02 20:44 | Temporarily allowlisted one controlled production demo/test account, then restored `HERO_INTERNAL_ACCOUNTS=[]` | One demo/test account was probed and then removed; no real family account widened | Codex on `hero-mode` using OAuth-safe Wrangler wrapper | Enabled read-model probe returned status 200, but `ui.enabled=false` and task count 0 | Not a valid Stage 1 known-account smoke target; do not normalise or widen | KEEP DORMANT UNTIL OWNED |
| 2026-05-02 20:52-20:54 | Created controlled production demo/test accounts through existing smoke helpers; completed one Grammar session through the normal subject command path; temporarily allowlisted one prepared demo/test account, then restored `HERO_INTERNAL_ACCOUNTS=[]` | Demo/test accounts only. No real family account widened. | Codex on `hero-mode` using OAuth-safe Wrangler wrapper | Grammar production smoke passed, but the prepared demo/test Hero read model still returned status 200 with `ui.enabled=false`, `ui.reason=no-eligible-subjects`, and task count 0 | Still not a valid Stage 1 known-account smoke target; do not normalise or widen | KEEP DORMANT UNTIL OWNED |
| 2026-05-02 22:00-22:27 | Set `HERO_INTERNAL_ACCOUNTS=[James account]` for a known-account rollout; kept `HERO_EXTERNAL_ACCOUNTS=[]`, `HERO_EXCLUDED_ACCOUNTS=[]`, `HERO_ROLLOUT_PERCENT=0`, and `HERO_EMERGENCY_DISABLED=false` | One known internal account: James. No percentage rollout and no external cohort. | Codex using OAuth-safe Wrangler wrapper and bb-browser logged-in session | Stage 1 known-account smoke passed: Hero read model enabled, start-task launched punctuation, Worker-owned punctuation session completed, claim awarded +100 coins once, duplicate claim awarded 0, Camp invite blocked with `hero_insufficient_coins`, demo/non-cohort remained hidden, explicit exclusion hid Hero, emergency-off hid Hero, re-enable preserved completed state and 100-coin balance | Global default-on remains blocked by pA8 Stage 2/Stage 3 requirements. | HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT |

---

## What Was Changed

- `HERO_INTERNAL_ACCOUNTS` was rotated from unknown write-only state to a known empty JSON array.
- `HERO_EXTERNAL_ACCOUNTS` was created as a known empty JSON array.
- `HERO_EXCLUDED_ACCOUNTS` was created as a known empty JSON array.
- `HERO_EMERGENCY_DISABLED` was created, rehearsed as `true`, and restored to `false`.
- `HERO_ROLLOUT_PERCENT` was created as `0`.

No global Hero flag was turned on. Controlled production demo/test accounts were temporarily allowlisted for non-qualifying probes and then removed. After James's approval, James's adult account remains intentionally allowlisted as the sole named internal rollout account.

A8 did make production secret writes to force a known dormant boundary after the write-only pA7 state. That is a narrower operational closure than strict full pA8 release execution, because the known-account entry criterion was not available.

---

## Final Rollout Entry

A8 records a known-boundary hold after a Stage 1 smoke pass for James. The next Hero Mode expansion is not A9. It must follow Stage 2: 3-5 named accounts or a justified deterministic percentage rollout, with support review and stop-condition monitoring.
