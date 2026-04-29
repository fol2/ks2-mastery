// Hero Mode P6 U10 — Multi-tab conflict scenario tests.
//
// Exercises multi-tab conflict detection at the PURE FUNCTION level:
// - Two concurrent invites for same monster (already_owned guard)
// - Two concurrent grows for same monster (already_stage guard)
// - Stale revision detection via different state inputs
// - requestId + mutationPayloadHash idempotency
//
// Uses node:test + node:assert/strict. No HTTP server needed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMonsterInviteIntent,
  computeMonsterGrowIntent,
} from '../shared/hero/monster-economy.js';

import { mutationPayloadHash } from '../worker/src/repository-helpers.js';

// ── Test fixtures ────────────────────────────────────────────────────

const LEARNER_ID = 'learner-multi-tab';
const MONSTER_ID = 'glossbloom';
const NOW = Date.now();

function freshEconomy(balance = 5000) {
  return { balance, lifetimeEarned: balance, lifetimeSpent: 0 };
}

function emptyPool() {
  return { monsters: {} };
}

function poolWithOwned(monsterId, stage = 0, branch = 'b1') {
  return {
    monsters: {
      [monsterId]: { monsterId, owned: true, stage, branch, investedCoins: 150 },
    },
  };
}

// ── Multi-tab invite conflict scenarios ─────────────────────────────

describe('P6-U10: Multi-tab — concurrent invite conflict', () => {
  it('first invite succeeds, second gets already-owned because state now shows ownership', () => {
    const economy = freshEconomy();
    const pool = emptyPool();

    // Tab A: invites the monster (first)
    const tabA = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: MONSTER_ID,
      branch: 'b1',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(tabA.ok, true);
    assert.equal(tabA.status, 'invited');
    assert.ok(tabA.cost > 0);

    // After Tab A commits, state now shows the monster as owned.
    // Tab B reads the same logical state but the server has already persisted Tab A's write.
    const poolAfterTabA = poolWithOwned(MONSTER_ID, 0, 'b1');

    // Tab B: same invite — server already applied Tab A
    const tabB = computeMonsterInviteIntent({
      economyState: { ...economy, balance: economy.balance - tabA.cost },
      heroPoolState: poolAfterTabA,
      monsterId: MONSTER_ID,
      branch: 'b1',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW + 100,
    });
    assert.equal(tabB.ok, true);
    assert.equal(tabB.status, 'already-owned');
    assert.equal(tabB.cost, 0);
    assert.equal(tabB.coinsUsed, 0);
    assert.equal(tabB.ledgerEntryId, null);
  });

  it('two concurrent invites for different monsters both succeed (no conflict)', () => {
    const economy = freshEconomy(10000);
    const pool = emptyPool();

    const inviteA = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(inviteA.ok, true);
    assert.equal(inviteA.status, 'invited');

    const inviteB = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'loomrill',
      branch: 'b2',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(inviteB.ok, true);
    assert.equal(inviteB.status, 'invited');
  });
});

// ── Multi-tab grow conflict scenarios ────────────────────────────────

describe('P6-U10: Multi-tab — concurrent grow conflict', () => {
  it('first grow succeeds, second gets already-stage because state already at target', () => {
    const economy = freshEconomy(5000);
    const pool = poolWithOwned(MONSTER_ID, 0, 'b1');

    // Tab A: grow to stage 1
    const tabA = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: MONSTER_ID,
      targetStage: 1,
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(tabA.ok, true);
    assert.equal(tabA.status, 'grown');
    assert.ok(tabA.cost > 0);

    // After Tab A commits, monster is at stage 1.
    const poolAfterTabA = poolWithOwned(MONSTER_ID, 1, 'b1');

    // Tab B: same grow request — server already applied Tab A
    const tabB = computeMonsterGrowIntent({
      economyState: { ...economy, balance: economy.balance - tabA.cost },
      heroPoolState: poolAfterTabA,
      monsterId: MONSTER_ID,
      targetStage: 1,
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW + 200,
    });
    assert.equal(tabB.ok, true);
    assert.equal(tabB.status, 'already-stage');
    assert.equal(tabB.cost, 0);
    assert.equal(tabB.coinsUsed, 0);
    assert.equal(tabB.ledgerEntryId, null);
  });

  it('grow on unowned monster returns hero_monster_not_owned (stale tab view)', () => {
    const economy = freshEconomy();
    const pool = emptyPool(); // Tab sees monster as not yet invited

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: MONSTER_ID,
      targetStage: 1,
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_not_owned');
  });
});

// ── Stale revision simulation (insufficient coins after concurrent spend) ──

describe('P6-U10: Multi-tab — stale balance after concurrent spend', () => {
  it('second spend with depleted balance returns hero_insufficient_coins', () => {
    // Tab A spent coins, but Tab B still sees old balance
    const economyStale = freshEconomy(150); // just enough for one invite
    const pool = emptyPool();

    // Tab A successfully invites monster (balance now 0)
    const tabA = computeMonsterInviteIntent({
      economyState: economyStale,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });
    assert.equal(tabA.ok, true);
    assert.equal(tabA.status, 'invited');

    // Tab B: tries a different monster with same stale economy (server has 0 balance)
    const economyAfterTabA = { ...economyStale, balance: 0, lifetimeSpent: 150 };
    const tabB = computeMonsterInviteIntent({
      economyState: economyAfterTabA,
      heroPoolState: pool,
      monsterId: 'loomrill',
      branch: 'b2',
      learnerId: LEARNER_ID,
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW + 100,
    });
    assert.equal(tabB.ok, false);
    assert.equal(tabB.code, 'hero_insufficient_coins');
  });
});

// ── mutationPayloadHash idempotency (requestId + body) ──────────────

describe('P6-U10: Multi-tab — mutationPayloadHash replay detection', () => {
  it('same requestId + same body produces identical hash (safe replay)', () => {
    const kind = 'hero_command.unlock-monster';
    const payload = {
      command: 'unlock-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, branch: 'b1' },
    };
    const h1 = mutationPayloadHash(kind, payload);
    const h2 = mutationPayloadHash(kind, payload);
    assert.equal(h1, h2, 'Identical payload must produce identical hash');
  });

  it('same requestId + different monster body produces different hash (proves U2 fix)', () => {
    const kind = 'hero_command.unlock-monster';
    const payloadA = {
      command: 'unlock-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: 'glossbloom', branch: 'b1' },
    };
    const payloadB = {
      command: 'unlock-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: 'loomrill', branch: 'b1' },
    };
    const hA = mutationPayloadHash(kind, payloadA);
    const hB = mutationPayloadHash(kind, payloadB);
    assert.notEqual(hA, hB, 'Different monsterId must produce different hash');
  });

  it('same requestId + different branch produces different hash', () => {
    const kind = 'hero_command.unlock-monster';
    const payloadA = {
      command: 'unlock-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, branch: 'b1' },
    };
    const payloadB = {
      command: 'unlock-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, branch: 'b2' },
    };
    const hA = mutationPayloadHash(kind, payloadA);
    const hB = mutationPayloadHash(kind, payloadB);
    assert.notEqual(hA, hB, 'Different branch must produce different hash');
  });

  it('network drop then retry — same hash means safe replay', () => {
    const kind = 'hero_command.evolve-monster';
    const payload = {
      command: 'evolve-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, targetStage: 2 },
    };
    // Simulate network drop: client retries same request
    const firstAttempt = mutationPayloadHash(kind, payload);
    const retryAttempt = mutationPayloadHash(kind, payload);
    assert.equal(firstAttempt, retryAttempt,
      'Retry with identical body must match original hash for safe replay detection');
  });

  it('evolve-monster hash changes when targetStage differs', () => {
    const kind = 'hero_command.evolve-monster';
    const payloadA = {
      command: 'evolve-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, targetStage: 1 },
    };
    const payloadB = {
      command: 'evolve-monster',
      learnerId: LEARNER_ID,
      payload: { monsterId: MONSTER_ID, targetStage: 2 },
    };
    const hA = mutationPayloadHash(kind, payloadA);
    const hB = mutationPayloadHash(kind, payloadB);
    assert.notEqual(hA, hB, 'Different targetStage must produce different hash');
  });
});
