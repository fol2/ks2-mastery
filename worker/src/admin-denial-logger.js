// P3 U4: shared denial capture helper. Logs auth/role/rate-limit denials
// as structured events in `admin_request_denials` for operator visibility
// (R8) and debug-bundle evidence (R9).
//
// Security constraints enforced at this layer:
//   - `session_id_last8`: only the last 8 chars of the session ID are
//     stored. The migration CHECK enforces `length <= 8`; this module
//     truncates before the INSERT so a bug higher up cannot leak the
//     full token.
//   - `detail_json`: closed schema — only structured fields from
//     `error-codes.js` constants. Never raw headers/cookies/body.
//   - Fire-and-forget: all writes are dispatched via `ctx.waitUntil`
//     wrapped in try/catch so a DB outage never blocks the 403/429
//     response.

import { bindStatement } from './d1.js';
import {
  DENIAL_ACCOUNT_SUSPENDED,
  DENIAL_PAYMENT_HOLD,
  DENIAL_SESSION_INVALIDATED,
  DENIAL_CSRF_REJECTION,
  DENIAL_RATE_LIMIT_EXCEEDED,
} from './error-codes.js';

// Canonical closed set of denial reasons. Any value not in this set is
// rejected at the `logRequestDenial` boundary so the `detail_json`
// column stays machine-parseable and the table remains queryable by a
// known set of enum values.
const ALLOWED_DENIAL_REASONS = new Set([
  DENIAL_ACCOUNT_SUSPENDED,
  DENIAL_PAYMENT_HOLD,
  DENIAL_SESSION_INVALIDATED,
  DENIAL_CSRF_REJECTION,
  DENIAL_RATE_LIMIT_EXCEEDED,
]);

// High-volume categories are sampled at 10% after the first 10 per
// route per 10-minute window. This prevents rate-limit storms from
// filling the denials table while keeping the first few events for
// diagnostics. The sampling state is in-memory per isolate — this is
// intentionally imprecise (Workers are multi-tenant) but sufficient
// for volume control.
const HIGH_VOLUME_REASONS = new Set([
  DENIAL_RATE_LIMIT_EXCEEDED,
]);

const SAMPLE_WINDOW_MS = 10 * 60 * 1000;
const SAMPLE_THRESHOLD = 10;
const SAMPLE_RATE = 0.1;

// Per-isolate sampling counters. Shape:
// Map<string, { windowStart: number, count: number }>
const samplingCounters = new Map();

// Expose for tests so they can reset sampling state between runs.
export function __resetSamplingCountersForTests() {
  samplingCounters.clear();
}

// Deterministic for tests: default to Math.random, overridable.
let samplingRng = Math.random;

export function __setSamplingRngForTests(fn) {
  samplingRng = typeof fn === 'function' ? fn : Math.random;
}

/**
 * Determine whether this denial should be captured based on sampling
 * rules. Low-volume categories are always captured. High-volume
 * categories are captured at 100% for the first `SAMPLE_THRESHOLD`
 * events per route per window, then at `SAMPLE_RATE` thereafter.
 *
 * @param {string} denialReason
 * @param {string} routeName
 * @param {number} now
 * @returns {boolean}
 */
export function shouldCaptureDenial(denialReason, routeName, now) {
  if (!HIGH_VOLUME_REASONS.has(denialReason)) return true;

  const key = `${denialReason}:${routeName || 'unknown'}`;
  const windowStart = Math.floor(now / SAMPLE_WINDOW_MS) * SAMPLE_WINDOW_MS;

  let counter = samplingCounters.get(key);
  if (!counter || counter.windowStart !== windowStart) {
    counter = { windowStart, count: 0 };
    samplingCounters.set(key, counter);
  }
  counter.count += 1;

  if (counter.count <= SAMPLE_THRESHOLD) return true;
  return samplingRng() < SAMPLE_RATE;
}

/**
 * Generate a unique ID for a denial row. Uses crypto.randomUUID when
 * available (Workers runtime), falls back to a timestamp-based ID for
 * test environments.
 */
function generateDenialId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `denial-${crypto.randomUUID()}`;
  }
  return `denial-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Mask a session ID to its last 8 characters. Returns null when the
 * session ID is missing or empty.
 *
 * @param {string|null|undefined} sessionId
 * @returns {string|null}
 */
export function maskSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const trimmed = sessionId.trim();
  if (!trimmed) return null;
  return trimmed.length <= 8 ? trimmed : trimmed.slice(-8);
}

/**
 * Build a closed-schema detail_json value from structured fields.
 * Only known keys are included; everything else is dropped.
 *
 * @param {object} fields
 * @returns {string|null}
 */
function buildDetailJson(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const allowed = {};
  // Only include known structured keys.
  const DETAIL_KEYS = [
    'code', 'opsStatus', 'retryAfterSeconds', 'bucket',
    'routeName', 'fetchSite', 'origin',
  ];
  for (const key of DETAIL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] != null) {
      const value = fields[key];
      // Ensure only primitives land in the JSON.
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        allowed[key] = value;
      }
    }
  }
  if (Object.keys(allowed).length === 0) return null;
  return JSON.stringify(allowed);
}

/**
 * Log a request denial to `admin_request_denials`. Fire-and-forget:
 * the INSERT is dispatched via `ctx.waitUntil` (when `ctx` is present)
 * and wrapped in try/catch so a DB outage never blocks the response.
 *
 * @param {object} db - D1 database handle.
 * @param {object|null} ctx - Cloudflare execution context (for waitUntil).
 * @param {object} params
 * @param {string} params.denialReason - One of the DENIAL_* constants.
 * @param {string} [params.routeName] - Route that was denied.
 * @param {string} [params.accountId] - Account ID (if known).
 * @param {string} [params.learnerId] - Learner ID (if known).
 * @param {string} [params.sessionId] - Full session ID (will be masked).
 * @param {boolean} [params.isDemo] - Whether this is a demo session.
 * @param {string} [params.release] - Release tag / commit hash.
 * @param {object} [params.detail] - Structured detail fields.
 * @param {number} [params.now] - Current epoch ms.
 */
export function logRequestDenial(db, ctx, {
  denialReason,
  routeName = null,
  accountId = null,
  learnerId = null,
  sessionId = null,
  isDemo = false,
  release = null,
  detail = null,
  now = Date.now(),
} = {}) {
  // Validate denial reason against closed set.
  if (!ALLOWED_DENIAL_REASONS.has(denialReason)) {
    // Unknown reason — silently skip. Never throw from a logging path.
    return;
  }

  // Apply sampling.
  if (!shouldCaptureDenial(denialReason, routeName, now)) {
    return;
  }

  const id = generateDenialId();
  const sessionIdLast8 = maskSessionId(sessionId);
  const detailJson = buildDetailJson(detail);
  const isDemoInt = isDemo ? 1 : 0;

  const doInsert = async () => {
    try {
      const statement = bindStatement(db, `
        INSERT INTO admin_request_denials (
          id, denied_at, denial_reason, route_name, account_id, learner_id,
          session_id_last8, is_demo, release, detail_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        now,
        denialReason,
        routeName,
        accountId,
        learnerId,
        sessionIdLast8,
        isDemoInt,
        release,
        detailJson,
      ]);
      await statement.run();
    } catch (error) {
      // Fire-and-forget: log the failure but never re-throw.
      try {
        // eslint-disable-next-line no-console
        console.error('[ks2-denial-logger]', JSON.stringify({
          event: 'denial_logger.insert_failed',
          denialReason,
          routeName,
          reason: error?.message || String(error),
        }));
      } catch {
        // Swallow — even the error log is best-effort.
      }
    }
  };

  // Dispatch via ctx.waitUntil when available (production Workers),
  // otherwise fire and forget (test environments).
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(doInsert());
  } else {
    doInsert();
  }
}
