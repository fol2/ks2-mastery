// U7 hardening-residuals: tests for ErrorBoundary chunk-load detection.
// Verifies that chunk-load errors (from React.lazy dynamic imports) render
// a reload CTA, and that non-chunk errors fall through to the default
// fallback. The detection helper lives in a plain `.js` file so Node's
// test runner can import it without a JSX loader.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isChunkLoadError } from '../src/platform/react/chunk-load-detect.js';
import {
  CHUNK_RELOAD_SESSION_KEY,
  clearChunkReloadAttempt,
  scheduleChunkReloadOnce,
} from '../src/platform/react/chunk-load-recovery.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

// --- isChunkLoadError detection tests ---

test('isChunkLoadError returns true for ChunkLoadError name', () => {
  const error = new Error('Loading chunk 42 failed');
  error.name = 'ChunkLoadError';
  assert.equal(isChunkLoadError(error), true);
});

test('isChunkLoadError returns true for "Loading chunk" message', () => {
  const error = new TypeError('Loading chunk abc123 failed');
  assert.equal(isChunkLoadError(error), true);
});

test('isChunkLoadError returns true for "Failed to fetch dynamically imported module" message', () => {
  const error = new TypeError(
    'Failed to fetch dynamically imported module: /src/bundles/AdminHubSurface-WN2VQQ32.js',
  );
  assert.equal(isChunkLoadError(error), true);
});

test('isChunkLoadError returns false for a generic TypeError', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'foo')");
  assert.equal(isChunkLoadError(error), false);
});

test('isChunkLoadError returns false for a generic Error', () => {
  const error = new Error('Something went wrong');
  assert.equal(isChunkLoadError(error), false);
});

test('isChunkLoadError returns false for null', () => {
  assert.equal(isChunkLoadError(null), false);
});

test('isChunkLoadError returns false for undefined', () => {
  assert.equal(isChunkLoadError(undefined), false);
});

test('isChunkLoadError returns false for an error with no message', () => {
  const error = new Error();
  assert.equal(isChunkLoadError(error), false);
});

// --- Edge case: message contains the pattern as a substring ---

test('isChunkLoadError matches "Loading chunk" anywhere in the message', () => {
  const error = new Error('Unexpected error while Loading chunk 7 from network');
  assert.equal(isChunkLoadError(error), true);
});

test('isChunkLoadError matches "Failed to fetch dynamically imported module" with a URL suffix', () => {
  const error = new TypeError(
    'Failed to fetch dynamically imported module: https://ks2.eugnel.uk/src/bundles/ParentHubSurface-ZYHGNFPW.js',
  );
  assert.equal(isChunkLoadError(error), true);
});

test('scheduleChunkReloadOnce reloads once for a chunk-load failure', () => {
  const storage = memoryStorage();
  let reloads = 0;
  const scheduled = scheduleChunkReloadOnce(
    new TypeError('Failed to fetch dynamically imported module: /src/bundles/AdminHubSurface-OLD.js'),
    {
      storage,
      location: { reload() { reloads += 1; } },
      setTimeoutFn(callback) { callback(); },
    },
  );

  assert.equal(scheduled, true);
  assert.equal(reloads, 1);
  assert.equal(storage.getItem(CHUNK_RELOAD_SESSION_KEY), '1');
});

test('scheduleChunkReloadOnce does not reload repeatedly in the same page session', () => {
  const storage = memoryStorage({ [CHUNK_RELOAD_SESSION_KEY]: '1' });
  let reloads = 0;
  const scheduled = scheduleChunkReloadOnce(
    new Error('Loading chunk admin failed'),
    {
      storage,
      location: { reload() { reloads += 1; } },
      setTimeoutFn(callback) { callback(); },
    },
  );

  assert.equal(scheduled, false);
  assert.equal(reloads, 0);
});

test('scheduleChunkReloadOnce ignores non-chunk errors', () => {
  const storage = memoryStorage();
  let reloads = 0;
  const scheduled = scheduleChunkReloadOnce(
    new TypeError("Cannot read properties of undefined (reading 'foo')"),
    {
      storage,
      location: { reload() { reloads += 1; } },
      setTimeoutFn(callback) { callback(); },
    },
  );

  assert.equal(scheduled, false);
  assert.equal(reloads, 0);
  assert.equal(storage.getItem(CHUNK_RELOAD_SESSION_KEY), null);
});

test('scheduleChunkReloadOnce leaves the fallback visible when storage is unavailable', () => {
  let reloads = 0;
  const scheduled = scheduleChunkReloadOnce(
    new Error('Loading chunk admin failed'),
    {
      storage: {
        getItem() {
          throw new Error('sessionStorage unavailable');
        },
        setItem() {
          throw new Error('sessionStorage unavailable');
        },
      },
      location: { reload() { reloads += 1; } },
      setTimeoutFn(callback) { callback(); },
    },
  );

  assert.equal(scheduled, false);
  assert.equal(reloads, 0);
});

test('clearChunkReloadAttempt removes the reload guard after a successful boot', () => {
  const storage = memoryStorage({ [CHUNK_RELOAD_SESSION_KEY]: '1' });

  clearChunkReloadAttempt(storage);

  assert.equal(storage.getItem(CHUNK_RELOAD_SESSION_KEY), null);
});
