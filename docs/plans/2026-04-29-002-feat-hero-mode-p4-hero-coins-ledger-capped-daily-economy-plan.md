---
title: "feat: Hero Mode P4 — Hero Coins ledger and capped daily economy"
type: feat
status: active
date: 2026-04-29
origin: docs/plans/james/hero-mode/hero-mode-p4.md
---

# feat: Hero Mode P4 — Hero Coins ledger and capped daily economy

## Overview

Hero Mode P4 adds the first reward economy to the platform. When a learner completes today's Hero Quest (through the existing P3 `claim-task` flow), the system awards exactly 100 Hero Coins — once, deterministically, and idempotently. The economy is purely additive: P4 earns Coins, P5 spends them.

The core constraint: **the award is a reaction to authoritative daily completion, never a goal function for the scheduler.** It strengthens the daily learning contract without introducing per-question rewards, rushing incentives, or gambling mechanics.

---

## Problem Frame

P3 (PR #533) proved that completion claims are idempotent, server-authoritative, and safe. However, P3's claim evidence resolver accepts completed practice sessions that lack `heroContext` in their summary (line 210-211 in `worker/src/hero/claim.js`). This pre-P3 compatibility branch was tolerable before economy but is unsafe once Coins flow from completion evidence.

P4 must (1) tighten the trust anchor so only Hero-verified evidence can lead to Coins, then (2) build a deterministic, capped economy layer inside the existing `claim-task` mutation boundary.

(see origin: `docs/plans/james/hero-mode/hero-mode-p4.md`)

---

## Requirements Trace

- R1. Daily Hero Quest completion awards exactly +100 Hero Coins, once per day per quest
- R2. Award is applied inside the Hero mutation boundary as part of the same atomic `batch()` write — never a separate statement
- R3. Ledger entries use deterministic idempotency keys and entry IDs (no `Math.random()`, no `Date.now()`)
- R4. Missing `summary_json.heroContext` in claim evidence is rejected with `hero_claim_missing_hero_context` when economy is enabled
- R5. Read model evolves to v5 with child-safe economy fields behind `HERO_MODE_ECONOMY_ENABLED`
- R6. Economy flag disabled preserves P3 behaviour exactly — no Coins displayed, no economy writes
- R7. Two-tab, replay, stale-write, and cross-learner attacks cannot double-award Coins
- R8. Hero Coins do not modify subject Stars, mastery, scheduler, marking, or feedback
- R9. HeroTaskBanner remains economy-free; economy copy appears only in HeroQuestCard economy block
- R10. Vocabulary boundary tests split into allowed-economy-terms and forbidden-pressure-terms
- R11. `HERO_MODE_ECONOMY_ENABLED` flag requires all P3 flags; misconfigured state returns safe error
- R12. Economy telemetry/event mirror uses deterministic IDs derived from ledger entries

---

## Scope Boundaries

- No Hero Camp, monster ownership, unlock/evolve, spending, shop UI, branch choices
- No per-question, correctness-only, speed, streak, or random rewards
- No new D1 tables (economy state lives in existing `child_game_state` under `system_id='hero-mode'`)
- No client-computed balance — server read model is authoritative
- No backfilling Coins for pre-P4 completions
- No subject Stars awarded by Hero; no mastery changes from Hero claim
- No paid currency, parent-adjusted allowance, or six-subject expansion

### Deferred to Follow-Up Work

- Hero Camp + Hero Pool monsters + unlock/evolve spending → P5
- Long-term ledger archival and event-log reconciliation → P6+
- Bonus economy (per-task rewards, streaks) → not planned

---

## Context & Research

### Relevant Code and Patterns

- **Claim-task mutation**: `worker/src/app.js:1431-1634` — current P3 claim handler with `resolveHeroClaimCommand`, `runHeroCommandMutation`, event_log writes
- **Hero state shape**: `shared/hero/progress-state.js` — `HeroModeProgressStateV1` with `version: 1`, `daily`, `recentClaims`
- **Trust anchor gap**: `worker/src/hero/claim.js:210-211` — `validatePracticeSession` accepts sessions without `heroContext`
- **Mutation boundary**: `worker/src/repository.js:7944-8115` — `runHeroCommandMutation` with CAS, receipt dedup, atomic batch
- **Read model assembler**: `worker/src/hero/read-model.js` — v3/v4, `coinsEnabled: false` hardcoded
- **UI model**: `src/platform/hero/hero-ui-model.js` — `buildHeroHomeModel`
- **HeroQuestCard**: `src/surfaces/home/HeroQuestCard.jsx` — daily-complete state at line 30-42
- **Vocabulary boundary**: `shared/hero/hero-copy.js:13-35` — `HERO_FORBIDDEN_VOCABULARY` (20 tokens)
- **Feature flags**: `wrangler.jsonc:45-48` — four Hero flags, all default `false`

### Institutional Learnings

- **D1 atomicity**: `batch(db, [...])` is the ONLY atomic write mechanism. `withTransaction` is a production no-op. All coin writes must be in the same batch as claim progress.
- **P3 trust anchor pattern**: Two-layer idempotency — (1) same requestId replays stored response; (2) different requestId for already-completed returns safe status without double-counting.
- **Monotonic latch from Punctuation P6**: Daily cap enforcement must be server-side; seed `coinsBalance = 0` explicitly during migration; never retroactively award for past completions.
- **P2 boundary test S-L4**: Scans for economy vocabulary tokens — must be updated with deliberate exclusions for the economy module.
- **Never return balance in error responses**: Apply P2 Pattern 4 fingerprint-leak rule.
- **Flag hierarchy**: Each new flag requires predecessors. Economy misconfiguration returns safe error code.

---

## Key Technical Decisions

- **State migration v1→v2 in-place**: Extend `child_game_state` JSON with economy block. The normaliser accepts v1 and upgrades to v2 with empty economy. No new D1 table.
- **Award inside existing `claim-task`**: No new public command. The final task claim triggers the award when daily status transitions to `completed`.
- **Deterministic ledger IDs via DJB2 hash**: Idempotency key = `hero-daily-coins:v1:<learnerId>:<dateKey>:<questId>:<questFingerprint>`. Entry ID = `hero-ledger-<djb2(idempotencyKey)>`. Structural duplicate prevention.
- **Economy flag as fifth level**: `SHADOW → LAUNCH → CHILD_UI → PROGRESS → ECONOMY`. Disabling economy preserves existing state dormant.
- **Read model version gating**: Progress-only = v4 (unchanged). Economy enabled = v5 (adds economy block).
- **Shared pure economy module**: `shared/hero/economy.js` — all constants, state helpers, deterministic ID derivation. Zero Worker/React/D1 imports.

---

## Open Questions

### Resolved During Planning

- **Should economy state live in a separate system_id row?** No — extend the existing `hero-mode` state. One atomic read/write per mutation.
- **Should the event mirror be inside or outside the batch?** Outside (best-effort), matching P3 pattern. Deterministic IDs enable safe ON CONFLICT DO NOTHING.
- **Read model v5 when economy disabled?** Return v4 shape (no version bump). Simpler client logic.

### Deferred to Implementation

- Exact DJB2 hash implementation (may reuse `shared/hero/seed.js` hash helper if suitable)
- Whether `recentLedger` in read model is capped at 7 or 30 entries for child display (origin suggests 180 internal cap, child-safe subset smaller)
- Precise copy wording for daily-complete-with-coins card state (follow origin §16 guidance)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
claim-task request arrives (existing P3 flow)
  │
  ├─ resolveHeroClaimCommand (validates evidence)
  │   └─ P4 hardening: reject if heroContext.source !== 'hero-mode' AND economy enabled
  │
  ├─ runHeroCommandMutation (CAS + receipt + batch)
  │   └─ applyCommand callback:
  │       ├─ applyClaimToProgress (P3 — updates task status, daily status)
  │       ├─ IF daily.status transitions to 'completed' AND economy enabled:
  │       │   └─ applyDailyCompletionCoinAward (P4)
  │       │       ├─ check dailyAwardLedgerEntryId not already set
  │       │       ├─ derive deterministic idempotencyKey + entryId
  │       │       ├─ append ledger entry
  │       │       ├─ increment balance + lifetimeEarned
  │       │       └─ set daily.economy award marker
  │       └─ return { state: v2, claimResult, economyResult }
  │
  ├─ batch(db, [progress_upsert, receipt, revision_bump]) ← single atomic write
  │
  ├─ event mirror (fire-and-forget): hero.coins.awarded with deterministic ID
  │
  └─ response includes: coinsEnabled, coinsAwarded, coinBalance
```

---

## Implementation Units

- U0. **Preflight: trust anchor hardening**

**Goal:** Reject claim evidence that lacks verified `heroContext.source === 'hero-mode'` when the economy flag is enabled, preventing Coins from flowing through unverified completions.

**Requirements:** R4, R7

**Dependencies:** None

**Files:**
- Modify: `worker/src/hero/claim.js`
- Modify: `shared/hero/claim-contract.js`
- Modify: `worker/src/app.js` (pass economy flag to resolver)
- Test: `tests/hero-claim-resolver.test.js`
- Test: `tests/hero-p4-trust-anchor.test.js`

**Approach:**
- Add an `economyEnabled` parameter to `resolveHeroClaimCommand`
- In `validatePracticeSession`, when `economyEnabled && !summary?.heroContext`, return `{ found: true, completed: false, code: 'hero_claim_missing_hero_context' }` instead of accepting
- The fallback path remains for P3-only mode (economy disabled) for diagnostic purposes
- Add `'economy'` and `'amount'` to `FORBIDDEN_CLAIM_FIELDS`

**Execution note:** Characterisation-test the current claim resolver output shapes before modifying.

**Patterns to follow:**
- Existing rejection codes in `worker/src/hero/claim.js` (line 18-23)
- `FORBIDDEN_CLAIM_FIELDS` pattern in `shared/hero/claim-contract.js`

**Test scenarios:**
- Happy path: Claim with valid `heroContext.source === 'hero-mode'` succeeds (economy on)
- Happy path: Claim with valid heroContext succeeds (economy off — no change)
- Error path: Claim with missing heroContext rejected with `hero_claim_missing_hero_context` (economy on)
- Edge case: Claim with missing heroContext still succeeds when economy off (P3 compat)
- Error path: Client sends `economy` or `amount` field → rejected with `hero_claim_forbidden_fields`
- Edge case: Pre-P3 session (has no heroContext) — rejected economy-on, accepted economy-off

**Verification:**
- All existing P3 hero claim tests pass unchanged (economy disabled by default)
- New tests demonstrate the trust anchor tightening under economy-enabled flag

---

- U1. **Shared economy contract and constants**

**Goal:** Create the pure shared economy module with constants, deterministic ID derivation, state types, and normalisation helpers. Zero side effects.

**Requirements:** R1, R3, R12

**Dependencies:** None (parallel with U0)

**Files:**
- Create: `shared/hero/economy.js`
- Test: `tests/hero-economy-contract.test.js`

**Approach:**
- Export constants: `HERO_ECONOMY_VERSION = 1`, `HERO_DAILY_COMPLETION_COINS = 100`, `HERO_DAILY_BONUS_COINS_CAP = 0`, `HERO_LEDGER_RECENT_LIMIT = 180`
- Export `HERO_ECONOMY_ENTRY_TYPES = ['daily-completion-award', 'admin-adjustment']`
- Implement `deriveDailyAwardKey({ learnerId, dateKey, questId, questFingerprint, economyVersion })` → deterministic string
- Implement `deriveLedgerEntryId(awardKey)` → `hero-ledger-<djb2hash>` using a pure DJB2 hash (no crypto dependency)
- Implement `emptyEconomyState()` → `{ version: 1, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null }`
- Implement `normaliseHeroEconomyState(raw)` → safe normalised state
- Assert: no `Math.random()`, no `Date.now()`, no Worker/React/D1 imports

**Patterns to follow:**
- `shared/hero/progress-state.js` — normaliser pattern
- `shared/hero/seed.js` — deterministic hashing pattern
- `shared/hero/quest-fingerprint.js` — DJB2-style hash derivation

**Test scenarios:**
- Happy path: `deriveDailyAwardKey` produces stable key for same inputs
- Happy path: `deriveLedgerEntryId` produces `hero-ledger-` prefixed deterministic ID
- Edge case: Different inputs produce different keys (collision resistance)
- Edge case: Same inputs across calls produce identical keys (determinism)
- Happy path: `normaliseHeroEconomyState(null)` returns empty state
- Edge case: Malformed economy state normalises safely (no throw)
- Integration: No `Math.random()` or `Date.now()` in the module source
- Integration: No Worker/React/D1/browser imports in the module

**Verification:**
- `node --test tests/hero-economy-contract.test.js` passes
- `shared/hero/economy.js` contains zero impure imports (structural scan)

---

- U2. **Hero state v2 migration**

**Goal:** Migrate the Hero progress state from v1 (progress-only) to v2 (progress + economy). The normaliser accepts v1 input and safely upgrades to v2 with an empty economy block.

**Requirements:** R6

**Dependencies:** U1

**Files:**
- Modify: `shared/hero/progress-state.js`
- Test: `tests/hero-progress-state.test.js`

**Approach:**
- Change `HERO_PROGRESS_VERSION` from `1` to `2`
- Update `emptyProgressState()` to include `economy: emptyEconomyState()`
- Update `normaliseHeroProgressState` to handle:
  - `version: 1` → upgrade to v2 with empty economy (preserving daily + recentClaims)
  - `version: 2` → normalise including economy block
  - Missing/malformed → return empty v2 state
  - **Critical:** Replace the single `if (raw.version !== HERO_PROGRESS_VERSION) return emptyProgressState()` guard with multi-branch version acceptance (v1 upgrades, v2 normalises, anything else rejects). The current single-equality check at line 18 would wipe all v1 state if naively changed to `version: 2`.
- Preserve all existing daily progress and recentClaims during migration
- Export `HERO_STATE_VERSION = 2` (rename from `HERO_PROGRESS_VERSION` for clarity, but keep backward-compatible export)

**Patterns to follow:**
- Existing `normaliseHeroProgressState` in `shared/hero/progress-state.js`
- `normaliseHeroEconomyState` from U1

**Test scenarios:**
- Happy path: v1 state migrates to v2 with empty economy, daily progress preserved
- Happy path: v2 state normalises correctly with existing economy data
- Edge case: v1 state with active daily progress — daily and recentClaims survive migration
- Edge case: null/undefined input returns empty v2 state
- Edge case: Malformed version (e.g., 99) returns empty v2 state
- Error path: economy block partially corrupt — normalises to safe defaults without losing daily progress

**Verification:**
- All existing `tests/hero-progress-state.test.js` pass (with updated version expectation)
- New migration-specific tests pass

---

- U3. **Daily completion award helper**

**Goal:** Implement the pure `applyDailyCompletionCoinAward` function that applies the daily award to hero state when conditions are met, and the `canAwardDailyCompletionCoins` eligibility check.

**Requirements:** R1, R2, R3, R7

**Dependencies:** U1, U2

**Files:**
- Modify: `shared/hero/economy.js`
- Test: `tests/hero-economy-award.test.js`

**Approach:**
- `canAwardDailyCompletionCoins(heroState, daily, economyEnabled)` → `{ canAward: boolean, reason: string }`
  - Checks: economy enabled, daily.status === 'completed', `daily.economy.dailyAwardLedgerEntryId` not already set, ledger does not contain matching idempotency key
- `applyDailyCompletionCoinAward(heroState, { learnerId, nowTs, dailyCompletionCoins })` → updated state OR `{ awarded: false, alreadyAwarded: true, ... }`
  - Extracts `dateKey`, `questId`, `questFingerprint` from `heroState.daily` (guaranteed present because `canAward` checked `daily.status === 'completed'`)
  - Derives deterministic idempotency key and entry ID via `deriveDailyAwardKey`
  - Appends ledger entry with full source metadata
  - Increments `economy.balance` and `economy.lifetimeEarned`
  - Sets `daily.economy.dailyAwardStatus = 'awarded'`, `dailyAwardLedgerEntryId`, `dailyAwardedAt`, `dailyAwardCoinsAwarded`
  - Trims ledger to `HERO_LEDGER_RECENT_LIMIT` entries
- Both functions are pure — receive `nowTs` as parameter, never call `Date.now()`

**Patterns to follow:**
- `applyClaimToProgress` in `shared/hero/progress-state.js` — immutable state transformation pattern
- Punctuation P6 starHighWater monotonic latch

**Test scenarios:**
- Happy path: Daily just completed + no prior award → award applied, balance incremented, ledger entry appended
- Happy path: Award returns correct `{ awarded: true, amount: 100, ledgerEntryId, balanceAfter }`
- Edge case: Already-awarded state → returns `{ awarded: false, alreadyAwarded: true }`, balance unchanged
- Edge case: Ledger already contains matching idempotency key → no double-count even if daily marker missing
- Edge case: Economy disabled → `canAward` returns false with reason
- Edge case: Daily not completed → `canAward` returns false
- Edge case: Ledger at HERO_LEDGER_RECENT_LIMIT → oldest entry pruned after new append
- Integration: Derived entry IDs are deterministic across multiple calls with same inputs
- Error path: Malformed daily block → `canAward` returns false safely (no throw)

**Verification:**
- All award helper tests pass
- Idempotency proven: calling `applyDailyCompletionCoinAward` twice with same inputs produces same output

---

- U4. **Worker claim-task economy integration**

**Goal:** Extend the `claim-task` mutation handler in `app.js` to apply the daily Coins award inside the same `runHeroCommandMutation` callback when daily completion is reached and economy is enabled.

**Requirements:** R1, R2, R6, R7, R11, R12

**Dependencies:** U0, U1, U2, U3

**Files:**
- Modify: `worker/src/app.js` (claim-task handler, ~line 1431-1634)
- Modify: `wrangler.jsonc` (add `HERO_MODE_ECONOMY_ENABLED: "false"`)
- Modify: `worker/wrangler.example.jsonc` (add economy flag)
- Test: `tests/worker-hero-command.test.js`
- Test: `tests/hero-p4-economy-mutation.test.js`

**Approach:**
- Read `HERO_MODE_ECONOMY_ENABLED` from env in the claim-task handler
- Check flag hierarchy: if economy enabled but progress disabled, return 409 `hero_economy_misconfigured`
- **Two response sites need economy fields:**
  - (a) The `already-completed` early return (app.js ~line 1508-1522) — bypasses mutation, must source economy fields from pre-loaded `heroProgressState.economy`
  - (b) The post-mutation response (app.js ~line 1614) — has fresh state from applyCommand callback
- Inside the `runHeroCommandMutation` callback (after `applyClaimToProgress`):
  - Check if `beforeState.daily.status !== 'completed' && afterClaim.daily.status === 'completed'`
  - If daily just completed AND economy enabled: call `applyDailyCompletionCoinAward`
  - The resulting state (v2 with economy) is written in the same batch
- Update both response sites to include: `coinsEnabled`, `coinsAwarded`, `coinBalance`, `dailyCoinsAlreadyAwarded`
- Event mirror for `hero.coins.awarded` with deterministic ID: `hero-evt-<ledgerEntryId>` (fire-and-forget, outside batch)
- Structured logs for all economy events (awarded, already-awarded, blocked, disabled)

**Patterns to follow:**
- Existing claim-task handler structure at `worker/src/app.js:1431-1634`
- `runHeroCommandMutation` batch pattern at `worker/src/repository.js:8079-8102`
- D1 atomicity via `batch(db, [...])` — never a second write

**Test scenarios:**
- Happy path: Final task claim completes daily quest → +100 Coins awarded exactly once, response includes `coinsAwarded: 100`
- Happy path: Non-final task claim (daily still active) → 0 Coins, `coinsAwarded: 0`
- Happy path: Economy disabled → claim succeeds, P3 behaviour preserved, `coinsEnabled: false`
- Edge case: Same request replay (same requestId) → replayed response includes same coins data
- Edge case: Different request after completion → `already-completed` + `dailyCoinsAlreadyAwarded: true`
- Edge case: Two tabs: concurrent final claims → one awards, other gets `already-completed`
- Edge case: Stale revision → rejected before award (CAS guard)
- Error path: Economy enabled + progress disabled → 409 `hero_economy_misconfigured`
- Error path: Event-log write failure → does NOT duplicate award (fire-and-forget pattern)
- Integration: No `child_subject_state` or `practice_sessions` writes from economy code
- Integration: Economy event ID matches pattern `hero-evt-<ledgerEntryId>` (deterministic)
- Edge case: Grace window — task started before midnight, claimed after → awards under original dateKey

**Verification:**
- All existing `tests/worker-hero-command.test.js` pass (economy flag off by default)
- New economy mutation tests pass under economy-enabled flag
- Structured logs emitted for every economy event type

---

- U5. **Read model v5**

**Goal:** Evolve the Hero read model to v5 when economy is enabled, exposing child-safe economy fields (balance, today's award status, recent ledger summary).

**Requirements:** R5, R6, R8

**Dependencies:** U2, U4

**Files:**
- Modify: `worker/src/hero/read-model.js`
- Modify: `worker/src/hero/routes.js` (pass economy flag)
- Test: `tests/worker-hero-read-model.test.js`
- Test: `tests/hero-p4-read-model.test.js`

**Approach:**
- Add `economyEnabled` parameter to `buildHeroShadowReadModel`
- When `progressEnabled && economyEnabled`:
  - Return `version: 5` with economy block derived from the persisted hero state
  - Update `progress.stateVersion` from `1` to `2` (reflects underlying state version change)
  - Economy block: `{ enabled: true, version: 1, balance, lifetimeEarned, lifetimeSpent, today: { dateKey, questId, awardStatus, coinsAvailable, coinsAwarded, ledgerEntryId, awardedAt }, recentLedger: [...] }`
  - Strip internal ledger fields (source, completedTaskIds, etc.) from child-visible `recentLedger`
- When `progressEnabled && !economyEnabled`: return v4 unchanged, `coinsEnabled: false`, `progress.stateVersion: 2` (state is v2 after migration but economy not exposed)
- `selectChildSafeEconomyReadModel(heroState, daily)` in `shared/hero/economy.js` builds the child-safe projection
- Never return balance in error responses

**Patterns to follow:**
- Existing v3→v4 conditional in `worker/src/hero/read-model.js:296-451`
- Debug stripping pattern at `worker/src/hero/routes.js:96`

**Test scenarios:**
- Happy path: Economy enabled → version 5, economy block present with correct balance
- Happy path: Economy disabled → version 4, `coinsEnabled: false`, no economy block
- Happy path: `today.awardStatus = 'awarded'` after daily completion with coins
- Happy path: `today.awardStatus = 'available'` before daily completion
- Edge case: Economy state persists but hidden when flag off (balance preserved internally)
- Edge case: Malformed economy state does not crash read-model assembly
- Integration: Child-safe ledger excludes source details, request IDs, account IDs
- Integration: Debug fields stripped from child-visible response (existing pattern preserved)

**Verification:**
- Existing read-model tests pass (economy flag off by default)
- New v5 tests verify economy block shape and child-safe filtering

---

- U6. **Client/UI economy acknowledgement**

**Goal:** Update the Hero client response handling, `buildHeroHomeModel`, and `HeroQuestCard` daily-complete state to show calm economy copy when enabled. Keep HeroTaskBanner economy-free.

**Requirements:** R5, R8, R9

**Dependencies:** U5

**Files:**
- Modify: `src/platform/hero/hero-ui-model.js`
- Modify: `src/surfaces/home/HeroQuestCard.jsx`
- Modify: `shared/hero/hero-copy.js` (add economy copy constants)
- Test: `tests/hero-dashboard-progress-card.test.js`
- Test: `tests/hero-p4-economy-ui.test.js`

**Approach:**
- `buildHeroHomeModel` derives economy fields from read model v5:
  - `coinsEnabled`, `coinBalance`, `coinsAwardedToday`, `dailyAwardStatus`, `showCoinsAwarded` (true when awardStatus === 'awarded' and current session just claimed), `showCoinBalance`
- `HeroQuestCard` daily-complete state: when `coinsEnabled && hero.dailyAwardStatus === 'awarded'`:
  - Show calm copy: "100 Hero Coins added." + "Balance: N Hero Coins."
  - Use `aria-live="polite"` for balance update
- When economy disabled: render P3 daily-complete copy unchanged
- `HeroTaskBanner` — NO changes. Economy-free by design.
- Add to `shared/hero/hero-copy.js`:
  - `HERO_ECONOMY_COPY = { coinsAdded: '100 Hero Coins added.', balanceLabel: 'Hero Coins', savedForCamp: 'Hero Coins saved for Hero Camp.' }`
  - `HERO_FORBIDDEN_PRESSURE_VOCABULARY` (subset of current list, minus 'coin')
  - `HERO_ECONOMY_COPY_ALLOWLIST = ['Hero Coins', 'balance', 'added', 'saved']`
- No animation, no countdown, no shop CTA, no spend button

**Patterns to follow:**
- Existing `buildHeroHomeModel` derivation in `src/platform/hero/hero-ui-model.js`
- Existing `HeroQuestCard` daily-complete render at `src/surfaces/home/HeroQuestCard.jsx:30-42`
- P3 progress copy pattern in `shared/hero/hero-copy.js`

**Test scenarios:**
- Happy path: Daily complete + economy on → card shows "100 Hero Coins added." + balance
- Happy path: Daily complete + economy off → card shows P3 copy unchanged
- Happy path: `buildHeroHomeModel` returns correct economy fields from v5 read model
- Edge case: Economy on but award not yet issued (still active) → no coins copy shown
- Integration: No economy copy in `HeroTaskBanner` (structural scan)
- Integration: No forbidden pressure vocabulary in any Hero UI surface
- Integration: `aria-live="polite"` present on balance update element
- Edge case: Zero balance displays correctly (first day)

**Verification:**
- UI tests pass for both economy-on and economy-off states
- HeroTaskBanner tests confirm zero economy vocabulary

---

- U7. **Vocabulary boundary update and scope-aware tests**

**Goal:** Split the vocabulary boundary so `coin`/`Hero Coins` is allowed in P4 economy surfaces but pressure/gambling terms remain forbidden everywhere.

**Requirements:** R9, R10

**Dependencies:** U6

**Co-deployment note:** U2 imports `normaliseHeroEconomyState` into `progress-state.js`. If P3 boundary tests (which scan for economy-related tokens in source) run after U2 but before U7, CI may flag false positives. U2 and U7 should land in the same PR, or U7 should land first as a purely additive vocabulary split (no economy code yet).

**Files:**
- Modify: `shared/hero/hero-copy.js` (update `HERO_FORBIDDEN_VOCABULARY`)
- Modify: `tests/hero-p3-boundary.test.js`
- Create: `tests/hero-p4-vocabulary-boundary.test.js`

**Approach:**
- Split `HERO_FORBIDDEN_VOCABULARY` into two lists:
  - `HERO_FORBIDDEN_PRESSURE_VOCABULARY` — always forbidden everywhere: `deal`, `loot`, `jackpot`, `limited time`, `daily deal`, `don't miss out`, `streak reward`, `grind`, `buy now`, `spend now`, `you missed out`, `unlock now`
  - The `coin` token is removed from the universal forbidden list — it's now allowed only in economy-scoped files
- New boundary test scans:
  - Economy terms (`coin`, `balance`, `Hero Coins`) must appear ONLY in: `shared/hero/economy.js`, `shared/hero/hero-copy.js` economy section, `worker/src/hero/economy*`, `src/platform/hero/*economy*`, HeroQuestCard economy block
  - Pressure terms must appear NOWHERE in Hero child UI surfaces
  - Subject engines, subject services, scheduler, HeroTaskBanner remain free of ALL economy language
- Update P3 boundary test to reference the new split vocabulary lists

**Patterns to follow:**
- Existing S-L4 structural scan in `tests/hero-p3-boundary.test.js`
- `HERO_FORBIDDEN_VOCABULARY` scan pattern

**Test scenarios:**
- Happy path: `coin` token found in `shared/hero/economy.js` → allowed
- Happy path: `deal` token found anywhere in Hero surfaces → test fails (forbidden)
- Edge case: `coin` token in HeroTaskBanner → test fails (not economy-scoped)
- Edge case: `coin` token in subject engine file → test fails (not hero-economy)
- Integration: All pressure vocabulary terms scanned across hero source files
- Integration: P3 boundary test still passes with updated vocabulary references

**Verification:**
- All boundary tests pass
- No pressure vocabulary in any Hero surface

---

- U8. **Abuse, idempotency, and E2E tests**

**Goal:** Comprehensive safety tests covering duplicate awards, two-tab races, cross-learner attacks, forged requests, stale writes, and missing heroContext under economy-enabled conditions.

**Requirements:** R4, R7, R8

**Dependencies:** U4, U5, U6

**Files:**
- Create: `tests/hero-p4-economy-safety.test.js`
- Create: `tests/hero-p4-economy-e2e.test.js`

**Approach:**
- Test through the full Worker handler path (not just pure helpers) to prove end-to-end safety
- Use the test server helper pattern from `tests/helpers/worker-server.js`
- Cover all cases from origin §18.5 (security and abuse tests)
- Prove that economy code never writes to `child_subject_state` or `practice_sessions`

**Patterns to follow:**
- `tests/hero-claim-flow-e2e.test.js` — end-to-end claim flow pattern
- `tests/hero-progress-mutation-safety.test.js` — mutation safety testing

**Test scenarios:**
- Edge case: Same final claim-task request replay → same award response (idempotent via receipt)
- Edge case: Different request after daily complete → `already-completed`, no second award
- Edge case: Two tabs race: two concurrent final claims → only one awards Coins
- Error path: Missing `summary_json.heroContext` + economy enabled → rejected, no Coins
- Error path: Cross-learner session evidence → rejected, no Coins
- Error path: Forged questFingerprint → rejected, no Coins
- Error path: Stale date outside grace window → rejected, no Coins
- Error path: Client sends `coins`, `balance`, `reward`, `economy`, `amount` fields → rejected
- Integration: Same ledger entry ID cannot be posted twice (deterministic + ON CONFLICT)
- Integration: Event-log failure does NOT cause retry that double-awards
- Integration: No `child_subject_state` writes from economy code path
- Integration: Economy disabled → zero economy state changes during claim flow

**Verification:**
- All abuse/safety tests pass
- Coin balance can only increase through verified daily completion (no other path)

---

- U9. **Event/log mirror and monitoring**

**Goal:** Add deterministic `hero.coins.awarded` event mirror and structured economy telemetry logs.

**Requirements:** R12

**Dependencies:** U4

**Files:**
- Modify: `worker/src/app.js` (already partially done in U4 — this unit adds comprehensive logging)
- Test: `tests/hero-p4-economy-telemetry.test.js`

**Approach:**
- Economy event: `hero.coins.awarded` with `id = hero-evt-<ledgerEntryId>` (deterministic, ON CONFLICT DO NOTHING)
- Structured console.log events:
  - `hero_daily_coins_awarded` — successful award
  - `hero_daily_coins_already_awarded` — replay/duplicate attempt
  - `hero_daily_coins_blocked` — canAward returned false
  - `hero_daily_coins_disabled` — economy flag off
  - `hero_daily_coins_duplicate_prevented` — structural dedup
  - `hero_economy_state_migrated` — v1→v2 upgrade happened
  - `hero_economy_invariant_failed` — unexpected state (should never fire)
- All logs include: learnerId, questId, dateKey, ledgerEntryId (when available)

**Patterns to follow:**
- Existing event mirror pattern at `worker/src/app.js:1557-1598`
- Structured logging pattern used throughout the claim handler

**Test scenarios:**
- Happy path: Successful award emits `hero_daily_coins_awarded` log with all fields
- Happy path: Event mirror row written with deterministic ID
- Edge case: Duplicate event insert (same ID) → ON CONFLICT DO NOTHING, no error
- Edge case: Already-awarded emits `hero_daily_coins_already_awarded` log
- Error path: Event write failure logged but does not affect response or state

**Verification:**
- Telemetry tests confirm all structured log events fire at correct points
- Event mirror IDs match ledger entry IDs

---

## System-Wide Impact

- **Interaction graph:** `claim-task` handler → `resolveHeroClaimCommand` (enhanced) → `applyClaimToProgress` → `applyDailyCompletionCoinAward` → `batch(db, [...])` → event mirror. The read-model route gains economy fields.
- **Error propagation:** Economy helper failures are caught inside the applyCommand callback. A failed award does NOT fail the claim — the claim succeeds with `coinsAwarded: 0` and logs the invariant failure.
- **State lifecycle risks:** D1 batch atomicity ensures progress + economy are always consistent. If the batch fails, neither is written (CAS guard). Stale state cannot produce a double-award because the ledger entry ID is deterministic.
- **API surface parity:** The claim-task response shape extends (adds economy fields). The read-model response adds v5 shape. Both are additive — clients receiving unknown fields ignore them.
- **Integration coverage:** E2E tests (U8) prove the full path through Worker handler + resolver + mutation + batch + response.
- **Unchanged invariants:** Subject Stars, mastery algorithms, scheduler behaviour, marking, feedback, monster-codex — all unchanged. The economy module has zero imports from subject code. Boundary tests (U7) structurally enforce this.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| State migration corrupts existing P3 progress | v1→v2 normaliser preserves all daily/claims fields; characterisation test snapshots v1 output before modification |
| Deterministic hash collision between different quests | DJB2 on the full idempotency key (includes learnerId, dateKey, questId, questFingerprint) — collision requires identical inputs |
| D1 batch failure leaves inconsistent state | Impossible — `batch()` is atomic per Cloudflare D1 contract; CAS guard prevents stale writes |
| Economy flag enabled without progress flag | Explicit flag hierarchy check returns 409 before any write |
| Child sees balance before economy is ready | Read model returns v4 (no economy) when flag is off; UI renders P3 copy |
| Event log table growth from daily coin events | ON CONFLICT DO NOTHING prevents duplicates; same growth pattern as existing P3 events |

---

## Sources & References

- **Origin document:** [docs/plans/james/hero-mode/hero-mode-p4.md](docs/plans/james/hero-mode/hero-mode-p4.md)
- **P3 completion report:** [docs/plans/james/hero-mode/hero-mode-p3-completion-report.md](docs/plans/james/hero-mode/hero-mode-p3-completion-report.md)
- **P3 implementation plan:** [docs/plans/2026-04-28-006-feat-hero-mode-p3-completion-claims-daily-progress-plan.md](docs/plans/2026-04-28-006-feat-hero-mode-p3-completion-claims-daily-progress-plan.md)
- Related PR: #533 (P3 squash merge)
- D1 atomicity learning: [docs/solutions memo on batch() vs withTransaction](docs/solutions/)
- Hero P3 trust anchor pattern: `docs/solutions/architecture-patterns/hero-p3-ephemeral-trust-anchor-claim-resolution-2026-04-28.md`
