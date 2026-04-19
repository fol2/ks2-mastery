import { sha256 } from "./security.js";

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

  if (!bucket || !identifier || limit <= 0 || windowMs <= 0) {
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

  const row = await db
    .prepare(`
      SELECT window_started_at, request_count
      FROM request_limits
      WHERE limiter_key = ?1
      LIMIT 1
    `)
    .bind(limiterKey)
    .first();

  let requestCount = 1;

  if (!row || Number(row.window_started_at) !== windowStartedAt) {
    await db
      .prepare(`
        INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
        VALUES (?1, ?2, 1, ?3)
        ON CONFLICT(limiter_key) DO UPDATE SET
          window_started_at = excluded.window_started_at,
          request_count = excluded.request_count,
          updated_at = excluded.updated_at
      `)
      .bind(limiterKey, windowStartedAt, timestamp)
      .run();
  } else {
    requestCount = Number(row.request_count || 0) + 1;
    await db
      .prepare(`
        UPDATE request_limits
        SET request_count = ?2,
            updated_at = ?3
        WHERE limiter_key = ?1
      `)
      .bind(limiterKey, requestCount, timestamp)
      .run();
  }

  return {
    allowed: requestCount <= limit,
    skipped: false,
    requestCount,
    retryAfterSeconds: Math.max(1, Math.ceil(((windowStartedAt + windowMs) - timestamp) / 1000)),
  };
}
