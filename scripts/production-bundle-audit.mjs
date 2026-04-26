import { runClientBundleAudit } from './audit-client-bundle.mjs';
import { createDemoSession, loadBootstrap } from './lib/production-smoke.mjs';
import { FORBIDDEN_KEYS_EVERYWHERE } from '../tests/helpers/forbidden-keys.mjs';

const DEFAULT_ORIGIN = 'https://ks2.eugnel.uk';

// U13 redaction matrix forbidden-key check: these keys must never appear in any
// authenticated response surface reached via the demo session. The set is
// imported from tests/helpers/forbidden-keys.mjs so the matrix oracle, the
// production audit, and the subject-level smokes cannot drift.
const MATRIX_FORBIDDEN_KEYS = FORBIDDEN_KEYS_EVERYWHERE;

function collectAllKeys(value, bucket = new Set()) {
  if (value == null) return bucket;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAllKeys(entry, bucket));
    return bucket;
  }
  if (typeof value !== 'object') return bucket;
  for (const [key, child] of Object.entries(value)) {
    bucket.add(key);
    collectAllKeys(child, bucket);
  }
  return bucket;
}

function assertMatrixForbiddenKeysAbsent(label, payload, failures) {
  const allKeys = collectAllKeys(payload);
  for (const key of MATRIX_FORBIDDEN_KEYS) {
    if (allKeys.has(key)) {
      failures.push(`${label} exposed redaction-matrix forbidden key: ${key}`);
    }
  }
}
const DIRECT_DENIAL_PATHS = [
  '/src/main.js',
  '/src/subjects/spelling/data/content-data.js',
  '/src/subjects/spelling/data/word-data.js',
  '/src/subjects/spelling/engine/legacy-engine.js',
  '/src/subjects/spelling/service.js',
  '/src/subjects/spelling/content/model.js',
  '/shared/punctuation/content.js',
  '/shared/punctuation/context-packs.js',
  '/shared/punctuation/generators.js',
  '/shared/punctuation/marking.js',
  '/shared/punctuation/service.js',
  '/worker/src/subjects/punctuation/commands.js',
  '/worker/src/subjects/punctuation/read-models.js',
  '/src/subjects/punctuation/read-model.js',
  '/src/subjects/punctuation/service.js',
  '/src/subjects/punctuation/repository.js',
  '/src/platform/core/local-review-profile.js',
  '/worker/src/app.js',
  '/tests/build-public.test.js',
];

const FORBIDDEN_DEPLOYED_TEXT = [
  'SEEDED_SPELLING_CONTENT_BUNDLE',
  'SEEDED_SPELLING_PUBLISHED_SNAPSHOT',
  'Legacy vendor seed for Pass 11 content model',
  'createLegacySpellingEngine',
  'KS2_WORDS_ENRICHED',
  'spelling-prompt-v1',
  'PUNCTUATION_CONTENT_MANIFEST',
  'PUNCTUATION_CONTEXT_PACK_LIMITS',
  'createPunctuationContentIndexes',
  'createPunctuationGeneratedItems',
  'createPunctuationRuntimeManifest',
  'normalisePunctuationContextPack',
  'createPunctuationService',
  'PunctuationServiceError',
  'punctuation-r1-endmarks-apostrophe-speech',
  '/api/child-subject-state',
  '/api/practice-sessions',
  '/api/child-game-state',
  '/api/event-log',
  '/api/debug/reset',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'PUNCTUATION_AI_CONTEXT_PACK_JSON',
  'PUNCTUATION_AI_CONTEXT_PACK_KEY',
  'generativelanguage.googleapis.com',
  'api.openai.com/v1',
  '?local=1',
  'data-home-mount',
  'data-subject-mount',
  'home.bundle.js',
  // U9 (sys-hardening p1): forbid the fault-injection middleware
  // symbol in any production-served bundle. The same token is listed
  // in `scripts/audit-client-bundle.mjs` FORBIDDEN_TEXT — dual-gated
  // to catch both local-build regressions and deployed-bundle drift.
  '__ks2_injectFault_TESTS_ONLY__',
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

function argInteger(name, fallback) {
  const value = Number(argValue(name, fallback));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scriptSources(html) {
  const sources = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match = pattern.exec(html);
  while (match) {
    sources.push(match[1]);
    match = pattern.exec(html);
  }
  return sources;
}

// SH2-U10 (S-01 mirror): extract the set of same-origin chunk paths that a
// shipped ES-module chunk imports. Esbuild splitting emits
// `import("./chunk-XXXX.js")` for lazy-loaded entries and shared chunks,
// plus static `import ... from "..."` / side-effect `import "..."`
// forms for top-level imports. Three narrow patterns (one per form)
// keep the scanner robust — a quote mismatch in one form cannot blind
// the auditor to another. Specifiers must start with `./`, `../`, or
// `/` and end in `.js`; anything else (bare specifiers, data/blob URLs,
// cross-origin URLs) is dropped so the walker never follows off-origin
// requests. The caller resolves returned specifiers relative to the
// referring chunk URL and dedupes against a visited set so cycles
// terminate.
//
// SH2-U10 reviewer-follow-up (BLOCKER-1): the static + side-effect
// patterns MUST allow zero whitespace. Esbuild's minified output emits
// `import{X as Y}from"./chunk-X.js"` with no gap between `import` and
// the clause — the earlier `\s+` requirement silently missed every
// minified static import, leaving the shared `chunk-*.js` chunks
// un-scanned in production. The new static pattern accepts either a
// braced named-import clause (`{X as Y}` / `{a,b}` / mixed
// `a,{X}`) or a non-braced specifier (default / namespace) with
// OPTIONAL whitespace on both sides of the clause and around `from`.
// The side-effect pattern accepts optional whitespace so `import"./x"`
// (minified) matches alongside `import "./x"`. Neither the named-clause
// regex nor the default-import regex matches unquoted JavaScript (the
// capture group is anchored to `"..."` / `'...'`), so benign code like
// `const import_from = "./x.js"` cannot false-positive. Verified
// against the real post-split `src/bundles/app.bundle.js`: old regex
// yielded 2 chunks (dynamic only); new regex yields 5 chunks at the
// entry and the BFS walker discovers all 6 transitively.
const IMPORT_PATTERN_DYNAMIC = /import\s*\(\s*["']([^"')]+?)["']\s*\)/g;
const IMPORT_PATTERN_STATIC = /import\s*(?:\{[^{}]*\}|[^'"()]*?)\s*from\s*["']([^"')]+?)["']/g;
const IMPORT_PATTERN_SIDE_EFFECT = /import\s*["']([^"')]+?)["']/g;

function extractSameOriginJsImports(code) {
  const results = new Set();
  for (const pattern of [
    IMPORT_PATTERN_DYNAMIC,
    IMPORT_PATTERN_STATIC,
    IMPORT_PATTERN_SIDE_EFFECT,
  ]) {
    // `g`-flagged regexes keep `lastIndex` state across calls; reset so
    // a second call (different chunk text) walks from the top of the
    // new input rather than mid-stream of the previous one.
    pattern.lastIndex = 0;
    let match = pattern.exec(code);
    while (match) {
      const specifier = match[1];
      if (
        typeof specifier === 'string'
        && /\.js$/.test(specifier)
        && /^(?:\.\.?\/|\/)/.test(specifier)
      ) {
        results.add(specifier);
      }
      match = pattern.exec(code);
    }
  }
  return Array.from(results);
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: 'text/html,application/javascript,*/*' } });
  const text = await response.text().catch(() => '');
  return {
    url,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    text,
  };
}

function assertNoForbiddenText(label, text, failures) {
  for (const token of FORBIDDEN_DEPLOYED_TEXT) {
    if (text.includes(token)) {
      failures.push(`${label} includes forbidden deployed token: ${token}`);
    }
  }
}

async function auditProduction(origin) {
  const failures = [];
  const base = new URL(origin);
  const index = await fetchText(base.href);
  if (index.status < 200 || index.status >= 300) {
    failures.push(`Production HTML fetch failed: ${index.status} ${base.href}`);
  }
  assertNoForbiddenText('Production HTML', index.text, failures);

  const scripts = scriptSources(index.text)
    .filter((src) => !/^https?:\/\//i.test(src) || new URL(src, base).origin === base.origin);
  if (!scripts.length) failures.push('Production HTML did not reference any same-origin script bundle.');

  // SH2-U10 (S-01 mirror): walk every `.js` chunk served under `/src/bundles/`
  // rather than only the chunk(s) referenced from the HTML entry. Esbuild
  // splitting emits `app.bundle.js` (the HTML-referenced entry) plus split
  // chunks (shared chunk-XXXX.js and lazy-entry admin-hub / parent-hub
  // chunks) that the HTML never names directly — they are only pulled in by
  // `import()` from other chunks. The walker starts from the HTML-referenced
  // scripts and follows each discovered `import("./...js")` reference to
  // unknown-at-fetch-time chunk URLs, deduping against a visited set so
  // cycles terminate. Every shipped chunk is then scanned for forbidden
  // tokens, not just the entry. The visited set keys on pathname so query-
  // string variations do not defeat dedup.
  const visitedChunks = new Set();
  const bundleQueue = [...scripts];
  let scannedBundleCount = 0;
  while (bundleQueue.length) {
    const src = bundleQueue.shift();
    const bundleUrl = new URL(src, base);
    if (bundleUrl.origin !== base.origin) continue;
    const key = bundleUrl.pathname;
    if (visitedChunks.has(key)) continue;
    visitedChunks.add(key);

    const bundle = await fetchText(bundleUrl.href);
    if (bundle.status < 200 || bundle.status >= 300) {
      failures.push(`Production bundle fetch failed: ${bundle.status} ${bundleUrl.href}`);
      continue;
    }
    assertNoForbiddenText(`Production bundle ${bundleUrl.pathname}`, bundle.text, failures);
    scannedBundleCount += 1;

    // Only follow dynamic imports out of chunks already served under
    // `/src/bundles/` — the project's production chunk prefix. External
    // script entries (e.g. third-party asset paths) are scanned but not
    // traversed, because we cannot reason about their module graph.
    if (bundleUrl.pathname.startsWith('/src/bundles/')) {
      for (const specifier of extractSameOriginJsImports(bundle.text)) {
        const resolved = new URL(specifier, bundleUrl);
        if (resolved.origin !== base.origin) continue;
        if (!resolved.pathname.startsWith('/src/bundles/')) continue;
        if (!resolved.pathname.endsWith('.js')) continue;
        if (visitedChunks.has(resolved.pathname)) continue;
        bundleQueue.push(resolved.href);
      }
    }
  }

  for (const path of DIRECT_DENIAL_PATHS) {
    const target = new URL(path, base);
    const response = await fetchText(target.href);
    if (response.status >= 400) continue;
    failures.push(`Direct URL should be denied with a 4xx response, got ${response.status}: ${path}`);
    assertNoForbiddenText(`Direct URL ${path}`, response.text, failures);
    const looksLikeRawJs = response.contentType.includes('javascript') || /^\s*(import|export)\s/m.test(response.text);
    if (looksLikeRawJs) {
      failures.push(`Direct URL unexpectedly served raw source-like JavaScript: ${path}`);
    }
  }

  // U13: matrix-driven forbidden-key check against a live demo bootstrap.
  // The demo session is the only path where we can exercise an authenticated
  // production response without real-learner PII risk.
  let demoChecked = false;
  try {
    const demo = await createDemoSession(base.origin);
    const bootstrap = await loadBootstrap(base.origin, demo.cookie, { expectedSession: demo.session });
    assertMatrixForbiddenKeysAbsent('Production demo /api/bootstrap', bootstrap.payload, failures);
    demoChecked = true;
  } catch (error) {
    failures.push(`Production demo bootstrap probe failed: ${error?.message || error}`);
  }

  // U6 (sys-hardening p1): HEAD-check the security header set on the live
  // origin. We hit paths that cover each response-construction lane:
  //   - `/` — static HTML served by ASSETS (`_headers` `/` group).
  //   - `/src/bundles/app.bundle.js` — run_worker_first path that flows
  //     through applySecurityHeaders with explicit immutable cache.
  //   - `/manifest.webmanifest` — ASSETS direct with `_headers` manifest rule.
  //   - `/api/auth/logout` — Worker-produced 4xx/2xx that must carry
  //     Clear-Site-Data plus the full security set (review testing-gap-4).
  //   - `/api/tts` — Worker-produced 401 without auth; verifies the security
  //     set is present on errored TTS responses (review testing-gap-4).
  const SECURITY_HEADER_CHECKS = [
    { path: '/', label: 'root index' },
    { path: '/src/bundles/app.bundle.js', label: 'Worker-routed bundle' },
    { path: '/manifest.webmanifest', label: 'manifest' },
    { path: '/api/auth/logout', label: 'logout', expectClearSiteData: true, allowAnyStatus: true },
    { path: '/api/tts', label: 'tts probe', allowAnyStatus: true },
  ];
  const REQUIRED_SECURITY_HEADER_NAMES = [
    'strict-transport-security',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'x-frame-options',
    'cross-origin-opener-policy',
    'cross-origin-resource-policy',
    // U7: Content-Security-Policy-Report-Only + the two reporting
    // headers must reach every production response lane before we
    // flip CSP to enforcing.
    'content-security-policy-report-only',
    'report-to',
    'reporting-endpoints',
  ];
  let headerChecksPassed = 0;
  for (const check of SECURITY_HEADER_CHECKS) {
    const target = new URL(check.path, base);
    try {
      const response = await fetch(target.href, { method: 'HEAD' });
      if (!check.allowAnyStatus && (response.status < 200 || response.status >= 400)) {
        failures.push(`Security header HEAD check failed (${response.status}): ${target.href}`);
        continue;
      }
      const missing = [];
      for (const name of REQUIRED_SECURITY_HEADER_NAMES) {
        if (!response.headers.get(name)) missing.push(name);
      }
      if (missing.length) {
        failures.push(
          `Security header HEAD check missing headers on ${check.label} (${target.href}): ${missing.join(', ')}`,
        );
        continue;
      }
      if (/preload/i.test(response.headers.get('strict-transport-security') || '')) {
        failures.push(
          `Security header HEAD check found HSTS preload on ${check.label}; preload is deferred (F-03).`,
        );
        continue;
      }
      // U7: CSP Report-Only must carry the substituted theme-script
      // hash and the strict-dynamic / report-uri directives. A silent
      // regression (lost hash, dropped report-uri) would otherwise
      // ship to production.
      const cspValue = response.headers.get('content-security-policy-report-only') || '';
      if (!/sha256-[A-Za-z0-9+/]+=*/.test(cspValue)) {
        failures.push(
          `Security header HEAD check on ${check.label}: CSP-Report-Only is missing a sha256-<base64> hash (got: ${cspValue.slice(0, 120) || 'absent'}).`,
        );
        continue;
      }
      if (!/'strict-dynamic'/.test(cspValue)) {
        failures.push(
          `Security header HEAD check on ${check.label}: CSP-Report-Only is missing 'strict-dynamic'.`,
        );
        continue;
      }
      if (!/report-uri \/api\/security\/csp-report/.test(cspValue)) {
        failures.push(
          `Security header HEAD check on ${check.label}: CSP-Report-Only is missing report-uri /api/security/csp-report.`,
        );
        continue;
      }
      if (check.expectClearSiteData) {
        const clearSiteData = response.headers.get('clear-site-data') || '';
        const missingMarkers = ['"cache"', '"cookies"', '"storage"']
          .filter((marker) => !clearSiteData.includes(marker));
        if (missingMarkers.length) {
          failures.push(
            `Security header HEAD check missing Clear-Site-Data markers on ${check.label}: ${missingMarkers.join(', ')} (got: ${clearSiteData || 'absent'})`,
          );
          continue;
        }
      }
      headerChecksPassed += 1;
    } catch (error) {
      failures.push(`Security header HEAD check errored on ${check.label}: ${error?.message || error}`);
    }
  }

  // U8 (sys-hardening p1): HEAD-check the cache-policy split on the live
  // origin. Covers one representative per cache lane so a regression in
  // `_headers` or the Worker wrapper surfaces immediately:
  //   - `/` — HTML must never be cached (no-store).
  //   - `/src/bundles/app.bundle.js` — Worker-wrapped hashed bundle (immutable).
  //   - `/assets/app-icons/favicon-32.png` — ASSETS-direct hashed asset (immutable).
  //   - `/manifest.webmanifest` — intentional 1-hour short cache (neither
  //     immutable nor no-store).
  //
  // `/api/bootstrap` intentionally NOT probed: HEAD requests fall through
  // to the json() 404-fallback which hardcodes no-store, so the probe
  // would always pass against the fallback path rather than the real GET
  // handler. `json()`'s hardcoded cache-control already makes the GET
  // endpoint no-store by construction (adv-1).
  const CACHE_SPLIT_CHECKS = [
    { path: '/', label: 'root index', expected: 'no-store' },
    { path: '/src/bundles/app.bundle.js', label: 'Worker-wrapped bundle', expected: 'public, max-age=31536000, immutable' },
    { path: '/assets/app-icons/favicon-32.png', label: 'ASSETS app icon', expected: 'public, max-age=31536000, immutable' },
    { path: '/manifest.webmanifest', label: 'web app manifest', expected: 'public, max-age=3600' },
  ];
  let cacheChecksPassed = 0;
  for (const check of CACHE_SPLIT_CHECKS) {
    const target = new URL(check.path, base);
    try {
      const response = await fetch(target.href, { method: 'HEAD' });
      if (!check.allowAnyStatus && (response.status < 200 || response.status >= 400)) {
        failures.push(`Cache-split HEAD check failed (${response.status}): ${target.href}`);
        continue;
      }
      const observed = (response.headers.get('cache-control') || '').trim();
      // Normalise whitespace so a `public,max-age=...` variant does not
      // false-fail against the canonical `public, max-age=...` form.
      const normalise = (value) => value.replace(/\s+/gu, ' ').replace(/,\s*/gu, ', ').trim();
      if (normalise(observed) !== normalise(check.expected)) {
        failures.push(
          `Cache-split HEAD check on ${check.label} (${target.href}) expected Cache-Control: ${check.expected}, got: ${observed || 'absent'}`,
        );
        continue;
      }
      cacheChecksPassed += 1;
    } catch (error) {
      failures.push(`Cache-split HEAD check errored on ${check.label}: ${error?.message || error}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    checked: {
      origin: base.href,
      scriptCount: scripts.length,
      scannedBundleCount,
      scannedBundlePaths: Array.from(visitedChunks).sort(),
      directPathCount: DIRECT_DENIAL_PATHS.length,
      matrixDemoChecked: demoChecked,
      securityHeaderChecksPassed: headerChecksPassed,
      securityHeaderChecksTotal: SECURITY_HEADER_CHECKS.length,
      cacheSplitChecksPassed: cacheChecksPassed,
      cacheSplitChecksTotal: CACHE_SPLIT_CHECKS.length,
    },
  };
}

const origin = argValue('--url', DEFAULT_ORIGIN);
const skipLocal = process.argv.includes('--skip-local');
const retries = argInteger('--retries', 0);
const retryDelayMs = argInteger('--retry-delay-ms', 1000);
if (!skipLocal) {
  const local = await runClientBundleAudit();
  if (!local.ok) {
    console.error(local.failures.join('\n'));
    process.exit(1);
  }
}

let result = null;
for (let attempt = 0; attempt <= retries; attempt += 1) {
  result = await auditProduction(origin);
  if (result.ok) break;
  if (attempt < retries) {
    console.warn(`Production bundle audit failed; retrying in ${retryDelayMs} ms (${attempt + 1}/${retries}).`);
    await wait(retryDelayMs);
  }
}

if (!result?.ok) {
  console.error(result?.failures?.join('\n') || 'Production bundle audit failed.');
  process.exit(1);
}
console.log(
  `Production bundle audit passed for ${result.checked.origin} `
  + `(${result.checked.scriptCount} HTML-referenced bundle(s), `
  + `${result.checked.scannedBundleCount} chunk(s) scanned transitively, `
  + `${result.checked.directPathCount} direct paths, `
  + `matrix demo check: ${result.checked.matrixDemoChecked ? 'ok' : 'skipped'}, `
  + `security-header checks: ${result.checked.securityHeaderChecksPassed}/${result.checked.securityHeaderChecksTotal}, `
  + `cache-split checks: ${result.checked.cacheSplitChecksPassed}/${result.checked.cacheSplitChecksTotal}).`
);
