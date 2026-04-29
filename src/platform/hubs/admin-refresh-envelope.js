// P6 Unit 10: unified refresh-envelope and timestamp helpers — content-free leaf.
//
// Extracts duplicated timestamp formatting and error-envelope construction
// into a single shared module. All admin panels can import from here instead
// of maintaining their own identical copies.
//
// This module MUST NOT import subject content datasets or any module that
// transitively pulls in spelling / grammar / punctuation content bundles.
// The audit gate enforces this invariant.

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

/**
 * Format a numeric timestamp (ms since epoch) into a compact ISO-like string
 * suitable for admin panel display. Returns the em-dash fallback for
 * null / zero / negative / NaN / non-finite values.
 *
 * Output shape: "2023-11-14 22:13:20 UTC"
 *
 * @param {*} ts — numeric ms timestamp (or any value that coerces via Number())
 * @returns {string}
 */
export function formatAdminTimestamp(ts) {
  const numeric = Number(ts);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  try {
    return new Date(numeric).toISOString().replace('T', ' ').replace(/\.000Z$/, ' UTC');
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Refresh error envelope
// ---------------------------------------------------------------------------

/**
 * Derive the refreshError envelope the `<PanelHeader>` consumes from a thrown
 * hub-api error. `code` is taken verbatim from the Worker payload when present;
 * `network` is the fallback for fetch rejections / malformed envelopes.
 *
 * @param {object|null|undefined} error — the caught error from a refresh attempt
 * @returns {{ code: string, message: string, correlationId: string|null, at: number }}
 */
export function buildRefreshErrorEnvelope(error) {
  const code = typeof error?.code === 'string' && error.code ? error.code : 'network';
  const message = typeof error?.message === 'string' ? error.message : '';
  const correlationId = error?.payload?.correlationId || error?.correlationId || null;
  return {
    code,
    message,
    correlationId,
    at: Date.now(),
  };
}
