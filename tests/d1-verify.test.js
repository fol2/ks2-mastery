import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseWranglerJsonOutput,
  sqlForWranglerCommand,
  summariseVerificationResults,
} from '../scripts/d1-verify.mjs';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('D1 verifier sends SQL as a command after removing leading line comments', () => {
  const sql = sqlForWranglerCommand('\uFEFF-- release gate\n\n  -- every row must pass\nWITH checks AS (SELECT 1)\nSELECT * FROM checks;');
  assert.equal(sql.startsWith('WITH checks'), true);
  assert.match(sql, /SELECT \* FROM checks;$/);
});

test('D1 verifier parses Wrangler JSON even when Wrangler prints a prefix', () => {
  const parsed = parseWranglerJsonOutput('Wrangler notice\n[{"success":true,"results":[]}]\n');
  assert.equal(parsed[0].success, true);
});

test('D1 verifier fails closed on a bad check, empty output, or writes', () => {
  const passed = summariseVerificationResults([{
    success: true,
    results: [{ check_name: 'readiness', expected: 1, actual: 1, ok: 1 }],
    meta: { rows_read: 4, rows_written: 0, changed_db: false },
  }]);
  assert.equal(passed.ok, true);
  assert.equal(passed.rowsRead, 4);

  const failedCheck = summariseVerificationResults([{
    success: true,
    results: [{ check_name: 'readiness', expected: 1, actual: 0, ok: 0 }],
    meta: { rows_read: 4, rows_written: 0, changed_db: false },
  }]);
  assert.equal(failedCheck.ok, false);
  assert.equal(failedCheck.failedRows.length, 1);

  assert.equal(summariseVerificationResults([]).ok, false);
  assert.equal(summariseVerificationResults([{
    success: true,
    results: [{ check_name: 'readiness', expected: 1, actual: 1, ok: 1 }],
    meta: { rows_read: 4, rows_written: 1, changed_db: true },
  }]).ok, false);
});

test('package verifier scripts use the OAuth-safe row-checking runner', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.equal(
    pkg.scripts['db:verify:0023:remote'],
    'node ./scripts/d1-verify.mjs ./worker/recovery/0023_verify_cutover.sql',
  );
  assert.equal(
    pkg.scripts['db:verify:0024:remote'],
    'node ./scripts/d1-verify.mjs ./worker/recovery/0024_verify_post_mega_preimages.sql',
  );
});
