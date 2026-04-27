// Phase D / U14: authoritative registry of Phase-D / Phase-E structured
// error codes. Each code is the exact string the Worker emits on the wire
// and mirrors a registered entry in `src/platform/hubs/admin-refresh-error-text.js`
// (Phase A) so the client error-banner router can dispatch without
// touching Phase D code.
//
// The constants exist as a single point of truth — U14's auth helpers,
// U15's repository guards, and U17's auto-reopen rule all reference the
// same symbol so a rename cannot drift across call sites.

export const ACCOUNT_SUSPENDED = 'account_suspended';
export const ACCOUNT_PAYMENT_HOLD = 'account_payment_hold';
export const SESSION_INVALIDATED = 'session_invalidated';
export const SELF_SUSPEND_FORBIDDEN = 'self_suspend_forbidden';
export const LAST_ADMIN_LOCKED_OUT = 'last_admin_locked_out';
export const ACCOUNT_OPS_METADATA_STALE = 'account_ops_metadata_stale';
export const RECONCILE_IN_PROGRESS = 'reconcile_in_progress';

// P3 U4: denial-reason codes captured in `admin_request_denials`.
export const DENIAL_ACCOUNT_SUSPENDED = 'account_suspended';
export const DENIAL_PAYMENT_HOLD = 'payment_hold';
export const DENIAL_SESSION_INVALIDATED = 'session_invalidated';
export const DENIAL_CSRF_REJECTION = 'csrf_rejection';
export const DENIAL_RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded';

// ADV-U4-004: shared origin-check code used by request-origin.js and app.js.
export const SAME_ORIGIN_REQUIRED = 'same_origin_required';

// U6: Debug Bundle error codes
export const DEBUG_BUNDLE_RATE_LIMITED = 'admin_debug_bundle_rate_limited';

// U11: Marketing / Live Ops V0 error codes
export const MARKETING_INVALID_TRANSITION = 'marketing_invalid_transition';
export const MARKETING_BROAD_PUBLISH_UNCONFIRMED = 'marketing_broad_publish_unconfirmed';
export const MARKETING_UNSAFE_LINK_SCHEME = 'marketing_unsafe_link_scheme';
export const MARKETING_BODY_CONTAINS_HTML = 'marketing_body_contains_html';
export const MARKETING_MAINTENANCE_REQUIRES_ENDS_AT = 'marketing_maintenance_requires_ends_at';
export const MARKETING_MESSAGE_STALE = 'marketing_message_stale';
