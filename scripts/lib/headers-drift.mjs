// U6 (sys-hardening p1): pure drift contract for the published `_headers`.
// U7 (sys-hardening p1): extended to cover the CSP Report-Only line plus
// the Report-To / Reporting-Endpoints headers.
// U8 (sys-hardening p1): extended with a parser-level cache-split contract
// so the checked-in `_headers` cannot silently regress a single path
// group's Cache-Control rule (hashed bundles immutable, manifest 1-hour,
// favicon 1-day, HTML + fallback no-store).
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

// U8 (sys-hardening p1): parser-level cache-split contract.
//
// Each entry pins the Cache-Control value that must appear under the named
// path group in the Cloudflare Workers Static Assets `_headers` file. A
// drift (for example: someone sets `/manifest.webmanifest` to `no-store`,
// or drops the `immutable` qualifier from bundles) fails the gate with a
// pointed message naming both the path and the expected value.
//
// The list is kept in sync with:
//   - `_headers` (single source of truth at repo root)
//   - `worker/src/security-headers.js` (`/src/bundles/*` immutable override)
//   - `scripts/production-bundle-audit.mjs` (live HEAD checks)
//   - `docs/operations/capacity.md` (post-deploy cache-split check)
export const CACHE_SPLIT_RULES = Object.freeze([
  { path: '/*', cacheControl: 'no-store' },
  { path: '/assets/bundles/*', cacheControl: 'public, max-age=31536000, immutable' },
  { path: '/assets/app-icons/*', cacheControl: 'public, max-age=31536000, immutable' },
  { path: '/styles/*', cacheControl: 'public, max-age=31536000, immutable' },
  { path: '/favicon.ico', cacheControl: 'public, max-age=86400' },
  { path: '/manifest.webmanifest', cacheControl: 'public, max-age=3600' },
  { path: '/', cacheControl: 'no-store' },
  { path: '/index.html', cacheControl: 'no-store' },
]);

/**
 * Split a `_headers` content string into `{ path, body }` blocks. A block
 * starts at a line beginning with `/` (no indent) and ends at the next
 * path line or end-of-file. Blank lines and commented lines are skipped.
 *
 * Intentionally minimal — the Cloudflare `_headers` format has a tiny
 * surface area (path line, indented header lines, blank separator) and we
 * control both producer and consumer, so we do not need a full parser.
 *
 * @param {string} headersContent
 * @returns {{ path: string, body: string }[]}
 */
export function parseHeadersBlocks(headersContent) {
  if (typeof headersContent !== 'string') {
    throw new Error('parseHeadersBlocks: headersContent must be a string.');
  }
  const blocks = [];
  const lines = headersContent.split(/\r?\n/);
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/u, '');
    if (line.startsWith('/')) {
      if (current) blocks.push(current);
      current = { path: line, body: '' };
      continue;
    }
    if (current) {
      current.body += (current.body ? '\n' : '') + line;
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Validate that the `_headers` content carries the expected Cache-Control
 * value under every path group in `CACHE_SPLIT_RULES`. Throws on first miss
 * with a message naming the path and both observed and expected values.
 *
 * Accepts an optional `rules` override so tests can exercise drift paths
 * (a misconfigured rule set) without mutating the exported constant.
 *
 * @param {string} headersContent
 * @param {{ rules?: ReadonlyArray<{ path: string, cacheControl: string }> }} [options]
 * @returns {void}
 */
export function assertCacheSplitRules(headersContent, { rules = CACHE_SPLIT_RULES } = {}) {
  if (typeof headersContent !== 'string') {
    throw new Error('assertCacheSplitRules: headersContent must be a string.');
  }
  const blocks = parseHeadersBlocks(headersContent);
  const byPath = new Map();
  for (const block of blocks) byPath.set(block.path, block);
  for (const rule of rules) {
    const block = byPath.get(rule.path);
    if (!block) {
      throw new Error(`Published _headers is missing path group: ${rule.path}`);
    }
    // Match the last Cache-Control line in the block; if there are
    // multiple (a drift shape), the final one is what Cloudflare applies.
    const matches = block.body.match(/^\s*Cache-Control:\s*(.+)$/gmu) || [];
    if (matches.length === 0) {
      throw new Error(`Published _headers path group ${rule.path} is missing a Cache-Control line (expected: ${rule.cacheControl}).`);
    }
    const lastMatch = matches[matches.length - 1];
    const observed = lastMatch.replace(/^\s*Cache-Control:\s*/u, '').trim();
    if (observed !== rule.cacheControl) {
      throw new Error(
        `Published _headers path group ${rule.path} has Cache-Control: ${observed} (expected: ${rule.cacheControl}).`,
      );
    }
  }
}
