// Hero Mode P3 U12 — Full completion flow E2E integration tests.
//
// Uses createWorkerRepositoryServer to exercise the complete
// start -> complete -> claim -> progress flow with all four flags
// enabled (SHADOW + LAUNCH + CHILD_UI + PROGRESS).
//
// Tests cover 10 flows from spec section 19.6:
//
// Flow 1:  Full happy path (start -> complete -> claim -> read-model)
// Flow 2:  Duplicate claim — same requestId (idempotent replay)
// Flow 3:  Duplicate claim — different requestId, same task (already-completed)
// Flow 4:  Cross-learner claim rejection
// Flow 5:  Claim before subject completion (no evidence)
// Flow 6:  Session cleared from ui_json but present in practice_sessions
// Flow 7:  Punctuation completion path preservation
// Flow 8:  All flags off — no claim endpoint
// Flow 9:  Progress flag off — P2 UI safe
// Flow 10: Midnight grace window

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';
import { HERO_CLAIM_GRACE_HOURS } from '../shared/hero/constants.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Server factories ───────────────────────────────────────────────────

function createFullP3Server() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

function createAllFlagsOffServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'false',
      HERO_MODE_LAUNCH_ENABLED: 'false',
      HERO_MODE_CHILD_UI_ENABLED: 'false',
      HERO_MODE_PROGRESS_ENABLED: 'false',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

function createP2OnlyServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      HERO_MODE_PROGRESS_ENABLED: 'false',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

// ── Fixture data ──────────────────────────────────────────────────────

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

// ── Fixture seeding ────────────────────────────────────────────────────

async function seedLearner(server, accountId, learnerId, learnerName = 'Completion Flow Learner') {
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
        name: learnerName,
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

  return repos;
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function getReadModel(server, learnerId, accountId = 'adult-a') {
  const response = await server.fetchAs(accountId, `${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const payload = await response.json();
  assert.equal(response.status, 200, `Read model returned ${response.status}: ${JSON.stringify(payload)}`);
  assert.ok(payload.hero, 'Read model must contain hero block');
  return payload;
}

function findFirstLaunchableTask(heroPayload) {
  const quest = heroPayload.hero.dailyQuest;
  if (!quest || !quest.tasks) return null;
  const task = quest.tasks.find((t) => t.launchStatus === 'launchable');
  if (!task) return null;
  return {
    questId: quest.questId,
    questFingerprint: heroPayload.hero.questFingerprint,
    taskId: task.taskId,
    subjectId: task.subjectId,
    task,
  };
}

function findFirstLaunchableTaskForSubject(heroPayload, subjectId) {
  const quest = heroPayload.hero.dailyQuest;
  if (!quest || !quest.tasks) return null;
  const task = quest.tasks.find((t) => t.launchStatus === 'launchable' && t.subjectId === subjectId);
  if (!task) return null;
  return {
    questId: quest.questId,
    questFingerprint: heroPayload.hero.questFingerprint,
    taskId: task.taskId,
    subjectId: task.subjectId,
    task,
  };
}

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

function countMutationReceipts(server) {
  const row = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM mutation_receipts`,
  ).get();
  return row?.cnt ?? 0;
}

function getChildSubjectStateSnapshot(server, learnerId) {
  const rows = server.DB.db.prepare(
    `SELECT subject_id, ui_json, data_json, updated_at FROM child_subject_state WHERE learner_id = ? ORDER BY subject_id`,
  ).all(learnerId);
  return JSON.stringify(rows);
}

/**
 * Start a hero task and seed a completed practice session for it.
 * Returns metadata needed for making a claim.
 */
async function startAndCompleteTask(server, learnerId, accountId) {
  const readModelPayload = await getReadModel(server, learnerId, accountId);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) throw new Error('No launchable task found in fixture');

  const revision = getLearnerRevision(server, accountId);
  const launchResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId,
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: `e2e-launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    expectedLearnerRevision: revision,
  }, accountId);
  const launchPayload = await launchResp.json();
  assert.equal(launchResp.status, 200, `Launch must succeed: ${JSON.stringify(launchPayload)}`);

  // Seed a completed practice_session with heroContext
  const sessionId = `ps-e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 8,
    total: 10,
  });

  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, learnerId, launchable.subjectId, summaryJson, nowTs, nowTs);

  return {
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    subjectId: launchable.subjectId,
    practiceSessionId: sessionId,
    task: launchable.task,
  };
}

// ── Flow 1: Full happy path ─────────────────────────────────────────────

test('U12 Flow 1: full happy path — read-model v4 → start → complete → claim → verify progress', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');

  // Step 1: GET read-model → verify v4 shape
  const readModelPayload = await getReadModel(server, 'learner-1');
  const hero = readModelPayload.hero;
  assert.equal(hero.version, 4, 'Read model must be v4 with all P3 flags enabled');
  assert.equal(hero.mode, 'progress', 'Mode must be progress in v4');
  assert.ok(hero.dailyQuest, 'dailyQuest must exist');
  assert.ok(hero.dailyQuest.tasks.length > 0, 'Must have at least one task');
  assert.ok(hero.questFingerprint, 'questFingerprint must be present');

  // Step 2: POST start-task → verify heroLaunch + progress marker written
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const revision1 = getLearnerRevision(server);
  const startResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow1-start',
    expectedLearnerRevision: revision1,
  });
  const startPayload = await startResp.json();
  assert.equal(startResp.status, 200, `Start must succeed: ${JSON.stringify(startPayload)}`);
  assert.equal(startPayload.heroLaunch.status, 'started');

  // Verify progress marker
  const progressAfterStart = getHeroProgressRow(server, 'learner-1');
  assert.ok(progressAfterStart, 'Progress must exist after start');
  assert.equal(progressAfterStart.daily.tasks[launchable.taskId].status, 'started');

  // Step 3: Simulate subject session completion
  const sessionId = `ps-flow1-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 9,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-1', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Step 4: POST claim-task → verify claimed
  const revision2 = getLearnerRevision(server);
  const receiptsBefore = countMutationReceipts(server);
  const subjectStateBefore = getChildSubjectStateSnapshot(server, 'learner-1');

  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow1-claim',
    expectedLearnerRevision: revision2,
  });
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 200, `Claim must succeed: ${JSON.stringify(claimPayload)}`);
  assert.equal(claimPayload.ok, true);
  assert.equal(claimPayload.heroClaim.status, 'claimed');
  assert.equal(claimPayload.heroClaim.learnerId, 'learner-1');
  assert.equal(claimPayload.heroClaim.questId, launchable.questId);
  assert.equal(claimPayload.heroClaim.taskId, launchable.taskId);
  assert.equal(claimPayload.heroClaim.subjectId, launchable.subjectId);
  assert.equal(claimPayload.heroClaim.heroStatePersistenceEnabled, true);
  assert.equal(claimPayload.heroClaim.coinsEnabled, false);
  assert.equal(typeof claimPayload.heroClaim.effortCredited, 'number');
  assert.equal(typeof claimPayload.heroClaim.effortCompleted, 'number');
  assert.equal(typeof claimPayload.heroClaim.effortPlanned, 'number');

  // Mutation receipt created
  assert.ok(claimPayload.mutation, 'Response must include mutation metadata');
  const receiptsAfter = countMutationReceipts(server);
  assert.ok(receiptsAfter > receiptsBefore, 'mutation_receipts must increase');

  // Learner revision bumped
  const revision3 = getLearnerRevision(server);
  assert.equal(revision3, revision2 + 1, 'Learner revision must bump by 1');

  // Progress state updated
  const progressAfterClaim = getHeroProgressRow(server, 'learner-1');
  assert.ok(progressAfterClaim, 'Progress must exist after claim');
  const taskEntry = progressAfterClaim.daily.tasks[launchable.taskId];
  assert.equal(taskEntry.status, 'completed');
  assert.ok(taskEntry.completedAt > 0);
  assert.ok(taskEntry.claimRequestId);

  // hero.task.completed event emitted
  const events = getHeroEvents(server);
  const taskEvent = events.find(e => e.event_type === 'hero.task.completed');
  assert.ok(taskEvent, 'hero.task.completed event must exist');

  // child_subject_state NOT modified by claim
  const subjectStateAfter = getChildSubjectStateSnapshot(server, 'learner-1');
  assert.equal(subjectStateAfter, subjectStateBefore, 'child_subject_state must not change from claim');

  // Step 5: GET read-model → verify task shows completionStatus='completed'
  const finalReadModel = await getReadModel(server, 'learner-1');
  const finalQuest = finalReadModel.hero.dailyQuest;
  const completedTask = finalQuest.tasks.find(t => t.taskId === launchable.taskId);
  if (completedTask) {
    assert.equal(completedTask.completionStatus, 'completed',
      'Task must show completionStatus=completed in read model after claim');
  }

  server.close();
});

// ── Flow 2: Duplicate claim — same requestId ──────────────────────────

test('U12 Flow 2: duplicate claim with same requestId → idempotent response', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');
  const claimable = await startAndCompleteTask(server, 'learner-1', 'adult-a');

  const revision = getLearnerRevision(server);
  const requestId = 'e2e-flow2-idempotent';

  // First claim
  const resp1 = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId,
    expectedLearnerRevision: revision,
  });
  const payload1 = await resp1.json();
  assert.equal(resp1.status, 200, `First claim must succeed: ${JSON.stringify(payload1)}`);
  assert.equal(payload1.ok, true);
  assert.equal(payload1.heroClaim.status, 'claimed');

  // Second claim with SAME requestId
  const resp2 = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId,
    expectedLearnerRevision: revision,
  });
  const payload2 = await resp2.json();
  assert.equal(resp2.status, 200, `Replay must succeed: ${JSON.stringify(payload2)}`);
  assert.equal(payload2.ok, true);

  // Must be idempotent: already-completed or replayed
  const isAlreadyCompleted = payload2.heroClaim?.status === 'already-completed';
  const isReplayed = payload2.mutation?.replayed === true;
  assert.ok(isAlreadyCompleted || isReplayed,
    `Replay must be idempotent: got status=${payload2.heroClaim?.status}, replayed=${payload2.mutation?.replayed}`);

  // Revision bumped only ONCE (not double-bumped)
  const finalRevision = getLearnerRevision(server);
  assert.equal(finalRevision, revision + 1, 'Revision must bump exactly once across both claims');

  server.close();
});

// ── Flow 3: Duplicate claim — different requestId, same task ──────────

test('U12 Flow 3: duplicate claim with different requestId for completed task → already-completed, no double effort', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');
  const claimable = await startAndCompleteTask(server, 'learner-1', 'adult-a');

  // First claim
  const rev1 = getLearnerRevision(server);
  const resp1 = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId: 'e2e-flow3-first',
    expectedLearnerRevision: rev1,
  });
  const payload1 = await resp1.json();
  assert.equal(resp1.status, 200, `First claim must succeed: ${JSON.stringify(payload1)}`);
  const effortAfterFirst = payload1.heroClaim.effortCompleted;

  // Second claim with DIFFERENT requestId for the SAME task
  const rev2 = getLearnerRevision(server);
  const resp2 = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId: 'e2e-flow3-second',
    expectedLearnerRevision: rev2,
  });
  const payload2 = await resp2.json();
  assert.equal(resp2.status, 200, `Second claim must respond: ${JSON.stringify(payload2)}`);
  assert.equal(payload2.ok, true);
  assert.equal(payload2.heroClaim.status, 'already-completed',
    'Second claim with different requestId for same task must return already-completed');

  // Effort must NOT increase (no double-counting)
  if (payload2.heroClaim.effortCompleted !== undefined) {
    assert.equal(payload2.heroClaim.effortCompleted, effortAfterFirst,
      'effortCompleted must not increase on already-completed');
  }

  server.close();
});

// ── Flow 4: Cross-learner claim rejection ─────────────────────────────

test('U12 Flow 4: cross-learner claim → rejection (learner B cannot claim learner A session)', async () => {
  const server = createFullP3Server();

  // Seed TWO learners under the SAME account (adult-a) for access
  await seedLearner(server, 'adult-a', 'learner-a', 'Learner A');

  // Seed learner-b under a different account
  const reposB = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    authSession: server.authSessionFor('adult-b'),
  });
  await reposB.hydrate();
  reposB.learners.write({
    byId: {
      'learner-b': {
        id: 'learner-b',
        name: 'Learner B',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#FF6633',
        createdAt: 1,
      },
    },
    allIds: ['learner-b'],
    selectedId: 'learner-b',
  });
  await reposB.flush();

  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run('learner-b', JSON.stringify(HERO_SPELLING_DATA), now, 'adult-b');
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'punctuation', '{}', ?, ?, ?)
  `).run('learner-b', JSON.stringify(HERO_PUNCTUATION_DATA), now, 'adult-b');

  // Start and complete a task for learner-a
  const claimable = await startAndCompleteTask(server, 'learner-a', 'adult-a');

  // Attempt to claim as learner-b (using adult-b's account)
  // First start a task for learner-b so progress state exists
  const readModelB = await getReadModel(server, 'learner-b', 'adult-b');
  const launchableB = findFirstLaunchableTask(readModelB);
  if (!launchableB) {
    server.close();
    return; // skip if no launchable for B
  }
  const revB = getLearnerRevision(server, 'adult-b');
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-b',
    questId: launchableB.questId,
    questFingerprint: launchableB.questFingerprint,
    taskId: launchableB.taskId,
    requestId: 'e2e-flow4-start-b',
    expectedLearnerRevision: revB,
  }, 'adult-b');

  // The claim uses learner-b's credentials but tries to claim learner-a's task
  // Since learner-b has their own progress state with different quest/task IDs,
  // and learner-a's practice session belongs to learner-a, learner-b's claim
  // for the same taskId will fail: either no evidence (because practice_sessions
  // are filtered by learner_id) or quest identity mismatch.
  const revB2 = getLearnerRevision(server, 'adult-b');
  const crossResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-b',
    questId: claimable.questId,
    questFingerprint: claimable.questFingerprint,
    taskId: claimable.taskId,
    requestId: 'e2e-flow4-cross-claim',
    expectedLearnerRevision: revB2,
  }, 'adult-b');
  const crossPayload = await crossResp.json();

  // Must reject — either quest mismatch, task not in quest, or no evidence
  assert.ok(
    crossResp.status === 400 || crossResp.status === 409,
    `Cross-learner claim must be rejected: got ${crossResp.status}: ${JSON.stringify(crossPayload)}`,
  );
  assert.ok(
    crossPayload.error?.code === 'hero_claim_no_evidence' ||
    crossPayload.error?.code === 'hero_claim_task_not_in_quest' ||
    crossPayload.error?.code === 'hero_claim_cross_learner_rejected' ||
    crossPayload.code === 'hero_quest_stale' ||
    crossPayload.code === 'hero_quest_fingerprint_mismatch',
    `Expected a cross-learner rejection code, got: ${JSON.stringify(crossPayload)}`,
  );

  server.close();
});

// ── Flow 5: Claim before subject completion ───────────────────────────

test('U12 Flow 5: claim before subject completion → hero_claim_no_evidence rejection', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');

  // Start a hero task but do NOT seed a completed practice session
  const readModelPayload = await getReadModel(server, 'learner-1');
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const rev1 = getLearnerRevision(server);
  const startResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow5-start',
    expectedLearnerRevision: rev1,
  });
  const startPayload = await startResp.json();
  assert.equal(startResp.status, 200, `Start must succeed: ${JSON.stringify(startPayload)}`);

  // Clear subject ui_json so fallback evidence path has no heroContext
  server.DB.db.prepare(`
    UPDATE child_subject_state SET ui_json = '{}' WHERE learner_id = ?
  `).run('learner-1');

  // Attempt to claim without any completed session
  const rev2 = getLearnerRevision(server);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow5-claim',
    expectedLearnerRevision: rev2,
  });
  const claimPayload = await claimResp.json();

  assert.equal(claimResp.status, 400, `Expected 400: ${JSON.stringify(claimPayload)}`);
  assert.equal(claimPayload.error.code, 'hero_claim_no_evidence');

  server.close();
});

// ── Flow 6: Session cleared from ui_json but present in practice_sessions ─

test('U12 Flow 6: session cleared from ui_json but in practice_sessions → claim succeeds', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');

  // Start a hero task
  const readModelPayload = await getReadModel(server, 'learner-1');
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const rev1 = getLearnerRevision(server);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow6-start',
    expectedLearnerRevision: rev1,
  });

  // Simulate subject clearing its session from ui_json (as it does after completion)
  server.DB.db.prepare(`
    UPDATE child_subject_state SET ui_json = '{"session": null}' WHERE learner_id = ? AND subject_id = ?
  `).run('learner-1', launchable.subjectId);

  // But a completed practice_session with heroContext exists (stronger evidence)
  const sessionId = `ps-flow6-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 7,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-1', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Claim → must succeed because practice_sessions is the stronger evidence source
  const rev2 = getLearnerRevision(server);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow6-claim',
    expectedLearnerRevision: rev2,
  });
  const claimPayload = await claimResp.json();

  assert.equal(claimResp.status, 200, `Claim must succeed when practice_sessions has evidence: ${JSON.stringify(claimPayload)}`);
  assert.equal(claimPayload.ok, true);
  assert.equal(claimPayload.heroClaim.status, 'claimed');

  server.close();
});

// ── Flow 7: Punctuation completion path preservation ──────────────────

test('U12 Flow 7: Punctuation hero task preserves normal subject response handling', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');

  const readModelPayload = await getReadModel(server, 'learner-1');
  const punctuationTask = findFirstLaunchableTaskForSubject(readModelPayload, 'punctuation');

  if (!punctuationTask) {
    // No punctuation task available from fixture — skip gracefully
    server.close();
    return;
  }

  const revision = getLearnerRevision(server);
  const startResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-1',
    questId: punctuationTask.questId,
    questFingerprint: punctuationTask.questFingerprint,
    taskId: punctuationTask.taskId,
    requestId: 'e2e-flow7-punctuation-start',
    expectedLearnerRevision: revision,
  });
  const startPayload = await startResp.json();

  // Must not crash — 200 or typed error
  assert.ok(
    startResp.status === 200 || startResp.status === 409 || startResp.status === 404,
    `Punctuation launch must not crash: got ${startResp.status}: ${JSON.stringify(startPayload)}`,
  );

  if (startResp.status === 200) {
    // Verify the Punctuation subject's response structure is preserved
    assert.equal(startPayload.heroLaunch.subjectId, 'punctuation');
    assert.equal(startPayload.subjectId, 'punctuation');
    assert.equal(startPayload.command, 'start-session');
    // Subject data must still flow through (not replaced by Hero response handling)
    assert.ok(startPayload.changed === true || startPayload.subjectReadModel != null,
      'Punctuation response must still include subject data');

    // Now seed and claim for punctuation
    const sessionId = `ps-flow7-punct-${Date.now().toString(36)}`;
    const nowTs = Date.now();
    const summaryJson = JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: punctuationTask.questId,
        questFingerprint: punctuationTask.questFingerprint,
        taskId: punctuationTask.taskId,
        intent: punctuationTask.task.intent || 'due-review',
        launcher: punctuationTask.task.launcher || 'smart-practice',
      },
      status: 'completed',
      score: 6,
      total: 8,
    });
    server.DB.db.prepare(`
      INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
      VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
    `).run(sessionId, 'learner-1', 'punctuation', summaryJson, nowTs, nowTs);

    const rev2 = getLearnerRevision(server);
    const claimResp = await postHeroCommand(server, {
      command: 'claim-task',
      learnerId: 'learner-1',
      questId: punctuationTask.questId,
      questFingerprint: punctuationTask.questFingerprint,
      taskId: punctuationTask.taskId,
      requestId: 'e2e-flow7-punctuation-claim',
      expectedLearnerRevision: rev2,
    });
    const claimPayload = await claimResp.json();
    assert.equal(claimResp.status, 200, `Punctuation claim must succeed: ${JSON.stringify(claimPayload)}`);
    assert.equal(claimPayload.heroClaim.subjectId, 'punctuation');
  }

  server.close();
});

// ── Flow 8: All flags off — no claim endpoint ─────────────────────────

test('U12 Flow 8: all hero flags disabled → POST claim-task returns 404', async () => {
  const server = createAllFlagsOffServer();

  // No seeding needed — the route check happens before data access
  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'any-learner',
    questId: 'any-quest',
    questFingerprint: 'any-fp',
    taskId: 'any-task',
    requestId: 'e2e-flow8-disabled',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 404, `Expected 404, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.ok(
    payload.code === 'hero_launch_disabled' || payload.error?.code === 'hero_launch_disabled',
    `Expected hero_launch_disabled code: ${JSON.stringify(payload)}`,
  );

  server.close();
});

// ── Flow 9: Progress flag off — P2 UI safe ────────────────────────────

test('U12 Flow 9: progress flag off → read model v3, claim-task 404, start-task still works', async () => {
  const server = createP2OnlyServer();
  await seedLearner(server, 'adult-a', 'learner-1');

  // GET read-model → verify v3 shape (NOT v4)
  const readModelPayload = await getReadModel(server, 'learner-1');
  const hero = readModelPayload.hero;
  assert.equal(hero.version, 3, 'Read model must be v3 when progress flag is off');

  // POST claim-task → must be rejected
  const rev1 = getLearnerRevision(server);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: 'any-quest',
    questFingerprint: 'any-fp',
    taskId: 'any-task',
    requestId: 'e2e-flow9-claim',
    expectedLearnerRevision: rev1,
  });
  const claimPayload = await claimResp.json();
  assert.equal(claimResp.status, 404, `Claim must be 404 when progress disabled: ${JSON.stringify(claimPayload)}`);
  assert.ok(
    claimPayload.error?.code === 'hero_claim_disabled',
    `Expected hero_claim_disabled: ${JSON.stringify(claimPayload)}`,
  );

  // POST start-task → must still work (P2 behaviour preserved)
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (launchable) {
    const rev2 = getLearnerRevision(server);
    const startResp = await postHeroCommand(server, {
      command: 'start-task',
      learnerId: 'learner-1',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      requestId: 'e2e-flow9-start',
      expectedLearnerRevision: rev2,
    });
    const startPayload = await startResp.json();
    assert.equal(startResp.status, 200, `Start must still work in P2 mode: ${JSON.stringify(startPayload)}`);
    assert.equal(startPayload.heroLaunch.status, 'started');
  }

  server.close();
});

// ── Flow 10: Midnight grace window ────────────────────────────────────

test('U12 Flow 10: midnight grace — within 2h window succeeds, beyond 3h fails', async () => {
  const server = createFullP3Server();
  await seedLearner(server, 'adult-a', 'learner-1');

  // Start a task to get progress state
  const readModelPayload = await getReadModel(server, 'learner-1');
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Must have a launchable task');

  const rev1 = getLearnerRevision(server);
  await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow10-start',
    expectedLearnerRevision: rev1,
  });

  // Seed a completed practice session
  const sessionId = `ps-flow10-${Date.now().toString(36)}`;
  const nowTs = Date.now();
  const summaryJson = JSON.stringify({
    heroContext: {
      source: 'hero-mode',
      questId: launchable.questId,
      questFingerprint: launchable.questFingerprint,
      taskId: launchable.taskId,
      intent: launchable.task.intent || 'due-review',
      launcher: launchable.task.launcher || 'smart-practice',
    },
    status: 'completed',
    score: 8,
    total: 10,
  });
  server.DB.db.prepare(`
    INSERT INTO practice_sessions (id, learner_id, subject_id, session_kind, status, session_state_json, summary_json, created_at, updated_at)
    VALUES (?, ?, ?, 'smart-practice', 'completed', '{}', ?, ?, ?)
  `).run(sessionId, 'learner-1', launchable.subjectId, summaryJson, nowTs, nowTs);

  // Now manipulate the progress state's dateKey to be "yesterday"
  const yesterday = new Date(nowTs - 24 * 60 * 60 * 1000);
  const yesterdayDateKey = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;

  // Update the progress state to use yesterday's dateKey
  const progress = getHeroProgressRow(server, 'learner-1');
  if (progress && progress.daily) {
    progress.daily.dateKey = yesterdayDateKey;
    if (progress.daily.tasks[launchable.taskId]) {
      progress.daily.tasks[launchable.taskId].dateKey = yesterdayDateKey;
    }
    server.DB.db.prepare(`
      UPDATE child_game_state SET state_json = ? WHERE learner_id = ? AND system_id = 'hero-mode'
    `).run(JSON.stringify(progress), 'learner-1');
  }

  // The grace window is HERO_CLAIM_GRACE_HOURS (2) past midnight of the dateKey day.
  // Parse yesterday's end-of-day as the cutoff reference.
  const yesterdayParts = yesterdayDateKey.split('-');
  const dayEndUtc = Date.UTC(
    parseInt(yesterdayParts[0], 10),
    parseInt(yesterdayParts[1], 10) - 1,
    parseInt(yesterdayParts[2], 10) + 1,
  );
  const graceEndTs = dayEndUtc + (HERO_CLAIM_GRACE_HOURS * 60 * 60 * 1000);

  // If current time is within the grace window, claim should succeed.
  // If current time is beyond the grace window, it should fail.
  // We verify the current behaviour:
  const rev2 = getLearnerRevision(server);
  const claimResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow10-claim',
    expectedLearnerRevision: rev2,
  });
  const claimPayload = await claimResp.json();

  // The claim will succeed or fail depending on whether nowTs < graceEndTs.
  // We test the boundary: at nowTs we are either within or outside the grace.
  if (nowTs <= graceEndTs) {
    // Within grace — claim succeeds
    assert.equal(claimResp.status, 200, `Within grace window, claim must succeed: ${JSON.stringify(claimPayload)}`);
    assert.equal(claimPayload.ok, true);
    assert.equal(claimPayload.heroClaim.status, 'claimed');
  } else {
    // Beyond grace — claim rejected
    assert.equal(claimResp.status, 400, `Beyond grace window, claim must be rejected: ${JSON.stringify(claimPayload)}`);
    assert.equal(claimPayload.error.code, 'hero_claim_stale_or_expired');
  }

  // Now test the opposite scenario: set dateKey to 3 days ago (definitely beyond grace)
  const threeDaysAgo = new Date(nowTs - 3 * 24 * 60 * 60 * 1000);
  const staleKey = `${threeDaysAgo.getUTCFullYear()}-${String(threeDaysAgo.getUTCMonth() + 1).padStart(2, '0')}-${String(threeDaysAgo.getUTCDate()).padStart(2, '0')}`;

  const progress2 = getHeroProgressRow(server, 'learner-1');
  if (progress2 && progress2.daily) {
    // Reset the task to started so we can attempt to claim again
    progress2.daily.dateKey = staleKey;
    if (progress2.daily.tasks[launchable.taskId]) {
      progress2.daily.tasks[launchable.taskId].dateKey = staleKey;
      progress2.daily.tasks[launchable.taskId].status = 'started';
      progress2.daily.tasks[launchable.taskId].completedAt = null;
      progress2.daily.tasks[launchable.taskId].claimRequestId = null;
    }
    progress2.daily.completedTaskIds = progress2.daily.completedTaskIds.filter(id => id !== launchable.taskId);
    progress2.daily.status = 'active';
    server.DB.db.prepare(`
      UPDATE child_game_state SET state_json = ? WHERE learner_id = ? AND system_id = 'hero-mode'
    `).run(JSON.stringify(progress2), 'learner-1');
  }

  const rev3 = getLearnerRevision(server);
  const staleResp = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'e2e-flow10-stale',
    expectedLearnerRevision: rev3,
  });
  const stalePayload = await staleResp.json();

  assert.equal(staleResp.status, 400, `Stale dateKey must be rejected: ${JSON.stringify(stalePayload)}`);
  assert.equal(stalePayload.error.code, 'hero_claim_stale_or_expired',
    `Expected hero_claim_stale_or_expired for stale dateKey: ${JSON.stringify(stalePayload)}`);

  server.close();
});
