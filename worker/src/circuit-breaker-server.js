// U9 — Server-side circuit breaker singleton.
//
// Wraps the shared primitive in `src/platform/core/circuit-breaker.js`
// for worker-side use. The one breaker this module exposes is
// `readModelDerivedWrite`: when D1 projection writes start failing the
// breaker opens, and `runSubjectCommandMutation` skips the projection
// write (emitting `derivedWriteSkipped: {reason: 'breaker-open'}`).
//
// Worker isolates are short-lived, so the breaker state does NOT need
// durable persistence — a module-scope singleton is enough. If an
// isolate is recycled the breaker starts closed in the new isolate
// (acceptable: the next D1 failure retrips it within one request).
// Multi-isolate coordination is out of scope (plan line 886 — we
// explicitly accept per-isolate behaviour as the residual risk).

import { createCircuitBreaker } from '../../src/platform/core/circuit-breaker.js';

let cachedBreaker = null;

/**
 * Return the worker-scoped `readModelDerivedWrite` breaker singleton.
 * Lazy-initialised on first use so tests can inject a fresh breaker by
 * calling `resetReadModelDerivedWriteBreaker()` between scenarios.
 *
 * @returns {object}
 */
export function getReadModelDerivedWriteBreaker() {
  if (!cachedBreaker) {
    cachedBreaker = createCircuitBreaker({
      name: 'readModelDerivedWrite',
      failureThreshold: 3,
      cooldownMs: 500,
      cooldownMaxMs: 30_000,
      storage: null, // server-side: no localStorage
    });
  }
  return cachedBreaker;
}

/**
 * Reset the cached breaker. Tests use this to start from a clean
 * state between scenarios; production callers MUST NOT use this —
 * breaker state is intentionally process-scoped.
 */
export function resetReadModelDerivedWriteBreaker() {
  cachedBreaker = null;
}
