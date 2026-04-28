// Hero Mode P2 U2 — Active Hero session detection and launch conflict hardening.
//
// Tests cover:
// - Active session detection in the read model (GET path)
// - Quest fingerprint validation on launch (POST path)
// - Same-taskId re-launch → safe already-started response
// - Different-taskId conflict → 409 hero_active_session_conflict
// - Non-Hero active session conflict → 409 subject_active_session_conflict
// - childVisible dynamic flag on heroLaunch
// - heroContext.phase is p2-child-launch
// - Expanded readHeroSubjectReadModels returns data+ui; providers still work

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const HERO_COMMAND_URL = 'https://repo.test/api/hero/command';
const HERO_READ_MODEL_URL = 'https://repo.test/api/hero/read-model';

// ── Helpers ──────────────────────────────────────────────────────────────

function createServer(envOverrides = {}) {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
      ...envOverrides,
    },
  });
}

function createServerP1Compat() {
  return createWorkerRepositoryServer({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'false',
      PUNCTUATION_SUBJECT_ENABLED: 'true',
    },
  });
}

const HERO_SPELLING_DATA = {
  stats: {
    core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
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
        name: 'Active Session Test Learner',
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

  server.DB.db.prepare(`
    INSERT OR REPLACE INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'spelling', '{}', ?, ?, ?)
  `).run(learnerId, JSON.stringify(HERO_SPELLING_DATA), Date.now(), accountId);

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
  return { questId: quest.questId, taskId: task.taskId, task, questFingerprint: heroPayload.hero.questFingerprint };
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

function seedHeroSession(server, learnerId, subjectId, heroContext) {
  const uiJson = JSON.stringify({
    session: {
      id: `session-${subjectId}-hero`,
      startedAt: new Date().toISOString(),
      mode: 'smart',
      heroContext,
    },
  });
  server.DB.db.prepare(`
    UPDATE child_subject_state
    SET ui_json = ?
    WHERE learner_id = ? AND subject_id = ?
  `).run(uiJson, learnerId, subjectId);
}

function seedNonHeroSession(server, learnerId, subjectId) {
  const uiJson = JSON.stringify({
    session: {
      id: `session-${subjectId}-normal`,
      startedAt: new Date().toISOString(),
      mode: 'smart',
    },
  });
  server.DB.db.prepare(`
    UPDATE child_subject_state
    SET ui_json = ?
    WHERE learner_id = ? AND subject_id = ?
  `).run(uiJson, learnerId, subjectId);
}

function makeSubjectReadModel(subjectId) {
  if (subjectId === 'spelling') {
    return {
      stats: {
        core: { total: 20, secure: 10, due: 5, fresh: 3, trouble: 2, attempts: 100 },
      },
    };
  }
  if (subjectId === 'grammar') {
    return {
      stats: {
        concepts: { total: 15, new: 2, learning: 3, weak: 2, due: 4, secured: 4 },
      },
    };
  }
  if (subjectId === 'punctuation') {
    return {
      availability: { status: 'ready' },
      stats: { total: 12, secure: 4, due: 3, fresh: 2, weak: 2, attempts: 60, correct: 45, accuracy: 75 },
    };
  }
  return {};
}

// ── Read model: active session detection ─────────────────────────────

test('No active session → activeHeroSession is null in read model', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const payload = await getReadModel(server);
  assert.equal(payload.hero.activeHeroSession, null);

  server.close();
});

test('Active Spelling Hero session detected → correct fields populated', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const heroContext = {
    source: 'hero-mode',
    questId: 'hero-quest-abc',
    questFingerprint: 'hero-qf-000000000001',
    taskId: 'hero-task-00000001',
    intent: 'due-review',
    launcher: 'smart-practice',
    phase: 'p2-child-launch',
  };
  seedHeroSession(server, 'learner-a', 'spelling', heroContext);

  const payload = await getReadModel(server);
  const active = payload.hero.activeHeroSession;
  assert.ok(active, 'activeHeroSession must be populated');
  assert.equal(active.subjectId, 'spelling');
  assert.equal(active.questId, 'hero-quest-abc');
  assert.equal(active.questFingerprint, 'hero-qf-000000000001');
  assert.equal(active.taskId, 'hero-task-00000001');
  assert.equal(active.intent, 'due-review');
  assert.equal(active.launcher, 'smart-practice');
  assert.equal(active.status, 'in-progress');

  server.close();
});

test('Active Grammar Hero session detected → correct fields', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  // Need grammar state seeded
  const grammarData = {
    stats: {
      concepts: { total: 15, new: 2, learning: 3, weak: 2, due: 4, secured: 4 },
    },
  };
  server.DB.db.prepare(`
    INSERT OR REPLACE INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'grammar', '{}', ?, ?, ?)
  `).run('learner-a', JSON.stringify(grammarData), Date.now(), 'adult-a');

  const heroContext = {
    source: 'hero-mode',
    questId: 'hero-quest-def',
    questFingerprint: 'hero-qf-000000000002',
    taskId: 'hero-task-00000002',
    intent: 'weak-repair',
    launcher: 'gps-check',
    phase: 'p2-child-launch',
  };
  seedHeroSession(server, 'learner-a', 'grammar', heroContext);

  const payload = await getReadModel(server);
  const active = payload.hero.activeHeroSession;
  assert.ok(active, 'activeHeroSession must be populated');
  assert.equal(active.subjectId, 'grammar');
  assert.equal(active.taskId, 'hero-task-00000002');
  assert.equal(active.intent, 'weak-repair');

  server.close();
});

test('Active Punctuation Hero session detected → correct fields', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  // Need punctuation state seeded
  const punctuationData = {
    availability: { status: 'ready' },
    stats: { total: 12, secure: 4, due: 3, fresh: 2, weak: 2, attempts: 60, correct: 45, accuracy: 75 },
  };
  server.DB.db.prepare(`
    INSERT OR REPLACE INTO child_subject_state (learner_id, subject_id, ui_json, data_json, updated_at, updated_by_account_id)
    VALUES (?, 'punctuation', '{}', ?, ?, ?)
  `).run('learner-a', JSON.stringify(punctuationData), Date.now(), 'adult-a');

  const heroContext = {
    source: 'hero-mode',
    questId: 'hero-quest-ghi',
    questFingerprint: 'hero-qf-000000000003',
    taskId: 'hero-task-00000003',
    intent: 'breadth-maintenance',
    launcher: 'mini-test',
    phase: 'p2-child-launch',
  };
  seedHeroSession(server, 'learner-a', 'punctuation', heroContext);

  const payload = await getReadModel(server);
  const active = payload.hero.activeHeroSession;
  assert.ok(active, 'activeHeroSession must be populated');
  assert.equal(active.subjectId, 'punctuation');
  assert.equal(active.taskId, 'hero-task-00000003');
  assert.equal(active.intent, 'breadth-maintenance');

  server.close();
});

test('Session with heroContext.source !== hero-mode → not treated as Hero session', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const heroContext = {
    source: 'something-else',
    questId: 'hero-quest-xyz',
    taskId: 'hero-task-xyz',
    intent: 'due-review',
    launcher: 'smart-practice',
  };
  seedHeroSession(server, 'learner-a', 'spelling', heroContext);

  const payload = await getReadModel(server);
  assert.equal(payload.hero.activeHeroSession, null,
    'heroContext with source !== hero-mode must not be detected as active Hero session');

  server.close();
});

// ── POST: same taskId with active session → safe response ────────────

test('POST same taskId with active session → safe already-started response (not error)', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  // First, get the read model to find valid quest/task IDs
  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  // Seed an active Hero session that matches the first launchable task
  const heroContext = {
    source: 'hero-mode',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    intent: launchable.task.intent || 'due-review',
    launcher: launchable.task.launcher || 'smart-practice',
    phase: 'p2-child-launch',
  };
  seedHeroSession(server, 'learner-a', 'spelling', heroContext);

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-active-same-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);
  assert.ok(payload.heroLaunch, 'Response must include heroLaunch block');
  assert.equal(payload.heroLaunch.status, 'already-started');
  assert.ok(payload.heroLaunch.activeSession, 'already-started response must include activeSession');
  assert.equal(payload.heroLaunch.activeSession.subjectId, 'spelling');
  assert.equal(payload.heroLaunch.activeSession.taskId, launchable.taskId);

  server.close();
});

// ── POST: different Hero taskId with active session → 409 ────────────

test('POST different Hero taskId with active session → 409 hero_active_session_conflict', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  // Seed an active Hero session with a DIFFERENT taskId
  const heroContext = {
    source: 'hero-mode',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: 'hero-task-different',
    intent: 'due-review',
    launcher: 'smart-practice',
    phase: 'p2-child-launch',
  };
  seedHeroSession(server, 'learner-a', 'spelling', heroContext);

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-active-diff-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_active_session_conflict');
  assert.ok(payload.activeSession, 'Conflict response must include activeSession');
  assert.equal(payload.activeSession.subjectId, 'spelling');
  assert.equal(payload.activeSession.taskId, 'hero-task-different');

  server.close();
});

// ── POST: questFingerprint mismatch in child-visible mode → 409 ──────

test('POST with correct questId but mismatched questFingerprint in child-visible mode → 409', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: 'hero-qf-wrong-fingerp',
    taskId: launchable.taskId,
    requestId: 'hero-fp-mismatch-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_quest_fingerprint_mismatch');

  server.close();
});

// ── POST: null questFingerprint in child-visible mode → 400 ──────────

test('POST with null questFingerprint in child-visible mode → 400', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: null,
    taskId: launchable.taskId,
    requestId: 'hero-fp-null-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 400, `Expected 400, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'hero_quest_fingerprint_required');

  server.close();
});

// ── POST: null questFingerprint when child UI flag off → proceeds ─────

test('POST with null questFingerprint when child UI flag off → proceeds normally', async () => {
  const server = createServerP1Compat();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-fp-compat-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.ok, true);
  assert.ok(payload.heroLaunch, 'Response must include heroLaunch block');
  assert.equal(payload.heroLaunch.status, 'started');

  server.close();
});

// ── POST: all three flags enabled → heroLaunch.childVisible === true ──

test('POST with all three flags enabled → heroLaunch.childVisible === true', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-child-vis-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroLaunch.childVisible, true, 'childVisible must be true when all flags enabled');

  server.close();
});

// ── POST: child UI flag off → heroLaunch.childVisible === false ───────

test('POST with child UI flag off → heroLaunch.childVisible === false', async () => {
  const server = createServerP1Compat();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    taskId: launchable.taskId,
    requestId: 'hero-child-vis-off-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.heroLaunch.childVisible, false, 'childVisible must be false when child UI flag off');

  server.close();
});

// ── heroContext.phase is p2-child-launch on successful launch ────────

test('heroContext.phase is p2-child-launch on successful launch', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-phase-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();
  assert.equal(response.status, 200, `Expected 200, got ${response.status}: ${JSON.stringify(payload)}`);

  const subjectId = payload.heroLaunch.subjectId;
  const row = server.DB.db.prepare(
    `SELECT ui_json FROM child_subject_state WHERE learner_id = ? AND subject_id = ?`,
  ).get('learner-a', subjectId);
  assert.ok(row, 'child_subject_state must have ui_json after launch');
  const ui = JSON.parse(row.ui_json);
  assert.ok(ui?.session?.heroContext, 'Session must carry heroContext');
  assert.equal(ui.session.heroContext.phase, 'p2-child-launch');

  server.close();
});

// ── Expanded readHeroSubjectReadModels: providers still receive correct data shape ──

test('Expanded readHeroSubjectReadModels returns data+ui — providers still receive correct data shape', () => {
  // Simulate the P2 expanded shape: { data, ui }
  const subjectReadModels = {};
  for (const id of ['spelling', 'grammar', 'punctuation']) {
    subjectReadModels[id] = {
      data: makeSubjectReadModel(id),
      ui: { session: null },
    };
  }

  const result = buildHeroShadowReadModel({
    learnerId: 'learner-provider-compat',
    accountId: 'account-provider-compat',
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });

  // Should produce a valid v3 read model with tasks
  assert.equal(result.version, 3);
  assert.ok(result.dailyQuest.tasks.length > 0, 'Providers must produce tasks from { data, ui } shape');
  assert.equal(result.activeHeroSession, null);

  // Compare with raw data shape (P0 compat) to ensure identical task generation
  const rawSubjectReadModels = {};
  for (const id of ['spelling', 'grammar', 'punctuation']) {
    rawSubjectReadModels[id] = makeSubjectReadModel(id);
  }
  const rawResult = buildHeroShadowReadModel({
    learnerId: 'learner-provider-compat',
    accountId: 'account-provider-compat',
    subjectReadModels: rawSubjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });

  assert.equal(result.dailyQuest.tasks.length, rawResult.dailyQuest.tasks.length,
    'Task count must be identical between { data, ui } and raw data shapes');
  assert.equal(result.questFingerprint, rawResult.questFingerprint,
    'Quest fingerprint must be identical between { data, ui } and raw data shapes');
});

// ── Active Hero session detection via buildHeroShadowReadModel directly ──

test('buildHeroShadowReadModel detects active Hero session from ui field', () => {
  const subjectReadModels = {
    spelling: {
      data: makeSubjectReadModel('spelling'),
      ui: {
        session: {
          id: 'session-spelling-hero',
          startedAt: '2026-04-27T10:00:00.000Z',
          mode: 'smart',
          heroContext: {
            source: 'hero-mode',
            questId: 'hero-quest-unit',
            questFingerprint: 'hero-qf-unit0000001',
            taskId: 'hero-task-unit0001',
            intent: 'due-review',
            launcher: 'smart-practice',
          },
        },
      },
    },
    grammar: {
      data: makeSubjectReadModel('grammar'),
      ui: null,
    },
    punctuation: {
      data: makeSubjectReadModel('punctuation'),
      ui: null,
    },
  };

  const result = buildHeroShadowReadModel({
    learnerId: 'learner-detect-test',
    accountId: 'account-detect-test',
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });

  assert.ok(result.activeHeroSession, 'activeHeroSession must be populated');
  assert.equal(result.activeHeroSession.subjectId, 'spelling');
  assert.equal(result.activeHeroSession.questId, 'hero-quest-unit');
  assert.equal(result.activeHeroSession.taskId, 'hero-task-unit0001');
  assert.equal(result.activeHeroSession.intent, 'due-review');
  assert.equal(result.activeHeroSession.launcher, 'smart-practice');
  assert.equal(result.activeHeroSession.status, 'in-progress');
});

test('buildHeroShadowReadModel ignores non-hero-mode source in session heroContext', () => {
  const subjectReadModels = {
    spelling: {
      data: makeSubjectReadModel('spelling'),
      ui: {
        session: {
          id: 'session-spelling-other',
          startedAt: '2026-04-27T10:00:00.000Z',
          mode: 'smart',
          heroContext: {
            source: 'not-hero-mode',
            questId: 'quest-other',
            taskId: 'task-other',
          },
        },
      },
    },
  };

  const result = buildHeroShadowReadModel({
    learnerId: 'learner-ignore-test',
    accountId: 'account-ignore-test',
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });

  assert.equal(result.activeHeroSession, null);
});

// ── POST: non-Hero active session → 409 subject_active_session_conflict ──

test('POST with non-Hero active session → 409 subject_active_session_conflict', async () => {
  const server = createServer();
  await seedLearner(server, 'adult-a', 'learner-a');

  const readModelPayload = await getReadModel(server);
  const launchable = findFirstLaunchableTask(readModelPayload);
  assert.ok(launchable, 'Fixture must produce at least one launchable task');

  // Seed a non-Hero active session on spelling
  seedNonHeroSession(server, 'learner-a', 'spelling');

  const revision = getLearnerRevision(server);
  const response = await postHeroCommand(server, {
    command: 'start-task',
    learnerId: 'learner-a',
    questId: launchable.questId,
    questFingerprint: launchable.questFingerprint,
    taskId: launchable.taskId,
    requestId: 'hero-non-hero-conflict-1',
    expectedLearnerRevision: revision,
  });
  const payload = await response.json();

  assert.equal(response.status, 409, `Expected 409, got ${response.status}: ${JSON.stringify(payload)}`);
  assert.equal(payload.code, 'subject_active_session_conflict');
  assert.ok(payload.activeSession, 'Conflict must include activeSession');
  assert.equal(payload.activeSession.subjectId, 'spelling');

  server.close();
});
