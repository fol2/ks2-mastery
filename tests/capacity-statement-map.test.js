import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildCapacityStatementMap,
  readStatementMapInput,
  runCapacityStatementMap,
} from '../scripts/build-capacity-statement-map.mjs';

const FIXTURE_DIR = new URL('./fixtures/capacity-statement-map/', import.meta.url);

function fixturePath(name) {
  return new URL(name, FIXTURE_DIR).pathname;
}

function readJsonFixture(name) {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8'));
}

test('statement map ranks complete capacity.request logs and accepts only backed query-plan notes', () => {
  const records = readStatementMapInput(fixturePath('capacity-request-complete.jsonl'));
  const queryPlan = readJsonFixture('query-plan-notes.json');
  const report = buildCapacityStatementMap({
    records,
    queryPlan,
    limit: 10,
    generatedAt: '2026-04-29T00:00:00.000Z',
  });

  assert.equal(report.certifying, false);
  assert.equal(report.modellingOnly, true);
  assert.equal(report.coverage.status, 'complete');
  assert.equal(report.coverage.canRecommendQueryShape, true);
  assert.equal(report.topStatements.length, 10);
  assert.equal(
    report.topStatements[0].statement,
    'all:SELECT * FROM child_subject_state WHERE account_id = ? AND learner_id IN (?)',
  );
  assert.equal(report.topStatements[0].durationMsTotal, 103);
  assert.equal(report.topStatements[0].rowsReadTotal, 59);
  assert.equal(report.queryPlanShortlist.accepted.length, 1);
  assert.equal(report.queryPlanShortlist.accepted[0].route, 'GET /api/bootstrap');
  assert.equal(report.queryPlanShortlist.accepted[0].expectedReadReduction.includes('child_subject_state'), true);
  assert.deepEqual(
    report.queryPlanShortlist.refused.map((entry) => entry.reason).sort(),
    ['missing-query-plan-fields', 'statement-not-observed'],
  );
});

test('statement map preserves truncated statement evidence and refuses recommendations when coverage is incomplete', () => {
  const records = readStatementMapInput(fixturePath('capacity-request-incomplete.json'));
  const queryPlan = readJsonFixture('query-plan-notes.json');
  const report = buildCapacityStatementMap({
    records,
    queryPlan,
    generatedAt: '2026-04-29T00:00:00.000Z',
  });

  assert.equal(report.coverage.status, 'insufficient');
  assert.equal(report.coverage.canRecommendQueryShape, false);
  assert.equal(report.coverage.statementsTruncated.count, 1);
  assert.deepEqual(report.coverage.statementsTruncated.requestIds, [
    'ks2_req_00000000-0000-4000-8000-000000000011',
  ]);
  assert.equal(report.coverage.incompleteRequests.length, 2);
  assert.equal(report.coverage.incompleteRequests[0].reasons.includes('statement-log-sampled-out'), true);
  assert.equal(report.coverage.incompleteRequests[1].reasons.includes('statements-truncated'), true);
  assert.equal(report.queryPlanShortlist.accepted.length, 0);
  assert.equal(report.queryPlanShortlist.recommendationStatus, 'refused-incomplete-statement-data');
  assert.equal(
    report.queryPlanShortlist.refused.every((entry) => entry.reason === 'insufficient-statement-log-coverage'),
    true,
  );
});

test('statement map CLI writes deterministic JSON from fixtures', async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ks2-statement-map-'));
  try {
    const outputPath = path.join(tempDir, 'statement-map.json');
    const result = await runCapacityStatementMap([
      '--input', fixturePath('capacity-request-complete.jsonl'),
      '--query-plan', fixturePath('query-plan-notes.json'),
      '--output', outputPath,
      '--limit', '3',
    ], {
      cwd: process.cwd(),
      now: () => new Date('2026-04-29T00:00:00.000Z'),
    });

    assert.equal(result.ok, true);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(written.generatedAt, '2026-04-29T00:00:00.000Z');
    assert.equal(written.topStatements.length, 3);
    assert.equal(written.coverage.status, 'complete');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
