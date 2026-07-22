import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIngressRequestId,
  reportIngressRequestFailure,
} from '../src/platform/core/request-id.js';

test('browser ingress request ids match the Worker correlation contract', () => {
  assert.match(
    createIngressRequestId(),
    /^ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('failed browser requests emit the correlation fields needed for Cloudflare log joins', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  const previousConsoleError = globalThis.console.error;
  const events = [];
  globalThis.window = {};
  globalThis.console.error = (...args) => events.push(args);

  try {
    reportIngressRequestFailure({
      endpoint: '/api/hero/read-model?learnerId=private',
      method: 'get',
      status: 503,
      requestId: 'ks2_req_123',
    });
  } finally {
    globalThis.console.error = previousConsoleError;
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }

  assert.deepEqual(events, [[
    '[network] request_failed',
    {
      endpoint: '/api/hero/read-model',
      method: 'GET',
      status: 503,
      requestId: 'ks2_req_123',
    },
  ]]);
});
