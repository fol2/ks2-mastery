# Hero Mode P6 — Rollout Playbook

**Last updated:** 2026-04-29
**Owner:** James To
**Status:** READY FOR STAGING

---

## Flag Hierarchy (dependency chain)

```
HERO_MODE_SHADOW_ENABLED
  └─ HERO_MODE_LAUNCH_ENABLED
      └─ HERO_MODE_CHILD_UI_ENABLED
          └─ HERO_MODE_PROGRESS_ENABLED
              └─ HERO_MODE_ECONOMY_ENABLED
                  └─ HERO_MODE_CAMP_ENABLED
```

**Enablement sequence:** always bottom-up (Shadow first, Camp last).
**Disablement sequence:** always top-down (Camp first, Shadow last).

A child flag MUST NOT be enabled unless its parent is already enabled. The system enforces this with fail-closed misconfiguration detection (returns 409 and emits `hero_tech_flag_misconfiguration`).

---

## Rollout Rings

### Ring 1 — Local/Dev Seeded

| | |
|---|---|
| **Entry criteria** | All P6 tests pass (382 total, 0 failures). Readiness report status is READY. |
| **Actions** | Enable all 6 flags in `.dev.vars`. Run full flow: shadow build, launch, child UI render, claim-task, coin award, camp invite. |
| **Verification** | - Read model builds without error<br>- Dashboard renders 3 eligible subjects<br>- Claim-task returns `ok: true` with coin award<br>- Camp invite deducts balance correctly<br>- Metrics emit to structured log |
| **Exit criteria** | Manual sign-off from developer after exercising all flows. |

### Ring 2 — Staging Seeded (single learner)

| | |
|---|---|
| **Entry criteria** | Ring 1 signed off. Deploy to staging environment. |
| **Actions** | Enable all 6 flags in staging environment variables. Create one seeded test learner. Run automated smoke suite. |
| **Verification** | - No 500s in Worker logs<br>- D1 writes succeed (check `hero_progress` table)<br>- Analytics events appear in KV telemetry sink<br>- No forbidden vocabulary in rendered HTML (spot check) |
| **Exit criteria** | Automated smoke passes. No errors in 30-minute observation window. |

### Ring 3 — Staging Multi-Day (2-3 days)

| | |
|---|---|
| **Entry criteria** | Ring 2 passed. At least 3 distinct test learner accounts created. |
| **Actions** | Run daily quest cycles across 2-3 calendar days. Verify day-rollover, quest refresh, progress accumulation. |
| **Verification** | - Daily quest refreshes at midnight Europe/London<br>- Coin balance monotonically increases (no negative drift)<br>- CAS revision increments correctly across days<br>- No stale-write conflicts in normal single-tab usage<br>- Hero Pool monster ownership persists across days |
| **Exit criteria** | 3 consecutive daily cycles complete without error. Economy reconciliation utility reports zero discrepancies. |

### Ring 4 — Internal Production (team accounts only)

| | |
|---|---|
| **Entry criteria** | Ring 3 passed. Production deploy complete. |
| **Actions** | Enable all 6 flags for team-internal account IDs only (via per-account flag override). Team uses Hero Mode in production for 3-5 days. |
| **Verification** | - Production D1 read/write latencies within budget (p95 < 200ms)<br>- No KV quota exhaustion<br>- Analytics pipeline receives events end-to-end<br>- Multi-device/multi-tab conflict resolution works<br>- Learning health metrics emit baseline values |
| **Exit criteria** | Team sign-off. No P0/P1 defects found. Metrics dashboard populated. |

### Ring 5 — Limited Cohort (5-10% of learners)

| | |
|---|---|
| **Entry criteria** | Ring 4 signed off. Monitoring dashboards verified. Rollback tested in staging. |
| **Actions** | Enable flags for a randomised 5-10% cohort (via account-hash bucketing). |
| **Verification** | - Error rate < 0.1% of Hero requests<br>- Learning health: completion rate > 60%, engagement > 3 tasks/session<br>- Economy: no negative balances, daily cap enforced<br>- No support tickets related to Hero confusion<br>- Page load overhead < 50ms p95 (vs control) |
| **Exit criteria** | 7-day observation with all metrics in healthy range. |

### Ring 6 — Wider Cohort (50% of learners)

| | |
|---|---|
| **Entry criteria** | Ring 5 metrics healthy for 7 days. |
| **Actions** | Expand cohort to 50% via account-hash bucketing. |
| **Verification** | - Same metrics as Ring 5, at scale<br>- D1 write throughput within provisioned capacity<br>- No degradation to non-Hero subject practice flows<br>- Economy inflation rate acceptable (reconciliation drift < 1%) |
| **Exit criteria** | 7-day observation. No regressions. |

### Ring 7 — Default-On Decision

| | |
|---|---|
| **Entry criteria** | Ring 6 stable for 7+ days. Business sign-off obtained. |
| **Actions** | Remove per-account bucketing. Set all 6 flags as default-on in production environment. Remove feature-flag conditionals from hot paths (optional — can defer to P7). |
| **Verification** | - Full traffic on Hero Mode<br>- Long-term economy health (30-day reconciliation)<br>- No regression in core subject practice metrics |
| **Exit criteria** | Hero Mode is generally available. |

---

## Monitoring Checklist Per Ring

For every ring transition, verify:

- [ ] `hero_tech_flag_misconfiguration` count = 0
- [ ] `hero_tech_revision_stale_write` rate < 1% of write attempts
- [ ] `hero_economy_daily_cap_reached` fires only at expected ceiling
- [ ] `hero_economy_balance_awarded` / `hero_economy_balance_spent` ratio is sustainable
- [ ] No 500-level responses on `/api/hero/*` routes
- [ ] D1 row counts growing as expected (not stalled, not exploding)
- [ ] KV storage usage within quota
- [ ] Client-side error boundary triggers = 0

---

## Rollback Playbook

### Core Principle

> **Rollback preserves state dormant — it never deletes balances, ledger entries, or monster ownership.**

When a flag is disabled, the system stops writing new data and hides UI surfaces, but all previously-written state remains intact in D1. Re-enabling the flag restores full functionality with zero data loss.

### Rollback Scenarios by Flag Layer

#### Scenario 1 — HERO_MODE_CAMP_ENABLED = off

| Effect | Detail |
|--------|--------|
| Camp UI | Hidden. HeroCampPanel does not render. |
| Spend commands | Rejected with 409 (`hero_camp_disabled`). |
| Coin earning | Continues normally (economy flag still on). |
| Monster ownership | Preserved in D1 `hero_pool` column. No deletions. |
| Re-enable | Camp UI reappears. Previously-owned monsters visible immediately. |

#### Scenario 2 — HERO_MODE_ECONOMY_ENABLED = off

| Effect | Detail |
|--------|--------|
| Coin display | Hidden from child UI. |
| New coin awards | Suppressed. Claim-task still succeeds but skips coin write. |
| Camp surface | Hidden (Camp depends on Economy). |
| Progress tracking | Continues if PROGRESS flag remains on. |
| Ledger | Preserved in D1. No entries deleted. |
| Re-enable | Balance and ledger restored to view. Coins resume awarding from next claim. |

#### Scenario 3 — HERO_MODE_PROGRESS_ENABLED = off

| Effect | Detail |
|--------|--------|
| Claim-task | Rejected. No progress writes occur. |
| Daily quest | Not started/refreshed. |
| Subject practice | Fully operational through existing routes. |
| Economy/Camp | Disabled (both depend on Progress). |
| Re-enable | New daily quest generated on next interaction. Historical progress intact. |

#### Scenario 4 — HERO_MODE_CHILD_UI_ENABLED = off

| Effect | Detail |
|--------|--------|
| Hero card | Hidden from home surface. |
| Subject cards | Fully usable. Children see standard subject navigation. |
| Hero routes | Return 409 if accessed directly. |
| Progress/Economy/Camp | Disabled (all depend on Child UI). |
| Re-enable | Hero card reappears with preserved state. |

#### Scenario 5 — HERO_MODE_LAUNCH_ENABLED = off

| Effect | Detail |
|--------|--------|
| Hero task start | Cannot initiate Hero-directed practice. |
| Subject routes | Fully usable for self-directed practice. |
| Shadow read model | Still builds (Shadow flag independent). |
| Child UI/Progress/Economy/Camp | Disabled (all depend on Launch). |
| Re-enable | Hero tasks launchable again immediately. |

#### Scenario 6 — HERO_MODE_SHADOW_ENABLED = off

| Effect | Detail |
|--------|--------|
| Read model | Unavailable. Dashboard falls back to existing subject-only pattern. |
| All Hero surfaces | Disabled (everything depends on Shadow). |
| Existing practice | Zero impact. All subject routes function normally. |
| Re-enable | Shadow read model rebuilds on next request. Full Hero stack available. |

### Emergency Rollback Procedure

1. **Identify the failing layer** from error logs and metrics.
2. **Disable the affected flag** (and all child flags) in the environment.
3. **Verify** the system returns to stable state within 60 seconds.
4. **Communicate** to affected users if UI disappeared mid-session.
5. **Investigate** root cause before re-enabling.

### Escalation Template

| Field | Value |
|-------|-------|
| Severity | P0 / P1 / P2 |
| Affected flag(s) | (list) |
| User impact | (description) |
| Time of detection | (ISO timestamp) |
| Rollback action taken | (which flags disabled) |
| State integrity | Confirmed / Investigating |
| Owner | (name) |
| Next update | (time) |
