import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_P1_SCHEDULER_VERSION,
  HERO_LAUNCH_CONTRACT_VERSION,
  HERO_LAUNCH_STATUSES,
  isValidLaunchStatus,
} from '../shared/hero/constants.js';

import {
  deriveTaskId,
} from '../shared/hero/task-envelope.js';

import {
  buildHeroContext,
  validateHeroContext,
  sanitiseHeroContext,
} from '../shared/hero/launch-context.js';

import {
  determineLaunchStatus,
} from '../shared/hero/launch-status.js';

// ── Constants — P1 additions ──────────────────────────────────────

test('HERO_P1_SCHEDULER_VERSION is hero-p1-launch-v1', () => {
  assert.equal(HERO_P1_SCHEDULER_VERSION, 'hero-p1-launch-v1');
});

test('HERO_LAUNCH_CONTRACT_VERSION is 1', () => {
  assert.equal(HERO_LAUNCH_CONTRACT_VERSION, 1);
});

test('HERO_LAUNCH_STATUSES contains the five expected statuses', () => {
  assert.equal(HERO_LAUNCH_STATUSES.length, 5);
  assert.ok(HERO_LAUNCH_STATUSES.includes('launchable'));
  assert.ok(HERO_LAUNCH_STATUSES.includes('not-launchable'));
  assert.ok(HERO_LAUNCH_STATUSES.includes('subject-unavailable'));
  assert.ok(HERO_LAUNCH_STATUSES.includes('stale'));
  assert.ok(HERO_LAUNCH_STATUSES.includes('blocked'));
});

test('isValidLaunchStatus accepts known statuses', () => {
  for (const status of HERO_LAUNCH_STATUSES) {
    assert.ok(isValidLaunchStatus(status), `${status} must be valid`);
  }
});

test('isValidLaunchStatus rejects unknown statuses', () => {
  assert.equal(isValidLaunchStatus('ready'), false);
  assert.equal(isValidLaunchStatus(''), false);
  assert.equal(isValidLaunchStatus(null), false);
  assert.equal(isValidLaunchStatus(42), false);
});

// ── deriveTaskId — determinism ────────────────────────────────────

test('deriveTaskId: same inputs produce same taskId across calls', () => {
  const envelope = {
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: ['due', 'recent'],
  };
  const id1 = deriveTaskId('quest-abc', 0, envelope);
  const id2 = deriveTaskId('quest-abc', 0, envelope);
  assert.equal(id1, id2);
  assert.match(id1, /^hero-task-[0-9a-f]{8}$/);
});

test('deriveTaskId: different ordinal produces different taskId', () => {
  const envelope = {
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: ['due'],
  };
  const id0 = deriveTaskId('quest-abc', 0, envelope);
  const id1 = deriveTaskId('quest-abc', 1, envelope);
  assert.notEqual(id0, id1);
});

test('deriveTaskId: different launcher produces different taskId', () => {
  const base = {
    subjectId: 'spelling',
    intent: 'due-review',
    effortTarget: 6,
    reasonTags: ['due'],
  };
  const idA = deriveTaskId('quest-abc', 0, { ...base, launcher: 'smart-practice' });
  const idB = deriveTaskId('quest-abc', 0, { ...base, launcher: 'trouble-practice' });
  assert.notEqual(idA, idB);
});

test('deriveTaskId: deterministic regardless of reasonTag array order', () => {
  const envelopeA = {
    subjectId: 'grammar',
    intent: 'weak-repair',
    launcher: 'trouble-practice',
    effortTarget: 4,
    reasonTags: ['zebra', 'alpha', 'middle'],
  };
  const envelopeB = {
    ...envelopeA,
    reasonTags: ['middle', 'zebra', 'alpha'],
  };
  const envelopeC = {
    ...envelopeA,
    reasonTags: ['alpha', 'middle', 'zebra'],
  };
  const idA = deriveTaskId('q1', 2, envelopeA);
  const idB = deriveTaskId('q1', 2, envelopeB);
  const idC = deriveTaskId('q1', 2, envelopeC);
  assert.equal(idA, idB);
  assert.equal(idB, idC);
});

test('deriveTaskId: returns hero-task- prefix with 8-char hex', () => {
  const id = deriveTaskId('q1', 0, {
    subjectId: 'punctuation',
    intent: 'breadth-maintenance',
    launcher: 'gps-check',
    effortTarget: 3,
    reasonTags: [],
  });
  assert.match(id, /^hero-task-[0-9a-f]{8}$/);
});

test('deriveTaskId: handles missing envelope gracefully', () => {
  const id = deriveTaskId('q1', 0, null);
  assert.match(id, /^hero-task-[0-9a-f]{8}$/);
});

// ── buildHeroContext ──────────────────────────────────────────────

const FIXTURE_NOW = new Date('2026-04-27T14:00:00Z').getTime();

const FIXTURE_QUEST = {
  questId: 'hero-quest-daily-abc',
  dateKey: '2026-04-27',
  timezone: 'Europe/London',
};

const FIXTURE_TASK = {
  subjectId: 'spelling',
  intent: 'due-review',
  launcher: 'smart-practice',
  effortTarget: 6,
};

test('buildHeroContext produces valid context with all origin S10 fields', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });

  assert.equal(ctx.version, 1);
  assert.equal(ctx.source, 'hero-mode');
  assert.equal(ctx.phase, 'p1-launch');
  assert.equal(ctx.questId, 'hero-quest-daily-abc');
  assert.equal(ctx.taskId, 'hero-task-aabbccdd');
  assert.equal(ctx.dateKey, '2026-04-27');
  assert.equal(ctx.timezone, 'Europe/London');
  assert.equal(ctx.schedulerVersion, 'hero-p1-launch-v1');
  assert.equal(ctx.questFingerprint, null);
  assert.equal(ctx.subjectId, 'spelling');
  assert.equal(ctx.intent, 'due-review');
  assert.equal(ctx.launcher, 'smart-practice');
  assert.equal(ctx.effortTarget, 6);
  assert.equal(ctx.launchRequestId, 'req-001');
  assert.equal(ctx.launchedAt, '2026-04-27T14:00:00.000Z');
});

test('buildHeroContext: source is hero-mode and phase is p1-launch', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  assert.equal(ctx.source, 'hero-mode');
  assert.equal(ctx.phase, 'p1-launch');
});

test('buildHeroContext: questFingerprint is null in P1 but present as a named field', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  assert.ok(Object.hasOwn(ctx, 'questFingerprint'));
  assert.equal(ctx.questFingerprint, null);
});

test('buildHeroContext: defaults missing fields safely', () => {
  const ctx = buildHeroContext({});
  assert.equal(ctx.version, 1);
  assert.equal(ctx.source, 'hero-mode');
  assert.equal(ctx.questId, '');
  assert.equal(ctx.taskId, '');
  assert.equal(ctx.schedulerVersion, '');
  assert.equal(ctx.questFingerprint, null);
  assert.match(ctx.launchedAt, /^\d{4}-\d{2}-\d{2}T/);
});

// ── validateHeroContext ──────────────────────────────────────────

test('validateHeroContext accepts a valid context', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  const { valid, errors } = validateHeroContext(ctx);
  assert.equal(valid, true);
  assert.equal(errors.length, 0);
});

test('validateHeroContext rejects context missing version', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  delete ctx.version;
  const { valid, errors } = validateHeroContext(ctx);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('version')));
});

test('validateHeroContext rejects context missing questId', () => {
  const ctx = buildHeroContext({
    quest: {},
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  const { valid, errors } = validateHeroContext(ctx);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('questId')));
});

test('validateHeroContext rejects non-object input', () => {
  const { valid, errors } = validateHeroContext(null);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('plain object')));
});

test('validateHeroContext rejects context with wrong source', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  ctx.source = 'direct';
  const { valid, errors } = validateHeroContext(ctx);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('source')));
});

test('validateHeroContext rejects context missing launchRequestId', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  const { valid, errors } = validateHeroContext(ctx);
  assert.equal(valid, false);
  assert.ok(errors.some(e => e.includes('launchRequestId')));
});

// ── sanitiseHeroContext ──────────────────────────────────────────

test('sanitiseHeroContext retains only allowlisted fields', () => {
  const ctx = buildHeroContext({
    quest: FIXTURE_QUEST,
    task: FIXTURE_TASK,
    taskId: 'hero-task-aabbccdd',
    requestId: 'req-001',
    now: FIXTURE_NOW,
    schedulerVersion: HERO_P1_SCHEDULER_VERSION,
  });
  const sanitised = sanitiseHeroContext(ctx);
  const expectedKeys = [
    'version', 'source', 'phase', 'questId', 'taskId', 'dateKey',
    'timezone', 'schedulerVersion', 'questFingerprint', 'subjectId',
    'intent', 'launcher', 'effortTarget', 'launchRequestId', 'launchedAt',
  ];
  assert.deepEqual(Object.keys(sanitised).sort(), expectedKeys.sort());
});

test('sanitiseHeroContext strips Coin/reward/monster fields', () => {
  const raw = {
    version: 1,
    source: 'hero-mode',
    phase: 'p1-launch',
    questId: 'q1',
    taskId: 't1',
    coins: 50,
    reward: { type: 'monster-egg' },
    monsterId: 'mon-001',
    monsterLevel: 5,
    xp: 100,
  };
  const sanitised = sanitiseHeroContext(raw);
  assert.equal(sanitised.coins, undefined);
  assert.equal(sanitised.reward, undefined);
  assert.equal(sanitised.monsterId, undefined);
  assert.equal(sanitised.monsterLevel, undefined);
  assert.equal(sanitised.xp, undefined);
});

test('sanitiseHeroContext strips debugReason and adult-only diagnostics', () => {
  const raw = {
    version: 1,
    source: 'hero-mode',
    phase: 'p1-launch',
    questId: 'q1',
    taskId: 't1',
    debugReason: 'Spelling has overdue words with d>7.',
    adminNote: 'Override applied by parent.',
    diagnosticTrace: ['step-1', 'step-2'],
  };
  const sanitised = sanitiseHeroContext(raw);
  assert.equal(sanitised.debugReason, undefined);
  assert.equal(sanitised.adminNote, undefined);
  assert.equal(sanitised.diagnosticTrace, undefined);
});

test('sanitiseHeroContext handles non-object input', () => {
  const sanitised = sanitiseHeroContext(null);
  assert.deepEqual(sanitised, {});
});

// ── determineLaunchStatus ────────────────────────────────────────

const FIXTURE_REGISTRY = {
  spelling: {
    launchers: {
      'smart-practice': true,
      'trouble-practice': true,
      'guardian-check': true,
    },
  },
  grammar: {
    launchers: {
      'smart-practice': true,
      'trouble-practice': true,
    },
  },
  punctuation: {
    launchers: {
      'smart-practice': true,
      'trouble-practice': true,
      'gps-check': true,
    },
  },
};

test('determineLaunchStatus: launchable for known subject/launcher', () => {
  const result = determineLaunchStatus('spelling', 'smart-practice', FIXTURE_REGISTRY);
  assert.equal(result.launchable, true);
  assert.equal(result.status, 'launchable');
  assert.equal(result.reason, '');
});

test('determineLaunchStatus: launchable for grammar/trouble-practice', () => {
  const result = determineLaunchStatus('grammar', 'trouble-practice', FIXTURE_REGISTRY);
  assert.equal(result.launchable, true);
  assert.equal(result.status, 'launchable');
});

test('determineLaunchStatus: launchable for punctuation/gps-check', () => {
  const result = determineLaunchStatus('punctuation', 'gps-check', FIXTURE_REGISTRY);
  assert.equal(result.launchable, true);
  assert.equal(result.status, 'launchable');
});

test('determineLaunchStatus: not-launchable for unknown launcher on known subject', () => {
  const result = determineLaunchStatus('spelling', 'mini-test', FIXTURE_REGISTRY);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
  assert.ok(result.reason.includes('launcher not supported'));
});

test('determineLaunchStatus: subject-unavailable for unknown subject', () => {
  const result = determineLaunchStatus('arithmetic', 'smart-practice', FIXTURE_REGISTRY);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'subject-unavailable');
  assert.ok(result.reason.includes('no capability entry'));
});

test('determineLaunchStatus: not-launchable for empty subjectId', () => {
  const result = determineLaunchStatus('', 'smart-practice', FIXTURE_REGISTRY);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
});

test('determineLaunchStatus: not-launchable for empty launcher', () => {
  const result = determineLaunchStatus('spelling', '', FIXTURE_REGISTRY);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
});

test('determineLaunchStatus: handles null registry gracefully', () => {
  const result = determineLaunchStatus('spelling', 'smart-practice', null);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'subject-unavailable');
});

test('determineLaunchStatus: handles registry entry with missing launchers object', () => {
  const registry = { spelling: {} };
  const result = determineLaunchStatus('spelling', 'smart-practice', registry);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
});

test('determineLaunchStatus: launcher set to false is not-launchable', () => {
  const registry = {
    spelling: {
      launchers: { 'smart-practice': false },
    },
  };
  const result = determineLaunchStatus('spelling', 'smart-practice', registry);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
});

// ── FIX 7: hero_task_not_launchable route coverage via determineLaunchStatus ──

test('determineLaunchStatus: unsupported subject/launcher pair returns not-launchable (route coverage)', () => {
  // This covers the hero_task_not_launchable code path: when the quest has
  // a task whose subject/launcher pair produces launchStatus !== 'launchable',
  // resolveHeroStartTaskCommand throws a 409. This unit test verifies the
  // status determination that feeds that gate.
  const result = determineLaunchStatus('spelling', 'mini-test', FIXTURE_REGISTRY);
  assert.equal(result.launchable, false);
  assert.equal(result.status, 'not-launchable');
  assert.ok(result.reason.length > 0, 'reason must explain why not launchable');
});

// ── FIX 8: validateHeroContext rejects context missing taskId ────────

test('validateHeroContext rejects context missing taskId', () => {
  const ctx = { version: 1, source: 'hero-mode', questId: 'q1', launchRequestId: 'r1' };
  const result = validateHeroContext(ctx);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('taskId')));
});
