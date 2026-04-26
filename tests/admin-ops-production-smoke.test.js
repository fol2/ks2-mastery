// U6 (P1.5 Phase B): opt-in contract for the admin-ops production
// smoke. Set `KS2_PRODUCTION_SMOKE=1` in the environment to actually
// hit the live `https://ks2.eugnel.uk` deployment end-to-end. Without
// the env flag, the harness asserts the skip contract: the script
// module loads cleanly and exposes `runSmoke`/`main` without executing
// the live workflow.
//
// The live run REQUIRES two env vars (`KS2_SMOKE_ACCOUNT_EMAIL` +
// `KS2_SMOKE_ACCOUNT_PASSWORD`) pointing at the dedicated smoke
// service account. See `docs/hardening/admin-ops-smoke-setup.md` for
// the runbook.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXIT_OK,
  EXIT_USAGE,
  main,
  runSmoke,
} from '../scripts/admin-ops-production-smoke.mjs';

const PRODUCTION_SMOKE_ENABLED = process.env.KS2_PRODUCTION_SMOKE === '1';

test('admin-ops production smoke module exposes runSmoke + main + exit codes', () => {
  assert.equal(typeof runSmoke, 'function');
  assert.equal(typeof main, 'function');
  assert.equal(EXIT_OK, 0);
  assert.equal(EXIT_USAGE, 2);
});

test('admin-ops production smoke exits with EXIT_USAGE when required env vars are missing', async () => {
  const envelopes = [];
  const emit = (envelope) => envelopes.push(envelope);
  const code = await runSmoke({ env: {}, emit });
  assert.equal(code, EXIT_USAGE);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].ok, false);
  assert.equal(envelopes[0].exit_code, EXIT_USAGE);
  assert.ok(
    /KS2_SMOKE_ACCOUNT_EMAIL/.test(envelopes[0].error || ''),
    'should mention missing email env var',
  );
});

test('admin-ops production smoke exits with EXIT_USAGE on malformed base URL', async () => {
  const envelopes = [];
  const emit = (envelope) => envelopes.push(envelope);
  const code = await runSmoke({
    env: {
      KS2_SMOKE_ACCOUNT_EMAIL: 'smoke@example.com',
      KS2_SMOKE_ACCOUNT_PASSWORD: 'placeholder',
      KS2_SMOKE_BASE_URL: 'not a url::',
    },
    emit,
  });
  assert.equal(code, EXIT_USAGE);
  assert.equal(envelopes[0].ok, false);
  assert.ok(
    /KS2_SMOKE_BASE_URL/.test(envelopes[0].error || ''),
    'should mention KS2_SMOKE_BASE_URL in the error',
  );
});

test(
  'admin-ops production smoke — live end-to-end run against ks2.eugnel.uk',
  { skip: !PRODUCTION_SMOKE_ENABLED },
  async () => {
    // Only runs when KS2_PRODUCTION_SMOKE=1 is explicitly set in CI or
    // by a human operator. Actually hits the live deployment.
    const envelopes = [];
    const emit = (envelope) => envelopes.push(envelope);
    const code = await runSmoke({ emit });
    assert.equal(code, EXIT_OK, `live smoke failed: ${JSON.stringify(envelopes[0] || {}, null, 2)}`);
    assert.equal(envelopes[0]?.ok, true);
    assert.ok(Array.isArray(envelopes[0]?.steps) && envelopes[0].steps.length >= 6);
  },
);
