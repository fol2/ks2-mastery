// R6.AC6 — Grammar QG P19 smart-practice audit output must remain byte-
// identical to the committed pre-optimisation baseline. The audit is the
// canonical end-to-end check that no observable selection behaviour changed
// under the R6 memoisation. See docs/contracts/ci-shard-balance.md R6.AC6.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const AUDIT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'audit-grammar-qg-p19-smart-practice.mjs');
const BASELINE_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'grammar-p19-audit-baseline.txt');

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normaliseStdout(stdout) {
  // Replace absolute repo-root prefix with ${REPO_ROOT} so the baseline is
  // portable across machines and CI. Normalise CRLF → LF and backslashes → /
  // inside path-like tokens so this test is stable on Windows checkouts — the
  // baseline is captured with POSIX separators.
  const withLf = stdout.replace(/\r\n/g, '\n');
  const rootPattern = new RegExp(escapeRegExp(REPO_ROOT), 'g');
  const withRoot = withLf.replace(rootPattern, '${REPO_ROOT}');
  return withRoot.replace(/\$\{REPO_ROOT\}[^\s]*/g, (m) => m.replace(/\\/g, '/'));
}

test('R6.AC6 — P19 smart-practice audit output is byte-identical to baseline', () => {
  const stdout = execSync(`node "${AUDIT_SCRIPT}"`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const actual = normaliseStdout(stdout);
  const expected = readFileSync(BASELINE_PATH, 'utf8').replace(/\r\n/g, '\n');
  assert.equal(actual, expected, 'P19 audit stdout drifted from baseline; R6 parity broken.');
});
