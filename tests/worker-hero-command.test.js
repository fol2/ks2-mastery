import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

function createServerWithFlags({ shadow = true, launch = true, punctuation = true } = {}) {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: shadow ? 'true' : 'false',
      HERO_MODE_LAUNCH_ENABLED: launch ? 'true' : 'false',
      PUNCTUATION_SUBJECT_ENABLED: punctuation ? 'true' : 'false',
    },
  });
}

// Minimal spelling data shape that produces at least one Hero task envelope
// (due > 0 triggers "due-review" / "smart-practice" from the spelling provider).
const HERO_SPELLING_DATA = {
  stats: {
    core: { total: 20, secure: 14, due: 3, fresh: 2, trouble: 1, attempts: 80, correct: 60, accuracy: 75 },
    all:  { total: 20, secure: 14, due: 3, fresh: 2, trouble: 1, attempts: 80, correct: 60, accuracy: 75 },
  },
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
        name: 'Hero Test Learner',
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

  // Seed spelling subject state so the Hero scheduler generates tasks.
  server.DB.db.prepare(`
    INSERT OR REPLACE INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at)
    VALUES (?, 'spelling', '{}', ?, ?)
  `).run(learnerId, JSON.stringify(HERO_SPELLING_DATA), Date.now());

  return repos;
}

async function postHeroCommand(server, body, accountId = 'adult-a') {
  return server.fetchAs(accountId, HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getFirstLaunchableTask(server, learnerId = 'learner-a') {
  const response = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=${learnerId}`);
  const payload = await response.json();
  if (response.status !== 200 || !payload.hero) return null;
  const quest = payload.hero.dailyQuest;
  if (!quest || !quest.tasks) return null;
  const task = quest.tasks.find((t) => t.launchStatus === 'launchable');
  if (!task) return null;
  return {
    questId: quest.questId,
    taskId: task.taskId,
    task,
  };
}

function getLearnerRevision(server, accountId = 'adult-a') {
  const learnerMembership = server.DB.db.prepare(
    `SELECT lp.state_revision FROM learner_profiles lp
     JOIN account_learner_memberships alm ON alm.learner_id = lp.id
     WHERE alm.account_id = ?`,
  ).get(accountId);
  return learnerMembership?.state_revision ?? 0;
}

// ── Happy path ────────────────────────────────────────────────────────

test('hero command: happy path — both flags on, valid request returns 200 with heroLaunch', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const launchable = await getFirstLaunchableTask(server);
  assert.ok(launchable, 'No launchable task found — test infrastructure broken');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-cmd-1',
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
  assert.equal(typeof payload.heroLaunch.intent, 'string');
  assert.equal(typeof payload.heroLaunch.launcher, 'string');
  assert.equal(payload.subjectId, payload.heroLaunch.subjectId);
  assert.equal(payload.command, 'start-session');

  server.close();
});

test('hero command: heroLaunch safety flags are all false', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const launchable = await getFirstLaunchableTask(server);
  assert.ok(launchable, 'No launchable task found — test infrastructure broken');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-cmd-2',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.heroLaunch.coinsEnabled, false);
  assert.equal(payload.heroLaunch.claimEnabled, false);
  assert.equal(payload.heroLaunch.childVisible, false);

  server.close();
});

// ── Error path: flags ──────────────────────────────────────────────────

test('hero command: launch flag off returns 404 hero_launch_disabled', async () => {
  const server = createServerWithFlags({ shadow: true, launch: false });
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, 'hero_launch_disabled');

  server.close();
});

test('hero command: launch on but shadow off returns 409 hero_launch_misconfigured', async () => {
  const server = createServerWithFlags({ shadow: false, launch: true });
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.code, 'hero_launch_misconfigured');

  server.close();
});

// ── Error path: auth ───────────────────────────────────────────────────

test('hero command: unauthenticated request returns 401', async () => {
  const server = createServerWithFlags();

  const response = await server.fetchRaw(HERO_COMMAND_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'start-task' }),
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, 'unauthenticated');

  server.close();
});

// ── Error path: missing fields ─────────────────────────────────────────

test('hero command: missing command returns 400 hero_command_required', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_command_required');

  server.close();
});

test('hero command: unsupported command returns 400 hero_command_unsupported', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'claim-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_command_unsupported');

  server.close();
});

test('hero command: missing learnerId is rejected by learner access gate (403)', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  // The requireLearnerReadAccess gate fires before the resolver, so an
  // empty learnerId hits 403 (access denied) rather than the resolver's
  // 400 hero_learner_id_required. The resolver validation is a
  // defence-in-depth layer for direct calls outside the route.
  assert.equal(response.status, 403);

  server.close();
});

test('hero command: missing questId returns 400 hero_quest_id_required', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_quest_id_required');

  server.close();
});

test('hero command: missing taskId returns 400 hero_task_id_required', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_task_id_required');

  server.close();
});

test('hero command: missing requestId returns 400 command_request_id_required', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'command_request_id_required');

  server.close();
});

test('hero command: missing expectedLearnerRevision returns 400 command_revision_required', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'command_revision_required');

  server.close();
});

// ── Error path: stale quest ────────────────────────────────────────────

test('hero command: wrong questId returns 409 hero_quest_stale', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'hero-quest-nonexistent',
    taskId: 'hero-task-00000000',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.code, 'hero_quest_stale');

  server.close();
});

// ── Error path: task not found ─────────────────────────────────────────

test('hero command: wrong taskId returns 404 hero_task_not_found', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelResponse = await server.fetch(`${HERO_READ_MODEL_URL}?learnerId=learner-a`);
  const readModelPayload = await readModelResponse.json();
  const questId = readModelPayload.hero?.dailyQuest?.questId;

  if (!questId) {
    server.close();
    return;
  }

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId,
    taskId: 'hero-task-nonexistent',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
  });
  const payload = await response.json();

  assert.equal(response.status, 404);
  assert.equal(payload.code, 'hero_task_not_found');

  server.close();
});

// ── Error path: client-supplied subjectId or payload ───────────────────

test('hero command: client-supplied subjectId is rejected', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
    subjectId: 'spelling',
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_client_field_rejected');
  assert.equal(payload.field, 'subjectId');

  server.close();
});

test('hero command: client-supplied payload is rejected', async () => {
  const server = createServerWithFlags();
  await seedLearner(server, 'adult-a', 'learner-a');

  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: 'q-1',
    taskId: 't-1',
    requestId: 'cmd-1',
    expectedLearnerRevision: 0,
    payload: { mode: 'smart' },
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, 'hero_client_field_rejected');
  assert.equal(payload.field, 'payload');

  server.close();
});
