# Hero Mode pA8 - Release Command Centre

**Phase:** A8 release boundary closure and A-series termination
**Date:** 2026-05-02
**Status:** JAMES-ONLY NAMED INTERNAL ROLLOUT - global rollout still blocked by contract
**Contract:** `docs/plans/james/hero-mode/A/hero-mode-pA8.md`
**Machine-readable evidence summary:** `reports/hero/hero-pA8-release-boundary.json`

---

## Owner Register

| Role | Named owner | Status | Boundary |
|------|-------------|--------|----------|
| Product owner | James | APPROVED JAMES-ONLY ROLLOUT | Approved rollout on 2026-05-02, bounded by the pA8 contract |
| Engineering owner | Codex on branch `hero-mode` | REPO-SIDE IMPLEMENTATION/PR ONLY | Completed boundary closure artefacts and live operational checks |
| Support owner | James | RECORDED FOR SINGLE-ACCOUNT ROLLOUT | Support load is explicit zero beyond the James-owned validation account |
| Daily review owner | James | RECORDED FOR SINGLE-ACCOUNT ROLLOUT | Review required before adding accounts or percentage rollout |
| Rollback operator | James/Codex operator using OAuth-safe Wrangler scripts | REHEARSED FOR NAMED INTERNAL ROLLOUT | Emergency-off and exclusion both verified, then restored to intended rollout state |

---

## Current Live Exposure Boundary

Observed and changed with live production Cloudflare OAuth-safe commands on 2026-05-02.

| Field | Live boundary |
|-------|---------------|
| `HERO_INTERNAL_ACCOUNTS` | Reviewed JSON array containing James's account only; known count 1 |
| `HERO_EXTERNAL_ACCOUNTS` | Created as a reviewed empty JSON array; known count 0 |
| `HERO_ROLLOUT_PERCENT` | Created as `0`; rollout-bucket exposure 0 percent |
| `HERO_ROLLOUT_SALT` | Absent; unnecessary while rollout percentage is 0 |
| `HERO_EXCLUDED_ACCOUNTS` | Created as a reviewed empty JSON array; opt-out/exclusion path present, known count 0 |
| `HERO_EMERGENCY_DISABLED` | Created and restored to `false` after rehearsal |
| Checked-in global Hero flags | All six `HERO_MODE_*_ENABLED` flags are `false` in `wrangler.jsonc` |
| Production Hero state rows | 3 learner rows in `child_game_state` where `system_id='hero-mode'`, all under the one real boundary account |
| Production Hero event rows | 4 Hero rows in `event_log`: two task-completed rows, one daily-completed row, and one coins-awarded row |
| Exposed production accounts | 1 known account: James's adult account |

A8 closes the pA7 blocker by replacing the write-only unknown internal allowlist with a known reviewed allowlist. After James approved rollout, the intended boundary is James-only named internal exposure. This is not a global rollout.

The known-account smoke now passed on James's learner. The contract still blocks global default-on because Stage 2 small exposure and Stage 3 normalisation evidence have not run.

---

## Day 0 Decision

```txt
HOLD WITH KNOWN BOUNDARY - JAMES-ONLY NAMED INTERNAL ROLLOUT
```

Reason: James supplied product-owner approval and a known account. Stage 1 production smoke passed, including read model, start-task, Worker-owned subject completion, claim, duplicate-claim no-double-award, Camp insufficient-coins block, non-cohort hidden, explicit exclusion hidden, emergency-off rollback, and re-enable state preservation. The 2026-05-10 current-deploy smoke also replayed the enabled path with a temporary demo external allowlist, restored the external list empty, verified the demo account hidden, and cleaned scoped demo runtime rows. The next contract step is Stage 2 named-account exposure, not global default-on.
