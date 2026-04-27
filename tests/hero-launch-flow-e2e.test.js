// Hero Mode P2 U7 — End-to-end launch flow integration tests.
//
// Uses createWorkerRepositoryServer to exercise the full server-side flow
// with all three flags enabled (SHADOW + LAUNCH + CHILD_UI). Tests cover:
//
// 1. Full happy path: read model v3 → launchable task → POST → heroLaunch + heroContext
// 2. Stale fingerprint rejection
// 3. Stale quest rejection
// 4. Active session → same task re-launch (already-started)
// 5. Active session → different task conflict
// 6. All flags off → 404
// 7. Punctuation Hero launch (if fixture available)

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Server factories ───────────────────────────────────────────────────

function createP2Server() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
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
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

// ── Fixture seeding ────────────────────────────────────────────────────

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

async function seedLearnerWithSubjectState(server, accountId, learnerId) {
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
        name: 'E2E Flow Test Learner',
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

  // Seed punctuation data so that punctuation tasks may appear
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'punctuation', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_PUNCTUATION_DATA), now, accountId);

  return repos;
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function getReadModel(server, learnerId = 'learner-a') {
  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
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

function getSubjectSessionState(server, learnerId, subjectId) {
  const row = server.DB.db.prepare(
    `SELECT ui_json FROM child_subject_state
     WHERE learner_id = ? AND subject_id = ?`,
  ).get(learnerId, subjectId);
  if (!row) return null;
  const ui = JSON.parse(row.ui_json);
  return ui?.session || null;
}

function countHeroEvents(server) {
  const row = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM event_log WHERE event_type LIKE 'hero.%'`,
  ).get();
  return row?.cnt ?? 0;
}

function countMutationReceipts(server) {
  const row = server.DB.db.prepare(
    `SELECT COUNT(*) AS cnt FROM mutation_receipts`,
  ).get();
  return row?.cnt ?? 0;
}

// ── 1. Full E2E happy path ─────────────────────────────────────────────

test('E2E P2: read model v3 → pick launchable → POST → heroLaunch + heroContext + zero hero events + mutation receipt', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Step 1: GET read model → verify v3 shape
  const readModelPayload = await getReadModel(server);
  const hero = readModelPayload.hero;

  assert.equal(hero.version, 3, 'Read model version must be 3');
  assert.equal(hero.ui.enabled, true, 'ui.enabled must be true when all 3 flags on');
  assert.equal(hero.childVisible, true, 'childVisible must be true when CHILD_UI_ENABLED');
  assert.equal(typeof hero.questFingerprint, 'string', 'questFingerprint must be a string');
  assert.ok(hero.questFingerprint.length > 0, 'questFingerprint must not be empty');
  assert.ok(hero.dailyQuest, 'dailyQuest must exist');
  assert.ok(hero.dailyQuest.tasks.length > 0, 'dailyQuest must have tasks');

  // Step 2: Find first launchable task
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found in read model — cannot exercise E2E flow');
  }

  const receiptsBefore = countMutationReceipts(server);
  const revision = getLearnerRevision(server);

  // Step 3: POST start-task with questFingerprint
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-e2e-p2-happy-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);

  // Verify heroLaunch block
  assert.ok(payload.heroLaunch, 'Response must include heroLaunch block');
  assert.equal(payload.heroLaunch.status, 'started');
  assert.equal(payload.heroLaunch.questId, launchable.questId);
  assert.equal(payload.heroLaunch.taskId, launchable.taskId);
  assert.equal(payload.heroLaunch.subjectCommand, 'start-session');
  assert.equal(typeof payload.heroLaunch.subjectId, 'string');
  assert.equal(payload.heroLaunch.childVisible, true, 'childVisible must be true in P2 mode');

  // Verify subject data in response
  assert.equal(payload.subjectId, payload.heroLaunch.subjectId);
  assert.equal(payload.command, 'start-session');
  assert.ok(payload.changed === true || payload.subjectReadModel != null,
    'Response must include subject read model data');

  // Verify heroContext on the active session
  const subjectId = payload.heroLaunch.subjectId;
  const session = getSubjectSessionState(server, 'learner-a', subjectId);
  assert.ok(session, 'Subject state must contain an active session after Hero launch');
  assert.ok(session.heroContext, 'Active session must carry heroContext');
  assert.equal(session.heroContext.phase, 'p2-child-launch');
  assert.equal(session.heroContext.questId, launchable.questId);
  assert.equal(session.heroContext.taskId, launchable.taskId);
  assert.equal(session.heroContext.source, 'hero-mode');

  // Verify zero hero.* events in event_log
  assert.equal(countHeroEvents(server), 0, 'Hero mode must produce zero hero.* events in event_log');

  // Verify mutation_receipts increased
  const receiptsAfter = countMutationReceipts(server);
  assert.ok(receiptsAfter > receiptsBefore, 'mutation_receipts must increase after subject command dispatch');

  server.close();
});

// ── 2. Stale fingerprint rejection ─────────────────────────────────────

test('E2E P2: correct questId but wrong questFingerprint → 409 hero_quest_fingerprint_mismatch', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify fingerprint rejection');
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: 'hero-qf-deliberately-wrong',
    taskId: launchable.taskId,
    requestId: 'hero-e2e-fp-mismatch-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_quest_fingerprint_mismatch');

  server.close();
});

// ── 3. Stale quest rejection ───────────────────────────────────────────

test('E2E P2: wrong questId → 409 hero_quest_stale', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  // Read model to get a valid fingerprint (but we'll use a wrong questId)
  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify stale quest rejection');
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'hero-quest-deliberately-wrong',
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-e2e-stale-quest-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_quest_stale');

  server.close();
});

// ── 4. Active session → same task re-launch ────────────────────────────

test('E2E P2: launch → re-launch same task → safe already-started response', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify re-launch behaviour');
  }

  // First launch
  const revision1 = getLearnerRevision(server);
  const firstResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-e2e-relaunch-1',
    expectedLearnerRevision: revision1,
  });
  const firstPayload = await firstResp.json();
  assert.equal(firstResp.status, 200, `First launch expected 200: ${JSON.stringify(firstPayload)}`);
  assert.equal(firstPayload.heroLaunch.status, 'started');

  // Re-read the model after launch (quest shifts due to state change)
  const refreshedPayload = await getReadModel(server);
  const refreshedQuest = refreshedPayload.hero.dailyQuest;
  const refreshedFingerprint = refreshedPayload.hero.questFingerprint;

  // Re-launch same taskId — the quest has shifted, so we need the new IDs.
  // The active session is detected by taskId, not questId. We use the
  // current quest IDs.
  const revision2 = getLearnerRevision(server);
  const secondResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: refreshedQuest.questId,
    questFingerprint: refreshedFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-e2e-relaunch-2',
    expectedLearnerRevision: revision2,
  });
  const secondPayload = await secondResp.json();

  assert.equal(secondResp.status, 200, `Re-launch expected 200: ${JSON.stringify(secondPayload)}`);
  assert.equal(secondPayload.ok, true);
  assert.ok(secondPayload.heroLaunch, 'Re-launch must include heroLaunch block');
  assert.equal(secondPayload.heroLaunch.status, 'already-started',
    'Re-launching the same task must return already-started');
  assert.ok(secondPayload.heroLaunch.activeSession, 'already-started must include activeSession');
  assert.equal(secondPayload.heroLaunch.activeSession.taskId, launchable.taskId);
  assert.equal(secondPayload.heroLaunch.childVisible, true,
    'childVisible must be true even for already-started in P2 mode');

  server.close();
});

// ── 5. Active session → different task conflict ────────────────────────

test('E2E P2: launch → launch different taskId → 409 hero_active_session_conflict', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const quest = readModelPayload.hero.dailyQuest;
  const tasks = quest?.tasks?.filter((t) => t.launchStatus === 'launchable') || [];
  if (tasks.length < 2) {
    server.close();
    // Need at least 2 launchable tasks to test conflict — skip gracefully
    return;
  }

  const fingerprint = readModelPayload.hero.questFingerprint;
  const task1 = tasks[0];
  const task2 = tasks[1];

  // Launch first task
  const revision1 = getLearnerRevision(server);
  const firstResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: quest.questId,
    questFingerprint: fingerprint,
    taskId: task1.taskId,
    requestId: 'hero-e2e-conflict-1',
    expectedLearnerRevision: revision1,
  });
  const firstPayload = await firstResp.json();
  assert.equal(firstResp.status, 200, `First launch expected 200: ${JSON.stringify(firstPayload)}`);

  // Try to launch a different task — quest has changed after state mutation,
  // so re-read the model and find a different launchable task.
  const refreshedPayload = await getReadModel(server);
  const refreshedQuest = refreshedPayload.hero.dailyQuest;
  const refreshedFingerprint = refreshedPayload.hero.questFingerprint;
  const refreshedTasks = refreshedQuest?.tasks?.filter((t) => t.launchStatus === 'launchable') || [];

  // Find a task that is different from task1 (by taskId)
  const differentTask = refreshedTasks.find((t) => t.taskId !== task1.taskId);
  if (!differentTask) {
    // After the state change, only one task remains launchable — skip gracefully.
    server.close();
    return;
  }

  const revision2 = getLearnerRevision(server);
  const secondResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: refreshedQuest.questId,
    questFingerprint: refreshedFingerprint,
    taskId: differentTask.taskId,
    requestId: 'hero-e2e-conflict-2',
    expectedLearnerRevision: revision2,
  });
  const secondPayload = await secondResp.json();

  assert.equal(secondResp.status, 409, `Expected 409, got ${secondResp.status}: ${JSON.stringify(secondPayload)}`);
  assert.equal(secondPayload.code, 'hero_active_session_conflict');
  assert.ok(secondPayload.activeSession, 'Conflict response must include activeSession');
  assert.equal(secondPayload.activeSession.taskId, task1.taskId,
    'Conflict response must reference the original active task');

  server.close();
});

// ── 6. All flags off → no Hero data ───────────────────────────────────

test('E2E P2: all hero flags off → GET read model returns 404', async () => {
  const server = createAllFlagsOffServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=learner-a`);
  const payload = await response.json();

  assert.equal(response.status, 404, `Expected 404, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_shadow_disabled');

  server.close();
});

// ── 7. Punctuation Hero launch ─────────────────────────────────────────

test('E2E P2: Punctuation Hero launch does not crash', async () => {
  const server = createP2Server();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTaskForSubject(readModelPayload, 'punctuation');

  if (!launchable) {
    // No punctuation task launchable from the fixture — skip gracefully
    server.close();
    return;
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-e2e-punctuation-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  // The main assertion: it must not crash. 200 or a typed 409/404 is acceptable.
  assert.ok(
    response.status === 200 || response.status === 409 || response.status === 404,
    `Punctuation launch must not crash: got ${response.status}: ${JSON.stringify(payload)}`,
  );

  if (response.status === 200) {
    assert.equal(payload.heroLaunch.subjectId, 'punctuation');
    assert.equal(payload.heroLaunch.childVisible, true);
  }

  server.close();
});
