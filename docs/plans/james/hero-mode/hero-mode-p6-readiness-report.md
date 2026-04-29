# Hero Mode P6 — Go/No-Go Readiness Report

**Date:** 2026-04-29
**Owner:** James To
**Status:** READY FOR STAGING

---

## Feature Flags Tested

All 6 Hero Mode flags confirmed default-off in production:

| Flag | Default | Tested |
|------|---------|--------|
| `HERO_MODE_SHADOW_ENABLED` | off | Yes |
| `HERO_MODE_LAUNCH_ENABLED` | off | Yes |
| `HERO_MODE_CHILD_UI_ENABLED` | off | Yes |
| `HERO_MODE_PROGRESS_ENABLED` | off | Yes |
| `HERO_MODE_ECONOMY_ENABLED` | off | Yes |
| `HERO_MODE_CAMP_ENABLED` | off | Yes |

Hierarchy enforcement verified: enabling a child flag without its parent returns 409 with `hero_*_misconfigured` error code.

---

## Test Results Summary

| Category | Count | Failures |
|----------|-------|----------|
| P6 unit/integration tests | 265 | 0 |
| Regression tests (P0-P5) | 117 | 0 |
| **Total** | **382** | **0** |

All tests pass under `node --test` on Node 20+ with zero flaky results across 3 consecutive runs.

---

## Preflight Blockers Resolved

### U1: Asset Paths Fixed

Hero monster asset references now match the real filesystem layout. Path resolution uses `shared/hero/hero-pool.js` monster registry with verified paths.

### U2: Idempotency Hash Includes Command-Specific Identity

The claim-task idempotency hash incorporates `learnerId + dateKey + taskId + command` to prevent cross-command collisions. Camp invite commands include `monsterId` in the hash.

### U3: Dashboard Wiring Verified

45 integration tests confirm the Hero dashboard correctly wires read-model output to UI components. Flag-gated rendering verified for all 6 flag combinations.

### U4: Branch Policy = Option A (No Branch Choice)

Deterministic event IDs derived from `learnerId + dateKey + taskIndex`. No random branch selection — the scheduler produces a single deterministic task sequence per day.

---

## Metrics Baseline

### Learning Health (12 metrics defined)

- Quest completion rate
- Task completion rate
- Average tasks per session
- Time-to-first-claim
- Daily active quest starts
- Quest abandon rate
- Subject coverage breadth
- Weak-repair success rate
- Retention intent effectiveness
- Post-mega maintenance coverage
- Effort target achievement rate
- Telemetry enrichment coverage

### Engagement (10 metrics defined)

- Daily active Hero users
- Sessions with Hero interaction
- Hero card click-through rate
- Task launch rate
- Multi-subject engagement
- Return rate (next-day)
- Session depth (tasks completed per visit)
- Quest refresh awareness
- Camp visit rate
- Monster interaction rate

### Economy and Camp (18 metrics defined)

- Coins awarded per day (per learner)
- Daily cap hit rate
- Coin balance distribution
- Spend rate (camp invites)
- Invite success rate
- Monster ownership count distribution
- Economy reconciliation drift
- Ledger entry growth rate
- Negative balance incidents (target: 0)
- CAS conflict rate on economy writes
- Camp panel render rate
- Monster display rate
- Spend confirmation completion rate
- Balance-to-spend ratio
- Economy flag dependency violations
- Camp flag dependency violations
- Pool state version migration count
- Reconciliation utility pass rate

### Technical Safety (12 metrics defined)

- Flag misconfiguration events
- Stale-write revision conflicts
- Two-tab conflict detections
- D1 write latency p95
- KV read latency p95
- Error boundary trigger count
- 500-level response rate on Hero routes
- CAS retry exhaustion rate
- Read-model build failure rate
- Analytics event drop rate
- State version migration triggers
- Retry-after-stale-write success rate

---

## Known Issues

None blocking.

---

## Accepted Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| D1 write latency spikes under burst load | Low | Medium | Circuit breaker on claim-task path; retry-after-stale-write pattern with exponential backoff |
| Multi-tab race on coin award | Low | Low | CAS revision guard prevents double-award; worst case is a single retry prompt |
| Monster asset loading delay on slow connections | Medium | Low | Assets are small PNGs (<20KB each); placeholder skeleton shown during load |
| Economy inflation if daily cap bypassed via clock manipulation | Very Low | Medium | Server-side date derivation from `Europe/London` timezone; client clock ignored for cap enforcement |

---

## Rollout Recommendation

Proceed through rollout rings:

1. **Staging seeded** — immediate (post sign-off)
2. **Staging multi-day** — 2-3 days observation
3. **Internal production** — team accounts, 3-5 days

Full rollout sequence documented in [hero-mode-p6-rollout-playbook.md](./hero-mode-p6-rollout-playbook.md).

---

## Rollback Steps

Detailed per-flag rollback scenarios documented in the [Rollback Playbook section](./hero-mode-p6-rollout-playbook.md#rollback-playbook).

Key principle: rollback preserves state dormant, never deletes balances/ledger/ownership.

---

## P7 Recommendation

**Defer P7 until P6 metrics show a healthy engagement loop.**

Recommended observation period: 2-4 weeks of staging + internal production data.

P7 scope (tentative):
- Remove feature-flag conditionals from hot paths (bake-in)
- Add remaining 3 subjects (arithmetic, reasoning, reading)
- Advanced camp mechanics (monster evolution, trading)
- Parent-visible progress reports

P7 entry criteria:
- Quest completion rate > 60%
- Daily cap hit by > 30% of active users
- Economy reconciliation drift < 0.5%
- Zero P0/P1 defects in observation period
- Positive qualitative feedback from internal testers
