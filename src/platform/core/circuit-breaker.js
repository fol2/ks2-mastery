// U9 — Circuit-breaker primitive (Phase 2 final).
//
// A small, boring state-machine with three states (closed / half-open /
// open) parameterised per surface. See
// `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md`
// U9 for the full rationale; the short version is:
//
//   - Distinct breakers per client surface — `parentHubRecentSessions`,
//     `parentHubActivity`, `classroomSummary`, `readModelDerivedWrite`,
//     `bootstrapCapacityMetadata`. Configured independently so a flaky
//     activity-feed endpoint cannot hide behind a healthy recent-sessions
//     endpoint.
//   - Cooldown curve: 500ms base, 2x exponential, capped at
//     `cooldownMaxMs` (30s default) — tuned to preserve student practice
//     latency without flooding recovery probes during true outages.
//   - Half-open probe is the NEXT normal request after the cooldown
//     window elapses (no dedicated health-check ping) so we stay inside
//     Phase 1's "bounded, small, boring" principle.
//   - Multi-tab broadcast: a short-TTL `localStorage` hint
//     (`ks2-breaker:<name>:open:<until-ts>`) lets a freshly opened sibling
//     tab inherit the open state without independently re-probing.
//     `localStorage` failures degrade gracefully (per-tab behaviour) per
//     plan line 886.
//   - Transitions invoke an optional `onTransition({ name, from, to })`
//     callback so the caller can emit the `breakerTransition` signal on
//     the worker collector (U3 allowlist) or pipe the transition into
//     `breakersDegraded` recompute. The primitive has NO telemetry
//     opinion on its own — the caller owns the surface.
//
// Non-goals (deliberate):
//   - No React / Vue framework coupling.
//   - No in-flight call reclassification (a breaker transition during an
//     in-flight command MUST NOT retroactively alter its outcome — the
//     caller decides).
//   - No mask of failed writes as synced — the breaker gates CALLS, it
//     does not rewrite RESULTS. `docs/mutation-policy.md`.

export const BREAKER_STATE_CLOSED = 'closed';
export const BREAKER_STATE_HALF_OPEN = 'half-open';
export const BREAKER_STATE_OPEN = 'open';

export const BREAKER_STATES = Object.freeze({
  CLOSED: BREAKER_STATE_CLOSED,
  HALF_OPEN: BREAKER_STATE_HALF_OPEN,
  OPEN: BREAKER_STATE_OPEN,
});

export const DEFAULT_BREAKER_CONFIG = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 500,
  cooldownMaxMs: 30_000,
});

const LOCAL_STORAGE_KEY_PREFIX = 'ks2-breaker:';

function resolveNumericOption(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function resolveStorage(storage) {
  // The primitive REFUSES to touch the global `localStorage` directly.
  // Callers pass an injected adapter (repositories resolve the real
  // `globalThis.localStorage` once, via the lock-wrapped path, and
  // hand it in). When absent, the primitive degrades to per-tab
  // behaviour — documented residual per plan line 886.
  if (storage && typeof storage.setItem === 'function' && typeof storage.getItem === 'function') {
    return storage;
  }
  return null;
}

function localStorageKeyForBreaker(name, until) {
  return `${LOCAL_STORAGE_KEY_PREFIX}${name}:open:${until}`;
}

function readBroadcastOpenUntil(storage, name, currentTime) {
  if (!storage) return 0;
  // Iterate the storage keys looking for any `ks2-breaker:<name>:open:<ts>`
  // entry whose `ts` is still in the future. We tolerate the storage
  // throwing on length/getItem; that is the documented fallback path.
  try {
    const keys = [];
    const length = Number(storage.length) || 0;
    for (let i = 0; i < length; i += 1) {
      const key = storage.key ? storage.key(i) : null;
      if (typeof key === 'string' && key.startsWith(`${LOCAL_STORAGE_KEY_PREFIX}${name}:open:`)) {
        keys.push(key);
      }
    }
    let maxUntil = 0;
    for (const key of keys) {
      const tail = key.slice(`${LOCAL_STORAGE_KEY_PREFIX}${name}:open:`.length);
      const until = Number(tail);
      if (Number.isFinite(until) && until > currentTime && until > maxUntil) {
        maxUntil = until;
      }
      if (Number.isFinite(until) && until <= currentTime) {
        // Clean up expired hints opportunistically — not critical.
        try { storage.removeItem(key); } catch { /* ignore */ }
      }
    }
    return maxUntil;
  } catch {
    // localStorage access threw (private mode / managed profile / quota).
    // Documented residual — per-tab behaviour is the fallback.
    return 0;
  }
}

function writeBroadcastOpen(storage, name, until) {
  if (!storage) return false;
  try {
    storage.setItem(localStorageKeyForBreaker(name, until), '1');
    return true;
  } catch {
    return false;
  }
}

function clearBroadcastForName(storage, name) {
  if (!storage) return;
  try {
    const length = Number(storage.length) || 0;
    const keys = [];
    for (let i = 0; i < length; i += 1) {
      const key = storage.key ? storage.key(i) : null;
      if (typeof key === 'string' && key.startsWith(`${LOCAL_STORAGE_KEY_PREFIX}${name}:open:`)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      try { storage.removeItem(key); } catch { /* ignore */ }
    }
  } catch {
    // Storage iteration failed — acceptable fallback per plan line 886.
  }
}

/**
 * Create a circuit-breaker state machine for a named surface.
 *
 * @param {object} options
 * @param {string} options.name — stable identifier used for
 *   telemetry and localStorage broadcast keys.
 * @param {number} [options.failureThreshold=3]
 * @param {number} [options.cooldownMs=500] — initial cooldown on first trip.
 * @param {number} [options.cooldownMaxMs=30000] — exponential cap. Pass
 *   `Infinity` for a breaker that never auto-recovers (operator-action
 *   required, e.g. `bootstrapCapacityMetadata`).
 * @param {() => number} [options.now=Date.now]
 * @param {{setItem: Function, getItem: Function, removeItem?: Function, key?: Function, length?: number}} [options.storage]
 *   — localStorage-shaped broadcast surface. When absent, the primitive
 *   degrades to per-tab behaviour (documented residual).
 * @param {(payload: {name: string, from: string, to: string, at: number}) => void} [options.onTransition]
 * @returns {object}
 */
export function createCircuitBreaker({
  name,
  failureThreshold = DEFAULT_BREAKER_CONFIG.failureThreshold,
  cooldownMs = DEFAULT_BREAKER_CONFIG.cooldownMs,
  cooldownMaxMs = DEFAULT_BREAKER_CONFIG.cooldownMaxMs,
  now = Date.now,
  storage = undefined,
  onTransition = null,
} = {}) {
  if (typeof name !== 'string' || !name) {
    throw new TypeError('createCircuitBreaker requires a non-empty name.');
  }
  const resolvedThreshold = Math.max(1, Math.floor(resolveNumericOption(failureThreshold, DEFAULT_BREAKER_CONFIG.failureThreshold)));
  const resolvedCooldown = Math.max(1, resolveNumericOption(cooldownMs, DEFAULT_BREAKER_CONFIG.cooldownMs));
  const resolvedMaxCooldown = cooldownMaxMs === Infinity
    ? Infinity
    : Math.max(resolvedCooldown, resolveNumericOption(cooldownMaxMs, DEFAULT_BREAKER_CONFIG.cooldownMaxMs));
  const resolvedStorage = storage === null ? null : resolveStorage(storage);
  const resolvedNow = typeof now === 'function' ? now : Date.now;
  const resolvedOnTransition = typeof onTransition === 'function' ? onTransition : null;

  let state = BREAKER_STATE_CLOSED;
  let failureCount = 0;
  let openedAt = 0;
  let currentCooldown = resolvedCooldown;
  let cooldownUntil = 0;

  function emitTransition(from, to) {
    if (!resolvedOnTransition) return;
    try {
      resolvedOnTransition({ name, from, to, at: resolvedNow() });
    } catch {
      // Never let a misbehaving listener propagate.
    }
  }

  function transitionTo(next) {
    if (next === state) return;
    const prev = state;
    state = next;
    emitTransition(prev, next);
  }

  function maybeHalfOpenFromCooldown() {
    if (state !== BREAKER_STATE_OPEN) return;
    if (!Number.isFinite(cooldownUntil) || cooldownUntil === 0) return;
    if (resolvedNow() >= cooldownUntil) {
      transitionTo(BREAKER_STATE_HALF_OPEN);
    }
  }

  function respectBroadcast() {
    if (!resolvedStorage) return;
    // A freshly instantiated breaker that sees an active foreign hint
    // in localStorage should start in OPEN state until the hint's TTL
    // expires. Called from `shouldBlockCall` and `state` so the check
    // runs at read time rather than construction time — otherwise a
    // Tab B opened before Tab A's `open` transition would miss the
    // hint.
    const until = readBroadcastOpenUntil(resolvedStorage, name, resolvedNow());
    if (until > 0 && state === BREAKER_STATE_CLOSED) {
      cooldownUntil = until;
      openedAt = resolvedNow();
      // currentCooldown stays at its default; local failures reconstruct it.
      transitionTo(BREAKER_STATE_OPEN);
    }
  }

  function recordSuccess() {
    respectBroadcast();
    maybeHalfOpenFromCooldown();
    if (state === BREAKER_STATE_HALF_OPEN) {
      // Probe success — close and reset cooldown curve.
      failureCount = 0;
      currentCooldown = resolvedCooldown;
      cooldownUntil = 0;
      openedAt = 0;
      clearBroadcastForName(resolvedStorage, name);
      transitionTo(BREAKER_STATE_CLOSED);
      return;
    }
    if (state === BREAKER_STATE_CLOSED) {
      failureCount = 0;
      return;
    }
    // OPEN + success has no defined semantics in this model; success
    // only arrives via a probe in half-open. Ignore defensively.
  }

  function recordFailure() {
    respectBroadcast();
    maybeHalfOpenFromCooldown();
    const timestamp = resolvedNow();
    if (state === BREAKER_STATE_HALF_OPEN) {
      // Probe failure — reopen with doubled cooldown (capped).
      const next = resolvedMaxCooldown === Infinity
        ? currentCooldown * 2
        : Math.min(resolvedMaxCooldown, currentCooldown * 2);
      currentCooldown = next;
      openedAt = timestamp;
      cooldownUntil = resolvedMaxCooldown === Infinity
        ? Number.POSITIVE_INFINITY
        : timestamp + currentCooldown;
      if (Number.isFinite(cooldownUntil)) {
        writeBroadcastOpen(resolvedStorage, name, cooldownUntil);
      }
      transitionTo(BREAKER_STATE_OPEN);
      return;
    }
    if (state === BREAKER_STATE_CLOSED) {
      failureCount += 1;
      if (failureCount >= resolvedThreshold) {
        currentCooldown = resolvedCooldown;
        openedAt = timestamp;
        cooldownUntil = resolvedMaxCooldown === Infinity
          ? Number.POSITIVE_INFINITY
          : timestamp + currentCooldown;
        if (Number.isFinite(cooldownUntil)) {
          writeBroadcastOpen(resolvedStorage, name, cooldownUntil);
        }
        transitionTo(BREAKER_STATE_OPEN);
      }
      return;
    }
    // OPEN + failure is a no-op: the cooldown is already running.
  }

  function shouldBlockCall() {
    respectBroadcast();
    maybeHalfOpenFromCooldown();
    // Block only while strictly OPEN. HALF-OPEN allows the probe through.
    return state === BREAKER_STATE_OPEN;
  }

  function forceOpen({ timestamp = resolvedNow(), sticky = false } = {}) {
    // Admin / escalation path (e.g. `bootstrapCapacityMetadata` 3-missing).
    currentCooldown = sticky ? resolvedMaxCooldown : resolvedCooldown;
    openedAt = timestamp;
    cooldownUntil = sticky || resolvedMaxCooldown === Infinity
      ? Number.POSITIVE_INFINITY
      : timestamp + currentCooldown;
    if (Number.isFinite(cooldownUntil)) {
      writeBroadcastOpen(resolvedStorage, name, cooldownUntil);
    }
    failureCount = Math.max(failureCount, resolvedThreshold);
    transitionTo(BREAKER_STATE_OPEN);
  }

  function reset() {
    failureCount = 0;
    currentCooldown = resolvedCooldown;
    openedAt = 0;
    cooldownUntil = 0;
    clearBroadcastForName(resolvedStorage, name);
    transitionTo(BREAKER_STATE_CLOSED);
  }

  function snapshot() {
    respectBroadcast();
    maybeHalfOpenFromCooldown();
    return {
      name,
      state,
      failureCount,
      openedAt,
      cooldownUntil: Number.isFinite(cooldownUntil) ? cooldownUntil : null,
      cooldownMs: currentCooldown,
    };
  }

  return {
    name,
    get state() { respectBroadcast(); maybeHalfOpenFromCooldown(); return state; },
    get isOpen() { respectBroadcast(); maybeHalfOpenFromCooldown(); return state === BREAKER_STATE_OPEN; },
    recordSuccess,
    recordFailure,
    shouldBlockCall,
    forceOpen,
    reset,
    snapshot,
  };
}

/**
 * Build a `breakersDegraded` boolean map from the set of 5 named breakers.
 * Only the minimal boolean surface documented in plan line 878 is
 * exposed; callers do NOT see the full state, failure counts, or
 * cooldown timestamps.
 *
 * @param {object} breakers
 * @returns {{parentHub: boolean, classroomSummary: boolean, derivedWrite: boolean, bootstrapCapacity: boolean}}
 */
export function buildBreakersDegradedMap(breakers) {
  const recentSessions = breakers?.parentHubRecentSessions;
  const activity = breakers?.parentHubActivity;
  const classroom = breakers?.classroomSummary;
  const derived = breakers?.readModelDerivedWrite;
  const bootstrap = breakers?.bootstrapCapacityMetadata;
  return {
    parentHub: Boolean(recentSessions?.isOpen) || Boolean(activity?.isOpen),
    classroomSummary: Boolean(classroom?.isOpen),
    derivedWrite: Boolean(derived?.isOpen),
    bootstrapCapacity: Boolean(bootstrap?.isOpen),
  };
}
