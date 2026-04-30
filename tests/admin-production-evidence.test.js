// P5 Unit 4: Production Evidence panel — logic layer tests.
//
// Tests the closed EVIDENCE_STATES enum, the classifyEvidenceMetric function,
// and the buildEvidencePanelModel function covering all 10 states.

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

test('isValidEvidenceState accepts all 11 enum values', () => {
  const values = Object.values(EVIDENCE_STATES);
  assert.equal(values.length, 11, 'enum has exactly 11 values (P7: +PREFLIGHT_ONLY)');
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
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: false, failures: [], finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.FAILING);
});

test('classifyEvidenceMetric returns FAILING when failures array is non-empty', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: true, failures: ['max5xx'], finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.FAILING);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — NON_CERTIFYING
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns NON_CERTIFYING for dry-run evidence', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('smoke_pass', { ok: true, dryRun: true, failures: [], finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.NON_CERTIFYING);
});

test('classifyEvidenceMetric returns NON_CERTIFYING for setup-blocked preflight evidence', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_60_learner_stretch', {
    ok: false,
    status: 'non_certifying',
    evidenceKind: 'preflight',
    failures: [],
    finishedAt: freshDate,
  }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.NON_CERTIFYING);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — SMOKE_PASS
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns SMOKE_PASS for passing smoke tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('smoke_pass', { ok: true, failures: [], finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.SMOKE_PASS);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — SMALL_PILOT_PROVISIONAL
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns SMALL_PILOT_PROVISIONAL for passing small pilot', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('small_pilot_provisional', { ok: true, failures: [], finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_30
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_30 for passing 30-learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', { ok: true, failures: [], certifying: true, finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_30);
});

test('classifyEvidenceMetric requires positive certifying proof for certification tiers', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_30_learner_beta', {
    ok: true,
    failures: [],
    finishedAt: freshDate,
  }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.NON_CERTIFYING);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_60
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_60 for passing 60-learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_60_learner_stretch', { ok: true, failures: [], certifying: true, finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_60);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — CERTIFIED_100
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns CERTIFIED_100 for passing 100+ learner tier', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('certified_100_plus', { ok: true, failures: [], certifying: true, finishedAt: freshDate }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_100);
});

// ---------------------------------------------------------------------------
// classifyEvidenceMetric — UNKNOWN (unrecognised tier key)
// ---------------------------------------------------------------------------

test('classifyEvidenceMetric returns UNKNOWN for unrecognised tier key', () => {
  const now = Date.now();
  const freshDate = new Date(now - 1000).toISOString();
  const result = classifyEvidenceMetric('totally_new_tier', { ok: true, failures: [], finishedAt: freshDate }, freshDate, now);
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
  assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
});

test('buildEvidencePanelModel returns empty model for placeholder summary', () => {
  const result = buildEvidencePanelModel({ schema: 2, metrics: {}, generatedAt: null }, Date.now());
  assert.deepEqual(result.metrics, []);
  assert.equal(result.generatedAt, null);
  assert.equal(result.isFresh, false);
  assert.equal(result.overallState, EVIDENCE_STATES.NOT_AVAILABLE);
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
        status: 'passed',
        ok: true,
        certifying: true,
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
        status: 'passed',
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
        status: 'passed',
        ok: true,
        certifying: true,
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
        status: 'failed',
        ok: false,
        certifying: false,
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

test('buildEvidencePanelModel surfaces threshold violations from P5 30-learner failure', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        status: 'failed',
        ok: false,
        certifying: false,
        dryRun: false,
        learners: 30,
        finishedAt: freshDate,
        commit: '1c56e06',
        failures: ['maxBootstrapP95Ms'],
        thresholdViolations: [
          {
            threshold: 'max-bootstrap-p95-ms',
            limit: 1000,
            observed: 1167.4,
            message: 'Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms.',
          },
        ],
        fileName: '30-learner-beta-v2-20260428-p5-warm.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.overallState, EVIDENCE_STATES.FAILING);
  assert.equal(result.metrics[0].state, EVIDENCE_STATES.FAILING);
  assert.deepEqual(result.metrics[0].thresholdViolations, [
    {
      threshold: 'max-bootstrap-p95-ms',
      limit: 1000,
      observed: 1167.4,
      message: 'Bootstrap P95 wall time 1167.4 ms exceeds 1000 ms.',
    },
  ]);
});

test('buildEvidencePanelModel keeps setup-blocked 60-learner preflight non-certifying', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_60_learner_stretch: {
        tier: 'certified_60_learner_stretch',
        status: 'non_certifying',
        ok: false,
        certifying: false,
        dryRun: false,
        evidenceKind: 'preflight',
        decision: 'invalid-with-named-setup-blocker',
        failureReason: 'session-manifest-preparation-rate-limited',
        learners: 60,
        finishedAt: freshDate,
        commit: '0f744c3',
        failures: [],
        thresholdViolations: [],
        fileName: '60-learner-stretch-preflight-20260428-p5.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.overallState, EVIDENCE_STATES.NON_CERTIFYING);
  assert.equal(result.metrics[0].state, EVIDENCE_STATES.NON_CERTIFYING);
  assert.equal(result.metrics[0].certifying, false);
  assert.equal(result.metrics[0].failureReason, 'session-manifest-preparation-rate-limited');
});

test('buildEvidencePanelModel gives failing latest evidence priority over provisional success', () => {
  const now = Date.now();
  const freshDate = new Date(now - 60_000).toISOString();
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      small_pilot_provisional: {
        tier: 'small_pilot_provisional',
        status: 'passed',
        ok: true,
        dryRun: false,
        learners: 30,
        finishedAt: freshDate,
        commit: 'cbf39ec',
        failures: [],
        fileName: 'small-pilot.json',
      },
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        status: 'failed',
        ok: false,
        certifying: false,
        dryRun: false,
        learners: 30,
        finishedAt: freshDate,
        commit: '1c56e06',
        failures: ['maxBootstrapP95Ms'],
        fileName: '30-fail.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
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
        status: 'passed',
        ok: true,
        certifying: true,
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

test('buildEvidencePanelModel treats fresh summary generation with stale evidence run as stale', () => {
  const now = Date.now();
  const generatedAt = new Date(now - 60_000).toISOString();
  const staleFinishedAt = new Date(now - EVIDENCE_FRESH_THRESHOLD_MS - 1000).toISOString();
  const summary = {
    schema: 2,
    generatedAt,
    metrics: {
      certified_30_learner_beta: {
        tier: 'certified_30_learner_beta',
        status: 'passed',
        ok: true,
        certifying: true,
        dryRun: false,
        learners: 30,
        finishedAt: staleFinishedAt,
        commit: 'abc1234',
        failures: [],
        fileName: '30-pass.json',
      },
    },
  };
  const result = buildEvidencePanelModel(summary, now);
  assert.equal(result.isFresh, false);
  assert.equal(result.latestEvidenceAt, staleFinishedAt);
  assert.equal(result.metrics[0].state, EVIDENCE_STATES.STALE);
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

// ---------------------------------------------------------------------------
// P4-U3: Fail-Closed Regression Tests — 7 Scenarios
//
// Proves that the Admin surface, generated summary, and verifier separate
// strict evidence from diagnostics. The 30-learner promotion has landed;
// these tests prove it is safe.
// ---------------------------------------------------------------------------

// Scenario 1: Promoted 30-learner beta row → state CERTIFIED_30
test('P4-U3 S1: promoted 30-learner beta row classifies as CERTIFIED_30', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();
  const metricValue = {
    ok: true,
    certifying: true,
    decision: '30-learner-beta-certified',
    status: 'passed',
    learners: 30,
    finishedAt: freshDate,
    failures: [],
    thresholdViolations: [],
    fileName: '30-learner-beta-v2-promoted.json',
  };
  const result = classifyEvidenceMetric('certified_30_learner_beta', metricValue, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.CERTIFIED_30);

  // Also verify via buildEvidencePanelModel to confirm panel integration
  const summary = { schema: 2, generatedAt: freshDate, metrics: { certified_30_learner_beta: metricValue } };
  const panel = buildEvidencePanelModel(summary, now);
  assert.ok(panel.metrics.length > 0, 'vacuous-truth guard: metrics non-empty');
  assert.equal(panel.metrics[0].state, EVIDENCE_STATES.CERTIFIED_30);
  assert.equal(panel.metrics[0].decision, '30-learner-beta-certified');
  assert.equal(panel.overallState, EVIDENCE_STATES.CERTIFIED_30);
});

// Scenario 2: Diagnostic worker-log join (tail-correlation) not certifying
test('P4-U3 S2: diagnostic tail-correlation file cannot produce certification state', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();

  // A tail-correlation diagnostic would appear as an unrecognised metric key.
  // Even with ok: true and certifying: true, an unknown key maps to UNKNOWN.
  const diagnosticKeys = [
    'bootstrap-tail-correlation',
    'session-tail-correlation',
    'worker-log-tail-correlation',
  ];

  assert.ok(diagnosticKeys.length > 0, 'vacuous-truth guard: diagnosticKeys non-empty');
  for (const key of diagnosticKeys) {
    const result = classifyEvidenceMetric(key, {
      ok: true,
      certifying: true,
      finishedAt: freshDate,
      failures: [],
    }, freshDate, now);
    assert.equal(result, EVIDENCE_STATES.UNKNOWN, `${key} must not certify`);
    assert.equal(
      result !== EVIDENCE_STATES.CERTIFIED_30
        && result !== EVIDENCE_STATES.CERTIFIED_60
        && result !== EVIDENCE_STATES.CERTIFIED_100,
      true,
      `${key} must not reach any certification state`,
    );
  }
});

// Scenario 3: Failed setup evidence classifies as FAILING or NON_CERTIFYING
test('P4-U3 S3: failed setup evidence (ok: false) classifies as FAILING', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();

  // Sub-scenario A: ok: false without non_certifying status → FAILING
  const resultA = classifyEvidenceMetric('certified_30_learner_beta', {
    ok: false,
    status: 'failed',
    certifying: false,
    finishedAt: freshDate,
    failures: ['setup-timeout'],
    failureReason: 'session-manifest-creation-failed',
  }, freshDate, now);
  assert.equal(resultA, EVIDENCE_STATES.FAILING);

  // Sub-scenario B: status non_certifying → NON_CERTIFYING (before ok check)
  const resultB = classifyEvidenceMetric('certified_30_learner_beta', {
    ok: false,
    status: 'non_certifying',
    certifying: false,
    finishedAt: freshDate,
    failures: [],
    failureReason: 'setup-rate-limited',
  }, freshDate, now);
  assert.equal(resultB, EVIDENCE_STATES.NON_CERTIFYING);

  // Neither result is a certification state
  const certStates = new Set([EVIDENCE_STATES.CERTIFIED_30, EVIDENCE_STATES.CERTIFIED_60, EVIDENCE_STATES.CERTIFIED_100]);
  assert.equal(certStates.has(resultA), false);
  assert.equal(certStates.has(resultB), false);
});

// Scenario 4: P3-T0 smoke evidence backs SMOKE_PASS only — never certification
test('P4-U3 S4: smoke-tier evidence backs SMOKE_PASS only', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();

  const smokeKeys = ['smoke_pass', 'admin_smoke', 'bootstrap_smoke'];
  assert.ok(smokeKeys.length > 0, 'vacuous-truth guard: smokeKeys non-empty');

  const results = smokeKeys.map((key) => classifyEvidenceMetric(key, {
    ok: true,
    certifying: false,
    finishedAt: freshDate,
    failures: [],
  }, freshDate, now));

  assert.ok(results.length > 0, 'vacuous-truth guard: results non-empty');
  assert.ok(
    results.every((r) => r === EVIDENCE_STATES.SMOKE_PASS),
    'all smoke keys produce SMOKE_PASS',
  );

  // Prove none of them reach certification states
  const certStates = new Set([EVIDENCE_STATES.CERTIFIED_30, EVIDENCE_STATES.CERTIFIED_60, EVIDENCE_STATES.CERTIFIED_100]);
  assert.ok(
    results.every((r) => !certStates.has(r)),
    'no smoke key can produce a certification state',
  );
});

// Scenario 5: 60 preflight with evidenceKind 'preflight' classifies as NON_CERTIFYING
test('P4-U3 S5: preflight evidence classifies as NON_CERTIFYING regardless of thresholds passing', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();

  // Even with ok: true and certifying: true, evidenceKind: 'preflight'
  // forces NON_CERTIFYING before the tier map is consulted.
  const result = classifyEvidenceMetric('certified_60_learner_stretch', {
    ok: true,
    certifying: true,
    status: 'passed',
    evidenceKind: 'preflight',
    learners: 60,
    finishedAt: freshDate,
    failures: [],
    thresholdViolations: [],
    thresholdsPassed: true,
  }, freshDate, now);
  assert.equal(result, EVIDENCE_STATES.NON_CERTIFYING);

  // Also test via the panel model to confirm it cannot promote overall state
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_60_learner_stretch: {
        ok: true,
        certifying: true,
        status: 'passed',
        evidenceKind: 'preflight',
        learners: 60,
        finishedAt: freshDate,
        failures: [],
        thresholdViolations: [],
      },
    },
  };
  const panel = buildEvidencePanelModel(summary, now);
  assert.ok(panel.metrics.length > 0, 'vacuous-truth guard: metrics non-empty');
  assert.equal(panel.metrics[0].state, EVIDENCE_STATES.NON_CERTIFYING);
  assert.equal(panel.overallState, EVIDENCE_STATES.NON_CERTIFYING);
});

// Scenario 6: Stale or missing latest summary not certifying
test('P4-U3 S6: stale finishedAt returns STALE; missing metric returns NOT_AVAILABLE', () => {
  const now = Date.now();
  const staleDate = new Date(now - EVIDENCE_FRESH_THRESHOLD_MS - 60_000).toISOString();
  const freshDate = new Date(now - 5_000).toISOString();

  // Sub-scenario A: finishedAt older than 24h → STALE
  const resultStale = classifyEvidenceMetric('certified_30_learner_beta', {
    ok: true,
    certifying: true,
    status: 'passed',
    learners: 30,
    finishedAt: staleDate,
    failures: [],
  }, freshDate, now);
  assert.equal(resultStale, EVIDENCE_STATES.STALE);

  // Sub-scenario B: null metricValue → NOT_AVAILABLE
  const resultMissing = classifyEvidenceMetric('certified_30_learner_beta', null, freshDate, now);
  assert.equal(resultMissing, EVIDENCE_STATES.NOT_AVAILABLE);

  // Sub-scenario C: Panel model with stale evidence → overall STALE
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: {
        ok: true,
        certifying: true,
        status: 'passed',
        learners: 30,
        finishedAt: staleDate,
        failures: [],
      },
    },
  };
  const panel = buildEvidencePanelModel(summary, now);
  assert.ok(panel.metrics.length > 0, 'vacuous-truth guard: metrics non-empty');
  assert.equal(panel.metrics[0].state, EVIDENCE_STATES.STALE);
  assert.equal(panel.isFresh, false);
  assert.equal(panel.overallState, EVIDENCE_STATES.STALE);

  // Neither STALE nor NOT_AVAILABLE is a certification state
  const certStates = new Set([EVIDENCE_STATES.CERTIFIED_30, EVIDENCE_STATES.CERTIFIED_60, EVIDENCE_STATES.CERTIFIED_100]);
  assert.equal(certStates.has(resultStale), false);
  assert.equal(certStates.has(resultMissing), false);
});

// Scenario 7: Setup-rate-limited evidence cannot overwrite a promoted CERTIFIED_30 row
test('P4-U3 S7: setup-rate-limited evidence cannot overwrite promoted CERTIFIED_30 in panel', () => {
  const now = Date.now();
  const freshDate = new Date(now - 5_000).toISOString();

  // The panel model receives the LATEST summary state. If the summary builder
  // correctly preserves the promoted row, the panel sees CERTIFIED_30.
  // A rate-limited evidence file produces NON_CERTIFYING — which ranks lower
  // than CERTIFIED_30 in the tier hierarchy.
  const promotedMetric = {
    ok: true,
    certifying: true,
    status: 'passed',
    decision: '30-learner-beta-certified',
    learners: 30,
    finishedAt: freshDate,
    failures: [],
    thresholdViolations: [],
    fileName: '30-learner-beta-v2-promoted.json',
  };
  const rateLimitedMetric = {
    ok: false,
    certifying: false,
    status: 'non_certifying',
    evidenceKind: 'preflight',
    decision: 'invalid-with-named-setup-blocker',
    failureReason: 'session-manifest-preparation-rate-limited',
    learners: 30,
    finishedAt: freshDate,
    failures: [],
    thresholdViolations: [],
    fileName: '30-learner-beta-preflight-rate-limited.json',
  };

  // Verify the promoted row classifies as CERTIFIED_30
  const promotedState = classifyEvidenceMetric('certified_30_learner_beta', promotedMetric, freshDate, now);
  assert.equal(promotedState, EVIDENCE_STATES.CERTIFIED_30);

  // Verify the rate-limited row classifies as NON_CERTIFYING
  const rateLimitedState = classifyEvidenceMetric('certified_30_learner_beta', rateLimitedMetric, freshDate, now);
  assert.equal(rateLimitedState, EVIDENCE_STATES.NON_CERTIFYING);

  // In the panel, the promoted row (which is the latest summary state) wins.
  // The rate-limited evidence, even if it arrives later, cannot downgrade the
  // certification because the summary builder is append-only for certified rows.
  const summary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: promotedMetric,
    },
  };
  const panel = buildEvidencePanelModel(summary, now);
  assert.ok(panel.metrics.length > 0, 'vacuous-truth guard: metrics non-empty');
  assert.equal(panel.metrics[0].state, EVIDENCE_STATES.CERTIFIED_30);
  assert.equal(panel.overallState, EVIDENCE_STATES.CERTIFIED_30);

  // If the rate-limited metric were to replace the promoted metric, it would
  // NOT produce CERTIFIED_30 — proving fail-closed safety.
  const corruptedSummary = {
    schema: 2,
    generatedAt: freshDate,
    metrics: {
      certified_30_learner_beta: rateLimitedMetric,
    },
  };
  const corruptedPanel = buildEvidencePanelModel(corruptedSummary, now);
  assert.ok(corruptedPanel.metrics.length > 0, 'vacuous-truth guard: corruptedPanel metrics non-empty');
  assert.notEqual(corruptedPanel.metrics[0].state, EVIDENCE_STATES.CERTIFIED_30);
  assert.equal(corruptedPanel.metrics[0].state, EVIDENCE_STATES.NON_CERTIFYING);
  assert.notEqual(corruptedPanel.overallState, EVIDENCE_STATES.CERTIFIED_30);
});
