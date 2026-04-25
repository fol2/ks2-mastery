// U6 (sys-hardening p1): pure drift contract for the published `_headers`.
// U7 (sys-hardening p1): extended to cover the CSP Report-Only line plus
// the Report-To / Reporting-Endpoints headers.
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

// U7: the CSP line is shipped as Report-Only first; must include the
// baseline directives that security-headers.js emits. We check the
// header name + the strict-dynamic keyword + the report-uri so that a
// silent downgrade (dropping `'strict-dynamic'`, removing the report
// endpoint) fails the drift gate.
const REQUIRED_CSP_SUBSTRINGS = [
  'Content-Security-Policy-Report-Only:',
  "default-src 'none'",
  "'strict-dynamic'",
  "manifest-src 'self'",
  "worker-src 'none'",
  'connect-src',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'report-uri /api/security/csp-report',
  'report-to csp-endpoint',
  'upgrade-insecure-requests',
];

/**
 * Validate that a `_headers` content string carries the full security set,
 * the Permissions-Policy microphone deny, no HSTS preload, the immutable
 * cache rule for hashed bundles, and the U7 CSP Report-Only line. Throws
 * with a clear message on first miss.
 *
 * `allowPlaceholderHash` controls whether the `'sha256-BUILD_TIME_HASH'`
 * placeholder is permitted. The repo-root `_headers` carries the
 * placeholder; the published `dist/public/_headers` must have it
 * substituted with the real hash.
 *
 * @param {string} headersContent - Raw contents of a `_headers` file.
 * @param {{ allowPlaceholderHash?: boolean }} [options]
 * @returns {void}
 */
export function assertHeadersBlockIsFresh(headersContent, { allowPlaceholderHash = false } = {}) {
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
  if (/Strict-Transport-Security[^\n]*preload/i.test(headersContent)) {
    throw new Error('Published _headers must not carry HSTS preload in this pass (F-03 deferred).');
  }
  if (!/public, max-age=31536000, immutable/.test(headersContent)) {
    throw new Error('Published _headers must carry an immutable cache rule for hashed bundles.');
  }
  for (const needle of REQUIRED_CSP_SUBSTRINGS) {
    if (!headersContent.includes(needle)) {
      throw new Error(`Published _headers is missing required CSP substring: ${needle}`);
    }
  }
  const hasSubstitutedHash = /'sha256-[A-Za-z0-9+/]+=*'/.test(headersContent)
    && !headersContent.includes("'sha256-BUILD_TIME_HASH'");
  const hasPlaceholder = headersContent.includes("'sha256-BUILD_TIME_HASH'");
  if (!hasSubstitutedHash && !(allowPlaceholderHash && hasPlaceholder)) {
    if (hasPlaceholder) {
      throw new Error('Published _headers still carries the sha256-BUILD_TIME_HASH placeholder; build-public.mjs must substitute it.');
    }
    throw new Error('Published _headers must contain a CSP inline-script hash (sha256-<base64>).');
  }
  if (!/Report-To:[^\n]*csp-endpoint/.test(headersContent)) {
    throw new Error('Published _headers is missing Report-To: csp-endpoint group for CSP violation reports.');
  }
  if (!/Reporting-Endpoints:[^\n]*csp-endpoint/.test(headersContent)) {
    throw new Error('Published _headers is missing Reporting-Endpoints: csp-endpoint="/api/security/csp-report".');
  }
}
