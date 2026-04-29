// Hero Mode P5 U8 — Client Camp methods, UI model, and asset adapter.
//
// Tests cover:
//   - unlockMonster sends correct payload without forbidden fields
//   - evolveMonster sends correct payload with targetStage
//   - Camp model derives 6 monster cards when camp enabled
//   - Camp model shows balance from camp block
//   - Camp disabled → campEnabled false, empty monsters array
//   - Camp model computes actionLabel correctly for each state
//   - Camp model computes balanceAfter for confirmation
//   - Stale-write triggers onStaleWrite callback
//   - Monster assets adapter returns a string path
//   - Monster assets adapter handles unknown sourceAssetMonsterId gracefully

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroModeClient, HeroModeClientError } from '../src/platform/hero/hero-client.js';
import { buildHeroCampModel, buildInviteConfirmation, buildGrowConfirmation } from '../src/platform/hero/hero-camp-model.js';
import { getHeroMonsterAssetSrc, hasHeroMonsterAsset } from '../src/platform/hero/hero-monster-assets.js';

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

function defaultOpts(overrides = {}) {
  return {
    fetch: createMockFetch([{ ok: true, status: 200, data: { ok: true } }]),
    getLearnerRevision: () => 42,
    ...overrides,
  };
}

// Forbidden fields that must NEVER appear in Camp command request bodies
const FORBIDDEN_FIELDS = ['cost', 'amount', 'balance', 'ledgerEntryId', 'stage', 'owned', 'payload', 'subjectId'];

// ---------------------------------------------------------------------------
// unlockMonster — correct payload
// ---------------------------------------------------------------------------

describe('unlockMonster — sends correct payload without forbidden fields', () => {
  it('sends command unlock-monster with monsterId and branch', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true, camp: { action: 'invite' } },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.unlockMonster({
      learnerId: 'learner-1',
      monsterId: 'glossbloom',
      branch: 'b2',
      requestId: 'req-unlock-1',
    });

    assert.equal(fakeFetch.calls.length, 1);
    const { url, init, body } = fakeFetch.calls[0];
    assert.equal(url, '/api/hero/command');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['content-type'], 'application/json');
    assert.equal(body.command, 'unlock-monster');
    assert.equal(body.learnerId, 'learner-1');
    assert.equal(body.monsterId, 'glossbloom');
    assert.equal(body.branch, 'b2');
    assert.equal(body.requestId, 'req-unlock-1');
    assert.equal(body.expectedLearnerRevision, 42);
  });

  it('NEVER includes forbidden fields in unlock payload', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.unlockMonster({
      learnerId: 'learner-1',
      monsterId: 'colisk',
      branch: 'b1',
      requestId: 'req-u-2',
    });

    const body = fakeFetch.calls[0].body;
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });

  it('includes expectedLearnerRevision from getLearnerRevision', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      getLearnerRevision: (id) => {
        assert.equal(id, 'learner-7');
        return 77;
      },
    });

    await client.unlockMonster({
      learnerId: 'learner-7',
      monsterId: 'hyphang',
      branch: 'b1',
      requestId: 'req-u-3',
    });

    const body = fakeFetch.calls[0].body;
    assert.equal(body.expectedLearnerRevision, 77);
  });
});

// ---------------------------------------------------------------------------
// evolveMonster — correct payload with targetStage
// ---------------------------------------------------------------------------

describe('evolveMonster — sends correct payload with targetStage', () => {
  it('sends command evolve-monster with monsterId and targetStage', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true, camp: { action: 'grow' } },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.evolveMonster({
      learnerId: 'learner-2',
      monsterId: 'loomrill',
      targetStage: 3,
      requestId: 'req-evolve-1',
    });

    assert.equal(fakeFetch.calls.length, 1);
    const { body } = fakeFetch.calls[0];
    assert.equal(body.command, 'evolve-monster');
    assert.equal(body.learnerId, 'learner-2');
    assert.equal(body.monsterId, 'loomrill');
    assert.equal(body.targetStage, 3);
    assert.equal(body.requestId, 'req-evolve-1');
    assert.equal(body.expectedLearnerRevision, 42);
  });

  it('NEVER includes forbidden fields in evolve payload', async () => {
    const fakeFetch = createMockFetch([{
      ok: true, status: 200, data: { ok: true },
    }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.evolveMonster({
      learnerId: 'learner-2',
      monsterId: 'mirrane',
      targetStage: 2,
      requestId: 'req-e-2',
    });

    const body = fakeFetch.calls[0].body;
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });

  it('returns response JSON on success', async () => {
    const responseData = { ok: true, camp: { action: 'grow', stageAfter: 3 } };
    const fakeFetch = createMockFetch([{ ok: true, status: 200, data: responseData }]);
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    const result = await client.evolveMonster({
      learnerId: 'learner-2',
      monsterId: 'loomrill',
      targetStage: 3,
      requestId: 'req-e-3',
    });

    assert.deepStrictEqual(result, responseData);
  });
});

// ---------------------------------------------------------------------------
// Stale-write triggers onStaleWrite callback
// ---------------------------------------------------------------------------

describe('Camp commands — stale_write triggers onStaleWrite', () => {
  it('unlockMonster stale_write triggers onStaleWrite', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 409, data: { ok: false, code: 'stale_write' },
    }]);
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.unlockMonster({
      learnerId: 'learner-stale',
      monsterId: 'glossbloom',
      branch: 'b1',
      requestId: 'req-stale-1',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-stale');
    assert.ok(staleWrites[0].error instanceof HeroModeClientError);
    assert.equal(staleWrites[0].error.code, 'stale_write');
  });

  it('evolveMonster stale_write triggers onStaleWrite', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 409, data: { ok: false, code: 'stale_write' },
    }]);
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.evolveMonster({
      learnerId: 'learner-stale-2',
      monsterId: 'hyphang',
      targetStage: 2,
      requestId: 'req-stale-2',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-stale-2');
    assert.equal(staleWrites[0].error.code, 'stale_write');
  });

  it('non-stale errors do not trigger onStaleWrite', async () => {
    const fakeFetch = createMockFetch([{
      ok: false, status: 400, data: { ok: false, code: 'hero_pool_insufficient_balance' },
    }]);
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.unlockMonster({
      learnerId: 'learner-x',
      monsterId: 'colisk',
      branch: 'b1',
      requestId: 'req-nsw',
    }).catch(() => {});

    assert.equal(staleWrites.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Camp model — derives 6 monster cards when camp enabled
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — camp enabled with monsters', () => {
  const sixMonsters = [
    { monsterId: 'glossbloom', displayName: 'Glossbloom', childBlurb: 'Blooms with word classes.', sourceAssetMonsterId: 'glossbloom', owned: true, stage: 2, branch: 'b1', maxStage: 4, inviteCost: 150, nextGrowCost: 300, nextStage: 3, canInvite: false, canGrow: true, canAffordInvite: false, canAffordGrow: true, fullyGrown: false },
    { monsterId: 'loomrill', displayName: 'Loomrill', childBlurb: 'Threads adverbials.', sourceAssetMonsterId: 'loomrill', owned: true, stage: 4, branch: 'b2', maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: false, canGrow: false, canAffordInvite: false, canAffordGrow: false, fullyGrown: true },
    { monsterId: 'mirrane', displayName: 'Mirrane', childBlurb: 'Reflects roles.', sourceAssetMonsterId: 'mirrane', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: true, canAffordGrow: false, fullyGrown: false },
    { monsterId: 'colisk', displayName: 'Colisk', childBlurb: 'Structure creature.', sourceAssetMonsterId: 'colisk', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: true, canAffordGrow: false, fullyGrown: false },
    { monsterId: 'hyphang', displayName: 'Hyphang', childBlurb: 'Dash creature.', sourceAssetMonsterId: 'hyphang', owned: true, stage: 1, branch: 'b1', maxStage: 4, inviteCost: 150, nextGrowCost: 200, nextStage: 2, canInvite: false, canGrow: true, canAffordInvite: false, canAffordGrow: true, fullyGrown: false },
    { monsterId: 'carillon', displayName: 'Carillon', childBlurb: 'Chord creature.', sourceAssetMonsterId: 'carillon', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: false, canAffordGrow: false, fullyGrown: false },
  ];

  const campReadModel = {
    camp: {
      enabled: true,
      version: 1,
      rosterVersion: 'pool-v1-6mon',
      balance: 800,
      selectedMonsterId: 'glossbloom',
      monsters: sixMonsters,
      recentActions: [
        { type: 'invite', monsterId: 'hyphang', stageAfter: 0, cost: 150, createdAt: Date.now() - 2000 },
        { type: 'grow', monsterId: 'glossbloom', stageAfter: 2, cost: 300, createdAt: Date.now() - 1000 },
      ],
    },
  };

  it('derives 6 monster cards when camp enabled', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.campEnabled, true);
    assert.equal(model.monsters.length, 6);
    assert.deepEqual(
      model.monsters.map(m => m.monsterId),
      ['glossbloom', 'loomrill', 'mirrane', 'colisk', 'hyphang', 'carillon'],
    );
  });

  it('shows balance from camp block', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.balance, 800);
    assert.equal(model.balanceLabel, '800 Hero Coins');
  });

  it('exposes rosterVersion and selectedMonsterId', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.rosterVersion, 'pool-v1-6mon');
    assert.equal(model.selectedMonsterId, 'glossbloom');
  });

  it('hasAffordableAction true when at least one monster can be acted upon', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.hasAffordableAction, true);
  });

  it('empty false when at least one monster is owned', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.empty, false);
  });

  it('lastAction is the most recent action', () => {
    const model = buildHeroCampModel(campReadModel);

    assert.equal(model.lastAction.type, 'grow');
    assert.equal(model.lastAction.monsterId, 'glossbloom');
  });
});

// ---------------------------------------------------------------------------
// Camp model — camp disabled
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — camp disabled', () => {
  it('null readModel → campEnabled false, empty monsters', () => {
    const model = buildHeroCampModel(null);

    assert.equal(model.campEnabled, false);
    assert.deepEqual(model.monsters, []);
    assert.equal(model.balance, 0);
    assert.equal(model.selectedMonsterId, null);
    assert.equal(model.hasAffordableAction, false);
  });

  it('camp.enabled === false → campEnabled false, empty monsters', () => {
    const model = buildHeroCampModel({ camp: { enabled: false } });

    assert.equal(model.campEnabled, false);
    assert.deepEqual(model.monsters, []);
    assert.equal(model.balance, 0);
  });

  it('no camp block at all → campEnabled false', () => {
    const model = buildHeroCampModel({ economy: { balance: 500 } });

    assert.equal(model.campEnabled, false);
    assert.deepEqual(model.monsters, []);
  });

  it('empty true when camp disabled', () => {
    const model = buildHeroCampModel(null);

    assert.equal(model.empty, true);
  });

  it('empty true when all monsters are unowned', () => {
    const readModel = {
      camp: {
        enabled: true,
        balance: 200,
        rosterVersion: 'v1',
        selectedMonsterId: null,
        monsters: [
          { monsterId: 'colisk', displayName: 'Colisk', childBlurb: 'x', sourceAssetMonsterId: 'colisk', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: true, canAffordGrow: false, fullyGrown: false },
          { monsterId: 'hyphang', displayName: 'Hyphang', childBlurb: 'x', sourceAssetMonsterId: 'hyphang', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: true, canAffordGrow: false, fullyGrown: false },
        ],
        recentActions: [],
      },
    };

    const model = buildHeroCampModel(readModel);

    assert.equal(model.empty, true);
    assert.equal(model.campEnabled, true);
  });
});

// ---------------------------------------------------------------------------
// Camp model — actionLabel derivation
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — actionLabel derivation', () => {
  it('unowned monster → actionLabel contains "invite"', () => {
    const readModel = {
      camp: {
        enabled: true,
        balance: 500,
        rosterVersion: 'v1',
        selectedMonsterId: null,
        monsters: [
          { monsterId: 'mirrane', displayName: 'Mirrane', childBlurb: 'x', sourceAssetMonsterId: 'mirrane', owned: false, stage: 0, branch: null, maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: true, canGrow: false, canAffordInvite: true, canAffordGrow: false, fullyGrown: false },
        ],
        recentActions: [],
      },
    };

    const model = buildHeroCampModel(readModel);
    const mirrane = model.monsters[0];

    assert.ok(mirrane.actionLabel.toLowerCase().includes('invite'), `Expected "invite" in actionLabel, got: ${mirrane.actionLabel}`);
  });

  it('owned, not fully grown → actionLabel contains "grow"', () => {
    const readModel = {
      camp: {
        enabled: true,
        balance: 500,
        rosterVersion: 'v1',
        selectedMonsterId: null,
        monsters: [
          { monsterId: 'glossbloom', displayName: 'Glossbloom', childBlurb: 'x', sourceAssetMonsterId: 'glossbloom', owned: true, stage: 2, branch: 'b1', maxStage: 4, inviteCost: 150, nextGrowCost: 300, nextStage: 3, canInvite: false, canGrow: true, canAffordInvite: false, canAffordGrow: true, fullyGrown: false },
        ],
        recentActions: [],
      },
    };

    const model = buildHeroCampModel(readModel);
    const glossbloom = model.monsters[0];

    assert.ok(glossbloom.actionLabel.toLowerCase().includes('grow'), `Expected "grow" in actionLabel, got: ${glossbloom.actionLabel}`);
  });

  it('fully grown → actionLabel is "Fully grown"', () => {
    const readModel = {
      camp: {
        enabled: true,
        balance: 500,
        rosterVersion: 'v1',
        selectedMonsterId: null,
        monsters: [
          { monsterId: 'loomrill', displayName: 'Loomrill', childBlurb: 'x', sourceAssetMonsterId: 'loomrill', owned: true, stage: 4, branch: 'b2', maxStage: 4, inviteCost: 150, nextGrowCost: null, nextStage: null, canInvite: false, canGrow: false, canAffordInvite: false, canAffordGrow: false, fullyGrown: true },
        ],
        recentActions: [],
      },
    };

    const model = buildHeroCampModel(readModel);
    const loomrill = model.monsters[0];

    assert.equal(loomrill.actionLabel, 'Fully grown');
  });
});

// ---------------------------------------------------------------------------
// Camp model — balanceAfter for confirmation
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — balanceAfter for confirmation', () => {
  it('buildInviteConfirmation computes balanceAfter correctly', () => {
    const monster = {
      monsterId: 'colisk',
      displayName: 'Colisk',
      inviteCost: 150,
      owned: false,
      fullyGrown: false,
    };

    const confirmation = buildInviteConfirmation(monster, 800);

    assert.ok(confirmation.heading.includes('150'));
    assert.ok(confirmation.heading.includes('Colisk'));
    assert.ok(confirmation.balanceAfter.includes('650'));
    assert.equal(confirmation.canConfirm, true);
  });

  it('buildInviteConfirmation canConfirm false when balance insufficient', () => {
    const monster = {
      monsterId: 'colisk',
      displayName: 'Colisk',
      inviteCost: 150,
      owned: false,
      fullyGrown: false,
    };

    const confirmation = buildInviteConfirmation(monster, 100);

    assert.equal(confirmation.canConfirm, false);
    assert.ok(confirmation.balanceAfter.includes('-50'));
  });

  it('buildGrowConfirmation computes balanceAfter correctly', () => {
    const monster = {
      monsterId: 'glossbloom',
      displayName: 'Glossbloom',
      nextGrowCost: 300,
      nextStage: 3,
      owned: true,
      fullyGrown: false,
    };

    const confirmation = buildGrowConfirmation(monster, 500);

    assert.ok(confirmation.heading.includes('300'));
    assert.ok(confirmation.heading.includes('Glossbloom'));
    assert.ok(confirmation.heading.includes('stage 3'));
    assert.ok(confirmation.balanceAfter.includes('200'));
    assert.equal(confirmation.canConfirm, true);
  });

  it('buildGrowConfirmation canConfirm false when insufficient', () => {
    const monster = {
      monsterId: 'hyphang',
      displayName: 'Hyphang',
      nextGrowCost: 200,
      nextStage: 2,
      owned: true,
      fullyGrown: false,
    };

    const confirmation = buildGrowConfirmation(monster, 50);

    assert.equal(confirmation.canConfirm, false);
  });
});

// ---------------------------------------------------------------------------
// Monster assets adapter — returns string path
// ---------------------------------------------------------------------------

describe('getHeroMonsterAssetSrc — returns string path', () => {
  it('returns an object with src as a string for a known monster', () => {
    const result = getHeroMonsterAssetSrc('glossbloom', 2, 'b1');

    assert.equal(typeof result.src, 'string');
    assert.ok(result.src.length > 0);
    assert.ok(result.src.includes('glossbloom'));
    assert.ok(result.src.includes('b1'));
    assert.ok(result.src.includes('2'));
  });

  it('returns srcSet as a string with width descriptors', () => {
    const result = getHeroMonsterAssetSrc('loomrill', 3, 'b2');

    assert.equal(typeof result.srcSet, 'string');
    assert.ok(result.srcSet.includes('320w'));
    assert.ok(result.srcSet.includes('640w'));
    assert.ok(result.srcSet.includes('1280w'));
  });

  it('includes fallback path for stage 0', () => {
    const result = getHeroMonsterAssetSrc('mirrane', 3, 'b1');

    assert.equal(typeof result.fallback, 'string');
    assert.ok(result.fallback.includes('mirrane'));
    assert.ok(result.fallback.includes('0'));
  });

  it('default branch is b1 when not specified', () => {
    const result = getHeroMonsterAssetSrc('hyphang', 1);

    assert.ok(result.src.includes('b1'));
    assert.ok(result.key.includes('b1'));
  });
});

// ---------------------------------------------------------------------------
// Monster assets adapter — unknown sourceAssetMonsterId
// ---------------------------------------------------------------------------

describe('getHeroMonsterAssetSrc — handles unknown sourceAssetMonsterId gracefully', () => {
  it('returns valid path structure even for unknown monster id', () => {
    const result = getHeroMonsterAssetSrc('unknown-creature', 0, 'b1');

    assert.equal(typeof result.src, 'string');
    assert.ok(result.src.length > 0);
    // Still produces a valid-looking path structure
    assert.ok(result.src.includes('unknown-creature'));
    assert.ok(result.key.includes('unknown-creature'));
  });

  it('hasHeroMonsterAsset returns false for empty/null id', () => {
    assert.equal(hasHeroMonsterAsset('', 0, 'b1'), false);
    assert.equal(hasHeroMonsterAsset(null, 0, 'b1'), false);
    assert.equal(hasHeroMonsterAsset(undefined, 0, 'b1'), false);
  });

  it('hasHeroMonsterAsset returns true for any non-empty id', () => {
    assert.equal(hasHeroMonsterAsset('glossbloom', 2, 'b1'), true);
    assert.equal(hasHeroMonsterAsset('unknown-thing', 0, 'b1'), true);
  });
});
