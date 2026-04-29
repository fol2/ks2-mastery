import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  joinCapacityWorkerLogs,
  parseJoinArgs,
  parseWorkerLogExport,
  runJoinCapacityWorkerLogs,
} from '../scripts/join-capacity-worker-logs.mjs';

const TRACE_FIXTURE = 'tests/fixtures/capacity-worker-logs/workers-trace.json';
const JSONL_FIXTURE = 'tests/fixtures/capacity-worker-logs/tail-worker.jsonl';

function evidenceWithSamples(samples) {
  return {
    ok: false,
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      learners: 30,
      bootstrapBurst: 20,
      rounds: 1,
      startedAt: '2026-04-29T09:00:00Z',
      finishedAt: '2026-04-29T09:01:00Z',
    },
    summary: {
      endpoints: {
        'GET /api/bootstrap': {
          count: samples.length,
          p95WallMs: 950,
          topTailSamples: samples,
        },
      },
    },
  };
}

test('joinCapacityWorkerLogs joins JSON Workers Trace invocation and capacity.request logs separately', () => {
  const parsed = parseWorkerLogExport(readFileSync(TRACE_FIXTURE, 'utf8'), { sourcePath: TRACE_FIXTURE });
  const evidence = evidenceWithSamples([
    {
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 950,
      responseBytes: 78000,
      clientRequestId: 'ks2_req_11111111-1111-4111-8111-111111111111',
      serverRequestId: 'ks2_req_11111111-1111-4111-8111-111111111111',
      queryCount: 8,
      d1RowsRead: 120,
      d1RowsWritten: 0,
      serverWallMs: 920,
      bootstrapMode: 'selected-learner-bounded',
    },
    {
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 880,
      responseBytes: 76000,
      clientRequestId: 'ks2_req_22222222-2222-4222-8222-222222222222',
      serverRequestId: 'ks2_req_22222222-2222-4222-8222-222222222222',
    },
    {
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 870,
      responseBytes: 75000,
      clientRequestId: 'ks2_req_44444444-4444-4444-8444-444444444444',
      serverRequestId: 'ks2_req_44444444-4444-4444-8444-444444444444',
    },
  ]);

  const output = joinCapacityWorkerLogs({
    evidence,
    records: parsed.records,
    evidencePath: 'reports/capacity/evidence/strict.json',
    logSourcePaths: [TRACE_FIXTURE],
    generatedAt: '2026-04-29T09:10:00Z',
  });
  const join = output.diagnostics.workerLogJoin;

  assert.equal(output.diagnosticOnly, true);
  assert.equal(join.certification.contributesToCertification, false);
  assert.equal(join.coverage.invocation.matched, 2);
  assert.equal(join.coverage.invocation.missing, 1);
  assert.equal(join.coverage.statementLogs.matched, 1);
  assert.equal(join.coverage.statementLogs.missing, 2);
  assert.equal(join.samples[0].classification, 'd1-dominated');
  assert.equal(join.samples[0].cloudflare.cpuTimeMs, 4.2);
  assert.equal(join.samples[0].capacityRequest.d1DurationMs, 710);
  assert.ok(join.samples[0].join.notes.includes('duplicate-log-records:2'));
  assert.equal(join.samples[1].classification, 'partial-invocation-only');
  assert.equal(join.samples[2].classification, 'unclassified-insufficient-logs');
});

test('parseWorkerLogExport supports JSONL Tail exports and skips malformed lines with bounded warnings', () => {
  const parsed = parseWorkerLogExport(readFileSync(JSONL_FIXTURE, 'utf8'), { sourcePath: JSONL_FIXTURE });
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /skipped malformed log line/);

  const output = joinCapacityWorkerLogs({
    evidence: evidenceWithSamples([{
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 530,
      responseBytes: 600000,
      clientRequestId: 'ks2_req_33333333-3333-4333-8333-333333333333',
      serverRequestId: 'ks2_req_33333333-3333-4333-8333-333333333333',
    }]),
    records: parsed.records,
    generatedAt: '2026-04-29T09:10:00Z',
    warnings: parsed.warnings,
  });
  const sample = output.diagnostics.workerLogJoin.samples[0];
  assert.equal(output.warnings.length, 1);
  assert.equal(sample.join.invocation.status, 'matched');
  assert.equal(sample.join.capacityRequest.status, 'partial');
  assert.equal(sample.classification, 'partial-invocation-only');
});

test('runJoinCapacityWorkerLogs writes a deterministic diagnostic-only correlation file', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ks2-worker-log-join-'));
  const evidencePath = join(tempDir, 'evidence.json');
  const outputPath = join(tempDir, 'correlation.json');
  writeFileSync(evidencePath, JSON.stringify(evidenceWithSamples([{
    scenario: 'cold-bootstrap-burst',
    status: 200,
    wallMs: 950,
    responseBytes: 78000,
    clientRequestId: 'ks2_req_11111111-1111-4111-8111-111111111111',
    serverRequestId: 'ks2_req_11111111-1111-4111-8111-111111111111',
  }]), null, 2));
  try {
    const exitCode = runJoinCapacityWorkerLogs([
      '--evidence', evidencePath,
      '--logs', TRACE_FIXTURE,
      '--output', outputPath,
      '--sample-limit', '1',
    ]);
    assert.equal(exitCode, 0);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.kind, 'capacity-worker-log-correlation');
    assert.equal(written.diagnostics.workerLogJoin.coverage.topTailSamples, 1);
    assert.equal(written.diagnostics.workerLogJoin.samples[0].classification, 'd1-dominated');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parseJoinArgs requires a positive sample limit', () => {
  assert.throws(
    () => parseJoinArgs(['--evidence', 'a.json', '--logs', 'logs.jsonl', '--output', 'out.json', '--sample-limit', '0']),
    /positive integer/,
  );
});
