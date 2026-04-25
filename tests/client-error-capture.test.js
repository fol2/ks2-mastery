import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _peekErrorCaptureQueue,
  _resetErrorCaptureState,
  captureClientError,
  redactClientErrorEvent,
} from '../src/platform/ops/error-capture.js';

test('redactClientErrorEvent returns the expected closed-allowlist shape', () => {
  const result = redactClientErrorEvent({
    errorKind: 'TypeError',
    message: 'x is undefined',
    stack: 'TypeError\n  at foo (bar.js:12)',
    routeName: '/dashboard',
    userAgent: 'Mozilla/5.0',
    timestamp: 123,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'errorKind',
    'firstFrame',
    'messageFirstLine',
    'routeName',
    'timestamp',
    'userAgent',
  ]);
  assert.equal(result.errorKind, 'TypeError');
  assert.equal(result.messageFirstLine, 'x is undefined');
  assert.equal(result.firstFrame, 'TypeError');
  assert.equal(result.routeName, '/dashboard');
  assert.equal(result.userAgent, 'Mozilla/5.0');
  assert.equal(result.timestamp, 123);
});

test('redactClientErrorEvent strips answer_raw substring from the message', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'Failed to submit answer_raw to server',
  });
  assert.ok(!/answer_raw/i.test(result.messageFirstLine), result.messageFirstLine);
  assert.match(result.messageFirstLine, /\[redacted\]/);
});

test('redactClientErrorEvent strips sensitive substrings alongside all-caps words', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: "spelling_word=PRINCIPAL caused failure",
  });
  assert.ok(!/spelling_word/i.test(result.messageFirstLine));
  assert.ok(!/PRINCIPAL/.test(result.messageFirstLine));
  assert.match(result.messageFirstLine, /\[redacted\]/);
  assert.match(result.messageFirstLine, /\[word\]/);
});

test('redactClientErrorEvent replaces UUID-shaped path segments with [id]', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    routeName: '/learner/abc123de-def0-4567-8901-abc1def456bc/spelling',
  });
  assert.equal(result.routeName, '/learner/[id]/spelling');
});

test('redactClientErrorEvent replaces learner-* path segments with [id]', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    routeName: '/learner/learner-abc123/spelling',
  });
  assert.equal(result.routeName, '/learner/[id]/spelling');
});

test('redactClientErrorEvent scrubs all-caps 4+ letter words in the message', () => {
  const result = redactClientErrorEvent({
    errorKind: 'TypeError',
    message: "Cannot read property 'PRINCIPAL' of undefined",
  });
  assert.equal(result.messageFirstLine, "Cannot read property '[word]' of undefined");
});

test('redactClientErrorEvent keeps 3-letter acronyms intact (URL, TTS, API)', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'Fetch URL via API failed (TTS mode)',
  });
  assert.ok(/URL/.test(result.messageFirstLine), result.messageFirstLine);
  assert.ok(/API/.test(result.messageFirstLine), result.messageFirstLine);
  assert.ok(/TTS/.test(result.messageFirstLine), result.messageFirstLine);
});

test('redactClientErrorEvent truncates multi-line messages to the first line', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'line one\nline two with secret token stuff',
  });
  assert.equal(result.messageFirstLine, 'line one');
});

test('redactClientErrorEvent truncates the stack to the first frame', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    stack: 'TypeError: boom\n  at foo (bar.js:12)\n  at outer (baz.js:3)',
  });
  assert.equal(result.firstFrame, 'TypeError: boom');
});

test('redactClientErrorEvent caps userAgent at 256 chars', () => {
  const longUa = 'M'.repeat(400);
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    userAgent: longUa,
  });
  assert.equal(result.userAgent.length, 256);
});

test('redactClientErrorEvent caps messageFirstLine at 500 chars', () => {
  const longMessage = 'x'.repeat(800);
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: longMessage,
  });
  assert.equal(result.messageFirstLine.length, 500);
});

test('redactClientErrorEvent caps errorKind at 128 chars', () => {
  const longKind = 'K'.repeat(200);
  const result = redactClientErrorEvent({
    errorKind: longKind,
    message: 'boom',
  });
  assert.equal(result.errorKind.length, 128);
});

test('redactClientErrorEvent defaults errorKind to Error when missing', () => {
  const result = redactClientErrorEvent({ message: 'boom' });
  assert.equal(result.errorKind, 'Error');
});

test('redactClientErrorEvent strips query + hash from routeName', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    routeName: '/dashboard?token=abc#/fragment',
  });
  assert.equal(result.routeName, '/dashboard');
});

test('captureClientError enqueues a redacted event and POSTs via credentialFetch', async () => {
  _resetErrorCaptureState();
  const calls = [];
  const credentialFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200 };
  };
  captureClientError({
    source: 'unit-test',
    error: { name: 'TypeError', message: 'x is undefined', stack: 'at foo (bar.js)' },
    info: {},
    credentialFetch,
  });
  // Wait for the scheduled drain microtask + setTimeout(0).
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/ops/error-event');
  assert.equal(calls[0].init?.method, 'POST');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.errorKind, 'TypeError');
  assert.equal(body.messageFirstLine, 'x is undefined');
  // Queue drained after successful send.
  assert.equal(_peekErrorCaptureQueue().length, 0);
  _resetErrorCaptureState();
});

test('captureClientError does not throw when credentialFetch is missing', () => {
  _resetErrorCaptureState();
  assert.doesNotThrow(() => {
    captureClientError({
      source: 'unit-test',
      error: new Error('boom'),
      info: {},
    });
  });
  _resetErrorCaptureState();
});

test('captureClientError honours the bounded queue (MAX=10, drop-oldest)', async () => {
  _resetErrorCaptureState();
  // Make all fetches hang so the queue accumulates.
  const pending = [];
  const credentialFetch = () => new Promise((resolve) => {
    pending.push(resolve);
  });
  for (let i = 0; i < 15; i += 1) {
    captureClientError({
      source: 'unit-test',
      error: { name: 'Err' + i, message: 'boom ' + i },
      info: {},
      credentialFetch,
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 15));
  // One in-flight + 9 queued = bound MAX_QUEUE after trim: queue size is <= 10.
  // The first enqueued is the one being POSTed, queue length after trims is
  // deterministic: capture keeps at most 10 redacted events in the queue.
  const queued = _peekErrorCaptureQueue();
  assert.ok(queued.length <= 10, `queue length ${queued.length} should be <= 10`);
  // Unblock pending fetches so teardown is clean.
  pending.forEach((resolve) => resolve({ ok: true, status: 200 }));
  _resetErrorCaptureState();
});

test('captureClientError drops non-retryable 4xx without retrying', async () => {
  _resetErrorCaptureState();
  let callCount = 0;
  const credentialFetch = async () => {
    callCount += 1;
    return { ok: false, status: 429 };
  };
  captureClientError({
    source: 'unit-test',
    error: { name: 'RateError', message: 'blocked' },
    info: {},
    credentialFetch,
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(callCount, 1);
  assert.equal(_peekErrorCaptureQueue().length, 0);
  _resetErrorCaptureState();
});
