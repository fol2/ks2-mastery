import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SECURITY_HEADERS,
  applySecurityHeaders,
  serialiseHeadersBlock,
} from '../worker/src/security-headers.js';
import { createWorkerRepositoryServer } from './helpers/worker-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// U6: the seven default security headers that every Worker response + every
// `_headers` group must carry. Mirrors plan line 583. CSP lands in U7.
const EXPECTED_HEADER_NAMES = [
  'strict-transport-security',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-frame-options',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
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
  // We avoid calling the real `scripts/assert-build-public.mjs` here because
  // it reads `dist/public/` via `process.cwd()` and the broader test runner
  // concurrently rebuilds that directory. Instead we re-apply the drift
  // assertion logic against an intentionally-drifted in-memory string so the
  // contract (security-header block presence, no preload, immutable cache
  // rule) is locked in without a shared-file race.
  const driftedContent = '/*\n  Cache-Control: no-store\n';
  const requiredLines = [
    'Strict-Transport-Security: max-age=63072000; includeSubDomains',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'X-Frame-Options: DENY',
    'Cross-Origin-Opener-Policy: same-origin-allow-popups',
    'Cross-Origin-Resource-Policy: same-site',
  ];
  const missing = requiredLines.filter((line) => !driftedContent.includes(line));
  assert.ok(
    missing.length >= 6,
    `drift simulation must be missing every security line, got: ${missing.join(', ')}`,
  );
  // The actual script reads dist/public/_headers at build time. Verify that
  // the script file itself contains the assertion code (grep-style contract
  // check that prevents silent removal of the drift guard).
  const assertBuildPublic = await readFile(
    path.join(REPO_ROOT, 'scripts', 'assert-build-public.mjs'),
    'utf8',
  );
  assert.match(
    assertBuildPublic,
    /Strict-Transport-Security: max-age=63072000; includeSubDomains/,
    'assert-build-public.mjs must check for HSTS header presence',
  );
  assert.match(
    assertBuildPublic,
    /X-Frame-Options: DENY/,
    'assert-build-public.mjs must check for XFO header presence',
  );
  assert.match(
    assertBuildPublic,
    /Permissions-Policy.*microphone=\\\(\\\)/,
    'assert-build-public.mjs must guard microphone deny-by-default',
  );
  assert.match(
    assertBuildPublic,
    /preload/,
    'assert-build-public.mjs must fail the build when HSTS carries preload',
  );
  assert.match(
    assertBuildPublic,
    /public, max-age=31536000, immutable/,
    'assert-build-public.mjs must enforce an immutable cache rule',
  );
});
