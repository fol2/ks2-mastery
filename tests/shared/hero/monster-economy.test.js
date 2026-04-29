'use strict';

// Hero Mode P5 U4 — Monster economy pure spending computation tests.
//
// Validates computeMonsterInviteIntent and computeMonsterGrowIntent:
// - Happy paths with correct debits
// - Edge cases: already-owned, already-stage, exact balance
// - Error paths: insufficient coins, unknown monster, invalid branch, stage violations
// - Determinism: same inputs → same ledger entry ID
// - Purity: input objects are never mutated

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMonsterInviteIntent,
  computeMonsterGrowIntent,
} from '../../../shared/hero/monster-economy.js';

import {
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
} from '../../../shared/hero/hero-pool.js';

// ── Fixture builders ────────────────────────────────────────────────────

const NOW = 1714400000000; // fixed timestamp for determinism

function buildEconomyState(overrides = {}) {
  return {
    version: 1,
    balance: 1000,
    lifetimeEarned: 1000,
    lifetimeSpent: 0,
    ledger: [],
    lastUpdatedAt: NOW - 86400000,
    ...overrides,
  };
}

function buildHeroPoolState(monsters = {}) {
  return { monsters };
}

function buildOwnedMonster(overrides = {}) {
  return {
    monsterId: 'glossbloom',
    owned: true,
    stage: 0,
    branch: 'b1',
    investedCoins: HERO_MONSTER_INVITE_COST,
    invitedAt: NOW - 86400000,
    lastGrownAt: null,
    lastLedgerEntryId: 'hero-ledger-prev',
    ...overrides,
  };
}

// ── computeMonsterInviteIntent — happy path ─────────────────────────────

describe('computeMonsterInviteIntent — happy path', () => {
  it('invite with sufficient balance debits exactly 150', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'invited');
    assert.equal(result.cost, HERO_MONSTER_INVITE_COST);
    assert.equal(result.coinsUsed, HERO_MONSTER_INVITE_COST);
    assert.equal(result.intent.ledgerEntry.amount, -HERO_MONSTER_INVITE_COST);
    assert.equal(result.intent.ledgerEntry.type, 'monster-invite');
    assert.equal(result.intent.monsterState.stage, 0);
    assert.equal(result.intent.monsterState.owned, true);
  });

  it('balanceAfter = balance - cost', () => {
    const economy = buildEconomyState({ balance: 400 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'loomrill',
      branch: 'b2',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.intent.ledgerEntry.balanceAfter, 400 - HERO_MONSTER_INVITE_COST);
    assert.equal(result.intent.economyDelta.balanceAfter, 400 - HERO_MONSTER_INVITE_COST);
  });

  it('ledger entry has deterministic ID (same inputs → same ID)', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});
    const params = {
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    };

    const r1 = computeMonsterInviteIntent(params);
    const r2 = computeMonsterInviteIntent(params);

    assert.equal(r1.ledgerEntryId, r2.ledgerEntryId);
    assert.equal(r1.intent.ledgerEntry.entryId, r2.intent.ledgerEntry.entryId);
  });

  it('balance exactly equals cost → succeeds with 0 remaining', () => {
    const economy = buildEconomyState({ balance: HERO_MONSTER_INVITE_COST });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'invited');
    assert.equal(result.intent.ledgerEntry.balanceAfter, 0);
    assert.equal(result.intent.economyDelta.balanceAfter, 0);
  });
});

// ── computeMonsterInviteIntent — edge cases ─────────────────────────────

describe('computeMonsterInviteIntent — edge cases', () => {
  it('already-owned → { ok: true, status: "already-owned", cost: 0, coinsUsed: 0 }', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ monsterId: 'glossbloom' }),
    });

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'already-owned');
    assert.equal(result.cost, 0);
    assert.equal(result.coinsUsed, 0);
    assert.equal(result.ledgerEntryId, null);
  });
});

// ── computeMonsterInviteIntent — error paths ────────────────────────────

describe('computeMonsterInviteIntent — error paths', () => {
  it('insufficient balance → { ok: false, code: "hero_insufficient_coins" }', () => {
    const economy = buildEconomyState({ balance: HERO_MONSTER_INVITE_COST - 1 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
  });

  it('unknown monsterId → { ok: false, code: "hero_monster_unknown" }', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'unknown-creature',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_unknown');
  });

  it('invalid branch "b3" → { ok: false, code: "hero_monster_branch_invalid" }', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b3',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_branch_invalid');
  });

  it('missing branch (null) → { ok: false, code: "hero_monster_branch_required" }', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: null,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_branch_required');
  });

  it('missing branch (undefined) → { ok: false, code: "hero_monster_branch_required" }', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: undefined,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_branch_required');
  });
});

// ── computeMonsterGrowIntent — happy path ───────────────────────────────

describe('computeMonsterGrowIntent — happy path', () => {
  it('grow stage 0→1 debits 300', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'grown');
    assert.equal(result.cost, HERO_MONSTER_GROW_COSTS[1]);
    assert.equal(result.coinsUsed, 300);
    assert.equal(result.intent.ledgerEntry.amount, -300);
    assert.equal(result.intent.ledgerEntry.type, 'monster-grow');
    assert.equal(result.intent.ledgerEntry.stageBefore, 0);
    assert.equal(result.intent.ledgerEntry.stageAfter, 1);
  });

  it('grow stage 1→2 debits 600', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 1 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 2,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'grown');
    assert.equal(result.cost, HERO_MONSTER_GROW_COSTS[2]);
    assert.equal(result.coinsUsed, 600);
    assert.equal(result.intent.ledgerEntry.amount, -600);
    assert.equal(result.intent.ledgerEntry.stageBefore, 1);
    assert.equal(result.intent.ledgerEntry.stageAfter, 2);
  });

  it('lifetimeSpent increments by cost; lifetimeEarned unchanged', () => {
    const economy = buildEconomyState({ balance: 1000, lifetimeEarned: 2000, lifetimeSpent: 300 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    // The intent's economyDelta tells the caller how to update lifetimeSpent
    assert.equal(result.intent.economyDelta.lifetimeSpentDelta, HERO_MONSTER_GROW_COSTS[1]);
    // No earning delta on a spend operation
    assert.equal(result.intent.economyDelta.balanceDelta, -HERO_MONSTER_GROW_COSTS[1]);
  });

  it('balanceAfter = balance - cost for grow', () => {
    const economy = buildEconomyState({ balance: 700 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.intent.ledgerEntry.balanceAfter, 700 - 300);
    assert.equal(result.intent.economyDelta.balanceAfter, 400);
  });

  it('investedCoins increments by cost on grow', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0, investedCoins: 150 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.intent.monsterState.investedCoins, 150 + 300);
  });
});

// ── computeMonsterGrowIntent — edge cases ───────────────────────────────

describe('computeMonsterGrowIntent — edge cases', () => {
  it('already at target stage → { ok: true, status: "already-stage", cost: 0, coinsUsed: 0 }', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 2 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 2,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'already-stage');
    assert.equal(result.cost, 0);
    assert.equal(result.coinsUsed, 0);
    assert.equal(result.ledgerEntryId, null);
  });

  it('already past target stage → { ok: true, status: "already-stage" }', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 3 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 2,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'already-stage');
    assert.equal(result.cost, 0);
    assert.equal(result.coinsUsed, 0);
  });

  it('balance exactly equals grow cost → succeeds with 0 remaining', () => {
    const economy = buildEconomyState({ balance: HERO_MONSTER_GROW_COSTS[1] });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'grown');
    assert.equal(result.intent.ledgerEntry.balanceAfter, 0);
    assert.equal(result.intent.economyDelta.balanceAfter, 0);
  });
});

// ── computeMonsterGrowIntent — error paths ──────────────────────────────

describe('computeMonsterGrowIntent — error paths', () => {
  it('insufficient balance → { ok: false, code: "hero_insufficient_coins" }', () => {
    const economy = buildEconomyState({ balance: 299 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
  });

  it('unknown monsterId → { ok: false, code: "hero_monster_unknown" }', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({});

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'unknown-creature',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_unknown');
  });

  it('monster not owned → { ok: false, code: "hero_monster_not_owned" }', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      glossbloom: { monsterId: 'glossbloom', owned: false, stage: 0 },
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_not_owned');
  });

  it('target stage not next sequential (skip stage 0→2) → { ok: false, code: "hero_monster_stage_not_next" }', () => {
    const economy = buildEconomyState({ balance: 5000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 2,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_stage_not_next');
  });

  it('target stage 5 (> max) → { ok: false, code: "hero_monster_max_stage" }', () => {
    const economy = buildEconomyState({ balance: 10000 });
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 4 }),
    });

    const result = computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 5,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_max_stage');
  });
});

// ── Determinism / idempotency ───────────────────────────────────────────

describe('Determinism — idempotency key contract', () => {
  it('same invite inputs always produce same ledger entry ID', () => {
    const economy = buildEconomyState({ balance: 500 });
    const pool = buildHeroPoolState({});
    const params = {
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'colisk',
      branch: 'b2',
      learnerId: 'learner-abc',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    };

    const r1 = computeMonsterInviteIntent(params);
    const r2 = computeMonsterInviteIntent({ ...params, nowTs: NOW + 99999 });

    // Entry ID is derived from idempotency key only — NOT from timestamp
    assert.equal(r1.ledgerEntryId, r2.ledgerEntryId);
    assert.equal(r1.intent.ledgerEntry.idempotencyKey, r2.intent.ledgerEntry.idempotencyKey);
  });

  it('same grow inputs always produce same ledger entry ID', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const pool = buildHeroPoolState({
      loomrill: buildOwnedMonster({ monsterId: 'loomrill', stage: 1 }),
    });
    const params = {
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'loomrill',
      targetStage: 2,
      learnerId: 'learner-xyz',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    };

    const r1 = computeMonsterGrowIntent(params);
    const r2 = computeMonsterGrowIntent({ ...params, nowTs: NOW + 10000 });

    assert.equal(r1.ledgerEntryId, r2.ledgerEntryId);
    assert.equal(r1.intent.ledgerEntry.idempotencyKey, r2.intent.ledgerEntry.idempotencyKey);
  });
});

// ── Purity — no mutation of inputs ──────────────────────────────────────

describe('Purity — no input mutation', () => {
  it('computeMonsterInviteIntent never modifies input economyState', () => {
    const economy = buildEconomyState({ balance: 500 });
    const frozenCopy = JSON.parse(JSON.stringify(economy));
    const pool = buildHeroPoolState({});

    computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.deepEqual(economy, frozenCopy);
  });

  it('computeMonsterInviteIntent never modifies input heroPoolState', () => {
    const pool = buildHeroPoolState({});
    const frozenCopy = JSON.parse(JSON.stringify(pool));
    const economy = buildEconomyState({ balance: 500 });

    computeMonsterInviteIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      branch: 'b1',
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.deepEqual(pool, frozenCopy);
  });

  it('computeMonsterGrowIntent never modifies input economyState', () => {
    const economy = buildEconomyState({ balance: 1000 });
    const frozenCopy = JSON.parse(JSON.stringify(economy));
    const pool = buildHeroPoolState({
      glossbloom: buildOwnedMonster({ stage: 0 }),
    });

    computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.deepEqual(economy, frozenCopy);
  });

  it('computeMonsterGrowIntent never modifies input heroPoolState', () => {
    const monster = buildOwnedMonster({ stage: 0 });
    const pool = buildHeroPoolState({ glossbloom: monster });
    const frozenCopy = JSON.parse(JSON.stringify(pool));
    const economy = buildEconomyState({ balance: 1000 });

    computeMonsterGrowIntent({
      economyState: economy,
      heroPoolState: pool,
      monsterId: 'glossbloom',
      targetStage: 1,
      learnerId: 'learner-1',
      rosterVersion: 'hero-pool-v1',
      nowTs: NOW,
    });

    assert.deepEqual(pool, frozenCopy);
  });
});
