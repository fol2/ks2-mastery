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

function formatErrorStack(error) {
  if (!error?.stack) return undefined;
  return String(error.stack)
    .split("\n")
    .slice(0, 8)
    .join("\n");
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
  const rayId = String(request.headers.get("cf-ray") || "").trim();
  if (rayId) return rayId.split("-")[0];
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
    errorMessage: error?.message || String(error),
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

export async function checkDatabaseHealth(env) {
  if (!env.DB) {
    return { ok: false, detail: "D1 binding is not configured." };
  }

  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return { ok: true, detail: "D1 responded to a ping query." };
  } catch (error) {
    return {
      ok: false,
      detail: error?.message || "D1 ping failed.",
    };
  }
}
