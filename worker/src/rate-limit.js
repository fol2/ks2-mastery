// U7 (sys-hardening p1): shared `consumeRateLimit` helper.
//
// Feasibility F-06: three near-duplicate copies previously lived in
// `worker/src/auth.js`, `worker/src/demo/sessions.js`, and
// `worker/src/tts.js`. Each carried the same SQL against
// `request_limits`, the same window arithmetic, and the same return
// shape; they differed only in whether the first argument was `env`
// (auth, tts) or a raw D1 database (demo/sessions). This module
// collapses the three into a single implementation.
//
// The single signature is `(envOrDb, { bucket, identifier, limit,
// windowMs, now })`. The first argument accepts either an `env`-like
// object with a `.DB` D1 binding or a D1 database directly, so the
// prior demo/sessions call sites (`consumeRateLimit(db, ...)`) and
// auth/tts call sites (`consumeRateLimit(env, ...)`) both keep working
// without rewrites. Making the helper side-effect free and
// dependency-injected keeps tests simple — `tests/csp-report-endpoint`
// exercises the shared helper via the CSP-report route without any
// extra scaffolding.
//
// U4 (P1.5 Phase B): this module also owns `normaliseRateLimitSubject`,
// a pure tiered-bucket key helper. The three local `clientIp` helpers
// in `auth.js`, `app.js`, `demo/sessions.js`, and `tts.js` used to take
// the raw `CF-Connecting-IP` header and feed it straight into
// `consumeRateLimit.identifier`, which let a single attacker on an
// IPv6 /64 rotate the low 64 bits and evade the per-IP budget
// (follow-up from the U6 ops-error review, Finding 6). The helper
// collapses every v6 source to a single `v6/64:` bucket, keeps v4
// addresses untouched, and routes malformed / unsafe headers
// (link-local, ULA, loopback, unspecified, missing) into distinct
// `unknown:<reason>` buckets so they do not silently share a bucket
// with legitimate IPs. Header trust is strict by default — only
// `CF-Connecting-IP` (the Cloudflare-signed header) is trusted.
// Call sites opt in to `X-Forwarded-For` / `X-Real-IP` via
// `trustXForwardedFor: env.TRUST_XFF === '1'` (dev / staging).

import { bindStatement, first, requireDatabase } from './d1.js';
import { sha256 } from './auth.js';

function currentWindowStart(timestamp, windowMs) {
  return Math.floor(timestamp / windowMs) * windowMs;
}

function isLikelyD1Database(candidate) {
  return Boolean(candidate && typeof candidate.prepare === 'function');
}

function resolveDatabase(envOrDb) {
  if (isLikelyD1Database(envOrDb)) return envOrDb;
  return requireDatabase(envOrDb);
}

/**
 * Consume one unit of the limiter bucket. Returns `{ allowed, retryAfterSeconds }`.
 * `allowed` is true when the request is within the per-window limit.
 *
 * @param {object} envOrDb - Either a Worker env with `.DB` or a D1 database.
 * @param {object} options
 * @param {string} options.bucket - Static bucket label (e.g. `csp-report`).
 * @param {string} options.identifier - Per-identity key (IP, accountId, etc.).
 * @param {number} options.limit - Max requests per window.
 * @param {number} options.windowMs - Window size in milliseconds.
 * @param {number} [options.now] - Current epoch ms (defaults to Date.now()).
 * @returns {Promise<{ allowed: boolean, retryAfterSeconds: number }>}
 */
export async function consumeRateLimit(envOrDb, { bucket, identifier, limit, windowMs, now = Date.now() } = {}) {
  if (!bucket || !identifier || !limit || !windowMs) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const db = resolveDatabase(envOrDb);
  const windowStartedAt = currentWindowStart(now, windowMs);
  const limiterKey = `${bucket}:${await sha256(identifier)}`;
  const row = await first(db, `
    INSERT INTO request_limits (limiter_key, window_started_at, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(limiter_key) DO UPDATE SET
      request_count = CASE
        WHEN request_limits.window_started_at = excluded.window_started_at
          THEN request_limits.request_count + 1
        ELSE 1
      END,
      window_started_at = excluded.window_started_at,
      updated_at = excluded.updated_at
    RETURNING request_count, window_started_at
  `, [limiterKey, windowStartedAt, now]);
  const count = Number(row?.request_count || 1);
  const storedWindow = Number(row?.window_started_at || windowStartedAt);
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((storedWindow + windowMs) - now) / 1000)),
  };
}

// Re-export the bound statement helper so consumers that want a custom
// limiter variant (e.g. peek-without-increment) can build one without a
// second round of duplication. Not used in this unit; kept to keep the
// extraction boundary explicit.
export { bindStatement };

// -- U4 (P1.5 Phase B) -------------------------------------------------
//
// `normaliseRateLimitSubject(request, opts) -> { bucketKey, fallbackReason, globalKey? }`
//
// Pure, dependency-free function. Parses the request's IP header chain
// (strict by default) and emits a tiered bucket key:
//   - Pure IPv4            -> `v4:<addr>`
//   - IPv4-mapped IPv6     -> `v4:<unmapped-addr>` (not v6/64:)
//   - IPv6 global-unicast  -> `v6/64:<first-four-hextets>` (16 hex chars)
//   - Link-local fe80::/10 -> `unknown:link_local`
//   - Unique-local fc00::/7-> `unknown:ula`
//   - Loopback ::1         -> `unknown:loopback`
//   - Unspecified ::       -> `unknown:unspecified`
//   - Missing header       -> `unknown:missing`
//   - Garbage / malformed  -> `unknown:malformed`
// When `globalBudgetKey` is a non-empty string, the result also carries
// `globalKey: 'global:<suffix>'` so the caller can consume a second
// route-wide budget bucket alongside the per-subject one.

function headerValue(request, name) {
  try {
    const raw = request.headers.get(name);
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(value) {
  const match = IPV4_RE.exec(value);
  if (!match) return null;
  for (let i = 1; i <= 4; i += 1) {
    const octet = Number(match[i]);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
  }
  return value;
}

function stripZoneId(value) {
  const percentAt = value.indexOf('%');
  return percentAt === -1 ? value : value.slice(0, percentAt);
}

function looksLikeIpv4Mapped(lower) {
  // `::ffff:<v4>` is the canonical IPv4-mapped form; accept any casing
  // and zero-padded variants such as `0:0:0:0:0:ffff:1.2.3.4`.
  const idx = lower.lastIndexOf(':');
  if (idx === -1) return null;
  const tail = lower.slice(idx + 1);
  if (!IPV4_RE.test(tail)) return null;
  const head = lower.slice(0, idx + 1);
  // Must end with `::ffff:` (or expanded `...:0:ffff:`).
  if (!/(^|:)ffff:$/.test(head)) return null;
  return parseIpv4(tail);
}

function classifyIpv6Prefix(lower) {
  // Fast paths for the well-known reserved ranges checked on the raw
  // lowercase string, BEFORE we attempt hextet expansion. These ranges
  // never serve legitimate public traffic on a Cloudflare edge, so
  // routing them to `unknown:<reason>` keeps the real v6/64: buckets
  // clean.
  if (lower === '::1') return 'loopback';
  if (lower === '::' || lower === '::0') return 'unspecified';
  if (/^fe[89ab][0-9a-f]?:/.test(lower) || /^fe[89ab][0-9a-f]?$/.test(lower)) {
    return 'link_local';
  }
  if (/^f[cd][0-9a-f]{2}:/.test(lower) || /^f[cd][0-9a-f]{2}$/.test(lower)) {
    return 'ula';
  }
  return null;
}

function expandIpv6Hextets(lower) {
  const doubleIdx = lower.indexOf('::');
  let head;
  let tail;
  if (doubleIdx === -1) {
    head = lower ? lower.split(':') : [];
    tail = [];
  } else {
    const headPart = lower.slice(0, doubleIdx);
    const tailPart = lower.slice(doubleIdx + 2);
    head = headPart ? headPart.split(':') : [];
    tail = tailPart ? tailPart.split(':') : [];
    // A second `::` anywhere is malformed.
    if (lower.slice(doubleIdx + 2).includes('::')) return null;
  }
  const total = head.length + tail.length;
  if (total > 8) return null;
  if (doubleIdx === -1 && total !== 8) return null;
  const fill = Array(Math.max(0, 8 - total)).fill('0');
  const hextets = [...head, ...fill, ...tail];
  for (const hextet of hextets) {
    if (!/^[0-9a-f]{1,4}$/.test(hextet)) return null;
  }
  return hextets.map((h) => h.padStart(4, '0'));
}

function parseIpv6ToBucket(raw) {
  const stripped = stripZoneId(raw).toLowerCase();
  const classification = classifyIpv6Prefix(stripped);
  if (classification) return { bucketKey: null, fallbackReason: classification };
  const mappedV4 = looksLikeIpv4Mapped(stripped);
  if (mappedV4) return { bucketKey: `v4:${mappedV4}`, fallbackReason: null };
  const hextets = expandIpv6Hextets(stripped);
  if (!hextets) return { bucketKey: null, fallbackReason: 'malformed' };
  // Re-classify after expansion in case the caller wrote out the
  // reserved prefix in full (e.g. `0000:0000:0000:0000:0000:0000:0000:0001`).
  if (hextets.every((h) => h === '0000')) {
    return { bucketKey: null, fallbackReason: 'unspecified' };
  }
  if (hextets.slice(0, 7).every((h) => h === '0000') && hextets[7] === '0001') {
    return { bucketKey: null, fallbackReason: 'loopback' };
  }
  const firstHextet = hextets[0];
  if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) {
    return { bucketKey: null, fallbackReason: 'link_local' };
  }
  if (/^f[cd][0-9a-f]{2}$/.test(firstHextet)) {
    return { bucketKey: null, fallbackReason: 'ula' };
  }
  const prefix = hextets.slice(0, 4).join('');
  return { bucketKey: `v6/64:${prefix}`, fallbackReason: null };
}

function resolveSubjectAddress(raw) {
  if (!raw) return { bucketKey: null, fallbackReason: 'missing' };
  const v4 = parseIpv4(raw);
  if (v4) return { bucketKey: `v4:${v4}`, fallbackReason: null };
  if (raw.includes(':')) return parseIpv6ToBucket(raw);
  return { bucketKey: null, fallbackReason: 'malformed' };
}

function readSubjectHeader(request, trustXForwardedFor) {
  const cf = headerValue(request, 'cf-connecting-ip');
  if (cf) return cf;
  if (!trustXForwardedFor) return '';
  const xff = headerValue(request, 'x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0];
    return typeof first === 'string' ? first.trim() : '';
  }
  const xreal = headerValue(request, 'x-real-ip');
  return xreal;
}

/**
 * Pure helper. Turns a request's IP headers into a tiered rate-limit
 * bucket key so callers can hash a consistent subject identifier
 * through `consumeRateLimit`.
 *
 * @param {Request} request
 * @param {object} [options]
 * @param {number} [options.ipv6Prefix=64]
 *   Reserved for future flexibility. Only `/64` is supported in P1.5.
 * @param {boolean} [options.trustXForwardedFor=false]
 *   When true, fall back to the first `X-Forwarded-For` entry and then
 *   `X-Real-IP` if `CF-Connecting-IP` is absent. The caller owns the
 *   trust decision — production Workers pass `false`; dev/staging
 *   behind-origin deployments pass `env.TRUST_XFF === '1'`.
 * @param {string|null} [options.globalBudgetKey=null]
 *   When a non-empty string is provided, the result also carries
 *   `globalKey: 'global:<key>'` so the caller can consume a second
 *   route-wide bucket alongside the per-subject one.
 * @returns {{ bucketKey: string, fallbackReason: string|null, globalKey?: string }}
 */
export function normaliseRateLimitSubject(request, {
  // eslint-disable-next-line no-unused-vars
  ipv6Prefix = 64,
  trustXForwardedFor = false,
  globalBudgetKey = null,
} = {}) {
  const raw = readSubjectHeader(request, Boolean(trustXForwardedFor));
  const { bucketKey, fallbackReason } = resolveSubjectAddress(raw);
  const finalBucket = bucketKey || `unknown:${fallbackReason || 'missing'}`;
  const result = {
    bucketKey: finalBucket,
    fallbackReason: bucketKey ? null : (fallbackReason || 'missing'),
  };
  if (typeof globalBudgetKey === 'string' && globalBudgetKey) {
    result.globalKey = `global:${globalBudgetKey}`;
  }
  return result;
}
