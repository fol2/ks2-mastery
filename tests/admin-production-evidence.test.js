// P5 Unit 4: Production Evidence panel — logic layer tests.
//
// Tests the closed EVIDENCE_STATES enum, the classifyEvidenceMetric function,
// and the buildEvidencePanelModel function covering all 9 states.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_STATES,
  EVIDENCE_FRESH_THRESHOLD_MS,
  isValidEvidenceState,
  classifyEvidenceMetric,
  buildEvidencePanelModel,
} from '../src/platform/hubs/admin-production-evidence.js';

// ---------------------------------------------------------------------------
// isValidEvidenceState
// ---------------------------------------------------------------------------

test('isValidEvidenceState accepts all 9 enum values', () => {
  const values = Object.values(EVIDENCE_STATES);
  assert.equal(values.length, 9, 'enum has exactly 9 values');
  for (const v of values) {
    assert.equal(isValidEvidenceState(v), true, `${v} is valid`);
  }
});

test('isValidEvidenceState rejects unknown strings', () => {
  assert.equal(isValidEvidenceState('bogus'), false);
  assert.equal(isValidEvidenceState(''), false);
  assert.equal(isValidEvidenceState(null), false);
  assert.equal(isValidEvidenceState(undefined), false);
  assert.equal(isValidEvidenceState(42), false);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — NOT_AVAILABLE
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns NOT_AVAILABLE when metricValue is null', () => {
  const result = classifyEvidenceMetric('smoke_pass', null, new Date().toISOString(), Date.now());
  assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
});

test('classifyEvidenceMetric returns NOT_AVAILABLE when metricValue is not an object', () => {
  const result = classifyEvidenceMetric('smoke_pass', 'string', new Date().toISOString(), Date.now());
  assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — STALE
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns STALE when generatedAt is null', () => {
  const result = classifyEvidenceMetric('smoke_pass', { ok: true }, null, Date.now());
  assert.equal(result, EVIDENCE_STATES.STALE);
});

test('classifyEvidenceMetric returns STALE when generatedAt is older than 24h', () => {
  const oldDate = new Date(Date.now() - EVIDENCE_FRESH_THRESHOLD_MS - 1000).toISOString();
  const result = classifyEvidenceMetric('smoke_pass', { ok: true }, oldDate, Date.now());
  assert.equal(result, EVIDENCE_STATES.STALE);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — FAILING
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns FAILING when ok is false', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: false, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.FAILING);
});

test('classifyEvidenceMetric returns FAILING when failures array is non-empty', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: true, failures: ['max5xx'] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.FAILING);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — UNKNOWN (dry-run)
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns UNKNOWN for dry-run evidence', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('smoke_pass', { ok: true, dryRun: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.UNKNOWN);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — SMOKE_PASS
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns SMOKE_PASS for passing smoke tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('smoke_pass', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.SMOKE_PASS);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — SMALL_PILOT_PROVISIONAL
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns SMALL_PILOT_PROVISIONAL for passing small pilot', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('small_pilot_provisional', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_30
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_30 for passing 30-learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_30);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_60
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_60 for passing 60-learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_60_learner_stretch', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_60);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_100
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_100 for passing 100+ learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_100_plus', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_100);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — UNKNOWN (unrecognised tier key)
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns UNKNOWN for unrecognised tier key', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('totally_new_tier', { ok: true, failures: [] }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.UNKNOWN);
});

// ---------------------------------------------------------------------------
// buildEvidencePanelModel — empty / null summary
// ---------------------------------------------------------------------------

test('buildEvidencePanelModel returns empty model for null summary', () => {
  const result = buildEvidencePanelModel(null, Date.now());
  assert.deepEqual(result.metrics, []);
  assert.equal(result.generatedAt, null);
  assert.equal(result.isFresh, false);
  assert.equal(result.overallState, EVIDENCE_STATES.STALE);
});

test('buildEvidencePanelModel returns empty model for placeholder summary', () => {
  const result = buildEvidencePanelModel({ schema: 2, metrics: {}, generatedAt: null }, Date.now());
  assert.deepEqual(result.metrics, []);
  assert.equal(result.generatedAt, null);
  assert.equal(result.isFresh, false);
  assert.equal(result.overallState, EVIDENCE_STATES.STALE);
});

// ---------------------------------------------------------------------------
// buildEvidencePanelModel — fresh summary with metrics
// ---------------------------------------------------------------------------

test('buildEvidencePanelModel classifies fresh summary with passing 30-learner', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: true,
        dryRun: false,
        learners: 30,
        finishedAt: freshDate,
        commit: 'abc1234',
        failures: [],
        fileName: '30-learner-beta-v2-20260428.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.isFresh, true);
  assert.equal(result.metrics.length, 1);
  assert.equal(result.metrics[0].state, EVIDENCE_STATES.CERTIFIED_30);
  assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_30);
});

test('buildEvidencePanelModel overall is highest tier when multiple metrics pass', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      smoke_pass: {
        tier: 'smoke_pass',
        ok: true,
        dryRun: false,
        learners: 1,
        finishedAt: freshDate,
        commit: 'aaa1111',
        failures: [],
        fileName: 'smoke.json',
      },
      certified_60_learner_stretch: {
        tier: 'certified_60_learner_stretch',
        ok: true,
        dryRun: false,
        learners: 60,
        finishedAt: freshDate,
        commit: 'bbb2222',
        failures: [],
        fileName: '60-learner.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_60);
});

test('buildEvidencePanelModel overall is FAILING when all metrics fail', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: false,
        dryRun: false,
        learners: 30,
        finishedAt: freshDate,
        commit: 'abc1234',
        failures: ['max5xx'],
        fileName: '30-fail.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.isFresh, true);
  assert.equal(result.overallState, EVIDENCE_STATES.FAILING);
});

test('buildEvidencePanelModel overall is STALE when generatedAt exceeds 24h', () => {
  const now = Date.now();
  const staleDate = new Date(now - EVIDENCE_FRESH_THRESHOLD_MS - 1000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: staleDate,
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        ok: true,
        dryRun: false,
        learners: 30,
        finishedAt: staleDate,
        commit: 'abc1234',
        failures: [],
        fileName: '30-pass.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.isFresh, false);
  assert.equal(result.overallState, EVIDENCE_STATES.STALE);
});

// ---------------------------------------------------------------------------
// Closed enum type guard: reject fabricated values
// ---------------------------------------------------------------------------

test('type guard rejects fabricated state values', () => {
  assert.equal(isValidEvidenceState('certified_999_learner_galaxy'), false);
  assert.equal(isValidEvidenceState('CERTIFIED_30'), false); // case-sensitive
  assert.equal(isValidEvidenceState('not-available'), false); // wrong separator
});

// ---------------------------------------------------------------------------
// EVIDENCE_STATES is frozen
// ---------------------------------------------------------------------------

test('EVIDENCE_STATES is frozen and cannot be extended', () => {
  assert.equal(Object.isFrozen(EVIDENCE_STATES), true);
  assert.throws(() => {
    EVIDENCE_STATES.FABRICATED = 'fake';
  });
});
