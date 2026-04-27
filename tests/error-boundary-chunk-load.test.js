// U7 hardening-residuals: tests for ErrorBoundary chunk-load detection.
// Verifies that chunk-load errors (from React.lazy dynamic imports) render
// a reload CTA, and that non-chunk errors fall through to the default
// fallback. The detection helper lives in a plain `.js` file so Node's
// test runner can import it without a JSX loader.
import test from 'node:test';
import assert from 'node:assert/strict';

import { isChunkLoadError } from '../src/platform/react/chunk-load-detect.js';

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
