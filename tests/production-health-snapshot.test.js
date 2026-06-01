import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildD1HealthSql,
  parseArgs,
  parseWranglerJsonOutput,
  summariseD1Results,
  summariseHttpSamples,
} from '../scripts/production-health-snapshot.mjs';

test('production health snapshot defaults to read-only production probes', () => {
  const options = parseArgs([]);

  assert.equal(options.origin, 'https://ks2.eugnel.uk');
  assert.equal(options.samples, 5);
  assert.equal(options.skipD1, false);
  assert.equal(options.includeRowCounts, false);
});

test('ops health production package script is explicit and not a load test', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const script = pkg.scripts?.['ops:health:production'] || '';

  assert.equal(script, 'node ./scripts/production-health-snapshot.mjs');
  assert.doesNotMatch(script, /classroom-load-test|demo-sessions|submit-answer/);
  assert.doesNotMatch(script, /\bnpx\s+wrangler\b/);
});

test('D1 health SQL uses schema metadata by default and no table counts', () => {
  const sql = buildD1HealthSql();

  assert.match(sql, /SELECT 1 AS read_only_probe/);
  assert.match(sql, /sqlite_master/);
  assert.match(sql, /idx_event_log_learner_created/);
  assert.match(sql, /idx_mutation_receipts_scope/);
  assert.doesNotMatch(sql, /COUNT\(\*\)/);
  assert.doesNotMatch(sql, /PRAGMA/i);
  assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
});

test('D1 health SQL makes row counts opt-in', () => {
  const sql = buildD1HealthSql({ includeRowCounts: true });

  assert.match(sql, /COUNT\(\*\) AS row_count/);
  assert.match(sql, /FROM practice_sessions/);
});

test('production health snapshot parses Wrangler JSON with surrounding output', () => {
  const parsed = parseWranglerJsonOutput('noise\n[{"results":[{"ok":1}],"success":true,"meta":{"rows_written":0}}]\n');

  assert.equal(parsed[0].results[0].ok, 1);
  assert.equal(parsed[0].meta.rows_written, 0);
});

test('D1 summary fails closed if the probe writes or schema drift is present', () => {
  const summary = summariseD1Results([
    { results: [{ read_only_probe: 1 }], meta: { changed_db: true, rows_read: 0, rows_written: 1, size_after: 1024 } },
    {
      results: [
        { kind: 'required_table', name: 'event_log', present: 0, expected_present: 1 },
        { kind: 'removed_write_amplifying_index', name: 'idx_mutation_receipts_scope', present: 1, expected_present: 0 },
      ],
      meta: { changed_db: false, rows_read: 2, rows_written: 0, size_after: 1024 },
    },
  ]);

  assert.equal(summary.ok, false);
  assert.equal(summary.rowsWritten, 1);
  assert.deepEqual(summary.missingRequired, ['required_table:event_log']);
  assert.deepEqual(summary.presentRemoved, ['removed_write_amplifying_index:idx_mutation_receipts_scope']);
  assert.equal(summary.failures.length, 4);
});

test('HTTP sample summary exposes p95 and failures without response bodies', () => {
  const summary = summariseHttpSamples([
    { ok: true, status: 200, wallMs: 10 },
    { ok: true, status: 200, wallMs: 20 },
    { ok: false, status: 503, wallMs: 30, error: 'server5xx' },
  ]);

  assert.equal(summary.sampleCount, 3);
  assert.equal(summary.okCount, 2);
  assert.equal(summary.p95WallMs, 30);
  assert.deepEqual(summary.statuses, { 200: 2, 503: 1 });
  assert.deepEqual(summary.failures, [{ status: 503, error: 'server5xx' }]);
});
