import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';

// ── Helpers ──────────────────────────────────────────────────────────────

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

function buildReadModelWithSubjects(subjectIds, env) {
  const subjectReadModels = {};
  for (const id of subjectIds) {
    subjectReadModels[id] = makeSubjectReadModel(id);
  }
  return buildHeroShadowReadModel({
    learnerId: 'learner-test',
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env,
  });
}

// ── Happy path: task IDs ─────────────────────────────────────────────────

test('every task has a taskId string matching /^hero-task-[0-9a-f]{8}$/', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  const tasks = result.dailyQuest.tasks;

  assert.ok(tasks.length > 0, 'quest must have at least one task');
  for (const task of tasks) {
    assert.match(task.taskId, /^hero-task-[0-9a-f]{8}$/);
  }
});

test('every task has a launchStatus string field', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  for (const task of result.dailyQuest.tasks) {
    assert.equal(typeof task.launchStatus, 'string');
    assert.ok(task.launchStatus.length > 0);
  }
});

test('launchable tasks have launchStatus: launchable', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  const launchable = result.dailyQuest.tasks.filter(
    (t) => t.launchStatus === 'launchable',
  );
  assert.ok(launchable.length > 0, 'at least one task should be launchable');
  for (const task of launchable) {
    assert.equal(task.launchStatus, 'launchable');
    assert.equal(task.launchStatusReason, null);
  }
});

// ── Happy path: heroContext per task ─────────────────────────────────────

test('every task has a heroContext object with required fields', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  const requiredFields = [
    'version', 'questId', 'taskId', 'dateKey',
    'subjectId', 'intent', 'source', 'phase',
  ];
  for (const task of result.dailyQuest.tasks) {
    assert.equal(typeof task.heroContext, 'object');
    assert.ok(task.heroContext !== null);
    for (const field of requiredFields) {
      assert.ok(
        field in task.heroContext,
        `heroContext must have field: ${field}`,
      );
    }
    assert.equal(task.heroContext.source, 'hero-mode');
    assert.equal(task.heroContext.phase, 'p1-launch');
    assert.equal(task.heroContext.version, 1);
    assert.equal(task.heroContext.questId, result.dailyQuest.questId);
    assert.equal(task.heroContext.taskId, task.taskId);
    assert.equal(task.heroContext.subjectId, task.subjectId);
    assert.equal(task.heroContext.questFingerprint, null);
  }
});

// ── Happy path: response version ─────────────────────────────────────────

test('response version is 2', () => {
  const result = buildReadModelWithSubjects(['spelling']);
  assert.equal(result.version, 2);
});

// ── Happy path: launch capability block ──────────────────────────────────

test('launch block present with correct structure', () => {
  const result = buildReadModelWithSubjects(
    ['spelling'],
    { HERO_MODE_LAUNCH_ENABLED: 'true' },
  );
  assert.equal(typeof result.launch, 'object');
  assert.equal(result.launch.enabled, true);
  assert.equal(result.launch.commandRoute, '/api/hero/command');
  assert.equal(result.launch.command, 'start-task');
  assert.equal(result.launch.claimEnabled, false);
  assert.equal(result.launch.heroStatePersistenceEnabled, false);
});

// ── Happy path: all P0 fields preserved ──────────────────────────────────

test('all P0 fields still present', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  assert.equal(result.mode, 'shadow');
  assert.equal(result.childVisible, false);
  assert.equal(result.coinsEnabled, false);
  assert.equal(result.writesEnabled, false);
  assert.ok(Array.isArray(result.eligibleSubjects));
  assert.ok(Array.isArray(result.lockedSubjects));
  assert.equal(typeof result.dailyQuest, 'object');
  assert.equal(typeof result.debug, 'object');
  assert.equal(typeof result.dateKey, 'string');
  assert.equal(result.timezone, 'Europe/London');
  assert.equal(result.schedulerVersion, 'hero-p1-launch-v1');
});

// ── Edge case: launch flag off ───────────────────────────────────────────

test('launch.enabled is false when no env provided', () => {
  const result = buildReadModelWithSubjects(['spelling']);
  assert.equal(result.launch.enabled, false);
});

test('launch.enabled is false when env has no HERO_MODE_LAUNCH_ENABLED', () => {
  const result = buildReadModelWithSubjects(['spelling'], {});
  assert.equal(result.launch.enabled, false);
});

test('launch.enabled is false when flag is "false"', () => {
  const result = buildReadModelWithSubjects(
    ['spelling'],
    { HERO_MODE_LAUNCH_ENABLED: 'false' },
  );
  assert.equal(result.launch.enabled, false);
});

// ── Edge case: zero eligible subjects ────────────────────────────────────

test('zero eligible subjects produces safe empty quest with no taskIds', () => {
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-empty',
    subjectReadModels: {},
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
  });
  assert.equal(result.dailyQuest.tasks.length, 0);
  assert.equal(result.dailyQuest.effortPlanned, 0);
  assert.equal(typeof result.dailyQuest.questId, 'string');
  assert.ok(result.dailyQuest.questId.startsWith('hero-quest-'));
  assert.equal(result.version, 2);
  assert.equal(typeof result.launch, 'object');
});

// ── Edge case: not-launchable tasks appear with explicit reason ──────────

test('not-launchable tasks still appear in quest with explicit reason', () => {
  const result = buildReadModelWithSubjects(['spelling', 'grammar', 'punctuation']);
  const notLaunchable = result.dailyQuest.tasks.filter(
    (t) => t.launchStatus !== 'launchable',
  );
  for (const task of notLaunchable) {
    assert.equal(typeof task.launchStatus, 'string');
    assert.ok(task.launchStatus.length > 0);
    assert.equal(typeof task.launchStatusReason, 'string');
    assert.ok(task.launchStatusReason.length > 0);
    assert.match(task.taskId, /^hero-task-[0-9a-f]{8}$/);
  }
});

// ── Determinism: same inputs produce same taskIds ────────────────────────

test('same inputs produce same taskIds on consecutive calls', () => {
  const args = {
    learnerId: 'learner-determinism',
    subjectReadModels: {
      spelling: makeSubjectReadModel('spelling'),
      grammar: makeSubjectReadModel('grammar'),
    },
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
  };

  const result1 = buildHeroShadowReadModel(args);
  const result2 = buildHeroShadowReadModel(args);

  assert.equal(result1.dailyQuest.questId, result2.dailyQuest.questId);
  assert.equal(
    result1.dailyQuest.tasks.length,
    result2.dailyQuest.tasks.length,
  );
  for (let i = 0; i < result1.dailyQuest.tasks.length; i++) {
    assert.equal(
      result1.dailyQuest.tasks[i].taskId,
      result2.dailyQuest.tasks[i].taskId,
    );
  }
});
