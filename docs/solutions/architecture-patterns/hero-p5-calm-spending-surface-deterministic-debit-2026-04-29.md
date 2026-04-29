---
title: "Hero P5: Calm Spending Surface — Deterministic Debit Inside Existing Mutation Boundary"
date: 2026-04-29
category: architecture-patterns
module: hero-mode
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - Adding a spending/debit surface to an existing reward economy
  - Building deterministic debit operations that can never double-spend
  - Extending a multi-command Hero route with new command types
  - Creating child-safe choice surfaces without shop/gambling semantics
  - Adding a feature flag that requires all predecessor flags to be active
tags:
  - hero-mode
  - spending
  - hero-camp
  - debit
  - idempotency
  - deterministic-ids
  - monster-ownership
  - child-safety
  - calm-ux
---

# Hero P5: Calm Spending Surface — Deterministic Debit Inside Existing Mutation Boundary

## Context

Hero Mode P4 shipped a daily Hero Coins award (earning side only). Children accumulated balance with no way to spend it. P5 needed to add a spending surface — Hero Camp — where children invite and grow Hero-owned monsters. The challenge: spending introduces negative ledger entries, double-spend risk, and UX pressure patterns that earning never had.

The key architectural question was whether spending should use the same `runHeroCommandMutation` boundary (CAS + receipt + batch) as earning, or whether a separate write path would be safer. Additionally, the product constraint was extreme: no shop language, no random rewards, no urgency — a calm choice surface for children aged 7-11.

## Guidance

### 1. Spending reuses the earning mutation boundary — no separate write path

All debit operations route through the same `runHeroCommandMutation` that P4's earning uses. This inherits:
- Compare-and-swap via `expectedLearnerRevision`
- Mutation receipt storage for same-requestId replay
- Atomic batch write (D1 `batch()`, not `withTransaction` which is a production no-op)
- Event mirror as fire-and-forget (non-authoritative)

The spending path adds one new safety layer: a **pure resolver pre-check** that detects already-owned/already-stage BEFORE entering the mutation boundary, avoiding unnecessary CAS contention.

```
Client → POST /api/hero/command { command: 'unlock-monster', monsterId, branch, requestId }
  → Flag gates (Camp + Economy + ChildUI all on)
  → Read current hero state
  → resolveHeroCampCommand() ← pure, no DB
     → if already-owned: return 200 immediately (no mutation needed)
     → if insufficient balance: return 409 (no mutation needed)
     → if valid: return intent
  → runHeroCommandMutation(applyCommand)
     → CAS check (expectedRevision === currentRevision)
     → Receipt dedup (same requestId → stored response)
     → Atomic batch: state upsert + receipt + revision bump
  → Return success with server-derived response
```

### 2. Triple-layer idempotency for spending (same as earning)

```
Layer 1: Mutation receipt replay
  → Same requestId returns stored response without re-executing

Layer 2: Pure resolver short-circuit
  → Already-owned or already-at-stage returns 200 with zero cost

Layer 3: Deterministic ledger entry ID
  → hero-ledger-<djb2(idempotencyKey)> structurally prevents duplicate entries
  → Invite key: hero-monster-invite:v1:<learnerId>:<monsterId>:<branch>
  → Grow key:   hero-monster-grow:v1:<learnerId>:<monsterId>:<targetStage>
```

### 3. State extension, not new table

Hero Pool ownership lives in the same `child_game_state` JSON blob (system_id='hero-mode') as economy and progress. The state bumps from v2 to v3, adding a `heroPool` block:

```
v3 = {
  ...v2 (economy + progress),
  heroPool: {
    version: 1,
    rosterVersion: 'hero-pool-v1',
    monsters: { [monsterId]: { owned, stage, branch, investedCoins, ... } },
    recentActions: [...],
  }
}
```

Six monsters × 5 stages is trivially small for a JSON field. No new D1 table needed.

### 4. Server-derived costs — client is never authoritative

The client sends only: `{ command, monsterId, branch/targetStage, requestId, expectedLearnerRevision }`.

The server derives: cost, balance check, new balance, ledger entry ID, next stage, ownership state.

Forbidden client fields are rejected with `hero_client_field_rejected` (400): cost, amount, balance, ledgerEntryId, stage, owned, payload, subjectId, shop, reward, coins, economy.

### 5. Feature flag hierarchy is cumulative and fail-closed

```
SHADOW → LAUNCH → CHILD_UI → PROGRESS → ECONOMY → CAMP
```

Camp enabled without Economy → 409 `hero_camp_misconfigured`. This prevents impossible states (spending without an economy). The flag defaults to `false` and rollback simply hides the surface while preserving all owned-monster state dormant.

### 6. Economy normaliser hardened BEFORE spending code

P5's first unit hardened the normaliser to validate debit-side invariants:
- Balance finite non-negative (NaN/Infinity → 0)
- Spending entries must have negative amounts (positive → dropped)
- Earning entries must have positive amounts (negative → dropped)
- Unknown entry types dropped from projection
- Invalid balanceAfter dropped

This runs BEFORE any spending code, preventing malformed state from earlier bugs from causing incorrect spend behaviour.

### 7. Calm UX is a structural constraint, not just copy guidance

Vocabulary enforcement is structural, not advisory:
- `HERO_FORBIDDEN_PRESSURE_VOCABULARY` scanned in boundary tests
- No "shop", "buy", "deal", "limited time", "loot", "spend now" in any Camp file
- Tests scan JSX rendered output for forbidden strings
- Internal code uses "unlock-monster" / "evolve-monster"; child UI says "Invite" / "Grow"

## Why This Matters

**Double-spend prevention without distributed locks.** D1 is a single-region SQLite — no distributed transactions. The CAS pattern (expectedRevision) provides optimistic concurrency. The deterministic ledger ID provides structural deduplication. The pure resolver pre-check avoids unnecessary CAS contention. Together, these three layers make double-spend impossible without any distributed coordination.

**Extending safely vs. replacing.** P5 added 7,800 lines without modifying the P4 earning path. The mutation boundary, receipt system, and event mirror were reused unchanged. This proves the boundary was designed correctly in P3 — spending was a new command type, not a new system.

**Child safety as architecture.** "Don't make it a shop" isn't just a product requirement — it's reflected in the type system (no cost field on requests), the vocabulary boundary tests (structural scan of all Camp files), and the UI design (confirmation dialogs, no countdown timers, "Not now" as equal-weight dismiss). The architecture prevents pressure even if future developers try to add urgency copy.

## When to Apply

- Adding any debit operation to an existing CAS mutation boundary
- Building a child-facing spending surface that must avoid gambling/shop patterns
- Extending a feature-flagged system where the new layer requires all predecessors
- Needing idempotent negative-amount entries in a ledger without external dedup services
- Creating a "choice layer" on top of a reward system that must not become a second reward engine

## Examples

### Before: P4 (earning only)

```js
// economy.js — only positive entries
const entry = {
  type: 'daily-completion-award',
  amount: 100,  // always positive
  balanceAfter: state.economy.balance + 100,
};
```

### After: P5 (spending added)

```js
// monster-economy.js — negative entries with deterministic IDs
const idempotencyKey = `hero-monster-invite:v1:${learnerId}:${monsterId}:${branch}`;
const entryId = `hero-ledger-${deriveLedgerEntryId(idempotencyKey)}`;
const entry = {
  entryId,
  idempotencyKey,
  type: 'monster-invite',
  amount: -HERO_MONSTER_INVITE_COST,  // negative
  balanceAfter: economyState.balance - HERO_MONSTER_INVITE_COST,
};
```

### Before: No pre-check (all requests hit mutation boundary)

```js
// Every request enters CAS, even if already-owned
const result = await runHeroCommandMutation(accountId, learnerId, command, applyFn);
```

### After: Pure resolver short-circuits before mutation

```js
const campResult = resolveHeroCampCommand({ command, body, heroState, learnerId });
if (campResult.heroCampAction?.status === 'already-owned') {
  return json({ ok: true, heroCampAction: campResult.heroCampAction }); // no CAS needed
}
// Only valid new-spend intents enter the mutation boundary
const mutationResult = await repository.runHeroCommand(accountId, learnerId, cmd, applyFn);
```

## Related

- `docs/solutions/architecture-patterns/hero-p4-coins-economy-capped-daily-award-2026-04-29.md` — the earning-side foundation P5 builds on
- `docs/solutions/architecture-patterns/hero-p3-ephemeral-trust-anchor-claim-resolution-2026-04-28.md` — the mutation boundary pattern P5 reuses
- `docs/solutions/architecture-patterns/hero-p0-read-only-shadow-subsystem-2026-04-27.md` — the three-layer split P5 extends
- `docs/plans/james/hero-mode/hero-mode-p5-completion-report.md` — comprehensive delivery report
- PR #564 — implementation
