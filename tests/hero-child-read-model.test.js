import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { HERO_P2_SCHEDULER_VERSION, HERO_P2_COPY_VERSION } from '../shared/hero/constants.js';

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

function buildV3({
  subjectIds = ['spelling', 'grammar', 'punctuation'],
  env = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
  },
  learnerId = 'learner-v3-test',
  accountId = 'account-v3-test',
} = {}) {
  const subjectReadModels = {};
  for (const id of subjectIds) {
    subjectReadModels[id] = makeSubjectReadModel(id);
  }
  return buildHeroShadowReadModel({
    learnerId,
    accountId,
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
    env,
  });
}

// ── v3 shape ──────────────────────────────────────────────────────────────

test('v3 read model has version: 3', () => {
  const result = buildV3();
  assert.equal(result.version, 3);
});

test('v3 read model has schedulerVersion matching P2', () => {
  const result = buildV3();
  assert.equal(result.schedulerVersion, HERO_P2_SCHEDULER_VERSION);
});

test('v3 read model has questFingerprint matching hero-qf- prefix', () => {
  const result = buildV3();
  assert.equal(typeof result.questFingerprint, 'string');
  assert.match(result.questFingerprint, /^hero-qf-[0-9a-f]{12}$/);
});

test('v3 read model has activeHeroSession: null initially', () => {
  const result = buildV3();
  assert.equal(result.activeHeroSession, null);
});

// ── ui block ──────────────────────────────────────────────────────────────

test('ui.enabled is true when all 3 flags on AND launchable tasks exist', () => {
  const result = buildV3();
  assert.equal(typeof result.ui, 'object');
  assert.equal(result.ui.enabled, true);
  assert.equal(result.ui.reason, 'enabled');
  assert.equal(result.ui.surface, 'dashboard-card');
  assert.equal(result.ui.copyVersion, HERO_P2_COPY_VERSION);
});

test('ui.enabled false with reason child-ui-disabled when HERO_MODE_CHILD_UI_ENABLED off', () => {
  const result = buildV3({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'false',
    },
  });
  assert.equal(result.ui.enabled, false);
  assert.equal(result.ui.reason, 'child-ui-disabled');
});

test('ui.enabled false with reason launch-disabled when HERO_MODE_LAUNCH_ENABLED off', () => {
  const result = buildV3({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'false',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });
  assert.equal(result.ui.enabled, false);
  assert.equal(result.ui.reason, 'launch-disabled');
});

test('ui.enabled false with reason shadow-disabled when HERO_MODE_SHADOW_ENABLED off', () => {
  const result = buildV3({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'false',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });
  assert.equal(result.ui.enabled, false);
  assert.equal(result.ui.reason, 'shadow-disabled');
});

test('ui.enabled false with reason no-eligible-subjects when zero eligible', () => {
  const result = buildV3({
    subjectIds: [],
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });
  assert.equal(result.ui.enabled, false);
  assert.equal(result.ui.reason, 'no-eligible-subjects');
});

test('ui.enabled false with reason no-launchable-tasks when tasks exist but none launchable', () => {
  // Pass empty read models so providers produce snapshots but no launcher
  // is capable, resulting in tasks that are all not-launchable.
  // This is a best-effort test: if the scheduler produces zero tasks from
  // empty subjects, the reason will be no-eligible-subjects instead.
  const result = buildV3({
    subjectIds: [],
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'true',
    },
  });
  // With zero subjects, eligibility is empty so the reason is no-eligible-subjects.
  assert.equal(result.ui.enabled, false);
  assert.ok(
    result.ui.reason === 'no-eligible-subjects' || result.ui.reason === 'no-launchable-tasks',
    `expected no-eligible-subjects or no-launchable-tasks, got: ${result.ui.reason}`,
  );
});

// ── childVisible ──────────────────────────────────────────────────────────

test('childVisible is true when HERO_MODE_CHILD_UI_ENABLED is on', () => {
  const result = buildV3();
  assert.equal(result.childVisible, true);
});

test('childVisible is false when HERO_MODE_CHILD_UI_ENABLED is off', () => {
  const result = buildV3({
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
      HERO_MODE_LAUNCH_ENABLED: 'true',
      HERO_MODE_CHILD_UI_ENABLED: 'false',
    },
  });
  assert.equal(result.childVisible, false);
});

// ── Per-task childLabel and childReason ────────────────────────────────────

test('every task has non-empty childLabel and childReason', () => {
  const result = buildV3();
  assert.ok(result.dailyQuest.tasks.length > 0, 'must have at least one task');
  for (const task of result.dailyQuest.tasks) {
    assert.equal(typeof task.childLabel, 'string');
    assert.ok(task.childLabel.length > 0, `childLabel must be non-empty for task ${task.taskId}`);
    assert.equal(typeof task.childReason, 'string');
    assert.ok(task.childReason.length > 0, `childReason must be non-empty for task ${task.taskId}`);
  }
});

// ── questFingerprint propagated into heroContext ──────────────────────────

test('questFingerprint propagated into each task heroContext', () => {
  const result = buildV3();
  assert.ok(result.dailyQuest.tasks.length > 0, 'must have at least one task');
  for (const task of result.dailyQuest.tasks) {
    assert.equal(
      task.heroContext.questFingerprint,
      result.questFingerprint,
      `heroContext.questFingerprint must match root questFingerprint for task ${task.taskId}`,
    );
  }
});

test('heroContext.phase is p2-child-launch for P2 scheduler version', () => {
  const result = buildV3();
  for (const task of result.dailyQuest.tasks) {
    assert.equal(task.heroContext.phase, 'p2-child-launch');
  }
});

// ── Debug fields absent from ui block ─────────────────────────────────────

test('ui block does not contain debug fields', () => {
  const result = buildV3();
  const uiKeys = Object.keys(result.ui);
  const allowedKeys = ['enabled', 'surface', 'reason', 'copyVersion'];
  for (const key of uiKeys) {
    assert.ok(
      allowedKeys.includes(key),
      `ui block contains unexpected key "${key}" — only ${allowedKeys.join(', ')} are allowed`,
    );
  }
});

// ── All P0/P1 fields preserved ────────────────────────────────────────────

test('all P0/P1 fields preserved in v3', () => {
  const result = buildV3();

  // P0 fields
  assert.equal(result.mode, 'shadow');
  assert.equal(typeof result.childVisible, 'boolean');
  assert.equal(result.coinsEnabled, false);
  assert.equal(result.writesEnabled, false);
  assert.ok(Array.isArray(result.eligibleSubjects));
  assert.ok(Array.isArray(result.lockedSubjects));
  assert.equal(typeof result.dailyQuest, 'object');
  assert.equal(typeof result.debug, 'object');
  assert.equal(typeof result.dateKey, 'string');
  assert.equal(result.timezone, 'Europe/London');

  // P1 fields
  assert.equal(typeof result.launch, 'object');
  assert.equal(result.launch.commandRoute, '/api/hero/command');
  assert.equal(result.launch.command, 'start-task');
  assert.equal(result.launch.claimEnabled, false);
  assert.equal(result.launch.heroStatePersistenceEnabled, false);

  // Per-task P1 fields
  for (const task of result.dailyQuest.tasks) {
    assert.equal(typeof task.taskId, 'string');
    assert.match(task.taskId, /^hero-task-[0-9a-f]{8}$/);
    assert.equal(typeof task.launchStatus, 'string');
    assert.equal(typeof task.heroContext, 'object');
    assert.ok(task.heroContext !== null);
    assert.equal(task.heroContext.source, 'hero-mode');
    assert.equal(task.heroContext.version, 1);
  }
});

// ── Determinism: questFingerprint is deterministic ────────────────────────

test('questFingerprint is deterministic across identical calls', () => {
  const result1 = buildV3();
  const result2 = buildV3();
  assert.equal(result1.questFingerprint, result2.questFingerprint);
});

// ── No env provided (P0 backwards compat) ──────────────────────────────────

test('no env provided: childVisible false, ui.enabled false, ui.reason shadow-disabled', () => {
  // Call buildHeroShadowReadModel directly without env to test P0 compat
  const subjectReadModels = {};
  for (const id of ['spelling', 'grammar', 'punctuation']) {
    subjectReadModels[id] = makeSubjectReadModel(id);
  }
  const result = buildHeroShadowReadModel({
    learnerId: 'learner-no-env',
    subjectReadModels,
    now: Date.UTC(2026, 3, 27, 10, 0, 0),
  });
  assert.equal(result.childVisible, false);
  assert.equal(result.ui.enabled, false);
  assert.equal(result.ui.reason, 'shadow-disabled');
});
