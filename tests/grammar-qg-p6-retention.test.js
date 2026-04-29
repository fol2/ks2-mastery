import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRetentionReport } from '../scripts/grammar-qg-retention-monitor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    templateId: 'tpl-ret-01',
    conceptId: 'concept-nouns',
    timestamp: '2026-04-20T10:00:00Z',
    correct: true,
    firstAttemptIndependent: true,
    supportUsed: false,
    conceptStatusBefore: 'secured',
    tags: [],
    mode: 'local',
    ...overrides,
  };
}

function generateEvents(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({ timestamp: `2026-04-${String(20 + (i % 9)).padStart(2, '0')}T10:00:00Z`, ...overrides }),
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('concept with 5/5 passes → retentionRate 1.0, lapsed false', () => {
  const events = generateEvents(5, { correct: true, conceptStatusBefore: 'secured' });

  const report = buildRetentionReport(events, { minSamples: 3 });
  const concept = report.concepts['concept-nouns'];

  assert.ok(concept);
  assert.equal(concept.retainedPassRate, 1.0);
  assert.equal(concept.lapseRate, 0);
  assert.equal(concept.lapsed, false);
  assert.equal(concept.classification, 'retained');
});

test('concept with 1/4 passes → retentionRate 0.25, lapsed true', () => {
  const events = [
    makeEvent({ correct: true, timestamp: '2026-04-20T10:00:00Z' }),
    makeEvent({ correct: false, timestamp: '2026-04-21T10:00:00Z' }),
    makeEvent({ correct: false, timestamp: '2026-04-22T10:00:00Z' }),
    makeEvent({ correct: false, timestamp: '2026-04-23T10:00:00Z' }),
  ];

  const report = buildRetentionReport(events, { minSamples: 3 });
  const concept = report.concepts['concept-nouns'];

  assert.ok(concept);
  assert.equal(concept.retainedPassRate, 0.25);
  assert.equal(concept.lapseRate, 0.75);
  assert.equal(concept.lapsed, true);
  assert.equal(concept.classification, 'retention_risk');
});

test('concept with 0 post-secure attempts → insufficient_data', () => {
  // Only 2 events — below minSamples=3
  const events = generateEvents(2, { correct: true, conceptStatusBefore: 'secured' });

  const report = buildRetentionReport(events, { minSamples: 3 });
  const concept = report.concepts['concept-nouns'];

  assert.ok(concept);
  assert.equal(concept.classification, 'insufficient_data');
  assert.equal(concept.securedAttemptCount, 2);
});

test('no mastery-write imports in module', () => {
  const source = readFileSync(
    path.join(ROOT_DIR, 'scripts', 'grammar-qg-retention-monitor.mjs'),
    'utf-8',
  );

  assert.ok(!source.includes('mastery-write'), 'must not import mastery-write');
  assert.ok(!source.includes('writeReward'), 'must not import writeReward');
  assert.ok(!source.includes('writeStar'), 'must not import writeStar');
  assert.ok(!source.includes('updateMastery'), 'must not import updateMastery');
  assert.ok(!source.includes('submitScore'), 'must not import submitScore');
});

test('daysFromSecureToFirstLapse computed correctly', () => {
  const events = [
    makeEvent({ correct: true, timestamp: '2026-04-10T10:00:00Z' }),
    makeEvent({ correct: true, timestamp: '2026-04-15T10:00:00Z' }),
    makeEvent({ correct: false, timestamp: '2026-04-20T10:00:00Z' }),
    makeEvent({ correct: true, timestamp: '2026-04-22T10:00:00Z' }),
  ];

  const report = buildRetentionReport(events, { minSamples: 3 });
  const concept = report.concepts['concept-nouns'];

  assert.ok(concept);
  // First secured event: April 10, first lapse: April 20 → 10 days
  assert.equal(concept.daysFromSecureToFirstLapse, 10);
  assert.equal(concept.lapsed, true);
});

test('mixed review protection rates computed', () => {
  const events = [
    makeEvent({ correct: true, mode: 'mixed-review', tags: ['mixed-review'] }),
    makeEvent({ correct: true, mode: 'mixed-review', tags: ['mixed-review'] }),
    makeEvent({ correct: false, mode: 'mixed-review', tags: ['mixed-review'] }),
    makeEvent({ correct: true, mode: 'local' }),
    makeEvent({ correct: false, mode: 'local' }),
  ];

  const report = buildRetentionReport(events, { minSamples: 3 });
  const concept = report.concepts['concept-nouns'];

  assert.ok(concept);
  // Mixed: 2/3 correct, Local: 1/2 correct
  const mixedRate = concept.mixedReviewProtection.mixedRetentionRate;
  const localRate = concept.mixedReviewProtection.localRetentionRate;
  assert.ok(Math.abs(mixedRate - 2 / 3) < 0.001);
  assert.equal(localRate, 0.5);
});

test('events without secured status are not counted', () => {
  const events = [
    ...generateEvents(5, { conceptStatusBefore: 'emerging', conceptId: 'concept-emerging' }),
    ...generateEvents(5, { conceptStatusBefore: 'weak', conceptId: 'concept-weak' }),
    ...generateEvents(5, { conceptStatusBefore: 'secured', conceptId: 'concept-secured', correct: true }),
  ];

  const report = buildRetentionReport(events, { minSamples: 3 });

  // Only secured concept appears
  assert.ok(report.concepts['concept-secured']);
  assert.ok(!report.concepts['concept-emerging']);
  assert.ok(!report.concepts['concept-weak']);
});

test('meta summary counts are correct', () => {
  const events = [
    ...generateEvents(5, { conceptId: 'c-retained', correct: true }),
    ...generateEvents(4, { conceptId: 'c-risk', correct: false }),
    ...generateEvents(2, { conceptId: 'c-insufficient', correct: true }),
  ];

  const report = buildRetentionReport(events, { minSamples: 3 });

  assert.equal(report.meta.totalConceptsAnalysed, 3);
  assert.equal(report.meta.retained, 1);
  assert.equal(report.meta.retentionRisk, 1);
  assert.equal(report.meta.insufficientData, 1);
});
