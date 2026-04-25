// U6 (sys-hardening p1): pure drift contract for the published `_headers`.
//
// Exported so both `scripts/assert-build-public.mjs` (CLI build gate) and
// `tests/security-headers.test.js` (execution-based drift lock per review
// testing-gap-3) can share one implementation. Keeping this file free of
// side-effects (no top-level await, no filesystem reads) means tests can
// import it without triggering the build-artefact assertions.

const REQUIRED_SECURITY_HEADER_LINES = [
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'X-Frame-Options: DENY',
  'Cross-Origin-Opener-Policy: same-origin-allow-popups',
  'Cross-Origin-Resource-Policy: same-site',
];

/**
 * Validate that a `_headers` content string carries the full security set,
 * the Permissions-Policy microphone deny, no HSTS preload, and the immutable
 * cache rule for hashed bundles. Throws with a clear message on first miss.
 *
 * @param {string} headersContent - Raw contents of a `_headers` file.
 * @returns {void}
 */
export function assertHeadersBlockIsFresh(headersContent) {
  if (typeof headersContent !== 'string') {
    throw new Error('assertHeadersBlockIsFresh: headersContent must be a string.');
  }
  for (const line of REQUIRED_SECURITY_HEADER_LINES) {
    if (!headersContent.includes(line)) {
      throw new Error(`Published _headers is missing required security-header line: ${line}`);
    }
  }
  if (!/Permissions-Policy:[^\n]*microphone=\(\)/.test(headersContent)) {
    throw new Error('Published _headers is missing Permissions-Policy with microphone=() (F-09 deny-by-default).');
  }
  if (/preload/.test(headersContent)) {
    throw new Error('Published _headers must not carry HSTS preload in this pass (F-03 deferred).');
  }
  if (!/public, max-age=31536000, immutable/.test(headersContent)) {
    throw new Error('Published _headers must carry an immutable cache rule for hashed bundles.');
  }
}
