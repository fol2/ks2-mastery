// U7 (sys-hardening p1): shared `consumeRateLimit` helper.
//
// Feasibility F-06: three near-duplicate copies previously lived in
// `worker/src/auth.js`, `worker/src/demo/sessions.js`, and
// `worker/src/tts.js`. Each carried the same SQL against
// `request_limits`, the same window arithmetic, and the same return
// shape; they differed only in whether the first argument was `env`
// (auth, tts) or a raw D1 database (demo/sessions). This module
// collapses the three into a single implementation.
//
// The single signature is `(envOrDb, { bucket, identifier, limit,
// windowMs, now })`. The first argument accepts either an `env`-like
// object with a `.DB` D1 binding or a D1 database directly, so the
// prior demo/sessions call sites (`consumeRateLimit(db, ...)`) and
// auth/tts call sites (`consumeRateLimit(env, ...)`) both keep working
// without rewrites. Making the helper side-effect free and
// dependency-injected keeps tests simple — `tests/csp-report-endpoint`
// exercises the shared helper via the CSP-report route without any
// extra scaffolding.

import { bindStatement, first, requireDatabase } from './d1.js';
import { sha256 } from './auth.js';

function currentWindowStart(timestamp, windowMs) {
  return Math.floor(timestamp / windowMs) * windowMs;
}

function isLikelyD1Database(candidate) {
  return Boolean(candidate && typeof candidate.prepare === 'function');
}

function resolveDatabase(envOrDb) {
  if (isLikelyD1Database(envOrDb)) return envOrDb;
  return requireDatabase(envOrDb);
}

/**
 * Consume one unit of the limiter bucket. Returns `{ allowed, retryAfterSeconds }`.
 * `allowed` is true when the request is within the per-window limit.
 *
 * @param {object} envOrDb - Either a Worker env with `.DB` or a D1 database.
 * @param {object} options
 * @param {string} options.bucket - Static bucket label (e.g. `csp-report`).
 * @param {string} options.identifier - Per-identity key (IP, accountId, etc.).
 * @param {number} options.limit - Max requests per window.
 * @param {number} options.windowMs - Window size in milliseconds.
 * @param {number} [options.now] - Current epoch ms (defaults to Date.now()).
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
 */
export async function consumeRateLimit(envOrDb, { bucket, identifier, limit, windowMs, now = Date.now() } = {}) {
  if (!bucket || !identifier || !limit || !windowMs) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const db = resolveDatabase(envOrDb);
  const windowStartedAt = currentWindowStart(now, windowMs);
  const limiterKey = `${bucket}:${await sha256(identifier)}`;
  const row = await first(db, `
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      request_count = CASE
        WHEN request_limits.window_started_at = excluded.window_started_at
          THEN request_limits.request_count + 1
        ELSE 1
      END,
      window_started_at = excluded.window_started_at,
      updated_at = excluded.updated_at
    RETURNING request_count, window_started_at
  `, [limiterKey, windowStartedAt, now]);
  const count = Number(row?.request_count || 1);
  const storedWindow = Number(row?.window_started_at || windowStartedAt);
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((storedWindow + windowMs) - now) / 1000)),
  };
}

// Re-export the bound statement helper so consumers that want a custom
// limiter variant (e.g. peek-without-increment) can build one without a
// second round of duplication. Not used in this unit; kept to keep the
// extraction boundary explicit.
export { bindStatement };
