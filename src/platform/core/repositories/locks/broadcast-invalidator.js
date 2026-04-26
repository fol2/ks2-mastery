// P2 U5 — BroadcastChannel('ks2-spell-cache-invalidate')
//
// Purpose: cache invalidation ONLY. No writes flow through this channel.
// Writes stay serialised via `navigator.locks` (see lock-manager.js). The
// broadcast tells sibling tabs: "the shared storage just moved — invalidate
// any in-memory cache you hold." Subscribers re-read from raw storage on
// the next repository operation.
//
// Feature detection is late-binding: production re-checks `BroadcastChannel`
// on each `createBroadcastInvalidator` call. Hosts without BroadcastChannel
// (older webviews, Workers in pre-v16 Safari) degrade to a no-op channel
// that returns `{ broadcast() {}, subscribe() {} }` — the rest of the
// system tolerates the absence because the local tab's writes still land.
//
// Message shape: `{ kind: 'write', writeVersion: number, at: number }`.
// `writeVersion` lets subscribers skip their own echo (compare against the
// local tab's most-recent broadcasted version); `at` is a local
// `Date.now()` for diagnostics.

const DEFAULT_CHANNEL_NAME = 'ks2-spell-cache-invalidate';

function hasBroadcastChannel() {
  return typeof globalThis !== 'undefined'
    && typeof globalThis.BroadcastChannel === 'function';
}

/**
 * Create a broadcast invalidator bound to `channelName`. Returns an object
 * with `broadcast({ writeVersion })` and `subscribe((message) => void)`
 * methods. A no-op adapter is returned when BroadcastChannel is unavailable.
 */
export function createBroadcastInvalidator({ channelName = DEFAULT_CHANNEL_NAME } = {}) {
  if (!hasBroadcastChannel()) {
    return {
      available: false,
      broadcast() {},
      subscribe() { return () => {}; },
      close() {},
    };
  }
  let channel = null;
  try {
    channel = new globalThis.BroadcastChannel(channelName);
  } catch (_error) {
    return {
      available: false,
      broadcast() {},
      subscribe() { return () => {}; },
      close() {},
    };
  }
  // In Node.js (and the native test runner), a pending BroadcastChannel
  // keeps the event loop alive indefinitely — which blocks test-runner
  // exits and SSR fixtures that rely on Node terminating after rendering.
  // `unref()` is Node-only and absent in browsers; guard before calling.
  if (typeof channel.unref === 'function') {
    try { channel.unref(); } catch (_error) { /* ignore */ }
  }
  const listeners = new Set();
  const onMessage = (event) => {
    const message = event?.data;
    if (!message || typeof message !== 'object') return;
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (_error) {
        /* Listener faults never break sibling tabs. */
      }
    }
  };
  try {
    channel.addEventListener('message', onMessage);
  } catch (_error) {
    /* Older hosts expose only `onmessage`; fall back. */
    channel.onmessage = onMessage;
  }
  return {
    available: true,
    broadcast({ writeVersion = 0 } = {}) {
      try {
        channel.postMessage({
          kind: 'write',
          writeVersion: Number(writeVersion) || 0,
          at: Date.now(),
        });
      } catch (_error) {
        /* Closed channel / transient failures must not break writes. */
      }
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      listeners.clear();
      try {
        channel.close();
      } catch (_error) {
        /* Ignore. */
      }
    },
  };
}

/**
 * Diagnostic helper — true if BroadcastChannel is available in the current
 * host. Re-checked on each call so tests can mutate `globalThis.BroadcastChannel`.
 */
export function isBroadcastChannelAvailable() {
  return hasBroadcastChannel();
}
