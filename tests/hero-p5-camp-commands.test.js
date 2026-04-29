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

const LEARNER = 'learner-camp-cmd-001';
const NOW = 1714400000000;
const MONSTER = 'glossbloom';
const MONSTER_B = 'loomrill';

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
    version: 3,
    economy: economyOverride || makeEconomy(),
    heroPool: poolOverride || makeEmptyPool(),
    daily: { dateKey: '2026-04-29', status: 'active', tasks: {}, effortCompleted: 0, effortPlanned: 3 },
    recentClaims: [],
  };
}

// ── Feature flag gating tests ──────────────────────────────────────────

describe('P5-U6 Camp commands — route-level gating', () => {
  describe('Feature flag checks', () => {
    it('HERO_MODE_CAMP_ENABLED = false → returns hero_camp_disabled', () => {
      // Simulates what the route handler does before calling resolveHeroCampCommand
      const env = {
        HERO_MODE_CAMP_ENABLED: 'false',
        HERO_MODE_ECONOMY_ENABLED: 'true',
        HERO_MODE_CHILD_UI_ENABLED: 'true',
      };
      const flagEnabled = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

      // Gate 1
      if (!flagEnabled(env.HERO_MODE_CAMP_ENABLED)) {
        const response = { ok: false, error: { code: 'hero_camp_disabled', message: 'Hero Camp is not enabled' } };
        assert.equal(response.error.code, 'hero_camp_disabled');
        return;
      }
      assert.fail('Should have returned disabled');
    });

    it('HERO_MODE_CAMP_ENABLED = true + ECONOMY off → returns hero_camp_misconfigured', () => {
      const env = {
        HERO_MODE_CAMP_ENABLED: 'true',
        HERO_MODE_ECONOMY_ENABLED: 'false',
        HERO_MODE_CHILD_UI_ENABLED: 'true',
      };
      const flagEnabled = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

      assert.ok(flagEnabled(env.HERO_MODE_CAMP_ENABLED), 'camp should be enabled');
      assert.ok(!flagEnabled(env.HERO_MODE_ECONOMY_ENABLED), 'economy should be disabled');
      // Gate 2 triggers
      const response = { ok: false, error: { code: 'hero_camp_misconfigured', message: 'Hero Camp requires economy to be enabled' } };
      assert.equal(response.error.code, 'hero_camp_misconfigured');
    });

    it('HERO_MODE_CAMP_ENABLED = true + ECONOMY on + CHILD_UI off → returns hero_camp_disabled', () => {
      const env = {
        HERO_MODE_CAMP_ENABLED: 'true',
        HERO_MODE_ECONOMY_ENABLED: 'true',
        HERO_MODE_CHILD_UI_ENABLED: 'false',
      };
      const flagEnabled = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

      assert.ok(flagEnabled(env.HERO_MODE_CAMP_ENABLED));
      assert.ok(flagEnabled(env.HERO_MODE_ECONOMY_ENABLED));
      assert.ok(!flagEnabled(env.HERO_MODE_CHILD_UI_ENABLED));
      // Gate 3 triggers
      const response = { ok: false, error: { code: 'hero_camp_disabled', message: 'Hero Camp requires child UI to be enabled' } };
      assert.equal(response.error.code, 'hero_camp_disabled');
    });

    it('flag values read correctly — string "true" enables, "false" disables', () => {
      const flagEnabled = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());
      assert.ok(flagEnabled('true'));
      assert.ok(flagEnabled('1'));
      assert.ok(flagEnabled('yes'));
      assert.ok(flagEnabled('on'));
      assert.ok(!flagEnabled('false'));
      assert.ok(!flagEnabled('0'));
      assert.ok(!flagEnabled(''));
      assert.ok(!flagEnabled(undefined));
      assert.ok(!flagEnabled(null));
    });
  });

  describe('Resolver wiring — resolveHeroCampCommand called with correct parameters', () => {
    it('unlock-monster is dispatched to resolver and returns correct shape on success', () => {
      const heroState = makeHeroState(makeEconomy(500), makeEmptyPool());
      const body = { command: 'unlock-monster', monsterId: MONSTER, branch: 'b1' };
      const result = resolveHeroCampCommand({
        command: 'unlock-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });

      assert.ok(result.ok, `Expected ok: true, got: ${JSON.stringify(result)}`);
      assert.ok(result.intent, 'Must have intent for mutation');
      assert.ok(result.heroCampAction);
      assert.equal(result.heroCampAction.status, 'invited');
      assert.equal(result.heroCampAction.learnerId, LEARNER);
      assert.equal(result.heroCampAction.monsterId, MONSTER);
      assert.equal(result.heroCampAction.branch, 'b1');
      assert.equal(typeof result.heroCampAction.cost, 'number');
      assert.equal(typeof result.heroCampAction.coinBalance, 'number');
      assert.equal(typeof result.heroCampAction.ledgerEntryId, 'string');
    });

    it('evolve-monster is dispatched to resolver and returns correct shape on success', () => {
      const heroState = makeHeroState(makeEconomy(500), makePoolWithOwned(MONSTER, 0, 'b1'));
      const body = { command: 'evolve-monster', monsterId: MONSTER, targetStage: 1 };
      const result = resolveHeroCampCommand({
        command: 'evolve-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });

      assert.ok(result.ok, `Expected ok: true, got: ${JSON.stringify(result)}`);
      assert.ok(result.intent, 'Must have intent for mutation');
      assert.ok(result.heroCampAction);
      assert.equal(result.heroCampAction.status, 'grown');
      assert.equal(result.heroCampAction.learnerId, LEARNER);
      assert.equal(result.heroCampAction.monsterId, MONSTER);
      assert.equal(typeof result.heroCampAction.cost, 'number');
      assert.equal(typeof result.heroCampAction.coinBalance, 'number');
      assert.equal(typeof result.heroCampAction.ledgerEntryId, 'string');
    });

    it('success response includes expected fields: status, cost, coinBalance, ledgerEntryId', () => {
      const heroState = makeHeroState(makeEconomy(500), makeEmptyPool());
      const body = { command: 'unlock-monster', monsterId: MONSTER, branch: 'b1' };
      const result = resolveHeroCampCommand({
        command: 'unlock-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });

      assert.ok(result.ok);
      const action = result.heroCampAction;
      assert.ok('status' in action, 'response must include status');
      assert.ok('cost' in action, 'response must include cost');
      assert.ok('coinBalance' in action, 'response must include coinBalance');
      assert.ok('ledgerEntryId' in action, 'response must include ledgerEntryId');
      assert.ok('coinsUsed' in action, 'response must include coinsUsed');
    });
  });

  describe('Idempotent responses — already-owned / already-stage skip mutation', () => {
    it('already-owned returns 200 without entering mutation (no intent property)', () => {
      const heroState = makeHeroState(makeEconomy(500), makePoolWithOwned(MONSTER, 0, 'b1'));
      const body = { command: 'unlock-monster', monsterId: MONSTER, branch: 'b1' };
      const result = resolveHeroCampCommand({
        command: 'unlock-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });

      assert.ok(result.ok);
      assert.equal(result.heroCampAction.status, 'already-owned');
      // No intent means no mutation path is entered
      assert.equal(result.intent, undefined);
      assert.ok(result.heroCampAction);
      assert.equal(result.heroCampAction.cost, 0);
      assert.equal(result.heroCampAction.coinsUsed, 0);
    });

    it('already-stage returns 200 without entering mutation (no intent property)', () => {
      // Monster at stage 1, requesting evolve to stage 1 (already there)
      const pool = makePoolWithOwned(MONSTER, 1, 'b1');
      const heroState = makeHeroState(makeEconomy(500), pool);
      const body = { command: 'evolve-monster', monsterId: MONSTER, targetStage: 1 };
      const result = resolveHeroCampCommand({
        command: 'evolve-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });

      assert.ok(result.ok);
      assert.equal(result.heroCampAction.status, 'already-stage');
      // No intent means no mutation path is entered
      assert.equal(result.intent, undefined);
      assert.ok(result.heroCampAction);
      assert.equal(result.heroCampAction.cost, 0);
      assert.equal(result.heroCampAction.coinsUsed, 0);
    });
  });

  describe('Error responses', () => {
    it('unsupported camp command returns hero_camp_disabled', () => {
      const heroState = makeHeroState();
      const result = resolveHeroCampCommand({
        command: 'fly-to-moon',
        body: { command: 'fly-to-moon' },
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });
      assert.ok(!result.ok);
      assert.equal(result.code, 'hero_camp_disabled');
      assert.equal(result.httpStatus, 400);
    });

    it('insufficient coins returns hero_insufficient_coins with httpStatus 409', () => {
      const heroState = makeHeroState(makeEconomy(0), makeEmptyPool());
      const body = { command: 'unlock-monster', monsterId: MONSTER, branch: 'b1' };
      const result = resolveHeroCampCommand({
        command: 'unlock-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });
      assert.ok(!result.ok);
      assert.equal(result.code, 'hero_insufficient_coins');
      assert.equal(result.httpStatus, 409);
    });

    it('forbidden client fields are rejected', () => {
      const heroState = makeHeroState();
      const body = { command: 'unlock-monster', monsterId: MONSTER, branch: 'b1', cost: 999 };
      const result = resolveHeroCampCommand({
        command: 'unlock-monster',
        body,
        heroState,
        learnerId: LEARNER,
        rosterVersion: HERO_POOL_ROSTER_VERSION,
        nowTs: NOW,
      });
      assert.ok(!result.ok);
      assert.equal(result.code, 'hero_client_field_rejected');
    });
  });
});

// ── Wrangler config check ──────────────────────────────────────────────

describe('P5-U6 Camp — wrangler.jsonc contains HERO_MODE_CAMP_ENABLED', () => {
  it('wrangler.jsonc has HERO_MODE_CAMP_ENABLED set to "false"', () => {
    const raw = readFileSync(resolve(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
    assert.ok(raw.includes('"HERO_MODE_CAMP_ENABLED"'), 'Flag must exist in wrangler.jsonc');
    assert.ok(raw.includes('"HERO_MODE_CAMP_ENABLED": "false"'), 'Flag must default to "false"');
  });

  it('worker/wrangler.example.jsonc has HERO_MODE_CAMP_ENABLED set to "false"', () => {
    const raw = readFileSync(resolve(import.meta.dirname, '../worker/wrangler.example.jsonc'), 'utf8');
    assert.ok(raw.includes('"HERO_MODE_CAMP_ENABLED"'), 'Flag must exist in example wrangler');
    assert.ok(raw.includes('"HERO_MODE_CAMP_ENABLED": "false"'), 'Flag must default to "false"');
  });
});

// ── Import path verification ───────────────────────────────────────────

describe('P5-U6 Camp — import path is correct', () => {
  it('camp.js resolver is importable and exports resolveHeroCampCommand', () => {
    assert.equal(typeof resolveHeroCampCommand, 'function');
  });

  it('camp.js exports FORBIDDEN_CAMP_FIELDS', () => {
    assert.ok(Array.isArray(FORBIDDEN_CAMP_FIELDS));
    assert.ok(FORBIDDEN_CAMP_FIELDS.length > 0);
  });
});
