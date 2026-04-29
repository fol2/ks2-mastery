import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMonsterInviteIntent,
  computeMonsterGrowIntent,
  deriveSpendLedgerEntryId,
} from '../shared/hero/monster-economy.js';

import {
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
  HERO_POOL_ROSTER_VERSION,
} from '../shared/hero/hero-pool.js';

// ── Fixtures ─────────────────────────────────────────────────────────

const LEARNER = 'learner-abc-123';
const NOW = 1714400000000;
const ROSTER_V = HERO_POOL_ROSTER_VERSION;

function makeEconomy(balance = 1000, lifetimeSpent = 0, lifetimeEarned = 1000) {
  return { version: 1, balance, lifetimeEarned, lifetimeSpent, ledger: [], lastUpdatedAt: NOW - 1000 };
}

function makePoolWithOwned(monsterId, stage = 0, branch = 'b1') {
  return {
    version: 1,
    rosterVersion: ROSTER_V,
    selectedMonsterId: null,
    monsters: {
      [monsterId]: { monsterId, owned: true, stage, branch, investedCoins: HERO_MONSTER_INVITE_COST, invitedAt: NOW - 5000, lastGrownAt: null, lastLedgerEntryId: 'prev-entry' },
    },
    recentActions: [],
    lastUpdatedAt: NOW - 1000,
  };
}

function makeEmptyPool() {
  return { version: 1, rosterVersion: ROSTER_V, selectedMonsterId: null, monsters: {}, recentActions: [], lastUpdatedAt: null };
}

// ── Invite: success ──────────────────────────────────────────────────

test('invite with sufficient balance debits exactly HERO_MONSTER_INVITE_COST', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'invited');
  assert.equal(result.intent.newBalance, 500 - HERO_MONSTER_INVITE_COST);
  assert.equal(result.intent.ledgerEntry.amount, -HERO_MONSTER_INVITE_COST);
  assert.equal(result.intent.ledgerEntry.type, 'monster-invite');
});

test('invite: balance exactly equals cost succeeds with 0 remaining', () => {
  const eco = makeEconomy(HERO_MONSTER_INVITE_COST);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'loomrill', branch: 'b2',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'invited');
  assert.equal(result.intent.newBalance, 0);
});

test('invite: lifetimeSpent increments; lifetimeEarned unchanged', () => {
  const eco = makeEconomy(500, 100, 600);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'mirrane', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.intent.newLifetimeSpent, 100 + HERO_MONSTER_INVITE_COST);
  // lifetimeEarned is not in the intent — unchanged by spending
});

test('invite: ledger entry has correct deterministic ID', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const r1 = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });
  const r2 = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW + 9999,
  });

  // Same idempotency key → same entry ID regardless of timestamp
  assert.equal(r1.intent.ledgerEntry.entryId, r2.intent.ledgerEntry.entryId);
  assert.match(r1.intent.ledgerEntry.entryId, /^hero-ledger-/);
});

test('invite: balance after = balance - cost', () => {
  const eco = makeEconomy(800);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'colisk', branch: 'b2',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.intent.newBalance, 800 - HERO_MONSTER_INVITE_COST);
  assert.equal(result.intent.ledgerEntry.balanceAfter, 800 - HERO_MONSTER_INVITE_COST);
});

// ── Invite: already owned ────────────────────────────────────────────

test('invite: already-owned returns ok:true with cost 0', () => {
  const eco = makeEconomy(500);
  const pool = makePoolWithOwned('glossbloom');
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'already-owned');
  assert.equal(result.cost, 0);
  assert.equal(result.coinsUsed, 0);
});

// ── Invite: insufficient balance ─────────────────────────────────────

test('invite: insufficient balance returns ok:false', () => {
  const eco = makeEconomy(HERO_MONSTER_INVITE_COST - 1);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_insufficient_coins');
});

// ── Invite: unknown monster ──────────────────────────────────────────

test('invite: unknown monsterId returns hero_monster_unknown', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'fake-monster', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_unknown');
});

// ── Invite: branch validation ────────────────────────────────────────

test('invite: missing branch returns hero_monster_branch_required', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();

  for (const branch of [null, undefined, '']) {
    const result = computeMonsterInviteIntent({
      economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch,
      learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_branch_required', `branch=${JSON.stringify(branch)}`);
  }
});

test('invite: invalid branch returns hero_monster_branch_invalid', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b3',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_branch_invalid');
});

// ── Grow: success (stage 0 → 1) ─────────────────────────────────────

test('grow from stage 0 to 1 debits HERO_MONSTER_GROW_COSTS[1]', () => {
  const eco = makeEconomy(1000);
  const pool = makePoolWithOwned('glossbloom', 0);
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'grown');
  assert.equal(result.intent.ledgerEntry.amount, -HERO_MONSTER_GROW_COSTS[1]);
  assert.equal(result.intent.newBalance, 1000 - HERO_MONSTER_GROW_COSTS[1]);
});

test('grow: lifetimeSpent increments; newMonsterState has correct stage', () => {
  const eco = makeEconomy(2000, 50);
  const pool = makePoolWithOwned('loomrill', 1, 'b2');
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'loomrill', targetStage: 2,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.intent.newLifetimeSpent, 50 + HERO_MONSTER_GROW_COSTS[2]);
  assert.equal(result.intent.newMonsterState.stage, 2);
});

test('grow: ledger entry has correct deterministic ID', () => {
  const eco = makeEconomy(2000);
  const pool = makePoolWithOwned('glossbloom', 0);
  const r1 = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });
  const r2 = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW + 5000,
  });

  assert.equal(r1.intent.ledgerEntry.entryId, r2.intent.ledgerEntry.entryId);
  assert.match(r1.intent.ledgerEntry.entryId, /^hero-ledger-/);
});

test('grow: balance exactly equals cost succeeds with 0 remaining', () => {
  const cost = HERO_MONSTER_GROW_COSTS[1];
  const eco = makeEconomy(cost);
  const pool = makePoolWithOwned('glossbloom', 0);
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.intent.newBalance, 0);
});

// ── Grow: already at stage ───────────────────────────────────────────

test('grow: already at target stage returns ok:true with cost 0', () => {
  const eco = makeEconomy(2000);
  const pool = makePoolWithOwned('glossbloom', 2);
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 2,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'already-stage');
  assert.equal(result.cost, 0);
  assert.equal(result.coinsUsed, 0);
});

// ── Grow: insufficient balance ───────────────────────────────────────

test('grow: insufficient balance returns ok:false', () => {
  const cost = HERO_MONSTER_GROW_COSTS[1];
  const eco = makeEconomy(cost - 1);
  const pool = makePoolWithOwned('glossbloom', 0);
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_insufficient_coins');
});

// ── Grow: unknown monster ────────────────────────────────────────────

test('grow: unknown monsterId returns hero_monster_unknown', () => {
  const eco = makeEconomy(2000);
  const pool = makeEmptyPool();
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'not-real', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_unknown');
});

// ── Grow: monster not owned ──────────────────────────────────────────

test('grow: monster not owned returns hero_monster_not_owned', () => {
  const eco = makeEconomy(2000);
  const pool = makeEmptyPool();
  // glossbloom exists in registry but not in pool state
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_not_owned');
});

// ── Grow: stage not next ─────────────────────────────────────────────

test('grow: target stage not next returns hero_monster_stage_not_next', () => {
  const eco = makeEconomy(5000);
  const pool = makePoolWithOwned('glossbloom', 0);
  // Trying to jump from 0 to 2
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 2,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_stage_not_next');
});

// ── Grow: target stage > maxStage ────────────────────────────────────

test('grow: target stage exceeds max returns hero_monster_max_stage', () => {
  const eco = makeEconomy(50000);
  const pool = makePoolWithOwned('glossbloom', 3);
  // maxStage is 4, so 5 exceeds it
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 5,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_max_stage');
});

// ── Grow: stage invalid ──────────────────────────────────────────────

test('grow: non-integer targetStage returns hero_monster_stage_invalid', () => {
  const eco = makeEconomy(2000);
  const pool = makePoolWithOwned('glossbloom', 0);

  for (const stage of [0, -1, 1.5, NaN, 'two', null, undefined]) {
    const result = computeMonsterGrowIntent({
      economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: stage,
      learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
    });
    assert.equal(result.ok, false, `stage=${stage} should fail`);
    // stage 0 and negatives are invalid; non-integers too
    assert.ok(
      result.code === 'hero_monster_stage_invalid' || result.code === 'hero_monster_max_stage',
      `stage=${stage} got code=${result.code}`
    );
  }
});

// ── Idempotency: same key produces same ledger entry ID ──────────────

test('same idempotency key produces same ledger entry ID across calls', () => {
  const key = 'hero-monster-invite:v1:learner-x:glossbloom:b1';
  const id1 = deriveSpendLedgerEntryId(key);
  const id2 = deriveSpendLedgerEntryId(key);
  assert.equal(id1, id2);
  assert.match(id1, /^hero-ledger-/);
});

test('different keys produce different ledger entry IDs', () => {
  const id1 = deriveSpendLedgerEntryId('hero-monster-invite:v1:learner-x:glossbloom:b1');
  const id2 = deriveSpendLedgerEntryId('hero-monster-invite:v1:learner-x:glossbloom:b2');
  assert.notEqual(id1, id2);
});

// ── Immutability: helpers never modify input objects ──────────────────

test('computeMonsterInviteIntent does not modify input objects', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const ecoSnapshot = JSON.stringify(eco);
  const poolSnapshot = JSON.stringify(pool);

  computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(JSON.stringify(eco), ecoSnapshot);
  assert.equal(JSON.stringify(pool), poolSnapshot);
});

test('computeMonsterGrowIntent does not modify input objects', () => {
  const eco = makeEconomy(2000);
  const pool = makePoolWithOwned('glossbloom', 0);
  const ecoSnapshot = JSON.stringify(eco);
  const poolSnapshot = JSON.stringify(pool);

  computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', targetStage: 1,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  assert.equal(JSON.stringify(eco), ecoSnapshot);
  assert.equal(JSON.stringify(pool), poolSnapshot);
});

// ── Intent shape validation ──────────────────────────────────────────

test('invite intent contains expected fields', () => {
  const eco = makeEconomy(500);
  const pool = makeEmptyPool();
  const result = computeMonsterInviteIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'glossbloom', branch: 'b1',
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  const { intent } = result;
  assert.equal(typeof intent.newBalance, 'number');
  assert.equal(typeof intent.newLifetimeSpent, 'number');
  assert.equal(intent.ledgerEntry.createdBy, 'system');
  assert.equal(intent.ledgerEntry.createdAt, NOW);
  assert.equal(intent.newMonsterState.owned, true);
  assert.equal(intent.newMonsterState.stage, 0);
  assert.equal(intent.newMonsterState.branch, 'b1');
  assert.equal(intent.actionRecord.type, 'monster-invite');
  assert.equal(intent.actionRecord.requestId, null);
  assert.equal(intent.actionRecord.stageBefore, null);
  assert.equal(intent.actionRecord.stageAfter, 0);
  assert.equal(intent.actionRecord.actionId, intent.ledgerEntry.entryId);
});

test('grow intent contains expected fields', () => {
  const eco = makeEconomy(2000);
  const pool = makePoolWithOwned('mirrane', 1, 'b2');
  const result = computeMonsterGrowIntent({
    economyState: eco, heroPoolState: pool, monsterId: 'mirrane', targetStage: 2,
    learnerId: LEARNER, rosterVersion: ROSTER_V, nowTs: NOW,
  });

  const { intent } = result;
  assert.equal(typeof intent.newBalance, 'number');
  assert.equal(typeof intent.newLifetimeSpent, 'number');
  assert.equal(intent.ledgerEntry.type, 'monster-grow');
  assert.equal(intent.ledgerEntry.stageBefore, 1);
  assert.equal(intent.ledgerEntry.stageAfter, 2);
  assert.equal(intent.ledgerEntry.source.kind, 'hero-camp-monster-grow');
  assert.equal(intent.newMonsterState.stage, 2);
  assert.equal(intent.actionRecord.type, 'monster-grow');
  assert.equal(intent.actionRecord.branch, 'b2');
  assert.equal(intent.actionRecord.stageBefore, 1);
  assert.equal(intent.actionRecord.stageAfter, 2);
  assert.equal(intent.actionRecord.actionId, intent.ledgerEntry.entryId);
});
