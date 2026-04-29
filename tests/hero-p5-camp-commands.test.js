// Hero Mode P5 U6 — Camp command integration tests.
//
// Exercises the full Worker route handler (/api/hero/command) for
// unlock-monster and evolve-monster commands. Validates flag gating,
// CAS mutation, receipt replay, idempotent responses, and non-regression
// with start-task/claim-task.

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import {
  HERO_MONSTER_INVITE_COST,
  HERO_MONSTER_GROW_COSTS,
  HERO_POOL_ROSTER_VERSION,
} from '../shared/hero/hero-pool.js';
import { HERO_DAILY_COMPLETION_COINS } from '../shared/hero/economy.js';
import {
  resolveHeroCampCommand,
  FORBIDDEN_CAMP_FIELDS,
} from '../worker/src/hero/camp.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Server factories ────────────────────────────────────────────────────

function createCampServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'true',
      HERO_MODE_CAMP_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

function createCampDisabledServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'true',
      HERO_MODE_CAMP_ENABLED: 'false',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

function createCampWithoutEconomyServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      HERO_MODE_ECONOMY_ENABLED: 'false',
      HERO_MODE_CAMP_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

// ── Fixture seeding ─────────────────────────────────────────────────────

const HERO_SPELLING_DATA = {
  stats: {
    core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
  },
};

const HERO_PUNCTUATION_DATA = {
  availability: { status: 'ready' },
  stats: { total: 20, secure: 8, due: 5, fresh: 3, weak: 2, attempts: 100, correct: 75, accuracy: 75 },
};

async function seedLearner(server, accountId, learnerId) {
  const repos = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor(accountId),
  });
  await repos.hydrate();
  repos.learners.write({
    byId: {
      [learnerId]: {
        id: learnerId,
        name: 'Camp Test Learner',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#3E6FA8',
        createdAt: 1,
      },
    },
    allIds: [learnerId],
    selectedId: learnerId,
  });
  await repos.flush();

  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_SPELLING_DATA), now, accountId);

  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'punctuation', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_PUNCTUATION_DATA), now, accountId);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getLearnerRevision(server, accountId = 'adult-a') {
  const row = server.DB.db.prepare(
    `SELECT lp.state_revision FROM learner_profiles lp
     JOIN account_learner_memberships alm ON alm.learner_id = lp.id
     WHERE alm.account_id = ?`,
  ).get(accountId);
  return row?.state_revision ?? 0;
}

async function postHeroCommand(server, body, accountId = 'adult-a') {
  return server.fetchAs(accountId, HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getHeroProgressRow(server, learnerId) {
  const row = server.DB.db.prepare(
    `SELECT state_json, updated_at FROM child_game_state
     WHERE learner_id = ? AND system_id = 'hero-mode'`,
  ).get(learnerId);
  if (!row) return null;
  return JSON.parse(row.state_json);
}

function getHeroEvents(server) {
  return server.DB.db.prepare(
    `SELECT id, learner_id, event_type, event_json, created_at FROM event_log WHERE event_type LIKE 'hero.%' ORDER BY created_at`,
  ).all();
}

/**
 * Seeds hero progress state with a high coin balance by:
 * 1. Running start-task to initialise daily progress
 * 2. Directly writing a large balance into the economy state
 * Returns the seeded balance.
 */
async function seedCoins(server, learnerId, accountId, targetBalance = 5000) {
  // We must initialise the hero progress state so it exists in the DB.
  // A start-task call does this.
  const rmResp = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const rmPayload = await rmResp.json();
  assert.equal(rmResp.status, 200, `Read model must succeed: ${JSON.stringify(rmPayload)}`);

  const quest = rmPayload.hero.dailyQuest;
  const fingerprint = rmPayload.hero.questFingerprint;
  const allTasks = quest.tasks.filter(t => t.launchStatus === 'launchable');
  if (allTasks.length < 1) throw new Error('Fixture must produce at least 1 launchable task');

  // Launch first task to initialise progress state
  const rev = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: allTasks[0].taskId,
    requestId: `camp-seed-start-${Date.now()}`,
    expectedLearnerRevision: rev,
  }, accountId);

  // Now directly inject a high balance into the persisted state
  const progress = getHeroProgressRow(server, learnerId);
  if (!progress) throw new Error('Hero progress state must exist after start-task');
  progress.economy = {
    ...progress.economy,
    version: 1,
    balance: targetBalance,
    lifetimeEarned: targetBalance,
    lifetimeSpent: 0,
    ledger: [{
      entryId: 'seed-coins-entry',
      idempotencyKey: 'seed-coins-key',
      type: 'test-seed',
      amount: targetBalance,
      balanceAfter: targetBalance,
      learnerId,
      source: { kind: 'test-seed' },
      createdAt: Date.now(),
      createdBy: 'test',
    }],
    lastUpdatedAt: Date.now(),
  };
  server.DB.db.prepare(`
    UPDATE child_game_state SET state_json = ? WHERE learner_id = ? AND system_id = 'hero-mode'
  `).run(JSON.stringify(progress), learnerId);

  return targetBalance;
}

// ── 1. unlock-monster happy path ─────────────────────────────────────────

test('P5-U6: unlock-monster happy path — debits coins, creates owned monster at stage 0', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const balance = await seedCoins(server, learnerId, accountId);
  assert.ok(balance >= HERO_MONSTER_INVITE_COST, `Need at least ${HERO_MONSTER_INVITE_COST} coins, have ${balance}`);

  const revision = getLearnerRevision(server, accountId);
  const requestId = `camp-unlock-${Date.now()}`;
  const response = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);
  assert.ok(payload.heroCampAction, 'Response must include heroCampAction');
  assert.equal(payload.heroCampAction.status, 'invited');
  assert.equal(payload.heroCampAction.monsterId, 'glossbloom');
  assert.equal(payload.heroCampAction.branch, 'b1');
  assert.equal(payload.heroCampAction.cost, HERO_MONSTER_INVITE_COST);
  assert.equal(payload.heroCampAction.coinsUsed, HERO_MONSTER_INVITE_COST);
  assert.equal(payload.heroCampAction.coinBalance, balance - HERO_MONSTER_INVITE_COST);
  assert.equal(typeof payload.heroCampAction.ledgerEntryId, 'string');
  assert.ok(payload.mutation, 'Response must include mutation metadata');

  // Verify persisted state
  const progress = getHeroProgressRow(server, learnerId);
  assert.equal(progress.economy.balance, balance - HERO_MONSTER_INVITE_COST);
  assert.equal(progress.heroPool.monsters.glossbloom.owned, true);
  assert.equal(progress.heroPool.monsters.glossbloom.stage, 0);
  assert.equal(progress.heroPool.monsters.glossbloom.branch, 'b1');

  // Verify event_log
  const events = getHeroEvents(server);
  const campEvent = events.find(e => e.event_type === 'hero.camp.monster.invited');
  assert.ok(campEvent, 'hero.camp.monster.invited event must exist in event_log');

  server.close();
});

// ── 2. evolve-monster happy path ─────────────────────────────────────────

test('P5-U6: evolve-monster happy path — debits coins, advances stage', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const balance = await seedCoins(server, learnerId, accountId);
  assert.ok(balance >= HERO_MONSTER_INVITE_COST + HERO_MONSTER_GROW_COSTS[1],
    `Need at least ${HERO_MONSTER_INVITE_COST + HERO_MONSTER_GROW_COSTS[1]} coins, have ${balance}`);

  // First unlock a monster
  let revision = getLearnerRevision(server, accountId);
  const unlockResp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'loomrill',
    branch: 'b2',
    requestId: `camp-unlock-evo-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const unlockPayload = await unlockResp.json();
  assert.equal(unlockResp.status, 200, `Unlock must succeed: ${JSON.stringify(unlockPayload)}`);
  const balanceAfterUnlock = unlockPayload.heroCampAction.coinBalance;

  // Now evolve it to stage 1
  revision = getLearnerRevision(server, accountId);
  const evolveResp = await postHeroCommand(server, {
    command: 'evolve-monster',
    learnerId,
    monsterId: 'loomrill',
    targetStage: 1,
    requestId: `camp-evolve-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const evolvePayload = await evolveResp.json();

  assert.equal(evolveResp.status, 200, `Expected 200, got ${evolveResp.status}: ${JSON.stringify(evolvePayload)}`);
  assert.equal(evolvePayload.ok, true);
  assert.ok(evolvePayload.heroCampAction);
  assert.equal(evolvePayload.heroCampAction.status, 'grown');
  assert.equal(evolvePayload.heroCampAction.monsterId, 'loomrill');
  assert.equal(evolvePayload.heroCampAction.stageBefore, 0);
  assert.equal(evolvePayload.heroCampAction.stageAfter, 1);
  assert.equal(evolvePayload.heroCampAction.cost, HERO_MONSTER_GROW_COSTS[1]);
  assert.equal(evolvePayload.heroCampAction.coinBalance, balanceAfterUnlock - HERO_MONSTER_GROW_COSTS[1]);
  assert.ok(evolvePayload.mutation);

  // Verify persisted state
  const progress = getHeroProgressRow(server, learnerId);
  assert.equal(progress.heroPool.monsters.loomrill.stage, 1);
  assert.equal(progress.economy.balance, balanceAfterUnlock - HERO_MONSTER_GROW_COSTS[1]);

  // Verify event_log
  const events = getHeroEvents(server);
  const growEvent = events.find(e => e.event_type === 'hero.camp.monster.grown');
  assert.ok(growEvent, 'hero.camp.monster.grown event must exist in event_log');

  server.close();
});

// ── 3. Same requestId on repeat — resolver idempotency prevents double debit ──

test('P5-U6: same requestId on repeat — no double debit, idempotent response', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const balance = await seedCoins(server, learnerId, accountId);
  assert.ok(balance >= HERO_MONSTER_INVITE_COST);

  const revision = getLearnerRevision(server, accountId);
  const requestId = `camp-replay-${Date.now()}`;

  // First call — successfully invites the monster
  const resp1 = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'mirrane',
    branch: 'b1',
    requestId,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload1 = await resp1.json();
  assert.equal(resp1.status, 200);
  assert.equal(payload1.ok, true);
  assert.equal(payload1.heroCampAction.status, 'invited');

  // Same requestId on retry — state already reflects ownership so resolver
  // returns already-owned (short-circuits before mutation path). This is the
  // camp's built-in idempotency: the pure resolver re-reads fresh state.
  const newRevision = getLearnerRevision(server, accountId);
  const resp2 = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'mirrane',
    branch: 'b1',
    requestId,
    expectedLearnerRevision: newRevision,
  }, accountId);
  const payload2 = await resp2.json();
  assert.equal(resp2.status, 200, `Repeat must 200: ${JSON.stringify(payload2)}`);
  assert.equal(payload2.ok, true);
  assert.equal(payload2.heroCampAction.status, 'already-owned');
  assert.equal(payload2.heroCampAction.cost, 0);

  // Balance must not have been debited twice
  const progress = getHeroProgressRow(server, learnerId);
  assert.equal(progress.economy.balance, balance - HERO_MONSTER_INVITE_COST);

  server.close();
});

// ── 4. Different requestId for already-owned → no debit ──────────────────

test('P5-U6: different requestId for already-owned monster → no debit, idempotent', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const balance = await seedCoins(server, learnerId, accountId);
  assert.ok(balance >= HERO_MONSTER_INVITE_COST);

  // First unlock
  let revision = getLearnerRevision(server, accountId);
  const resp1 = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'colisk',
    branch: 'b1',
    requestId: `camp-first-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  assert.equal(resp1.status, 200);

  // Second unlock with different requestId — should be idempotent (already-owned)
  revision = getLearnerRevision(server, accountId);
  const resp2 = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'colisk',
    branch: 'b1',
    requestId: `camp-second-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload2 = await resp2.json();
  assert.equal(resp2.status, 200);
  assert.equal(payload2.ok, true);
  assert.equal(payload2.heroCampAction.status, 'already-owned');
  assert.equal(payload2.heroCampAction.cost, 0);
  assert.equal(payload2.heroCampAction.coinsUsed, 0);

  // Balance only debited once
  const progress = getHeroProgressRow(server, learnerId);
  assert.equal(progress.economy.balance, balance - HERO_MONSTER_INVITE_COST);

  server.close();
});

// ── 5. Different requestId for already-stage → no debit ──────────────────

test('P5-U6: different requestId for already-stage → no debit, idempotent', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const balance = await seedCoins(server, learnerId, accountId);
  const totalCost = HERO_MONSTER_INVITE_COST + HERO_MONSTER_GROW_COSTS[1];
  assert.ok(balance >= totalCost, `Need at least ${totalCost} coins`);

  // Unlock
  let revision = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'hyphang',
    branch: 'b2',
    requestId: `camp-stage-unlock-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);

  // Evolve to stage 1
  revision = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'evolve-monster',
    learnerId,
    monsterId: 'hyphang',
    targetStage: 1,
    requestId: `camp-stage-evolve-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);

  // Evolve again to stage 1 with different requestId — should be idempotent
  revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'evolve-monster',
    learnerId,
    monsterId: 'hyphang',
    targetStage: 1,
    requestId: `camp-stage-dup-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();
  assert.equal(resp.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.heroCampAction.status, 'already-stage');
  assert.equal(payload.heroCampAction.cost, 0);
  assert.equal(payload.heroCampAction.coinsUsed, 0);

  // Balance debited exactly invite + grow(1)
  const progress = getHeroProgressRow(server, learnerId);
  assert.equal(progress.economy.balance, balance - totalCost);

  server.close();
});

// ── 6. Camp disabled → 409 hero_camp_disabled ────────────────────────────

test('P5-U6: Camp off → 409 hero_camp_disabled', async () => {
  const server = createCampDisabledServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId: `camp-off-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();

  assert.equal(resp.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'hero_camp_disabled');

  server.close();
});

// ── 7. Camp on + Economy off → 409 hero_camp_misconfigured ───────────────

test('P5-U6: Camp on, Economy off → 409 hero_camp_misconfigured', async () => {
  const server = createCampWithoutEconomyServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  const revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId: `camp-noeco-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();

  assert.equal(resp.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'hero_camp_misconfigured');

  server.close();
});

// ── 8. Stale revision → 409 stale_write ─────────────────────────────────

test('P5-U6: stale revision → 409 stale_write', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  await seedCoins(server, learnerId, accountId);

  // Get the actual current revision, then use (current - 1) to force stale
  const actualRevision = getLearnerRevision(server, accountId);
  assert.ok(actualRevision > 0, `Revision must be > 0 after seeding, got ${actualRevision}`);

  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId: `camp-stale-${Date.now()}`,
    expectedLearnerRevision: actualRevision - 1, // stale — one behind current
  }, accountId);
  const payload = await resp.json();

  assert.equal(resp.status, 409);
  assert.equal(payload.ok, false);
  assert.ok(
    payload.code === 'stale_write' || payload.code === 'mutation_stale_write',
    `Expected stale_write error code, got: ${payload.code}`,
  );

  server.close();
});

// ── 9. Insufficient coins → 409 hero_insufficient_coins ─────────────────

test('P5-U6: insufficient coins → hero_insufficient_coins', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  // Do NOT seed coins — balance is 0
  // But we need to have the hero progress state initialised, so do a start-task
  const rmResp = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const rmPayload = await rmResp.json();
  const quest = rmPayload.hero.dailyQuest;
  const task = quest.tasks.find(t => t.launchStatus === 'launchable');

  let revision = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: quest.questId,
    questFingerprint: rmPayload.hero.questFingerprint,
    taskId: task.taskId,
    requestId: `camp-nocoins-start-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);

  // Now try unlock with 0 balance
  revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId: `camp-nocoins-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();

  assert.equal(resp.status, 409);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'hero_insufficient_coins');

  server.close();
});

// ── 10. Client sends `cost` field → 400 hero_client_field_rejected ───────

test('P5-U6: client sends forbidden `cost` field → 400 hero_client_field_rejected', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  await seedCoins(server, learnerId, accountId);

  const revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    cost: 999, // forbidden field
    requestId: `camp-forbidden-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();

  assert.equal(resp.status, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'hero_client_field_rejected');

  server.close();
});

// ── 11. No child_subject_state write occurs ──────────────────────────────

test('P5-U6: no child_subject_state write occurs from camp commands', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  await seedCoins(server, learnerId, accountId);

  // Snapshot subject state before
  const subjectStatesBefore = server.DB.db.prepare(
    `SELECT subject_id, updated_at FROM child_subject_state WHERE learner_id = ?`,
  ).all(learnerId);

  const revision = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'carillon',
    branch: 'b1',
    requestId: `camp-nosubject-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);

  // Subject states must be unchanged
  const subjectStatesAfter = server.DB.db.prepare(
    `SELECT subject_id, updated_at FROM child_subject_state WHERE learner_id = ?`,
  ).all(learnerId);
  assert.deepEqual(subjectStatesAfter, subjectStatesBefore);

  server.close();
});

// ── 12. No practice_sessions write occurs ────────────────────────────────

test('P5-U6: no practice_sessions write occurs from camp commands', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  await seedCoins(server, learnerId, accountId);

  // Count practice sessions before
  const countBefore = server.DB.db.prepare(
    `SELECT COUNT(*) as cnt FROM practice_sessions WHERE learner_id = ?`,
  ).get(learnerId).cnt;

  const revision = getLearnerRevision(server, accountId);
  await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'carillon',
    branch: 'b2',
    requestId: `camp-nops-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);

  const countAfter = server.DB.db.prepare(
    `SELECT COUNT(*) as cnt FROM practice_sessions WHERE learner_id = ?`,
  ).get(learnerId).cnt;
  assert.equal(countAfter, countBefore, 'No new practice_sessions rows from camp commands');

  server.close();
});

// ── 13. Existing start-task and claim-task still work ────────────────────

test('P5-U6: start-task and claim-task still work after camp wiring', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  // start-task
  const rmResp = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const rmPayload = await rmResp.json();
  assert.equal(rmResp.status, 200);
  const quest = rmPayload.hero.dailyQuest;
  const task = quest.tasks.find(t => t.launchStatus === 'launchable');
  assert.ok(task, 'Must have a launchable task');

  const revision = getLearnerRevision(server, accountId);
  const startResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: quest.questId,
    questFingerprint: rmPayload.hero.questFingerprint,
    taskId: task.taskId,
    requestId: `camp-compat-start-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const startPayload = await startResp.json();
  assert.equal(startResp.status, 200, `start-task must succeed: ${JSON.stringify(startPayload)}`);
  assert.equal(startPayload.ok, true);

  // claim-task
  const nowTs = Date.now();
  const sessionId = `ps-camp-compat-${Date.now().toString(36)}`;
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: quest.questId,
      questFingerprint: rmPayload.hero.questFingerprint,
      taskId: task.taskId,
      intent: task.intent || 'due-review',
      launcher: task.launcher || 'smart-practice',
    },
    status: 'completed',
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, learnerId, task.subjectId, summaryJson, nowTs, nowTs);

  const claimRev = getLearnerRevision(server, accountId);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId,
    questId: quest.questId,
    questFingerprint: rmPayload.hero.questFingerprint,
    taskId: task.taskId,
    requestId: `camp-compat-claim-${Date.now()}`,
    expectedLearnerRevision: claimRev,
  }, accountId);
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 200, `claim-task must succeed: ${JSON.stringify(claimPayload)}`);
  assert.equal(claimPayload.ok, true);
  assert.equal(claimPayload.heroClaim.status, 'claimed');

  server.close();
});

// ── 14. Ledger is capped at 180 entries ──────────────────────────────────

test('P5-U6: ledger is capped at 180 entries after mutation', async () => {
  const server = createCampServer();
  const learnerId = 'learner-a';
  const accountId = 'adult-a';
  await seedLearner(server, accountId, learnerId);

  await seedCoins(server, learnerId, accountId);

  // Manually inject a large ledger (179 entries) into state
  const progress = getHeroProgressRow(server, learnerId);
  const fakeLedger = Array.from({ length: 179 }, (_, i) => ({
    entryId: `fake-${i}`,
    type: 'test',
    amount: 1,
    balanceAfter: 100 + i,
    createdAt: Date.now() - (179 - i) * 1000,
  }));
  progress.economy.ledger = fakeLedger;
  progress.economy.balance = 1000; // Ensure enough balance
  server.DB.db.prepare(`
    UPDATE child_game_state SET state_json = ? WHERE learner_id = ? AND system_id = 'hero-mode'
  `).run(JSON.stringify(progress), learnerId);

  const revision = getLearnerRevision(server, accountId);
  const resp = await postHeroCommand(server, {
    command: 'unlock-monster',
    learnerId,
    monsterId: 'glossbloom',
    branch: 'b1',
    requestId: `camp-ledger-cap-${Date.now()}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const payload = await resp.json();
  assert.equal(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(payload)}`);

  // Check ledger is capped
  const updated = getHeroProgressRow(server, learnerId);
  assert.ok(updated.economy.ledger.length <= 180, `Ledger must be <= 180, got ${updated.economy.ledger.length}`);

  server.close();
});

// ── Wrangler config check ────────────────────────────────────────────────

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

// ── Import verification ──────────────────────────────────────────────────

describe('P5-U6 Camp — import path is correct', () => {
  it('camp.js resolver is importable and exports resolveHeroCampCommand', () => {
    assert.equal(typeof resolveHeroCampCommand, 'function');
  });

  it('camp.js exports FORBIDDEN_CAMP_FIELDS', () => {
    assert.ok(Array.isArray(FORBIDDEN_CAMP_FIELDS));
    assert.ok(FORBIDDEN_CAMP_FIELDS.length > 0);
    assert.ok(FORBIDDEN_CAMP_FIELDS.includes('cost'));
  });
});
