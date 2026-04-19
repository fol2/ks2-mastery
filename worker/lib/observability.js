export const REQUEST_ID_HEADER = "x-request-id";

function compact(fields) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function requestMeta(c) {
  const request = c.req.raw;
  const url = new URL(request.url);
  const cf = request.cf || {};
  const logContext = c.get("logContext") || {};

  return compact({
    service: String(c.env.APP_NAME || "KS2 Mastery"),
    requestId: getRequestId(c),
    method: request.method,
    path: url.pathname,
    host: url.host,
    rayId: request.headers.get("cf-ray") || undefined,
    colo: cf.colo,
    country: cf.country,
    region: cf.regionCode,
    city: cf.city,
    userId: logContext.userId,
    sessionId: logContext.sessionId,
    selectedChildId: logContext.selectedChildId,
  });
}

// Light scrub to keep the runbook's "no cookies/passwords in logs" promise
// from being quietly broken by a thrown error whose message happens to
// embed an email, bearer token, or authorisation header. Applied to both
// errorMessage and the stack trace, because most JS engines repeat the
// message verbatim on stack line 1.
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER_PATTERN = /(?:bearer|token|authorization)\s*[=:]?\s*[A-Za-z0-9._\-+=/]{16,}/gi;

function redactErrorMessage(raw) {
  if (raw == null) return String(raw);
  return String(raw)
    .replace(EMAIL_PATTERN, "[redacted-email]")
    .replace(BEARER_PATTERN, "[redacted-secret]");
}

function formatErrorStack(error) {
  if (!error?.stack) return undefined;
  return redactErrorMessage(
    String(error.stack)
      .split("\n")
      .slice(0, 8)
      .join("\n"),
  );
}

function emit(level, event, fields) {
  const entry = compact({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}

export function createRequestId(request) {
  // Only trust `cf-ray` when the request actually came through Cloudflare's
  // edge (request.cf is populated there and absent in service-binding or
  // test harness calls). Prevents a caller from pinning their own ID.
  const rayId = String(request.headers.get("cf-ray") || "").trim();
  if (rayId && request.cf) return rayId.split("-")[0];
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getRequestId(c) {
  return String(c.get("requestId") || "");
}

export function attachRequestId(response, requestId) {
  if (response?.headers && requestId && !response.headers.has(REQUEST_ID_HEADER)) {
    response.headers.set(REQUEST_ID_HEADER, requestId);
  }
  return response;
}

export function setLogContext(c, fields) {
  const current = c.get("logContext") || {};
  c.set("logContext", { ...current, ...compact(fields || {}) });
}

export function logInfo(c, event, fields = {}) {
  emit("info", event, { ...requestMeta(c), ...compact(fields) });
}

export function logError(c, event, error, fields = {}) {
  emit("error", event, {
    ...requestMeta(c),
    ...compact(fields),
    errorName: error?.name || "Error",
    errorMessage: redactErrorMessage(error?.message || String(error)),
    stack: formatErrorStack(error),
  });
}

export function logRequestCompletion(c, response, startedAt) {
  const durationMs = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  const status = response?.status || 500;
  const contentLength = response?.headers?.get("content-length");
  const cacheStatus = response?.headers?.get("cf-cache-status");

  emit(status >= 500 ? "error" : "info", "request.completed", {
    ...requestMeta(c),
    status,
    durationMs,
    outcome: status >= 500 ? "error" : "ok",
    contentLength,
    cacheStatus,
  });
}

// Tables the application assumes exist. If any are missing, migrations
// have not applied and /api/* routes will 500 even though a SELECT 1
// succeeds. Keep this list aligned with migrations/0001_initial_schema.sql.
const REQUIRED_TABLES = ["users", "sessions", "children"];

export async function checkDatabaseHealth(env) {
  if (!env.DB) {
    return { ok: false, detail: "D1 binding is not configured." };
  }

  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    const row = await env.DB
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (${REQUIRED_TABLES.map(() => "?").join(",")})`,
      )
      .bind(...REQUIRED_TABLES)
      .first();
    if (Number(row?.n ?? 0) < REQUIRED_TABLES.length) {
      return { ok: false, detail: "D1 is reachable but required tables are missing." };
    }
    return { ok: true, detail: "D1 responded to a ping query." };
  } catch (error) {
    // Surface a generic detail outward; the real error still reaches
    // Cloudflare logs as a structured entry so operators can debug.
    emit("error", "health.database.failed", {
      errorName: error?.name || "Error",
      errorMessage: redactErrorMessage(error?.message || String(error)),
    });
    return { ok: false, detail: "D1 ping failed." };
  }
}
