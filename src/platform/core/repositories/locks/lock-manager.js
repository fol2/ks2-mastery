// P2 U5 — navigator.locks wrapper with late-binding feature detection +
// BroadcastChannel-only fallback path.
//
// Per plan (F9 elevation): the fallback is the MAINLINE path, not niche.
// Firefox shipped Web Locks in v96 (2022), Safari 15.4 shipped 2022, Safari
// workers context gap in pre-16. Treat BroadcastChannel-only + writeVersion
// + single-tab-mode banner as the DEFAULT test matrix. When
// `navigator.locks === undefined`, `withWriteLock` degrades to a simple
// "run the callback immediately" path — the repository's `writeVersion`
// CAS + broadcast-invalidator still catches cross-tab races.
//
// Per plan (M6 finding): feature detection is LATE-BINDING. `isLocksAvailable`
// re-checks `navigator.locks` on each call, NOT once at module load. This
// lets tests mutate `navigator.locks` via `Object.defineProperty` mid-test
// and the production path sees the change.
//
// Contract:
//  - `withWriteLock(name, fn, { ifAvailable, steal })` — wrap `fn` inside a
//    locked critical section. `fn` is an async function taking no arguments.
//    Returns the value `fn` resolves to.
//  - `probeSecondTabOwnership(name)` — returns `true` when another tab
//    currently holds the lock (via `ifAvailable: true`). Used by the
//    second-tab-detector to flip the lockout banner on/off.
//  - `stealWriteLock(name, fn)` — shorthand for `withWriteLock(name, fn, { steal: true })`.

export const DEFAULT_LOCK_NAME = 'ks2-spell-write';

/**
 * Late-binding feature detector. Returns true iff `navigator.locks.request`
 * looks callable at the call site. Intentionally NOT memoised — tests
 * mutate `navigator.locks` via `Object.defineProperty` and production code
 * must see the fresh value.
 */
export function isLocksAvailable() {
  try {
    if (typeof globalThis === 'undefined') return false;
    const nav = globalThis.navigator;
    if (!nav || typeof nav !== 'object') return false;
    const locks = nav.locks;
    if (!locks || typeof locks !== 'object') return false;
    return typeof locks.request === 'function';
  } catch (_error) {
    return false;
  }
}

/**
 * Wrap `fn` inside a `navigator.locks.request` critical section named
 * `name`. When locks are unavailable (feature-detect returns false), runs
 * `fn` directly. `fn` MUST be an async function.
 *
 * Options:
 *  - `ifAvailable: true` — do not queue; return `null` if another tab holds
 *    the lock. The caller can treat `null` as "second tab present".
 *  - `steal: true` — forcibly take ownership; any currently-held lock's
 *    promise rejects with `AbortError`. Use sparingly.
 */
export async function withWriteLock(name, fn, options = {}) {
  if (typeof fn !== 'function') {
    throw new TypeError('withWriteLock requires an async function.');
  }
  const lockName = typeof name === 'string' && name ? name : DEFAULT_LOCK_NAME;
  if (!isLocksAvailable()) {
    // Fallback: execute the callback immediately. The cross-tab race is
    // caught later by the writeVersion CAS at the repository layer.
    return fn(null);
  }
  const requestOptions = {};
  if (options.ifAvailable) requestOptions.ifAvailable = true;
  if (options.steal) requestOptions.steal = true;
  if (options.signal) requestOptions.signal = options.signal;
  return globalThis.navigator.locks.request(lockName, requestOptions, async (lock) => {
    if (options.ifAvailable && lock === null) {
      return null;
    }
    return fn(lock);
  });
}

/**
 * Probe whether another tab holds the `name` lock. Returns `true` if a
 * sibling tab is the current holder. When locks are unavailable, returns
 * `false` (fallback path has no cross-tab detection).
 */
export async function probeSecondTabOwnership(name = DEFAULT_LOCK_NAME) {
  if (!isLocksAvailable()) return false;
  try {
    const result = await globalThis.navigator.locks.request(
      name,
      { ifAvailable: true },
      async (lock) => (lock === null ? 'held-elsewhere' : 'acquired'),
    );
    return result === 'held-elsewhere';
  } catch (_error) {
    return false;
  }
}

/**
 * Steal ownership from the current lock holder. Any in-flight `fn` held by
 * the previous owner has its request promise reject with `AbortError`. Use
 * sparingly — the plan's "Use this tab anyway" button is the only UX for
 * invoking this.
 */
export async function stealWriteLock(name, fn) {
  return withWriteLock(name, fn, { steal: true });
}
