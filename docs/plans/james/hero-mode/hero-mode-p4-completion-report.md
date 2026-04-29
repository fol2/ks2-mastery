---
title: "Hero Mode P4 — Completion Report"
type: completion-report
status: complete
date: 2026-04-29
pr: "#553"
merge_sha: 1482565
origin: docs/plans/james/hero-mode/hero-mode-p4.md
plan: docs/plans/2026-04-29-002-feat-hero-mode-p4-hero-coins-ledger-capped-daily-economy-plan.md
predecessor: docs/plans/james/hero-mode/hero-mode-p3-completion-report.md
---

# Hero Mode P4 — Completion Report

## Executive Summary

Hero Mode P4 shipped in PR #553 (squash-merged 2026-04-29T00:10:20Z). It introduces the **first Hero reward economy** — a capped daily Hero Coins award that strengthens the daily learning contract without introducing per-question rewards, rushing incentives, or gambling mechanics.

**Key metrics:**
- 12 commits → 1 squash merge
- 1672 total tests pass (779 hero + 893 worker), 0 failures, 0 regressions
- 10 implementation units executed (U0-U9), parallelised where dependencies allowed
- 2 code review findings caught and fixed before merge (1 medium, 1 low)
- Zero pressure vocabulary in child UI surfaces
- Zero new D1 tables
- Production-safe: `HERO_MODE_ECONOMY_ENABLED=false` by default

---

## What P4 Proves

P4 answers the guiding question from the origin document:

> "When a learner completes today's Hero Quest, can the platform award a small, capped Hero Coins reward exactly once, store an auditable ledger entry, show the child a calm balance update, and still avoid per-question rewards, rushing, gambling-like mechanics, subject mastery mutation, or Hero monster spending?"

**Yes.** The implementation satisfies all 12 requirements and all acceptance criteria from the origin spec (sections 4, 7, 23).

---

## Architecture Delivered

### Five-flag hierarchy (extended from P3's four)

```
HERO_MODE_SHADOW_ENABLED       → read-only shadow quest (P0)
  └─ HERO_MODE_LAUNCH_ENABLED  → start-task command (P1)
      └─ HERO_MODE_CHILD_UI_ENABLED → child-visible card (P2)
          └─ HERO_MODE_PROGRESS_ENABLED → claim-task + progress writes (P3)
              └─ HERO_MODE_ECONOMY_ENABLED → daily Coins + economy read model (P4)
```

All five flags must be `true` for the full P4 experience. Economy flag defaults to `false` in `wrangler.jsonc`.

### Three-layer extension preserved and extended

| Layer | P3 (progress) | P4 (economy) |
|-------|---------------|--------------|
| `shared/hero/` | 13 pure modules | +1 module: `economy.js` (constants, deterministic IDs, award helpers, normalisation) |
| `worker/src/hero/` | `claim.js`, `read-model.js`, `routes.js`, `launch.js` | Modified: `claim.js` (trust anchor), `read-model.js` (v5), `routes.js` (economy flag) |
| `worker/src/app.js` | claim-task handler | Extended with economy integration inside same mutation boundary |
| `src/platform/hero/` | `hero-client.js`, `hero-ui-model.js` | Modified: `hero-ui-model.js` (economy fields derivation) |
| `src/surfaces/` | `HeroQuestCard.jsx`, `HeroTaskBanner.jsx` | Modified: `HeroQuestCard.jsx` (economy acknowledgement block) |

### Data flow: daily Coins award lifecycle

```
P3 claim-task marks final task complete
  ↓
inside the same Hero mutation callback:
  applyClaimToProgress → daily.status = 'completed'
  ↓
canAwardDailyCompletionCoins checks eligibility
  ↓
applyDailyCompletionCoinAward derives deterministic ledger entry
  ↓
batch(db, [progress_upsert + receipt + revision_bump]) — single atomic write
  ↓
event mirror: hero.coins.awarded (deterministic ID, ON CONFLICT DO NOTHING)
  ↓
response includes: coinsEnabled=true, coinsAwarded=100, coinBalance=N
  ↓
read model v5 exposes economy block to client
  ↓
HeroQuestCard shows calm "100 Hero Coins added. Balance: N Hero Coins."
```

### Three-layer idempotency

1. **Mutation receipt**: Same `requestId` replays stored response including coins data
2. **Already-completed status**: Different `requestId` for an already-completed task returns safe response without double-counting
3. **Deterministic ledger entry ID**: `hero-ledger-<djb2(idempotencyKey)>` with structural ON CONFLICT DO NOTHING — even if layers 1 and 2 somehow miss, the ledger cannot contain duplicates

### Trust anchor hardening (P4 preflight)

P3 accepted completed sessions without `heroContext` as valid evidence (compatibility with pre-P3 sessions). P4 tightens this:

```
economyEnabled=true AND !summary?.heroContext
  → rejected with hero_claim_missing_hero_context
  → no Coins can flow through unverified completions
```

When `economyEnabled=false`, the P3 compatibility path is preserved.

---

## Implementation Units Delivered

| Unit | Description | Files | Tests |
|------|------------|-------|-------|
| U0 | Trust anchor hardening | 3 modified, 1 created | 12 |
| U1 | Shared economy contract | 1 created, 1 test created | 15 |
| U2 | Hero state v1→v2 migration | 1 modified, 1 test updated | 24 |
| U3 | Daily completion award helper | 1 modified, 1 test created | 17 |
| U4 | Worker claim-task economy integration | 3 modified, 1 test created | 8 |
| U5 | Read model v5 | 3 modified, 1 test created | 15 |
| U6 | Client/UI economy acknowledgement | 3 modified, 1 test created | 18 |
| U7 | Vocabulary boundary split | 2 modified, 1 test created | 8 |
| U8 | Abuse/safety E2E tests | 2 tests created | 25 |
| U9 | Economy telemetry/events | 1 modified, 1 test created | 9 |

**Totals:** 151 new P4 tests + existing P3/Worker tests all pass = 1672 total, zero regressions.

---

## Critical Decisions Made During Implementation

### 1. Economy state inside existing `child_game_state` row (U2)

No new D1 table. The `system_id='hero-mode'` row now stores `HeroModeStateV2` which includes both progress and economy blocks. The normaliser performs v1→v2 migration transparently on every read.

**Rationale:** The daily ledger size is small (~180 entries max, ~50KB worst case). D1's 1MB row limit is not at risk. A separate table would require a second write outside the atomic batch.

### 2. DJB2 hash for deterministic ledger entry IDs (U1)

Idempotency key format: `hero-daily-coins:v1:<learnerId>:<dateKey>:<questId>:<questFingerprint>`
Entry ID format: `hero-ledger-<djb2(idempotencyKey)>` (32-bit hash, base-36 encoded)

**Rationale:** DJB2 is already used in the codebase for quest fingerprints and task envelope IDs. It's pure, deterministic, and fast. Collision risk is negligible given the per-learner scope and bounded key space.

### 3. Award as mutation side-effect, not new endpoint (U4)

Coins are awarded inside the existing `claim-task` → `runHeroCommandMutation` → `applyCommand` callback. No new `/api/hero/coins` endpoint.

**Rationale:** This inherits all P3 safety properties (CAS, receipt dedup, atomic batch, auth gates) automatically. A separate endpoint would create a new idempotency surface and require coordinating two writes.

### 4. Read model version gating: v4 (economy off) vs v5 (economy on) (U5)

When `economyEnabled=true`: read model returns `version: 5` with `economy` block and `coinsEnabled: true`.
When `economyEnabled=false`: read model returns `version: 4` unchanged. No economy fields leak.

**Rationale:** Clients that don't expect economy fields get exactly the P3 shape. No backward-compat handling needed on the client.

### 5. Vocabulary boundary split (U7)

`HERO_FORBIDDEN_VOCABULARY` → split into:
- `HERO_FORBIDDEN_PRESSURE_VOCABULARY` (16 terms: deal, loot, jackpot, etc.) — forbidden everywhere
- `HERO_ECONOMY_ALLOWED_VOCABULARY` (coin, balance, Hero Coins) — allowed only in economy-scoped files
- `HERO_ECONOMY_ALLOWED_FILES` (6 files) — explicit allowlist

**Rationale:** P4 intentionally introduces "Hero Coins" but must not introduce pressure/gambling language. The structural scan now enforces both constraints.

---

## Code Review Findings and Fixes

### Finding 1 (Medium): Ledger duplicate check on empty ledger
**Issue:** `canAwardDailyCompletionCoins` extracted `learnerId` from `ledger[0]`, which is `null` when ledger is empty (first-ever award), causing the duplicate check to be silently skipped.
**Fix:** Guard with `ledger.length > 0` check before attempting extraction.

### Finding 2 (Low/UX): awardStatus 'available' for active daily
**Issue:** `selectChildSafeEconomyReadModel` returned `'available'` even when the daily quest was still in-progress (not yet completed).
**Fix:** Return `'in-progress'` for active dailies. Only return `'available'` when `daily.status === 'completed'` and award hasn't been issued yet.

### Security review: No actionable vulnerabilities
Three low-severity residual risks documented (DJB2 collision space, D1 batch semantics, viewer-role probe timing) — all acceptable by design.

---

## Boundary Invariants Verified

### Subject boundary (unchanged from P3)
- Zero `child_subject_state` writes from Hero economy code
- Zero subject Stars awarded by Hero
- Zero mastery algorithm changes
- Zero scheduler behaviour changes
- Zero marking or feedback changes

### Economy boundary (new in P4)
- Balance only increases through verified daily completion (no other path)
- No per-question, per-answer, per-click, or per-correct rewards
- No streak, speed, no-hint, or random bonuses
- No shop, spending, purchase, or refund mechanics
- `HERO_MODE_ECONOMY_ENABLED=false` → P3 behaviour exactly preserved
- HeroTaskBanner remains economy-free (structural scan enforced)

### Data integrity boundary
- D1 batch atomicity ensures progress + economy always consistent
- CAS guard prevents stale writes
- Deterministic ledger IDs prevent duplicate entries structurally
- Event mirror is best-effort (non-fatal) with ON CONFLICT DO NOTHING
- No `Math.random()` or `Date.now()` in authoritative economy helpers

---

## New Shared Pure Modules

`shared/hero/economy.js` — exports:
- Constants: `HERO_ECONOMY_VERSION`, `HERO_DAILY_COMPLETION_COINS`, `HERO_DAILY_BONUS_COINS_CAP`, `HERO_LEDGER_RECENT_LIMIT`, `HERO_ECONOMY_ENTRY_TYPES`
- ID derivation: `deriveDailyAwardKey()`, `deriveLedgerEntryId()`
- State: `emptyEconomyState()`, `normaliseHeroEconomyState()`
- Award logic: `canAwardDailyCompletionCoins()`, `applyDailyCompletionCoinAward()`
- Read model: `selectChildSafeEconomyReadModel()`

Zero impure imports. Zero side effects. Fully testable in isolation.

---

## Telemetry Delivered

### Structured console.log events
| Event | Fires when |
|-------|-----------|
| `hero_daily_coins_awarded` | Coins successfully awarded |
| `hero_daily_coins_already_awarded` | Already-completed early return with existing coins |
| `hero_daily_coins_disabled` | Economy flag off during claim |
| `hero_daily_coins_blocked` | `canAward=false` for non-disabled reason |
| `hero_daily_coins_duplicate_prevented` | Ledger structural dedup caught duplicate |

### Event log mirror
- `hero.coins.awarded` with deterministic ID `hero-evt-<ledgerEntryId>`
- ON CONFLICT DO NOTHING for idempotent insertion
- Includes: questId, dateKey, amount, ledgerEntryId, balanceAfter

---

## Performance Characteristics

- **Additional D1 reads per claim-task**: 0 (economy logic is pure, operates on already-loaded state)
- **Additional D1 writes per claim-task**: 0 (economy state written in the same batch as progress)
- **Additional event_log writes**: +1 per daily completion (fire-and-forget, non-blocking)
- **Read model compute**: minimal — `selectChildSafeEconomyReadModel` is O(1) with 10-entry ledger cap for child display
- **State size**: economy block adds ~200 bytes empty, ~50KB at 180-entry ledger cap

---

## P5 Handoff

P4 prepares for P5 (Hero Camp) by maintaining clean state boundaries:

```
economy.balance       → P5 reads to check if learner can afford unlock/evolve
economy.lifetimeSpent → P5 increments on spend
economy.ledger        → P5 adds 'monster-unlock' and 'monster-evolve' entry types
```

P4 deliberately does NOT include:
- `lifetimeSpent` changes (remains 0)
- Monster ownership fields
- Spending/purchase/refund mechanics
- Any `Hero Camp` UI surface

P5 should add Hero Camp, Hero Pool monster registry, unlock/evolve costs, child choice, confirm/undo. The economy earning side is now proven safe and ready.

---

## Rollout Readiness

### Default state (production-safe)
```
HERO_MODE_ECONOMY_ENABLED=false
```

### To enable P4 economy
```
HERO_MODE_SHADOW_ENABLED=true
HERO_MODE_LAUNCH_ENABLED=true
HERO_MODE_CHILD_UI_ENABLED=true
HERO_MODE_PROGRESS_ENABLED=true
HERO_MODE_ECONOMY_ENABLED=true
```

### Monitoring checklist
- [ ] `hero_daily_coins_awarded` fires exactly once per daily completion
- [ ] `hero_daily_coins_duplicate_prevented` remains at zero (structural dedup working)
- [ ] claim-task latency unchanged with economy enabled
- [ ] No `hero_economy_invariant_failed` events
- [ ] Subject completion rates stable after economy enable
- [ ] No pressure vocabulary in any child-visible Hero surface

---

## Final P4 Sentence

Hero Mode P4 gives the platform a safe earning economy: one verified daily Hero Quest completion adds one capped Hero Coins award, exactly once, with a deterministic ledger and calm child-facing balance copy — strengthening the daily learning contract without turning KS2 Mastery into a reward chase.
