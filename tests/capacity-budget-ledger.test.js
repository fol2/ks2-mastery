import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLOUDFLARE_FREE_LIMITS,
  DEFAULT_BUDGET_LEDGER_JSON_PATH,
  buildCapacityBudgetLedger,
  parseBudgetLedgerArgs,
  renderBudgetLedgerMarkdown,
  runCapacityBudgetLedger,
} from '../scripts/build-capacity-budget-ledger.mjs';
import {
  buildRouteCostEvidence,
} from '../scripts/plan-route-cost-diagnostic.mjs';

const FIXTURE_DIR = new URL('./fixtures/capacity-budget-ledger/', import.meta.url);

function fixturePath(name) {
  return fileURLToPath(new URL(name, FIXTURE_DIR));
}

function readEvidenceFixture(name) {
  return {
    path: `tests/fixtures/capacity-budget-ledger/${name}`,
    data: JSON.parse(readFileSync(fixturePath(name), 'utf8')),
  };
}

test('budget ledger calculates 1000-learner scenarios from measured route costs', () => {
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles: [readEvidenceFixture('measured-route-summary.json')],
    learnerCounts: [1000],
    generatedAt: '2026-04-29T00:00:00.000Z',
  });

  const expected = ledger.scenarios[0].modes.expected;
  assert.equal(ledger.certifying, false);
  assert.equal(ledger.modellingOnly, true);
  assert.equal(expected.totals.dynamicRequestsPerDay, 36015);
  assert.equal(expected.quotaUse.dynamicRequestsPerDay.status, 'green');
  assert.equal(expected.totals.d1RowsReadPerDay, 16479225);
  assert.equal(expected.quotaUse.d1RowsReadPerDay.status, 'red');
  assert.equal(expected.totals.d1RowsWrittenPerDay, 94605);
  assert.equal(expected.quotaUse.d1RowsWrittenPerDay.status, 'red');
  assert.equal(expected.workerCpu.status, 'green');
  assert.equal(
    expected.phase2Recommendations.some((entry) => entry.protects.includes('D1 rows read/day')),
    true,
  );
  assert.equal(
    expected.phase2Recommendations.some((entry) => entry.protects.includes('D1 rows written/day')),
    true,
  );
});

test('budget ledger keeps missing CPU joins unknown without losing request and D1 modelling', () => {
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles: [readEvidenceFixture('measured-route-summary-missing-cpu.json')],
    learnerCounts: [60],
    generatedAt: '2026-04-29T00:00:00.000Z',
  });

  const model = ledger.scenarios[0].modes.expected;
  assert.equal(ledger.certification.status, 'non-certifying-modelling');
  assert.equal(ledger.sources[0].inputCertifying, true);
  assert.equal(ledger.sources[0].usedForCertification, false);
  assert.equal(model.workerCpu.status, 'unknown');
  assert.equal(model.workerCpu.reason, 'missing-worker-cpu-join');
  assert.equal(model.totals.dynamicRequestsPerDay > 0, true);
  assert.equal(model.totals.d1RowsReadPerDay > 0, true);
  assert.equal(model.warnings.includes('missing-measured-parent-admin-route-cost'), true);
});

test('budget ledger consumes route-cost evidence and tail-correlation CPU coverage', () => {
  const routeCosts = buildRouteCostEvidence({
    budget: {
      routeCosts: [
        {
          route: 'POST /api/demo/session',
          count: 2,
          queryCountP95: 4,
          d1RowsReadP95: 5,
          d1RowsWrittenP95: 1,
          responseBytesP95: 155,
        },
        {
          route: 'POST /api/subjects/grammar/command',
          count: 6,
          queryCountP95: 22,
          d1RowsReadP95: 499,
          d1RowsWrittenP95: 32,
          responseBytesP95: 29596,
        },
      ],
    },
    tailCorrelations: [{
      path: 'reports/capacity/evidence/p5-tail-correlation.json',
      data: {
        kind: 'capacity-worker-log-correlation',
        redaction: { rawRequestIdsPersisted: false },
        diagnostics: {
          workerLogJoin: {
            samples: [{
              endpoint: '/api/bootstrap',
              method: 'GET',
              app: { wallMs: 700, responseBytes: 2500, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0 },
              cloudflare: { cpuTimeMs: 6, wallTimeMs: 240 },
              capacityRequest: { d1DurationMs: 180, queryCount: 11, d1RowsRead: 9, d1RowsWritten: 0, responseBytes: 2500 },
            }],
          },
        },
      },
    }],
    generatedAt: '2026-04-30T00:00:00.000Z',
  });
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles: [{ path: 'reports/capacity/evidence/p5-route-costs.json', data: routeCosts }],
    learnerCounts: [1000],
    generatedAt: '2026-04-30T00:00:00.000Z',
  });
  const expected = ledger.scenarios[0].modes.expected;

  assert.equal(ledger.modellingOnly, true);
  assert.equal(ledger.certifying, false);
  assert.equal(ledger.routeFamilyCoverage.measured, 1);
  assert.equal(ledger.routeFamilyCoverage.partial, 2);
  assert.equal(ledger.routeFamilyCoverage.missing, 9);
  assert.notEqual(expected.workerCpu.status, 'unknown');
  assert.ok(ledger.routeFamilyCoverage.families.some((entry) => (
    entry.routeFamily === 'full-bootstrap' && entry.routes.includes('GET /api/bootstrap')
  )));
  assert.ok(ledger.missingRouteCosts.some((entry) => (
    entry.routeFamily === 'parent-summary-hub-read' && entry.status === 'auth-gated'
  )));
  assert.ok(ledger.missingRouteCosts.some((entry) => (
    entry.routeFamily === 'hero-read-model' && entry.status === 'feature-gated'
  )));
});

test('budget ledger keeps Hero command tail costs split by explicit command action', () => {
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles: [{
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
                app: { command: 'start-task', wallMs: 100, responseBytes: 500, queryCount: 6, d1RowsRead: 7, d1RowsWritten: 2 },
                cloudflare: { cpuTimeMs: 4, wallTimeMs: 100 },
                capacityRequest: { d1DurationMs: 25, queryCount: 6, d1RowsRead: 7, d1RowsWritten: 2, responseBytes: 500 },
              },
              {
                endpoint: '/api/hero/command',
                method: 'POST',
                app: { command: 'claim-task', wallMs: 140, responseBytes: 600, queryCount: 8, d1RowsRead: 9, d1RowsWritten: 3 },
                cloudflare: { cpuTimeMs: 5, wallTimeMs: 140 },
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
    learnerCounts: [30],
    generatedAt: '2026-04-30T00:00:00.000Z',
  });

  const heroCosts = ledger.routeCosts.filter((entry) => entry.route === 'POST /api/hero/command');
  assert.deepEqual(
    heroCosts
      .map((entry) => [entry.routeFamily, entry.commandAction, entry.workerCpuMsP95])
      .sort((left, right) => left[0].localeCompare(right[0])),
    [
      ['hero-command-camp', 'camp', 6],
      ['hero-command-claim', 'claim', 5],
      ['hero-command-start', 'start', 4],
    ],
  );
  assert.equal(heroCosts.some((entry) => entry.workerCpuMsP95 === 99), false);
});

test('budget ledger refuses unsupported Cloudflare Free limit values', () => {
  assert.throws(
    () => buildCapacityBudgetLedger({
      evidenceFiles: [readEvidenceFixture('measured-route-summary.json')],
      limits: {
        ...CLOUDFLARE_FREE_LIMITS,
        d1RowsReadPerDay: 0,
      },
    }),
    /Unsupported Cloudflare Free limit values: d1RowsReadPerDay/,
  );
});

test('budget ledger CLI writes latest-pattern JSON and tracked markdown outputs', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ks2-budget-ledger-'));
  try {
    const jsonOutput = path.join(tempDir, 'latest-1000-learner-budget.json');
    const markdownOutput = path.join(tempDir, 'capacity-1000-learner-free-tier-budget.md');
    const result = await runCapacityBudgetLedger([
      '--input', fixturePath('measured-route-summary.json'),
      '--learners', '30,1000',
      '--json-output', jsonOutput,
      '--markdown-output', markdownOutput,
    ], {
      cwd: process.cwd(),
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    });

    assert.equal(result.ok, true);
    assert.match(path.basename(jsonOutput), /^latest-.*\.json$/);
    const written = JSON.parse(readFileSync(jsonOutput, 'utf8'));
    assert.equal(written.scenarios.length, 2);
    const markdown = readFileSync(markdownOutput, 'utf8');
    assert.match(markdown, /Non-certifying modelling worksheet/);
    assert.match(markdown, /1000 \| expected/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('budget ledger defaults to tracked docs output and latest JSON pattern', () => {
  const parsed = parseBudgetLedgerArgs(['--input', fixturePath('measured-route-summary.json')]);
  assert.equal(parsed.jsonOutputPath, DEFAULT_BUDGET_LEDGER_JSON_PATH);
  assert.match(parsed.jsonOutputPath.replace(/\\/g, '/'), /reports\/capacity\/latest-.*\.json$/);
  assert.equal(parsed.markdownOutputPath.replace(/\\/g, '/'), 'docs/operations/capacity-1000-learner-free-tier-budget.md');
});

test('budget ledger markdown labels modelling as non-certifying', () => {
  const ledger = buildCapacityBudgetLedger({
    evidenceFiles: [readEvidenceFixture('measured-route-summary.json')],
    learnerCounts: [30],
    generatedAt: '2026-04-29T00:00:00.000Z',
  });
  const markdown = renderBudgetLedgerMarkdown(ledger);
  assert.match(markdown, /does not certify 30, 60, 100, 300, or 1000 learner capacity/);
  assert.match(markdown, /internal planning ledger, not a launch claim/);
});
