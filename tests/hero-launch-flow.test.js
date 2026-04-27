import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

function createServer() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

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
        name: 'Flow Test Learner',
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

  // Seed spelling subject state so the Hero spelling provider produces
  // launchable envelopes. The provider reads stats.core — we need
  // total > 0 with due and trouble words to generate multiple tasks.
  const spellingData = {
    stats: {
      core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
      all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    },
  };
  const now = Date.now();
  server.DB.db.prepare(`
    INSERT INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(spellingData), now, accountId);

  return repos;
}

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
  return { questId: quest.questId, taskId: task.taskId, task };
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

// heroContext lives on the subject state (ui_json.session.heroContext) because
// the engine adds it after service.startSession returns. The practice_sessions
// snapshot is taken before that point, so we verify via child_subject_state.
function getSubjectSessionState(server, learnerId, subjectId) {
  const row = server.DB.db.prepare(
    `SELECT ui_json FROM child_subject_state
     WHERE learner_id = ? AND subject_id = ?`,
  ).get(learnerId, subjectId);
  if (!row) return null;
  const ui = JSON.parse(row.ui_json);
  return ui?.session || null;
}

// ── Full E2E launch flow ────────────────────────────────────────────

test('E2E launch: read model → pick launchable task → start-task → verify heroLaunch + subject response', async () => {
  const server = createServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found in read model — cannot exercise E2E flow');
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-flow-e2e-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);

  assert.ok(payload.heroLaunch, 'Response must include heroLaunch block');
  assert.equal(payload.heroLaunch.status, 'started');
  assert.equal(payload.heroLaunch.questId, launchable.questId);
  assert.equal(payload.heroLaunch.taskId, launchable.taskId);
  assert.equal(payload.heroLaunch.subjectCommand, 'start-session');
  assert.equal(typeof payload.heroLaunch.subjectId, 'string');

  assert.equal(payload.subjectId, payload.heroLaunch.subjectId);
  assert.equal(payload.command, 'start-session');
  assert.ok(payload.changed === true || payload.subjectReadModel != null,
    'Response must include subject read model data');

  server.close();
});

// ── Safety flags ────────────────────────────────────────────────────

test('E2E launch: heroLaunch safety flags are all false/disabled', async () => {
  const server = createServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify safety flags');
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-flow-safety-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.heroLaunch.coinsEnabled, false, 'coinsEnabled must be false');
  assert.equal(payload.heroLaunch.claimEnabled, false, 'claimEnabled must be false');
  assert.equal(payload.heroLaunch.childVisible, false, 'childVisible must be false');

  server.close();
});

// ── heroContext on active session ────────────────────────────────────

test('E2E launch: active session carries heroContext with matching questId and taskId', async () => {
  const server = createServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify heroContext on session');
  }

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-flow-ctx-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();
  assert.equal(response.status, 200);

  const subjectId = payload.heroLaunch.subjectId;
  const session = getSubjectSessionState(server, 'learner-a', subjectId);
  assert.ok(session, 'Subject state must contain an active session after Hero launch');
  assert.ok(session.heroContext, 'Active session state must carry heroContext');
  assert.equal(session.heroContext.questId, launchable.questId);
  assert.equal(session.heroContext.taskId, launchable.taskId);
  assert.equal(session.heroContext.source, 'hero-mode');
  assert.equal(session.heroContext.phase, 'p2-child-launch');

  server.close();
});

// ── Idempotent replay ───────────────────────────────────────────────
// The launch route recomputes the quest on every call (R5). After a
// successful launch the subject state changes, which shifts the quest
// hash and produces a new questId. A replay of the original questId
// therefore hits the hero_quest_stale guard before the repository-layer
// idempotency check is reached. This is the correct safety behaviour:
// stale quests are rejected rather than silently replayed.

test('E2E launch: replay with stale questId after state change → hero_quest_stale', async () => {
  const server = createServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  if (!launchable) {
    server.close();
    assert.fail('No launchable task found — cannot verify replay behaviour');
  }

  const revision = getLearnerRevision(server);
  const commandBody = {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-flow-idem-1',
    expectedLearnerRevision: revision,
  };

  const firstResp = await postHeroCommand(server, commandBody);
  const firstPayload = await firstResp.json();
  assert.equal(firstResp.status, 200);
  assert.equal(firstPayload.ok, true);

  const updatedRevision = getLearnerRevision(server);
  const replayResp = await postHeroCommand(server, {
    ...commandBody,
    expectedLearnerRevision: updatedRevision,
  });
  const replayPayload = await replayResp.json();

  assert.equal(replayResp.status, 409);
  assert.equal(replayPayload.code, 'hero_quest_stale',
    'Replay after state change must be rejected as stale quest');

  server.close();
});

// ── Idempotency violation (repository layer) ────────────────────────
// The mutation receipt layer rejects a second command that reuses the
// same requestId with a different payload hash. We verify this through
// two successive launches (each with a fresh quest read) that share
// the same requestId but resolve to different subject payloads.

test('E2E launch: same requestId with different task payloads → idempotency_reuse', async () => {
  const server = createServer();
  await seedLearnerWithSubjectState(server, 'adult-a', 'learner-a');

  const rm1 = await getReadModel(server);
  const launchable1 = findFirstLaunchableTask(rm1);
  if (!launchable1) {
    server.close();
    assert.fail('No launchable task found — cannot verify idempotency violation');
  }

  const rev1 = getLearnerRevision(server);
  const firstResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable1.questId,
    taskId: launchable1.taskId,
    requestId: 'hero-flow-idem-clash-1',
    expectedLearnerRevision: rev1,
  });
  assert.equal(firstResp.status, 200);

  // Re-read the model after the launch changed subject state.
  // The new quest has a different questId and potentially different tasks.
  const rm2 = await getReadModel(server);
  const launchable2 = findFirstLaunchableTask(rm2);
  if (!launchable2) {
    server.close();
    return;
  }

  const rev2 = getLearnerRevision(server);
  const clashResp = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable2.questId,
    taskId: launchable2.taskId,
    requestId: 'hero-flow-idem-clash-1',
    expectedLearnerRevision: rev2,
  });
  const clashPayload = await clashResp.json();

  assert.equal(clashResp.status, 409);
  assert.equal(clashPayload.code, 'idempotency_reuse',
    'Same requestId with different subject payload must be rejected');

  server.close();
});
