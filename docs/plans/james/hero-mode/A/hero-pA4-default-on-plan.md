# Hero Mode pA4 — Staged Default-On Plan

**Phase:** A4 (Productionisation Path and Limited External Release)
**Date:** 2026-04-30
**Status:** TEMPLATE (activate only if recommendation = PROCEED)

---

## Prerequisite

The pA4 recommendation must be `PROCEED TO STAGED DEFAULT-ON` before any stage of this plan is executed. If the recommendation is `HOLD AND HARDEN` or `ROLL BACK / KEEP DORMANT`, this plan remains dormant.

---

## Staged Ladder (Origin §6 Goal 5)

| Stage | Population | Mechanism | Duration | Gate |
|-------|-----------|-----------|----------|------|
| 1 | New eligible accounts only | Eligibility flag at account creation | 7 days | No stop conditions |
| 2 | Small deterministic bucket (5%) | `HERO_ROLLOUT_PERCENT=5` + `HERO_ROLLOUT_SALT` | 7 days | Metrics stable |
| 3 | Wider percentage (25%) | `HERO_ROLLOUT_PERCENT=25` | 7 days | Support manageable |
| 4 | Default-on for eligible ready-subject learners | `HERO_MODE_*_ENABLED=true` globally | Ongoing | Rollback drills active |

---

## Eligibility Criteria

A learner is eligible for Hero Mode when:

1. At least one Hero-ready subject (spelling, grammar, or punctuation)
2. Sufficient practice history in that subject to generate meaningful quests
3. Account is not in a locked or suspended state
4. Parent/guardian has not opted out (if opt-out mechanism exists)

---

## Stage Transitions

Each stage-to-stage transition requires:

1. Zero stop conditions triggered during the stage window
2. Warning conditions reviewed and acceptably explained
3. Support load within capacity (no queue backup exceeding 24h)
4. Explicit human sign-off (not automated)

---

## Rollback at Any Stage

At any stage, rollback is available by setting flags off:

- `HERO_MODE_*_ENABLED=false` or removing accounts from `HERO_EXTERNAL_ACCOUNTS`
- Learner state is preserved dormant (coins, progress, monsters remain but are invisible)
- No data loss occurs on rollback
- Rollback takes effect on next page load (no cache-busting required)

---

## What Must Be True Before Stage 4

Before declaring Hero Mode globally default-on, the following populations must all behave acceptably:

1. **Locked subjects** — learners with some subjects locked and some Hero-ready
2. **Multi-learner households** — families with 2+ children sharing an account
3. **Returning old accounts** — accounts created before Hero Mode existed
4. **First-time accounts** — brand new registrations experiencing Hero from day one
5. **Low-connectivity sessions** — learners on mobile data or slow connections
6. **Support paths** — every triage scenario in the support pack has been exercised

"Acceptably" means: routes return correct data, UI renders without errors, learner progress is not corrupted, and no stop conditions are triggered. This is not just "routes return 200" — it includes correct behaviour, comprehensible UI, and no child confusion signals.

---

## Monitoring During Default-On

Once at Stage 4:

- Daily automated metric checks (launch, product, safety)
- Weekly human review of support volume and nature
- Monthly rollback drill (flag off, verify dormancy, flag on, verify restoration)
- Stop conditions remain active permanently — they do not expire at Stage 4
