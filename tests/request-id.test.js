import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createIngressRequestId,
  isIngressRequestId,
  reportIngressRequestFailure,
  summariseIngressFailureSignal,
} from '../src/platform/core/request-id.js';
import {
  _peekErrorCaptureQueue,
  _resetErrorCaptureState,
  installGlobalErrorCapture,
} from '../src/platform/ops/error-capture.js';

test('browser ingress request ids match the Worker correlation contract', () => {
  assert.match(
    createIngressRequestId(),
    /^ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

test('browser ingress request id validation rejects domain mutation ids', () => {
  assert.equal(isIngressRequestId(createIngressRequestId()), true);
  assert.equal(isIngressRequestId('subject-command-observation-503'), false);
  assert.equal(isIngressRequestId('ks2_req_123'), false);
});

test('summariseIngressFailureSignal extracts Cloudflare 1102 without unique request ids', () => {
  const signal = summariseIngressFailureSignal({
    status: 503,
    responseSnippet: '<!DOCTYPE html><title>Error 1102</title><p>exceededCpu</p>',
  });
  assert.equal(signal, 'cf-1102');
});

test('summariseIngressFailureSignal prefers app payload codes when present', () => {
  assert.equal(summariseIngressFailureSignal({
    status: 503,
    payload: { code: 'demo_rate_limited' },
  }), 'demo_rate_limited');
});

test('failed browser requests emit correlation fields and enqueue ops error events for 5xx', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  const previousConsoleError = globalThis.console.error;
  const events = [];
  globalThis.window = {};
  globalThis.console.error = (...args) => events.push(args);
  _resetErrorCaptureState();
  // Hang the drain so the redacted event stays observable in the queue.
  installGlobalErrorCapture({
    credentialFetch: () => new Promise(() => {}),
  });

  try {
    reportIngressRequestFailure({
      endpoint: '/api/hero/read-model?learnerId=private',
      method: 'get',
      status: 503,
      requestId: 'ks2_req_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      responseSnippet: 'Error 1102 exceededCpu worker',
    });
  } finally {
    globalThis.console.error = previousConsoleError;
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }

  assert.equal(events[0][0], '[network] request_failed');
  assert.equal(events[0][1].endpoint, '/api/hero/read-model');
  assert.equal(events[0][1].method, 'GET');
  assert.equal(events[0][1].status, 503);
  assert.equal(events[0][1].requestId, 'ks2_req_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  assert.equal(events[0][1].signal, 'cf-1102');

  const held = _peekErrorCaptureQueue();
  assert.equal(held.length, 1);
  assert.equal(held[0].errorKind, 'Http503');
  assert.match(held[0].messageFirstLine, /status=503/);
  assert.match(held[0].messageFirstLine, /\/api\/hero\/read-model/);
  assert.match(held[0].messageFirstLine, /cf-1102/);
  // Stable fingerprint fields must not include the unique request id.
  assert.equal(held[0].messageFirstLine.includes('ks2_req_'), false);
  assert.equal(held[0].firstFrame.includes('ks2_req_'), false);
  assert.equal(held[0].routeName, '/api/hero/read-model');
  _resetErrorCaptureState();
});

test('failed browser requests skip ops ingest for 4xx and error-event endpoints', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const previousWindow = globalThis.window;
  const previousConsoleError = globalThis.console.error;
  globalThis.window = {};
  globalThis.console.error = () => {};
  _resetErrorCaptureState();
  installGlobalErrorCapture({
    credentialFetch: () => new Promise(() => {}),
  });

  try {
    reportIngressRequestFailure({
      endpoint: '/api/learners',
      method: 'GET',
      status: 404,
      requestId: 'ks2_req_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    reportIngressRequestFailure({
      endpoint: '/api/ops/error-event',
      method: 'POST',
      status: 503,
      requestId: 'ks2_req_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
  } finally {
    globalThis.console.error = previousConsoleError;
    if (hadWindow) globalThis.window = previousWindow;
    else delete globalThis.window;
  }

  assert.equal(_peekErrorCaptureQueue().length, 0);
  _resetErrorCaptureState();
});
