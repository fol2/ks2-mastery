import { json } from './http.js';
import {
  ACCOUNT_SUSPENDED,
  ACCOUNT_PAYMENT_HOLD,
  SESSION_INVALIDATED,
} from './error-codes.js';

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
 * fails (e.g. D1 5xx). Route handlers may still map this to a 503 response
 * for command types that cannot degrade safely. Spelling catches this error
 * inside its subject handler and continues without reward/read-model side
 * effects so the learner flow is not interrupted by optional projection work.
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
      code: ACCOUNT_SUSPENDED,
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
      code: ACCOUNT_PAYMENT_HOLD,
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
      code: SESSION_INVALIDATED,
      ...extra,
    });
  }
}

function retryAfterHeader(extra = {}) {
  const seconds = Number(extra?.retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return String(Math.ceil(seconds));
}

export function errorResponse(error) {
  if (error instanceof HttpError) {
    const retryAfter = retryAfterHeader(error.extra);
    return json({
      ok: false,
      message: error.message,
      ...error.extra,
    }, error.status, retryAfter ? { 'retry-after': retryAfter } : {});
  }

  return json({
    ok: false,
    code: 'internal_error',
    message: error?.message || 'Unexpected server error.',
  }, 500);
}
