import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoSessionStarter } from '../src/platform/auth/demo-start-guard.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

test('demo start guard collapses rapid concurrent starts into one create request', async () => {
  let releaseRequest;
  const calls = [];
  const location = { href: '' };
  const startDemoSession = createDemoSessionStarter({
    location,
    clearAdminReturn() {},
    credentialFetch(input, init) {
      calls.push({ input, init });
      return new Promise((resolve) => {
        releaseRequest = () => resolve(jsonResponse({
          ok: true,
          session: { accountId: 'demo-account-a', demo: true },
        }, 201));
      });
    },
  });

  const first = startDemoSession();
  const second = startDemoSession();

  assert.strictEqual(second, first);
  assert.equal(calls.length, 1);
  releaseRequest();
  await first;

  assert.equal(calls[0].input, '/api/demo/session');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(location.href, '/');
});

test('demo start guard resets after a failed start so the learner can retry', async () => {
  const calls = [];
  const location = { href: '' };
  let fail = true;
  const startDemoSession = createDemoSessionStarter({
    location,
    clearAdminReturn() {},
    credentialFetch(input) {
      calls.push(input);
      if (fail) {
        return Promise.resolve(jsonResponse({
          ok: false,
          message: 'Please try again in a moment.',
        }, 429));
      }
      return Promise.resolve(jsonResponse({
        ok: true,
        session: { accountId: 'demo-account-b', demo: true },
      }, 201));
    },
  });

  await assert.rejects(() => startDemoSession(), /Please try again/);
  fail = false;
  await startDemoSession();

  assert.equal(calls.length, 2);
  assert.equal(location.href, '/');
});
