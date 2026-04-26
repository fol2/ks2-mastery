import { json } from './http.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = Number(status) || 500;
    this.extra = extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : {};
  }
}

export class UnauthenticatedError extends HttpError {
  constructor(message = 'Authenticated adult account required.', extra = {}) {
    super(401, message, {
      ok: false,
      code: 'unauthenticated',
      ...extra,
    });
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Learner access denied.', extra = {}) {
    super(403, message, {
      ok: false,
      code: 'forbidden',
      ...extra,
    });
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found.', extra = {}) {
    super(404, message, {
      ok: false,
      code: 'not_found',
      ...extra,
    });
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict.', extra = {}) {
    super(409, message, {
      ok: false,
      code: 'conflict',
      ...extra,
    });
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request.', extra = {}) {
    super(400, message, {
      ok: false,
      code: 'bad_request',
      ...extra,
    });
  }
}

export class BackendUnavailableError extends HttpError {
  constructor(message = 'Backend persistence is not configured.', extra = {}) {
    super(503, message, {
      ok: false,
      code: 'backend_unavailable',
      ...extra,
    });
  }
}

/**
 * Thrown from the command hot path when the command.projection.v1 read
 * model is missing AND the bounded 200-event fallback rehydrate itself
 * fails (e.g. D1 5xx). Produces a 503 response payload shaped
 * `{ok: false, error: 'projection_unavailable', retryable: false, requestId}`
 * so the client's `isCommandBackendExhausted()` classifier can move the
 * command to pending without transport-retry, jitter, or bootstrap
 * recovery. See U6 plan section for rationale.
 */
export class ProjectionUnavailableError extends HttpError {
  constructor(message = 'Command projection is unavailable.', extra = {}) {
    super(503, message, {
      ok: false,
      error: 'projection_unavailable',
      retryable: false,
      ...extra,
    });
  }
}

export function isProjectionUnavailableError(error) {
  return error instanceof ProjectionUnavailableError;
}

export class AuthConfigurationError extends HttpError {
  constructor(message = 'Production auth adapter is not configured.', extra = {}) {
    super(501, message, {
      ok: false,
      code: 'auth_not_implemented',
      ...extra,
    });
  }
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    return json({
      ok: false,
      message: error.message,
      ...error.extra,
    }, error.status);
  }

  return json({
    ok: false,
    code: 'internal_error',
    message: error?.message || 'Unexpected server error.',
  }, 500);
}
