// P2 U5 — second-tab detector + soft-lockout banner state machine.
//
// Flow:
//   - On mount, the detector requests the write lock via `ifAvailable: true`.
//     If `null` returned, another tab holds it → flip to
//     `LOCKOUT_STATES.OTHER_TAB_ACTIVE` (soft-lockout banner).
//   - Poll every 2s (configurable via `{ pollIntervalMs }`) while in the
//     OTHER_TAB_ACTIVE state. Stop polling after flipping back to
//     THIS_TAB_OWNS.
//   - If `navigator.locks` is unavailable, the detector emits
//     `LOCKOUT_STATES.SINGLE_TAB_FALLBACK` once and never polls — the UI
//     surfaces a distinct "Single-tab mode" banner copy instead of the
//     "another tab is active" copy.
//
// Callers subscribe via `detector.subscribe((state) => …)`. The initial
// state is also yielded synchronously from `detector.getState()` so a
// freshly-subscribed listener can render before the first async probe.
//
// Design note: this module is intentionally UI-agnostic. It ships the
// state machine; the banner scenes choose their copy based on
// `state.kind`.

import { DEFAULT_LOCK_NAME, isLocksAvailable, probeSecondTabOwnership } from './lock-manager.js';

export const LOCKOUT_STATES = Object.freeze({
  THIS_TAB_OWNS: 'this-tab-owns',
  OTHER_TAB_ACTIVE: 'other-tab-active',
  SINGLE_TAB_FALLBACK: 'single-tab-fallback',
});

export const DEFAULT_POLL_INTERVAL_MS = 2000;

/**
 * Banner copy for each state. Kept here so a single edit updates all
 * rendering sites (Setup + Session scenes both read this map).
 */
export const LOCKOUT_BANNER_COPY = Object.freeze({
  [LOCKOUT_STATES.OTHER_TAB_ACTIVE]: {
    message: 'This learner is open in another tab. Switch tabs to continue — Guardian progress is being saved there.',
    actionLabel: 'Use this tab anyway',
  },
  [LOCKOUT_STATES.SINGLE_TAB_FALLBACK]: {
    message: 'Single-tab mode — use only one tab on this device. Your browser cannot coordinate writes across tabs, so opening a second tab may lose progress.',
    actionLabel: '',
  },
  [LOCKOUT_STATES.THIS_TAB_OWNS]: {
    message: '',
    actionLabel: '',
  },
});

function resolveInitialState() {
  return isLocksAvailable()
    ? { kind: LOCKOUT_STATES.THIS_TAB_OWNS }
    : { kind: LOCKOUT_STATES.SINGLE_TAB_FALLBACK };
}

/**
 * Create a second-tab detector. Call `.start()` to begin probing; `.stop()`
 * to clear the poll interval. Exposed options:
 *  - `lockName` (default `ks2-spell-write`)
 *  - `pollIntervalMs` (default 2000)
 *  - `scheduler` / `cancelScheduler` — inject fake timers for tests.
 *  - `probe` — optional replacement for `probeSecondTabOwnership` so tests
 *    can drive state transitions deterministically.
 */
export function createSecondTabDetector({
  lockName = DEFAULT_LOCK_NAME,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  scheduler,
  cancelScheduler,
  probe,
} = {}) {
  const listeners = new Set();
  let state = resolveInitialState();
  let pollHandle = null;
  let running = false;

  const doProbe = typeof probe === 'function'
    ? probe
    : () => probeSecondTabOwnership(lockName);

  const scheduleFn = typeof scheduler === 'function'
    ? scheduler
    : (fn, ms) => (typeof setTimeout === 'function' ? setTimeout(fn, ms) : null);
  const cancelFn = typeof cancelScheduler === 'function'
    ? cancelScheduler
    : (handle) => { if (handle != null && typeof clearTimeout === 'function') clearTimeout(handle); };

  function notify() {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (_error) {
        /* Listener faults must not break sibling listeners. */
      }
    }
  }

  function setState(next) {
    if (!next || next.kind === state.kind) return;
    state = next;
    notify();
  }

  async function pollOnce() {
    if (!running) return;
    // Fallback hosts never move out of SINGLE_TAB_FALLBACK — detection
    // requires the locks API to be present.
    if (!isLocksAvailable()) {
      setState({ kind: LOCKOUT_STATES.SINGLE_TAB_FALLBACK });
      return;
    }
    try {
      const heldElsewhere = await doProbe();
      setState({
        kind: heldElsewhere
          ? LOCKOUT_STATES.OTHER_TAB_ACTIVE
          : LOCKOUT_STATES.THIS_TAB_OWNS,
      });
    } catch (_error) {
      /* Treat transient probe failures as "no change" — poll again later. */
    }
    if (running) {
      pollHandle = scheduleFn(pollOnce, pollIntervalMs);
    }
  }

  return {
    getState() { return state; },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      try {
        listener(state);
      } catch (_error) {
        /* Ignore — notify again at next state change. */
      }
      return () => { listeners.delete(listener); };
    },
    start() {
      if (running) return;
      running = true;
      // Seed state immediately so callers see the fallback / owned state
      // without waiting for the first probe.
      if (!isLocksAvailable()) {
        setState({ kind: LOCKOUT_STATES.SINGLE_TAB_FALLBACK });
        return;
      }
      pollOnce();
    },
    stop() {
      running = false;
      if (pollHandle != null) {
        cancelFn(pollHandle);
        pollHandle = null;
      }
    },
    // Test-only hook: force an immediate state transition. Used by the
    // scenes to flip back to THIS_TAB_OWNS after the "Use this tab anyway"
    // button successfully steals the lock.
    acknowledgeOwnership() {
      setState({ kind: LOCKOUT_STATES.THIS_TAB_OWNS });
    },
    // Test-only hook: resolve a probe synchronously. Returns the new state.
    async probeNow() {
      await pollOnce();
      return state;
    },
  };
}
