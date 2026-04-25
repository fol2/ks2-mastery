// P1.5 Phase A (U1): authoritative error-code router for admin-ops narrow
// refresh failures. Every structured error code that any P1.5 phase can
// surface is registered here exactly once, so later phases do not need to
// touch routing logic when they start emitting new codes.
//
// The router returns a small object describing what the UI should do:
//
//   { text, kind, hasRetry, globalHandler?, delegate?, silent? }
//
// - `text`        — human banner copy (UK English). Absent when `silent` or
//                   `globalHandler` is set.
//  - `kind`        — 'warn' | 'error' | 'info' — drives the banner styling.
//  - `hasRetry`    — whether the banner should render a retry CTA.
//  - `globalHandler` — when present, the admin surface must NOT render a
//                    per-panel banner; it delegates to the app-shell global
//                    handler identified by this string (see U14 for sign-in
//                    redirect, suspended-landing transitions, etc.).
//  - `delegate`    — opaque token handed off to later phase UI (e.g. Phase C
//                    U9's row-level conflict banner). No banner is rendered
//                    by the shared header when `delegate` is set.
//  - `silent`      — true → the triggering action's own UI owns the 400
//                    message (e.g. form field validation). No refresh banner.
//
// The map below is load-bearing: tests assert the exact text strings, and
// later phases rely on the globalHandler / delegate / silent flags to
// compose their own UX without touching this file.
//
// UK English throughout; every entry is keyed by the structured-error code
// string that the Worker emits verbatim on the wire.

const CODE_ENTRIES = Object.freeze({
  rate_limited: {
    text: 'Refresh throttled — retry in a moment',
    kind: 'warn',
    hasRetry: true,
  },
  admin_hub_forbidden: {
    text: 'Your session no longer has permission — please sign in again',
    kind: 'error',
    hasRetry: false,
    ctaKind: 're-auth',
  },
  session_invalidated: {
    // Global handler: the app shell catches this on ANY fetch (refresh or
    // mutation) and routes the user to the sign-in surface. Later phases
    // wire the actual redirect; Phase A just registers the code so the
    // shared router is the single point of truth.
    kind: 'info',
    hasRetry: false,
    globalHandler: 'global.session-invalidated',
  },
  account_suspended: {
    // Global handler: suspended-account landing page is a full-app state
    // transition, not a per-panel banner. Phase D wires the shell handler.
    kind: 'error',
    hasRetry: false,
    globalHandler: 'global.account-suspended',
  },
  account_payment_hold: {
    text: 'This action requires active billing. Contact ops.',
    kind: 'warn',
    hasRetry: false,
    ctaKind: 'billing',
  },
  self_suspend_forbidden: {
    text: 'You cannot change your own account status',
    kind: 'error',
    hasRetry: false,
  },
  last_admin_locked_out: {
    text: "Cannot change this account — they're the only active administrator",
    kind: 'error',
    hasRetry: false,
  },
  account_ops_metadata_stale: {
    // Delegate: Phase C U9 owns the row-level "Keep mine / Use theirs"
    // conflict banner. The shared panel header must NOT render a banner
    // when this code fires — the row surfaces its own diff UI.
    kind: 'warn',
    hasRetry: false,
    delegate: 'row-conflict',
  },
  reconcile_in_progress: {
    text: 'Another reconciliation is in progress — try again in a minute',
    kind: 'warn',
    hasRetry: true,
  },
  validation_failed: {
    // No panel banner — the triggering action's own UI owns the 400.
    kind: 'warn',
    hasRetry: false,
    silent: true,
  },
});

function defaultNetworkEntry(correlationId) {
  const baseText = 'Refresh failed — click to retry';
  const text = correlationId ? `${baseText} (correlation ${correlationId})` : baseText;
  return {
    text,
    kind: 'error',
    hasRetry: true,
  };
}

/**
 * Resolve an admin-ops narrow-refresh failure into the UI envelope the shared
 * `<PanelHeader>` consumes.
 *
 * @param {string|null|undefined} code             Structured error code
 *                                                  (`payload.code` from the
 *                                                  Worker envelope), or null
 *                                                  for a network-layer fail.
 * @param {object} [options]
 * @param {string|null} [options.correlationId]    Optional correlation id for
 *                                                  the default network banner.
 * @returns {{
 *   text?: string,
 *   kind: 'warn'|'error'|'info',
 *   hasRetry: boolean,
 *   globalHandler?: string,
 *   delegate?: string,
 *   silent?: boolean,
 *   ctaKind?: string,
 * }}
 */
export function routeAdminRefreshError(code, { correlationId = null } = {}) {
  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(CODE_ENTRIES, code)) {
    return CODE_ENTRIES[code];
  }
  return defaultNetworkEntry(correlationId);
}

// Export the registered code list as a frozen array so tests can assert that
// later phases have not quietly removed an entry.
export const ADMIN_REFRESH_ERROR_CODES = Object.freeze(Object.keys(CODE_ENTRIES));
