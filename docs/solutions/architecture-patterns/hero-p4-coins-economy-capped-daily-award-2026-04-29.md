---
title: "Hero P4: Capped Daily Coin Award Inside Existing Mutation Boundary"
date: 2026-04-29
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - Adding a reward/economy system to an existing mutation boundary
  - Needing deterministic, idempotent writes inside D1 batch() atomicity
  - Extending a feature-flagged multi-phase system with a new economy layer
  - Migrating state schemas in-place via normaliser without migration scripts
  - Building a capped daily award that must never double-award under concurrency
tags:
  - hero-mode
  - economy
  - coins
  - idempotency
  - deterministic-ids
  - d1-batch
  - mutation-boundary
  - feature-flags
  - state-migration
  - capped-reward
---

# Hero P4: Capped Daily Coin Award Inside Existing Mutation Boundary

## Context

Hero Mode P3 (PR #533) proved that daily Hero Quest completion claims are idempotent, server-authoritative, and safe. P4 needed to add the first reward economy on top of this — awarding exactly 100 Hero Coins per daily quest completion — without introducing new D1 tables, non-deterministic IDs, gambling mechanics, or any path to double-awards.

The architectural challenge: how to graft a transactional economy ledger onto an existing CAS-guarded mutation path (`runHeroCommandMutation`) that already composes progress state + mutation receipt + revision bump in a single `batch(db, [...])` call — where `batch()` is the ONLY atomic write mechanism on Cloudflare D1 (withTransaction is a production no-op).

## Guidance

### Pattern 1: Economy as Mutation Side-Effect (Not New Endpoint)

The Coins award is computed and applied **inside** the existing `claim-task` mutation's `applyCommand` callback. No new `/api/hero/coins` endpoint.

```javascript
// Inside runHeroCommandMutation's applyCommand callback:
const afterClaim = applyClaimToProgress(heroState, claimResult, nowTs);

if (economyEnabled) {
  const { canAward } = canAwardDailyCompletionCoins(afterClaim, economyEnabled);
  if (canAward) {
    const economyResult = applyDailyCompletionCoinAward(afterClaim, {
      learnerId, nowTs, dailyCompletionCoins: 100,
    });
    updatedState = economyResult.state;
  }
}

return { state: updatedState, claimResult, economyResult };
// This state is written in the SAME batch as receipt + revision bump
```

**Why this pattern works:**
- Inherits all existing safety properties (CAS, receipt dedup, auth gates) automatically
- No second write path to secure
- Atomic: if batch fails, neither progress NOR economy is written
- No new idempotency surface to manage

### Pattern 2: Three-Layer Idempotency for Economy Writes

Layer 1 — **Mutation receipt**: Same `requestId` replays stored response (including coins data) from `mutation_receipts` table. Never re-executes the callback.

Layer 2 — **Already-completed status**: Different `requestId` for a task that's already completed returns safe `{ status: 'already-completed', dailyCoinsAlreadyAwarded: true }` before entering the mutation.

Layer 3 — **Deterministic ledger entry ID**: `hero-ledger-<djb2(idempotencyKey)>` where idempotencyKey encodes `learnerId + dateKey + questId + questFingerprint + economyVersion`. Even if layers 1 and 2 somehow miss, the ledger structurally cannot contain duplicate entries.

```javascript
// Idempotency key derivation — pure, deterministic, no Math.random()
function deriveDailyAwardKey({ learnerId, dateKey, questId, questFingerprint, economyVersion }) {
  return `hero-daily-coins:v${economyVersion}:${learnerId}:${dateKey}:${questId}:${questFingerprint}`;
}

function deriveLedgerEntryId(awardKey) {
  return `hero-ledger-${djb2Hash(awardKey)}`;
}
```

### Pattern 3: State Migration via Normaliser (No Migration Script)

The Hero state upgraded from v1 (progress-only) to v2 (progress + economy) without a D1 migration script. The normaliser runs on every read:

```javascript
export function normaliseHeroProgressState(raw) {
  if (!raw || typeof raw !== 'object') return emptyProgressState(); // v2 with empty economy
  
  if (raw.version === 1) {
    // Upgrade: preserve daily + recentClaims, add empty economy
    return {
      version: 2,
      daily: normaliseDailyState(raw.daily),
      recentClaims: Array.isArray(raw.recentClaims) ? raw.recentClaims : [],
      economy: emptyEconomyState(),
    };
  }
  
  if (raw.version === 2) {
    return { /* normalise all fields including economy */ };
  }
  
  return emptyProgressState(); // unknown version
}
```

**Critical lesson:** The single equality guard `if (raw.version !== VERSION) return empty()` will WIPE all existing v1 data when VERSION changes to 2. Multi-branch version acceptance is mandatory.

### Pattern 4: Trust Anchor Hardening Before Economy

Before enabling any economy, tighten evidence requirements. P3 accepted completed sessions without `heroContext` (pre-P3 compatibility). P4 rejects them when economy is enabled:

```javascript
// In validatePracticeSession:
if (economyEnabled && !summary?.heroContext) {
  return { found: true, completed: false, code: 'hero_claim_missing_hero_context' };
}
// When economyEnabled=false: P3 compat preserved
```

**Principle:** Economy amplifies the blast radius of a false positive. Tighten trust anchors BEFORE enabling the reward path.

### Pattern 5: Feature Flag Hierarchy (Cumulative Requirements)

```
SHADOW → LAUNCH → CHILD_UI → PROGRESS → ECONOMY
```

Each flag requires all predecessors. Misconfigured state (economy on, progress off) returns 409 `hero_economy_misconfigured` with no writes. Disabling economy preserves all existing state dormant — balance intact for future re-enable.

### Pattern 6: Vocabulary Boundary Split

When an economy intentionally introduces previously-forbidden terms, split the vocabulary scan:

```javascript
// Always forbidden everywhere (pressure/gambling)
HERO_FORBIDDEN_PRESSURE_VOCABULARY = ['deal', 'loot', 'jackpot', 'spend now', ...]

// Allowed ONLY in economy-scoped files
HERO_ECONOMY_ALLOWED_VOCABULARY = ['coin', 'balance', 'Hero Coins']
HERO_ECONOMY_ALLOWED_FILES = ['shared/hero/economy.js', 'HeroQuestCard.jsx', ...]
```

Structural boundary tests enforce both constraints at CI time.

## Why This Matters

1. **No double-award vulnerability**: Three independent idempotency layers prevent the most common economy bug (duplicate rewards under concurrency, retries, or two-tab races)
2. **No new attack surface**: Economy piggybacks on existing auth, CAS, and receipt infrastructure
3. **Reversible deployment**: Feature flag disables economy completely without losing stored balance
4. **Zero subject contamination**: Economy module has zero imports from subject engines; boundary tests structurally enforce this
5. **Foundation for P5**: Clean `balance`, `lifetimeEarned`, `lifetimeSpent`, `ledger` state enables spending mechanics without architectural rework

## When to Apply

- You are adding a transactional economy (coins, points, credits) to an existing write path
- You need deterministic, replay-safe persistence in a database without multi-statement transactions
- You are extending a multi-phase feature (with flag hierarchy) to include a new layer
- You need to migrate JSON state schemas without offline migration scripts
- You want economy vocabulary in child UI without introducing pressure language

## Examples

### Before (P3 — progress only, no economy)

```javascript
// claim-task applyCommand callback
const updatedState = applyClaimToProgress(heroState, claimResult, nowTs);
return { state: updatedState, claimResult };
// Response: { coinsEnabled: false }
```

### After (P4 — progress + economy in same write)

```javascript
// claim-task applyCommand callback
let updatedState = applyClaimToProgress(heroState, claimResult, nowTs);

let economyResult = { awarded: false, amount: 0 };
if (economyEnabled) {
  const { canAward } = canAwardDailyCompletionCoins(updatedState, true);
  if (canAward) {
    economyResult = applyDailyCompletionCoinAward(updatedState, {
      learnerId, nowTs, dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
    });
    updatedState = economyResult.state;
  }
}
return { state: updatedState, claimResult, economyResult };
// Response: { coinsEnabled: true, coinsAwarded: 100, coinBalance: 300 }
```

### State shape evolution

```javascript
// V1 (P3): progress only
{ version: 1, daily: {...}, recentClaims: [...] }

// V2 (P4): progress + economy
{ version: 2, daily: {..., economy: { dailyAwardStatus, ... }}, recentClaims: [...],
  economy: { version: 1, balance: 300, lifetimeEarned: 300, lifetimeSpent: 0, ledger: [...] } }
```

## Related

- `docs/solutions/architecture-patterns/hero-p3-ephemeral-trust-anchor-claim-resolution-2026-04-28.md` — P3 trust anchor and mutation boundary that P4 extends
- `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — DJB2 hash origin and three-layer architecture
- `docs/solutions/architecture-patterns/admin-console-p4-hardening-truthfulness-adversarial-review-2026-04-27.md` — CAS + batch() atomicity reference pattern
- Memory: `project_d1_atomicity_batch_vs_withtransaction.md` — batch() is the ONLY atomic write on D1
- `docs/solutions/architecture-patterns/hero-p5-calm-spending-surface-deterministic-debit-2026-04-29.md` — spending-side extension that builds on this earning foundation; adds triple-layer debit idempotency and v3 state schema
- PR #553 — Hero Mode P4 implementation (squash merge)
- PR #564 — Hero Mode P5 implementation (squash merge)
