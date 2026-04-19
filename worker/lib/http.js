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

    // Accept either the canonical `{ payload, headers }` shape or a shorthand
    // where the options object IS the payload. An empty options object must
    // fall through to the default `{ ok, message }` body — previously `{}`
    // was truthy enough to pin `this.payload = {}` and silently erase the
    // error body on every `new HttpError(status, message)` call.
    const hasShorthandPayload =
      options
      && Object.keys(options).length > 0
      && !("payload" in options)
      && !("headers" in options);
    const resolved = hasShorthandPayload ? { payload: options } : options;

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
  try {
    const requestId = getRequestId(c) || createRequestId(c.req.raw);
    const startedAt = c.get("requestStartedAt") || Date.now();
    c.set("requestId", requestId);

    let response;

    if (error instanceof HttpError) {
      response = json(c, error.status, error.payload);
      applyHeaders(response, error.headers);
    } else {
      // Log the unexpected-error path in a separate try so a logging failure
      // does not cascade into a bare Hono 500 with no response body.
      try {
        logError(c, "request.failed", error);
      } catch {
        // Swallow — emitting the fallback 500 is more important than logging.
      }
      response = json(c, 500, {
        ok: false,
        message: "Unexpected server error.",
        requestId,
      });
    }

    attachRequestId(response, requestId);

    if (!c.get("requestLogged") && shouldLogRequest(c, response)) {
      try {
        logRequestCompletion(c, response, startedAt);
      } catch {
        // Non-fatal — the request already has a response.
      }
      c.set("requestLogged", true);
    }

    return response;
  } catch {
    // Last-ditch fallback — any throw inside the error handler itself
    // (circular error, frozen headers) must not escape to Hono's default path.
    return c.json({ ok: false, message: "Unexpected server error." }, 500);
  }
}
