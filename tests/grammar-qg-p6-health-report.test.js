import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTemplateHealthReport } from '../scripts/grammar-qg-health-report.mjs';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeEvent(overrides = {}) {
  return {
    templateId: 'tpl-adj-01',
    conceptId: 'concept-adjectives',
    timestamp: '2026-04-20T10:00:00Z',
    correct: true,
    firstAttemptIndependent: true,
    supportUsed: false,
    wasRetry: false,
    elapsedMs: 3000,
    score: 1,
    maxScore: 1,
    tags: [],
    mode: 'local',
    questionType: 'select',
    conceptStatusBefore: 'emerging',
    ...overrides,
  };
}

function generateEvents(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({ timestamp: `2026-04-${String(20 + (i % 9)).padStart(2, '0')}T10:00:00Z`, ...overrides }),
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('50 events with 90% independent success → healthy classification', () => {
  const events = [
    ...generateEvents(45, { correct: true, firstAttemptIndependent: true }),
    ...generateEvents(5, { correct: false, firstAttemptIndependent: true }),
  ];

  const report = buildTemplateHealthReport(events, { minSamples: 10 });
  const tpl = report.templates['tpl-adj-01'];

  assert.ok(tpl);
  assert.equal(tpl.attemptCount, 50);
  assert.equal(tpl.independentFirstAttemptSuccessRate, 0.9);
  assert.equal(tpl.classification, 'healthy');
  assert.equal(tpl.confidence, 'medium');
});

test('support_dependent when supported success high, independent success below 0.5', () => {
  // For support_dependent: supportedSuccess > 0.8 && independentSuccess < 0.5
  // Need independent >= 0.4 (to avoid too_hard) but < 0.5
  // Independent: 22/50 = 0.44, Supported: 43/50 = 0.86
  const mixedEvents = [
    ...generateEvents(22, {
      templateId: 'tpl-mixed-dep',
      conceptId: 'concept-mixed',
      correct: true,
      firstAttemptIndependent: true,
    }),
    ...generateEvents(28, {
      templateId: 'tpl-mixed-dep',
      conceptId: 'concept-mixed',
      correct: false,
      firstAttemptIndependent: true,
    }),
    ...generateEvents(43, {
      templateId: 'tpl-mixed-dep',
      conceptId: 'concept-mixed',
      correct: true,
      firstAttemptIndependent: false,
      supportUsed: true,
    }),
    ...generateEvents(7, {
      templateId: 'tpl-mixed-dep',
      conceptId: 'concept-mixed',
      correct: false,
      firstAttemptIndependent: false,
      supportUsed: true,
    }),
  ];

  const report = buildTemplateHealthReport(mixedEvents, { minSamples: 10 });
  const tpl = report.templates['tpl-mixed-dep'];

  assert.ok(tpl);
  // Independent: 22/50 = 0.44 (>= 0.4 avoids too_hard, < 0.5 for support_dep)
  // Supported: 43/50 = 0.86 (> 0.8)
  assert.equal(tpl.independentFirstAttemptSuccessRate, 0.44);
  assert.equal(tpl.classification, 'support_dependent');
});

test('5 events → insufficient_data', () => {
  const events = generateEvents(5);
  const report = buildTemplateHealthReport(events, { minSamples: 10 });
  const tpl = report.templates['tpl-adj-01'];

  assert.ok(tpl);
  assert.equal(tpl.attemptCount, 5);
  assert.equal(tpl.classification, 'insufficient_data');
  assert.equal(tpl.confidence, 'insufficient');
});

test('window filtering excludes old events', () => {
  const oldEvents = generateEvents(20, {
    timestamp: '2025-01-01T10:00:00Z',
    correct: true,
    firstAttemptIndependent: true,
  });
  const recentEvents = generateEvents(20, {
    timestamp: new Date().toISOString(),
    correct: true,
    firstAttemptIndependent: true,
  });

  const report = buildTemplateHealthReport([...oldEvents, ...recentEvents], { window: 7, minSamples: 10 });
  const tpl = report.templates['tpl-adj-01'];

  assert.ok(tpl);
  assert.equal(tpl.attemptCount, 20);
});

test('malformed event (missing field) skipped, not crashed', () => {
  const validEvents = generateEvents(15, { correct: true, firstAttemptIndependent: true });
  const malformed = [
    { conceptId: 'concept-adjectives' }, // missing templateId and timestamp
    null,
    { templateId: 'tpl-x', timestamp: '2026-04-20T10:00:00Z' }, // missing conceptId
    42,
  ];

  const report = buildTemplateHealthReport([...validEvents, ...malformed], { minSamples: 10 });

  assert.equal(report.meta.skippedMalformed, 4);
  assert.equal(report.meta.validEvents, 15);
  assert.ok(report.templates['tpl-adj-01']);
});

test('concept metrics aggregate correctly', () => {
  const events = [
    ...generateEvents(10, { conceptId: 'c1', correct: true, mode: 'local', tags: [] }),
    ...generateEvents(5, { conceptId: 'c1', correct: true, tags: ['mixed-transfer'], mode: 'mixed' }),
    ...generateEvents(5, { conceptId: 'c1', correct: false, tags: ['mixed-transfer'], mode: 'mixed' }),
    ...generateEvents(3, { conceptId: 'c1', correct: true, questionType: 'explain' }),
    ...generateEvents(2, { conceptId: 'c1', correct: true, mode: 'surgery' }),
    ...generateEvents(4, { conceptId: 'c1', correct: true, conceptStatusBefore: 'secured' }),
    ...generateEvents(1, { conceptId: 'c1', correct: false, conceptStatusBefore: 'secured' }),
  ];

  const report = buildTemplateHealthReport(events, { minSamples: 10 });
  const concept = report.concepts['c1'];

  assert.ok(concept);
  // Local includes the 10 explicit local + 5 secured (default mode='local', not mixed/explain/surgery)
  assert.ok(Math.abs(concept.localPracticeSuccessRate - 14 / 15) < 0.001);
  assert.equal(concept.mixedTransferSuccessRate, 0.5);
  assert.equal(concept.explanationSuccessRate, 1.0);
  assert.equal(concept.surgerySuccessRate, 1.0);
  assert.equal(concept.retainedAfterSecureRate, 0.8);
  assert.equal(concept.lapseAfterSecureRate, 0.2);
});

test('too_easy classification when >95% success and <2s median', () => {
  const events = generateEvents(50, {
    correct: true,
    firstAttemptIndependent: true,
    elapsedMs: 1500,
  });
  // Add 2 wrong to get 48/50 = 96%
  events[0].correct = false;
  events[1].correct = false;

  const report = buildTemplateHealthReport(events, { minSamples: 10 });
  const tpl = report.templates['tpl-adj-01'];

  assert.equal(tpl.classification, 'too_easy');
});

test('too_hard classification when <40% independent success', () => {
  const events = [
    ...generateEvents(15, { correct: true, firstAttemptIndependent: true }),
    ...generateEvents(35, { correct: false, firstAttemptIndependent: true }),
  ];

  const report = buildTemplateHealthReport(events, { minSamples: 10 });
  const tpl = report.templates['tpl-adj-01'];

  assert.equal(tpl.independentFirstAttemptSuccessRate, 0.3);
  assert.equal(tpl.classification, 'too_hard');
});
