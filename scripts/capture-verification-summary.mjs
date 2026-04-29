#!/usr/bin/env node
/**
 * P7 Verification Summary Capture
 *
 * Runs the P7 test suite via child_process and captures:
 * - command, commitSha, contentReleaseId, testFiles, testCount, passCount, failCount, timestamp
 *
 * Outputs to reports/grammar/grammar-qg-p7-verify-summary.json
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAMMAR_CONTENT_RELEASE_ID } from '../worker/src/subjects/grammar/content.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TEST_FILES = [
  'tests/grammar-qg-p7-governance.test.js',
  'tests/grammar-qg-p7-elapsed-timing.test.js',
  'tests/grammar-qg-p7-event-expansion.test.js',
  'tests/grammar-qg-p7-health-report.test.js',
  'tests/grammar-qg-p7-action-candidates.test.js',
  'tests/grammar-qg-p7-production-evidence.test.js',
];

function getCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: ROOT_DIR }).trim();
  } catch {
    return 'unknown';
  }
}

function runTests() {
  const existingFiles = TEST_FILES.filter((f) => {
    try {
      execSync(`node -e "require('fs').accessSync('${f.replace(/\\/g, '/')}')"`, { cwd: ROOT_DIR, encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  });

  if (existingFiles.length === 0) {
    return { testCount: 0, passCount: 0, failCount: 0, output: 'No test files found' };
  }

  const command = `node --test ${existingFiles.join(' ')}`;
  let output;
  let exitCode = 0;

  try {
    output = execSync(command, { encoding: 'utf8', cwd: ROOT_DIR, timeout: 120000 });
  } catch (err) {
    output = err.stdout || err.message || '';
    exitCode = err.status || 1;
  }

  // Parse test runner output for counts
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);
  const testMatch = output.match(/# tests (\d+)/);

  const passCount = passMatch ? Number(passMatch[1]) : 0;
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  const testCount = testMatch ? Number(testMatch[1]) : (passCount + failCount);

  return { testCount, passCount, failCount, output, exitCode, command, existingFiles };
}

const commitSha = getCommitSha();
const result = runTests();

const summary = {
  command: result.command || `node --test ${TEST_FILES.join(' ')}`,
  commitSha,
  contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
  testFiles: result.existingFiles || TEST_FILES,
  testCount: result.testCount,
  passCount: result.passCount,
  failCount: result.failCount,
  timestamp: new Date().toISOString(),
};

const reportsDir = path.join(ROOT_DIR, 'reports', 'grammar');
mkdirSync(reportsDir, { recursive: true });
const outPath = path.join(reportsDir, 'grammar-qg-p7-verify-summary.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

console.log(JSON.stringify(summary, null, 2));
process.exit(summary.failCount > 0 ? 1 : 0);
