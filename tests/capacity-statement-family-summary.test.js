import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStatementFamilySummary,
  classifyBootstrapStatementFamily,
  formatStatementFamilySummaryMarkdown,
  redactDiagnosticRequestId,
  redactDiagnosticStatementId,
} from '../scripts/build-capacity-statement-family-summary.mjs';

const RAW_REQUEST_ID = 'ks2_req_00000000-0000-4000-8000-000000000001';

function makeBootstrapRecord() {
  return {
    event: 'capacity.request',
    requestId: RAW_REQUEST_ID,
    endpoint: '/api/bootstrap',
    method: 'GET',
    status: 200,
    queryCount: 5,
    d1RowsRead: 5,
    d1RowsWritten: 0,
    statementsTruncated: false,
    statements: [
      {
        name: 'first:SELECT s.id AS session_id FROM account_sessions s JOIN adult_accounts a ON a.id = s.account_id WHERE s.session_hash = ?',
        rowsRead: 1,
        rowsWritten: null,
        durationMs: 41,
      },
      {
        name: 'first:INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at) VALUES (...) RETURNING *',
        rowsRead: 1,
        rowsWritten: null,
        durationMs: 39,
      },
      {
        name: 'first:SELECT id, account_type, demo_expires_at FROM adult_accounts WHERE id = ?',
        rowsRead: 1,
        rowsWritten: null,
        durationMs: 31,
      },
      {
        name: 'first:SELECT * FROM adult_accounts WHERE id = ?',
        rowsRead: 1,
        rowsWritten: null,
        durationMs: 37,
      },
      {
        name: 'all:SELECT learner_id, subject_id, ui_json, data_json, updated_at FROM child_subject_state WHERE learner_id IN (?)',
        rowsRead: 1,
        rowsWritten: 0,
        durationMs: 2,
      },
    ],
  };
}

test('P7 statement-family summary classifies bootstrap statements without raw SQL leaks', () => {
  const record = makeBootstrapRecord();
  const tailCorrelation = {
    diagnostics: {
      workerLogJoin: {
        samples: [
          {
            requestId: redactDiagnosticRequestId(RAW_REQUEST_ID),
            method: 'GET',
            endpoint: '/api/bootstrap',
            capacityRequest: {
              statements: record.statements.map((statement) => ({
                statementId: redactDiagnosticStatementId(statement.name),
                rowsRead: statement.rowsRead,
                rowsWritten: statement.rowsWritten,
                durationMs: statement.durationMs,
              })),
            },
          },
        ],
      },
    },
  };

  const report = buildStatementFamilySummary({
    records: [record],
    tailCorrelation,
    runId: 'fixture-run',
    generatedAt: '2026-05-01T00:00:00.000Z',
  });
  const markdown = formatStatementFamilySummaryMarkdown(report);
  const serialised = `${JSON.stringify(report)}\n${markdown}`;

  assert.equal(report.certifying, false);
  assert.equal(report.modellingOnly, true);
  assert.equal(report.source.requestCount, 1);
  assert.equal(report.source.topTailSampleCount, 1);
  assert.equal(report.rankedCandidates.length, 2);
  assert.deepEqual(report.rankedCandidates.map((entry) => entry.family), [
    'account-row-selected-learner',
    'demo-active-account-guard',
  ]);
  assert.equal(report.statementFamilies.some((entry) => entry.family === 'child-subject-state'), true);
  assert.equal(classifyBootstrapStatementFamily(record.statements[0].name), 'auth-session-account-row');

  assert.doesNotMatch(serialised, /ks2_req_/);
  assert.doesNotMatch(serialised, /\b(SELECT|INSERT|UPDATE|DELETE)\s/i);
  assert.doesNotMatch(serialised, /adult_accounts|account_sessions|child_subject_state/i);
  assert.doesNotMatch(serialised, /operator@example|display_name|session_hash/i);
  assert.doesNotMatch(serialised, /ks2_session=|Authorization:\s*Bearer|Bearer\s+[A-Za-z0-9._-]{12,}/i);
});
