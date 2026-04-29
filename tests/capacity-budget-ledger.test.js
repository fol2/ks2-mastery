import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CLOUDFLARE_FREE_LIMITS,
  DEFAULT_BUDGET_LEDGER_JSON_PATH,
  buildCapacityBudgetLedger,
  parseBudgetLedgerArgs,
  renderBudgetLedgerMarkdown,
  runCapacityBudgetLedger,
} from '../scripts/build-capacity-budget-ledger.mjs';

const FIXTURE_DIR = new URL('./fixtures/capacity-budget-ledger/', import.meta.url);

function fixturePath(name) {
  return new URL(name, FIXTURE_DIR).pathname;
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
  assert.match(parsed.jsonOutputPath, /reports\/capacity\/latest-.*\.json$/);
  assert.equal(parsed.markdownOutputPath, 'docs/operations/capacity-1000-learner-free-tier-budget.md');
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
