import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Regression guard for scripts/build-bundles.mjs. The orchestrator uses
// awaited dynamic imports inside a try/catch with process.exit(1) so a
// failing child step (e.g. esbuild missing inside build-client.mjs)
// propagates as a non-zero exit to callers like tests/build-public.test.js
// and CI. This test locks in two properties so a future "cleanup" cannot
// silently regress the pattern to static imports (which can let async
// rejections settle after the entry's sync body and leave Node at exit 0).
//   1. The fixture orchestrator, which mirrors the exact try/catch +
//      process.exit(1) pattern against a missing-module import, exits
//      non-zero as expected.
//   2. The real scripts/build-bundles.mjs still carries the try/catch +
//      process.exit(1) shape, so the guarantee in (1) transfers.

test('build-bundles fail-fast fixture exits non-zero on child failure', () => {
  const result = spawnSync(
    process.execPath,
    ['./tests/fixtures/build-bundles-failfast/orchestrator.mjs'],
    { stdio: 'pipe' },
  );

  assert.notEqual(result.status, 0, 'fixture orchestrator must exit non-zero when an awaited import rejects');
  assert.equal(result.status, 1, 'fixture orchestrator should exit with code 1');
  const stderr = result.stderr.toString();
  assert.match(stderr, /ERR_MODULE_NOT_FOUND/, 'stderr should surface the underlying module-not-found error');
});

test('scripts/build-bundles.mjs preserves the try/catch + process.exit(1) pattern', () => {
  const source = readFileSync('scripts/build-bundles.mjs', 'utf8');
  assert.match(source, /try\s*\{/, 'orchestrator must wrap imports in try/catch');
  assert.match(source, /await import\(/, 'orchestrator must use awaited dynamic imports');
  assert.match(source, /process\.exit\(1\)/, 'orchestrator must call process.exit(1) on failure (not just set exitCode)');
  assert.match(source, /console\.error\(/, 'orchestrator must log the error before exiting');
});
