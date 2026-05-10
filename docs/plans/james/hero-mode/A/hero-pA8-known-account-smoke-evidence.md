# Hero Mode pA8 - Known-Account Production Smoke Evidence

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** PASS - James known-account production smoke completed

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
| Known enabled account | PASS | James approved use of the logged-in real admin account and James learner |
| Enabled Hero read model | PASS | James learner returned Hero v6, `childVisible=true`, `ui.enabled=true`, and a launchable punctuation task |
| Non-cohort hidden | PASS | Isolated production demo session returned 404 `hero_shadow_disabled` |
| Excluded account hidden | PASS | With James temporarily in `HERO_EXCLUDED_ACCOUNTS`, read model returned hidden Hero shape and command returned controlled 403 `hero-unavailable` |
| Start task through `/api/hero/command` | PASS | `start-task` returned `heroLaunch.status=started` for punctuation |
| Subject command path | PASS | Hero launched the normal Worker punctuation `start-session` path |
| Subject session completion | PASS | Known-account smoke completed the punctuation round under Worker authority; current-deploy enabled smoke completed a six-question punctuation session with six answered items |
| Worker-verified claim | PASS | `claim-task` returned `heroClaim.status=claimed`, `effortCompleted=2`, `dailyStatus=completed` |
| Single daily +100 Hero Coin award | PASS | First claim awarded 100 coins and balance became 100 |
| Duplicate claim blocked/no double-award | PASS | Duplicate claim returned `already-completed`, `coinsAwarded=0`, `dailyCoinsAlreadyAwarded=true` |
| Camp invite/grow succeeds or calmly blocks | PASS | `unlock-monster` for `glossbloom` returned 409 `hero_insufficient_coins`, "Need 150 coins, have 100" |
| No subject Stars/mastery/monster mutation by Hero command | PASS | Current-deploy enabled smoke compares subject data and `monster-codex` hashes before and after `claim-task`, duplicate `claim-task`, and blocked `unlock-monster`; hashes remain unchanged |
| Hero metrics rows | PASS | Production D1 has 3 Hero state learner rows under one real boundary account and 4 Hero event rows (`task.completed` x2, `daily.completed` x1, `coins.awarded` x1) |
| Support log | Explicit zero beyond James | No real family cohort beyond James's approved validation account |

---

## Decision Impact

This is now a Stage 1 known-account smoke pass for James's account. It allows the contract to move from dormant to a known-boundary hold or Stage 2 named-account exposure. It does not allow global default-on.

The current decision is:

```txt
HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT
```

Do not create A9. The next expansion requires Stage 2 evidence: 3-5 named accounts or a justified deterministic percentage rollout, support review, and no stop conditions.
