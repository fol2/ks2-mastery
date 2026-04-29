// U2 (P7): Multi-lane evidence display tests.
//
// Tests the lane model produced by buildEvidencePanelModel:
// 1. Failing cert + passing smoke renders two independent lanes with distinct states
// 2. All lanes NOT_AVAILABLE shows no green (passing) indicators
// 3. Lane state computation is independent — no cross-lane rollup

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_STATES,
  buildEvidencePanelModel,
  LANE_DEFINITIONS,
} from '../src/platform/hubs/admin-production-evidence.js';

// ---------------------------------------------------------------------------
// Helper: build a summary with specified metrics
// ---------------------------------------------------------------------------

function makeSummary(metricEntries, { now } = {}) {
  const ts = now || Date.now();
  const metrics = {};
  for (const [key, overrides] of Object.entries(metricEntries)) {
    metrics[key] = {
      tier: key,
      ok: true,
      dryRun: false,
      status: 'passed',
      certifying: false,
      evidenceKind: 'capacity-run',
      finishedAt: new Date(ts - 5000).toISOString(),
      commit: 'abc1234',
      failures: [],
      thresholdViolations: [],
      ...overrides,
    };
  }
  return {
    schema: 3,
    generatedAt: new Date(ts - 1000).toISOString(),
    sources: {
      capacity_evidence: { file: 'reports/capacity/evidence/', found: true },
      admin_smoke: { file: 'reports/admin-smoke/latest.json', found: true },
      bootstrap_smoke: { file: 'reports/bootstrap-smoke/latest.json', found: true },
      csp_status: { file: 'worker/src/security-headers.js', found: true },
      d1_migrations: { file: 'worker/migrations/', found: true },
      build_version: { file: 'package.json', found: true },
      kpi_reconcile: { file: 'reports/kpi-reconcile/latest.json', found: true },
    },
    metrics,
  };
}

// ---------------------------------------------------------------------------
// Lane definitions
// ---------------------------------------------------------------------------

test('LANE_DEFINITIONS includes all 7 required lane IDs', () => {
  const requiredIds = [
    'smoke',
    'capacity_certification',
    'capacity_preflight',
    'security_posture',
    'database_posture',
    'build_posture',
    'admin_maintenance',
  ];
  const actualIds = LANE_DEFINITIONS.map((d) => d.laneId);
  for (const id of requiredIds) {
    assert.ok(actualIds.includes(id), `lane '${id}' must be defined`);
  }
});

// ---------------------------------------------------------------------------
// Independent lane states: failing cert + passing smoke
// ---------------------------------------------------------------------------

test('failing cert lane + passing smoke lane render independently', () => {
  const now = Date.now();
  const summary = makeSummary({
    // Smoke passes
    admin_smoke: { ok: true, status: 'passed' },
    // Certification fails
    certified_60_learner_stretch: {
      ok: false,
      status: 'failed',
      certifying: false,
      failures: ['threshold-violation'],
      thresholdViolations: [{ threshold: 'max5xx', limit: 0, observed: 3 }],
    },
  }, { now });

  const model = buildEvidencePanelModel(summary, now);
  assert.ok(model.lanes, 'model must have lanes');
  assert.ok(Array.isArray(model.lanes), 'lanes must be an array');

  const smokeLane = model.lanes.find((l) => l.laneId === 'smoke');
  const certLane = model.lanes.find((l) => l.laneId === 'capacity_certification');

  assert.ok(smokeLane, 'smoke lane must exist');
  assert.ok(certLane, 'capacity_certification lane must exist');

  // Smoke lane has passing state (admin_smoke passed)
  assert.equal(smokeLane.overallState, EVIDENCE_STATES.SMOKE_PASS,
    'smoke lane state should be SMOKE_PASS when admin_smoke passes');

  // Cert lane has failing state
  assert.equal(certLane.overallState, EVIDENCE_STATES.FAILING,
    'cert lane state should be FAILING when cert metric fails');

  // States are independent — smoke does not inherit cert failure
  assert.notEqual(smokeLane.overallState, certLane.overallState);
});

// ---------------------------------------------------------------------------
// All lanes NOT_AVAILABLE — no green indicators
// ---------------------------------------------------------------------------

test('all lanes NOT_AVAILABLE shows no green (passing) indicators', () => {
  const now = Date.now();
  // Empty summary — no metrics at all
  const summary = {
    schema: 3,
    generatedAt: new Date(now - 1000).toISOString(),
    sources: {
      capacity_evidence: { file: 'reports/capacity/evidence/', found: false },
      admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
      bootstrap_smoke: { file: 'reports/bootstrap-smoke/latest.json', found: false },
      csp_status: { file: 'worker/src/security-headers.js', found: false },
      d1_migrations: { file: 'worker/migrations/', found: false },
      build_version: { file: 'package.json', found: false },
      kpi_reconcile: { file: 'reports/kpi-reconcile/latest.json', found: false },
    },
    metrics: {},
  };

  const model = buildEvidencePanelModel(summary, now);

  const greenStates = new Set([
    EVIDENCE_STATES.SMOKE_PASS,
    EVIDENCE_STATES.SMALL_PILOT_PROVISIONAL,
    EVIDENCE_STATES.CERTIFIED_30,
    EVIDENCE_STATES.CERTIFIED_60,
    EVIDENCE_STATES.CERTIFIED_100,
  ]);

  for (const lane of model.lanes) {
    assert.ok(
      !greenStates.has(lane.overallState),
      `lane '${lane.laneId}' must not show green when everything is NOT_AVAILABLE (got: ${lane.overallState})`,
    );
  }
});

// ---------------------------------------------------------------------------
// Lane state independence
// ---------------------------------------------------------------------------

test('each lane computes state from its own metrics only', () => {
  const now = Date.now();
  const summary = makeSummary({
    // Security posture — CSP failing
    csp_status: {
      ok: false,
      status: 'failed',
      failures: ['csp_mode_is_report-only'],
    },
    // Database posture — passing
    d1_migrations: {
      ok: true,
      status: 'passed',
    },
  }, { now });

  const model = buildEvidencePanelModel(summary, now);

  const securityLane = model.lanes.find((l) => l.laneId === 'security_posture');
  const dbLane = model.lanes.find((l) => l.laneId === 'database_posture');

  assert.ok(securityLane, 'security_posture lane must exist');
  assert.ok(dbLane, 'database_posture lane must exist');

  assert.equal(securityLane.overallState, EVIDENCE_STATES.FAILING,
    'security lane should be FAILING when csp_status fails');
  assert.equal(dbLane.overallState, EVIDENCE_STATES.SMOKE_PASS,
    'database lane should show passing when d1_migrations passes');
});

// ---------------------------------------------------------------------------
// Lane action copy
// ---------------------------------------------------------------------------

test('each lane includes operator action copy', () => {
  const now = Date.now();
  const summary = makeSummary({}, { now });
  const model = buildEvidencePanelModel(summary, now);

  for (const lane of model.lanes) {
    assert.ok(typeof lane.actionCopy === 'string' && lane.actionCopy.length > 0,
      `lane '${lane.laneId}' must have non-empty actionCopy`);
  }
});

// ---------------------------------------------------------------------------
// Lanes array always present even with empty metrics
// ---------------------------------------------------------------------------

test('lanes array is always returned even when no metrics exist', () => {
  const now = Date.now();
  const summary = { schema: 3, generatedAt: new Date().toISOString(), sources: {}, metrics: {} };
  const model = buildEvidencePanelModel(summary, now);
  assert.ok(Array.isArray(model.lanes), 'lanes must be an array');
  assert.equal(model.lanes.length, LANE_DEFINITIONS.length);
});
