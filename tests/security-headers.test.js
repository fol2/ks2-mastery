import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CSP_ENFORCEMENT_MODE,
  CSP_INLINE_SCRIPT_HASH,
  CSP_POLICY_VALUE,
  HSTS_PRELOAD_ENABLED,
  HSTS_VALUE,
  REPORT_TO_VALUE,
  REPORTING_ENDPOINTS_VALUE,
  SECURITY_HEADERS,
  applySecurityHeaders,
  buildHstsValue,
  serialiseHeadersBlock,
} from '../worker/src/security-headers.js';
import { applySecurityHeadersSafely } from '../worker/src/index.js';
import { assertHeadersBlockIsFresh } from '../scripts/lib/headers-drift.mjs';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// U6 + U7: security headers every Worker response + every `_headers`
// group must carry. U6 seeded the seven non-CSP headers; U7 added
// Content-Security-Policy-Report-Only, Report-To, and
// Reporting-Endpoints.
const EXPECTED_HEADER_NAMES = [
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'content-security-policy-report-only',
  'report-to',
  'reporting-endpoints',
];

function assertHasAllSecurityHeaders(response) {
  for (const name of EXPECTED_HEADER_NAMES) {
    assert.ok(
      response.headers.get(name),
      `Expected response to carry header ${name}, got headers: ${JSON.stringify([...response.headers])}`,
    );
  }
}

test('SECURITY_HEADERS exports all seven default headers with the expected values', () => {
  assert.equal(
    SECURITY_HEADERS['Strict-Transport-Security'],
    'max-age=63072000; includeSubDomains',
    'HSTS ships without preload per F-03 deferral',
  );
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff');
  assert.equal(SECURITY_HEADERS['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(SECURITY_HEADERS['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.equal(SECURITY_HEADERS['Cross-Origin-Resource-Policy'], 'same-site');
  const pp = SECURITY_HEADERS['Permissions-Policy'];
  assert.match(pp, /microphone=\(\)/, 'microphone is deny-by-default (F-09)');
  assert.match(pp, /camera=\(\)/);
  assert.match(pp, /geolocation=\(\)/);
  assert.match(pp, /fullscreen=\(self\)/);
  assert.match(pp, /interest-cohort=\(\)/);
  assert.match(pp, /browsing-topics=\(\)/);
});

test('applySecurityHeaders adds every default header on a JSON response', () => {
  const response = new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/api/bootstrap' });
  assertHasAllSecurityHeaders(wrapped);
  assert.equal(wrapped.headers.get('content-type'), 'application/json; charset=utf-8');
});

test('applySecurityHeaders handles null body (302 redirect) without throwing', () => {
  const response = new Response(null, {
    status: 302,
    headers: { location: 'https://example.test/' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/demo' });
  assertHasAllSecurityHeaders(wrapped);
  assert.equal(wrapped.status, 302);
  assert.equal(wrapped.headers.get('location'), 'https://example.test/');
});

test('applySecurityHeaders preserves explicit Cache-Control when already set', () => {
  const response = new Response('"x"', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, max-age=60',
    },
  });
  const wrapped = applySecurityHeaders(response, { path: '/api/something' });
  assert.equal(wrapped.headers.get('cache-control'), 'private, max-age=60');
});

test('applySecurityHeaders injects fallback Cache-Control: no-store when absent', () => {
  const response = new Response('plain', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/src/main.js' });
  assert.equal(wrapped.headers.get('cache-control'), 'no-store');
});

test('applySecurityHeaders preserves TTS binary Cache-Control and x-ks2-tts-* metadata', () => {
  const response = new Response('fake-audio-bytes', {
    status: 200,
    headers: {
      'content-type': 'audio/wav',
      'cache-control': 'private, max-age=86400',
      'x-ks2-tts-provider': 'gemini',
      'x-ks2-tts-voice': 'aoede',
      'x-ks2-tts-cache': 'hit',
    },
  });
  const wrapped = applySecurityHeaders(response, { path: '/api/tts' });
  assertHasAllSecurityHeaders(wrapped);
  assert.equal(
    wrapped.headers.get('cache-control'),
    'private, max-age=86400',
    'TTS responses keep their private cache semantics',
  );
  assert.equal(wrapped.headers.get('x-ks2-tts-provider'), 'gemini');
  assert.equal(wrapped.headers.get('x-ks2-tts-voice'), 'aoede');
  assert.equal(wrapped.headers.get('x-ks2-tts-cache'), 'hit');
});

test('applySecurityHeaders treats x-ks2-tts-* metadata as TTS signal even when content-type is generic', () => {
  // cacheOnlyResponse in tts.js returns status 204 with no content-type but
  // keeps the x-ks2-tts-cache marker; confirm we don't overwrite its
  // cache-control: no-store semantics with our fallback (they match, but
  // the path-specific rule must still recognise it as TTS).
  const response = new Response(null, {
    status: 204,
    headers: {
      'cache-control': 'no-store',
      'x-ks2-tts-cache': 'miss',
    },
  });
  const wrapped = applySecurityHeaders(response, { path: '/api/tts' });
  assertHasAllSecurityHeaders(wrapped);
  assert.equal(wrapped.headers.get('cache-control'), 'no-store');
});

test('applySecurityHeaders forces immutable cache on /src/bundles/*', () => {
  const response = new Response('console.log("bundle")', {
    status: 200,
    headers: {
      'content-type': 'application/javascript',
      'cache-control': 'no-store',
    },
  });
  const wrapped = applySecurityHeaders(response, { path: '/src/bundles/app.bundle.js' });
  assertHasAllSecurityHeaders(wrapped);
  assert.equal(
    wrapped.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
    'Bundle path explicitly overrides ASSETS-response no-store via set()',
  );
});

test('applySecurityHeaders forces immutable cache on /assets/bundles/*', () => {
  const response = new Response('bytes', {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/assets/bundles/hash.png' });
  assert.equal(
    wrapped.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  );
});

test('serialiseHeadersBlock emits a Netlify-style line block with all default headers', () => {
  const block = serialiseHeadersBlock();
  for (const name of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'X-Frame-Options',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
  ]) {
    assert.ok(
      block.includes(`${name}:`),
      `serialiseHeadersBlock output must include ${name}:`,
    );
  }
  assert.match(block, /max-age=63072000; includeSubDomains/);
  assert.ok(!block.includes('preload'), 'HSTS does not include preload');
});

test('Worker JSON response (/api/bootstrap) carries all seven security headers', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetch('https://repo.test/api/bootstrap');
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('Worker 302 redirect (/demo) carries all seven security headers', async () => {
  const server = createWorkerRepositoryServer({
    env: { AUTH_MODE: 'development-stub' },
  });
  const response = await server.fetchRaw('https://repo.test/demo', {
    method: 'GET',
    headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
  });
  assert.equal(response.status, 302);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('Worker 404 plaintext from publicSourceAssetResponse carries all seven security headers', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw('https://repo.test/src/main.js');
  assert.equal(response.status, 404);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('/api/auth/logout emits Clear-Site-Data with cache, cookies, storage', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const response = await server.fetchRaw('https://repo.test/api/auth/logout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
    },
  });
  const clearSiteData = response.headers.get('clear-site-data') || '';
  assert.ok(
    clearSiteData.includes('"cache"'),
    `Clear-Site-Data must include "cache": got ${clearSiteData}`,
  );
  assert.ok(clearSiteData.includes('"cookies"'));
  assert.ok(clearSiteData.includes('"storage"'));
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('Unauthenticated health check (/api/health) carries security headers', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw('https://repo.test/api/health');
  assert.equal(response.status, 200);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('Unauthenticated 401 path (raw Response at Worker entry) still receives security headers', async () => {
  // This exercises the plan's "new route returns raw new Response(body) and
  // still receives security headers because the wrapper is at the index.js
  // boundary" scenario: the errorResponse path produced by requireSession
  // throwing UnauthenticatedError is one such raw Response site.
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const response = await server.fetchRaw('https://repo.test/api/bootstrap');
  assert.equal(response.status, 401);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('404 fallthrough for unknown authenticated path still receives security headers', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetchRaw('https://repo.test/api/does-not-exist', {
    headers: {
      origin: 'https://repo.test',
      'x-ks2-dev-account-id': 'adult-a',
    },
  });
  // With dev-stub session present and same-origin, the request passes
  // requireSession and falls through to the 404 json() path.
  assert.equal(response.status, 404);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('Cross-site Sec-Fetch-Site on GET /api/bootstrap is rejected with 403', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  // Seed a session via the production email flow.
  const register = await server.fetchRaw('https://repo.test/api/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
    },
    body: JSON.stringify({ email: 'cross@example.test', password: 'password-9999' }),
  });
  const setCookie = register.headers.get('set-cookie') || '';
  const match = /ks2_session=([^;]+)/.exec(setCookie);
  assert.ok(match, `expected session cookie, got ${setCookie}`);
  const cookie = `ks2_session=${match[1]}`;

  // Same-origin baseline should succeed.
  const same = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: {
      cookie,
      origin: 'https://repo.test',
      'sec-fetch-site': 'same-origin',
    },
  });
  assert.equal(same.status, 200, 'same-origin bootstrap must remain 200');

  // Cross-site request must be rejected.
  const cross = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: {
      cookie,
      origin: 'https://attacker.test',
      'sec-fetch-site': 'cross-site',
    },
  });
  assert.equal(
    cross.status,
    403,
    'cross-site Sec-Fetch-Site on authenticated GET must be rejected after requireSameOrigin default-on',
  );
  assertHasAllSecurityHeaders(cross);
  server.close();
});

test('Same-site and none Sec-Fetch-Site on authenticated GET remain allowed', async () => {
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const register = await server.fetchRaw('https://repo.test/api/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
    },
    body: JSON.stringify({ email: 'samesite@example.test', password: 'password-1234' }),
  });
  const setCookie = register.headers.get('set-cookie') || '';
  const cookie = `ks2_session=${/ks2_session=([^;]+)/.exec(setCookie)[1]}`;

  const sameSite = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: {
      cookie,
      origin: 'https://repo.test',
      'sec-fetch-site': 'same-site',
    },
  });
  assert.equal(sameSite.status, 200);

  // Direct navigation: browsers may omit Origin and send sec-fetch-site=none.
  const none = await server.fetchRaw('https://repo.test/api/bootstrap', {
    headers: {
      cookie,
      'sec-fetch-site': 'none',
    },
  });
  assert.equal(none.status, 200);
  server.close();
});

test('_headers repo file contains expected security header block', async () => {
  const content = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');
  assert.match(content, /Strict-Transport-Security: max-age=63072000; includeSubDomains/);
  assert.ok(!/preload/.test(content), 'HSTS must not carry preload in this pass');
  assert.match(content, /X-Content-Type-Options: nosniff/);
  assert.match(content, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(content, /Permissions-Policy:.*microphone=\(\)/);
  assert.match(content, /X-Frame-Options: DENY/);
  assert.match(content, /Cross-Origin-Opener-Policy: same-origin-allow-popups/);
  assert.match(content, /Cross-Origin-Resource-Policy: same-site/);
  assert.match(content, /\/assets\/bundles\/\*/);
  assert.match(content, /\/\*/);
  assert.match(content, /public, max-age=31536000, immutable/);
});

test('assert:build-public logic rejects a drifted _headers that lacks the security block', async () => {
  // Execution-based drift verification (review testing-gap-3): we import the
  // pure `assertHeadersBlockIsFresh` contract and drive it with a correct
  // fixture (must not throw), then with three distinct drift mutations (each
  // must throw with a pointed message). This replaces the earlier substring
  // inspection of `scripts/assert-build-public.mjs`, which a future refactor
  // could silently pass by leaving dead-code tokens behind.
  const freshContent = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');
  // Repo-root `_headers` carries the `'sha256-BUILD_TIME_HASH'` placeholder;
  // `scripts/build-public.mjs` substitutes it when copying into
  // `dist/public/_headers`. Allow the placeholder here (U7 drift contract).
  assert.doesNotThrow(
    () => assertHeadersBlockIsFresh(freshContent, { allowPlaceholderHash: true }),
    'The checked-in repo-root _headers must pass the drift contract.',
  );

  // Drift 1: the security block is wiped entirely.
  const driftedMissingBlock = '/*\n  Cache-Control: no-store\n';
  assert.throws(
    () => assertHeadersBlockIsFresh(driftedMissingBlock),
    /missing required security-header line: Strict-Transport-Security/,
    'must reject a _headers without the HSTS line',
  );

  // Drift 2: HSTS silently gains `preload` (F-03 regression).
  const driftedPreload = freshContent.replace(
    'max-age=63072000; includeSubDomains',
    'max-age=63072000; includeSubDomains; preload',
  );
  assert.throws(
    () => assertHeadersBlockIsFresh(driftedPreload),
    /must not carry HSTS preload/,
    'must reject a _headers that reintroduces HSTS preload',
  );

  // Drift 3: immutable cache rule is removed (bundle cache hygiene lost).
  const driftedNoImmutable = freshContent.replace(/public, max-age=31536000, immutable/g, 'no-store');
  assert.throws(
    () => assertHeadersBlockIsFresh(driftedNoImmutable),
    /immutable cache rule for hashed bundles/,
    'must reject a _headers without the immutable cache rule',
  );

  // Type guard: non-string input is rejected cleanly.
  assert.throws(
    () => assertHeadersBlockIsFresh(null),
    /headersContent must be a string/,
    'must reject non-string input',
  );
});

test('applySecurityHeaders does NOT apply immutable cache to non-2xx bundle responses (security-residual-1)', () => {
  // A 404 served under `/src/bundles/<unknown>.js` must NOT carry the
  // immutable cache. Otherwise a bad deploy would poison client caches for
  // one year via the hashed-bundle path match.
  const notFound = new Response('not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
  const wrapped404 = applySecurityHeaders(notFound, { path: '/src/bundles/does-not-exist.js' });
  assertHasAllSecurityHeaders(wrapped404);
  assert.notEqual(
    wrapped404.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
    'Non-2xx bundle responses must not carry the immutable cache-control.',
  );
  // Fall-through path has no existing Cache-Control, so the fallback kicks in.
  assert.equal(
    wrapped404.headers.get('cache-control'),
    'no-store',
    'Non-2xx bundle 404 falls through to the no-store fallback.',
  );

  // 5xx bundle response similarly must not poison caches.
  const serverError = new Response('boom', {
    status: 500,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'private, max-age=30',
    },
  });
  const wrapped500 = applySecurityHeaders(serverError, { path: '/src/bundles/app.bundle.js' });
  assertHasAllSecurityHeaders(wrapped500);
  assert.equal(
    wrapped500.headers.get('cache-control'),
    'private, max-age=30',
    'Non-2xx bundle response with existing Cache-Control preserves it rather than swapping in immutable.',
  );

  // 304 Not Modified is 3xx (outside the 200-299 success window), so it
  // falls through to the no-store fallback rather than the immutable cache.
  // In practice ASSETS.fetch rarely returns 304 for hashed bundles because
  // their content-hash URL changes when the body changes; the conservative
  // no-store behaviour is preferred over accidentally pinning a mid-deploy
  // 304 for a year.
  const notModified = new Response(null, {
    status: 304,
    headers: {},
  });
  const wrapped304 = applySecurityHeaders(notModified, { path: '/src/bundles/app.bundle.js' });
  assert.notEqual(
    wrapped304.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
    '304 responses are outside 200-299 and must not carry the immutable cache.',
  );
});

test('applySecurityHeadersSafely returns the raw response when the wrapper throws (reliability-1)', () => {
  // Stub `applySecurityHeaders` with a throwing function. The safe wrapper
  // must swallow the error and surface the underlying Response so the Worker
  // never emits a 1101 purely because header composition failed.
  const originalConsoleError = console.error;
  const calls = [];
  console.error = (...args) => {
    calls.push(args);
  };
  try {
    const raw = new Response('payload', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    const result = applySecurityHeadersSafely(
      raw,
      { path: '/api/bootstrap' },
      () => {
        throw new Error('simulated-header-failure');
      },
    );
    // The safe wrapper must return the exact raw Response instance.
    assert.equal(result, raw, 'safe wrapper returns the underlying response on throw');
    assert.equal(result.status, 200);
    // The failure must be logged for observability.
    assert.ok(
      calls.some((call) => String(call[0]).includes('[ks2-security-headers] wrapper failed')),
      `expected a console.error log, got calls: ${JSON.stringify(calls)}`,
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('applySecurityHeadersSafely delegates to the real wrapper when it does not throw', () => {
  const response = new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const wrapped = applySecurityHeadersSafely(response, { path: '/api/bootstrap' });
  assertHasAllSecurityHeaders(wrapped);
});

test('OAuth callback 302 error redirect carries all seven security headers (testing-gap-4)', async () => {
  // We drive the callback with intentionally-malformed query (invalid state,
  // missing code) so `completeSocialLogin` throws a BadRequestError and the
  // app produces a 302 `callbackErrorRedirect`. This exercises the OAuth
  // callback lane of the Worker without calling real Google OAuth.
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    },
  });
  const response = await server.fetchRaw(
    'https://repo.test/api/auth/google/callback?state=invalid&code=missing',
    {
      method: 'GET',
      headers: {
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
      },
    },
  );
  // The callback error redirect is a 302 regardless of the underlying
  // BadRequestError — what we care about is that security headers attach.
  assert.equal(response.status, 302, `expected 302 redirect, got ${response.status}`);
  assertHasAllSecurityHeaders(response);
  server.close();
});

test('/api/auth/logout response carries all seven security headers plus Clear-Site-Data (testing-gap-4)', async () => {
  // A dedicated assertion that the logout surface carries the full 7-header
  // set alongside the Clear-Site-Data directive. The existing logout test
  // only asserted Clear-Site-Data + all headers together; this scenario
  // makes the joint contract explicit for future grep-based audits.
  const server = createWorkerRepositoryServer({
    env: {
      AUTH_MODE: 'production',
      ENVIRONMENT: 'production',
      APP_HOSTNAME: 'repo.test',
    },
  });
  const response = await server.fetchRaw('https://repo.test/api/auth/logout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://repo.test',
    },
  });
  assertHasAllSecurityHeaders(response);
  const clearSiteData = response.headers.get('clear-site-data') || '';
  assert.ok(
    clearSiteData.includes('"cache"') && clearSiteData.includes('"cookies"') && clearSiteData.includes('"storage"'),
    `logout must carry Clear-Site-Data with cache, cookies, storage — got ${clearSiteData}`,
  );
  server.close();
});

// ---------------------------------------------------------------------------
// U10 (P4): HSTS preload operator sign-off gate.
// ---------------------------------------------------------------------------

test('HSTS_PRELOAD_ENABLED is false — preload must not ship without operator sign-off', () => {
  assert.equal(
    HSTS_PRELOAD_ENABLED,
    false,
    'HSTS_PRELOAD_ENABLED must be false until the operator completes the sign-off checklist in docs/hardening/hsts-preload-audit.md',
  );
});

test('HSTS_VALUE omits preload when HSTS_PRELOAD_ENABLED is false', () => {
  // This is the live export; confirm it matches the expected no-preload value.
  assert.equal(HSTS_VALUE, 'max-age=63072000; includeSubDomains');
  assert.ok(
    !HSTS_VALUE.includes('preload'),
    'HSTS_VALUE must not contain "preload" while the operator gate is closed',
  );
});

test('buildHstsValue returns correct strings for both branches', () => {
  assert.equal(
    buildHstsValue(true),
    'max-age=63072000; includeSubDomains; preload',
    'buildHstsValue(true) must append "; preload"',
  );
  assert.equal(
    buildHstsValue(false),
    'max-age=63072000; includeSubDomains',
    'buildHstsValue(false) must omit preload',
  );
  // Verify the live HSTS_VALUE export is wired through buildHstsValue.
  assert.equal(
    HSTS_VALUE,
    buildHstsValue(HSTS_PRELOAD_ENABLED),
    'HSTS_VALUE must equal buildHstsValue(HSTS_PRELOAD_ENABLED)',
  );
});

test('Worker HSTS header and _headers file carry identical HSTS value (no drift)', async () => {
  // The Worker SECURITY_HEADERS object is the runtime source of truth.
  const workerHsts = SECURITY_HEADERS['Strict-Transport-Security'];
  // The _headers file is the static-asset source of truth.
  const headersContent = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');
  // Extract every Strict-Transport-Security value from the _headers file.
  const hstsLines = headersContent.match(
    /^\s*Strict-Transport-Security:\s*(.+)$/gm,
  );
  assert.ok(
    hstsLines && hstsLines.length > 0,
    '_headers file must contain at least one Strict-Transport-Security line',
  );
  for (const line of hstsLines) {
    const value = line.replace(/^\s*Strict-Transport-Security:\s*/, '').trim();
    assert.equal(
      value,
      workerHsts,
      `_headers HSTS value "${value}" must match Worker HSTS value "${workerHsts}" — no drift permitted`,
    );
  }
});

// ---------------------------------------------------------------------------
// U7: Content-Security-Policy-Report-Only coverage.
// ---------------------------------------------------------------------------

test('CSP_INLINE_SCRIPT_HASH is a well-formed sha256 CSP token or the pre-build placeholder', () => {
  // After `npm run build` the value is a real CSP-compliant sha256-<base64>
  // token. Before the first build (fresh clone running `npm test` without
  // building), the committed module ships with a sentinel placeholder so
  // the import resolves and tests can run. See correctness-blocker-1 fix
  // in `worker/src/generated-csp-hash.js`.
  const placeholder = 'sha256-PLACEHOLDER_PRE_BUILD_HASH=';
  const wellFormed = /^sha256-[A-Za-z0-9+/]+=*$/.test(CSP_INLINE_SCRIPT_HASH);
  assert.ok(
    wellFormed || CSP_INLINE_SCRIPT_HASH === placeholder,
    `Expected sha256-<base64> token or the pre-build placeholder, got: ${CSP_INLINE_SCRIPT_HASH}`,
  );
});

test('CSP_POLICY_VALUE includes all baseline directives', () => {
  const policy = CSP_POLICY_VALUE;
  assert.match(policy, /default-src 'none'/, 'default-src must deny-by-default');
  assert.match(policy, /'strict-dynamic'/, 'script-src must carry strict-dynamic');
  assert.ok(policy.includes(`'${CSP_INLINE_SCRIPT_HASH}'`), 'CSP must list the inline theme-script hash');
  assert.match(policy, /manifest-src 'self'/, 'manifest-src must be explicit (F-06)');
  assert.match(policy, /worker-src 'none'/, 'worker-src must deny Service Workers (F-06)');
  assert.match(policy, /connect-src[^;]*https:\/\/fonts\.googleapis\.com/, 'connect-src must list Google Fonts CSS origin');
  assert.match(policy, /connect-src[^;]*https:\/\/fonts\.gstatic\.com/, 'connect-src must list Google Fonts static origin');
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /object-src 'none'/);
  // `upgrade-insecure-requests` is intentionally omitted in Report-Only
  // (ignored by browsers per CSP3); the enforcement-flip PR re-adds it.
  assert.ok(!policy.includes('upgrade-insecure-requests'));
  assert.match(policy, /report-uri \/api\/security\/csp-report/);
  assert.match(policy, /report-to csp-endpoint/);
});

test('REPORT_TO_VALUE is valid JSON with the csp-endpoint group', () => {
  const parsed = JSON.parse(REPORT_TO_VALUE);
  assert.equal(parsed.group, 'csp-endpoint');
  assert.equal(Array.isArray(parsed.endpoints), true);
  assert.equal(parsed.endpoints[0].url, '/api/security/csp-report');
});

test('REPORTING_ENDPOINTS_VALUE targets the csp-report route', () => {
  assert.match(REPORTING_ENDPOINTS_VALUE, /csp-endpoint="\/api\/security\/csp-report"/);
});

test('SECURITY_HEADERS exposes the three U7 reporting headers', () => {
  assert.ok(SECURITY_HEADERS['Content-Security-Policy-Report-Only']);
  assert.ok(SECURITY_HEADERS['Report-To']);
  assert.ok(SECURITY_HEADERS['Reporting-Endpoints']);
  // The CSP header must contain the same hash the build substitutes
  // into `_headers` — a drift between source and header would otherwise
  // ship silently.
  assert.ok(
    SECURITY_HEADERS['Content-Security-Policy-Report-Only'].includes(CSP_INLINE_SCRIPT_HASH),
    'Worker-emitted CSP must include the inline-script hash exported by the generated module.',
  );
});

test('applySecurityHeaders stamps CSP-Report-Only on JSON responses', () => {
  const response = new Response('{"ok":true}', {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/api/bootstrap' });
  assert.ok(wrapped.headers.get('content-security-policy-report-only')?.includes(CSP_INLINE_SCRIPT_HASH));
  assert.ok(wrapped.headers.get('report-to')?.includes('csp-endpoint'));
  assert.ok(wrapped.headers.get('reporting-endpoints')?.includes('csp-endpoint'));
});

test('applySecurityHeaders never emits the enforcing Content-Security-Policy header (Report-Only only in this unit)', () => {
  const wrapped = applySecurityHeaders(new Response('x', { status: 200 }), { path: '/' });
  assert.equal(
    wrapped.headers.get('content-security-policy'),
    null,
    'U7 ships Report-Only; enforcement flip is a follow-up PR.',
  );
});

test('Worker JSON response carries the CSP Report-Only header with a substituted hash', async () => {
  const server = createWorkerRepositoryServer();
  const response = await server.fetch('https://repo.test/api/bootstrap');
  const policy = response.headers.get('content-security-policy-report-only') || '';
  assert.ok(policy.includes(CSP_INLINE_SCRIPT_HASH), `policy must carry hash — got ${policy.slice(0, 120)}...`);
  assert.match(policy, /'strict-dynamic'/);
  assert.match(policy, /report-uri \/api\/security\/csp-report/);
  server.close();
});

test('Worker 302 redirect carries the CSP Report-Only header', async () => {
  const server = createWorkerRepositoryServer({
    env: { AUTH_MODE: 'development-stub' },
  });
  const response = await server.fetchRaw('https://repo.test/demo', {
    method: 'GET',
    headers: { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
  });
  assert.equal(response.status, 302);
  assert.ok(response.headers.get('content-security-policy-report-only')?.includes(CSP_INLINE_SCRIPT_HASH));
  server.close();
});

test('_headers repo file contains the CSP Report-Only line (pre-substitution via placeholder)', async () => {
  const content = await readFile(path.join(REPO_ROOT, '_headers'), 'utf8');
  assert.match(content, /Content-Security-Policy-Report-Only:/);
  // Repo-root copy has the placeholder; build-public.mjs substitutes.
  assert.ok(
    content.includes("'sha256-BUILD_TIME_HASH'") || /'sha256-[A-Za-z0-9+/]+=*'/.test(content),
    '_headers must carry either the placeholder or a substituted sha256 token.',
  );
  assert.match(content, /report-uri \/api\/security\/csp-report/);
  assert.match(content, /Report-To:[^\n]*csp-endpoint/);
  assert.match(content, /Reporting-Endpoints:[^\n]*csp-endpoint/);
});

// ---------------------------------------------------------------------------
// P4-U4: CSP enforcement decision gate — mode constant and header assertions.
// ---------------------------------------------------------------------------

test('CSP_ENFORCEMENT_MODE export equals "report-only" (P4-U4 decision gate)', () => {
  assert.equal(
    CSP_ENFORCEMENT_MODE,
    'report-only',
    'CSP_ENFORCEMENT_MODE must be "report-only" until the observation window '
      + 'closes and the enforcement flip PR lands. See '
      + 'docs/hardening/csp-enforcement-decision.md.',
  );
});

test('SECURITY_HEADERS contains Content-Security-Policy-Report-Only, not Content-Security-Policy (P4-U4)', () => {
  assert.ok(
    SECURITY_HEADERS['Content-Security-Policy-Report-Only'],
    'SECURITY_HEADERS must carry the Report-Only key while CSP_ENFORCEMENT_MODE is "report-only".',
  );
  assert.equal(
    SECURITY_HEADERS['Content-Security-Policy'],
    undefined,
    'SECURITY_HEADERS must NOT carry the enforced Content-Security-Policy key '
      + 'while in report-only mode.',
  );
});

test('upgrade-insecure-requests is NOT present in CSP directives while in report-only mode (P4-U4)', () => {
  // Per CSP3, upgrade-insecure-requests is ignored in Report-Only delivery
  // and Chrome emits a console warning. It should only be restored in the
  // same PR that flips the header to enforced.
  assert.ok(
    !CSP_POLICY_VALUE.includes('upgrade-insecure-requests'),
    'upgrade-insecure-requests must not appear in CSP while delivery is '
      + 'Report-Only. Re-add it in the enforcement flip PR.',
  );
});

test('applySecurityHeaders response contains Content-Security-Policy-Report-Only header (P4-U4)', () => {
  const response = new Response('test', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
  const wrapped = applySecurityHeaders(response, { path: '/test' });
  assert.ok(
    wrapped.headers.get('content-security-policy-report-only'),
    'applySecurityHeaders must stamp Content-Security-Policy-Report-Only '
      + 'on every response while in report-only mode.',
  );
  assert.equal(
    wrapped.headers.get('content-security-policy'),
    null,
    'applySecurityHeaders must NOT stamp the enforced Content-Security-Policy '
      + 'header while CSP_ENFORCEMENT_MODE is "report-only".',
  );
});
