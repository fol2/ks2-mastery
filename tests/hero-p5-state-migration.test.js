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

import { HERO_ECONOMY_VERSION, emptyEconomyState } from '../shared/hero/economy.js';

// ── Fresh empty state ──────────────────────────────────────────────

test('fresh empty state creates v3 with empty economy + empty heroPool', () => {
  const result = emptyProgressState();
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  // economy
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.economy.lifetimeEarned, 0);
  assert.equal(result.economy.lifetimeSpent, 0);
  assert.deepEqual(result.economy.ledger, []);
  assert.equal(result.economy.lastUpdatedAt, null);
  // heroPool
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.equal(result.heroPool.rosterVersion, HERO_POOL_ROSTER_VERSION);
  assert.equal(result.heroPool.selectedMonsterId, null);
  assert.deepEqual(result.heroPool.monsters, {});
  assert.deepEqual(result.heroPool.recentActions, []);
  assert.equal(result.heroPool.lastUpdatedAt, null);
});

// ── v1 → v3 ───────────────────────────────────────────────────────

test('v1 (progress-only) migrates to v3 with empty economy + empty heroPool', () => {
  const input = {
    version: 1,
    daily: {
      dateKey: '2026-04-20',
      questId: 'quest-v1',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 6,
      taskOrder: ['t1'],
      completedTaskIds: [],
      tasks: { t1: { taskId: 't1', status: 'started', effortTarget: 6 } },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: null,
      lastUpdatedAt: 1002,
    },
    recentClaims: [{ claimId: 'old-claim', createdAt: 500 }],
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.questId, 'quest-v1');
  assert.equal(result.daily.tasks.t1.status, 'started');
  assert.deepEqual(result.recentClaims, [{ claimId: 'old-claim', createdAt: 500 }]);
  // empty economy
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.economy.ledger, []);
  // empty heroPool
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
  assert.equal(result.heroPool.selectedMonsterId, null);
});

// ── v2 → v3 ───────────────────────────────────────────────────────

test('v2 (economy) migrates to v3 with preserved economy + empty heroPool', () => {
  const ledgerEntries = [
    { entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 2000 },
    { entryId: 'e2', type: 'daily-completion-award', amount: 100, balanceAfter: 200, createdAt: 3000 },
  ];
  const input = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'quest-v2',
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
    recentClaims: [{ claimId: 'c-v2', createdAt: 3000 }],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 200,
      lifetimeEarned: 200,
      lifetimeSpent: 0,
      ledger: ledgerEntries,
      lastUpdatedAt: 3000,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.questId, 'quest-v2');
  // Economy preserved
  assert.equal(result.economy.balance, 200);
  assert.equal(result.economy.lifetimeEarned, 200);
  assert.equal(result.economy.ledger.length, 2);
  assert.equal(result.economy.ledger[0].entryId, 'e1');
  assert.equal(result.economy.ledger[1].entryId, 'e2');
  // heroPool empty
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

// ── v3 normalise without data loss ────────────────────────────────

test('valid v3 normalises without data loss (owned monsters preserved)', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 50,
      lifetimeEarned: 200,
      lifetimeSpent: 150,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100 }],
      lastUpdatedAt: 9000,
    },
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: 'p5-initial-v1',
      selectedMonsterId: 'glossbloom',
      monsters: {
        glossbloom: {
          monsterId: 'glossbloom',
          owned: true,
          stage: 2,
          branch: 'b1',
          investedCoins: 450,
          invitedAt: 5000,
          lastGrownAt: 8000,
          lastLedgerEntryId: 'ledger-xyz',
        },
        loomrill: {
          monsterId: 'loomrill',
          owned: true,
          stage: 1,
          branch: null,
          investedCoins: 150,
          invitedAt: 6000,
          lastGrownAt: null,
          lastLedgerEntryId: 'ledger-abc',
        },
      },
      recentActions: [{ action: 'invite', monsterId: 'loomrill', ts: 6000 }],
      lastUpdatedAt: 8000,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.economy.balance, 50);
  assert.equal(result.economy.lifetimeSpent, 150);
  // heroPool monsters preserved exactly
  assert.equal(result.heroPool.selectedMonsterId, 'glossbloom');
  assert.equal(Object.keys(result.heroPool.monsters).length, 2);
  const glossbloom = result.heroPool.monsters.glossbloom;
  assert.equal(glossbloom.owned, true);
  assert.equal(glossbloom.stage, 2);
  assert.equal(glossbloom.branch, 'b1');
  assert.equal(glossbloom.investedCoins, 450);
  assert.equal(glossbloom.invitedAt, 5000);
  assert.equal(glossbloom.lastGrownAt, 8000);
  assert.equal(glossbloom.lastLedgerEntryId, 'ledger-xyz');
  const loomrill = result.heroPool.monsters.loomrill;
  assert.equal(loomrill.owned, true);
  assert.equal(loomrill.stage, 1);
  assert.equal(loomrill.branch, null);
  assert.equal(loomrill.investedCoins, 150);
  assert.deepEqual(result.heroPool.recentActions, [{ action: 'invite', monsterId: 'loomrill', ts: 6000 }]);
  assert.equal(result.heroPool.lastUpdatedAt, 8000);
});

// ── v3 with unknown monster IDs → IDs dropped ─────────────────────

test('v3 with unknown monster IDs drops those IDs', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: 'p5-initial-v1',
      selectedMonsterId: null,
      monsters: {
        glossbloom: { monsterId: 'glossbloom', owned: true, stage: 1, branch: null, investedCoins: 150 },
        unknown_beast: { monsterId: 'unknown_beast', owned: true, stage: 2, branch: 'b1', investedCoins: 300 },
        another_fake: { monsterId: 'another_fake', owned: false, stage: 0, branch: null, investedCoins: 0 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(Object.keys(result.heroPool.monsters).length, 1);
  assert.ok(result.heroPool.monsters.glossbloom);
  assert.equal(result.heroPool.monsters.unknown_beast, undefined);
  assert.equal(result.heroPool.monsters.another_fake, undefined);
});

// ── v3 with stage 7 → clamped to 4 ───────────────────────────────

test('v3 with stage 7 clamps to 4', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: 'p5-initial-v1',
      selectedMonsterId: null,
      monsters: {
        colisk: { monsterId: 'colisk', owned: true, stage: 7, branch: 'b2', investedCoins: 1000 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.heroPool.monsters.colisk.stage, 4);
});

// ── v3 with branch 'b5' → normalised to null ─────────────────────

test('v3 with branch b5 normalises to null', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: 'p5-initial-v1',
      selectedMonsterId: null,
      monsters: {
        hyphang: { monsterId: 'hyphang', owned: true, stage: 2, branch: 'b5', investedCoins: 300 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.heroPool.monsters.hyphang.branch, null);
});

// ── v3 with malformed heroPool → safe empty heroPool, economy preserved ─

test('v3 with malformed heroPool returns safe empty heroPool, economy preserved', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 300,
      lifetimeEarned: 300,
      lifetimeSpent: 0,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100 }],
      lastUpdatedAt: 5000,
    },
    heroPool: 'corrupted-string',
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  // Economy preserved
  assert.equal(result.economy.balance, 300);
  assert.equal(result.economy.lifetimeEarned, 300);
  assert.equal(result.economy.ledger.length, 1);
  // heroPool safe empty
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
  assert.equal(result.heroPool.selectedMonsterId, null);
  assert.deepEqual(result.heroPool.recentActions, []);
});

// ── Completely invalid state_json → safe empty v3 ─────────────────

test('completely invalid state_json returns safe empty v3', () => {
  const inputs = [null, undefined, 42, 'garbage', [], true];
  for (const input of inputs) {
    const result = normaliseHeroProgressState(input);
    assert.equal(result.version, 3, `failed for input: ${JSON.stringify(input)}`);
    assert.equal(result.daily, null);
    assert.deepEqual(result.recentClaims, []);
    assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
    assert.equal(result.economy.balance, 0);
    assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
    assert.deepEqual(result.heroPool.monsters, {});
  }
});

// ── v2 state with 180 ledger entries migrates without ledger loss ──

test('v2 state with 180 ledger entries migrates without ledger loss', () => {
  const ledger = [];
  for (let i = 0; i < 180; i++) {
    ledger.push({
      entryId: `e-${i}`,
      type: 'daily-completion-award',
      amount: 100,
      balanceAfter: (i + 1) * 100,
      dateKey: `2026-04-${String(1 + (i % 28)).padStart(2, '0')}`,
      createdAt: 1000 + i * 100,
    });
  }
  const input = {
    version: 2,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 18000,
      lifetimeEarned: 18000,
      lifetimeSpent: 0,
      ledger,
      lastUpdatedAt: 1000 + 179 * 100,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  // All 180 entries preserved (economy normaliser keeps up to HERO_LEDGER_RECENT_LIMIT=180)
  assert.equal(result.economy.ledger.length, 180);
  assert.equal(result.economy.ledger[0].entryId, 'e-0');
  assert.equal(result.economy.ledger[179].entryId, 'e-179');
  assert.equal(result.economy.balance, 18000);
  // heroPool empty (v2 migration)
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

// ── normaliseHeroPoolState direct tests ───────────────────────────

test('normaliseHeroPoolState with null returns empty pool', () => {
  const result = normaliseHeroPoolState(null);
  assert.equal(result.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.monsters, {});
  assert.equal(result.selectedMonsterId, null);
});

test('normaliseHeroPoolState with selectedMonsterId pointing to unknown ID resets to null', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: 'p5-initial-v1',
    selectedMonsterId: 'unknown_id',
    monsters: {},
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.selectedMonsterId, null);
});

test('normaliseHeroPoolState with negative investedCoins clamps to 0', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: 'p5-initial-v1',
    selectedMonsterId: null,
    monsters: {
      mirrane: { monsterId: 'mirrane', owned: true, stage: 1, branch: null, investedCoins: -500 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.mirrane.investedCoins, 0);
});

test('normaliseHeroPoolState with stage as string normalises to 0', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: 'p5-initial-v1',
    selectedMonsterId: null,
    monsters: {
      carillon: { monsterId: 'carillon', owned: false, stage: 'two', branch: null, investedCoins: 0 },
    },
    recentActions: [],
    lastUpdatedAt: null,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.monsters.carillon.stage, 0);
});

test('normaliseHeroPoolState preserves rosterVersion string', () => {
  const input = {
    version: HERO_POOL_STATE_VERSION,
    rosterVersion: 'custom-roster-v7',
    selectedMonsterId: null,
    monsters: {},
    recentActions: [],
    lastUpdatedAt: 9999,
  };
  const result = normaliseHeroPoolState(input);
  assert.equal(result.rosterVersion, 'custom-roster-v7');
  assert.equal(result.lastUpdatedAt, 9999);
});

// ── v3 with stage -1 → clamped to 0 ─────────────────────────────

test('v3 with stage -1 clamps to 0', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {
        mirrane: { monsterId: 'mirrane', owned: false, stage: -1, branch: null, investedCoins: 0 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.heroPool.monsters.mirrane.stage, 0);
});

// ── v3 with branch 'b5' on unowned monster → normalised to null ──

test('v3 with branch b5 on unowned monster normalises to null', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {
        loomrill: { monsterId: 'loomrill', owned: false, stage: 0, branch: 'b5', investedCoins: 0 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.heroPool.monsters.loomrill.branch, null);
});

// ── v3 with branch 'b1' on owned monster → preserved as 'b1' ────

test('v3 with branch b1 on owned monster preserved as b1', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: {
      version: HERO_POOL_STATE_VERSION,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: 'glossbloom',
      monsters: {
        glossbloom: { monsterId: 'glossbloom', owned: true, stage: 3, branch: 'b1', investedCoins: 750 },
      },
      recentActions: [],
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.heroPool.monsters.glossbloom.branch, 'b1');
  assert.equal(result.heroPool.monsters.glossbloom.owned, true);
});

// ── v3 with malformed heroPool (null/number) → safe empty heroPool, economy preserved ──

test('v3 with heroPool as null returns safe empty heroPool, economy preserved', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 500,
      lifetimeEarned: 500,
      lifetimeSpent: 0,
      ledger: [{ entryId: 'e1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 1000 }],
      lastUpdatedAt: 5000,
    },
    heroPool: null,
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.economy.balance, 500);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('v3 with heroPool as number returns safe empty heroPool, economy preserved', () => {
  const input = {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 250,
      lifetimeEarned: 250,
      lifetimeSpent: 0,
      ledger: [],
      lastUpdatedAt: 3000,
    },
    heroPool: 42,
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.economy.balance, 250);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

// ── Version field is 3 after normalisation regardless of input version ──

test('version field is 3 after normalisation regardless of input version', () => {
  const inputs = [
    { version: 1, daily: null, recentClaims: [] },
    { version: 2, daily: null, recentClaims: [], economy: emptyEconomyState() },
    { version: 3, daily: null, recentClaims: [], economy: emptyEconomyState(), heroPool: null },
    null,
    undefined,
    'garbage',
  ];
  for (const input of inputs) {
    const result = normaliseHeroProgressState(input);
    assert.equal(result.version, 3, `failed for input: ${JSON.stringify(input)}`);
  }
});
