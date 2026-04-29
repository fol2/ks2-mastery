// U1 (P7): Evidence preflight exclusion and missing-source rows tests.
//
// Verifies:
// 1. classifyTier early-returns 'preflight_only' for preflight evidenceKind
// 2. classifyTier still classifies capacity-run files correctly
// 3. buildEvidencePanelModel emits NOT_AVAILABLE rows for missing sources

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTier,
  TIER_KEYS,
} from '../scripts/generate-evidence-summary.mjs';

import {
  EVIDENCE_STATES,
  buildEvidencePanelModel,
} from '../src/platform/hubs/admin-production-evidence.js';

// ---------------------------------------------------------------------------
// classifyTier — preflight exclusion
// ---------------------------------------------------------------------------

test('classifyTier returns preflight_only for preflight evidenceKind', () => {
  const result = classifyTier(
    '60-learner-stretch-preflight-20260428-p6.json',
    { evidenceKind: 'preflight' },
  );
  assert.equal(result, 'preflight_only');
  assert.equal(result, TIER_KEYS.PREFLIGHT);
});

test('classifyTier returns preflight_only regardless of filename tier matches', () => {
  // Even though the filename says "100-plus", preflight data wins.
  const result = classifyTier(
    '100-plus-preflight-20260429.json',
    { evidenceKind: 'preflight' },
  );
  assert.equal(result, 'preflight_only');
});

test('classifyTier returns preflight_only when data.tier contains a certification tier string but evidenceKind is preflight', () => {
  const result = classifyTier(
    'some-file.json',
    { evidenceKind: 'preflight', tier: 'certified_60_learner_stretch' },
  );
  assert.equal(result, 'preflight_only');
});

// ---------------------------------------------------------------------------
// classifyTier — capacity-run still classifies correctly
// ---------------------------------------------------------------------------

test('classifyTier returns certified_30_learner_beta for capacity-run 30-learner file', () => {
  const result = classifyTier(
    '30-learner-beta-v2-20260428-p5-warm.json',
    { evidenceKind: 'capacity-run' },
  );
  assert.equal(result, 'certified_30_learner_beta');
  assert.equal(result, TIER_KEYS.CERTIFIED_30);
});

test('classifyTier returns certified_60_learner_stretch for capacity-run 60-learner file', () => {
  const result = classifyTier(
    '60-learner-stretch-20260428-p6.json',
    { evidenceKind: 'capacity-run' },
  );
  assert.equal(result, 'certified_60_learner_stretch');
  assert.equal(result, TIER_KEYS.CERTIFIED_60);
});

test('classifyTier returns smoke_pass for smoke capacity-run', () => {
  const result = classifyTier(
    'smoke-check-20260428.json',
    { evidenceKind: 'capacity-run' },
  );
  assert.equal(result, 'smoke_pass');
});

test('classifyTier still works without evidenceKind (legacy files)', () => {
  const result = classifyTier('60-learner-stretch-20260425-p4.json', {});
  assert.equal(result, 'certified_60_learner_stretch');
});

// ---------------------------------------------------------------------------
// buildEvidencePanelModel — missing sources produce NOT_AVAILABLE rows
// ---------------------------------------------------------------------------

test('missing sources in manifest produce NOT_AVAILABLE rows in panel model', () => {
  const now = Date.now();
  const summary = {
    schema: 3,
    generatedAt: new Date(now - 1000).toISOString(),
    sources: {
      capacity_evidence: { file: 'reports/capacity/evidence/', found: true },
      admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
      bootstrap_smoke: { file: 'reports/bootstrap-smoke/latest.json', found: false },
      csp_status: { file: 'worker/src/security-headers.js', found: true },
    },
    metrics: {
      csp_status: {
        tier: 'csp_status',
        ok: true,
        dryRun: false,
        mode: 'enforced',
        finishedAt: new Date(now - 5000).toISOString(),
        commit: null,
        failures: [],
      },
    },
  };

  const model = buildEvidencePanelModel(summary, now);

  // admin_smoke and bootstrap_smoke are declared found:false
  const adminSmokeRow = model.metrics.find((m) => m.key === 'admin_smoke');
  const bootstrapSmokeRow = model.metrics.find((m) => m.key === 'bootstrap_smoke');

  assert.ok(adminSmokeRow, 'admin_smoke row must exist');
  assert.equal(adminSmokeRow.state, EVIDENCE_STATES.NOT_AVAILABLE);
  assert.equal(adminSmokeRow.failureReason, 'source-not-found');

  assert.ok(bootstrapSmokeRow, 'bootstrap_smoke row must exist');
  assert.equal(bootstrapSmokeRow.state, EVIDENCE_STATES.NOT_AVAILABLE);
  assert.equal(bootstrapSmokeRow.failureReason, 'source-not-found');
});

test('sources with found:true do not produce duplicate NOT_AVAILABLE rows', () => {
  const now = Date.now();
  const summary = {
    schema: 3,
    generatedAt: new Date(now - 1000).toISOString(),
    sources: {
      csp_status: { file: 'worker/src/security-headers.js', found: true },
    },
    metrics: {
      csp_status: {
        tier: 'csp_status',
        ok: true,
        dryRun: false,
        finishedAt: new Date(now - 5000).toISOString(),
        commit: null,
        failures: [],
      },
    },
  };

  const model = buildEvidencePanelModel(summary, now);
  const cspRows = model.metrics.filter((m) => m.key === 'csp_status');
  assert.equal(cspRows.length, 1, 'no duplicate row for found:true source');
  assert.notEqual(cspRows[0].state, EVIDENCE_STATES.NOT_AVAILABLE);
});

test('empty sources manifest produces no extra rows', () => {
  const now = Date.now();
  const summary = { schema: 3, generatedAt: new Date().toISOString(), sources: {}, metrics: {} };
  const model = buildEvidencePanelModel(summary, now);
  assert.equal(model.metrics.length, 0);
});
