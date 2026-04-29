import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMixedTransferCalibration } from '../scripts/grammar-qg-mixed-transfer-calibration.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    templateId: 'tpl-mixed-01',
    conceptId: 'concept-main',
    timestamp: '2026-04-20T10:00:00Z',
    correct: true,
    firstAttemptIndependent: true,
    supportUsed: false,
    wasRetry: false,
    tags: ['mixed-transfer'],
    mode: 'mixed',
    conceptStatusBefore: 'secured',
    allConceptStatusesBefore: { 'concept-main': 'secured', 'concept-secondary': 'secured' },
    conceptIds: ['concept-main', 'concept-secondary'],
    ...overrides,
  };
}

function generateEvents(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({ timestamp: `2026-04-${String(20 + (i % 9)).padStart(2, '0')}T10:00:00Z`, ...overrides }),
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('template with 85% success + prerequisites met → weight strong', () => {
  const events = [
    ...generateEvents(17, { correct: true, firstAttemptIndependent: true }),
    ...generateEvents(3, { correct: false, firstAttemptIndependent: true }),
  ];

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });
  const tpl = report.templates['tpl-mixed-01'];

  assert.ok(tpl);
  assert.equal(tpl.attemptCount, 20);
  assert.equal(tpl.successRate, 0.85);
  assert.equal(tpl.localPrerequisitesMetRate, 1.0);
  assert.equal(tpl.suggestedEvidenceWeight, 'strong');
  assert.equal(tpl.recommendation, 'strengthen');
});

test('template with 40% success + prerequisites not met → weight none', () => {
  const events = [
    ...generateEvents(8, {
      correct: true,
      firstAttemptIndependent: true,
      allConceptStatusesBefore: { 'concept-main': 'emerging', 'concept-secondary': 'weak' },
    }),
    ...generateEvents(12, {
      correct: false,
      firstAttemptIndependent: true,
      allConceptStatusesBefore: { 'concept-main': 'emerging', 'concept-secondary': 'weak' },
    }),
  ];

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });
  const tpl = report.templates['tpl-mixed-01'];

  assert.ok(tpl);
  assert.equal(tpl.successRate, 0.4);
  assert.equal(tpl.localPrerequisitesMetRate, 0);
  assert.equal(tpl.suggestedEvidenceWeight, 'none');
  assert.equal(tpl.recommendation, 'reduce');
});

test('no mastery-write imports in the module', () => {
  const source = readFileSync(
    path.join(ROOT_DIR, 'scripts', 'grammar-qg-mixed-transfer-calibration.mjs'),
    'utf-8',
  );

  // Must not import mastery-write, reward, Star, or scoring functions
  assert.ok(!source.includes('mastery-write'), 'must not import mastery-write');
  assert.ok(!source.includes('writeReward'), 'must not import writeReward');
  assert.ok(!source.includes('writeStar'), 'must not import writeStar');
  assert.ok(!source.includes('updateMastery'), 'must not import updateMastery');
  assert.ok(!source.includes('submitScore'), 'must not import submitScore');
});

test('output includes recommendation field for all templates', () => {
  const events = [
    ...generateEvents(10, { templateId: 'tpl-a', correct: true }),
    ...generateEvents(10, { templateId: 'tpl-b', correct: false }),
  ];

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });

  for (const [tid, metrics] of Object.entries(report.templates)) {
    assert.ok('recommendation' in metrics, `${tid} missing recommendation`);
    assert.ok(
      ['keep', 'reduce', 'strengthen', 'insufficient_data'].includes(metrics.recommendation),
      `${tid} has invalid recommendation: ${metrics.recommendation}`,
    );
  }
});

test('insufficient samples yields insufficient_data weight', () => {
  const events = generateEvents(3, { correct: true });

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });
  const tpl = report.templates['tpl-mixed-01'];

  assert.ok(tpl);
  assert.equal(tpl.suggestedEvidenceWeight, 'insufficient_data');
  assert.equal(tpl.recommendation, 'insufficient_data');
});

test('concept propagation count reflects unique concepts', () => {
  const events = generateEvents(10, {
    conceptId: 'concept-main',
    conceptIds: ['concept-main', 'concept-secondary', 'concept-tertiary'],
  });

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });
  const tpl = report.templates['tpl-mixed-01'];

  assert.equal(tpl.conceptPropagationCount, 3);
});

test('normal weight when success between 50-80%', () => {
  const events = [
    ...generateEvents(13, { correct: true, firstAttemptIndependent: true }),
    ...generateEvents(7, { correct: false, firstAttemptIndependent: true }),
  ];

  const report = buildMixedTransferCalibration(events, { minSamples: 5 });
  const tpl = report.templates['tpl-mixed-01'];

  assert.equal(tpl.successRate, 0.65);
  assert.equal(tpl.suggestedEvidenceWeight, 'normal');
  assert.equal(tpl.recommendation, 'keep');
});
