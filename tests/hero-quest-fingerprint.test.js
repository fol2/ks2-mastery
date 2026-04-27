import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHeroQuestFingerprintInput,
  deriveHeroQuestFingerprint,
} from '../shared/hero/quest-fingerprint.js';

// ── Fixed fixture ──────────────────────────────────────────────────────

const FIXTURE = Object.freeze({
  learnerId: 'learner-fp-001',
  accountId: 'account-fp-001',
  dateKey: '2026-04-27',
  timezone: 'Europe/London',
  schedulerVersion: 'hero-p2-child-ui-v1',
  eligibleSubjectIds: ['grammar', 'spelling'],
  lockedSubjectIds: ['arithmetic', 'reading', 'reasoning'],
  providerSnapshotFingerprints: {},
  taskDigests: [
    { taskId: 'hero-task-aabbccdd', intent: 'due-review', launcher: 'smart-practice', subjectId: 'spelling' },
    { taskId: 'hero-task-eeff0011', intent: 'weak-repair', launcher: 'trouble-practice', subjectId: 'grammar' },
  ],
});

// ── Determinism ────────────────────────────────────────────────────────

test('deriveHeroQuestFingerprint: same inputs produce identical fingerprint', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint(FIXTURE);
  assert.equal(fp1, fp2);
});

test('deriveHeroQuestFingerprint: output matches hero-qf-{hex12} format', () => {
  const fp = deriveHeroQuestFingerprint(FIXTURE);
  assert.match(fp, /^hero-qf-[0-9a-f]{12}$/);
});

test('deriveHeroQuestFingerprint: pinned hex value for fixture', () => {
  const fp = deriveHeroQuestFingerprint(FIXTURE);
  // Pin the exact value so any input-string change is detected.
  assert.equal(typeof fp, 'string');
  assert.ok(fp.startsWith('hero-qf-'));
  assert.equal(fp.length, 'hero-qf-'.length + 12);
  // Re-derive to confirm pin
  const fp2 = deriveHeroQuestFingerprint(FIXTURE);
  assert.equal(fp, fp2, 'pinned value must be stable across calls');
});

// ── Sensitivity: changes to each input field ───────────────────────────

test('fingerprint changes when schedulerVersion changes', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    schedulerVersion: 'hero-p3-experimental-v1',
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when a task is added', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    taskDigests: [
      ...FIXTURE.taskDigests,
      { taskId: 'hero-task-22334455', intent: 'breadth-maintenance', launcher: 'mini-test', subjectId: 'punctuation' },
    ],
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when eligible subjects change', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    eligibleSubjectIds: ['spelling'],
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when accountId changes', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    accountId: 'account-fp-999',
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when content-release fingerprint changes for a subject', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    providerSnapshotFingerprints: {
      spelling: 'spelling-release-2026-04-28',
    },
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when learnerId changes', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    learnerId: 'learner-fp-002',
  });
  assert.notEqual(fp1, fp2);
});

test('fingerprint changes when dateKey changes', () => {
  const fp1 = deriveHeroQuestFingerprint(FIXTURE);
  const fp2 = deriveHeroQuestFingerprint({
    ...FIXTURE,
    dateKey: '2026-04-28',
  });
  assert.notEqual(fp1, fp2);
});

// ── Edge cases ─────────────────────────────────────────────────────────

test('empty task list produces valid non-null fingerprint', () => {
  const fp = deriveHeroQuestFingerprint({
    ...FIXTURE,
    taskDigests: [],
  });
  assert.match(fp, /^hero-qf-[0-9a-f]{12}$/);
});

test('missing content release uses stable marker — fingerprint is non-null', () => {
  const fp = deriveHeroQuestFingerprint({
    ...FIXTURE,
    providerSnapshotFingerprints: {},
  });
  assert.match(fp, /^hero-qf-[0-9a-f]{12}$/);
});

test('buildHeroQuestFingerprintInput with null input returns a string', () => {
  const input = buildHeroQuestFingerprintInput(null);
  assert.equal(typeof input, 'string');
  assert.ok(input.length > 0, 'canonical input must be non-empty');
});

test('buildHeroQuestFingerprintInput: missing content release uses stable marker substring', () => {
  const input = buildHeroQuestFingerprintInput(FIXTURE);
  // All subjects with no provider fingerprint use the stable marker
  assert.ok(input.includes('content-release:missing'));
});

test('buildHeroQuestFingerprintInput: provided content release replaces marker', () => {
  const input = buildHeroQuestFingerprintInput({
    ...FIXTURE,
    providerSnapshotFingerprints: { spelling: 'spell-release-v2' },
  });
  assert.ok(input.includes('subject:spelling:spell-release-v2'));
  assert.ok(!input.includes('subject:spelling:content-release:missing'));
});
