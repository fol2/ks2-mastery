import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ALLOWED_ROUTE_COST_STATUSES,
  REQUIRED_ROUTE_COST_METRICS,
  REQUIRED_ROUTE_FAMILIES,
  buildRouteCostDiagnosticPlan,
  buildRouteCostEvidence,
  runRouteCostDiagnostic,
  validateRouteCostEvidence,
} from '../scripts/plan-route-cost-diagnostic.mjs';

const BUDGET_FIXTURE = {
  routeCosts: [
    {
      route: 'GET /api/bootstrap',
      count: 5,
      queryCountP50: 10,
      queryCountP95: 11,
      queryCountMax: 12,
      d1RowsReadP50: 9,
      d1RowsReadP95: 9,
      d1RowsReadMax: 9,
      d1RowsWrittenP50: 0,
      d1RowsWrittenP95: 0,
      d1RowsWrittenMax: 0,
      responseBytesP50: 2400,
      responseBytesP95: 2500,
      responseBytesMax: 2600,
    },
    {
      route: 'POST /api/demo/session',
      count: 2,
      responseBytesP50: 150,
      responseBytesP95: 155,
      responseBytesMax: 160,
    },
    {
      route: 'POST /api/subjects/grammar/command',
      count: 6,
      queryCountP50: 18,
      queryCountP95: 22,
      queryCountMax: 23,
      d1RowsReadP50: 21,
      d1RowsReadP95: 499,
      d1RowsReadMax: 2031,
      d1RowsWrittenP50: 17,
      d1RowsWrittenP95: 32,
      d1RowsWrittenMax: 517,
      responseBytesP50: 16637,
      responseBytesP95: 29596,
      responseBytesMax: 29597,
    },
  ],
};

const TAIL_CORRELATION_FIXTURE = {
  kind: 'capacity-worker-log-correlation',
  redaction: { rawRequestIdsPersisted: false },
  diagnostics: {
    workerLogJoin: {
      samples: [
        {
          endpoint: '/api/bootstrap',
          method: 'GET',
          app: { wallMs: 700, responseBytes: 2500, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0 },
          cloudflare: { cpuTimeMs: 8, wallTimeMs: 240 },
          capacityRequest: { d1DurationMs: 180, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0, responseBytes: 2500 },
        },
        {
          endpoint: '/api/bootstrap',
          method: 'GET',
          app: { wallMs: 720, responseBytes: 2600, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0 },
          cloudflare: { cpuTimeMs: 11, wallTimeMs: 260 },
          capacityRequest: { d1DurationMs: 200, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0, responseBytes: 2600 },
        },
      ],
    },
  },
};

test('route-cost diagnostic plan lists every required family and metric', () => {
  const plan = buildRouteCostDiagnosticPlan();

  assert.equal(plan.kind, 'p5-route-cost-diagnostic-plan');
  assert.equal(plan.routeFamilies.length, REQUIRED_ROUTE_FAMILIES.length);
  assert.deepEqual(
    plan.routeFamilies.map((family) => family.id),
    REQUIRED_ROUTE_FAMILIES.map((family) => family.id),
  );
  for (const family of plan.routeFamilies) {
    assert.deepEqual(family.requiredMetrics, REQUIRED_ROUTE_COST_METRICS);
    assert.ok(Array.isArray(family.discoverySources));
    assert.ok(family.discoverySources.length > 0);
  }
});

test('route-cost diagnostic plan derives phase-specific kind from output path', () => {
  const plan = buildRouteCostDiagnosticPlan({
    outputPath: 'reports/capacity/evidence/2026-04-30-p6-route-costs.json',
  });

  assert.equal(plan.kind, 'p6-route-cost-diagnostic-plan');
  assert.equal(plan.outputPath, 'reports/capacity/evidence/2026-04-30-p6-route-costs.json');
});

test('route-cost diagnostic plan uses POST lastKnownRevision for not-modified bootstrap', () => {
  const plan = buildRouteCostDiagnosticPlan();
  const family = plan.routeFamilies.find((entry) => entry.id === 'not-modified-bootstrap');

  assert.equal(family.method, 'POST');
  assert.equal(family.endpoint, '/api/bootstrap');
  assert.match(family.probeContract, /lastKnownRevision/);
  assert.ok(family.discoverySources.includes('tests/worker-bootstrap-v2.test.js'));
});

test('route-cost evidence validates required families and redacted aggregate shape', () => {
  const evidence = buildRouteCostEvidence({
    budget: BUDGET_FIXTURE,
    tailCorrelations: [{ path: 'reports/capacity/evidence/tail-correlation.json', data: TAIL_CORRELATION_FIXTURE }],
    generatedAt: '2026-04-30T00:00:00.000Z',
    sourcePaths: { budget: 'reports/capacity/latest-1000-learner-budget.json' },
  });
  const validation = validateRouteCostEvidence(evidence);
  const bootstrap = evidence.routeFamilies.find((entry) => entry.routeFamily === 'full-bootstrap');
  const parent = evidence.routeFamilies.find((entry) => entry.routeFamily === 'parent-summary-hub-read');

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(evidence.modellingOnly, true);
  assert.equal(evidence.certifying, false);
  assert.equal(bootstrap.status, 'measured');
  assert.equal(bootstrap.metrics.workerCpuMsP95, 11);
  assert.equal(parent.status, 'auth-gated');
  assert.equal(parent.metrics.queryCountP95, null);
  assert.match(parent.justification, /authenticated adult\/operator state/);
});

test('route-cost evidence validation fails when a required family is omitted', () => {
  const evidence = buildRouteCostEvidence({ budget: BUDGET_FIXTURE });
  evidence.routeFamilies = evidence.routeFamilies.filter((entry) => entry.routeFamily !== 'hero-read-model');
  const validation = validateRouteCostEvidence(evidence);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /missing required route family: hero-read-model/);
});

test('route-cost evidence validation rejects raw request ids and SQL-like leakage', () => {
  const evidence = buildRouteCostEvidence({ budget: BUDGET_FIXTURE });
  evidence.routeFamilies[0].debug = 'ks2_req_11111111-1111-4111-8111-111111111111 SELECT * FROM child_subject_state';
  const validation = validateRouteCostEvidence(evidence);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /raw ks2 request id/);
  assert.match(validation.errors.join('\n'), /SQL\/table/);
});

test('route-cost evidence validation rejects raw tail paths with Windows separators', () => {
  const evidence = buildRouteCostEvidence({ budget: BUDGET_FIXTURE });
  evidence.routeFamilies[0].sourcePaths.push('reports\\capacity\\evidence\\p6-worker-tail.jsonl');
  const validation = validateRouteCostEvidence(evidence);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /raw tail path/);
});

test('route-cost evidence validation rejects disabled redaction guardrails', () => {
  const evidence = buildRouteCostEvidence({ budget: BUDGET_FIXTURE });
  evidence.redaction.rawStatementNamesPersisted = true;
  evidence.redaction.aggregateOnly = false;
  const validation = validateRouteCostEvidence(evidence);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /raw statement names must not be persisted/);
  assert.match(validation.errors.join('\n'), /aggregate-only/);
});

test('route-cost evidence maps Hero command samples only with explicit command action', () => {
  const evidence = buildRouteCostEvidence({
    tailCorrelations: [{
      path: 'reports/capacity/evidence/hero-tail-correlation.json',
      data: {
        kind: 'capacity-worker-log-correlation',
        redaction: { rawRequestIdsPersisted: false },
        diagnostics: {
          workerLogJoin: {
            samples: [
              {
                endpoint: '/api/hero/command',
                method: 'POST',
                app: { command: 'start-task', wallMs: 120, responseBytes: 500, queryCount: 6, d1RowsRead: 7, d1RowsWritten: 2 },
                cloudflare: { cpuTimeMs: 4, wallTimeMs: 120 },
                capacityRequest: { d1DurationMs: 25, queryCount: 6, d1RowsRead: 7, d1RowsWritten: 2, responseBytes: 500 },
              },
              {
                endpoint: '/api/hero/command',
                method: 'POST',
                app: { command: 'claim-task', wallMs: 150, responseBytes: 600, queryCount: 8, d1RowsRead: 9, d1RowsWritten: 3 },
                cloudflare: { cpuTimeMs: 5, wallTimeMs: 150 },
                capacityRequest: { d1DurationMs: 30, queryCount: 8, d1RowsRead: 9, d1RowsWritten: 3, responseBytes: 600 },
              },
              {
                endpoint: '/api/hero/command',
                method: 'POST',
                app: { command: 'unlock-monster', wallMs: 180, responseBytes: 700, queryCount: 10, d1RowsRead: 11, d1RowsWritten: 4 },
                cloudflare: { cpuTimeMs: 6, wallTimeMs: 180 },
                capacityRequest: { d1DurationMs: 35, queryCount: 10, d1RowsRead: 11, d1RowsWritten: 4, responseBytes: 700 },
              },
              {
                endpoint: '/api/hero/command',
                method: 'POST',
                app: { wallMs: 999, responseBytes: 999, queryCount: 99, d1RowsRead: 99, d1RowsWritten: 99 },
                cloudflare: { cpuTimeMs: 99, wallTimeMs: 999 },
                capacityRequest: { d1DurationMs: 99, queryCount: 99, d1RowsRead: 99, d1RowsWritten: 99, responseBytes: 999 },
              },
            ],
          },
        },
      },
    }],
  });
  const validation = validateRouteCostEvidence(evidence);
  const start = evidence.routeFamilies.find((entry) => entry.routeFamily === 'hero-command-start');
  const claim = evidence.routeFamilies.find((entry) => entry.routeFamily === 'hero-command-claim');
  const camp = evidence.routeFamilies.find((entry) => entry.routeFamily === 'hero-command-camp');

  assert.equal(validation.ok, true);
  assert.equal(start.status, 'measured');
  assert.equal(start.commandAction, 'start');
  assert.equal(start.metrics.workerCpuMsP95, 4);
  assert.equal(claim.status, 'measured');
  assert.equal(claim.commandAction, 'claim');
  assert.equal(claim.metrics.workerCpuMsP95, 5);
  assert.equal(camp.status, 'measured');
  assert.equal(camp.commandAction, 'camp');
  assert.equal(camp.metrics.workerCpuMsP95, 6);
});

test('route-cost evidence round-trips generated budget placeholders as blocked', () => {
  const budget = JSON.parse(readFileSync('reports/capacity/latest-1000-learner-budget.json', 'utf8'));
  const expectedMeasuredFamilies = budget.routeCosts
    .filter((entry) => entry.routeCostStatus === 'measured')
    .length;
  const expectedPartialFamilies = budget.routeCosts
    .filter((entry) => entry.routeCostStatus === 'partial')
    .length;
  const evidence = buildRouteCostEvidence({
    budget,
    generatedAt: '2026-04-30T00:00:00.000Z',
    sourcePaths: { budget: 'reports/capacity/latest-1000-learner-budget.json' },
  });
  const validation = validateRouteCostEvidence(evidence);
  const heroStart = evidence.routeFamilies.find((entry) => entry.routeFamily === 'hero-command-start');
  const notModified = evidence.routeFamilies.find((entry) => entry.routeFamily === 'not-modified-bootstrap');

  assert.equal(validation.ok, true);
  assert.equal(evidence.coverage.complete, false);
  assert.equal(evidence.coverage.measuredRouteFamilies, expectedMeasuredFamilies);
  assert.equal(evidence.coverage.partialRouteFamilies, expectedPartialFamilies);
  assert.equal(
    evidence.coverage.missingRouteFamilies,
    REQUIRED_ROUTE_FAMILIES.length - expectedMeasuredFamilies - expectedPartialFamilies,
  );
  assert.equal(heroStart.status, 'feature-gated');
  assert.equal(heroStart.metrics.count, null);
  assert.match(heroStart.justification, /Hero feature flags/);
  assert.equal(notModified.status, 'requires-production-operator');
  assert.match(notModified.probeContract, /lastKnownRevision/);
  assert.deepEqual(
    notModified.missingMetrics,
    REQUIRED_ROUTE_COST_METRICS,
  );
});

test('route-cost evidence consumes capacity-run summaries without persisting raw request ids', () => {
  const evidence = buildRouteCostEvidence({
    budget: BUDGET_FIXTURE,
    evidenceFiles: [{
      path: 'reports/capacity/evidence/60-learner-stretch-preflight-20260428-p6.json',
      data: {
        reportMeta: { environment: 'production' },
        summary: {
          endpoints: {
            'POST /api/subjects/grammar/command': {
              count: 180,
              p50WallMs: 260.1,
              p95WallMs: 295.2,
              maxWallMs: 325.3,
              queryCountP50: 20,
              queryCountP95: 23,
              queryCountMax: 24,
              d1RowsReadP50: 21,
              d1RowsReadP95: 584,
              d1RowsReadMax: 754,
              d1RowsWrittenP50: 17,
              d1RowsWrittenP95: 36,
              d1RowsWrittenMax: 36,
              p50ResponseBytes: 16735,
              p95ResponseBytes: 30148,
              maxResponseBytes: 30149,
              topTailSamples: [{
                clientRequestId: 'ks2_req_11111111-1111-4111-8111-111111111111',
              }],
            },
          },
        },
      },
    }],
    generatedAt: '2026-04-30T00:00:00.000Z',
  });
  const validation = validateRouteCostEvidence(evidence);
  const grammar = evidence.routeFamilies.find((entry) => entry.routeFamily === 'grammar-command');

  assert.equal(validation.ok, true);
  assert.equal(grammar.status, 'partial');
  assert.equal(grammar.metrics.wallMsP95, 295.2);
  assert.equal(grammar.metrics.queryCountP95, 23);
  assert.equal(grammar.metrics.d1RowsReadP95, 584);
  assert.equal(JSON.stringify(evidence).includes('ks2_req_'), false);
});

test('route-cost evidence validation rejects unsupported statuses', () => {
  const evidence = buildRouteCostEvidence({ budget: BUDGET_FIXTURE });
  evidence.routeFamilies[0].status = 'blocked-or-missing';
  const validation = validateRouteCostEvidence(evidence);

  assert.equal(ALLOWED_ROUTE_COST_STATUSES.includes('blocked-or-missing'), false);
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /unsupported status blocked-or-missing/);
});

test('route-cost diagnostic execute-local writes validated evidence without production credentials', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ks2-route-cost-'));
  try {
    const outputPath = path.join(tempDir, 'route-costs.json');
    const result = await runRouteCostDiagnostic([
      '--execute-local',
      '--output', outputPath,
      '--budget', 'tests/fixtures/capacity-budget-ledger/measured-route-summary.json',
      '--no-default-tail-correlation',
      '--json',
    ], {
      cwd: process.cwd(),
      now: () => new Date('2026-04-30T00:00:00.000Z'),
    });
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));

    assert.equal(result.ok, true);
    assert.equal(written.kind, 'capacity-route-cost-diagnostic');
    assert.equal(written.routeFamilies.length, REQUIRED_ROUTE_FAMILIES.length);
    assert.equal(written.certifying, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('route-cost diagnostic refuses production execution without approval', async () => {
  await assert.rejects(
    () => runRouteCostDiagnostic(['--execute-production']),
    /--execute-production requires --approved-production-run/,
  );
});
