import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_PROGRESS_VERSION,
  HERO_POOL_STATE_VERSION,
  HERO_POOL_ROSTER_VERSION,
  emptyProgressState,
  emptyHeroPoolState,
  normaliseHeroProgressState,
  normaliseHeroPoolState,
} from '../shared/hero/progress-state.js';

import {
  HERO_ECONOMY_VERSION,
  HERO_LEDGER_RECENT_LIMIT,
  emptyEconomyState,
  normaliseHeroEconomyState,
} from '../shared/hero/economy.js';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';

// ═══════════════════════════════════════════════════════════════════════
// ── State version migration ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('v1 state (daily + recentClaims, no economy, no heroPool) migrates to v3 preserving daily + recentClaims', () => {
  const input = {
    version: 1,
    daily: {
      dateKey: '2026-04-20',
      questId: 'quest-v1-test',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 10,
      effortPlanned: 10,
      effortCompleted: 5,
      taskOrder: ['t1', 't2'],
      completedTaskIds: ['t1'],
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 5 },
        t2: { taskId: 't2', status: 'started', effortTarget: 5 },
      },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: null,
      lastUpdatedAt: 1002,
    },
    recentClaims: [
      { claimId: 'c1', createdAt: 900 },
      { claimId: 'c2', createdAt: 950 },
    ],
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.questId, 'quest-v1-test');
  assert.equal(result.daily.effortCompleted, 5);
  assert.deepEqual(result.recentClaims, [
    { claimId: 'c1', createdAt: 900 },
    { claimId: 'c2', createdAt: 950 },
  ]);
  // Economy must be empty (v1 had no economy)
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.economy.lifetimeEarned, 0);
  assert.equal(result.economy.lifetimeSpent, 0);
  assert.deepEqual(result.economy.ledger, []);
  // HeroPool must be empty (v1 had no heroPool)
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
  assert.equal(result.heroPool.selectedMonsterId, null);
});

test('v2 state (has economy, no heroPool) migrates to v3 preserving economy, adding empty heroPool', () => {
  const input = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'quest-v2-econ',
      timezone: 'Europe/London',
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1'],
      completedTaskIds: ['t1'],
      tasks: { t1: { taskId: 't1', status: 'completed', effortTarget: 18 } },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: 3000,
      lastUpdatedAt: 3000,
    },
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 100,
      lifetimeEarned: 100,
      lifetimeSpent: 0,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 3000 }],
      lastUpdatedAt: 3000,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.economy.balance, 100);
  assert.equal(result.economy.lifetimeEarned, 100);
  assert.equal(result.economy.ledger.length, 1);
  assert.equal(result.economy.ledger[0].entryId, 'e1');
  // heroPool must be empty
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('v3 state passes through unchanged (with full sub-block normalisation)', () => {
  const input = {
    version: 3,
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-v3',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: ['t1'],
      completedTaskIds: [],
      tasks: { t1: { taskId: 't1', status: 'planned', effortTarget: 12 } },
      generatedAt: 5000,
      firstStartedAt: null,
      completedAt: null,
      lastUpdatedAt: 5000,
    },
    recentClaims: [{ claimId: 'c3', createdAt: 4500 }],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 300,
      lifetimeEarned: 450,
      lifetimeSpent: 150,
      ledger: [
        { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 2000 },
        { entryId: 'e2', type: 'monster-invite', amount: -150, balanceAfter: 250, createdAt: 3000 },
      ],
      lastUpdatedAt: 4000,
    },
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: 'glossbloom',
      monsters: {
        glossbloom: { monsterId: 'glossbloom', owned: true, stage: 1, branch: 'b1', investedCoins: 150, invitedAt: 3000, lastGrownAt: null, lastLedgerEntryId: 'e2' },
      },
      recentActions: [{ type: 'monster-invite', monsterId: 'glossbloom', createdAt: 3000 }],
      lastUpdatedAt: 3000,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.questId, 'quest-v3');
  assert.equal(result.economy.balance, 300);
  assert.equal(result.economy.lifetimeSpent, 150);
  assert.equal(result.heroPool.selectedMonsterId, 'glossbloom');
  assert.equal(result.heroPool.monsters.glossbloom.stage, 1);
  assert.equal(result.heroPool.monsters.glossbloom.branch, 'b1');
});

test('unknown version (e.g. version: 99) returns safe empty v3', () => {
  const input = {
    version: 99,
    daily: { dateKey: '2026-04-29', questId: 'q-doomed', status: 'active' },
    recentClaims: [{ claimId: 'xxx' }],
    economy: { version: 1, balance: 9999 },
    heroPool: { monsters: { glossbloom: { owned: true } } },
  };
  const result = normaliseHeroProgressState(input);
  const empty = emptyProgressState();
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('missing version field returns safe empty v3', () => {
  const input = {
    daily: { dateKey: '2026-04-29', questId: 'q-noversion', status: 'active' },
    recentClaims: [],
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('null input returns safe empty v3', () => {
  const result = normaliseHeroProgressState(null);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('undefined input returns safe empty v3', () => {
  const result = normaliseHeroProgressState(undefined);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
});

test('non-object inputs (string, number, array) return safe empty v3', () => {
  for (const input of ['garbage', 42, -1, 0, true, false, [], [1, 2, 3]]) {
    const result = normaliseHeroProgressState(input);
    assert.equal(result.version, 3, `failed for ${JSON.stringify(input)}`);
    assert.equal(result.daily, null, `daily not null for ${JSON.stringify(input)}`);
    assert.deepEqual(result.recentClaims, [], `recentClaims not empty for ${JSON.stringify(input)}`);
    assert.equal(result.economy.balance, 0, `balance not 0 for ${JSON.stringify(input)}`);
    assert.deepEqual(result.heroPool.monsters, {}, `monsters not empty for ${JSON.stringify(input)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── Economy corruption ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('NaN balance normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: NaN, lifetimeEarned: 100, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('negative balance repaired to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: -50, lifetimeEarned: 100, lifetimeSpent: 150, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('Infinity balance normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: Infinity, lifetimeEarned: 0, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('-Infinity balance normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: -Infinity, lifetimeEarned: 0, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('missing balance field defaults to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, lifetimeEarned: 50, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('non-numeric balance (string "abc") normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: 'abc', lifetimeEarned: 0, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
});

test('lifetimeEarned unchanged by spending entries in ledger', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 0,
    lifetimeEarned: 200,
    lifetimeSpent: 200,
    ledger: [
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'e2', type: 'monster-invite', amount: -100, balanceAfter: 0, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.lifetimeEarned, 200);
});

test('lifetimeSpent unchanged by earning entries in ledger', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 300,
    lifetimeEarned: 300,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'e2', type: 'daily-completion-award', amount: 100, balanceAfter: 200, createdAt: 2000 },
      { entryId: 'e3', type: 'daily-completion-award', amount: 100, balanceAfter: 300, createdAt: 3000 },
    ],
    lastUpdatedAt: 3000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.lifetimeSpent, 0);
});

test('balanceAfter never negative in normalised ledger entries', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 50,
    lifetimeEarned: 100,
    lifetimeSpent: 50,
    ledger: [
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'e2', type: 'monster-invite', amount: -50, balanceAfter: 50, createdAt: 2000 },
      // Corrupt entry: negative balanceAfter
      { entryId: 'e3', type: 'monster-invite', amount: -150, balanceAfter: -100, createdAt: 3000 },
    ],
    lastUpdatedAt: 3000,
  };
  const result = normaliseHeroEconomyState(raw);
  for (const entry of result.ledger) {
    if (typeof entry.balanceAfter === 'number') {
      assert.ok(entry.balanceAfter >= 0, `balanceAfter must be >= 0, got ${entry.balanceAfter} in entry ${entry.entryId}`);
    }
  }
  // The corrupt entry with negative balanceAfter should be dropped
  assert.equal(result.ledger.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// ── HeroPool corruption ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('unknown monsterId (not in 6 registry) is dropped from monsters map', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      glossbloom: { monsterId: 'glossbloom', owned: true, stage: 1, branch: 'b1', investedCoins: 150 },
      fake_dragon: { monsterId: 'fake_dragon', owned: true, stage: 3, branch: 'b2', investedCoins: 900 },
      sparklefish: { monsterId: 'sparklefish', owned: false, stage: 0, branch: null, investedCoins: 0 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(Object.keys(result.monsters).length, 1);
  assert.ok(result.monsters.glossbloom);
  assert.equal(result.monsters.fake_dragon, undefined);
  assert.equal(result.monsters.sparklefish, undefined);
});

test('invalid stage (>4) clamped to 4', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      loomrill: { monsterId: 'loomrill', owned: true, stage: 7, branch: 'b1', investedCoins: 1000 },
      colisk: { monsterId: 'colisk', owned: true, stage: 99, branch: 'b2', investedCoins: 5000 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.loomrill.stage, 4);
  assert.equal(result.monsters.colisk.stage, 4);
});

test('invalid stage (<0) clamped to 0', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      mirrane: { monsterId: 'mirrane', owned: true, stage: -3, branch: 'b1', investedCoins: 0 },
      hyphang: { monsterId: 'hyphang', owned: true, stage: -1, branch: 'b2', investedCoins: 0 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.mirrane.stage, 0);
  assert.equal(result.monsters.hyphang.stage, 0);
});

test('NaN stage normalises to 0', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      carillon: { monsterId: 'carillon', owned: true, stage: NaN, branch: 'b1', investedCoins: 150 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.carillon.stage, 0);
});

test('invalid branch (not b1 or b2) falls back to null', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      glossbloom: { monsterId: 'glossbloom', owned: true, stage: 2, branch: 'b5', investedCoins: 300 },
      loomrill: { monsterId: 'loomrill', owned: true, stage: 1, branch: 'invalid', investedCoins: 150 },
      mirrane: { monsterId: 'mirrane', owned: true, stage: 0, branch: '', investedCoins: 0 },
      colisk: { monsterId: 'colisk', owned: true, stage: 1, branch: 123, investedCoins: 150 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.glossbloom.branch, null);
  assert.equal(result.monsters.loomrill.branch, null);
  assert.equal(result.monsters.mirrane.branch, null);
  assert.equal(result.monsters.colisk.branch, null);
});

test('missing monsters field defaults to empty object', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.deepEqual(result.monsters, {});
});

test('non-object heroPool normalises to empty heroPool', () => {
  for (const badPool of [null, undefined, 42, 'corrupt', true, [], NaN]) {
    const result = normaliseHeroPoolState(badPool);
    assert.equal(result.version, HERO_POOL_STATE_VERSION, `failed for ${JSON.stringify(badPool)}`);
    assert.deepEqual(result.monsters, {}, `monsters not empty for ${JSON.stringify(badPool)}`);
    assert.equal(result.selectedMonsterId, null, `selectedMonsterId not null for ${JSON.stringify(badPool)}`);
    assert.deepEqual(result.recentActions, [], `recentActions not empty for ${JSON.stringify(badPool)}`);
  }
});

test('stage as float is floored then clamped', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      glossbloom: { monsterId: 'glossbloom', owned: true, stage: 2.9, branch: 'b1', investedCoins: 600 },
      loomrill: { monsterId: 'loomrill', owned: true, stage: 4.7, branch: 'b2', investedCoins: 3000 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.glossbloom.stage, 2);
  assert.equal(result.monsters.loomrill.stage, 4); // clamped to max
});

// ═══════════════════════════════════════════════════════════════════════
// ── Ledger corruption ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('malformed ledger entries (missing entryId) are preserved (entryId not enforced by normaliser)', () => {
  // NOTE: The economy normaliser intentionally does NOT require entryId on entries.
  // This is for backward compatibility with P4 entries that predate the spending schema.
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
    ],
    lastUpdatedAt: 1000,
  };
  const result = normaliseHeroEconomyState(raw);
  // Entry without entryId is kept (backward compat)
  assert.equal(result.ledger.length, 1);
});

test('non-object ledger entries are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      null,
      undefined,
      42,
      'garbage',
      [],
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
    ],
    lastUpdatedAt: 1000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'e1');
});

test('earning entries with negative amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'bad1', type: 'daily-completion-award', amount: -100, balanceAfter: 0, createdAt: 1000 },
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('earning entries with zero amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'zero1', type: 'daily-completion-award', amount: 0, balanceAfter: 0, createdAt: 1000 },
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('spending entries with positive amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 50,
    lifetimeEarned: 200,
    lifetimeSpent: 150,
    ledger: [
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'bad1', type: 'monster-invite', amount: 150, balanceAfter: 250, createdAt: 2000 },
      { entryId: 'good2', type: 'monster-invite', amount: -150, balanceAfter: 50, createdAt: 3000 },
    ],
    lastUpdatedAt: 3000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 2);
  assert.equal(result.ledger[0].entryId, 'good1');
  assert.equal(result.ledger[1].entryId, 'good2');
});

test('spending entries with zero amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'zero1', type: 'monster-invite', amount: 0, balanceAfter: 100, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('ledger entries with NaN amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'bad1', type: 'daily-completion-award', amount: NaN, balanceAfter: 100, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('ledger entries with Infinity amount are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'bad1', type: 'daily-completion-award', amount: Infinity, balanceAfter: Infinity, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('ledger entries with unknown type are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      { entryId: 'bad1', type: 'unknown-type-xyz', amount: 50, balanceAfter: 150, createdAt: 2000 },
    ],
    lastUpdatedAt: 2000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('ledger retention cap (180) preserves most recent entries (write-time enforcement)', () => {
  // The cap is enforced at write-time (applyDailyCompletionCoinAward uses .slice(-HERO_LEDGER_RECENT_LIMIT))
  // The normaliser preserves all valid entries regardless of count.
  // This test verifies the normaliser does NOT lose entries beyond 180.
  const ledger = [];
  for (let i = 0; i < 200; i++) {
    ledger.push({
      entryId: `e-${i}`,
      type: 'daily-completion-award',
      amount: 100,
      balanceAfter: (i + 1) * 100,
      createdAt: 1000 + i * 100,
    });
  }
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 20000,
    lifetimeEarned: 20000,
    lifetimeSpent: 0,
    ledger,
    lastUpdatedAt: 1000 + 199 * 100,
  };
  const result = normaliseHeroEconomyState(raw);
  // normaliser preserves all valid entries (no read-time cap)
  assert.equal(result.ledger.length, 200);
  assert.equal(result.ledger[0].entryId, 'e-0');
  assert.equal(result.ledger[199].entryId, 'e-199');
});

test('ledger with arrays as entries are dropped', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      [1, 2, 3],
      { entryId: 'good1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
    ],
    lastUpdatedAt: 1000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].entryId, 'good1');
});

test('economy with non-array ledger field normalises to empty array', () => {
  const raw = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: 'not-an-array',
    lastUpdatedAt: 1000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.deepEqual(result.ledger, []);
});

test('economy with wrong version returns empty economy', () => {
  const raw = {
    version: 99,
    balance: 5000,
    lifetimeEarned: 5000,
    lifetimeSpent: 0,
    ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100 }],
    lastUpdatedAt: 1000,
  };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.balance, 0);
  assert.deepEqual(result.ledger, []);
});

test('economy null/undefined/array returns empty economy', () => {
  for (const input of [null, undefined, [], [1, 2]]) {
    const result = normaliseHeroEconomyState(input);
    assert.equal(result.version, HERO_ECONOMY_VERSION, `failed for ${JSON.stringify(input)}`);
    assert.equal(result.balance, 0);
    assert.deepEqual(result.ledger, []);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── Integration: buildHeroShadowReadModel does not crash from corrupt state
// ═══════════════════════════════════════════════════════════════════════

test('buildHeroShadowReadModel does not crash with null heroProgressState', () => {
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-1',
    accountId: 'acc-1',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: null,
    recentCompletedSessions: [],
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
  });
  assert.ok(result);
  assert.ok(typeof result === 'object');
  assert.ok(result.version >= 4);
});

test('buildHeroShadowReadModel does not crash with undefined heroProgressState', () => {
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-2',
    accountId: 'acc-2',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: undefined,
    recentCompletedSessions: [],
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
  });
  assert.ok(result);
  assert.ok(typeof result === 'object');
});

test('buildHeroShadowReadModel does not crash with corrupt heroProgressState (string)', () => {
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-3',
    accountId: 'acc-3',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: 'corrupted-json-garbage',
    recentCompletedSessions: [],
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: false,
  });
  assert.ok(result);
  assert.ok(typeof result === 'object');
});

test('buildHeroShadowReadModel does not crash with empty object heroProgressState', () => {
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-4',
    accountId: 'acc-4',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: {},
    recentCompletedSessions: [],
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
  });
  assert.ok(result);
  assert.ok(typeof result === 'object');
});

test('buildHeroShadowReadModel does not crash with heroProgressState containing corrupt economy', () => {
  const corruptState = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: { version: 1, balance: NaN, lifetimeEarned: -Infinity, lifetimeSpent: 'abc', ledger: 'not-array' },
    heroPool: { monsters: { fake_id: { stage: 99 } } },
  };
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-5',
    accountId: 'acc-5',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: corruptState,
    recentCompletedSessions: [],
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
  });
  assert.ok(result);
  assert.ok(typeof result === 'object');
});

// ── Event-log mirror: missing does not corrupt state ──────────────────

test('event-log mirror missing (no recentCompletedSessions) does not corrupt state', () => {
  const state = normaliseHeroProgressState({
    version: 3,
    daily: {
      dateKey: '2026-04-29',
      questId: 'q-event-log',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: ['t1'],
      completedTaskIds: [],
      tasks: { t1: { taskId: 't1', status: 'started', effortTarget: 12 } },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: null,
      lastUpdatedAt: 1001,
    },
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  });
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-evt-1',
    accountId: 'acc-evt-1',
    subjectReadModels: {},
    now: Date.now(),
    env: {
      HERO_MODE_SHADOW_ENABLED: '1',
      HERO_MODE_LAUNCH_ENABLED: '1',
      HERO_MODE_CHILD_UI_ENABLED: '1',
    },
    heroProgressState: state,
    recentCompletedSessions: [], // empty mirror
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: false,
  });
  assert.ok(result);
  assert.equal(result.pendingCompletedHeroSession, null);
});

// ── Event-log mirror: duplicate does not cause double-counting ────────

test('event-log mirror duplicated does not cause double-counting (dedup by ledger entry ID)', () => {
  // Simulate awarding coins twice with same idempotency key
  const economy = {
    version: HERO_ECONOMY_VERSION,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'dedup-1', idempotencyKey: 'key-1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 },
      // Duplicate entry with same entryId — should both survive normalisation
      // (dedup is enforced at write-time by idempotency checks, not normaliser)
      { entryId: 'dedup-1', idempotencyKey: 'key-1', type: 'daily-completion-award', amount: 100, balanceAfter: 200, createdAt: 1001 },
    ],
    lastUpdatedAt: 1001,
  };
  const result = normaliseHeroEconomyState(economy);
  // Both entries survive normalisation (dedup is write-time concern)
  // But the balance/lifetimeEarned reflect the snapshot values, not ledger sum
  assert.equal(result.balance, 100); // from raw.balance
  assert.equal(result.lifetimeEarned, 100); // from raw.lifetimeEarned
  // The normaliser preserves entries structurally; write-time logic prevents duplicate inserts
  assert.equal(result.ledger.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Extra edge cases ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('normaliseHeroProgressState with version:3 and null economy returns empty economy', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: null,
    heroPool: null,
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.economy.ledger, []);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('normaliseHeroProgressState with version:3 and corrupt daily (missing questId) returns null daily', () => {
  const input = {
    version: 3,
    daily: { dateKey: '2026-04-29', status: 'active' }, // missing questId
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.daily, null); // normaliseDailyState returns null when questId missing
});

test('normaliseHeroProgressState with version:3 and corrupt daily (missing dateKey) returns null daily', () => {
  const input = {
    version: 3,
    daily: { questId: 'q-test', status: 'active' }, // missing dateKey
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.daily, null);
});

test('normaliseHeroProgressState with version:3 and invalid daily status normalises to active', () => {
  const input = {
    version: 3,
    daily: {
      dateKey: '2026-04-29',
      questId: 'q-test',
      timezone: 'Europe/London',
      status: 'zombie-mode', // invalid
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: ['t1'],
      completedTaskIds: [],
      tasks: { t1: { taskId: 't1', status: 'planned', effortTarget: 12 } },
      generatedAt: 1000,
      firstStartedAt: null,
      completedAt: null,
      lastUpdatedAt: 1000,
    },
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.daily.status, 'active');
});

test('all six valid monster IDs survive normalisation when present', () => {
  const allMonsters = {};
  for (const id of ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon']) {
    allMonsters[id] = { monsterId: id, owned: true, stage: 2, branch: 'b1', investedCoins: 300 };
  }
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: 'mirrane',
    monsters: allMonsters,
    recentActions: [],
    lastUpdatedAt: 5000,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(Object.keys(result.monsters).length, 6);
  for (const id of ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon']) {
    assert.ok(result.monsters[id], `${id} should be preserved`);
    assert.equal(result.monsters[id].stage, 2);
    assert.equal(result.monsters[id].owned, true);
  }
  assert.equal(result.selectedMonsterId, 'mirrane');
});

test('monster entry that is not an object is skipped', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {
      glossbloom: null,
      loomrill: 42,
      mirrane: 'bad',
      colisk: { monsterId: 'colisk', owned: true, stage: 1, branch: 'b2', investedCoins: 150 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(Object.keys(result.monsters).length, 1);
  assert.ok(result.monsters.colisk);
});

test('recentActions with malformed entries are filtered', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {},
    recentActions: [
      null,
      42,
      'string-entry',
      { monsterId: 'glossbloom' }, // missing type
      { type: 'monster-invite', monsterId: 'glossbloom', createdAt: 1000 }, // good
      { type: 'monster-grow', monsterId: 'loomrill', createdAt: 2000 },   // good
    ],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.recentActions.length, 2);
  assert.equal(result.recentActions[0].type, 'monster-invite');
  assert.equal(result.recentActions[1].type, 'monster-grow');
});

test('economy NaN lifetimeEarned normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: 0, lifetimeEarned: NaN, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.lifetimeEarned, 0);
});

test('economy negative lifetimeSpent normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: 0, lifetimeEarned: 0, lifetimeSpent: -100, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.lifetimeSpent, 0);
});

test('economy Infinity lifetimeEarned normalises to 0', () => {
  const raw = { version: HERO_ECONOMY_VERSION, balance: 0, lifetimeEarned: Infinity, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null };
  const result = normaliseHeroEconomyState(raw);
  assert.equal(result.lifetimeEarned, 0);
});
