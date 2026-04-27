import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EVIDENCE_SCHEMA_VERSION,
  REQUEST_SAMPLES_HEAD_LIMIT,
  REQUEST_SAMPLES_TAIL_LIMIT,
  autoNameEvidencePath,
  buildEvidencePayload,
  buildProvenance,
  buildReportMeta,
  evaluateThresholds,
  persistEvidenceFile,
  validateThresholdConfigKeys,
} from '../scripts/lib/capacity-evidence.mjs';
import { summariseCapacityResults } from '../scripts/classroom-load-test.mjs';

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

test('EVIDENCE_SCHEMA_VERSION is 2 (P4 U1 bumps to v2)', () => {
  assert.equal(EVIDENCE_SCHEMA_VERSION, 2);
});

test('buildReportMeta records schema version + degrades unknown fields safely', () => {
  const meta = buildReportMeta({
    mode: 'dry-run',
    origin: '',
    learners: 4,
    bootstrapBurst: 8,
    rounds: 2,
  });
  assert.equal(meta.evidenceSchemaVersion, 2);
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
  assert.equal(payload.reportMeta.evidenceSchemaVersion, 2);
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

test('validateThresholdConfigKeys rejects unknown keys', () => {
  const unknown = validateThresholdConfigKeys({
    max5xx: 0,
    maxNetworkFailures: 0,
    maxFivexx: 0,  // typo
    bogusKey: 1,
  });
  assert.deepEqual(new Set(unknown), new Set(['maxFivexx', 'bogusKey']));
});

test('validateThresholdConfigKeys accepts all known keys', () => {
  const unknown = validateThresholdConfigKeys({
    max5xx: 0,
    maxNetworkFailures: 0,
    maxBootstrapP95Ms: 1000,
    maxCommandP95Ms: 750,
    maxResponseBytes: 600000,
    requireZeroSignals: true,
    requireBootstrapCapacity: true,
  });
  assert.deepEqual(unknown, []);
});

test('REQUEST_SAMPLES_HEAD_LIMIT and TAIL_LIMIT match plan spec (100 + 100)', () => {
  assert.equal(REQUEST_SAMPLES_HEAD_LIMIT, 100);
  assert.equal(REQUEST_SAMPLES_TAIL_LIMIT, 100);
});

test('persistEvidenceFile caps measurements to head+tail per endpoint when includeRequestSamples is true', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'ev.json');
  try {
    const totalPerEndpoint = 300;
    const measurements = [];
    for (let i = 0; i < totalPerEndpoint; i += 1) {
      measurements.push({ endpoint: '/api/bootstrap', index: i });
    }
    for (let i = 0; i < totalPerEndpoint; i += 1) {
      measurements.push({ endpoint: '/api/subjects/grammar/command', index: i });
    }
    persistEvidenceFile(outputPath, { ok: true, measurements }, { includeRequestSamples: true });
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    // 200 per endpoint (100 head + 100 tail) x 2 endpoints = 400.
    assert.equal(written.measurements.length, 400);
    // Head of bootstrap endpoint includes index 0.
    assert.ok(written.measurements.some((m) => m.endpoint === '/api/bootstrap' && m.index === 0));
    // Tail of bootstrap endpoint includes index 299.
    assert.ok(written.measurements.some((m) => m.endpoint === '/api/bootstrap' && m.index === 299));
    // Middle slice (index 150) is NOT included — it was capped out.
    assert.ok(!written.measurements.some((m) => m.endpoint === '/api/bootstrap' && m.index === 150));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('persistEvidenceFile small measurement sets are kept in full', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'ev.json');
  try {
    const measurements = [
      { endpoint: '/api/bootstrap', index: 0 },
      { endpoint: '/api/bootstrap', index: 1 },
    ];
    persistEvidenceFile(outputPath, { ok: true, measurements }, { includeRequestSamples: true });
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.measurements.length, 2);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('persistEvidenceFile uses tempfile-then-rename so partial writes never replace latest-*.json', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-capacity-'));
  const outputPath = join(tempDir, 'latest-local.json');
  try {
    // Write a "good" file first.
    persistEvidenceFile(outputPath, { ok: true, reportMeta: { evidenceSchemaVersion: 1, version: 'good' } });
    const before = readFileSync(outputPath, 'utf8');

    // Simulate a failure by introducing a circular reference so JSON.stringify
    // throws. The atomic-write path must leave the original file intact and
    // remove the tempfile.
    assert.throws(() => {
      persistEvidenceFile(outputPath, (() => {
        const obj = { ok: true };
        // Force JSON.stringify to throw by introducing a circular reference.
        obj.self = obj;
        return obj;
      })());
    });
    const after = readFileSync(outputPath, 'utf8');
    assert.equal(after, before, 'the original evidence file must be untouched after a failed write');
    // No stray *.tmp-* files remain.
    const tempFiles = readdirSync(tempDir).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(tempFiles, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// requireBootstrapCapacity gate (P4 U1) — real assertion, not deferred stub
// ---------------------------------------------------------------------------

test('requireBootstrapCapacity: v2 evidence with queryCount + d1RowsRead passes gate', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10,
        p50WallMs: 120,
        p95WallMs: 320,
        maxResponseBytes: 80_000,
        queryCount: 5,
        d1RowsRead: 42,
      },
      'POST /api/subjects/grammar/command': {
        count: 30,
        p50WallMs: 80,
        p95WallMs: 180,
        maxResponseBytes: 5_000,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, true);
  assert.deepEqual(result.thresholds.requireBootstrapCapacity.observed, { queryCount: 5, d1RowsRead: 42 });
  assert.deepEqual(result.failures, []);
});

test('requireBootstrapCapacity: empty endpoints fails gate (vacuous-truth guard)', () => {
  const summary = { ok: true, totalRequests: 0, endpoints: {}, signals: {} };
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.equal(result.thresholds.requireBootstrapCapacity.observed, 'no-bootstrap-endpoint');
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: queryCount=0 is valid (cached bootstrap with no D1 queries)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 5,
        p50WallMs: 100,
        p95WallMs: 300,
        maxResponseBytes: 70_000,
        queryCount: 0,
        d1RowsRead: 0,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, true);
  assert.deepEqual(result.thresholds.requireBootstrapCapacity.observed, { queryCount: 0, d1RowsRead: 0 });
  assert.deepEqual(result.failures, []);
});

test('requireBootstrapCapacity: missing d1RowsRead fails gate', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10,
        p50WallMs: 120,
        p95WallMs: 320,
        maxResponseBytes: 80_000,
        queryCount: 5,
        // d1RowsRead intentionally absent
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: missing queryCount fails gate', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10,
        p50WallMs: 120,
        p95WallMs: 320,
        maxResponseBytes: 80_000,
        // queryCount intentionally absent
        d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: bootstrap endpoint present but both fields null fails gate', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10,
        p50WallMs: 120,
        p95WallMs: 320,
        maxResponseBytes: 80_000,
        queryCount: null,
        d1RowsRead: null,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

// ---------------------------------------------------------------------------
// ADV-U1-002: NaN, false, empty string, negative numbers must fail the gate
// ---------------------------------------------------------------------------

test('requireBootstrapCapacity: NaN queryCount fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: NaN, d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: NaN d1RowsRead fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: 5, d1RowsRead: NaN,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: false queryCount fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: false, d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: empty string queryCount fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: '', d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: negative queryCount fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: -1, d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

test('requireBootstrapCapacity: negative d1RowsRead fails gate (ADV-U1-002)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: 5, d1RowsRead: -1,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

// ---------------------------------------------------------------------------
// ADV-U1-003: dryRun exempts requireBootstrapCapacity when no endpoint data
// ---------------------------------------------------------------------------

test('requireBootstrapCapacity: dryRun with no bootstrap endpoint passes gate (ADV-U1-003)', () => {
  const summary = { ok: true, totalRequests: 0, endpoints: {}, signals: {} };
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true }, { dryRun: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, true);
  assert.deepEqual(result.failures, []);
});

test('requireBootstrapCapacity: dryRun with invalid data still fails gate (data present but wrong)', () => {
  const summary = makeSummary({
    endpoints: {
      'GET /api/bootstrap': {
        count: 10, p95WallMs: 320, maxResponseBytes: 80_000,
        queryCount: NaN, d1RowsRead: 42,
      },
    },
  });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true }, { dryRun: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, false);
  assert.ok(result.failures.includes('requireBootstrapCapacity'));
});

// ---------------------------------------------------------------------------
// ADV-U1-001: summariseCapacityResults aggregates capacity metrics
// ---------------------------------------------------------------------------

test('summariseCapacityResults aggregates queryCount and d1RowsRead from measurements (ADV-U1-001)', () => {
  const measurements = [
    {
      method: 'GET', endpoint: '/api/bootstrap', status: 200, ok: true,
      wallMs: 100, responseBytes: 5000,
      capacity: { queryCount: 3, d1RowsRead: 20 },
    },
    {
      method: 'GET', endpoint: '/api/bootstrap', status: 200, ok: true,
      wallMs: 150, responseBytes: 6000,
      capacity: { queryCount: 5, d1RowsRead: 42 },
    },
    {
      method: 'GET', endpoint: '/api/bootstrap', status: 200, ok: true,
      wallMs: 120, responseBytes: 5500,
      capacity: { queryCount: 4, d1RowsRead: 30 },
    },
  ];
  const summary = summariseCapacityResults(measurements, { expectedRequests: 3 });
  const bootstrap = summary.endpoints['GET /api/bootstrap'];
  assert.equal(bootstrap.queryCount, 5, 'queryCount is max across measurements');
  assert.equal(bootstrap.d1RowsRead, 42, 'd1RowsRead is max across measurements');
});

test('summariseCapacityResults omits queryCount/d1RowsRead when no measurements have capacity (ADV-U1-001)', () => {
  const measurements = [
    {
      method: 'GET', endpoint: '/api/bootstrap', status: 200, ok: true,
      wallMs: 100, responseBytes: 5000,
      capacity: null,
    },
  ];
  const summary = summariseCapacityResults(measurements, { expectedRequests: 1 });
  const bootstrap = summary.endpoints['GET /api/bootstrap'];
  assert.equal(bootstrap.queryCount, undefined, 'queryCount absent when no capacity data');
  assert.equal(bootstrap.d1RowsRead, undefined, 'd1RowsRead absent when no capacity data');
});

test('end-to-end: summarise then evaluate — pipeline populates capacity for gate (ADV-U1-001)', () => {
  const measurements = [
    {
      method: 'GET', endpoint: '/api/bootstrap', status: 200, ok: true,
      wallMs: 100, responseBytes: 5000,
      capacity: { queryCount: 7, d1RowsRead: 55 },
    },
  ];
  const summary = summariseCapacityResults(measurements, { expectedRequests: 1 });
  const result = evaluateThresholds(summary, { requireBootstrapCapacity: true });
  assert.equal(result.thresholds.requireBootstrapCapacity.passed, true);
  assert.deepEqual(result.thresholds.requireBootstrapCapacity.observed, { queryCount: 7, d1RowsRead: 55 });
  assert.deepEqual(result.failures, []);
});

// ---------------------------------------------------------------------------
// P4 U8: Evidence provenance and anti-fabrication guard
// ---------------------------------------------------------------------------

test('buildReportMeta includes provenance sub-block (P4-U8)', () => {
  const meta = buildReportMeta({ mode: 'dry-run' });
  assert.ok(meta.provenance, 'provenance block must be present');
  assert.equal(typeof meta.provenance.gitSha, 'string');
  assert.equal(typeof meta.provenance.dirtyTreeFlag, 'boolean');
  assert.equal(typeof meta.provenance.workflowRunUrl, 'string');
  assert.equal(typeof meta.provenance.workflowName, 'string');
  assert.equal(typeof meta.provenance.operator, 'string');
  assert.equal(typeof meta.provenance.loadDriverVersion, 'string');
  assert.equal(typeof meta.provenance.rawLogArtifactPath, 'string');
});

test('buildProvenance degrades workflowRunUrl to unknown without GH env vars (P4-U8)', () => {
  const saved = {
    GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
    GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
    GITHUB_ACTOR: process.env.GITHUB_ACTOR,
  };
  delete process.env.GITHUB_SERVER_URL;
  delete process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_RUN_ID;
  delete process.env.GITHUB_WORKFLOW;
  delete process.env.GITHUB_ACTOR;
  try {
    const prov = buildProvenance({});
    assert.equal(prov.workflowRunUrl, 'unknown');
    assert.equal(prov.workflowName, 'unknown');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('buildProvenance constructs workflowRunUrl from GH env vars (P4-U8)', () => {
  const saved = {
    GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
    GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
    GITHUB_ACTOR: process.env.GITHUB_ACTOR,
  };
  process.env.GITHUB_SERVER_URL = 'https://github.com';
  process.env.GITHUB_REPOSITORY = 'fol2/ks2-mastery';
  process.env.GITHUB_RUN_ID = '12345';
  process.env.GITHUB_WORKFLOW = 'Capacity CI';
  process.env.GITHUB_ACTOR = 'test-bot';
  try {
    const prov = buildProvenance({});
    assert.equal(prov.workflowRunUrl, 'https://github.com/fol2/ks2-mastery/actions/runs/12345');
    assert.equal(prov.workflowName, 'Capacity CI');
    assert.equal(prov.operator, 'test-bot');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('buildProvenance thresholdConfigHash is "none" without configPath (P4-U8)', () => {
  const prov = buildProvenance({});
  assert.equal(prov.thresholdConfigHash, 'none');
});

test('buildProvenance thresholdConfigHash is sha256 of config file content (P4-U8)', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-prov-'));
  const configPath = join(tempDir, 'test-config.json');
  const content = JSON.stringify({ tier: 'test', thresholds: { max5xx: 0 } });
  writeFileSync(configPath, content);
  try {
    const prov = buildProvenance({ configPath });
    const expectedHash = createHash('sha256').update(content).digest('hex');
    assert.equal(prov.thresholdConfigHash, expectedHash);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('buildProvenance rawLogArtifactPath defaults to "none" (P4-U8)', () => {
  const prov = buildProvenance({});
  assert.equal(prov.rawLogArtifactPath, 'none');
});

test('buildProvenance rawLogArtifactPath reads from options (P4-U8)', () => {
  const prov = buildProvenance({ rawLogArtifactPath: 'logs/run-12345.log' });
  assert.equal(prov.rawLogArtifactPath, 'logs/run-12345.log');
});

test('buildProvenance loadDriverVersion reads from package.json (P4-U8)', () => {
  const prov = buildProvenance({});
  // Should read 0.1.0 from the package.json in the repo.
  assert.equal(prov.loadDriverVersion, '0.1.0');
});

test('buildEvidencePayload includes provenance in reportMeta (P4-U8)', () => {
  const report = {
    ok: true,
    summary: makeSummary(),
    plan: {},
  };
  const payload = buildEvidencePayload({
    report,
    thresholds: {},
    options: { mode: 'dry-run' },
    timings: {},
  });
  assert.ok(payload.reportMeta.provenance, 'provenance must be present in evidence payload');
  assert.equal(typeof payload.reportMeta.provenance.gitSha, 'string');
  assert.equal(typeof payload.reportMeta.provenance.dirtyTreeFlag, 'boolean');
});
