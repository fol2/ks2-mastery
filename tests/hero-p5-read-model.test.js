// Hero Mode P5 U7 — Read model v6 with child-safe Camp block.
//
// Tests verify that the read model correctly evolves to v6 when camp
// is enabled, exposes child-safe Camp fields with monster roster,
// ownership, affordability, recent actions, and preserves existing
// v5 behaviour when camp is disabled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { normaliseHeroProgressState } from '../shared/hero/progress-state.js';
import {
  HERO_POOL_INITIAL_MONSTER_IDS,
  HERO_POOL_ROSTER_VERSION,
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
} from '../shared/hero/hero-pool.js';

// ── Fixture helpers ───────────────────────────────────────────────────

const BASE_ENV = {
  HERO_MODE_SHADOW_ENABLED: 'true',
  HERO_MODE_LAUNCH_ENABLED: 'true',
  HERO_MODE_CHILD_UI_ENABLED: 'true',
};

const PROGRESS_ENV = {
  ...BASE_ENV,
  HERO_MODE_PROGRESS_ENABLED: 'true',
};

const ECONOMY_ENV = {
  ...PROGRESS_ENV,
  HERO_MODE_ECONOMY_ENABLED: 'true',
};

const CAMP_ENV = {
  ...ECONOMY_ENV,
  HERO_MODE_CAMP_ENABLED: 'true',
};

const SPELLING_DATA = {
  stats: {
    core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
  },
};

const PUNCTUATION_DATA = {
  availability: { status: 'ready' },
  stats: { total: 20, secure: 8, due: 5, fresh: 3, weak: 2, attempts: 100, correct: 75, accuracy: 75 },
};

function makeSubjectReadModels() {
  return {
    spelling: { data: SPELLING_DATA, ui: {} },
    punctuation: { data: PUNCTUATION_DATA, ui: {} },
  };
}

function buildV5(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: ECONOMY_ENV,
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: false,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

function buildV6(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: CAMP_ENV,
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

function makeProgressStateWithPool(poolOverride = {}, economyOverride = {}) {
  return normaliseHeroProgressState({
    version: 3,
    daily: {
      dateKey: '2026-04-29',
      timezone: 'Europe/London',
      questId: 'quest-test',
      questFingerprint: 'fp-test',
      schedulerVersion: 'p2-scheduler-v1',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: [],
      completedTaskIds: [],
      tasks: {},
      generatedAt: Date.now() - 10000,
      firstStartedAt: null,
      completedAt: null,
      lastUpdatedAt: Date.now(),
    },
    recentClaims: [],
    economy: {
      version: 1,
      balance: 500,
      lifetimeEarned: 500,
      lifetimeSpent: 0,
      ledger: [],
      lastUpdatedAt: Date.now() - 1000,
      ...economyOverride,
    },
    heroPool: {
      version: 1,
      rosterVersion: HERO_POOL_ROSTER_VERSION,
      selectedMonsterId: null,
      monsters: {},
      recentActions: [],
      lastUpdatedAt: null,
      ...poolOverride,
    },
  });
}

// ── V6 shape: camp enabled + economy enabled ──────────────────────────

test('camp enabled + economy enabled → v6 with camp block and 6 monsters', () => {
  const model = buildV6();

  assert.equal(model.version, 6);
  assert.ok(model.camp, 'camp block must be present');
  assert.equal(model.camp.enabled, true);
  assert.equal(model.camp.version, 1);
  assert.equal(model.camp.rosterVersion, HERO_POOL_ROSTER_VERSION);
  assert.equal(model.camp.monsters.length, 6);
  assert.deepEqual(
    model.camp.monsters.map(m => m.monsterId),
    HERO_POOL_INITIAL_MONSTER_IDS,
  );
});

test('owned monster shows correct stage, branch, and costs', () => {
  const state = makeProgressStateWithPool({
    monsters: {
      glossbloom: {
        monsterId: 'glossbloom',
        owned: true,
        stage: 2,
        branch: 'b1',
        investedCoins: 1050,
        invitedAt: Date.now() - 100000,
        lastGrownAt: Date.now() - 50000,
        lastLedgerEntryId: 'entry-1',
      },
    },
  });

  const model = buildV6({ heroProgressState: state });
  const glossbloom = model.camp.monsters.find(m => m.monsterId === 'glossbloom');

  assert.equal(glossbloom.owned, true);
  assert.equal(glossbloom.stage, 2);
  assert.equal(glossbloom.branch, 'b1');
  assert.equal(glossbloom.canInvite, false);
  assert.equal(glossbloom.canGrow, true);
  assert.equal(glossbloom.nextStage, 3);
  assert.equal(glossbloom.nextGrowCost, HERO_MONSTER_GROW_COSTS[3]);
});

test('canAffordInvite true when balance >= invite cost', () => {
  const state = makeProgressStateWithPool(
    { monsters: {} },
    { balance: HERO_MONSTER_INVITE_COST },
  );

  const model = buildV6({ heroProgressState: state });
  const glossbloom = model.camp.monsters.find(m => m.monsterId === 'glossbloom');

  assert.equal(glossbloom.canInvite, true);
  assert.equal(glossbloom.canAffordInvite, true);
});

test('canAffordInvite false when balance < invite cost', () => {
  const state = makeProgressStateWithPool(
    { monsters: {} },
    { balance: HERO_MONSTER_INVITE_COST - 1 },
  );

  const model = buildV6({ heroProgressState: state });
  const glossbloom = model.camp.monsters.find(m => m.monsterId === 'glossbloom');

  assert.equal(glossbloom.canInvite, true);
  assert.equal(glossbloom.canAffordInvite, false);
});

test('canAffordGrow true when balance >= next grow cost', () => {
  const nextGrowCost = HERO_MONSTER_GROW_COSTS[2]; // cost to grow from stage 1 to 2
  const state = makeProgressStateWithPool(
    {
      monsters: {
        loomrill: {
          monsterId: 'loomrill',
          owned: true,
          stage: 1,
          branch: 'b2',
          investedCoins: 450,
          invitedAt: Date.now() - 100000,
          lastGrownAt: Date.now() - 50000,
          lastLedgerEntryId: 'entry-2',
        },
      },
    },
    { balance: nextGrowCost },
  );

  const model = buildV6({ heroProgressState: state });
  const loomrill = model.camp.monsters.find(m => m.monsterId === 'loomrill');

  assert.equal(loomrill.canGrow, true);
  assert.equal(loomrill.canAffordGrow, true);
  assert.equal(loomrill.nextStage, 2);
  assert.equal(loomrill.nextGrowCost, nextGrowCost);
});

test('canAffordGrow false when balance < next grow cost', () => {
  const state = makeProgressStateWithPool(
    {
      monsters: {
        loomrill: {
          monsterId: 'loomrill',
          owned: true,
          stage: 1,
          branch: 'b2',
          investedCoins: 450,
          invitedAt: Date.now() - 100000,
          lastGrownAt: Date.now() - 50000,
          lastLedgerEntryId: 'entry-2',
        },
      },
    },
    { balance: 1 }, // far below grow cost
  );

  const model = buildV6({ heroProgressState: state });
  const loomrill = model.camp.monsters.find(m => m.monsterId === 'loomrill');

  assert.equal(loomrill.canGrow, true);
  assert.equal(loomrill.canAffordGrow, false);
});

test('fully grown monster has canGrow: false, nextGrowCost: null', () => {
  const state = makeProgressStateWithPool({
    monsters: {
      mirrane: {
        monsterId: 'mirrane',
        owned: true,
        stage: 4, // maxStage
        branch: 'b1',
        investedCoins: 3650,
        invitedAt: Date.now() - 200000,
        lastGrownAt: Date.now() - 10000,
        lastLedgerEntryId: 'entry-3',
      },
    },
  });

  const model = buildV6({ heroProgressState: state });
  const mirrane = model.camp.monsters.find(m => m.monsterId === 'mirrane');

  assert.equal(mirrane.owned, true);
  assert.equal(mirrane.stage, 4);
  assert.equal(mirrane.fullyGrown, true);
  assert.equal(mirrane.canGrow, false);
  assert.equal(mirrane.canAffordGrow, false);
  assert.equal(mirrane.nextGrowCost, null);
  assert.equal(mirrane.nextStage, null);
});

// ── Camp disabled → v5 shape unchanged ────────────────────────────────

test('camp disabled → v5 shape unchanged (no camp block)', () => {
  const model = buildV5();

  assert.equal(model.version, 5);
  assert.equal('camp' in model, false, 'No camp block in v5');
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy);
});

// ── Camp enabled but economy disabled → camp: { enabled: false } ──────

test('camp enabled but economy disabled → camp: { enabled: false }', () => {
  const model = buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: { ...PROGRESS_ENV, HERO_MODE_CAMP_ENABLED: 'true' },
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: true,
    heroProgressState: null,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 4);
  assert.ok(model.camp, 'camp marker must be present');
  assert.equal(model.camp.enabled, false);
  assert.equal(Object.keys(model.camp).length, 1, 'only enabled: false, nothing else');
});

// ── Malformed heroPool → empty monsters array, no crash ───────────────

test('malformed heroPool → empty camp block with all 6 monsters, no crash', () => {
  const state = normaliseHeroProgressState({
    version: 3,
    daily: null,
    recentClaims: [],
    economy: { version: 1, balance: 200, lifetimeEarned: 200, lifetimeSpent: 0, ledger: [], lastUpdatedAt: null },
    heroPool: 'not-an-object',
  });

  const model = buildV6({ heroProgressState: state });

  assert.equal(model.version, 6);
  assert.ok(model.camp);
  assert.equal(model.camp.enabled, true);
  assert.equal(model.camp.monsters.length, 6);
  // All unowned
  for (const m of model.camp.monsters) {
    assert.equal(m.owned, false);
    assert.equal(m.stage, 0);
    assert.equal(m.branch, null);
  }
});

test('null heroProgressState with camp enabled → empty camp block, no crash', () => {
  const model = buildV6({ heroProgressState: null });

  assert.equal(model.version, 6);
  assert.ok(model.camp);
  assert.equal(model.camp.enabled, true);
  assert.equal(model.camp.monsters.length, 6);
  assert.equal(model.camp.balance, 0);
  assert.equal(model.camp.selectedMonsterId, null);
  assert.deepEqual(model.camp.recentActions, []);
});

// ── Unowned monster shows correct defaults ────────────────────────────

test('unowned monster shows stage 0, branch null, canInvite true', () => {
  const state = makeProgressStateWithPool({ monsters: {} });

  const model = buildV6({ heroProgressState: state });
  const colisk = model.camp.monsters.find(m => m.monsterId === 'colisk');

  assert.equal(colisk.owned, false);
  assert.equal(colisk.stage, 0);
  assert.equal(colisk.branch, null);
  assert.equal(colisk.canInvite, true);
  assert.equal(colisk.canGrow, false);
  assert.equal(colisk.fullyGrown, false);
  assert.equal(colisk.nextGrowCost, null);
  assert.equal(colisk.nextStage, null);
});

// ── No subject mastery data inside camp block ─────────────────────────

test('no subject mastery data inside camp block', () => {
  const model = buildV6();

  const campJson = JSON.stringify(model.camp);
  assert.equal(campJson.includes('subjectId'), false, 'No subjectId in camp block');
  assert.equal(campJson.includes('spelling'), false, 'No spelling reference in camp block');
  assert.equal(campJson.includes('punctuation'), false, 'No punctuation reference in camp block');
  assert.equal(campJson.includes('secure'), false, 'No mastery stats in camp block');
});

// ── No raw debug fields in child-safe output ──────────────────────────

test('no raw debug fields (requestId, ledgerSource) in child-safe camp output', () => {
  const state = makeProgressStateWithPool({
    monsters: {
      glossbloom: {
        monsterId: 'glossbloom',
        owned: true,
        stage: 1,
        branch: 'b1',
        investedCoins: 450,
        invitedAt: Date.now() - 100000,
        lastGrownAt: Date.now() - 50000,
        lastLedgerEntryId: 'entry-debug',
      },
    },
  });

  const model = buildV6({ heroProgressState: state });
  const campJson = JSON.stringify(model.camp);

  assert.equal(campJson.includes('requestId'), false, 'No requestId in camp block');
  assert.equal(campJson.includes('ledgerSource'), false, 'No ledgerSource in camp block');
  assert.equal(campJson.includes('investedCoins'), false, 'No investedCoins in camp block');
  assert.equal(campJson.includes('invitedAt'), false, 'No invitedAt in camp block');
  assert.equal(campJson.includes('lastGrownAt'), false, 'No lastGrownAt in camp block');
  assert.equal(campJson.includes('lastLedgerEntryId'), false, 'No lastLedgerEntryId in camp block');
});

// ── Existing v5 economy fields still present in v6 output ─────────────

test('existing v5 economy fields still present in v6 output', () => {
  const state = makeProgressStateWithPool(
    {},
    { balance: 300, lifetimeEarned: 500, lifetimeSpent: 200 },
  );

  const model = buildV6({ heroProgressState: state });

  assert.equal(model.version, 6);
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy, 'economy block must be present in v6');
  assert.equal(model.economy.enabled, true);
  assert.equal(model.economy.balance, 300);
  assert.equal(model.economy.lifetimeEarned, 500);
  assert.equal(model.economy.lifetimeSpent, 200);
  // Also v4 fields
  assert.ok(model.progress);
  assert.ok(model.claim);
  assert.ok(model.launch);
  assert.ok(model.ui);
  assert.ok(model.dailyQuest);
});

// ── Recent actions capping and shape ──────────────────────────────────

test('recentActions capped at 5 most recent', () => {
  const actions = [];
  for (let i = 0; i < 8; i++) {
    actions.push({
      action: `invite-${i}`,
      type: 'invite',
      monsterId: 'glossbloom',
      stageAfter: 0,
      cost: 150,
      createdAt: Date.now() - (8 - i) * 1000,
    });
  }

  const state = makeProgressStateWithPool({
    recentActions: actions,
  });

  const model = buildV6({ heroProgressState: state });

  assert.equal(model.camp.recentActions.length, 5);
  // Should be the last 5 (most recent)
  assert.equal(model.camp.recentActions[0].createdAt, actions[3].createdAt);
  assert.equal(model.camp.recentActions[4].createdAt, actions[7].createdAt);
});

test('recentActions exposes only child-safe fields', () => {
  const state = makeProgressStateWithPool({
    recentActions: [{
      action: 'invite',
      type: 'invite',
      monsterId: 'hyphang',
      stageAfter: 0,
      cost: 150,
      createdAt: Date.now() - 1000,
      // Extra fields that must NOT leak
      ledgerEntryId: 'secret-entry',
      learnerId: 'learner-secret',
      requestId: 'req-123',
    }],
  });

  const model = buildV6({ heroProgressState: state });
  const action = model.camp.recentActions[0];

  assert.equal(action.type, 'invite');
  assert.equal(action.monsterId, 'hyphang');
  assert.equal(action.stageAfter, 0);
  assert.equal(action.cost, 150);
  assert.ok(action.createdAt > 0);
  // Disallowed
  assert.equal('ledgerEntryId' in action, false);
  assert.equal('learnerId' in action, false);
  assert.equal('requestId' in action, false);
  assert.equal('action' in action, false, 'raw action field must be excluded');
});

// ── Camp command routes in block ──────────────────────────────────────

test('camp block contains commandRoute and commands', () => {
  const model = buildV6();

  assert.equal(model.camp.commandRoute, '/api/hero/command');
  assert.deepEqual(model.camp.commands, {
    unlockMonster: 'unlock-monster',
    evolveMonster: 'evolve-monster',
  });
});

// ── selectedMonsterId surfaces when set ───────────────────────────────

test('selectedMonsterId surfaces when set in pool state', () => {
  const state = makeProgressStateWithPool({
    selectedMonsterId: 'carillon',
    monsters: {
      carillon: {
        monsterId: 'carillon',
        owned: true,
        stage: 1,
        branch: 'b2',
        investedCoins: 450,
        invitedAt: Date.now() - 100000,
        lastGrownAt: Date.now() - 50000,
        lastLedgerEntryId: 'entry-sel',
      },
    },
  });

  const model = buildV6({ heroProgressState: state });

  assert.equal(model.camp.selectedMonsterId, 'carillon');
});
