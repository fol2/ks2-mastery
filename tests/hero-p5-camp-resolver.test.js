import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  resolveHeroCampCommand,
  FORBIDDEN_CAMP_FIELDS,
} from '../worker/src/hero/camp.js';

import {
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
  HERO_POOL_ROSTER_VERSION,
} from '../shared/hero/hero-pool.js';

// ── Fixtures ────────────────────────────────────────────────────────────

const LEARNER = 'learner-camp-test-001';
const NOW = 1714400000000;

function makeEconomy(balance = 1000, lifetimeSpent = 0, lifetimeEarned = 1000) {
  return { version: 1, balance, lifetimeEarned, lifetimeSpent, ledger: [], lastUpdatedAt: NOW - 1000 };
}

function makeEmptyPool() {
  return {
    version: 1,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
    selectedMonsterId: null,
    monsters: {},
    recentActions: [],
    lastUpdatedAt: null,
  };
}

function makePoolWithOwned(monsterId, stage = 0, branch = 'b1') {
  return {
    version: 1,
    rosterVersion: HERO_POOL_ROSTER_VERSION,
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
        lastLedgerEntryId: 'prev-entry',
      },
    },
    recentActions: [],
    lastUpdatedAt: NOW - 1000,
  };
}

function makeHeroState(economyOverride, poolOverride) {
  return {
    economy: economyOverride || makeEconomy(),
    heroPool: poolOverride || makeEmptyPool(),
  };
}

// ── unlock-monster: success ─────────────────────────────────────────────

describe('resolveHeroCampCommand — unlock-monster', () => {
  it('returns ok intent with valid body', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'b1' },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'invited');
    assert.equal(result.httpStatus, 200);
    assert.ok(result.intent);
    assert.equal(result.intent.newBalance, 1000 - HERO_MONSTER_INVITE_COST);
    assert.equal(result.response.heroCampAction.status, 'invited');
    assert.equal(result.response.heroCampAction.monsterId, 'glossbloom');
    assert.equal(result.response.heroCampAction.branch, 'b1');
  });

  it('returns server-derived cost, not from client body', () => {
    // Even if client tries to send cost=0, the resolver uses server-side cost
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'loomrill', branch: 'b2' },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.response.heroCampAction.cost, HERO_MONSTER_INVITE_COST);
    assert.equal(result.response.heroCampAction.coinsUsed, HERO_MONSTER_INVITE_COST);
  });

  it('already-owned invite returns already-owned with no debit intent', () => {
    const pool = makePoolWithOwned('glossbloom', 2, 'b1');
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'b1' },
      heroState: makeHeroState(makeEconomy(), pool),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'already-owned');
    assert.equal(result.httpStatus, 200);
    assert.equal(result.intent, undefined);
    assert.equal(result.response.heroCampAction.cost, 0);
    assert.equal(result.response.heroCampAction.coinsUsed, 0);
    assert.equal(result.response.heroCampAction.ledgerEntryId, null);
  });

  it('missing monsterId returns validation error', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { branch: 'b1' },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_unknown');
    assert.equal(result.httpStatus, 400);
  });

  it('invalid branch returns error', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'bad-branch' },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_branch_invalid');
    assert.equal(result.httpStatus, 400);
  });

  it('insufficient coins returns 409', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'b1' },
      heroState: makeHeroState(makeEconomy(10)),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
    assert.equal(result.httpStatus, 409);
  });
});

// ── evolve-monster: success ─────────────────────────────────────────────

describe('resolveHeroCampCommand — evolve-monster', () => {
  it('returns ok intent with valid body', () => {
    const pool = makePoolWithOwned('mirrane', 0, 'b2');
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { monsterId: 'mirrane', targetStage: 1 },
      heroState: makeHeroState(makeEconomy(2000), pool),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'grown');
    assert.equal(result.httpStatus, 200);
    assert.ok(result.intent);
    assert.equal(result.intent.newBalance, 2000 - HERO_MONSTER_GROW_COSTS[1]);
    assert.equal(result.response.heroCampAction.status, 'grown');
    assert.equal(result.response.heroCampAction.monsterId, 'mirrane');
    assert.equal(result.response.heroCampAction.stageAfter, 1);
  });

  it('already-stage grow returns already-stage with no debit intent', () => {
    const pool = makePoolWithOwned('colisk', 2, 'b1');
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { monsterId: 'colisk', targetStage: 1 },
      heroState: makeHeroState(makeEconomy(), pool),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'already-stage');
    assert.equal(result.httpStatus, 200);
    assert.equal(result.intent, undefined);
    assert.equal(result.response.heroCampAction.cost, 0);
    assert.equal(result.response.heroCampAction.coinsUsed, 0);
    assert.equal(result.response.heroCampAction.ledgerEntryId, null);
  });

  it('missing monsterId returns validation error', () => {
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { targetStage: 1 },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_monster_unknown');
    assert.equal(result.httpStatus, 400);
  });

  it('insufficient coins for grow returns 409', () => {
    const pool = makePoolWithOwned('hyphang', 0, 'b1');
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { monsterId: 'hyphang', targetStage: 1 },
      heroState: makeHeroState(makeEconomy(5), pool),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_insufficient_coins');
    assert.equal(result.httpStatus, 409);
  });
});

// ── Forbidden fields ────────────────────────────────────────────────────

describe('resolveHeroCampCommand — forbidden fields', () => {
  it('forbidden field "cost" in body returns hero_client_field_rejected', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'b1', cost: 0 },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_client_field_rejected');
    assert.equal(result.httpStatus, 400);
    assert.ok(result.rejectedFields.includes('cost'));
  });

  it('forbidden field "balance" in body returns hero_client_field_rejected', () => {
    const result = resolveHeroCampCommand({
      command: 'evolve-monster',
      body: { monsterId: 'glossbloom', targetStage: 1, balance: 9999 },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_client_field_rejected');
    assert.equal(result.httpStatus, 400);
    assert.ok(result.rejectedFields.includes('balance'));
  });

  it('multiple forbidden fields are all reported', () => {
    const result = resolveHeroCampCommand({
      command: 'unlock-monster',
      body: { monsterId: 'glossbloom', branch: 'b1', cost: 0, ledger: [], economy: {} },
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_client_field_rejected');
    assert.ok(result.rejectedFields.includes('cost'));
    assert.ok(result.rejectedFields.includes('ledger'));
    assert.ok(result.rejectedFields.includes('economy'));
  });
});

// ── Unknown command ─────────────────────────────────────────────────────

describe('resolveHeroCampCommand — unknown command', () => {
  it('unknown command returns error', () => {
    const result = resolveHeroCampCommand({
      command: 'buy-hat',
      body: {},
      heroState: makeHeroState(),
      learnerId: LEARNER,
      nowTs: NOW,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'hero_command_unknown');
    assert.equal(result.httpStatus, 400);
  });
});

// ── Source integrity ────────────────────────────────────────────────────

describe('resolveHeroCampCommand — source integrity', () => {
  const campSource = readFileSync(
    resolve(import.meta.dirname, '..', 'worker', 'src', 'hero', 'camp.js'),
    'utf8'
  );

  it('has zero imports from subject runtime', () => {
    const subjectImports = campSource.match(/from\s+['"].*subjects\//g);
    assert.equal(subjectImports, null, 'Must not import from worker/src/subjects/');
  });

  it('does not import repository or D1', () => {
    const repoImports = campSource.match(/from\s+['"].*repository/g);
    const d1Imports = campSource.match(/from\s+['"].*d1/gi);
    assert.equal(repoImports, null, 'Must not import repository');
    assert.equal(d1Imports, null, 'Must not import D1');
  });

  it('does not call runHeroCommandMutation', () => {
    const mutationCalls = campSource.match(/runHeroCommandMutation/g);
    assert.equal(mutationCalls, null, 'Must not reference runHeroCommandMutation');
  });
});
