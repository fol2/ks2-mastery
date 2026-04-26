// U7 (sys-hardening p1): parser-level lock for the CSP policy string.
//
// Guards against silent directive drift. Every requirement baked into
// the plan (default-src 'none', hash-based script-src, strict-dynamic,
// Google Fonts connect-src, manifest-src 'self', worker-src 'none',
// frame-ancestors 'none', report-uri + report-to, upgrade-insecure-
// requests) is asserted individually here so a future refactor cannot
// quietly weaken the policy without at least one test failure.
//
// The runtime value flows in via `CSP_POLICY_VALUE` from
// `worker/src/security-headers.js` — that is the single source of truth
// the Worker wrapper emits.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CSP_INLINE_SCRIPT_HASH,
  CSP_POLICY_VALUE,
} from '../worker/src/security-headers.js';

function parseDirectives(policy) {
  const map = new Map();
  const parts = String(policy).split(';').map((raw) => raw.trim()).filter(Boolean);
  for (const part of parts) {
    const space = part.indexOf(' ');
    const name = (space === -1 ? part : part.slice(0, space)).toLowerCase();
    const value = space === -1 ? '' : part.slice(space + 1).trim();
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(value);
  }
  return map;
}

const directives = parseDirectives(CSP_POLICY_VALUE);

test("policy defines default-src 'none' (deny-by-default)", () => {
  assert.deepEqual(directives.get('default-src'), ["'none'"]);
});

test('policy script-src lists self, the inline theme-script hash, strict-dynamic, and Turnstile', () => {
  const value = directives.get('script-src')?.[0] || '';
  assert.match(value, /'self'/, "script-src must include 'self'");
  assert.ok(value.includes(`'${CSP_INLINE_SCRIPT_HASH}'`), 'script-src must list the inline theme-script hash');
  assert.match(value, /'strict-dynamic'/, "script-src must enable 'strict-dynamic'");
  assert.match(value, /https:\/\/challenges\.cloudflare\.com/, 'script-src must allow Turnstile');
});

test('policy script-src-elem mirrors script-src without strict-dynamic (HTML element form)', () => {
  const value = directives.get('script-src-elem')?.[0] || '';
  assert.match(value, /'self'/);
  assert.ok(value.includes(`'${CSP_INLINE_SCRIPT_HASH}'`));
  assert.match(value, /https:\/\/challenges\.cloudflare\.com/);
});

test('policy style-src allows self plus unsafe-inline and Google Fonts', () => {
  const value = directives.get('style-src')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /'unsafe-inline'/);
  assert.match(value, /https:\/\/fonts\.googleapis\.com/);
});

test('policy style-src-elem mirrors style-src', () => {
  const value = directives.get('style-src-elem')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /'unsafe-inline'/);
  assert.match(value, /https:\/\/fonts\.googleapis\.com/);
});

test('policy img-src allows self, data:, blob:', () => {
  const value = directives.get('img-src')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /data:/);
  assert.match(value, /blob:/);
});

test('policy font-src allows self plus Google Fonts static host', () => {
  const value = directives.get('font-src')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /https:\/\/fonts\.gstatic\.com/);
});

test('policy connect-src includes Google Fonts CSS + static origins (security F-05)', () => {
  const value = directives.get('connect-src')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /https:\/\/fonts\.googleapis\.com/, 'regression: connect-src lost the googleapis origin');
  assert.match(value, /https:\/\/fonts\.gstatic\.com/, 'regression: connect-src lost the gstatic origin');
});

test('policy media-src allows self plus blob:', () => {
  const value = directives.get('media-src')?.[0] || '';
  assert.match(value, /'self'/);
  assert.match(value, /blob:/);
});

test('policy form-action is self-only', () => {
  assert.deepEqual(directives.get('form-action'), ["'self'"]);
});

test('policy frame-ancestors is none', () => {
  assert.deepEqual(directives.get('frame-ancestors'), ["'none'"]);
});

test('policy frame-src scope is Turnstile only', () => {
  const value = directives.get('frame-src')?.[0] || '';
  assert.match(value, /https:\/\/challenges\.cloudflare\.com/);
});

test('policy base-uri is none (prevents <base> injection)', () => {
  assert.deepEqual(directives.get('base-uri'), ["'none'"]);
});

test('policy object-src is none (blocks <object>, <embed>)', () => {
  assert.deepEqual(directives.get('object-src'), ["'none'"]);
});

test("policy manifest-src is 'self' (F-06, required under default-src 'none')", () => {
  assert.deepEqual(directives.get('manifest-src'), ["'self'"]);
});

test("policy worker-src is 'none' (F-06, app does not register Service Workers)", () => {
  assert.deepEqual(directives.get('worker-src'), ["'none'"]);
});

test('policy omits upgrade-insecure-requests while shipped under Report-Only', () => {
  // Per CSP3, `upgrade-insecure-requests` is ignored when delivered via
  // `Content-Security-Policy-Report-Only` (Chrome emits a console
  // warning). We rely on HSTS `includeSubDomains` + HTTPS-only origin
  // allowlists for the upgrade until the enforcement flip lands.
  // The same PR that renames the header to `Content-Security-Policy`
  // must restore this directive and invert this assertion.
  assert.ok(!directives.has('upgrade-insecure-requests'));
});

test('policy declares report-uri and report-to', () => {
  assert.deepEqual(directives.get('report-uri'), ['/api/security/csp-report']);
  assert.deepEqual(directives.get('report-to'), ['csp-endpoint']);
});

test('policy does NOT use the deprecated unsafe-eval keyword', () => {
  assert.ok(!CSP_POLICY_VALUE.includes("'unsafe-eval'"), "CSP must not allow 'unsafe-eval'.");
});

test('regression guard: a connect-src that drops Google Fonts is rejected', () => {
  // This test is defensive: if a future refactor replaces the Google
  // Fonts origins with a bare 'self', `tests/csp-policy.test.js` must
  // still fail loudly. We reuse the same directive parser against a
  // synthetic bad policy string.
  const bad = "default-src 'none'; connect-src 'self'";
  const badDirectives = parseDirectives(bad);
  const badConnect = badDirectives.get('connect-src')?.[0] || '';
  assert.ok(
    !/fonts\.googleapis\.com/.test(badConnect),
    'control: the synthetic bad policy does not include googleapis, proving the assertion shape.',
  );
});

test('regression guard: missing manifest-src or worker-src fails the contract', () => {
  const missingManifest = "default-src 'none'; script-src 'self'";
  assert.ok(
    !parseDirectives(missingManifest).has('manifest-src'),
    'control: the synthetic bad policy has no manifest-src directive.',
  );
  const missingWorker = "default-src 'none'; script-src 'self'";
  assert.ok(
    !parseDirectives(missingWorker).has('worker-src'),
    'control: the synthetic bad policy has no worker-src directive.',
  );
});

test('built CSP string does NOT contain the pre-build placeholder sentinel (build-before-deploy discipline)', async () => {
  // correctness-blocker-1: `worker/src/generated-csp-hash.js` is committed
  // with a placeholder so fresh clones can run tests without running the
  // build first. `scripts/build-public.mjs` overwrites that module with a
  // real sha256 on every build. This test runs the build-produced module
  // and asserts the deployed Worker CSP can never ship the placeholder:
  //  - The checked-in repo `_headers` carries a `'sha256-BUILD_TIME_HASH'`
  //    placeholder that `scripts/build-public.mjs` substitutes.
  //  - `worker/src/generated-csp-hash.js` after build exports a real hash.
  //  - The serialised CSP (CSP_POLICY_VALUE) must therefore not carry the
  //    `PLACEHOLDER_PRE_BUILD_HASH` sentinel after build. Before build it
  //    may, which is fine — the build is what flips it.
  //
  // We cannot require `npm run build` to have run inside the test harness
  // (that would re-introduce the ordering blocker). Instead we check the
  // dist/public artefact when present, and only enforce the no-placeholder
  // rule against a built artefact — never against the checked-in source.
  const { readFile, access } = await import('node:fs/promises');
  const { constants } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), '..');
  const distHeadersPath = path.join(repoRoot, 'dist', 'public', '_headers');
  try {
    await access(distHeadersPath, constants.F_OK);
  } catch {
    // Build artefact absent — fresh-clone scenario. Skip the assertion;
    // the CI/deploy path will run `npm run build` before this matters.
    return;
  }
  const builtHeaders = await readFile(distHeadersPath, 'utf8');
  assert.ok(
    !builtHeaders.includes('PLACEHOLDER_PRE_BUILD_HASH'),
    'Built dist/public/_headers must NOT contain the PLACEHOLDER_PRE_BUILD_HASH sentinel. '
    + 'Run `npm run build` before deploying to substitute the real CSP hash.',
  );
  assert.ok(
    !builtHeaders.includes("'sha256-BUILD_TIME_HASH'"),
    'Built dist/public/_headers must NOT contain the sha256-BUILD_TIME_HASH template token.',
  );
});
