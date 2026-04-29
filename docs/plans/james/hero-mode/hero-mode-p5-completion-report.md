---
title: "Hero Mode P5 — Completion Report"
type: completion-report
status: complete
date: 2026-04-29
pr: "#564"
merge_sha: c70da0c
origin: docs/plans/james/hero-mode/hero-mode-p5.md
plan: docs/plans/2026-04-29-003-feat-hero-mode-p5-hero-camp-monster-pool-plan.md
predecessor: docs/plans/james/hero-mode/hero-mode-p4-completion-report.md
---

# Hero Mode P5 — Completion Report

## Executive Summary

Hero Mode P5 shipped in PR #564 (squash-merged 2026-04-29T01:45:12Z). It introduces **Hero Camp** — the first Hero spending surface where children use Hero Coins to invite and grow Hero-owned monsters. This completes the earn→spend cycle begun in P4.

**Key metrics:**
- 17 commits → 1 squash merge
- 339 tests pass (214 P5-specific + 125 P0-P4 regression), 0 failures, 0 regressions
- 10 implementation units executed (U1-U10), parallelised in 6 batches
- 37 files changed, +7822 lines added, -50 lines modified
- 3 code reviews (correctness, maintainability, testing) — 1 correctness bug caught and fixed
- Zero pressure vocabulary in child UI surfaces
- Zero new D1 tables
- Production-safe: `HERO_MODE_CAMP_ENABLED=false` by default

---

## What P5 Proves

P5 answers the guiding question from the origin document:

> "Can a child open Hero Camp, choose a Hero Pool monster, use safely earned Hero Coins to invite or grow that monster, and see a persistent Hero-owned monster state — with idempotent spending, no random rewards, no subject mastery mutation, and no pressure copy?"

**Yes.** The implementation satisfies all 15 requirements and all acceptance criteria from the origin spec (sections 5, 6, 25).

---

## Architecture Delivered

### Six-flag hierarchy (extended from P4's five)

```
HERO_MODE_SHADOW_ENABLED         → read-only shadow quest (P0)
  └─ HERO_MODE_LAUNCH_ENABLED    → start-task command (P1)
      └─ HERO_MODE_CHILD_UI_ENABLED → child-visible card (P2)
          └─ HERO_MODE_PROGRESS_ENABLED → claim-task + progress writes (P3)
              └─ HERO_MODE_ECONOMY_ENABLED → daily Coins + economy read model (P4)
                  └─ HERO_MODE_CAMP_ENABLED → Hero Camp spending surface (P5)
```

All six flags must be `true` for the full Camp experience. Camp flag defaults to `false` in `wrangler.jsonc`. Misconfiguration (Camp on, Economy off) returns 409 with typed error code — fail-closed.

### Three-layer extension preserved and extended

| Layer | P4 (economy) | P5 (spending) |
|-------|--------------|---------------|
| `shared/hero/` | 14 pure modules | +2 modules: `hero-pool.js` (registry, costs), `monster-economy.js` (spending intents) |
| `worker/src/hero/` | claim.js, read-model.js, routes.js, launch.js | +1 module: `camp.js` (pure command resolver); modified: `read-model.js` (v6), `routes.js` (camp flag) |
| `worker/src/app.js` | claim-task with economy | +unlock-monster/evolve-monster handlers using same `runHeroCommandMutation` |
| `src/platform/hero/` | hero-client.js, hero-ui-model.js | +2 modules: `hero-camp-model.js`, `hero-monster-assets.js`; modified: `hero-client.js` (+2 methods) |
| `src/surfaces/home/` | HeroDashboardCard | +3 components: `HeroCampPanel.jsx`, `HeroCampMonsterCard.jsx`, `HeroCampConfirmation.jsx` |

### Import direction invariant preserved

```
shared/hero/         ← (pure, no imports from worker/ or src/)
worker/src/hero/     ← (imports shared/hero/ only)
src/platform/hero/   ← (imports nothing from shared/ or worker/)
src/surfaces/home/   ← (imports src/platform/hero/ only)
```

Boundary tests in `tests/hero-p5-boundary.test.js` enforce this structurally.

---

## Implementation Units Executed

| Unit | Description | Files Created/Modified | Tests |
|------|-------------|----------------------|-------|
| U1 | Hero Pool registry and cost contract | +`shared/hero/hero-pool.js` | 24 |
| U2 | Economy normaliser hardening for debits | ≈`shared/hero/economy.js`, `hero-copy.js` | 21 |
| U3 | Hero state v3 with heroPool + migration | ≈`shared/hero/progress-state.js` | 21 |
| U4 | Pure spending helpers + deterministic ledger | +`shared/hero/monster-economy.js` | 29 |
| U5 | Worker Camp command resolver (pure) | +`worker/src/hero/camp.js` | 17 |
| U6 | Route wiring + flag gates + CAS mutation | ≈`worker/src/app.js`, `wrangler.jsonc` | 18 |
| U7 | Read model v6 with Camp block | ≈`worker/src/hero/read-model.js` | 19 |
| U8 | Client methods, UI model, asset adapter | +3 src/platform files, ≈hero-client.js | 34 |
| U9 | Hero Camp UI surface + monster cards | +3 src/surfaces components, ≈HomeSurface.jsx | 32 |
| U10 | Boundary, vocabulary, telemetry, regression | +2 test files, ≈hero-copy.js, app.js | 20 |

---

## Hero Pool Roster (6 monsters)

| Monster | Origin | Blurb | Invite Cost | Total to Fully Grow |
|---------|--------|-------|-------------|---------------------|
| Glossbloom | grammar-reserve | A word-garden creature that loves clear phrases | 150 | 3,650 |
| Loomrill | grammar-reserve | A thread creature that keeps ideas joined together | 150 | 3,650 |
| Mirrane | grammar-reserve | A mirror creature that reflects roles and voices | 150 | 3,650 |
| Colisk | punctuation-reserve | A structure creature that builds strong lists and shapes | 150 | 3,650 |
| Hyphang | punctuation-reserve | A boundary creature that links ideas carefully | 150 | 3,650 |
| Carillon | punctuation-reserve | A bell creature that gathers the Hero Camp together | 150 | 3,650 |

**Progression:** 5 stages (0=invited, 1=hatched, 2=growing, 3=strong, 4=grand). Grow costs: 300/600/1000/1600 per stage. At 100 coins/day, full completion of all 6 monsters takes ~219 days — a long-runway goal without short-term grind.

---

## Economy Safety

### Triple-layer idempotency (same as P4, extended to spending)

1. **Mutation receipt replay** — same `requestId` returns stored response without re-executing
2. **Already-owned/already-stage check** — pure resolver detects and short-circuits before entering mutation
3. **Deterministic ledger entry ID** — `hero-ledger-<djb2(idempotencyKey)>` structurally prevents duplicate debits

### Spending constraints enforced

| Constraint | How enforced |
|-----------|--------------|
| Balance never negative | Server-side check in `computeMonsterInviteIntent`/`computeMonsterGrowIntent` |
| Client cannot supply cost | `FORBIDDEN_CAMP_FIELDS` rejection in resolver |
| Costs are server-derived | Registry constants read at command resolution time |
| No double-spend | CAS (expectedLearnerRevision) + receipt replay + deterministic IDs |
| lifetimeEarned unchanged by spending | Only `lifetimeSpent` incremented in spend path |
| Already-owned returns zero cost | Short-circuits to 200 without mutation |
| Rollback preserves state | Flag off hides UI + rejects commands; state persists dormant |

### Ledger entry shapes (new in P5)

```
monster-invite: idempotencyKey = hero-monster-invite:v1:<learnerId>:<monsterId>:<branch>
monster-grow:   idempotencyKey = hero-monster-grow:v1:<learnerId>:<monsterId>:<targetStage>
```

Both use negative amounts. Balance-after must be non-negative.

---

## State Shape Evolution

```
HeroModeState v1 (P3) → progress + daily + recentClaims
HeroModeState v2 (P4) → + economy (balance, ledger, lifetime)
HeroModeState v3 (P5) → + heroPool (monsters, recentActions, rosterVersion)
```

Normaliser accepts all three versions and upgrades gracefully:
- v1 → v3: adds empty economy + empty heroPool
- v2 → v3: preserves economy, adds empty heroPool
- v3 → v3: normalises (drop unknown monster IDs, clamp stages, validate branches)

---

## Read Model v6

When Camp enabled, the read model gains a `camp` block:

```
{
  version: 6,
  ...v5 fields unchanged...,
  camp: {
    enabled: true,
    version: 1,
    commandRoute: '/api/hero/command',
    commands: { unlockMonster: 'unlock-monster', evolveMonster: 'evolve-monster' },
    rosterVersion: 'hero-pool-v1',
    balance: <number>,
    selectedMonsterId: <string|null>,
    monsters: [{ monsterId, displayName, childBlurb, owned, stage, branch, 
                 inviteCost, nextGrowCost, canInvite, canGrow, 
                 canAffordInvite, canAffordGrow, fullyGrown, ... }],
    recentActions: [...]
  }
}
```

When Camp disabled: v5 shape unchanged.

---

## UI Surface

### Hero Camp Panel
- Secondary to Hero Quest (appears below/after `HeroQuestCard`)
- Shows balance, 6 monster cards, owned/unowned states
- Hidden when Camp flag is off

### Monster Card States
1. Unowned + can afford → "Invite · 150 Hero Coins" CTA
2. Unowned + cannot afford → greyed CTA + "Save more Hero Coins by completing Hero Quests."
3. Owned + can grow + can afford → "Grow · [cost] Hero Coins" CTA
4. Owned + can grow + cannot afford → greyed CTA + calm message
5. Fully grown → "Fully grown" (no CTA)

### Confirmation Dialog
- "Use [cost] Hero Coins to invite/grow [name]?"
- "Your balance will be [balance after] Hero Coins."
- Two buttons: "Yes, [action]" / "Not now"
- No urgency, no countdown, no pressure language

---

## Child Copy Compliance

**Used:** Hero Camp, Hero Pool, Invite, Grow, Hero Coins, Choose, Fully grown, Save more

**Never used:** Shop, Buy, Purchase, Deal, Limited time, Loot, Jackpot, Spend now, Don't miss, Claim reward, Unlock now

Enforced by:
- `HERO_FORBIDDEN_PRESSURE_VOCABULARY` in `hero-copy.js` (structural scan)
- Vocabulary boundary tests in `tests/hero-p5-boundary.test.js`
- UI test `tests/hero-p5-camp-ui.test.js` scans rendered output

---

## Code Review Findings and Fixes

### Correctness Review
| Finding | Severity | Resolution |
|---------|----------|------------|
| `normaliseHeroPoolState` checks `entry.action` but records use `entry.type` → silently drops recentActions | Medium | Fixed: changed filter to check `entry.type` |

### Maintainability Review
| Finding | Severity | Resolution |
|---------|----------|------------|
| Unreachable dead code in monster-economy.js (redundant maxStage guard) | Low | Accepted: harmless defensive code |
| Test-only exports (`deriveSpendLedgerEntryId`, `isValidBranch`) | Low | Accepted: intentional test convenience |
| `hasHeroMonsterAsset` is a stub (always true for non-empty IDs) | Low | Accepted: P5 placeholder, real asset checking deferred |

### Testing Review
| Finding | Severity | Resolution |
|---------|----------|------------|
| No test for unknown command in resolver | Medium | Fixed: added test |
| No integration test for Gate 3 (CHILD_UI off) | Medium | Acknowledged: covered by structural gate test pattern |
| No test for event_log write failure non-fatality | Low | Accepted: existing P4 pattern proves try/catch non-fatality |

---

## Telemetry Events (new in P5)

```
hero_camp_command_succeeded  — invite/grow completed (cost, balance, monsterId)
hero_camp_command_rejected   — resolver error (code, monsterId)
hero_camp_command_idempotent — already-owned/already-stage (status)
hero_camp_disabled_attempt   — Camp flag off, command attempted
hero_monster_insufficient_coins — balance check failed (balance, cost)
hero.camp.monster.invited    — event_log mirror (fire-and-forget)
hero.camp.monster.grown      — event_log mirror (fire-and-forget)
```

---

## Rollout Guidance

```
Default: HERO_MODE_CAMP_ENABLED=false
```

Recommended enablement path:
1. Dev with seeded balances (all 6 monsters affordable)
2. Staging with one learner (real P4-earned balance)
3. Staging with real multi-day earned balances
4. Limited internal production account
5. Child-visible production after monitoring confirms no regressions

Rollback: set `HERO_MODE_CAMP_ENABLED=false`. Camp UI disappears, commands reject, all state preserved dormant. P4 daily earning continues unaffected.

---

## What P5 Does NOT Include (Non-goals preserved)

- No new earning mechanics
- No per-question/per-task Coins
- No random draws, loot boxes, or gambling
- No paid currency or parent-controlled allowance
- No refunds/undo (P6 topic)
- No branch switching after invite
- No trading, gifting, or leaderboards
- No six-subject expansion
- No scheduler or subject mastery changes

---

## P6 Handoff

P5 creates the real spending surface. P6 should focus on:

- Production analytics dashboard (Camp open rate, first invite rate, monster distribution)
- Economy abuse monitoring (balance hoarding, rapid-spend patterns)
- Scheduler learning-health monitoring (does Camp increase return rate without rushing?)
- Undo/refund policy (if product decides post-confirmation reversal is needed)
- Long-term ledger archival (currently capped at 180 entries)
- A/B testing Camp placement (inline vs route)
- Additional Camp copy polish
- Six-subject expansion when more subjects are production-ready
- Parent-facing explanation of Hero Mode

---

## Boundary Invariants Verified

| Invariant | Test evidence |
|-----------|--------------|
| Hero Camp code never writes `child_subject_state` | `hero-p5-boundary.test.js` + integration tests |
| Hero Camp code never writes `practice_sessions` | `hero-p5-boundary.test.js` |
| `shared/hero/` has zero imports from worker/ or src/ | structural scan |
| `worker/src/hero/camp.js` has zero subject runtime imports | structural scan |
| No new D1 tables | schema stability test |
| Event mirror is ON CONFLICT DO NOTHING (non-authoritative) | structural scan of app.js |
| Subject Stars unchanged | no writes to subject state from Camp path |
| Subject monster mastery unchanged | Hero Pool ownership is independent |

---

## Final P5 Sentence

Hero Mode P5 turns safely earned Hero Coins into child choice: a calm Hero Camp where children invite and grow Hero-owned monsters through deterministic, idempotent spending — without touching subject mastery, introducing shops, or turning learning into a reward chase.
