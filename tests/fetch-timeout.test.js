import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIENT_FETCH_TIMEOUT_CODE,
  fetchWithClientTimeout,
  isClientFetchTimeout,
} from '../src/platform/core/fetch-timeout.js';

test('fetchWithClientTimeout aborts and rejects slow requests', async () => {
  let signal = null;
  const fetch = (url, init = {}) => {
    signal = init.signal;
    return new Promise(() => {});
  };

  await assert.rejects(
    fetchWithClientTimeout(fetch, '/api/slow', {}, {
      timeoutMs: 1,
      timeoutMessage: 'Slow request timed out.',
    }),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.equal(error.code, CLIENT_FETCH_TIMEOUT_CODE);
      assert.equal(error.message, 'Slow request timed out.');
      assert.equal(isClientFetchTimeout(error), true);
      return true;
    },
  );

  assert.equal(signal.aborted, true);
});

test('fetchWithClientTimeout preserves timeout classification when abort rejects first', async () => {
  const fetch = (url, init = {}) => new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => {
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      reject(error);
    });
  });

  await assert.rejects(
    fetchWithClientTimeout(fetch, '/api/slow', {}, {
      timeoutMs: 1,
      timeoutMessage: 'Slow request timed out.',
    }),
    (error) => {
      assert.equal(error.name, 'AbortError');
      assert.equal(error.code, CLIENT_FETCH_TIMEOUT_CODE);
      assert.equal(error.message, 'Slow request timed out.');
      assert.equal(isClientFetchTimeout(error), true);
      return true;
    },
  );
});

test('fetchWithClientTimeout honours caller abort signals', async () => {
  const controller = new AbortController();
  let forwardedSignal = null;
  const fetch = (url, init = {}) => {
    forwardedSignal = init.signal;
    return new Promise(() => {});
  };

  const pending = fetchWithClientTimeout(fetch, '/api/slow', {
    signal: controller.signal,
  }, { timeoutMs: 0 });

  const reason = new Error('Manual abort.');
  controller.abort(reason);

  await assert.rejects(pending, reason);
  assert.equal(forwardedSignal.aborted, true);
});
