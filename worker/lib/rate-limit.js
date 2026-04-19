import { sha256 } from "./security.js";

let warnedAboutEmptyIdentifier = false;

function requiredDb(env) {
  if (!env.DB) throw new Error("D1 binding `DB` is not configured.");
  return env.DB;
}

function currentWindowStart(timestamp, windowMs) {
  return Math.floor(timestamp / windowMs) * windowMs;
}

export async function consumeRateLimit(env, options) {
  const bucket = String(options?.bucket || "").trim().toLowerCase();
  const identifier = String(options?.identifier || "").trim();
  const limit = Number(options?.limit) || 0;
  const windowMs = Number(options?.windowMs) || 0;

  if (!bucket || limit <= 0 || windowMs <= 0) {
    return {
      allowed: true,
      skipped: true,
      requestCount: 0,
      retryAfterSeconds: 0,
    };
  }

  if (!identifier) {
    // Empty identifier usually means CF-Connecting-IP (and its backups) were
    // stripped — wrangler dev, misrouted proxies, or a non-CF entrypoint.
    // We still skip this bucket so we don't lump unrelated callers into a
    // single shared throttle that tests and local dev would constantly trip,
    // but we log a warning once per isolate so a production misconfig shows
    // up in observability instead of silently disabling the limiter.
    // Defence in depth: email- and session-scoped buckets keep covering
    // abuse even when the IP bucket no-ops.
    if (!warnedAboutEmptyIdentifier) {
      warnedAboutEmptyIdentifier = true;
      console.warn(`[rate-limit] skipping bucket "${bucket}" because identifier was empty; ensure CF-Connecting-IP is populated in production.`);
    }
    return {
      allowed: true,
      skipped: true,
      requestCount: 0,
      retryAfterSeconds: 0,
    };
  }

  const db = requiredDb(env);
  const timestamp = Number(options?.now) || Date.now();
  const windowStartedAt = currentWindowStart(timestamp, windowMs);
  const limiterKey = `${bucket}:${await sha256(identifier)}`;

  // Single atomic upsert: if a row for this key exists AND matches the
  // current window, increment; otherwise start a new window at 1. The
  // previous implementation read the row into JS memory, added 1, and wrote
  // the absolute value back — two concurrent requests in the same window
  // both read N and both wrote N+1, letting a parallel burst double the
  // configured cap. Doing the arithmetic in SQL keeps it serialised by the
  // D1 write path.
  const upsert = await db
    .prepare(`
      INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
      VALUES (?1, ?2, 1, ?3)
      ON CONFLICT(limiter_key) DO UPDATE SET
        request_count = CASE
          WHEN request_limits.window_started_at = excluded.window_started_at
            THEN request_limits.request_count + 1
          ELSE 1
        END,
        window_started_at = excluded.window_started_at,
        updated_at = excluded.updated_at
      RETURNING request_count, window_started_at
    `)
    .bind(limiterKey, windowStartedAt, timestamp)
    .first();

  const storedCount = Number(upsert?.request_count || 0) || 1;
  const storedWindow = Number(upsert?.window_started_at || windowStartedAt);

  return {
    allowed: storedCount <= limit,
    skipped: false,
    requestCount: storedCount,
    retryAfterSeconds: Math.max(1, Math.ceil(((storedWindow + windowMs) - timestamp) / 1000)),
  };
}
