import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EVIDENCE_SCHEMA_VERSION,
  autoNameEvidencePath,
  buildEvidencePayload,
  buildReportMeta,
  evaluateThresholds,
  persistEvidenceFile,
} from '../scripts/lib/capacity-evidence.mjs';

function makeSummary(overrides = {}) {
  return {
    ok: true,
    totalRequests: 10,
    expectedRequests: 10,
    statusCounts: { '200': 10 },
    endpointStatus: {},
    endpoints: {
      'GET /api/bootstrap': {
        count: 10,
        p50WallMs: 120,
        p95WallMs: 320,
        maxResponseBytes: 80_000,
      },
      'POST /api/subjects/grammar/command': {
        count: 30,
        p50WallMs: 80,
        p95WallMs: 180,
        maxResponseBytes: 5_000,
      },
    },
    signals: {},
    failures: [],
    ...overrides,
  };
}

test('EVIDENCE_SCHEMA_VERSION starts at 1 (U1 ships v1)', () => {
  assert.equal(EVIDENCE_SCHEMA_VERSION, 1);
});

test('buildReportMeta records schema version + degrades unknown fields safely', () => {
  const meta = buildReportMeta({
    mode: 'dry-run',
    origin: '',
    learners: 4,
    bootstrapBurst: 8,
    rounds: 2,
  });
  assert.equal(meta.evidenceSchemaVersion, 1);
  assert.equal(meta.learners, 4);
  assert.equal(meta.bootstrapBurst, 8);
  assert.equal(meta.rounds, 2);
  assert.equal(meta.environment, 'dry-run');
  assert.equal(typeof meta.commit, 'string');
});

test('buildReportMeta detects environment from origin hints', () => {
  assert.equal(buildReportMeta({ mode: 'production', origin: 'https://ks2.eugnel.uk' }).environment, 'production');
  assert.equal(buildReportMeta({ mode: 'production', origin: 'https://preview.example' }).environment, 'preview');
  assert.equal(buildReportMeta({ mode: 'local-fixture', origin: 'http://localhost:8787' }).environment, 'local');
});

test('evaluateThresholds returns {configured, observed, passed} per configured threshold', () => {
  const summary = makeSummary();
  const result = evaluateThresholds(summary, {
    max5xx: 0,
    maxNetworkFailures: 0,
    maxBootstrapP95Ms: 1000,
    maxCommandP95Ms: 750,
    maxResponseBytes: 600_000,
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.thresholds.max5xx.configured, 0);
  assert.equal(result.thresholds.max5xx.observed, 0);
  assert.equal(result.thresholds.max5xx.passed, true);
  assert.equal(result.thresholds.maxBootstrapP95Ms.configured, 1000);
  assert.equal(result.thresholds.maxBootstrapP95Ms.observed, 320);
  assert.equal(result.thresholds.maxBootstrapP95Ms.passed, true);
});

test('evaluateThresholds reports failures with per-threshold details', () => {
  const summary = makeSummary({
    signals: { server5xx: 2 },
    endpoints: {
      'GET /api/bootstrap': { count: 10, p50WallMs: 800, p95WallMs: 1240, maxResponseBytes: 900_000 },
    },
  });
  const result = evaluateThresholds(summary, {
    max5xx: 0,
    maxBootstrapP95Ms: 1000,
    maxResponseBytes: 600_000,
  });
  assert.equal(result.thresholds.max5xx.passed, false);
  assert.equal(result.thresholds.max5xx.observed, 2);
  assert.equal(result.thresholds.maxBootstrapP95Ms.passed, false);
  assert.equal(result.thresholds.maxBootstrapP95Ms.observed, 1240);
  assert.equal(result.thresholds.maxResponseBytes.passed, false);
  assert.ok(result.failures.includes('max5xx'));
  assert.ok(result.failures.includes('maxBootstrapP95Ms'));
  assert.ok(result.failures.includes('maxResponseBytes'));
});

test('evaluateThresholds distinguishes threshold 0 (strict) from undefined (not gated)', () => {
  const summary = makeSummary({ signals: { server5xx: 1 } });
  const strict = evaluateThresholds(summary, { max5xx: 0 });
  assert.equal(strict.thresholds.max5xx.passed, false);
  const notGated = evaluateThresholds(summary, {});
  assert.equal(notGated.thresholds.max5xx, undefined);
  assert.deepEqual(notGated.failures, []);
});

test('evaluateThresholds handles empty measurements with null observed values (real run fails)', () => {
  const summary = {
    ok: true,
    totalRequests: 0,
    endpoints: {},
    signals: {},
  };
  const result = evaluateThresholds(summary, {
    max5xx: 0,
    maxBootstrapP95Ms: 1000,
  });
  assert.equal(result.thresholds.max5xx.observed, 0);
  assert.equal(result.thresholds.max5xx.passed, true);
  assert.equal(result.thresholds.maxBootstrapP95Ms.observed, null);
  assert.equal(result.thresholds.maxBootstrapP95Ms.passed, false);
});

test('evaluateThresholds dry-run skips latency gates on null observed (passes)', () => {
  const summary = { ok: true, totalRequests: 0, endpoints: {}, signals: {} };
  const result = evaluateThresholds(summary, {
    max5xx: 0,
    maxBootstrapP95Ms: 1000,
  }, { dryRun: true });
  assert.equal(result.thresholds.maxBootstrapP95Ms.observed, null);
  assert.equal(result.thresholds.maxBootstrapP95Ms.passed, true);
  assert.deepEqual(result.failures, []);
});

test('evaluateThresholds honours requireZeroSignals gate across all signal kinds', () => {
  const pass = evaluateThresholds(makeSummary(), { requireZeroSignals: true });
  assert.equal(pass.thresholds.requireZeroSignals.passed, true);

  const fail = evaluateThresholds(
    makeSummary({ signals: { rateLimited: 3 } }),
    { requireZeroSignals: true },
  );
  assert.equal(fail.thresholds.requireZeroSignals.passed, false);
  assert.equal(fail.thresholds.requireZeroSignals.observed, 3);
});

test('buildEvidencePayload sets ok=false when any threshold fails', () => {
  const report = {
    ok: true,
    summary: makeSummary({ signals: { server5xx: 1 } }),
    plan: {},
  };
  const payload = buildEvidencePayload({
    report,
    thresholds: { max5xx: 0, maxNetworkFailures: 0 },
    options: { mode: 'production', origin: 'https://ks2.eugnel.uk', learners: 10 },
    timings: { startedAt: '2026-04-25T00:00:00Z', finishedAt: '2026-04-25T00:00:30Z' },
  });
  assert.equal(payload.ok, false);
  assert.ok(payload.failures.includes('max5xx'));
  assert.equal(payload.reportMeta.evidenceSchemaVersion, 1);
  assert.equal(payload.reportMeta.environment, 'production');
  assert.equal(payload.safety.mode, 'production');
  assert.equal(payload.safety.demoSessions, false);
});

test('buildEvidencePayload preserves report.ok and lists confirmations in safety', () => {
  const report = {
    ok: true,
    summary: makeSummary(),
    plan: {},
  };
  const payload = buildEvidencePayload({
    report,
    thresholds: {},
    options: {
      mode: 'production',
      origin: 'https://ks2.eugnel.uk',
      learners: 30,
      demoSessions: true,
      confirmProductionLoad: true,
      confirmHighProductionLoad: true,
    },
    timings: {},
  });
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.failures, []);
  assert.deepEqual(payload.safety.confirmedVia, ['production-load', 'high-production-load']);
});

test('persistEvidenceFile writes JSON + creates parent directories', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'nested', 'evidence.json');
  try {
    const payload = { ok: true, reportMeta: { evidenceSchemaVersion: 1 } };
    const absolute = persistEvidenceFile(outputPath, payload);
    assert.equal(absolute, outputPath);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.ok, true);
    assert.equal(written.reportMeta.evidenceSchemaVersion, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('persistEvidenceFile strips measurements by default to keep files bounded', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'ev.json');
  try {
    persistEvidenceFile(outputPath, { ok: true, measurements: [{ endpoint: '/api/bootstrap' }] });
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.measurements, undefined);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('persistEvidenceFile includes measurements when includeRequestSamples is true', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'ev.json');
  try {
    persistEvidenceFile(
      outputPath,
      { ok: true, measurements: [{ endpoint: '/api/bootstrap' }] },
      { includeRequestSamples: true },
    );
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.deepEqual(written.measurements, [{ endpoint: '/api/bootstrap' }]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('persistEvidenceFile non-enumerable fields on measurements never serialise', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'ev.json');
  try {
    const entry = { endpoint: '/api/bootstrap', status: 500 };
    // Mimic the non-enumerable raw body that timedJsonRequest attaches.
    Object.defineProperty(entry, 'failureText', {
      value: '<html>...full worker error body...</html>',
      enumerable: false,
    });
    persistEvidenceFile(
      outputPath,
      { ok: false, measurements: [entry] },
      { includeRequestSamples: true },
    );
    const raw = readFileSync(outputPath, 'utf8');
    assert.ok(!raw.includes('<html>'), 'raw failure body must not leak into evidence JSON');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('autoNameEvidencePath produces reports/capacity/<timestamp>-<sha>-<env>.json', () => {
  const path = autoNameEvidencePath({ environment: 'local', commit: 'abc1234xyz' });
  assert.match(path, /^reports\/capacity\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d+Z-abc1234-local\.json$/);
});
