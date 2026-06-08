import test from 'node:test';
import assert from 'node:assert/strict';

import { preloadImages } from '../src/platform/ui/luminance.js';

function withImageProbe(run) {
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const requestedUrls = [];

  globalThis.document = {};
  globalThis.Image = class ProbeImage {
    set src(value) {
      requestedUrls.push(value);
      queueMicrotask(() => this.onload?.());
    }
  };

  try {
    return run(requestedUrls);
  } finally {
    if (typeof originalDocument === 'undefined') {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (typeof originalImage === 'undefined') {
      delete globalThis.Image;
    } else {
      globalThis.Image = originalImage;
    }
  }
}

test('preloadImages starts eager image loads immediately and de-dupes URLs', () => withImageProbe((requestedUrls) => {
  preloadImages([
    '/assets/test/eager-a.webp',
    '/assets/test/eager-b.webp',
    '/assets/test/eager-a.webp',
    '',
    null,
  ]);

  assert.deepEqual(requestedUrls, [
    '/assets/test/eager-a.webp',
    '/assets/test/eager-b.webp',
  ]);
}));

test('preloadImages defers idle image loads until the browser idle callback', () => withImageProbe((requestedUrls) => {
  const originalWindow = globalThis.window;
  let idleCallback = null;
  let idleOptions = null;
  let cancelledHandle = null;

  globalThis.window = {
    requestIdleCallback(callback, options) {
      idleCallback = callback;
      idleOptions = options;
      return 42;
    },
    cancelIdleCallback(handle) {
      cancelledHandle = handle;
    },
  };

  try {
    const cancel = preloadImages([
      '/assets/test/idle-a.webp',
      '/assets/test/idle-b.webp',
    ], { mode: 'idle' });

    assert.equal(typeof cancel, 'function');
    assert.deepEqual(requestedUrls, []);
    assert.deepEqual(idleOptions, { timeout: 1500 });

    idleCallback();

    assert.deepEqual(requestedUrls, [
      '/assets/test/idle-a.webp',
      '/assets/test/idle-b.webp',
    ]);

    cancel();
    assert.equal(cancelledHandle, 42);
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}));

test('preloadImages defers idle image loads with a timer fallback when idle callback is unavailable', () => withImageProbe((requestedUrls) => {
  const originalWindow = globalThis.window;
  let timeoutCallback = null;
  let timeoutDelay = null;
  let clearedHandle = null;

  globalThis.window = {
    setTimeout(callback, delay) {
      timeoutCallback = callback;
      timeoutDelay = delay;
      return 77;
    },
    clearTimeout(handle) {
      clearedHandle = handle;
    },
  };

  try {
    const cancel = preloadImages([
      '/assets/test/timer-idle-a.webp',
      '/assets/test/timer-idle-b.webp',
    ], { mode: 'idle' });

    assert.equal(typeof cancel, 'function');
    assert.equal(timeoutDelay, 250);
    assert.deepEqual(requestedUrls, []);

    timeoutCallback();

    assert.deepEqual(requestedUrls, [
      '/assets/test/timer-idle-a.webp',
      '/assets/test/timer-idle-b.webp',
    ]);

    cancel();
    assert.equal(clearedHandle, 77);
  } finally {
    if (typeof originalWindow === 'undefined') {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
}));
