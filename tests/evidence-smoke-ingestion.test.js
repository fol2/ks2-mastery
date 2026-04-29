// U3 (P7): Evidence smoke ingestion tests.
//
// Verifies that a valid admin-smoke file is consumed by the evidence generator
// and appears in the summary output as the admin_smoke metric.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aggregateSources } from '../scripts/generate-evidence-summary.mjs';

function createTempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'ks2-smoke-ingest-'));
  // The aggregator needs certain paths to exist even if empty.
  mkdirSync(join(root, 'reports', 'capacity', 'evidence'), { recursive: true });
  mkdirSync(join(root, 'worker', 'src'), { recursive: true });
  mkdirSync(join(root, 'worker', 'migrations'), { recursive: true });
  // Create a minimal package.json so build_version source works.
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0-test' }));
  // Create a minimal security-headers.js for CSP source.
  writeFileSync(
    join(root, 'worker', 'src', 'security-headers.js'),
    "export const CSP_ENFORCEMENT_MODE = 'report-only';\n",
  );
  return root;
}

// ---------------------------------------------------------------------------
// Smoke ingestion: valid file consumed
// ---------------------------------------------------------------------------

test('aggregateSources consumes admin-smoke latest.json when present', () => {
  const root = createTempRoot();
  try {
    // Write a valid smoke result file.
    const smokeDir = join(root, 'reports', 'admin-smoke');
    mkdirSync(smokeDir, { recursive: true });
    const smokePayload = {
      ok: true,
      finishedAt: new Date().toISOString(),
      smokeType: 'admin',
      failures: [],
      commit: 'abc1234',
    };
    writeFileSync(join(smokeDir, 'latest.json'), JSON.stringify(smokePayload));

    const { sources, metrics } = aggregateSources(root);

    // Source declared as found.
    assert.equal(sources.admin_smoke.found, true, 'admin_smoke source must be found');

    // Metric ingested.
    assert.ok(metrics.admin_smoke, 'admin_smoke metric must exist');
    assert.equal(metrics.admin_smoke.ok, true);
    assert.equal(metrics.admin_smoke.tier, 'admin_smoke');
    assert.equal(metrics.admin_smoke.commit, 'abc1234');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('aggregateSources reports admin-smoke as not found when file absent', () => {
  const root = createTempRoot();
  try {
    // Do NOT create reports/admin-smoke/latest.json.
    const { sources, metrics } = aggregateSources(root);

    assert.equal(sources.admin_smoke.found, false, 'admin_smoke source must be not found');
    assert.equal(metrics.admin_smoke, undefined, 'no admin_smoke metric when file missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('aggregateSources handles failing smoke result correctly', () => {
  const root = createTempRoot();
  try {
    const smokeDir = join(root, 'reports', 'admin-smoke');
    mkdirSync(smokeDir, { recursive: true });
    const smokePayload = {
      ok: false,
      finishedAt: new Date().toISOString(),
      smokeType: 'admin',
      failures: ['login-step-failed'],
      commit: 'def5678',
    };
    writeFileSync(join(smokeDir, 'latest.json'), JSON.stringify(smokePayload));

    const { sources, metrics } = aggregateSources(root);

    assert.equal(sources.admin_smoke.found, true);
    assert.ok(metrics.admin_smoke, 'admin_smoke metric must exist even on failure');
    assert.equal(metrics.admin_smoke.ok, false);
    assert.deepEqual(metrics.admin_smoke.failures, ['login-step-failed']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('aggregateSources handles malformed admin-smoke JSON gracefully', () => {
  const root = createTempRoot();
  try {
    const smokeDir = join(root, 'reports', 'admin-smoke');
    mkdirSync(smokeDir, { recursive: true });
    writeFileSync(join(smokeDir, 'latest.json'), 'not valid json {{');

    const { sources, metrics } = aggregateSources(root);

    // File exists but is malformed — source is found but metric may be null.
    assert.equal(sources.admin_smoke.found, true, 'file exists so found=true');
    // The readJsonSource function catches parse errors and returns metric: null.
    assert.equal(metrics.admin_smoke, undefined, 'malformed JSON produces no metric');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Smoke file shape validation
// ---------------------------------------------------------------------------

test('admin-smoke result has expected shape fields', () => {
  const root = createTempRoot();
  try {
    const smokeDir = join(root, 'reports', 'admin-smoke');
    mkdirSync(smokeDir, { recursive: true });
    const smokePayload = {
      ok: true,
      finishedAt: '2026-04-29T10:30:00.000Z',
      smokeType: 'admin',
      failures: [],
      commit: '1234abc',
    };
    writeFileSync(join(smokeDir, 'latest.json'), JSON.stringify(smokePayload));

    const { metrics } = aggregateSources(root);
    assert.ok(metrics.admin_smoke);
    assert.equal(metrics.admin_smoke.finishedAt, '2026-04-29T10:30:00.000Z');
    assert.equal(metrics.admin_smoke.commit, '1234abc');
    assert.deepEqual(metrics.admin_smoke.failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
