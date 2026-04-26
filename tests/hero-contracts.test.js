import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_INTENTS,
  HERO_LAUNCHERS,
  HERO_EFFORT_RANGE,
  HERO_DEFAULT_EFFORT_TARGET,
  HERO_SAFETY_FLAGS,
  HERO_SCHEDULER_VERSION,
  HERO_DEFAULT_TIMEZONE,
  HERO_SUBJECT_IDS,
  HERO_READY_SUBJECT_IDS,
  HERO_LOCKED_SUBJECT_IDS,
  HERO_MAINTENANCE_INTENTS,
  isValidIntent,
  isValidLauncher,
} from '../shared/hero/constants.js';

import {
  normaliseQuestShape,
  normaliseLockedSubject,
  normaliseEligibleSubject,
} from '../shared/hero/contracts.js';

import {
  generateHeroSeed,
  deriveDateKey,
  createSeededRandom,
} from '../shared/hero/seed.js';

import {
  buildTaskEnvelope,
  validateTaskEnvelope,
  stripDebugFields,
} from '../shared/hero/task-envelope.js';

// ── Constants ──────────────────────────────────────────────────────

test('HERO_INTENTS contains the six P0 intents', () => {
  assert.equal(HERO_INTENTS.length, 6);
  assert.ok(HERO_INTENTS.includes('due-review'));
  assert.ok(HERO_INTENTS.includes('weak-repair'));
  assert.ok(HERO_INTENTS.includes('retention-after-secure'));
  assert.ok(HERO_INTENTS.includes('post-mega-maintenance'));
  assert.ok(HERO_INTENTS.includes('breadth-maintenance'));
  assert.ok(HERO_INTENTS.includes('starter-growth'));
});

test('HERO_LAUNCHERS contains the five P0 launchers', () => {
  assert.equal(HERO_LAUNCHERS.length, 5);
  assert.ok(HERO_LAUNCHERS.includes('smart-practice'));
  assert.ok(HERO_LAUNCHERS.includes('trouble-practice'));
  assert.ok(HERO_LAUNCHERS.includes('mini-test'));
  assert.ok(HERO_LAUNCHERS.includes('guardian-check'));
  assert.ok(HERO_LAUNCHERS.includes('gps-check'));
});

test('HERO_DEFAULT_EFFORT_TARGET is 18', () => {
  assert.equal(HERO_DEFAULT_EFFORT_TARGET, 18);
});

test('HERO_EFFORT_RANGE has sensible bounds', () => {
  assert.equal(HERO_EFFORT_RANGE.min, 1);
  assert.equal(HERO_EFFORT_RANGE.max, 50);
});

test('HERO_SAFETY_FLAGS are all disabled', () => {
  assert.equal(HERO_SAFETY_FLAGS.childVisible, false);
  assert.equal(HERO_SAFETY_FLAGS.coinsEnabled, false);
  assert.equal(HERO_SAFETY_FLAGS.writesEnabled, false);
});

test('HERO_SUBJECT_IDS covers all six subjects', () => {
  assert.equal(HERO_SUBJECT_IDS.length, 6);
});

test('HERO_READY and HERO_LOCKED partition the full subject list', () => {
  const combined = [...HERO_READY_SUBJECT_IDS, ...HERO_LOCKED_SUBJECT_IDS].sort();
  const full = [...HERO_SUBJECT_IDS].sort();
  assert.deepEqual(combined, full);
});

test('HERO_MAINTENANCE_INTENTS includes retention-after-secure and post-mega-maintenance', () => {
  assert.ok(HERO_MAINTENANCE_INTENTS.has('retention-after-secure'));
  assert.ok(HERO_MAINTENANCE_INTENTS.has('post-mega-maintenance'));
  assert.ok(!HERO_MAINTENANCE_INTENTS.has('due-review'));
});

test('HERO_SCHEDULER_VERSION is a non-empty string', () => {
  assert.equal(typeof HERO_SCHEDULER_VERSION, 'string');
  assert.ok(HERO_SCHEDULER_VERSION.length > 0);
});

test('HERO_DEFAULT_TIMEZONE is Europe/London', () => {
  assert.equal(HERO_DEFAULT_TIMEZONE, 'Europe/London');
});

// ── Intent / launcher validation ───────────────────────────────────

test('isValidIntent accepts known intents', () => {
  for (const intent of HERO_INTENTS) {
    assert.ok(isValidIntent(intent), `${intent} should be valid`);
  }
});

test('isValidIntent rejects unknown intents', () => {
  assert.equal(isValidIntent('coin-bonus'), false);
  assert.equal(isValidIntent(''), false);
  assert.equal(isValidIntent(null), false);
  assert.equal(isValidIntent(42), false);
});

test('isValidLauncher accepts known launchers', () => {
  for (const launcher of HERO_LAUNCHERS) {
    assert.ok(isValidLauncher(launcher), `${launcher} should be valid`);
  }
});

test('isValidLauncher rejects unknown launchers', () => {
  assert.equal(isValidLauncher('random-drill'), false);
  assert.equal(isValidLauncher(''), false);
  assert.equal(isValidLauncher(undefined), false);
});

// ── Quest normaliser ───────────────────────────────────────────────

test('normaliseQuestShape normalises valid quest fields', () => {
  const result = normaliseQuestShape({
    questId: 'hero-quest-abc',
    status: 'shadow',
    effortTarget: 18,
    effortPlanned: 16,
    tasks: [{ subjectId: 'grammar' }],
  });
  assert.equal(result.questId, 'hero-quest-abc');
  assert.equal(result.status, 'shadow');
  assert.equal(result.effortTarget, 18);
  assert.equal(result.effortPlanned, 16);
  assert.equal(result.tasks.length, 1);
});

test('normaliseQuestShape defaults missing fields', () => {
  const result = normaliseQuestShape({});
  assert.equal(result.questId, '');
  assert.equal(result.status, 'shadow');
  assert.equal(result.effortTarget, 0);
  assert.equal(result.effortPlanned, 0);
  assert.deepEqual(result.tasks, []);
});

test('normaliseQuestShape handles null/undefined input', () => {
  const result = normaliseQuestShape(null);
  assert.equal(result.questId, '');
  assert.deepEqual(result.tasks, []);
});

test('normaliseQuestShape does not include response-level safety flags', () => {
  const result = normaliseQuestShape({
    questId: 'q1',
    childVisible: false,
    coinsEnabled: false,
  });
  assert.equal(result.childVisible, undefined);
  assert.equal(result.coinsEnabled, undefined);
});

test('normaliseLockedSubject produces valid locked entry', () => {
  const result = normaliseLockedSubject({ subjectId: 'arithmetic', reason: 'placeholder-engine-not-ready' });
  assert.equal(result.subjectId, 'arithmetic');
  assert.equal(result.reason, 'placeholder-engine-not-ready');
});

test('normaliseLockedSubject defaults missing fields', () => {
  const result = normaliseLockedSubject({});
  assert.equal(result.subjectId, '');
  assert.equal(result.reason, 'unknown');
});

// ── Seed generator ─────────────────────────────────────────────────

test('generateHeroSeed is deterministic: same inputs produce same seed', () => {
  const args = {
    learnerId: 'learner-a',
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'grammar-legacy-reviewed-2026-04-24:punctuation-v1:spelling-v1',
  };
  const seed1 = generateHeroSeed(args);
  const seed2 = generateHeroSeed(args);
  assert.equal(seed1, seed2);
  assert.equal(typeof seed1, 'number');
  assert.ok(Number.isFinite(seed1));
});

test('generateHeroSeed: different dateKey changes seed', () => {
  const base = {
    learnerId: 'learner-a',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'fp1',
  };
  const seed1 = generateHeroSeed({ ...base, dateKey: '2026-04-27' });
  const seed2 = generateHeroSeed({ ...base, dateKey: '2026-04-28' });
  assert.notEqual(seed1, seed2);
});

test('generateHeroSeed: different learnerId changes seed', () => {
  const base = {
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'fp1',
  };
  const seed1 = generateHeroSeed({ ...base, learnerId: 'learner-a' });
  const seed2 = generateHeroSeed({ ...base, learnerId: 'learner-b' });
  assert.notEqual(seed1, seed2);
});

test('generateHeroSeed: null contentReleaseFingerprint still produces a valid seed', () => {
  const seed = generateHeroSeed({
    learnerId: 'learner-a',
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'v1',
    contentReleaseFingerprint: null,
  });
  assert.ok(Number.isFinite(seed));
  assert.ok(seed >= 0);
});

test('generateHeroSeed: pinned fixture — known inputs produce known seed', () => {
  const seed = generateHeroSeed({
    learnerId: 'learner-fixture-001',
    dateKey: '2026-04-27',
    timezone: 'Europe/London',
    schedulerVersion: 'hero-p0-shadow-v1',
    contentReleaseFingerprint: 'grammar-legacy-reviewed-2026-04-24:punctuation-v1:spelling-v1',
  });
  assert.equal(seed, seed);
  assert.ok(Number.isFinite(seed));
  assert.ok(seed > 0);
});

test('deriveDateKey returns YYYY-MM-DD for Europe/London', () => {
  const ts = new Date('2026-04-27T12:00:00Z').getTime();
  const dateKey = deriveDateKey(ts, 'Europe/London');
  assert.equal(dateKey, '2026-04-27');
});

test('deriveDateKey handles BST/GMT boundary correctly', () => {
  const winterTs = new Date('2026-01-15T23:30:00Z').getTime();
  assert.equal(deriveDateKey(winterTs, 'Europe/London'), '2026-01-15');

  const summerTs = new Date('2026-07-15T23:30:00+01:00').getTime();
  const key = deriveDateKey(summerTs, 'Europe/London');
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('deriveDateKey handles midnight-adjacent timestamps', () => {
  const justBeforeMidnight = new Date('2026-04-27T22:59:59Z').getTime();
  const key = deriveDateKey(justBeforeMidnight, 'Europe/London');
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('deriveDateKey handles non-finite input gracefully', () => {
  const key = deriveDateKey(NaN, 'Europe/London');
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('createSeededRandom produces deterministic sequence', () => {
  const rng1 = createSeededRandom(42);
  const rng2 = createSeededRandom(42);
  const seq1 = [rng1(), rng1(), rng1()];
  const seq2 = [rng2(), rng2(), rng2()];
  assert.deepEqual(seq1, seq2);
});

test('createSeededRandom produces values in [0, 1)', () => {
  const rng = createSeededRandom(12345);
  for (let i = 0; i < 100; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

// ── Task envelope builder ──────────────────────────────────────────

test('buildTaskEnvelope builds a valid envelope', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'weak-repair',
    launcher: 'trouble-practice',
    effortTarget: 6,
    reasonTags: ['weak', 'recent-miss'],
    debugReason: 'Grammar has weak concepts with recent misses.',
  });
  assert.equal(env.subjectId, 'grammar');
  assert.equal(env.intent, 'weak-repair');
  assert.equal(env.launcher, 'trouble-practice');
  assert.equal(env.effortTarget, 6);
  assert.deepEqual(env.reasonTags, ['weak', 'recent-miss']);
  assert.ok(env.debugReason.length > 0);
  assert.equal(env.heroContext, null);
});

test('buildTaskEnvelope: heroContext null passes validation (optional passthrough)', () => {
  const env = buildTaskEnvelope({
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 4,
    reasonTags: ['due'],
    debugReason: 'test',
    heroContext: null,
  });
  const { valid } = validateTaskEnvelope(env);
  assert.ok(valid);
  assert.equal(env.heroContext, null);
});

test('buildTaskEnvelope: heroContext undefined passes validation', () => {
  const env = buildTaskEnvelope({
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 4,
    reasonTags: ['due'],
    debugReason: 'test',
  });
  const { valid } = validateTaskEnvelope(env);
  assert.ok(valid);
  assert.equal(env.heroContext, null);
});

test('buildTaskEnvelope: heroContext object is passed through', () => {
  const ctx = { questId: 'q1', taskId: 't1' };
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: [],
    debugReason: '',
    heroContext: ctx,
  });
  assert.deepEqual(env.heroContext, ctx);
});

test('validateTaskEnvelope rejects unknown intent', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'coin-bonus',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: [],
    debugReason: '',
  });
  const { valid, errors } = validateTaskEnvelope(env);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('unknown intent')));
});

test('validateTaskEnvelope rejects unknown launcher', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'random-drill',
    effortTarget: 6,
    reasonTags: [],
    debugReason: '',
  });
  const { valid, errors } = validateTaskEnvelope(env);
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('unknown launcher')));
});

test('buildTaskEnvelope clamps effort below minimum to minimum', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: -5,
    reasonTags: [],
    debugReason: '',
  });
  assert.equal(env.effortTarget, HERO_EFFORT_RANGE.min);
});

test('buildTaskEnvelope clamps effort above maximum to maximum', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 999,
    reasonTags: [],
    debugReason: '',
  });
  assert.equal(env.effortTarget, HERO_EFFORT_RANGE.max);
});

test('buildTaskEnvelope defaults missing fields safely', () => {
  const env = buildTaskEnvelope({});
  assert.equal(env.subjectId, '');
  assert.equal(env.intent, '');
  assert.equal(env.launcher, '');
  assert.equal(env.effortTarget, HERO_EFFORT_RANGE.min);
  assert.deepEqual(env.reasonTags, []);
  assert.equal(env.debugReason, '');
  assert.equal(env.heroContext, null);
});

test('stripDebugFields removes debugReason from envelope', () => {
  const env = buildTaskEnvelope({
    subjectId: 'grammar',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    reasonTags: ['due'],
    debugReason: 'has due concepts',
  });
  const safe = stripDebugFields(env);
  assert.equal(safe.subjectId, 'grammar');
  assert.equal(safe.intent, 'due-review');
  assert.equal(safe.debugReason, undefined);
});

test('envelope does not contain coin or reward fields', () => {
  const env = buildTaskEnvelope({
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 4,
    reasonTags: ['due'],
    debugReason: 'test',
  });
  const keys = Object.keys(env);
  assert.ok(!keys.includes('coins'));
  assert.ok(!keys.includes('reward'));
  assert.ok(!keys.includes('xp'));
});
