import {
  attachRequestId,
  createRequestId,
  getRequestId,
  logError,
  logRequestCompletion,
} from "./observability.js";

export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;

    const resolved = options && !("payload" in options) && !("headers" in options)
      ? { payload: options }
      : options;

    this.payload = resolved.payload || { ok: false, message };
    this.headers = resolved.headers || {};
  }
}

export class ValidationError extends HttpError {
  constructor(message, details) {
    super(400, message, {
      payload: details ? { ok: false, message, details } : { ok: false, message },
    });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found.") {
    super(404, message, { payload: { ok: false, message } });
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends HttpError {
  constructor(message, retryAfterSeconds = 0) {
    super(429, message, {
      payload: {
        ok: false,
        message,
        retryAfterSeconds: retryAfterSeconds || undefined,
      },
      headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {},
    });
    this.name = "RateLimitError";
  }
}

export function json(c, status, payload) {
  return c.json(payload, status);
}

export function appOrigin(c) {
  return new URL(c.req.url).origin;
}

export function secureCookieForRequest(c) {
  return c.req.url.startsWith("https://");
}

export function clientIp(c) {
  const direct = String(
    c.req.header("CF-Connecting-IP")
    || c.req.header("True-Client-IP")
    || "",
  ).trim();
  if (direct) return direct;
  const forwarded = String(c.req.header("X-Forwarded-For") || "").trim();
  return forwarded ? forwarded.split(",")[0].trim() : "";
}

export async function readJsonBody(c) {
  return c.req.json().catch(() => ({}));
}

export async function readFormBody(c) {
  return c.req.parseBody().catch(() => ({}));
}

function shouldLogRequest(c, response) {
  const pathname = new URL(c.req.url).pathname;
  return pathname.startsWith("/api/") || Number(response?.status || 0) >= 500;
}

function applyHeaders(response, headers) {
  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      response.headers.set(key, String(value));
    }
  });
  return response;
}

export function handleHttpError(error, c) {
  const requestId = getRequestId(c) || createRequestId(c.req.raw);
  const startedAt = c.get("requestStartedAt") || Date.now();
  c.set("requestId", requestId);

  let response;

  if (error instanceof HttpError) {
    response = json(c, error.status, error.payload);
    applyHeaders(response, error.headers);
  } else {
    logError(c, "request.failed", error);
    response = json(c, 500, {
      ok: false,
      message: "Unexpected server error.",
      requestId,
    });
  }

  attachRequestId(response, requestId);

  if (!c.get("requestLogged") && shouldLogRequest(c, response)) {
    logRequestCompletion(c, response, startedAt);
    c.set("requestLogged", true);
  }

  return response;
}
