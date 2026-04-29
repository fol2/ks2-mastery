// Hero Mode P5 U2 — Economy normaliser hardening for debit operations.
//
// Validates that normaliseHeroEconomyState() safely handles:
// - Negative ledger entries (spending: monster-invite, monster-grow)
// - NaN/Infinity/negative on scalar fields
// - Unknown entry types (dropped)
// - Polarity violations (earning with negative, spending with positive)
// - balanceAfter validation
// - Entirely malformed economy objects
// - P4 earning-only state passes through unchanged

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_ECONOMY_VERSION,
  HERO_DAILY_COMPLETION_COINS,
  HERO_ECONOMY_ENTRY_TYPES,
  HERO_EARNING_ENTRY_TYPES,
  HERO_SPENDING_ENTRY_TYPES,
  emptyEconomyState,
  normaliseHeroEconomyState,
  applyDailyCompletionCoinAward,
} from '../../../shared/hero/economy.js';

// ── Fixture builders ────────────────────────────────────────────────────

function buildValidEarningEntry(overrides = {}) {
  return {
    entryId: 'hero-ledger-earn1',
    idempotencyKey: 'hero-daily-coins:v1:l1:2026-04-29:q1:fp1',
    type: 'daily-completion-award',
    amount: 100,
    balanceAfter: 100,
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    questId: 'quest-1',
    questFingerprint: 'fp-1',
    createdAt: '2026-04-29T10:00:00Z',
    createdBy: 'system',
    ...overrides,
  };
}

function buildValidSpendingEntry(type = 'monster-invite', overrides = {}) {
  return {
    entryId: 'hero-ledger-spend1',
    idempotencyKey: `hero-spend:v1:l1:${type}:ts1`,
    type,
    amount: -30,
    balanceAfter: 70,
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    createdAt: '2026-04-29T11:00:00Z',
    createdBy: 'system',
    ...overrides,
  };
}

function buildValidEconomyState(overrides = {}) {
  return {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [buildValidEarningEntry()],
    lastUpdatedAt: '2026-04-29T10:00:00Z',
    ...overrides,
  };
}

// ── 1. Valid P4 earning-only state passes through normaliser unchanged ──

test('P5-U2: valid P4 earning-only state passes through normaliser unchanged', () => {
  const input = buildValidEconomyState();
  const result = normaliseHeroEconomyState(input);

  assert.equal(result.version, HERO_ECONOMY_VERSION);
  assert.equal(result.balance, 100);
  assert.equal(result.lifetimeEarned, 100);
  assert.equal(result.lifetimeSpent, 0);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].type, 'daily-completion-award');
  assert.equal(result.ledger[0].amount, 100);
  assert.equal(result.lastUpdatedAt, '2026-04-29T10:00:00Z');
});

// ── 2. Valid state with monster-invite entry normalises correctly ──

test('P5-U2: valid state with monster-invite entry (negative amount) normalises correctly', () => {
  const input = buildValidEconomyState({
    balance: 70,
    lifetimeSpent: 30,
    ledger: [
      buildValidEarningEntry(),
      buildValidSpendingEntry('monster-invite', { amount: -30, balanceAfter: 70 }),
    ],
  });
  const result = normaliseHeroEconomyState(input);

  assert.equal(result.balance, 70);
  assert.equal(result.lifetimeSpent, 30);
  assert.equal(result.ledger.length, 2);
  assert.equal(result.ledger[1].type, 'monster-invite');
  assert.equal(result.ledger[1].amount, -30);
});

// ── 3. Valid state with monster-grow entry normalises correctly ──

test('P5-U2: valid state with monster-grow entry (negative amount) normalises correctly', () => {
  const input = buildValidEconomyState({
    balance: 50,
    lifetimeSpent: 50,
    ledger: [
      buildValidEarningEntry(),
      buildValidSpendingEntry('monster-grow', { amount: -50, balanceAfter: 50 }),
    ],
  });
  const result = normaliseHeroEconomyState(input);

  assert.equal(result.balance, 50);
  assert.equal(result.lifetimeSpent, 50);
  assert.equal(result.ledger.length, 2);
  assert.equal(result.ledger[1].type, 'monster-grow');
  assert.equal(result.ledger[1].amount, -50);
});

// ── 4. balance is NaN -> normalised to 0 ──

test('P5-U2: balance is NaN -> normalised to 0', () => {
  const input = buildValidEconomyState({ balance: NaN });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.balance, 0);
});

// ── 5. balance is -5 -> normalised to 0 ──

test('P5-U2: balance is -5 -> normalised to 0', () => {
  const input = buildValidEconomyState({ balance: -5 });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.balance, 0);
});

// ── 6. lifetimeSpent is negative -> normalised to 0 ──

test('P5-U2: lifetimeSpent is negative -> normalised to 0', () => {
  const input = buildValidEconomyState({ lifetimeSpent: -10 });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.lifetimeSpent, 0);
});

// ── 7. lifetimeEarned is Infinity -> normalised to 0 ──

test('P5-U2: lifetimeEarned is Infinity -> normalised to 0', () => {
  const input = buildValidEconomyState({ lifetimeEarned: Infinity });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.lifetimeEarned, 0);
});

// ── 8. Ledger entry with unknown type 'random-bonus' is dropped ──

test('P5-U2: ledger entry with unknown type is dropped', () => {
  const input = buildValidEconomyState({
    ledger: [
      buildValidEarningEntry(),
      { entryId: 'bad-1', type: 'random-bonus', amount: 50, balanceAfter: 150, createdAt: 'x' },
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].type, 'daily-completion-award');
});

// ── 9. Earning entry (daily-completion-award) with negative amount is dropped ──

test('P5-U2: earning entry (daily-completion-award) with negative amount is dropped', () => {
  const input = buildValidEconomyState({
    ledger: [
      buildValidEarningEntry({ amount: -100, balanceAfter: 0 }),
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 0);
});

// ── 10. Spending entry (monster-invite) with positive amount is dropped ──

test('P5-U2: spending entry (monster-invite) with positive amount is dropped', () => {
  const input = buildValidEconomyState({
    ledger: [
      buildValidEarningEntry(),
      buildValidSpendingEntry('monster-invite', { amount: 30, balanceAfter: 130 }),
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].type, 'daily-completion-award');
});

// ── 11. Entry with balanceAfter: Infinity is dropped ──

test('P5-U2: entry with balanceAfter: Infinity is dropped', () => {
  const input = buildValidEconomyState({
    ledger: [
      buildValidEarningEntry({ balanceAfter: Infinity }),
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 0);
});

// ── 12. Entry with balanceAfter: -5 is dropped ──

test('P5-U2: entry with balanceAfter: -5 is dropped', () => {
  const input = buildValidEconomyState({
    ledger: [
      buildValidEarningEntry({ balanceAfter: -5 }),
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 0);
});

// ── 13. Entirely malformed economy object (string/null/number) -> safe empty state ──

test('P5-U2: entirely malformed economy object (string) -> safe empty state', () => {
  const result = normaliseHeroEconomyState('corrupted');
  assert.deepEqual(result, emptyEconomyState());
});

test('P5-U2: entirely malformed economy object (null) -> safe empty state', () => {
  const result = normaliseHeroEconomyState(null);
  assert.deepEqual(result, emptyEconomyState());
});

test('P5-U2: entirely malformed economy object (number) -> safe empty state', () => {
  const result = normaliseHeroEconomyState(42);
  assert.deepEqual(result, emptyEconomyState());
});

test('P5-U2: entirely malformed economy object (array) -> safe empty state', () => {
  const result = normaliseHeroEconomyState([1, 2, 3]);
  assert.deepEqual(result, emptyEconomyState());
});

// ── 14. Existing P4 award flow still produces valid state after hardening ──

test('P5-U2: existing P4 award flow produces valid state that passes normalisation', () => {
  const heroState = {
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-p4-1',
      questFingerprint: 'hero-qf-p4check',
      status: 'completed',
      completedTaskIds: ['task-1', 'task-2', 'task-3'],
      completedAt: '2026-04-29T09:00:00Z',
      effortCompleted: 3,
      effortPlanned: 3,
      economy: null,
    },
    economy: emptyEconomyState(),
  };

  const result = applyDailyCompletionCoinAward(heroState, {
    learnerId: 'learner-p4-check',
    nowTs: '2026-04-29T10:00:00Z',
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });

  assert.equal(result.awarded, true);
  assert.equal(result.amount, HERO_DAILY_COMPLETION_COINS);

  // The produced economy state must survive normalisation unchanged
  const normalised = normaliseHeroEconomyState(result.state.economy);
  assert.equal(normalised.balance, result.state.economy.balance);
  assert.equal(normalised.lifetimeEarned, result.state.economy.lifetimeEarned);
  assert.equal(normalised.lifetimeSpent, result.state.economy.lifetimeSpent);
  assert.equal(normalised.ledger.length, result.state.economy.ledger.length);
  assert.equal(normalised.ledger[0].type, 'daily-completion-award');
  assert.equal(normalised.ledger[0].amount, HERO_DAILY_COMPLETION_COINS);
});

// ── Entry type constants validation ─────────────────────────────────────

test('P5-U2: HERO_ECONOMY_ENTRY_TYPES includes spending types', () => {
  assert.ok(HERO_ECONOMY_ENTRY_TYPES.includes('monster-invite'));
  assert.ok(HERO_ECONOMY_ENTRY_TYPES.includes('monster-grow'));
  assert.ok(HERO_ECONOMY_ENTRY_TYPES.includes('admin-adjustment'));
  assert.ok(HERO_ECONOMY_ENTRY_TYPES.includes('daily-completion-award'));
});

test('P5-U2: HERO_EARNING_ENTRY_TYPES and HERO_SPENDING_ENTRY_TYPES are disjoint', () => {
  for (const t of HERO_EARNING_ENTRY_TYPES) {
    assert.equal(HERO_SPENDING_ENTRY_TYPES.includes(t), false, `${t} must not be in both lists`);
  }
  for (const t of HERO_SPENDING_ENTRY_TYPES) {
    assert.equal(HERO_EARNING_ENTRY_TYPES.includes(t), false, `${t} must not be in both lists`);
  }
});

test('P5-U2: admin-adjustment entry with positive amount passes normalisation', () => {
  const input = buildValidEconomyState({
    ledger: [
      { entryId: 'adj-1', type: 'admin-adjustment', amount: 50, balanceAfter: 150, createdAt: 'x', createdBy: 'admin' },
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].type, 'admin-adjustment');
  assert.equal(result.ledger[0].amount, 50);
});

test('P5-U2: admin-adjustment entry with negative amount passes normalisation', () => {
  const input = buildValidEconomyState({
    ledger: [
      { entryId: 'adj-2', type: 'admin-adjustment', amount: -20, balanceAfter: 80, createdAt: 'x', createdBy: 'admin' },
    ],
  });
  const result = normaliseHeroEconomyState(input);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].type, 'admin-adjustment');
  assert.equal(result.ledger[0].amount, -20);
});
