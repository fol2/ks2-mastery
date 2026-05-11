import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const VALIDATOR = resolve(import.meta.dirname, '..', 'scripts/validate-punctuation-qg-p20-expansion-report.mjs');
const CURRENT_REPORT = resolve(import.meta.dirname, '..', 'reports/punctuation/punctuation-qg-p20-expansion-audit.json');
const BASELINE_DUPLICATE_REPORT = resolve(
  import.meta.dirname,
  '..',
  'docs/plans/james/hotfixes/archive/3. punctuation-p20-hotfix-redelivery-0508/validation/baseline-p20-expansion-audit.json',
);

function runValidator(reportPath) {
  return spawnSync(process.execPath, [VALIDATOR, reportPath], {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
  });
}

test('P20 expansion report validator accepts the current duplicate-free report', () => {
  const result = runValidator(CURRENT_REPORT);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /P20 expansion report validation: PASS/);
});

test('P20 expansion report validator rejects stale fixed-bank duplicate reports', () => {
  const result = runValidator(BASELINE_DUPLICATE_REPORT);

  assert.notEqual(result.status, 0, 'baseline duplicate report unexpectedly passed validation');
  assert.match(result.stderr, /legacy fixed-bank duplicate surface groups must be zero/);
  assert.match(result.stderr, /"legacyFixedDuplicateSurfaceGroups": 6/);
});
