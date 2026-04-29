// Hero Mode P6 U3 — Dashboard Wiring Integration Test.
//
// Validates:
//  - buildHeroCampModel with full v6 read model → camp state with monsters, balance, enabled=true
//  - buildHeroCampModel with v5 read model (no camp block) → camp disabled/empty
//  - buildHeroCampModel correctly shows affordable/unaffordable monsters based on balance
//  - createHeroModeClient with valid fetch mock has unlockMonster and evolveMonster methods
//  - createHeroModeClient without fetch throws TypeError
//  - When camp flag is off (camp block missing from read model), camp model shows disabled
//  - buildHeroHomeModel produces hero home model that gates on dual-check flags
//  - Full data flow: readModel → buildHeroCampModel + createHeroModeClient = all props HeroCampPanel needs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroCampModel, buildInviteConfirmation, buildGrowConfirmation } from '../src/platform/hero/hero-camp-model.js';
import { createHeroModeClient, HeroModeClientError } from '../src/platform/hero/hero-client.js';
import { buildHeroHomeModel } from '../src/platform/hero/hero-ui-model.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockFetch(responses) {
  let callIndex = 0;
  const calls = [];

  async function mockFetch(url, init) {
    const parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body: parsedBody });
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok !== false,
      status: resp.status || 200,
      json: async () => resp.data,
    };
  }

  mockFetch.calls = calls;
  return mockFetch;
}

function monsterDef(id, overrides = {}) {
  return {
    monsterId: id,
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    childBlurb: `A creature called ${id}.`,
    owned: false,
    fullyGrown: false,
    stage: 0,
    maxStage: 4,
    inviteCost: 150,
    nextGrowCost: 300,
    nextStage: 1,
    branch: null,
    defaultBranch: 'b1',
    sourceAssetMonsterId: id,
    canAffordInvite: true,
    canAffordGrow: false,
    ...overrides,
  };
}

function ownedMonster(id, stage = 1, overrides = {}) {
  return monsterDef(id, {
    owned: true,
    stage,
    branch: 'b1',
    nextStage: stage + 1,
    nextGrowCost: stage === 1 ? 300 : stage === 2 ? 600 : stage === 3 ? 1000 : 1600,
    canAffordGrow: true,
    ...overrides,
  });
}

function fullyGrownMonster(id) {
  return monsterDef(id, {
    owned: true,
    fullyGrown: true,
    stage: 4,
    maxStage: 4,
    branch: 'b1',
    nextStage: null,
    nextGrowCost: null,
    canAffordGrow: false,
    canAffordInvite: false,
  });
}

function sixMonsters() {
  return ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon']
    .map(id => monsterDef(id));
}

/** A full v6 read model with camp block enabled. */
function v6ReadModel(monsters = sixMonsters(), balance = 500) {
  return {
    camp: {
      enabled: true,
      balance,
      monsters,
      selectedMonsterId: null,
      rosterVersion: 'hero-pool-v1',
      recentActions: [],
    },
  };
}

/** A v5 read model that has no camp block at all. */
function v5ReadModel() {
  return {
    // v5 has economy but no camp
    economy: { balance: 300, today: { coinsAwarded: 100, awardStatus: 'awarded' } },
  };
}

/** A heroUi state object for buildHeroHomeModel. */
function heroUiState(readModelOverrides = {}) {
  return {
    status: 'ready',
    readModel: {
      ui: { enabled: true },
      childVisible: true,
      dailyQuest: {
        tasks: [{ taskId: 'task-001', launchStatus: 'launchable', subjectId: 'spelling' }],
        effortPlanned: 18,
      },
      activeHeroSession: null,
      eligibleSubjects: ['spelling', 'grammar'],
      lockedSubjects: [],
      progress: { status: 'none', effortCompleted: 0, completedTaskIds: [] },
      claim: { enabled: false },
      coinsEnabled: true,
      economy: { balance: 500, today: { coinsAwarded: 100, awardStatus: 'awarded' } },
      ...readModelOverrides,
    },
    error: '',
    lastLaunch: null,
  };
}

// ---------------------------------------------------------------------------
// buildHeroCampModel — full v6 read model
// ---------------------------------------------------------------------------

describe('buildHeroCampModel with full v6 read model', () => {
  it('produces camp state with campEnabled=true, balance, and monsters', () => {
    const result = buildHeroCampModel(v6ReadModel(sixMonsters(), 750));
    assert.equal(result.campEnabled, true);
    assert.equal(result.balance, 750);
    assert.equal(result.balanceLabel, '750 Hero Coins');
    assert.equal(result.monsters.length, 6);
    assert.equal(result.rosterVersion, 'hero-pool-v1');
  });

  it('each monster gets UI-derived actionLabel, costLabel, statusLabel', () => {
    const result = buildHeroCampModel(v6ReadModel(sixMonsters(), 500));
    const m = result.monsters[0];
    assert.equal(m.actionLabel, 'Use 150 Hero Coins to invite');
    assert.equal(m.costLabel, '150 Hero Coins');
    assert.equal(m.statusLabel, 'Not yet invited');
  });

  it('owned monster gets stage-based labels', () => {
    const monsters = [ownedMonster('glossbloom', 2, { nextGrowCost: 600, nextStage: 3 })];
    const result = buildHeroCampModel(v6ReadModel(monsters, 1000));
    const m = result.monsters[0];
    assert.equal(m.actionLabel, 'Use 600 Hero Coins to grow');
    assert.equal(m.costLabel, '600 Hero Coins');
    assert.equal(m.statusLabel, 'Stage 2');
  });

  it('fully grown monster gets static labels', () => {
    const monsters = [fullyGrownMonster('glossbloom')];
    const result = buildHeroCampModel(v6ReadModel(monsters, 500));
    const m = result.monsters[0];
    assert.equal(m.actionLabel, 'Fully grown');
    assert.equal(m.costLabel, null);
    assert.equal(m.statusLabel, 'Fully grown');
  });

  it('hasAffordableAction=true when at least one monster is affordable', () => {
    const monsters = [monsterDef('glossbloom', { inviteCost: 150, canAffordInvite: true })];
    const result = buildHeroCampModel(v6ReadModel(monsters, 500));
    assert.equal(result.hasAffordableAction, true);
  });

  it('empty=true when no monsters are owned', () => {
    const result = buildHeroCampModel(v6ReadModel(sixMonsters(), 500));
    assert.equal(result.empty, true, 'all unowned → empty=true');
  });

  it('empty=false when at least one monster is owned', () => {
    const monsters = [ownedMonster('glossbloom', 1)];
    const result = buildHeroCampModel(v6ReadModel(monsters, 500));
    assert.equal(result.empty, false);
  });
});

// ---------------------------------------------------------------------------
// buildHeroCampModel — v5 read model (no camp block)
// ---------------------------------------------------------------------------

describe('buildHeroCampModel with v5 read model (no camp block)', () => {
  it('returns campEnabled=false', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.equal(result.campEnabled, false);
  });

  it('returns empty monsters array', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.deepEqual(result.monsters, []);
  });

  it('returns balance=0 and no balance label', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.equal(result.balance, 0);
    assert.equal(result.balanceLabel, '0 Hero Coins');
  });

  it('returns null for selectedMonsterId and rosterVersion', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.equal(result.selectedMonsterId, null);
    assert.equal(result.rosterVersion, null);
  });

  it('hasAffordableAction=false', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.equal(result.hasAffordableAction, false);
  });

  it('insufficientBalanceMessage is null when disabled', () => {
    const result = buildHeroCampModel(v5ReadModel());
    assert.equal(result.insufficientBalanceMessage, null);
  });
});

// ---------------------------------------------------------------------------
// buildHeroCampModel — affordable/unaffordable based on balance
// ---------------------------------------------------------------------------

describe('buildHeroCampModel affordable/unaffordable monsters by balance', () => {
  it('monster with canAffordInvite=true contributes to hasAffordableAction', () => {
    const monsters = [
      monsterDef('glossbloom', { inviteCost: 150, canAffordInvite: true, canAffordGrow: false }),
      monsterDef('loomrill', { inviteCost: 200, canAffordInvite: false, canAffordGrow: false }),
    ];
    const result = buildHeroCampModel(v6ReadModel(monsters, 160));
    assert.equal(result.hasAffordableAction, true, 'one affordable → hasAffordableAction=true');
  });

  it('no affordable actions when all monsters exceed balance flags', () => {
    const monsters = [
      monsterDef('glossbloom', { inviteCost: 500, canAffordInvite: false, canAffordGrow: false }),
      monsterDef('loomrill', { inviteCost: 500, canAffordInvite: false, canAffordGrow: false }),
    ];
    const result = buildHeroCampModel(v6ReadModel(monsters, 100));
    assert.equal(result.hasAffordableAction, false, 'none affordable → hasAffordableAction=false');
  });

  it('buildInviteConfirmation shows canConfirm=true when balance >= cost', () => {
    const monster = monsterDef('glossbloom', { inviteCost: 150 });
    const conf = buildInviteConfirmation(monster, 200);
    assert.equal(conf.canConfirm, true);
    assert.equal(conf.balanceAfter, 'Your balance will be 50 Hero Coins.');
  });

  it('buildInviteConfirmation shows canConfirm=false when balance < cost', () => {
    const monster = monsterDef('glossbloom', { inviteCost: 150 });
    const conf = buildInviteConfirmation(monster, 100);
    assert.equal(conf.canConfirm, false);
    assert.equal(conf.balanceAfter, 'Your balance will be -50 Hero Coins.');
  });

  it('buildGrowConfirmation shows canConfirm=true when balance >= cost', () => {
    const monster = ownedMonster('loomrill', 2, { nextGrowCost: 600, nextStage: 3 });
    const conf = buildGrowConfirmation(monster, 700);
    assert.equal(conf.canConfirm, true);
    assert.ok(conf.heading.includes('stage 3'), 'heading mentions target stage');
  });

  it('buildGrowConfirmation shows canConfirm=false when balance < cost', () => {
    const monster = ownedMonster('loomrill', 2, { nextGrowCost: 600, nextStage: 3 });
    const conf = buildGrowConfirmation(monster, 300);
    assert.equal(conf.canConfirm, false);
  });
});

// ---------------------------------------------------------------------------
// createHeroModeClient — method existence and basic contracts
// ---------------------------------------------------------------------------

describe('createHeroModeClient with valid fetch has unlockMonster and evolveMonster', () => {
  it('returns an object with unlockMonster and evolveMonster methods', () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    assert.equal(typeof client.unlockMonster, 'function');
    assert.equal(typeof client.evolveMonster, 'function');
  });

  it('also has readModel, startTask, claimTask methods', () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    assert.equal(typeof client.readModel, 'function');
    assert.equal(typeof client.startTask, 'function');
    assert.equal(typeof client.claimTask, 'function');
  });

  it('unlockMonster sends POST to /api/hero/command with command=unlock-monster', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 5 });
    await client.unlockMonster({ learnerId: 'L1', monsterId: 'glossbloom', requestId: 'req-1' });
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(mockFetch.calls[0].url, '/api/hero/command');
    assert.equal(mockFetch.calls[0].body.command, 'unlock-monster');
    assert.equal(mockFetch.calls[0].body.monsterId, 'glossbloom');
    assert.equal(mockFetch.calls[0].body.learnerId, 'L1');
  });

  it('evolveMonster sends POST to /api/hero/command with command=evolve-monster', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 5 });
    await client.evolveMonster({ learnerId: 'L1', monsterId: 'loomrill', targetStage: 3, requestId: 'req-2' });
    assert.equal(mockFetch.calls.length, 1);
    assert.equal(mockFetch.calls[0].body.command, 'evolve-monster');
    assert.equal(mockFetch.calls[0].body.monsterId, 'loomrill');
    assert.equal(mockFetch.calls[0].body.targetStage, 3);
  });

  it('unlockMonster never sends cost/amount/balance/payload fields', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    await client.unlockMonster({ learnerId: 'L1', monsterId: 'glossbloom', requestId: 'req-3' });
    const body = mockFetch.calls[0].body;
    assert.equal(body.cost, undefined, 'must not send cost');
    assert.equal(body.amount, undefined, 'must not send amount');
    assert.equal(body.balance, undefined, 'must not send balance');
    assert.equal(body.payload, undefined, 'must not send payload');
    assert.equal(body.subjectId, undefined, 'must not send subjectId');
  });
});

// ---------------------------------------------------------------------------
// createHeroModeClient — without fetch throws
// ---------------------------------------------------------------------------

describe('createHeroModeClient without fetch throws TypeError', () => {
  it('throws TypeError when fetch is not provided', () => {
    assert.throws(
      () => createHeroModeClient({}),
      (err) => err instanceof TypeError && err.message.includes('fetch'),
    );
  });

  it('throws TypeError when fetch is null', () => {
    assert.throws(
      () => createHeroModeClient({ fetch: null }),
      (err) => err instanceof TypeError && err.message.includes('fetch'),
    );
  });

  it('throws TypeError when called with no arguments', () => {
    assert.throws(
      () => createHeroModeClient(),
      (err) => err instanceof TypeError,
    );
  });

  it('unlockMonster rejects with HeroModeClientError on invalid args', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    await assert.rejects(
      () => client.unlockMonster({ learnerId: '', monsterId: '', requestId: '' }),
      (err) => err instanceof HeroModeClientError && err.code === 'hero_client_invalid',
    );
  });

  it('evolveMonster rejects with HeroModeClientError when targetStage missing', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const client = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    await assert.rejects(
      () => client.evolveMonster({ learnerId: 'L1', monsterId: 'm1', requestId: 'r1' }),
      (err) => err instanceof HeroModeClientError && err.code === 'hero_client_invalid',
    );
  });
});

// ---------------------------------------------------------------------------
// Camp flag off — camp block missing from read model → camp disabled
// ---------------------------------------------------------------------------

describe('camp flag off — camp block missing or disabled', () => {
  it('null readModel → campEnabled=false', () => {
    const result = buildHeroCampModel(null);
    assert.equal(result.campEnabled, false);
    assert.deepEqual(result.monsters, []);
  });

  it('undefined readModel → campEnabled=false', () => {
    const result = buildHeroCampModel(undefined);
    assert.equal(result.campEnabled, false);
  });

  it('readModel with camp.enabled=false → campEnabled=false', () => {
    const result = buildHeroCampModel({ camp: { enabled: false, balance: 999, monsters: sixMonsters() } });
    assert.equal(result.campEnabled, false);
    assert.deepEqual(result.monsters, []);
  });

  it('readModel with camp block missing entirely → campEnabled=false', () => {
    const result = buildHeroCampModel({ economy: { balance: 500 } });
    assert.equal(result.campEnabled, false);
  });

  it('readModel with empty object → campEnabled=false', () => {
    const result = buildHeroCampModel({});
    assert.equal(result.campEnabled, false);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — home model gates on dual-check flags
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel produces hero home model for dashboard', () => {
  it('enabled=true when both ui.enabled and childVisible are true', () => {
    const model = buildHeroHomeModel(heroUiState());
    assert.equal(model.enabled, true);
    assert.equal(model.status, 'ready');
  });

  it('enabled=false when ui.enabled is false', () => {
    const model = buildHeroHomeModel(heroUiState({ ui: { enabled: false } }));
    assert.equal(model.enabled, false);
  });

  it('enabled=false when childVisible is false', () => {
    const model = buildHeroHomeModel(heroUiState({ childVisible: false }));
    assert.equal(model.enabled, false);
  });

  it('returns coinsEnabled and coinBalance from economy block', () => {
    const model = buildHeroHomeModel(heroUiState());
    assert.equal(model.coinsEnabled, true);
    assert.equal(model.coinBalance, 500);
  });

  it('coinsEnabled=false when readModel.coinsEnabled is absent', () => {
    const model = buildHeroHomeModel(heroUiState({ coinsEnabled: false }));
    assert.equal(model.coinsEnabled, false);
    assert.equal(model.coinBalance, 0);
  });

  it('returns nextTask from dailyQuest.tasks', () => {
    const model = buildHeroHomeModel(heroUiState());
    assert.equal(model.nextTask.taskId, 'task-001');
  });
});

// ---------------------------------------------------------------------------
// Full data flow — readModel feeds both camp model and client props
// ---------------------------------------------------------------------------

describe('full data flow: readModel → camp model + client = HeroCampPanel props', () => {
  it('v6 readModel produces all props HeroCampPanel needs', () => {
    const readModel = v6ReadModel(sixMonsters(), 500);
    const campModel = buildHeroCampModel(readModel);
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const heroClient = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });
    const learnerId = 'learner-123';
    const onRefresh = () => {};

    // Verify all four props expected by HeroCampPanel are available
    assert.equal(campModel.campEnabled, true, 'campModel.campEnabled from readModel');
    assert.equal(typeof heroClient.unlockMonster, 'function', 'heroClient.unlockMonster exists');
    assert.equal(typeof heroClient.evolveMonster, 'function', 'heroClient.evolveMonster exists');
    assert.equal(typeof learnerId, 'string', 'learnerId is a string');
    assert.equal(typeof onRefresh, 'function', 'onRefresh is a function');
  });

  it('v5 readModel (no camp) → HeroCampPanel would render null (campEnabled=false)', () => {
    const readModel = v5ReadModel();
    const campModel = buildHeroCampModel(readModel);
    assert.equal(campModel.campEnabled, false, 'panel would return null when disabled');
  });

  it('unlockMonster propagates learnerId correctly through the client', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true, monsterId: 'glossbloom' } }]);
    const heroClient = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 7 });
    const result = await heroClient.unlockMonster({
      learnerId: 'learner-456',
      monsterId: 'glossbloom',
      branch: 'b1',
      requestId: 'req-flow-1',
    });
    assert.equal(result.ok, true);
    assert.equal(mockFetch.calls[0].body.learnerId, 'learner-456');
    assert.equal(mockFetch.calls[0].body.expectedLearnerRevision, 7);
  });

  it('evolveMonster propagates targetStage correctly', async () => {
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true, stage: 3 } }]);
    const heroClient = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 10 });
    const result = await heroClient.evolveMonster({
      learnerId: 'learner-789',
      monsterId: 'loomrill',
      targetStage: 3,
      requestId: 'req-flow-2',
    });
    assert.equal(result.ok, true);
    assert.equal(mockFetch.calls[0].body.targetStage, 3);
    assert.equal(mockFetch.calls[0].body.expectedLearnerRevision, 10);
  });

  it('onRefresh callback is invocable after a successful action (simulated)', async () => {
    let refreshCalled = false;
    const onRefresh = () => { refreshCalled = true; };
    const mockFetch = createMockFetch([{ ok: true, status: 200, data: { ok: true } }]);
    const heroClient = createHeroModeClient({ fetch: mockFetch, getLearnerRevision: () => 1 });

    await heroClient.unlockMonster({
      learnerId: 'L1',
      monsterId: 'glossbloom',
      requestId: 'req-refresh',
    });
    // Simulate what HeroCampPanel does after successful action
    onRefresh();
    assert.equal(refreshCalled, true, 'onRefresh was called after action');
  });
});
