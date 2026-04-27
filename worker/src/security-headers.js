// U6 (sys-hardening p1): single source of truth for response security headers.
// U7 (sys-hardening p1): extended with a Content-Security-Policy (Report-Only)
// builder that carries the build-time hash of the inline theme-bootstrap
// script in `index.html`. Enforcement flip is a follow-up PR per charter.
//
// Decisions encoded here (see docs/plans/2026-04-25-003-fix-sys-hardening-p1-plan.md):
// - HSTS ships without `preload` (security F-03); preload flip is a separate PR.
// - Permissions-Policy is deny-by-default, including `microphone=()` (F-09).
// - `Cross-Origin-Embedder-Policy: require-corp` is intentionally absent so
//   Google Fonts / future Turnstile iframes do not break.
// - CSP is shipped as `Content-Security-Policy-Report-Only` (U7). After a
//   >=7-day observation window with zero blocking violations we flip to the
//   enforcing `Content-Security-Policy` header.
// - The wrapper is called from `worker/src/index.js` ONLY (single wrap site
//   per F-01). It uses `headers.set()` to force path-specific cache rules on
//   bundles that arrive from `env.ASSETS.fetch` with `no-store` applied.

import { CSP_INLINE_SCRIPT_HASH } from './generated-csp-hash.js';

// Placeholder hash shipped with `worker/src/generated-csp-hash.js` before
// the first build. `scripts/build-public.mjs` overwrites the module with
// the real sha256 of the inline theme-bootstrap script. A deployment that
// still carries the placeholder would emit a CSP that cannot validate the
// inline script; we surface that loudly at request-time so an operator
// catches the missed build before violation reports pile up.
const CSP_PLACEHOLDER_HASH = 'sha256-PLACEHOLDER_PRE_BUILD_HASH=';
let cspPlaceholderWarningEmitted = false;

function warnOnPlaceholderHashOnce() {
  if (cspPlaceholderWarningEmitted) return;
  if (CSP_INLINE_SCRIPT_HASH !== CSP_PLACEHOLDER_HASH) return;
  cspPlaceholderWarningEmitted = true;
  // eslint-disable-next-line no-console
  console.error(
    '[ks2-security-headers] CSP hash is still the pre-build placeholder; '
    + 'run npm run build to inject the real hash',
  );
}

// Operator gate for HSTS preload submission. Flip to `true` ONLY after the
// operator has completed every sign-off item in
// `docs/hardening/hsts-preload-audit.md` and the full DNS zone enumeration
// confirms every subdomain under `eugnel.uk` is HTTPS-only. See the audit
// document for rollback implications (preload is a two-year commitment).
export const HSTS_PRELOAD_ENABLED = false;

/**
 * Build the HSTS header value. Extracted as a pure function so both
 * branches (preload enabled / disabled) are testable without flipping
 * the module-level constant.
 *
 * @param {boolean} preloadEnabled
 * @returns {string}
 */
export function buildHstsValue(preloadEnabled) {
  const base = 'max-age=63072000; includeSubDomains';
  return preloadEnabled ? `${base}; preload` : base;
}

export const HSTS_VALUE = buildHstsValue(HSTS_PRELOAD_ENABLED);

export const PERMISSIONS_POLICY = [
  'camera=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'bluetooth=()',
  'serial=()',
  'hid=()',
  'midi=()',
  'microphone=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'autoplay=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'picture-in-picture=()',
  'interest-cohort=()',
  'browsing-topics=()',
].join(', ');

// U7: CSP policy. Each directive lives on its own line so reviewers can
// diff the policy without string-concat churn. The runtime joins with `; `
// to produce the header value.
const CSP_DIRECTIVES = Object.freeze([
  "default-src 'none'",
  `script-src 'self' '${CSP_INLINE_SCRIPT_HASH}' 'strict-dynamic' https://challenges.cloudflare.com`,
  `script-src-elem 'self' '${CSP_INLINE_SCRIPT_HASH}' https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "media-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'frame-src https://challenges.cloudflare.com',
  "base-uri 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "worker-src 'none'",
  // `upgrade-insecure-requests` is intentionally omitted while the policy
  // ships under `Content-Security-Policy-Report-Only`: per CSP3 the
  // directive is ignored in Report-Only delivery (Chrome emits a console
  // warning). HSTS `includeSubDomains` + HTTPS-only origin allowlists
  // already provide the upgrade in practice. Restore this directive in the
  // same PR that flips the header name to `Content-Security-Policy`.
  'report-uri /api/security/csp-report',
  'report-to csp-endpoint',
]);

export const CSP_POLICY_VALUE = CSP_DIRECTIVES.join('; ');

export const REPORT_TO_VALUE = JSON.stringify({
  group: 'csp-endpoint',
  max_age: 10886400,
  endpoints: [{ url: '/api/security/csp-report' }],
});

export const REPORTING_ENDPOINTS_VALUE = 'csp-endpoint="/api/security/csp-report"';

// Export the CSP hash so tests can assert the same value is substituted
// into `_headers` by the build step.
export { CSP_INLINE_SCRIPT_HASH };

export const SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': HSTS_VALUE,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Content-Security-Policy-Report-Only': CSP_POLICY_VALUE,
  'Report-To': REPORT_TO_VALUE,
  'Reporting-Endpoints': REPORTING_ENDPOINTS_VALUE,
});

// Path segments that receive the hashed-bundle immutable cache policy.
// The Worker response wrapper matches these with explicit `set()` so that
// ASSETS responses carrying `no-store` from `_headers` are overridden, not
// appended to (security F-01 + feasibility Claim 5).
const IMMUTABLE_BUNDLE_PREFIXES = ['/src/bundles/', '/assets/bundles/'];

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const FALLBACK_CACHE_CONTROL = 'no-store';

function isImmutableBundlePath(pathname) {
  if (!pathname) return false;
  return IMMUTABLE_BUNDLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isTtsBinaryResponse(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('audio/')) return true;
  // `cacheOnlyResponse` in worker/src/tts.js returns 204 with no content-type
  // but keeps `x-ks2-tts-cache` as a marker. Treat any x-ks2-tts-* header as
  // a TTS signal so its custom cache semantics survive.
  for (const [name] of response.headers) {
    if (name.toLowerCase().startsWith('x-ks2-tts-')) return true;
  }
  return false;
}

/**
 * Wrap any Response with the default security header set plus path-specific
 * cache rules. Returns a new Response; never mutates the input headers.
 *
 * @param {Response} response - Response produced by the Worker app.
 * @param {{ path?: string }} [options]
 * @returns {Response}
 */
export function applySecurityHeaders(response, { path: pathname = '' } = {}) {
  // One-shot log if the generated CSP hash module is still the committed
  // placeholder (i.e. `npm run build` never ran). Do NOT throw: tests and
  // fresh-clone boot paths must keep working.
  warnOnPlaceholderHashOnce();

  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // `set()` (not `append()`) — F-01 single-site guarantee.
    headers.set(name, value);
  }

  // Path-specific cache rules. Order matters: bundle immutable takes
  // precedence over any existing `Cache-Control` because ASSETS responses
  // arrive with `no-store` from the `_headers` `/*` rule.
  //
  // Security residual (review security-residual-1): the immutable cache must
  // only bind to 2xx responses. A 404 or 5xx under `/src/bundles/<unknown>.js`
  // would otherwise poison client caches for a year. Non-2xx bundle responses
  // fall through to the normal preservation/fallback logic below.
  const isSuccess = response.status >= 200 && response.status < 300;
  if (isImmutableBundlePath(pathname) && isSuccess) {
    headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  } else if (isTtsBinaryResponse(response)) {
    // TTS preserves its existing Cache-Control; do nothing.
  } else if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', FALLBACK_CACHE_CONTROL);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Produce a Netlify-style `_headers` line block (four-space indent) for the
 * default security set. Used by build-time drift assertions and by the
 * checked-in `_headers` file to keep a single source of truth.
 *
 * @param {{ indent?: string }} [options]
 * @returns {string}
 */
export function serialiseHeadersBlock({ indent = '  ' } = {}) {
  return Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `${indent}${name}: ${value}`)
    .join('\n');
}
