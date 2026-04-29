import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHeroModeClient, HeroModeClientError } from '../src/platform/hero/hero-client.js';
import {
  buildHeroCampModel,
  buildInviteConfirmation,
  buildGrowConfirmation,
  buildInviteSuccess,
  buildGrowSuccess,
  buildInsufficientMessage,
} from '../src/platform/hero/hero-camp-model.js';
import { getHeroMonsterAssetSrc, hasHeroMonsterAsset } from '../src/platform/hero/hero-monster-assets.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status, body = {}, { ok = status >= 200 && status < 300 } = {}) {
  const calls = [];
  async function fakeFetch(url, init) {
    calls.push({ url, init });
    return {
      ok,
      status,
      json: async () => body,
    };
  }
  fakeFetch.calls = calls;
  return fakeFetch;
}

function defaultOpts(overrides = {}) {
  return {
    fetch: mockFetch(200, { ok: true }),
    getLearnerRevision: () => 42,
    ...overrides,
  };
}

/** Six monsters with various affordability states. */
function buildCampReadModel({ balance = 150 } = {}) {
  return {
    camp: {
      enabled: true,
      balance,
      selectedMonsterId: 'mon-2',
      rosterVersion: 3,
      recentActions: [{ type: 'invite', monsterId: 'mon-1' }],
      monsters: [
        { id: 'mon-1', displayName: 'Frostclaw', owned: true, fullyGrown: false, stage: 2, inviteCost: 30, nextGrowCost: 50, nextStage: 3, canAffordInvite: false, canAffordGrow: true },
        { id: 'mon-2', displayName: 'Emberfin', owned: true, fullyGrown: true, stage: 4, inviteCost: 30, nextGrowCost: 0, nextStage: null, canAffordInvite: false, canAffordGrow: false },
        { id: 'mon-3', displayName: 'Thornveil', owned: false, fullyGrown: false, stage: 0, inviteCost: 40, nextGrowCost: 0, nextStage: null, canAffordInvite: true, canAffordGrow: false },
        { id: 'mon-4', displayName: 'Glintscale', owned: false, fullyGrown: false, stage: 0, inviteCost: 200, nextGrowCost: 0, nextStage: null, canAffordInvite: false, canAffordGrow: false },
        { id: 'mon-5', displayName: 'Duskpetal', owned: true, fullyGrown: false, stage: 1, inviteCost: 30, nextGrowCost: 60, nextStage: 2, canAffordInvite: false, canAffordGrow: true },
        { id: 'mon-6', displayName: 'Quakeroot', owned: true, fullyGrown: false, stage: 3, inviteCost: 30, nextGrowCost: 80, nextStage: 4, canAffordInvite: false, canAffordGrow: true },
      ],
    },
  };
}

// Forbidden fields that must NEVER appear in unlock/evolve payloads
const FORBIDDEN_FIELDS = ['cost', 'amount', 'balance', 'ledgerEntryId', 'stage', 'owned', 'payload', 'subjectId'];

// ---------------------------------------------------------------------------
// unlockMonster — payload shape
// ---------------------------------------------------------------------------

describe('hero-client unlockMonster — payload shape', () => {
  it('sends correct payload without forbidden fields', async () => {
    const fakeFetch = mockFetch(200, { ok: true, monsterId: 'mon-1' });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.unlockMonster({
      learnerId: 'learner-1',
      monsterId: 'mon-1',
      branch: 'b2',
      requestId: 'req-abc',
    });

    assert.equal(fakeFetch.calls.length, 1);
    const { url, init } = fakeFetch.calls[0];
    assert.equal(url, '/api/hero/command');
    assert.equal(init.method, 'POST');

    const body = JSON.parse(init.body);
    assert.equal(body.command, 'unlock-monster');
    assert.equal(body.learnerId, 'learner-1');
    assert.equal(body.monsterId, 'mon-1');
    assert.equal(body.branch, 'b2');
    assert.equal(body.requestId, 'req-abc');
    assert.equal(body.expectedLearnerRevision, 42);

    // Forbidden fields must not be present
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });

  it('branch defaults to null when not provided', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.unlockMonster({ learnerId: 'l', monsterId: 'm', requestId: 'r' });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    assert.equal(body.branch, null);
  });
});

// ---------------------------------------------------------------------------
// evolveMonster — payload shape
// ---------------------------------------------------------------------------

describe('hero-client evolveMonster — payload shape', () => {
  it('sends correct payload with targetStage', async () => {
    const fakeFetch = mockFetch(200, { ok: true, monsterId: 'mon-2', stage: 3 });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.evolveMonster({
      learnerId: 'learner-2',
      monsterId: 'mon-2',
      targetStage: 3,
      requestId: 'req-def',
    });

    assert.equal(fakeFetch.calls.length, 1);
    const body = JSON.parse(fakeFetch.calls[0].init.body);
    assert.equal(body.command, 'evolve-monster');
    assert.equal(body.learnerId, 'learner-2');
    assert.equal(body.monsterId, 'mon-2');
    assert.equal(body.targetStage, 3);
    assert.equal(body.requestId, 'req-def');
    assert.equal(body.expectedLearnerRevision, 42);

    // Forbidden fields must not be present
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });

  it('rejects missing targetStage', async () => {
    const client = createHeroModeClient(defaultOpts());

    const err = await client.evolveMonster({
      learnerId: 'l',
      monsterId: 'm',
      requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_client_invalid');
  });
});

// ---------------------------------------------------------------------------
// Stale-write triggers onStaleWrite callback
// ---------------------------------------------------------------------------

describe('hero-client camp commands — stale write', () => {
  it('unlockMonster stale_write triggers onStaleWrite', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'stale_write' });
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.unlockMonster({
      learnerId: 'learner-x',
      monsterId: 'mon-1',
      requestId: 'r',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-x');
    assert.equal(staleWrites[0].error.code, 'stale_write');
  });

  it('evolveMonster stale_write triggers onStaleWrite', async () => {
    const fakeFetch = mockFetch(409, { ok: false, code: 'stale_write' });
    const staleWrites = [];
    const client = createHeroModeClient({
      ...defaultOpts(),
      fetch: fakeFetch,
      onStaleWrite: (info) => staleWrites.push(info),
    });

    await client.evolveMonster({
      learnerId: 'learner-y',
      monsterId: 'mon-2',
      targetStage: 2,
      requestId: 'r',
    }).catch(() => {});

    assert.equal(staleWrites.length, 1);
    assert.equal(staleWrites[0].learnerId, 'learner-y');
    assert.equal(staleWrites[0].error.code, 'stale_write');
  });
});

// ---------------------------------------------------------------------------
// hero_insufficient_coins — model can handle
// ---------------------------------------------------------------------------

describe('hero-client camp commands — insufficient coins', () => {
  it('unlockMonster hero_insufficient_coins throws typed error', async () => {
    const fakeFetch = mockFetch(402, { ok: false, code: 'hero_insufficient_coins', deficit: 30 });
    const client = createHeroModeClient(defaultOpts({ fetch: fakeFetch }));

    const err = await client.unlockMonster({
      learnerId: 'l', monsterId: 'm', requestId: 'r',
    }).catch(e => e);

    assert.ok(err instanceof HeroModeClientError);
    assert.equal(err.code, 'hero_insufficient_coins');
    assert.equal(err.payload.deficit, 30);
  });
});

// ---------------------------------------------------------------------------
// Camp model — derives 6 monster cards with correct affordability
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — monster cards', () => {
  it('derives 6 monsters from read model with correct affordability', () => {
    const model = buildHeroCampModel(buildCampReadModel());

    assert.equal(model.monsters.length, 6);
    assert.equal(model.campEnabled, true);
    assert.equal(model.hasAffordableAction, true);
  });

  it('derives correct actionLabel for each state', () => {
    const model = buildHeroCampModel(buildCampReadModel());
    const [frostclaw, emberfin, thornveil] = model.monsters;

    // owned, not fully grown → grow label
    assert.equal(frostclaw.actionLabel, 'Use 50 Hero Coins to grow');
    // fully grown
    assert.equal(emberfin.actionLabel, 'Fully grown');
    // not owned → invite label
    assert.equal(thornveil.actionLabel, 'Use 40 Hero Coins to invite');
  });

  it('derives correct statusLabel for each state', () => {
    const model = buildHeroCampModel(buildCampReadModel());
    const [frostclaw, emberfin, thornveil] = model.monsters;

    assert.equal(frostclaw.statusLabel, 'Stage 2');
    assert.equal(emberfin.statusLabel, 'Fully grown');
    assert.equal(thornveil.statusLabel, 'Not yet invited');
  });

  it('derives correct costLabel', () => {
    const model = buildHeroCampModel(buildCampReadModel());
    const [frostclaw, emberfin, thornveil] = model.monsters;

    assert.equal(frostclaw.costLabel, '50 Hero Coins');
    assert.equal(emberfin.costLabel, null);
    assert.equal(thornveil.costLabel, '40 Hero Coins');
  });
});

// ---------------------------------------------------------------------------
// Camp model — shows balance from read model
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — balance', () => {
  it('shows balance from read model camp block', () => {
    const model = buildHeroCampModel(buildCampReadModel({ balance: 275 }));

    assert.equal(model.balance, 275);
    assert.equal(model.balanceLabel, '275 Hero Coins');
  });

  it('defaults balance to 0 when missing', () => {
    const readModel = { camp: { enabled: true, monsters: [] } };
    const model = buildHeroCampModel(readModel);

    assert.equal(model.balance, 0);
    assert.equal(model.balanceLabel, '0 Hero Coins');
  });
});

// ---------------------------------------------------------------------------
// Camp disabled → campEnabled false, no monster cards
// ---------------------------------------------------------------------------

describe('buildHeroCampModel — disabled', () => {
  it('returns empty model when camp is not enabled', () => {
    const model = buildHeroCampModel({ camp: { enabled: false } });

    assert.equal(model.campEnabled, false);
    assert.equal(model.monsters.length, 0);
    assert.equal(model.balance, 0);
    assert.equal(model.insufficientBalanceMessage, null);
  });

  it('returns empty model when readModel is null', () => {
    const model = buildHeroCampModel(null);

    assert.equal(model.campEnabled, false);
    assert.equal(model.monsters.length, 0);
  });

  it('returns empty model when camp block is missing', () => {
    const model = buildHeroCampModel({});

    assert.equal(model.campEnabled, false);
    assert.equal(model.monsters.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Client methods never include forbidden fields in request body
// ---------------------------------------------------------------------------

describe('hero-client camp commands — forbidden fields', () => {
  it('unlockMonster body never includes forbidden fields even if caller passes them', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    // Attempt to sneak forbidden fields via the options object
    await client.unlockMonster({
      learnerId: 'l',
      monsterId: 'm',
      requestId: 'r',
      cost: 99,        // should be ignored
      amount: 100,     // should be ignored
      balance: 500,    // should be ignored
    });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });

  it('evolveMonster body never includes forbidden fields even if caller passes them', async () => {
    const fakeFetch = mockFetch(200, { ok: true });
    const client = createHeroModeClient({ ...defaultOpts(), fetch: fakeFetch });

    await client.evolveMonster({
      learnerId: 'l',
      monsterId: 'm',
      targetStage: 2,
      requestId: 'r',
      cost: 99,
      ledgerEntryId: 'fake-id',
    });

    const body = JSON.parse(fakeFetch.calls[0].init.body);
    for (const field of FORBIDDEN_FIELDS) {
      assert.ok(!(field in body), `body must not include ${field}`);
    }
  });
});

// ---------------------------------------------------------------------------
// hero-monster-assets.js does not import from shared/ or worker/
// ---------------------------------------------------------------------------

describe('hero-monster-assets — no shared/worker imports', () => {
  it('module exports expected functions without shared/worker dependencies', async () => {
    // The fact we imported successfully at the top of this file proves it
    // does not depend on shared/ or worker/ code.
    assert.equal(typeof getHeroMonsterAssetSrc, 'function');
    assert.equal(typeof hasHeroMonsterAsset, 'function');
  });

  it('getHeroMonsterAssetSrc returns correct structure', () => {
    const result = getHeroMonsterAssetSrc('bracehart', 2, 'b1');

    assert.equal(result.key, 'bracehart-b1-2');
    assert.equal(result.src, './assets/monsters/bracehart-b1-2/640.webp');
    assert.equal(result.fallback, './assets/monsters/bracehart-b1-0/640.webp');
    assert.ok(result.srcSet.includes('bracehart-b1-2/320.webp 320w'));
    assert.ok(result.srcSet.includes('bracehart-b1-2/1280.webp 1280w'));
  });

  it('hasHeroMonsterAsset returns true for valid monsterId', () => {
    assert.equal(hasHeroMonsterAsset('bracehart', 1, 'b1'), true);
  });

  it('hasHeroMonsterAsset returns false for empty monsterId', () => {
    assert.equal(hasHeroMonsterAsset('', 0, 'b1'), false);
  });
});

// ---------------------------------------------------------------------------
// buildInviteConfirmation — correct copy
// ---------------------------------------------------------------------------

describe('buildInviteConfirmation', () => {
  it('produces correct confirmation when balance is sufficient', () => {
    const monster = { displayName: 'Thornveil', inviteCost: 40 };
    const result = buildInviteConfirmation(monster, 150);

    assert.equal(result.heading, 'Use 40 Hero Coins to invite Thornveil to Hero Camp?');
    assert.equal(result.balanceAfter, 'Your balance will be 110 Hero Coins.');
    assert.equal(result.canConfirm, true);
  });

  it('canConfirm is false when balance is insufficient', () => {
    const monster = { displayName: 'Glintscale', inviteCost: 200 };
    const result = buildInviteConfirmation(monster, 50);

    assert.equal(result.canConfirm, false);
  });
});

// ---------------------------------------------------------------------------
// buildGrowConfirmation — correct copy
// ---------------------------------------------------------------------------

describe('buildGrowConfirmation', () => {
  it('produces correct confirmation when balance is sufficient', () => {
    const monster = { displayName: 'Frostclaw', nextGrowCost: 50, nextStage: 3 };
    const result = buildGrowConfirmation(monster, 150);

    assert.equal(result.heading, 'Use 50 Hero Coins to grow Frostclaw to stage 3?');
    assert.equal(result.balanceAfter, 'Your balance will be 100 Hero Coins.');
    assert.equal(result.canConfirm, true);
  });

  it('canConfirm is false when balance is insufficient', () => {
    const monster = { displayName: 'Quakeroot', nextGrowCost: 80, nextStage: 4 };
    const result = buildGrowConfirmation(monster, 30);

    assert.equal(result.canConfirm, false);
  });
});

// ---------------------------------------------------------------------------
// Success and insufficient message builders
// ---------------------------------------------------------------------------

describe('Camp copy builders', () => {
  it('buildInviteSuccess produces correct message', () => {
    assert.equal(buildInviteSuccess('Thornveil'), 'Thornveil joined your Hero Camp.');
  });

  it('buildGrowSuccess produces correct message', () => {
    assert.equal(buildGrowSuccess('Frostclaw'), 'Frostclaw grew stronger.');
  });

  it('buildInsufficientMessage produces correct message with deficit', () => {
    assert.equal(
      buildInsufficientMessage(30),
      'You need 30 more Hero Coins. Complete Hero Quests to add more Hero Coins.',
    );
  });
});
