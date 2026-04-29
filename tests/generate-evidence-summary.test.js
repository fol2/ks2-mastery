// P6 Unit 2: generate-evidence-summary.mjs — schema 3 multi-source tests.
//
// Tests the generator's source-reading logic, schema 3 shape, backward
// compatibility with schema 2 consumers, missing source handling, and
// malformed source robustness.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import {
  EVIDENCE_STATES,
  classifyEvidenceMetric,
  buildEvidencePanelModel,
} from '../src/platform/hubs/admin-production-evidence.js';

// ---------------------------------------------------------------------------
// Schema 3 output shape validation
// ---------------------------------------------------------------------------

describe('generate-evidence-summary schema 3 output', () => {
  it('produces schema 3 when run via node', () => {
    const ROOT = join(import.meta.url.startsWith('file://')
      ? new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')
      : process.cwd());
    const outputPath = join(ROOT, 'reports', 'capacity', 'latest-evidence-summary.json');

    // Run the generator
    execSync('node scripts/generate-evidence-summary.mjs', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10000,
    });

    const content = readFileSync(outputPath, 'utf8');
    const summary = JSON.parse(content);

    assert.equal(summary.schema, 3);
    assert.equal(typeof summary.generatedAt, 'string');
    assert.ok(summary.sources && typeof summary.sources === 'object');
    assert.ok(summary.metrics && typeof summary.metrics === 'object');

    // sources must contain the expected keys
    const expectedSourceKeys = [
      'capacity_evidence', 'admin_smoke', 'bootstrap_smoke',
      'csp_status', 'd1_migrations', 'build_version', 'kpi_reconcile',
    ];
    for (const key of expectedSourceKeys) {
      assert.ok(key in summary.sources, `sources must contain ${key}`);
      assert.equal(typeof summary.sources[key].found, 'boolean');
      assert.equal(typeof summary.sources[key].file, 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// Schema 3 backward compatibility with buildEvidencePanelModel
// ---------------------------------------------------------------------------

describe('buildEvidencePanelModel handles schema 3', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();

  it('schema 3 summary with sources is consumed correctly', () => {
    const summary = {
      schema: 3,
      generatedAt: FRESH,
      sources: {
        capacity_evidence: { file: 'reports/capacity/evidence/', found: true },
        admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
      },
      metrics: {
        certified_30_learner_beta: {
          tier: 'certified_30_learner_beta',
          ok: true,
          failures: [],
          finishedAt: FRESH,
          commit: 'abc1234',
        },
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    assert.equal(result.isFresh, true);
    assert.equal(result.metrics.length, 1);
    assert.equal(result.metrics[0].state, EVIDENCE_STATES.CERTIFIED_30);
    assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_30);
    // sources are preserved in the model
    assert.ok(result.sources);
    assert.equal(result.sources.capacity_evidence.found, true);
    assert.equal(result.sources.admin_smoke.found, false);
  });

  it('schema 2 summary (no sources field) still works', () => {
    const summary = {
      schema: 2,
      generatedAt: FRESH,
      metrics: {
        smoke_pass: { tier: 'smoke_pass', ok: true, failures: [] },
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    assert.equal(result.isFresh, true);
    assert.equal(result.overallState, EVIDENCE_STATES.SMOKE_PASS);
    // sources should be null for schema 2
    assert.equal(result.sources, null);
  });

  it('empty schema 2 placeholder still produces STALE', () => {
    const summary = { schema: 2, metrics: {}, generatedAt: null };
    const result = buildEvidencePanelModel(summary, NOW);
    assert.equal(result.overallState, EVIDENCE_STATES.STALE);
    assert.equal(result.sources, null);
  });
});

// ---------------------------------------------------------------------------
// New tier keys: admin_smoke, bootstrap_smoke classification
// ---------------------------------------------------------------------------

describe('classifyEvidenceMetric with schema 3 tier keys', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();

  it('admin_smoke passing → SMOKE_PASS', () => {
    const result = classifyEvidenceMetric(
      'admin_smoke',
      { ok: true, failures: [] },
      FRESH,
      NOW,
    );
    assert.equal(result, EVIDENCE_STATES.SMOKE_PASS);
  });

  it('bootstrap_smoke passing → SMOKE_PASS', () => {
    const result = classifyEvidenceMetric(
      'bootstrap_smoke',
      { ok: true, failures: [] },
      FRESH,
      NOW,
    );
    assert.equal(result, EVIDENCE_STATES.SMOKE_PASS);
  });

  it('admin_smoke failing → FAILING', () => {
    const result = classifyEvidenceMetric(
      'admin_smoke',
      { ok: false, failures: ['timeout'] },
      FRESH,
      NOW,
    );
    assert.equal(result, EVIDENCE_STATES.FAILING);
  });

  it('bootstrap_smoke null metric → NOT_AVAILABLE', () => {
    const result = classifyEvidenceMetric('bootstrap_smoke', null, FRESH, NOW);
    assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Missing source files → NOT_AVAILABLE
// ---------------------------------------------------------------------------

describe('missing source files produce NOT_AVAILABLE metrics', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();

  it('metric is absent when source file does not exist', () => {
    // Simulate: summary generated with admin_smoke source not found
    const summary = {
      schema: 3,
      generatedAt: FRESH,
      sources: {
        admin_smoke: { file: 'reports/admin-smoke/latest.json', found: false },
      },
      metrics: {
        // admin_smoke is NOT in metrics because source was missing
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    // No admin_smoke metric in the output
    const adminMetric = result.metrics.find((m) => m.key === 'admin_smoke');
    assert.equal(adminMetric, undefined);
    // sources manifest shows it was not found
    assert.equal(result.sources.admin_smoke.found, false);
  });

  it('classifyEvidenceMetric returns NOT_AVAILABLE for undefined metric value', () => {
    const result = classifyEvidenceMetric('admin_smoke', undefined, FRESH, NOW);
    assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Malformed source files → NOT_AVAILABLE (no crash)
// ---------------------------------------------------------------------------

describe('malformed source files do not crash the generator', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();

  it('metric with non-object value (string) is NOT_AVAILABLE', () => {
    const result = classifyEvidenceMetric('kpi_reconcile', 'broken', FRESH, NOW);
    assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
  });

  it('metric with array value is FAILING (array is typeof object, ok is falsy)', () => {
    // Arrays pass the typeof object check; without an `ok` property they
    // evaluate as !metricValue.ok → true → FAILING.
    const result = classifyEvidenceMetric('kpi_reconcile', [1, 2, 3], FRESH, NOW);
    assert.equal(result, EVIDENCE_STATES.FAILING);
  });

  it('metric with number value is NOT_AVAILABLE', () => {
    const result = classifyEvidenceMetric('csp_status', 42, FRESH, NOW);
    assert.equal(result, EVIDENCE_STATES.NOT_AVAILABLE);
  });
});

// ---------------------------------------------------------------------------
// Overall state derivation with schema 3 mixed metrics
// ---------------------------------------------------------------------------

describe('overall state with schema 3 mixed sources', () => {
  const NOW = 1_700_000_000_000;
  const FRESH = new Date(NOW - 60_000).toISOString();

  it('capacity certified_30 + admin_smoke pass → overall is CERTIFIED_30', () => {
    const summary = {
      schema: 3,
      generatedAt: FRESH,
      sources: {},
      metrics: {
        certified_30_learner_beta: { tier: 'certified_30_learner_beta', ok: true, failures: [] },
        admin_smoke: { tier: 'admin_smoke', ok: true, failures: [] },
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    assert.equal(result.overallState, EVIDENCE_STATES.CERTIFIED_30);
  });

  it('only informational metrics (csp_status, d1_migrations) → UNKNOWN overall', () => {
    const summary = {
      schema: 3,
      generatedAt: FRESH,
      sources: {},
      metrics: {
        csp_status: { tier: 'csp_status', ok: false, failures: ['csp_mode_is_report-only'] },
        d1_migrations: { tier: 'd1_migrations', ok: true, failures: [] },
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    // csp_status fails → FAILING (rank 1), d1_migrations unknown tier ok → UNKNOWN (rank 2)
    // bestRank = 2 (UNKNOWN), hasFailing = true, 2 <= 2 && hasFailing → FAILING
    assert.equal(result.overallState, EVIDENCE_STATES.FAILING);
  });

  it('admin_smoke pass only → overall is SMOKE_PASS', () => {
    const summary = {
      schema: 3,
      generatedAt: FRESH,
      sources: {},
      metrics: {
        admin_smoke: { tier: 'admin_smoke', ok: true, failures: [] },
      },
    };
    const result = buildEvidencePanelModel(summary, NOW);
    assert.equal(result.overallState, EVIDENCE_STATES.SMOKE_PASS);
  });
});
