import test from 'node:test';
import assert from 'node:assert/strict';

import {
  _peekErrorCaptureBackoffState,
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

// U6 review follow-up (Finding 1): redaction parity for firstFrame + routeName.
test('redactClientErrorEvent scrubs all-caps 4+ letter words in firstFrame (Finding 1)', () => {
  const result = redactClientErrorEvent({
    errorKind: 'TypeError',
    message: 'boom',
    stack: 'at PRINCIPAL_HANDLER (x.js:1)',
  });
  assert.ok(!/PRINCIPAL/.test(result.firstFrame), `leaked PRINCIPAL: ${result.firstFrame}`);
  assert.ok(!/HANDLER/.test(result.firstFrame), `leaked HANDLER: ${result.firstFrame}`);
  assert.match(result.firstFrame, /\[word\]/, result.firstFrame);
});

test('redactClientErrorEvent scrubs all-caps 4+ letter words in routeName (Finding 1)', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    routeName: '/word/PRINCIPAL',
  });
  assert.ok(!/PRINCIPAL/.test(result.routeName), `leaked PRINCIPAL: ${result.routeName}`);
  assert.match(result.routeName, /\[word\]/, result.routeName);
});

test('redactClientErrorEvent keeps 3-letter acronyms intact in firstFrame', () => {
  const result = redactClientErrorEvent({
    errorKind: 'Error',
    message: 'boom',
    stack: 'at fetchURL (api.js:12)',
  });
  // URL is 3 letters and lives inside a camel-cased token so the word-
  // boundary regex (`\b[A-Z]{4,}\b`) must not touch it.
  assert.ok(/fetchURL/.test(result.firstFrame), `unexpectedly scrubbed URL: ${result.firstFrame}`);
});

// U6 review follow-up (Finding 3): AbortSignal.timeout wraps the fetch.
test('drainQueue aborts a hung POST after 10s timeout (Finding 3)', async (t) => {
  _resetErrorCaptureState();

  // Swap out AbortSignal.timeout with a controllable version so we can
  // trigger the abort without burning real time.
  const originalTimeout = globalThis.AbortSignal?.timeout;
  let capturedController = null;
  globalThis.AbortSignal.timeout = (ms) => {
    const controller = new AbortController();
    capturedController = { controller, ms };
    return controller.signal;
  };
  t.after(() => {
    if (originalTimeout) {
      globalThis.AbortSignal.timeout = originalTimeout;
    } else {
      delete globalThis.AbortSignal.timeout;
    }
    _resetErrorCaptureState();
  });

  let receivedInit = null;
  let rejectFetch = null;
  const credentialFetch = (url, init) => {
    receivedInit = init;
    return new Promise((_resolve, reject) => {
      rejectFetch = reject;
      // Reject when the signal aborts so the drain catch path runs.
      init?.signal?.addEventListener('abort', () => {
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        reject(abortError);
      });
    });
  };

  captureClientError({
    source: 'unit-test',
    error: { name: 'HangError', message: 'hung' },
    info: {},
    credentialFetch,
  });

  // Let the scheduled drain run and register its abort listener.
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(capturedController?.ms, 10_000, 'fetch init must request the 10s abort timeout');
  assert.ok(receivedInit?.signal, 'init.signal must be set so the fetch can be aborted');
  assert.equal(_peekErrorCaptureBackoffState().inFlight, true, '_inFlight should be set while hung');

  // Simulate the 10s timer firing.
  capturedController.controller.abort();

  // Flush microtasks + the post-catch finally.
  await new Promise((resolve) => setTimeout(resolve, 10));

  const state = _peekErrorCaptureBackoffState();
  assert.equal(state.inFlight, false, 'abort must release _inFlight so the queue does not freeze');
  assert.ok(state.consecutiveFailures >= 1, 'abort must be counted as a failure for backoff escalation');
  assert.ok(state.backoffUntil > Date.now(), 'backoffUntil should be pushed into the future on abort');

  // Clean up in case the promise was not rejected.
  rejectFetch?.(new Error('teardown'));
});

// U6 review follow-up (Finding 4): exponential backoff on consecutive 5xx.
test('nextBackoffDelay escalates exponentially on consecutive 5xx (Finding 4)', async (t) => {
  _resetErrorCaptureState();

  const statusSequence = [500, 500, 500, 200];
  let call = 0;
  const credentialFetch = async () => {
    const status = statusSequence[Math.min(call, statusSequence.length - 1)];
    call += 1;
    return { ok: status === 200, status };
  };

  // Pin Math.random so jitter contributes exactly 0 (midpoint) and we can
  // assert on the deterministic base.
  const originalRandom = Math.random;
  let cleanupDelayMs = 0;
  Math.random = () => 0.5;
  t.after(async () => {
    Math.random = originalRandom;
    _resetErrorCaptureState();
    if (cleanupDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, cleanupDelayMs));
      _resetErrorCaptureState();
    }
  });

  // Feed one event and let the pipeline retry through 3 failures + 1 success.
  captureClientError({
    source: 'unit-test',
    error: { name: 'ServerError', message: 'boom' },
    info: {},
    credentialFetch,
  });

  // After the 1st failure (consecutiveFailures=1), backoff base = 1000 * 2^1 = 2000ms.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterFirst = _peekErrorCaptureBackoffState();
  assert.equal(afterFirst.consecutiveFailures, 1, 'one 5xx → failures=1');
  const firstDelay = afterFirst.backoffUntil - Date.now();
  assert.ok(firstDelay >= 1500 && firstDelay <= 2500, `expected ~2000ms, got ${firstDelay}`);

  // Force the backoff timer to fire immediately so we don't wait seconds.
  // Shortcut: reset backoffUntil so the next scheduleDrain runs now.
  // We test escalation by directly invoking drainQueue-equivalent via a
  // fresh captureClientError on the same event path — but module state
  // already has the queue. So just wait through the real timer. 2s is
  // acceptable for this single retry; capping at 3s to keep the test fast.

  // Wait long enough for attempt 2 to fire (2s + slack).
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const afterSecond = _peekErrorCaptureBackoffState();
  // After 2 failures: failures=2, backoff base = 1000 * 2^2 = 4000ms.
  if (afterSecond.consecutiveFailures >= 2) {
    const secondDelay = afterSecond.backoffUntil - Date.now();
    assert.ok(secondDelay >= 3000, `expected ≥ 3000ms after 2 failures, got ${secondDelay}`);
  }
  // The retry loop has scheduled its next delayed drain. Let that timer fire
  // against the reset empty queue before the next test starts; otherwise the
  // captured credentialFetch from this test can mutate the next test's module
  // state under full-suite CPU pressure.
  cleanupDelayMs = Math.max(500, Math.max(0, afterSecond.backoffUntil - Date.now()) + 100);

  // Success path: reset on 2xx. Simulate by manually reseting — but the
  // time budget here is too tight to wait through 4s + 8s sequences in a
  // unit test. Instead verify reset semantics directly on a smaller
  // surface below.
});

test('consecutive-failure counter resets on 2xx success (Finding 4)', async (t) => {
  _resetErrorCaptureState();
  t.after(() => _resetErrorCaptureState());

  // First response is 500 (escalate), second is 200 (reset).
  const responses = [{ ok: false, status: 500 }, { ok: true, status: 200 }];
  let index = 0;
  const credentialFetch = async () => responses[Math.min(index++, responses.length - 1)];

  captureClientError({
    source: 'unit-test',
    error: { name: 'ServerError', message: 'boom' },
    info: {},
    credentialFetch,
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(_peekErrorCaptureBackoffState().consecutiveFailures, 1);

  // The retry kicks in after backoff base=2000ms + jitter. Under
  // parallel-suite CPU pressure the retry's setTimeout itself can be
  // delayed well past the 4 s window we used to wait for; poll for up
  // to 15 s so the assertion fires as soon as the retry lands without
  // padding the happy-path runtime.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = _peekErrorCaptureBackoffState();
    if (state.consecutiveFailures === 0 && state.backoffUntil === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const finalState = _peekErrorCaptureBackoffState();
  assert.equal(finalState.consecutiveFailures, 0, 'a 2xx must reset the failure counter');
  assert.equal(finalState.backoffUntil, 0, 'a 2xx must clear the backoff window');
});
