import test from 'node:test';
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

// ── Fixtures ─────────────────────────────────────────────────────────

const LEARNER = 'learner-camp-test-001';
const NOW = 1714400000000;
const ROSTER_V = HERO_POOL_ROSTER_VERSION;

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
        lastLedgerEntryId: 'prev-entry',
      },
    },
    recentActions: [],
    lastUpdatedAt: NOW - 1000,
  };
}

function makeHeroState(balance = 1000, pool = null) {
  return {
    version: 3,
    daily: null,
    recentClaims: [],
    economy: makeEconomy(balance),
    heroPool: pool || makeEmptyPool(),
  };
}

function invoke(command, body, opts = {}) {
  return resolveHeroCampCommand({
    command,
    body,
    heroState: opts.heroState || makeHeroState(opts.balance, opts.pool),
    learnerId: opts.learnerId || LEARNER,
    rosterVersion: opts.rosterVersion || ROSTER_V,
    nowTs: opts.nowTs || NOW,
  });
}

// ── Happy path: unlock-monster with valid body → status 'invited' ───

test('unlock-monster: valid body returns ok intent with status invited', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b1' }, { balance: 500 });

  assert.equal(result.ok, true);
  assert.equal(result.heroCampAction.status, 'invited');
  assert.equal(result.heroCampAction.learnerId, LEARNER);
  assert.equal(result.heroCampAction.monsterId, 'glossbloom');
  assert.equal(result.heroCampAction.branch, 'b1');
  assert.equal(result.heroCampAction.version, 1);
  assert.equal(typeof result.heroCampAction.ledgerEntryId, 'string');
  assert.equal(result.heroCampAction.coinBalance, 500 - HERO_MONSTER_INVITE_COST);
});

// ── Happy path: evolve-monster with valid body → status 'grown' ─────

test('evolve-monster: valid body returns ok with status grown', () => {
  const pool = makePoolWithOwned('glossbloom', 0, 'b1');
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 1 }, { balance: 2000, pool });

  assert.equal(result.ok, true);
  assert.equal(result.heroCampAction.status, 'grown');
  assert.equal(result.heroCampAction.monsterId, 'glossbloom');
  assert.equal(result.heroCampAction.stageBefore, 0);
  assert.equal(result.heroCampAction.stageAfter, 1);
  assert.equal(result.heroCampAction.coinBalance, 2000 - HERO_MONSTER_GROW_COSTS[1]);
  assert.equal(typeof result.heroCampAction.ledgerEntryId, 'string');
});

// ── Happy path: resolver returns server-derived cost ─────────────────

test('resolver returns server-derived cost, not from client', () => {
  const result = invoke('unlock-monster', { monsterId: 'loomrill', branch: 'b2' }, { balance: 500 });

  assert.equal(result.ok, true);
  assert.equal(result.heroCampAction.cost, HERO_MONSTER_INVITE_COST);
  assert.equal(result.heroCampAction.coinsUsed, HERO_MONSTER_INVITE_COST);
});

// ── Edge case: already-owned invite → status 'already-owned' ────────

test('unlock-monster: already-owned returns status already-owned, no ledger entry', () => {
  const pool = makePoolWithOwned('glossbloom', 2, 'b1');
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b1' }, { balance: 500, pool });

  assert.equal(result.ok, true);
  assert.equal(result.heroCampAction.status, 'already-owned');
  assert.equal(result.heroCampAction.cost, 0);
  assert.equal(result.heroCampAction.coinsUsed, 0);
  assert.equal(result.heroCampAction.ledgerEntryId, null);
});

// ── Edge case: already-at-stage grow → status 'already-stage' ───────

test('evolve-monster: already-at-stage returns status already-stage, no ledger entry', () => {
  const pool = makePoolWithOwned('glossbloom', 2, 'b1');
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 2 }, { balance: 5000, pool });

  assert.equal(result.ok, true);
  assert.equal(result.heroCampAction.status, 'already-stage');
  assert.equal(result.heroCampAction.cost, 0);
  assert.equal(result.heroCampAction.coinsUsed, 0);
  assert.equal(result.heroCampAction.ledgerEntryId, null);
});

// ── Error: forbidden field 'cost' ───────────────────────────────────

test('forbidden field cost in body returns hero_client_field_rejected with httpStatus 400', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b1', cost: 50 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_client_field_rejected');
  assert.equal(result.httpStatus, 400);
});

// ── Error: forbidden field 'balance' ────────────────────────────────

test('forbidden field balance in body returns hero_client_field_rejected with httpStatus 400', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b1', balance: 999 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_client_field_rejected');
  assert.equal(result.httpStatus, 400);
});

// ── Error: forbidden field 'payload' ────────────────────────────────

test('forbidden field payload in body returns hero_client_field_rejected with httpStatus 400', () => {
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 1, payload: {} });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_client_field_rejected');
  assert.equal(result.httpStatus, 400);
});

// ── Error: unknown monsterId ────────────────────────────────────────

test('unknown monsterId returns hero_monster_unknown', () => {
  const result = invoke('unlock-monster', { monsterId: 'fake-dragon', branch: 'b1' }, { balance: 500 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_unknown');
  assert.equal(result.httpStatus, 400);
});

// ── Error: invalid branch ───────────────────────────────────────────

test('invalid branch returns hero_monster_branch_invalid', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b99' }, { balance: 500 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_branch_invalid');
  assert.equal(result.httpStatus, 400);
});

// ── Error: missing branch ───────────────────────────────────────────

test('missing branch returns hero_monster_branch_required', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom' }, { balance: 500 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_branch_required');
  assert.equal(result.httpStatus, 400);
});

// ── Error: monster not owned for grow ───────────────────────────────

test('evolve-monster: monster not owned returns hero_monster_not_owned', () => {
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 1 }, { balance: 2000 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_not_owned');
  assert.equal(result.httpStatus, 400);
});

// ── Error: target stage not next ────────────────────────────────────

test('evolve-monster: target stage not next returns hero_monster_stage_not_next', () => {
  const pool = makePoolWithOwned('glossbloom', 0, 'b1');
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 2 }, { balance: 5000, pool });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_monster_stage_not_next');
  assert.equal(result.httpStatus, 400);
});

// ── Error: insufficient coins ───────────────────────────────────────

test('unlock-monster: insufficient coins returns hero_insufficient_coins with httpStatus 409', () => {
  const result = invoke('unlock-monster', { monsterId: 'glossbloom', branch: 'b1' }, { balance: 10 });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_insufficient_coins');
  assert.equal(result.httpStatus, 409);
});

test('evolve-monster: insufficient coins returns hero_insufficient_coins with httpStatus 409', () => {
  const pool = makePoolWithOwned('glossbloom', 0, 'b1');
  const result = invoke('evolve-monster', { monsterId: 'glossbloom', targetStage: 1 }, { balance: 10, pool });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_insufficient_coins');
  assert.equal(result.httpStatus, 409);
});

// ── Boundary: zero imports from subject runtime ─────────────────────

test('structural: camp.js has zero imports from subject runtime', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../worker/src/hero/camp.js'), 'utf8');

  assert.equal(src.includes('from \'../subjects/'), false, 'must not import from subjects/');
  assert.equal(src.includes('from \'../../subjects/'), false, 'must not import from subjects/');
  assert.equal(src.includes('from \'../../../src/'), false, 'must not import from src/');
  assert.equal(src.includes('from \'react'), false, 'must not import react');
  assert.equal(src.includes('require(\'react'), false, 'must not require react');
});

// ── Boundary: no repository or D1 imports ───────────────────────────

test('structural: camp.js does not import repository or D1', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../worker/src/hero/camp.js'), 'utf8');

  assert.equal(src.includes('repository'), false, 'must not reference repository');
  assert.equal(src.includes('D1'), false, 'must not reference D1');
  assert.equal(src.includes('.prepare('), false, 'must not use SQL prepare');
  assert.equal(src.includes('.bind('), false, 'must not use SQL bind');
  assert.equal(src.includes('env.DB'), false, 'must not reference env.DB');
});
