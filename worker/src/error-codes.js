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
