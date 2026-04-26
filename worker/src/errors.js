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

// Phase D / U14: three auth-boundary errors that the admin-refresh-error
// router (Phase A) already maps to UX. Each one is a subclass so callers
// can `instanceof`-test without relying on the code string.

/**
 * Thrown by `requireActiveAccount(session)` when the account's
 * `ops_status === 'suspended'`. Surfaces 403 `account_suspended`. The
 * client-side global handler redirects to the unauthenticated shell with
 * an explanatory banner (Phase A U1 registered the code).
 */
export class AccountSuspendedError extends HttpError {
  constructor(message = 'Account is suspended. Contact operations.', extra = {}) {
    super(403, message, {
      ok: false,
      code: 'account_suspended',
      ...extra,
    });
  }
}

/**
 * Thrown by `requireMutationCapability(session)` when the account's
 * `ops_status === 'payment_hold'`. GET routes remain accessible so the
 * user can reach the billing UI; any mutation-receipt-bearing route
 * rejects with 403 `account_payment_hold`.
 */
export class AccountPaymentHoldError extends HttpError {
  constructor(message = 'This action requires active billing. Contact ops.', extra = {}) {
    super(403, message, {
      ok: false,
      code: 'account_payment_hold',
      ...extra,
    });
  }
}

/**
 * Thrown by `requireSession` when the session row's
 * `status_revision_at_issue` is behind the account's current
 * `account_ops_metadata.status_revision`. The client-side global handler
 * transitions the app to the sign-in surface; re-auth creates a fresh
 * session stamp that matches the new revision.
 */
export class SessionInvalidatedError extends HttpError {
  constructor(message = 'Your session is no longer valid. Please sign in again.', extra = {}) {
    super(401, message, {
      ok: false,
      code: 'session_invalidated',
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
