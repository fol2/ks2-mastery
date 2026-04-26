// U5 (sys-hardening p1): runner-arg filter tests.
//
// `scripts/run-node-tests.mjs` prepends auto-discovered test files when
// the caller has NOT supplied any positional. When the caller DOES
// supply a positional (e.g. `npm test -- tests/smoke.test.js`), the
// runner must honour that path exactly — otherwise a targeted debug
// run silently expands to the whole suite.
//
// These tests exercise `hasUserPositional` + `buildSpawnArgs` without
// actually spawning `node --test`, so they stay fast and do not depend
// on the full repo test layout.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSpawnArgs, hasUserPositional } from '../scripts/run-node-tests.mjs';

test('hasUserPositional: bare file path counts as positional', () => {
  assert.equal(hasUserPositional(['tests/smoke.test.js']), true);
});

test('hasUserPositional: node-style flag alone is not positional', () => {
  assert.equal(hasUserPositional(['--test-reporter=spec']), false);
  assert.equal(hasUserPositional(['-t', 'some pattern']), false);
});

test('hasUserPositional: detached flag value is not positional', () => {
  // `--reporter spec` → `spec` is the value, not a test file.
  assert.equal(hasUserPositional(['--reporter', 'spec']), false);
});

test('hasUserPositional: flag value followed by a bare file is positional', () => {
  assert.equal(
    hasUserPositional(['--reporter', 'spec', 'tests/smoke.test.js']),
    true,
  );
});

test('hasUserPositional: empty args is not positional', () => {
  assert.equal(hasUserPositional([]), false);
});

test('buildSpawnArgs: bare file path skips auto-discovery', async () => {
  const args = await buildSpawnArgs(
    ['tests/smoke.test.js'],
    async () => {
      throw new Error('discover must NOT be invoked when user passes a path');
    },
  );
  assert.deepEqual(args, ['--test', 'tests/smoke.test.js']);
});

test('buildSpawnArgs: no positional prepends discovered files', async () => {
  const args = await buildSpawnArgs(
    ['--test-reporter=spec'],
    async () => ['/abs/a.test.js', '/abs/b.test.js'],
  );
  assert.deepEqual(args, [
    '--test',
    '--test-reporter=spec',
    '/abs/a.test.js',
    '/abs/b.test.js',
  ]);
});

test('buildSpawnArgs: detached flag value is not treated as positional', async () => {
  // `--reporter spec` should not be mistaken for a file path.
  const args = await buildSpawnArgs(
    ['--reporter', 'spec'],
    async () => ['/abs/a.test.js'],
  );
  assert.deepEqual(args, ['--test', '--reporter', 'spec', '/abs/a.test.js']);
});

test('buildSpawnArgs: empty discovery with no positional throws', async () => {
  await assert.rejects(
    async () => buildSpawnArgs([], async () => []),
    /no test files discovered/,
  );
});
