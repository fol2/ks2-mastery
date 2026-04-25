// U6 (sys-hardening p1): single source of truth for response security headers.
//
// Decisions encoded here (see docs/plans/2026-04-25-003-fix-sys-hardening-p1-plan.md):
// - HSTS ships without `preload` (security F-03); preload flip is a separate PR.
// - Permissions-Policy is deny-by-default, including `microphone=()` (F-09).
// - `Cross-Origin-Embedder-Policy: require-corp` is intentionally absent so
//   Google Fonts / future Turnstile iframes do not break.
// - CSP is NOT included in this unit. CSP report-only lands in U7 and extends
//   this module.
// - The wrapper is called from `worker/src/index.js` ONLY (single wrap site
//   per F-01). It uses `headers.set()` to force path-specific cache rules on
//   bundles that arrive from `env.ASSETS.fetch` with `no-store` applied.

export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

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

export const SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': HSTS_VALUE,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-site',
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
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // `set()` (not `append()`) — F-01 single-site guarantee.
    headers.set(name, value);
  }

  // Path-specific cache rules. Order matters: bundle immutable takes
  // precedence over any existing `Cache-Control` because ASSETS responses
  // arrive with `no-store` from the `_headers` `/*` rule.
  if (isImmutableBundlePath(pathname)) {
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
