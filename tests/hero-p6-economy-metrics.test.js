// Hero Mode P6 U8 - Economy/Camp reconciliation metrics tests.
//
// Verifies:
// - deriveReconciliationGap with matching/mismatched counts
// - classifySpendPattern with rapid/non-rapid spend patterns
// - Camp success telemetry includes economy health dimensions
// - Insufficient-coins telemetry includes currentBalance and requiredAmount
// - classifyBalanceBucket boundary classification

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveReconciliationGap,
  classifySpendPattern,
  classifyBalanceBucket,
} from '../worker/src/hero/analytics.js';

import { resolveHeroCampCommand } from '../worker/src/hero/camp.js';

import {
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
  HERO_POOL_ROSTER_VERSION,
} from '../shared/hero/hero-pool.js';

// ── Fixtures ─────────────────────────────────────────────────────────────

const NOW = 1714400000000;
const LEARNER = 'learner-metrics-001';
const ROSTER_V = HERO_POOL_ROSTER_VERSION;
const DATE_KEY = '2026-04-29';

function makeEconomy(balance = 1000) {
  return { version: 1, balance, lifetimeEarned: balance, lifetimeSpent: 0, ledger: [], lastUpdatedAt: NOW - 1000 };
}

function makeEmptyPool() {
  return {
    version: 1,
    rosterVersion: ROSTER_V,
    selectedMonsterId: null,
    monsters: {},
    recentActions: [],
    lastUpdatedAt: null,
  };
}

function makePoolWithOwned(monsterId, stage = 0, branch = 'b1') {
  return {
    version: 1,
    rosterVersion: ROSTER_V,
    selectedMonsterId: null,
    monsters: {
      [monsterId]: {
        monsterId,
        owned: true,
        stage,
        branch,
        investedCoins: HERO_MONSTER_INVITE_COST,
        invitedAt: NOW - 5000,
        lastGrownAt: null,
        lastLedgerEntryId: 'entry-001',
      },
    },
    recentActions: [],
    lastUpdatedAt: NOW - 5000,
  };
}

// ── deriveReconciliationGap tests ──────────────────────────────────────────

describe('deriveReconciliationGap', () => {
  it('returns gap=0 when ledger and event counts match', () => {
    const ledger = [{ entryId: 'a' }, { entryId: 'b' }, { entryId: 'c' }];
    const result = deriveReconciliationGap(ledger, 3);
    assert.equal(result.ledgerCount, 3);
    assert.equal(result.eventCount, 3);
    assert.equal(result.gap, 0);
    assert.equal(result.hasGap, false);
  });

  it('returns positive gap when events are fewer than ledger entries', () => {
    const ledger = [{ entryId: 'a' }, { entryId: 'b' }, { entryId: 'c' }, { entryId: 'd' }];
    const result = deriveReconciliationGap(ledger, 2);
    assert.equal(result.ledgerCount, 4);
    assert.equal(result.eventCount, 2);
    assert.equal(result.gap, 2);
    assert.equal(result.hasGap, true);
  });

  it('returns negative gap when events exceed ledger entries', () => {
    const ledger = [{ entryId: 'a' }];
    const result = deriveReconciliationGap(ledger, 3);
    assert.equal(result.gap, -2);
    assert.equal(result.hasGap, true);
  });

  it('handles empty ledger gracefully', () => {
    const result = deriveReconciliationGap([], 0);
    assert.equal(result.gap, 0);
    assert.equal(result.hasGap, false);
  });

  it('handles non-array ledger input gracefully', () => {
    const result = deriveReconciliationGap(null, 5);
    assert.equal(result.ledgerCount, 0);
    assert.equal(result.eventCount, 5);
    assert.equal(result.gap, -5);
    assert.equal(result.hasGap, true);
  });
});

// ── classifySpendPattern tests ─────────────────────────────────────────────

describe('classifySpendPattern', () => {
  it('returns rapidSpend=false with 2 spends today', () => {
    const actions = [
      { createdAt: '2026-04-29T10:00:00.000Z', type: 'monster-invite' },
      { createdAt: '2026-04-29T11:00:00.000Z', type: 'monster-grow' },
    ];
    const result = classifySpendPattern(actions, DATE_KEY, 200);
    assert.equal(result.rapidSpend, false);
    assert.equal(result.spendCountToday, 2);
  });

  it('returns rapidSpend=true with 3+ spends today', () => {
    const actions = [
      { createdAt: '2026-04-29T08:00:00.000Z', type: 'monster-invite' },
      { createdAt: '2026-04-29T09:00:00.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-29T10:00:00.000Z', type: 'monster-grow' },
    ];
    const result = classifySpendPattern(actions, DATE_KEY, 100);
    assert.equal(result.rapidSpend, true);
    assert.equal(result.spendCountToday, 3);
  });

  it('returns rapidSpend=true with 5 spends today', () => {
    const actions = [
      { createdAt: '2026-04-29T08:00:00.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-29T09:00:00.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-29T10:00:00.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-29T11:00:00.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-29T12:00:00.000Z', type: 'monster-grow' },
    ];
    const result = classifySpendPattern(actions, DATE_KEY, 50);
    assert.equal(result.rapidSpend, true);
    assert.equal(result.spendCountToday, 5);
  });

  it('excludes actions from other days', () => {
    const actions = [
      { createdAt: '2026-04-28T23:59:59.000Z', type: 'monster-invite' },
      { createdAt: '2026-04-29T00:00:01.000Z', type: 'monster-grow' },
      { createdAt: '2026-04-30T01:00:00.000Z', type: 'monster-grow' },
    ];
    const result = classifySpendPattern(actions, DATE_KEY, 0);
    assert.equal(result.spendCountToday, 1);
    assert.equal(result.rapidSpend, false);
  });

  it('hoarding score is 0 for balance < 300', () => {
    const result = classifySpendPattern([], DATE_KEY, 299);
    assert.equal(result.hoardingScore, 0);
  });

  it('hoarding score increases with balance >= 300', () => {
    const result = classifySpendPattern([], DATE_KEY, 500);
    assert.equal(result.hoardingScore, 0.5);
  });

  it('hoarding score at 1000 balance equals 1.0', () => {
    const result = classifySpendPattern([], DATE_KEY, 1000);
    assert.equal(result.hoardingScore, 1.0);
  });

  it('hoarding score at balance 5000 is unbounded (5.0)', () => {
    const result = classifySpendPattern([], '2026-04-29', 5000);
    assert.strictEqual(result.hoardingScore, 5);
  });

  it('handles null/undefined recentActions gracefully', () => {
    const result = classifySpendPattern(null, DATE_KEY, 0);
    assert.equal(result.spendCountToday, 0);
    assert.equal(result.rapidSpend, false);
  });
});

// ── classifyBalanceBucket tests ────────────────────────────────────────────

describe('classifyBalanceBucket', () => {
  it('balance 0 maps to bucket 0', () => {
    assert.equal(classifyBalanceBucket(0), '0');
  });

  it('negative balance maps to bucket 0', () => {
    assert.equal(classifyBalanceBucket(-10), '0');
  });

  it('balance 1 maps to bucket 1-99', () => {
    assert.equal(classifyBalanceBucket(1), '1-99');
  });

  it('balance 99 maps to bucket 1-99', () => {
    assert.equal(classifyBalanceBucket(99), '1-99');
  });

  it('balance 100 maps to bucket 100-299', () => {
    assert.equal(classifyBalanceBucket(100), '100-299');
  });

  it('balance 299 maps to bucket 100-299', () => {
    assert.equal(classifyBalanceBucket(299), '100-299');
  });

  it('balance 300 maps to bucket 300-599', () => {
    assert.equal(classifyBalanceBucket(300), '300-599');
  });

  it('balance 599 maps to bucket 300-599', () => {
    assert.equal(classifyBalanceBucket(599), '300-599');
  });

  it('balance 600 maps to bucket 600-999', () => {
    assert.equal(classifyBalanceBucket(600), '600-999');
  });

  it('balance 999 maps to bucket 600-999', () => {
    assert.equal(classifyBalanceBucket(999), '600-999');
  });

  it('balance 1000 maps to bucket 1000+', () => {
    assert.equal(classifyBalanceBucket(1000), '1000+');
  });

  it('balance 5000 maps to bucket 1000+', () => {
    assert.equal(classifyBalanceBucket(5000), '1000+');
  });
});

// ── Camp success telemetry includes economy health dimensions ──────────────

describe('Camp success telemetry dimensions', () => {
  it('invite success intent includes balanceAfterSpend and monsterId fields', () => {
    const heroState = { economy: makeEconomy(500), heroPool: makeEmptyPool() };
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { command: 'unlock-monster', monsterId: 'glossbloom', branch: 'b1' },
      heroState,
      learnerId: LEARNER,
      rosterVersion: ROSTER_V,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.intent.newBalance, 'number');
    assert.equal(result.intent.newBalance, 500 - HERO_MONSTER_INVITE_COST);
    assert.equal(result.intent.newMonsterState.monsterId, 'glossbloom');
    assert.equal(result.intent.newMonsterState.stage, 0);
  });

  it('grow success intent includes balanceAfterSpend and stageAfter', () => {
    const heroState = { economy: makeEconomy(500), heroPool: makePoolWithOwned('glossbloom', 0, 'b1') };
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { command: 'evolve-monster', monsterId: 'glossbloom', targetStage: 1 },
      heroState,
      learnerId: LEARNER,
      rosterVersion: ROSTER_V,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(typeof result.intent.newBalance, 'number');
    assert.equal(result.intent.ledgerEntry.stageAfter, 1);
    assert.equal(result.intent.newMonsterState.stage, 1);
  });
});

// ── Insufficient-coins telemetry dimensions ───────────────────────────────

describe('Insufficient-coins telemetry dimensions', () => {
  it('rejection includes requiredAmount for invite', () => {
    const heroState = { economy: makeEconomy(10), heroPool: makeEmptyPool() };
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { command: 'unlock-monster', monsterId: 'glossbloom', branch: 'b1' },
      heroState,
      learnerId: LEARNER,
      rosterVersion: ROSTER_V,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
    assert.equal(result.requiredAmount, HERO_MONSTER_INVITE_COST);
  });

  it('grow rejection includes requiredAmount', () => {
    const heroState = { economy: makeEconomy(5), heroPool: makePoolWithOwned('glossbloom', 0, 'b1') };
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { command: 'evolve-monster', monsterId: 'glossbloom', targetStage: 1 },
      heroState,
      learnerId: LEARNER,
      rosterVersion: ROSTER_V,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
    assert.equal(typeof result.requiredAmount, 'number');
    assert.ok(result.requiredAmount > 0);
  });
});
