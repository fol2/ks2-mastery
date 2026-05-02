# Hero Mode pA8 - Known-Account Production Smoke Evidence

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** NOT RUN - no safe enabled-account exposure after known dormant boundary

---

## Required Stage 1 Smoke

The pA8 contract asked for one known enabled account to prove the production path:

1. enabled Hero read model;
2. non-cohort hidden;
3. excluded account hidden;
4. start task through `/api/hero/command`;
5. launch through the normal subject command path;
6. subject session completion under Worker authority;
7. Worker-verified claim;
8. single daily +100 Hero Coin award;
9. duplicate claim blocked;
10. Camp invite/grow succeeds or is calmly blocked;
11. no subject Stars, mastery, or subject monster mutation;
12. Hero metrics rows or precise non-observability;
13. support log row or explicit zero.

---

## Actual A8 Evidence

| Requirement | A8 result | Evidence |
|-------------|-----------|----------|
| Known enabled account | Not supplied | After Day 0, production exposure boundary is zero accounts |
| Controlled demo/test allowlist probe | Not qualifying | Temporarily allowlisted one production demo/test account; read model returned status 200 but `ui.enabled=false` and task count 0 |
| Controlled demo/test with Grammar subject state | Not qualifying | Created a fresh production demo/test account, completed one Grammar session through the normal subject command path, temporarily allowlisted it, and read Hero. Result: status 200, `ui.enabled=false`, `ui.reason=no-eligible-subjects`, task count 0 |
| Enabled Hero read model | Not run | Running it would require widening an account |
| Non-cohort hidden | PASS | Post-rehearsal demo/non-cohort read model returned 404 `hero_shadow_disabled` |
| Excluded account hidden | Control present, no account in list | `HERO_EXCLUDED_ACCOUNTS` exists as a known empty JSON array |
| Hero command controlled while disabled | PASS | Post-rehearsal demo command returned 404 `hero_launch_disabled`; emergency-off command returned controlled 403 `hero-unavailable` |
| Subject completion, claim, coins, Camp | Not run | Requires a known enabled account and owned release window |
| Metrics rows | Zero usage statement | Production `child_game_state` and `event_log` have 0 Hero rows |
| Support log | Explicit zero supplied rows | No live family exposure after A8 rotation |

---

## Decision Impact

This is not a smoke pass. It is the reason A8 cannot normalise or widen. The extra demo-with-Grammar-state probe shows that self-minting a production demo/test account during A8 still does not produce the known enabled account required by Stage 1.

The full pA8 contract is not complete. The dormant-boundary decision is:

```txt
KEEP DORMANT UNTIL OWNED
```

Do not create A9 to chase this smoke. The next attempt needs a named product release window and a supplied known account.
