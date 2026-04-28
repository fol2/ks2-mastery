import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_ECONOMY_VERSION,
  HERO_DAILY_COMPLETION_COINS,
  HERO_LEDGER_RECENT_LIMIT,
  deriveDailyAwardKey,
  deriveLedgerEntryId,
  emptyEconomyState,
  canAwardDailyCompletionCoins,
  applyDailyCompletionCoinAward,
} from '../shared/hero/economy.js';

// ── Test fixtures ───────────────────────────────────────────────

function makeCompletedDaily(overrides = {}) {
  return {
    dateKey: '2026-04-29',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    timezone: 'Europe/London',
    status: 'completed',
    effortTarget: 18,
    effortPlanned: 18,
    effortCompleted: 18,
    taskOrder: ['t1', 't2', 't3'],
    completedTaskIds: ['t1', 't2', 't3'],
    tasks: {
      t1: { taskId: 't1', status: 'completed', effortTarget: 6 },
      t2: { taskId: 't2', status: 'completed', effortTarget: 6 },
      t3: { taskId: 't3', status: 'completed', effortTarget: 6 },
    },
    generatedAt: 1000,
    firstStartedAt: 1001,
    completedAt: 5000,
    lastUpdatedAt: 5000,
    ...overrides,
  };
}

function makeHeroState(overrides = {}) {
  return {
    version: 2,
    daily: makeCompletedDaily(),
    recentClaims: [],
    economy: emptyEconomyState(),
    ...overrides,
  };
}

// ── canAwardDailyCompletionCoins ────────────────────────────────

test('canAward: economy disabled returns economy_disabled', () => {
  const state = makeHeroState();
  const result = canAwardDailyCompletionCoins(state, false);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'economy_disabled');
});

test('canAward: economy disabled (undefined) returns economy_disabled', () => {
  const state = makeHeroState();
  const result = canAwardDailyCompletionCoins(state, undefined);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'economy_disabled');
});

test('canAward: daily is null returns daily_null', () => {
  const state = makeHeroState({ daily: null });
  const result = canAwardDailyCompletionCoins(state, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'daily_null');
});

test('canAward: daily not completed (status=active) returns daily_not_completed', () => {
  const state = makeHeroState({ daily: makeCompletedDaily({ status: 'active' }) });
  const result = canAwardDailyCompletionCoins(state, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'daily_not_completed');
});

test('canAward: already awarded (dailyAwardLedgerEntryId set) returns already_awarded', () => {
  const daily = makeCompletedDaily();
  daily.economy = { dailyAwardLedgerEntryId: 'hero-ledger-abc123' };
  const state = makeHeroState({ daily });
  const result = canAwardDailyCompletionCoins(state, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'already_awarded');
});

test('canAward: ledger contains matching idempotency key returns ledger_duplicate', () => {
  const learnerId = 'learner-1';
  const daily = makeCompletedDaily();
  const awardKey = deriveDailyAwardKey({
    learnerId,
    dateKey: daily.dateKey,
    questId: daily.questId,
    questFingerprint: daily.questFingerprint,
    economyVersion: HERO_ECONOMY_VERSION,
  });
  const state = makeHeroState({
    daily,
    economy: {
      ...emptyEconomyState(),
      ledger: [{ entryId: 'hero-ledger-existing', idempotencyKey: awardKey, learnerId }],
    },
  });
  const result = canAwardDailyCompletionCoins(state, true);
  assert.equal(result.canAward, false);
  assert.equal(result.reason, 'ledger_duplicate');
});

test('canAward: eligible daily completed + no prior award returns eligible', () => {
  const state = makeHeroState();
  const result = canAwardDailyCompletionCoins(state, true);
  assert.equal(result.canAward, true);
  assert.equal(result.reason, 'eligible');
});

// ── applyDailyCompletionCoinAward — happy path ──────────────────

test('happy path: award applied, balance incremented, ledger entry appended', () => {
  const state = makeHeroState();
  const nowTs = 6000;
  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs,
    dailyCompletionCoins: HERO_DAILY_COMPLETION_COINS,
  });

  assert.equal(result.awarded, true);
  assert.equal(result.alreadyAwarded, false);
  assert.equal(result.amount, 100);
  assert.equal(result.state.economy.balance, 100);
  assert.equal(result.state.economy.lifetimeEarned, 100);
  assert.equal(result.state.economy.ledger.length, 1);
  assert.equal(result.state.economy.lastUpdatedAt, nowTs);
});

test('happy path: correct return shape', () => {
  const state = makeHeroState();
  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs: 6000,
    dailyCompletionCoins: 100,
  });

  assert.equal(typeof result.state, 'object');
  assert.equal(result.awarded, true);
  assert.equal(result.amount, 100);
  assert.ok(result.ledgerEntryId.startsWith('hero-ledger-'));
  assert.equal(result.balanceAfter, 100);
  assert.equal(result.alreadyAwarded, false);
});

test('happy path: daily.economy marker set correctly', () => {
  const state = makeHeroState();
  const nowTs = 7000;
  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs,
    dailyCompletionCoins: 100,
  });

  const dailyEcon = result.state.daily.economy;
  assert.equal(dailyEcon.dailyAwardStatus, 'awarded');
  assert.equal(dailyEcon.dailyAwardCoinsAvailable, 100);
  assert.equal(dailyEcon.dailyAwardCoinsAwarded, 100);
  assert.ok(dailyEcon.dailyAwardLedgerEntryId.startsWith('hero-ledger-'));
  assert.equal(dailyEcon.dailyAwardedAt, nowTs);
  assert.equal(dailyEcon.dailyAwardReason, 'daily-completion');
});

test('happy path: ledger entry has correct source shape', () => {
  const state = makeHeroState();
  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs: 8000,
    dailyCompletionCoins: 100,
  });

  const entry = result.state.economy.ledger[0];
  assert.equal(entry.type, 'daily-completion-award');
  assert.equal(entry.amount, 100);
  assert.equal(entry.balanceAfter, 100);
  assert.equal(entry.learnerId, 'learner-1');
  assert.equal(entry.dateKey, '2026-04-29');
  assert.equal(entry.questId, 'quest-abc');
  assert.equal(entry.questFingerprint, 'fp-xyz');
  assert.equal(entry.source.kind, 'hero-daily-completion');
  assert.equal(entry.source.dailyCompletedAt, 5000);
  assert.deepEqual(entry.source.completedTaskIds, ['t1', 't2', 't3']);
  assert.equal(entry.source.effortCompleted, 18);
  assert.equal(entry.source.effortPlanned, 18);
  assert.equal(entry.createdAt, 8000);
  assert.equal(entry.createdBy, 'system');
});

// ── applyDailyCompletionCoinAward — idempotency ─────────────────

test('idempotency: ledger contains matching key but daily marker missing returns alreadyAwarded', () => {
  const learnerId = 'learner-1';
  const daily = makeCompletedDaily();
  const awardKey = deriveDailyAwardKey({
    learnerId,
    dateKey: daily.dateKey,
    questId: daily.questId,
    questFingerprint: daily.questFingerprint,
    economyVersion: HERO_ECONOMY_VERSION,
  });
  const existingEntryId = deriveLedgerEntryId(awardKey);
  const state = makeHeroState({
    daily, // no economy marker on daily
    economy: {
      ...emptyEconomyState(),
      balance: 100,
      lifetimeEarned: 100,
      ledger: [{ entryId: existingEntryId, idempotencyKey: awardKey, learnerId, amount: 100 }],
    },
  });

  const result = applyDailyCompletionCoinAward(state, {
    learnerId,
    nowTs: 9000,
    dailyCompletionCoins: 100,
  });

  assert.equal(result.awarded, false);
  assert.equal(result.alreadyAwarded, true);
  assert.equal(result.amount, 0);
  assert.equal(result.ledgerEntryId, existingEntryId);
  // Balance unchanged
  assert.equal(result.state.economy.balance, 100);
  assert.equal(result.state, state); // same reference, no mutation
});

test('idempotency: calling applyDailyCompletionCoinAward twice with same state produces same result', () => {
  const state = makeHeroState();
  const params = { learnerId: 'learner-1', nowTs: 10000, dailyCompletionCoins: 100 };
  const result1 = applyDailyCompletionCoinAward(state, params);
  const result2 = applyDailyCompletionCoinAward(state, params);

  assert.equal(result1.awarded, true);
  assert.equal(result2.awarded, true);
  assert.equal(result1.ledgerEntryId, result2.ledgerEntryId);
  assert.equal(result1.amount, result2.amount);
  assert.equal(result1.balanceAfter, result2.balanceAfter);
  // Both produce structurally equal state
  assert.deepEqual(result1.state.economy, result2.state.economy);
});

// ── Deterministic entry IDs ─────────────────────────────────────

test('derived entry IDs are deterministic across multiple calls with same inputs', () => {
  const params = {
    learnerId: 'learner-1',
    dateKey: '2026-04-29',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    economyVersion: HERO_ECONOMY_VERSION,
  };
  const key1 = deriveDailyAwardKey(params);
  const key2 = deriveDailyAwardKey(params);
  assert.equal(key1, key2);
  assert.equal(deriveLedgerEntryId(key1), deriveLedgerEntryId(key2));

  // Via applyDailyCompletionCoinAward
  const state = makeHeroState();
  const r1 = applyDailyCompletionCoinAward(state, { learnerId: 'learner-1', nowTs: 11000, dailyCompletionCoins: 100 });
  const r2 = applyDailyCompletionCoinAward(state, { learnerId: 'learner-1', nowTs: 11000, dailyCompletionCoins: 100 });
  assert.equal(r1.ledgerEntryId, r2.ledgerEntryId);
});

// ── Balance from previous non-zero balance ──────────────────────

test('balance increments correctly from previous non-zero balance (200 -> 300)', () => {
  const state = makeHeroState({
    economy: {
      ...emptyEconomyState(),
      balance: 200,
      lifetimeEarned: 200,
    },
  });
  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs: 12000,
    dailyCompletionCoins: 100,
  });

  assert.equal(result.state.economy.balance, 300);
  assert.equal(result.state.economy.lifetimeEarned, 300);
  assert.equal(result.balanceAfter, 300);
  assert.equal(result.state.economy.ledger[0].balanceAfter, 300);
});

// ── Ledger trimming ─────────────────────────────────────────────

test('ledger at HERO_LEDGER_RECENT_LIMIT (180) trims oldest entry after new append', () => {
  // Fill ledger to exactly 180 entries
  const fullLedger = Array.from({ length: HERO_LEDGER_RECENT_LIMIT }, (_, i) => ({
    entryId: `entry-${i}`,
    idempotencyKey: `key-${i}`,
    learnerId: 'learner-1',
    amount: 100,
  }));
  const state = makeHeroState({
    economy: {
      ...emptyEconomyState(),
      balance: 18000,
      lifetimeEarned: 18000,
      ledger: fullLedger,
    },
  });

  const result = applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs: 13000,
    dailyCompletionCoins: 100,
  });

  // Ledger still at 180 (trimmed)
  assert.equal(result.state.economy.ledger.length, HERO_LEDGER_RECENT_LIMIT);
  // Oldest entry (entry-0) is gone
  assert.equal(result.state.economy.ledger.find(e => e.entryId === 'entry-0'), undefined);
  // Newest entry is present
  const newestEntry = result.state.economy.ledger[result.state.economy.ledger.length - 1];
  assert.equal(newestEntry.type, 'daily-completion-award');
  assert.equal(newestEntry.entryId, result.ledgerEntryId);
});

// ── Immutability ────────────────────────────────────────────────

test('applyDailyCompletionCoinAward does not mutate original state', () => {
  const state = makeHeroState();
  const originalBalance = state.economy.balance;
  const originalLedgerLength = state.economy.ledger.length;

  applyDailyCompletionCoinAward(state, {
    learnerId: 'learner-1',
    nowTs: 14000,
    dailyCompletionCoins: 100,
  });

  // Original state unchanged
  assert.equal(state.economy.balance, originalBalance);
  assert.equal(state.economy.ledger.length, originalLedgerLength);
  assert.equal(state.daily.economy, undefined);
});
