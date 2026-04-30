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
import {
  redactPersistedEvidenceRequestIds,
} from '../scripts/lib/capacity-evidence.mjs';

const TRACE_FIXTURE = 'tests/fixtures/capacity-worker-logs/workers-trace.json';
const JSONL_FIXTURE = 'tests/fixtures/capacity-worker-logs/tail-worker.jsonl';
const P3_FIXTURE = 'tests/fixtures/capacity-worker-logs/p3-invocation-export.jsonl';
const OPAQUE_REQUEST_ID_RE = /^req_[0-9a-f]{24}$/;
const OPAQUE_STATEMENT_ID_RE = /^stmt_[0-9a-f]{24}$/;

function evidenceWithSamples(samples, reportMeta = {}) {
  return {
    ok: false,
    reportMeta: {
      commit: 'abc1234567890abcdef1234567890abcdef12345',
      learners: 30,
      bootstrapBurst: 20,
      rounds: 1,
      startedAt: '2026-04-29T09:00:00Z',
      finishedAt: '2026-04-29T09:01:00Z',
      ...reportMeta,
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
  assert.equal(output.redaction.rawRequestIdsPersisted, false);
  assert.equal(output.redaction.rawStatementNamesPersisted, false);
  assert.equal(join.certification.contributesToCertification, false);
  assert.equal(join.coverage.invocation.matched, 2);
  assert.equal(join.coverage.invocation.missing, 1);
  assert.equal(join.coverage.statementLogs.matched, 1);
  assert.equal(join.coverage.statementLogs.missing, 2);
  assert.match(join.samples[0].requestId, OPAQUE_REQUEST_ID_RE);
  assert.match(join.samples[0].clientRequestId, OPAQUE_REQUEST_ID_RE);
  assert.equal(join.samples[0].classification, 'd1-dominated');
  assert.equal(join.samples[0].cloudflare.cpuTimeMs, 4.2);
  assert.equal(join.samples[0].capacityRequest.d1DurationMs, 710);
  assert.equal(join.samples[0].capacityRequest.statementCount, 1);
  assert.match(join.samples[0].capacityRequest.statements[0].statementId, OPAQUE_STATEMENT_ID_RE);
  assert.ok(join.samples[0].join.notes.includes('duplicate-log-records:2'));
  assert.equal(join.samples[1].classification, 'partial-invocation-only');
  assert.equal(join.samples[2].classification, 'unclassified-insufficient-logs');
  assert.doesNotMatch(JSON.stringify(output), /ks2_req_/);
  assert.doesNotMatch(JSON.stringify(output), /SELECT|child_subject_state/);
});

test('joinCapacityWorkerLogs joins the P3 canonical cf-worker-event JSONL export with finite invocation coverage', () => {
  const parsed = parseWorkerLogExport(readFileSync(P3_FIXTURE, 'utf8'), { sourcePath: P3_FIXTURE });
  const evidence = redactPersistedEvidenceRequestIds(evidenceWithSamples([{
    scenario: 'cold-bootstrap-burst',
    status: 200,
    wallMs: 920,
    responseBytes: 29589,
    clientRequestId: 'ks2_req_55555555-5555-4555-8555-555555555555',
    serverRequestId: 'ks2_req_55555555-5555-4555-8555-555555555555',
    queryCount: 9,
    d1RowsRead: 9,
    d1RowsWritten: 0,
    serverWallMs: 820,
    bootstrapMode: 'selected-learner-bounded',
  }], {
    startedAt: '2026-04-30T10:00:00Z',
    finishedAt: '2026-04-30T10:02:00Z',
  }));

  const output = joinCapacityWorkerLogs({
    evidence,
    records: parsed.records,
    evidencePath: 'reports/capacity/evidence/2026-04-30-p3-t1-strict.json',
    logSourcePaths: [P3_FIXTURE],
    generatedAt: '2026-04-30T10:03:00Z',
  });
  const join = output.diagnostics.workerLogJoin;
  const sample = join.samples[0];

  assert.deepEqual(output.warnings, []);
  assert.equal(join.coverage.invocation.matched, 1);
  assert.equal(join.coverage.statementLogs.matched, 1);
  assert.match(sample.requestId, OPAQUE_REQUEST_ID_RE);
  assert.equal(sample.join.invocation.status, 'matched');
  assert.equal(sample.join.capacityRequest.status, 'matched');
  assert.equal(sample.cloudflare.cpuTimeMs, 6.25);
  assert.equal(sample.cloudflare.wallTimeMs, 840);
  assert.equal(sample.capacityRequest.statementCount, 1);
  assert.match(sample.capacityRequest.statements[0].statementId, OPAQUE_STATEMENT_ID_RE);
  assert.doesNotMatch(JSON.stringify(output), /ks2_req_55555555/);
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
    }], {
      startedAt: '2026-04-29T09:04:00Z',
      finishedAt: '2026-04-29T09:06:00Z',
    }),
    records: parsed.records,
    generatedAt: '2026-04-29T09:10:00Z',
    warnings: parsed.warnings,
  });
  const sample = output.diagnostics.workerLogJoin.samples[0];
  assert.equal(output.warnings.length, 1);
  assert.match(sample.requestId, OPAQUE_REQUEST_ID_RE);
  assert.equal(sample.join.invocation.status, 'matched');
  assert.equal(sample.join.capacityRequest.status, 'partial');
  assert.equal(sample.classification, 'partial-invocation-only');
  assert.doesNotMatch(JSON.stringify(output), /ks2_req_/);
});

test('parseWorkerLogExport bounds malformed-line warnings', () => {
  const parsed = parseWorkerLogExport(
    Array.from({ length: 25 }, (_, index) => `not json ${index}`).join('\n'),
    { sourcePath: 'inline-jsonl' },
  );

  assert.equal(parsed.records.length, 0);
  assert.equal(parsed.warnings.length, 20);
  assert.match(parsed.warnings[0], /inline-jsonl:1: skipped malformed log line/);
  assert.match(parsed.warnings[19], /inline-jsonl:20: skipped malformed log line/);
});

test('joinCapacityWorkerLogs keeps partial and null CPU/wall invocations non-finite and insufficient', () => {
  const parsed = parseWorkerLogExport([
    '{"EventTimestampMs":1777453200000,"CPUTimeMs":7.1,"Outcome":"ok","Event":{"Request":{"Method":"GET","URL":"https://ks2.eugnel.uk/api/bootstrap","Headers":{"x-ks2-request-id":"ks2_req_66666666-6666-4666-8666-666666666666"}},"Response":{"Status":200}}}',
    '{"EventTimestampMs":1777453200100,"CPUTimeMs":null,"WallTimeMs":null,"Outcome":"ok","Event":{"Request":{"Method":"GET","URL":"https://ks2.eugnel.uk/api/bootstrap","Headers":{"x-ks2-request-id":"ks2_req_77777777-7777-4777-8777-777777777777"}},"Response":{"Status":200}}}',
  ].join('\n'), { sourcePath: 'inline-jsonl' });

  const output = joinCapacityWorkerLogs({
    evidence: evidenceWithSamples([
      {
        scenario: 'cold-bootstrap-burst',
        status: 200,
        wallMs: 700,
        responseBytes: 28000,
        clientRequestId: 'ks2_req_66666666-6666-4666-8666-666666666666',
        serverRequestId: 'ks2_req_66666666-6666-4666-8666-666666666666',
      },
      {
        scenario: 'cold-bootstrap-burst',
        status: 200,
        wallMs: 650,
        responseBytes: 28000,
        clientRequestId: 'ks2_req_77777777-7777-4777-8777-777777777777',
        serverRequestId: 'ks2_req_77777777-7777-4777-8777-777777777777',
      },
    ]),
    records: parsed.records,
    generatedAt: '2026-04-29T09:10:00Z',
  });
  const [partialCpu, nullCpuWall] = output.diagnostics.workerLogJoin.samples;

  assert.equal(output.diagnostics.workerLogJoin.coverage.invocation.matched, 0);
  assert.equal(output.diagnostics.workerLogJoin.coverage.invocation.partial, 1);
  assert.equal(partialCpu.join.invocation.status, 'partial');
  assert.equal(partialCpu.cloudflare.cpuTimeMs, 7.1);
  assert.equal(partialCpu.cloudflare.wallTimeMs, null);
  assert.equal(partialCpu.classification, 'unclassified-insufficient-logs');
  assert.equal(nullCpuWall.join.invocation.status, 'missing');
  assert.equal(nullCpuWall.cloudflare.cpuTimeMs, null);
  assert.equal(nullCpuWall.cloudflare.wallTimeMs, null);
  assert.equal(nullCpuWall.classification, 'unclassified-insufficient-logs');
  assert.doesNotMatch(JSON.stringify(output), /"cpuTimeMs":0|"wallTimeMs":0/);
});

test('joinCapacityWorkerLogs warns when log timestamps do not overlap the evidence run window', () => {
  const parsed = parseWorkerLogExport(readFileSync(P3_FIXTURE, 'utf8'), { sourcePath: P3_FIXTURE });
  const output = joinCapacityWorkerLogs({
    evidence: evidenceWithSamples([{
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 920,
      responseBytes: 29589,
      clientRequestId: 'ks2_req_55555555-5555-4555-8555-555555555555',
      serverRequestId: 'ks2_req_55555555-5555-4555-8555-555555555555',
    }], {
      startedAt: '2026-04-30T10:05:00Z',
      finishedAt: '2026-04-30T10:06:00Z',
    }),
    records: parsed.records,
    generatedAt: '2026-04-30T10:07:00Z',
  });

  assert.ok(output.warnings.some((warning) => warning.startsWith('capture-window-no-overlap:')));
  assert.deepEqual(output.diagnostics.workerLogJoin.warnings, output.warnings);
});

test('joinCapacityWorkerLogs warns for full statement coverage with zero invocation CPU/wall matches', () => {
  const parsed = parseWorkerLogExport(
    '[ks2-worker] {"event":"capacity.request","requestId":"ks2_req_88888888-8888-4888-8888-888888888888","endpoint":"/api/bootstrap","method":"GET","status":200,"phase":"bootstrap","queryCount":9,"d1RowsRead":9,"d1RowsWritten":0,"d1DurationMs":120,"wallMs":700,"responseBytes":28000,"bootstrapMode":"selected-learner-bounded","statements":[{"name":"bootstrap.selectedLearnerState.read","rowsRead":9,"rowsWritten":0,"durationMs":80}],"statementsTruncated":false,"at":"2026-04-29T09:00:10.000Z"}',
    { sourcePath: 'pretty-tail' },
  );

  const output = joinCapacityWorkerLogs({
    evidence: evidenceWithSamples([{
      scenario: 'cold-bootstrap-burst',
      status: 200,
      wallMs: 720,
      responseBytes: 28000,
      clientRequestId: 'ks2_req_88888888-8888-4888-8888-888888888888',
      serverRequestId: 'ks2_req_88888888-8888-4888-8888-888888888888',
    }]),
    records: parsed.records,
    generatedAt: '2026-04-29T09:10:00Z',
  });

  assert.equal(output.diagnostics.workerLogJoin.coverage.statementLogs.matched, 1);
  assert.equal(output.diagnostics.workerLogJoin.coverage.invocation.matched, 0);
  assert.ok(output.warnings.some((warning) => warning.startsWith('insufficient-invocation-coverage:')));
});

test('joinCapacityWorkerLogs matches raw logs against redacted persisted evidence ids', () => {
  const parsed = parseWorkerLogExport(readFileSync(TRACE_FIXTURE, 'utf8'), { sourcePath: TRACE_FIXTURE });
  const evidence = redactPersistedEvidenceRequestIds(evidenceWithSamples([{
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
  }]));

  assert.match(
    evidence.summary.endpoints['GET /api/bootstrap'].topTailSamples[0].serverRequestId,
    /^req_[0-9a-f]{24}$/,
  );

  const output = joinCapacityWorkerLogs({
    evidence,
    records: parsed.records,
    generatedAt: '2026-04-29T09:10:00Z',
  });
  const sample = output.diagnostics.workerLogJoin.samples[0];
  assert.equal(sample.join.invocation.status, 'matched');
  assert.equal(sample.join.capacityRequest.status, 'matched');
  assert.equal(sample.classification, 'd1-dominated');
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
    assert.match(written.diagnostics.workerLogJoin.samples[0].requestId, OPAQUE_REQUEST_ID_RE);
    assert.doesNotMatch(JSON.stringify(written), /ks2_req_|SELECT|child_subject_state/);
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
