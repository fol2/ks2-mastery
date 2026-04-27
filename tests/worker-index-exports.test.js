// Capacity (local harness) contract: the Worker entry module
// (`worker/src/index.js`) must export ONLY the surface that workerd
// validates — `default { fetch, scheduled }` and the `LearnerLock`
// Durable Object class. Any additional named exports (utility functions,
// constants) cause workerd to reject the module during `wrangler dev
// --local`, blocking the local capacity harness.
//
// This test acts as a regression gate: if a future PR accidentally
// re-exports a helper or constant from index.js, this assertion fails
// before the change reaches the capacity harness or production deploy.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as indexModule from '../worker/src/index.js';

// The set of named exports workerd expects from the main module.
// `default` is the module's default export (the { fetch, scheduled }
// handler object) and is always present on the namespace object.
// `LearnerLock` is the Durable Object class declared in wrangler.jsonc.
const ALLOWED_EXPORTS = new Set(['default', 'LearnerLock']);

test('worker/src/index.js exports only the workerd-compatible surface (default + LearnerLock)', () => {
  const actualExports = new Set(Object.keys(indexModule));
  const unexpected = [...actualExports].filter((key) => !ALLOWED_EXPORTS.has(key));

  assert.deepStrictEqual(
    unexpected,
    [],
    `index.js must not export anything beyond ${[...ALLOWED_EXPORTS].join(', ')}. ` +
    `Found unexpected exports: ${unexpected.join(', ')}. ` +
    'Move helpers/constants to a separate module and import them from there.',
  );

  // Positive assertions: the required exports are present and shaped correctly.
  assert.ok(indexModule.default, 'default export must be present');
  assert.equal(typeof indexModule.default.fetch, 'function', 'default.fetch must be a function');
  assert.equal(typeof indexModule.default.scheduled, 'function', 'default.scheduled must be a function');
  assert.equal(typeof indexModule.LearnerLock, 'function', 'LearnerLock must be a class/function');
});
