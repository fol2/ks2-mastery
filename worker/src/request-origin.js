// U6 (sys-hardening p1): pure request-origin helpers shared between
// `worker/src/auth.js`, `worker/src/app.js`, and `worker/src/demo/sessions.js`.
//
// `demo/sessions.js` previously owned these helpers but also imports from
// `auth.js` (for `randomToken`, `sessionCookie`, `sha256`, `createSession`).
// Making `auth.requireSession()` call `requireSameOrigin()` (plan KTD F-07,
// default-on Sec-Fetch-Site check for every authenticated route) would
// otherwise create a circular import. This module is the shared primitive
// that both callers delegate to.

import { ForbiddenError } from './errors.js';

function cleanText(value) {
  return String(value || '').trim();
}

export function isProductionRuntime(env = {}) {
  const authMode = cleanText(env.AUTH_MODE).toLowerCase();
  const stage = cleanText(env.ENVIRONMENT || env.NODE_ENV).toLowerCase();
  if (authMode === 'development-stub') return false;
  if (authMode === 'production') return true;
  if (stage === 'test' || stage === 'development' || stage === 'dev') return false;
  return stage === 'production' || Boolean(authMode);
}

function requestOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

function explicitAppOrigin(env = {}) {
  const configured = cleanText(env.APP_ORIGIN);
  return configured ? configured.replace(/\/$/, '') : '';
}

function appOrigins(env = {}, request) {
  const explicit = explicitAppOrigin(env);
  if (explicit) return new Set([explicit]);
  const origin = requestOrigin(request);
  const hostname = cleanText(env.APP_HOSTNAME);
  return new Set([
    hostname ? `https://${hostname}` : '',
    origin,
  ].filter(Boolean));
}

/**
 * Enforce same-origin requests via the `Origin` and `Sec-Fetch-Site` headers.
 *
 * Per plan KTD F-07, this runs as the first thing after session resolution
 * inside `auth.requireSession()` so every authenticated route inherits the
 * check. Public routes (`/api/health`, `/api/demo/session`, OAuth callbacks,
 * raw ASSETS fetches for unauthenticated GETs) still call it explicitly or
 * stay opt-in via `allowMissingOrigin`.
 *
 * The check is tolerant of:
 *   - absent `Origin` header (browsers omit it on direct navigation in
 *     certain flows, or when caller is non-production runtime);
 *   - `Sec-Fetch-Site: none` (direct navigation — `Origin` is typically
 *     absent in this case, so the `Origin` branch below is what filters);
 *   - `Sec-Fetch-Site: same-origin` / `same-site` (both are allowed by
 *     browser convention for same-site apps).
 *
 * It rejects:
 *   - `Sec-Fetch-Site: cross-site`
 *   - `Origin` header that does not match any configured app origin.
 */
export function requireSameOrigin(
  request,
  env = {},
  { allowMissingOrigin = false, mode = 'strict' } = {},
) {
  const fetchSite = cleanText(request.headers.get('sec-fetch-site')).toLowerCase();

  // Fast-path reject on explicit cross-site Sec-Fetch-Site, even when the
  // browser forgot to set Origin. This is the primary CSRF filter for
  // authenticated reads where the browser will honour SameSite=Lax cookies
  // (plan KTD F-07, default-on in `auth.requireSession`).
  //
  // The cross-site rejection is suppressed when `allowMissingOrigin: true` —
  // the `/demo` handler uses this option to accept user-clicks from external
  // sites (links shared via chat/social) as a legitimate top-level nav entry.
  // These entries cannot carry an authenticated session from the referring
  // site, so cross-site here is not a CSRF surface.
  if (fetchSite === 'cross-site' && !allowMissingOrigin) {
    throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
      code: 'same_origin_required',
    });
  }

  // When `mode: 'sec-fetch-only'` (the default-on path used by
  // `auth.requireSession`), we rely solely on the Sec-Fetch-Site signal.
  // Missing Sec-Fetch-Site or explicit `none/same-origin/same-site` is
  // treated as trusted. Existing callers that also want the Origin-header
  // check stay on the default `mode: 'strict'` behaviour.
  if (mode === 'sec-fetch-only') {
    return;
  }

  // `sec-fetch-site: none/same-origin/same-site` are all trusted browser
  // signals for the strict mode too; avoid reading Origin when possible.
  if (fetchSite === 'none' || fetchSite === 'same-origin' || fetchSite === 'same-site') {
    return;
  }

  const origin = cleanText(request.headers.get('origin'));
  if (!origin) {
    if (!allowMissingOrigin && isProductionRuntime(env)) {
      throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
        code: 'same_origin_required',
      });
    }
    return;
  }
  if (!appOrigins(env, request).has(origin)) {
    throw new ForbiddenError('This request must come from the KS2 Mastery app origin.', {
      code: 'same_origin_required',
    });
  }
}
