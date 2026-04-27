import {
  SessionCreationSuspendedError,
  clearSessionCookie,
  completeSocialLogin,
  createSessionAuthBoundary,
  deleteCurrentSession,
  loginWithEmail,
  registerWithEmail,
  requireMutationCapability,
  startSocialLogin,
} from './auth.js';
import { requireDatabase, requireDatabaseWithCapacity } from './d1.js';
import { errorResponse } from './errors.js';
import { json, readForm, readJson, readJsonBounded } from './http.js';
import {
  CapacityCollector,
  capacityRequest,
  generateRequestId,
  measureUtf8Bytes,
  validateRequestId,
} from './logger.js';
import { createWorkerRepository } from './repository.js';
import { handleTextToSpeechRequest } from './tts.js';
import {
  createDemoSession,
  isProductionRuntime,
  protectDemoParentHubRead,
  protectDemoSubjectCommand,
  requireActiveDemoAccount,
  requireSameOrigin,
  resetDemoAccount,
} from './demo/sessions.js';
import { normaliseSubjectCommandRequest } from './subjects/command-contract.js';
import { createWorkerSubjectRuntime } from './subjects/runtime.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  AccountSuspendedError,
  AccountPaymentHoldError,
  SessionInvalidatedError,
} from './errors.js';
import { SUBJECT_EXPOSURE_GATES } from '../../src/platform/core/subject-availability.js';
import { consumeRateLimit, rateLimitResponse, rateLimitSubject } from './rate-limit.js';
import { handleHeroReadModel } from './hero/routes.js';
import { resolveHeroStartTaskCommand } from './hero/launch.js';
import { logRequestDenial } from './admin-denial-logger.js';
import {
  DENIAL_RATE_LIMIT_EXCEEDED,
} from './error-codes.js';


// U7 (sys-hardening p1): CSP report endpoint constants. The endpoint
// lives in this file (rather than its own module) because it is a
// single narrow handler; if a future unit adds more reporting surfaces
// we can extract a dedicated module then.
const CSP_REPORT_BODY_CAP_BYTES = 8192;
const CSP_REPORT_WINDOW_MS = 10 * 60 * 1000;
const CSP_REPORT_IP_LIMIT = 20;
// Strip newline and control characters from logged values so a
// violation report body cannot inject a fake structured log line
// (security F-02, log-line spoofing). Keep printable characters
// including high-bit Unicode to preserve legitimate UTF-8 URIs.
function sanitiseCspReportValue(value) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\t-]+/g, ' ').trim().slice(0, 1024);
}

// U5 (P1.5 Phase B): the local `cspReportClientIp` helper is replaced
// by `rateLimitSubject(request, env)` from `worker/src/rate-limit.js`
// so the CSP report endpoint also benefits from IPv6 /64 bucketing.

function extractCspReportFields(payload) {
  // Legacy `application/csp-report` wraps the report under `.csp-report`.
  // Reporting API v2 ships an array of report entries where each entry
  // has `.body` with kebab/camel-case field variants depending on the
  // reporting UA. Handle both shapes defensively.
  //
  // testing-gap-2: well-formed JSON that carries none of the CSP fields we
  // expect (e.g. `{"arbitrary": "object"}`) must be rejected rather than
  // logged as an all-empty entry. A report with at least one recognisable
  // CSP field survives; anything else returns null so the handler 400s.
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const fields = extractCspReportFields(entry);
      if (fields) return fields;
    }
    return null;
  }
  const legacy = payload['csp-report'];
  const source = legacy && typeof legacy === 'object'
    ? legacy
    : (payload.body && typeof payload.body === 'object' ? payload.body : payload);
  // Only trust the payload as a CSP report if it carries at least one of
  // the canonical violation keys under either kebab or camel case. This
  // prevents `{hello:'world'}` from being accepted and logged as an empty
  // report entry (testing-gap-2).
  const CSP_SHAPE_KEYS = [
    'blocked-uri',
    'blockedURL',
    'blockedUri',
    'document-uri',
    'documentURL',
    'documentUri',
    'violated-directive',
    'effective-directive',
    'violatedDirective',
    'effectiveDirective',
  ];
  const hasCspShape = CSP_SHAPE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(source, key));
  if (!hasCspShape) return null;
  const blockedUri = source['blocked-uri'] || source.blockedURL || source.blockedUri || '';
  const documentUri = source['document-uri'] || source.documentURL || source.documentUri || '';
  const sourceFile = source['source-file'] || source.sourceFile || '';
  const violatedDirective = source['violated-directive']
    || source['effective-directive']
    || source.violatedDirective
    || source.effectiveDirective
    || '';
  const lineNumber = Number(source['line-number'] || source.lineNumber);
  const statusCode = Number(source['status-code'] || source.statusCode);
  return {
    blockedUri: sanitiseCspReportValue(blockedUri),
    documentUri: sanitiseCspReportValue(documentUri),
    sourceFile: sanitiseCspReportValue(sourceFile),
    violatedDirective: sanitiseCspReportValue(violatedDirective),
    lineNumber: Number.isFinite(lineNumber) ? lineNumber : null,
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
  };
}

// correctness-low-1: read the request body through a streaming reader so
// that a caller who omits (or understates) `Content-Length` cannot force
// the Worker to buffer an arbitrarily large body in memory before the
// 8 KB cap check fires. As soon as we exceed the cap we cancel the
// underlying stream and throw a sentinel error that the handler turns
// into a 413. `Content-Length` preflight below remains the fast path.
const CSP_REPORT_BODY_EXCEEDS_CAP = Symbol('csp-report-body-exceeds-cap');

async function readCspReportBody(request, cap) {
  const reader = request.body?.getReader?.();
  if (!reader) {
    // No stream (e.g. test doubles). Fall back to the buffered reader but
    // still enforce the cap after reading. Node's fetch `Request` always
    // exposes `body.getReader()` when a body is present, so this branch is
    // only hit on truly empty bodies or non-streamable mocks.
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > cap) {
      const overflow = new Error('csp-report-body-exceeds-cap');
      overflow.code = CSP_REPORT_BODY_EXCEEDS_CAP;
      throw overflow;
    }
    return new Uint8Array(buffer);
  }
  const chunks = [];
  let read = 0;
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      read += value.byteLength;
      if (read > cap) {
        // Cancel the stream so the upstream socket/body is released. Do
        // not await the cancellation — failure to cancel does not change
        // our response semantics, but the cap breach is authoritative.
        try { reader.cancel(); } catch { /* ignore */ }
        const overflow = new Error('csp-report-body-exceeds-cap');
        overflow.code = CSP_REPORT_BODY_EXCEEDS_CAP;
        throw overflow;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  if (chunks.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(read);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function handleCspReportRequest({ request, env, now }) {
  // Size guard 1: reject when the caller declares an over-size body.
  // This is the fast path — no body read required.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > CSP_REPORT_BODY_CAP_BYTES) {
    return new Response(null, { status: 413, headers: { 'cache-control': 'no-store' } });
  }

  // Size guard 2: even if Content-Length is absent or understated, stream
  // the body with a hard cap so a huge/misrepresented payload cannot force
  // the Worker to allocate memory before the check fires (correctness-low-1).
  let buffer;
  try {
    buffer = await readCspReportBody(request, CSP_REPORT_BODY_CAP_BYTES);
  } catch (error) {
    if (error && error.code === CSP_REPORT_BODY_EXCEEDS_CAP) {
      return new Response(null, { status: 413, headers: { 'cache-control': 'no-store' } });
    }
    return new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const rawText = new TextDecoder().decode(buffer);

  // Per-IP rate limit via the shared limiter. The endpoint is
  // unauthenticated; the IP is the only stable identifier.
  try {
    const limit = await consumeRateLimit(env, {
      bucket: 'csp-report',
      identifier: rateLimitSubject(request, env).bucketKey,
      limit: CSP_REPORT_IP_LIMIT,
      windowMs: CSP_REPORT_WINDOW_MS,
      now,
    });
    if (!limit.allowed) {
      return new Response(null, {
        status: 429,
        headers: {
          'cache-control': 'no-store',
          'retry-after': String(limit.retryAfterSeconds || 60),
        },
      });
    }
  } catch {
    // A limiter outage must not crash the endpoint. Fall through and
    // accept the report; the Worker console logs the outage separately.
  }

  let parsed;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    return new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  const fields = extractCspReportFields(parsed);
  if (!fields) {
    return new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } });
  }

  // Structured log line for Workers observability. Fields are already
  // sanitised — safe to interpolate into a JSON payload.
  const logEntry = {
    event: 'csp-report',
    blockedUri: fields.blockedUri,
    documentUri: fields.documentUri,
    sourceFile: fields.sourceFile,
    violatedDirective: fields.violatedDirective,
    lineNumber: fields.lineNumber,
    statusCode: fields.statusCode,
    at: new Date(now).toISOString(),
  };
  console.log(`[ks2-csp-report] ${JSON.stringify(logEntry)}`);

  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}


function withCookies(response, cookies = []) {
  cookies.filter(Boolean).forEach((cookie) => response.headers.append('set-cookie', cookie));
  return response;
}

function redirect(location, status = 302, cookies = []) {
  const response = new Response(null, {
    status,
    headers: {
      location,
      'cache-control': 'no-store',
    },
  });
  return withCookies(response, cookies);
}

function isDemoSubresourceRequest(request) {
  const mode = request.headers.get('sec-fetch-mode');
  const dest = request.headers.get('sec-fetch-dest');
  const hasFetchMetadata = Boolean(
    mode
    || dest
    || request.headers.get('sec-fetch-site')
    || request.headers.get('sec-fetch-user'),
  );
  if (!hasFetchMetadata) return false;
  if (mode && mode !== 'navigate') return true;
  if (dest && dest !== 'document') return true;
  return false;
}

function callbackErrorRedirect(request, message) {
  const url = new URL(request.url);
  return redirect(`${url.origin}/?auth_error=${encodeURIComponent(message || 'Could not complete sign-in.')}`);
}

function mutationFromRequest(body, request) {
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const raw = payload.mutation && typeof payload.mutation === 'object' && !Array.isArray(payload.mutation)
    ? payload.mutation
    : {};
  const requestId = raw.requestId || request.headers.get('x-ks2-request-id') || null;
  const correlationId = raw.correlationId || request.headers.get('x-ks2-correlation-id') || requestId || null;
  return {
    ...raw,
    requestId,
    correlationId,
  };
}

async function sessionPayload({ session, auth, env, now, capacity = null }) {
  if (!session) {
    return {
      ok: true,
      auth: auth.describe(),
      session: null,
      account: null,
      learnerCount: 0,
    };
  }

  const repository = createWorkerRepository({ env, now, capacity });
  const account = await repository.ensureAccount(session);
  const learnerIds = await repository.accessibleLearnerIds(session.accountId);
  return {
    ok: true,
    auth: auth.describe(),
    subjectExposureGates: subjectExposureGatesFromEnv(env),
    account: account
      ? {
        id: account.id,
        email: account.email,
        displayName: account.display_name,
        selectedLearnerId: account.selected_learner_id || null,
        repoRevision: Number(account.repo_revision) || 0,
        platformRole: account.platform_role || session.platformRole || 'parent',
        accountType: account.account_type || session.accountType || 'real',
        demo: (account.account_type || session.accountType) === 'demo',
        demoExpiresAt: Number(account.demo_expires_at) || session.demoExpiresAt || null,
      }
      : null,
    session: session
      ? {
        // P1-A: explicit allowlist, mirrors /api/bootstrap session shape. The
        // previous `...session` spread leaked sessionHash + sessionId (database
        // lookup keys — credential-adjacent) into /api/session and
        // /api/auth/session response bodies. Never replace with a spread.
        accountId: session.accountId,
        provider: session.provider,
        platformRole: session.platformRole || 'parent',
        accountType: session.accountType || 'real',
        demo: Boolean(session.demo),
        demoExpiresAt: session.demoExpiresAt || null,
        email: session.email || null,
        displayName: session.displayName || null,
      }
      : null,
    learnerCount: learnerIds.length,
  };
}

async function existingDemoSessionPayload({ session, env, now, capacity = null }) {
  const repository = createWorkerRepository({ env, now, capacity });
  const account = await repository.ensureAccount(session);
  const learnerIds = await repository.accessibleLearnerIds(session.accountId);
  return {
    ok: true,
    subjectExposureGates: subjectExposureGatesFromEnv(env),
    session: {
      accountId: session.accountId,
      learnerId: account?.selected_learner_id || learnerIds[0] || null,
      provider: 'demo',
      demo: true,
      expiresAt: session.demoExpiresAt || null,
    },
  };
}

function shouldUsePublicReadModels(request, env = {}) {
  if (request.headers.get('x-ks2-public-read-models') === '1') return true;
  return isProductionRuntime(env);
}

function envFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

export function subjectExposureGatesFromEnv(env = {}) {
  return {
    [SUBJECT_EXPOSURE_GATES.punctuation]: envFlagEnabled(env.PUNCTUATION_SUBJECT_ENABLED),
  };
}

function requireSubjectCommandAvailable(command, env = {}) {
  if (command?.subjectId !== 'punctuation') return;
  if (subjectExposureGatesFromEnv(env)[SUBJECT_EXPOSURE_GATES.punctuation]) return;
  throw new NotFoundError('Subject command is not available.', {
    code: 'subject_command_not_found',
    subjectId: command.subjectId,
    command: command.command,
  });
}

function requireDemoWriteAllowed(session) {
  if (session?.demo) {
    throw new ForbiddenError('Demo writes must use server-owned routes.', {
      code: 'subject_command_required',
    });
  }
}

function requireLegacyRuntimeWriteAllowed(session, env = {}) {
  if (session?.demo || isProductionRuntime(env)) {
    throw new ForbiddenError('Runtime writes must use the subject command boundary.', {
      code: 'subject_command_required',
    });
  }
}

async function publicSourceAssetResponse(request, env = {}) {
  const url = new URL(request.url);
  const headers = {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Not found.', { status: 404, headers });
  }
  // SH2-U10 (F-01): prefix + extension match for the `/src/bundles/` allowlist.
  // Esbuild code-splitting (`splitting: true` in `scripts/build-client.mjs`)
  // emits additional sibling `.js` chunks next to `app.bundle.js` — e.g.
  // lazy-loaded admin-hub / parent-hub / monster-visual-config chunks with
  // content-hashed filenames. The previous exact-equality check would return
  // 404 for every split chunk in production. The prefix + `.js` extension
  // keeps the allowlist tight (no leakage of metafile JSON, source maps, or
  // any sibling file) while admitting the new chunk filenames.
  //
  // The `/src/*` `run_worker_first` routing in `wrangler.jsonc` keeps this
  // function as the single gate; `isPublicSourceLockdownPath` drops every
  // other `/src/` / `/shared/` / `/worker/` / `/tests/` / `/docs/` /
  // `/legacy/` path into this same 404 lane.
  if (
    url.pathname.startsWith('/src/bundles/')
    && url.pathname.endsWith('.js')
    && env.ASSETS
  ) {
    return env.ASSETS.fetch(request);
  }
  return new Response('Not found.', { status: 404, headers });
}

function isPublicSourceLockdownPath(pathname) {
  return pathname.startsWith('/src/')
    || pathname.startsWith('/shared/')
    || pathname.startsWith('/worker/')
    || pathname.startsWith('/tests/')
    || pathname.startsWith('/docs/')
    || pathname.startsWith('/legacy/')
    || pathname === '/migration-plan.md';
}

// U5 (P1.5 Phase B): the local `resolveClientIp` helper is replaced by
// `rateLimitSubject(request, env)` from `worker/src/rate-limit.js` so
// the public `/api/ops/error-event` ingest benefits from the same
// IPv6 /64 bucketing the auth/demo/TTS surfaces use. The route also
// consumes a second rate-limit bucket (fresh-insert cap) when the
// repository reports a genuinely new fingerprint, and a route-wide
// global-budget bucket that caps total post-release crash-loop traffic.

const OPS_ERROR_EVENT_MAX_BODY_BYTES = 8 * 1024;
// U7 adv-u7-r1-003: POST /api/bootstrap body cap. A legitimate probe body
// is `{lastKnownRevision, preferredLearnerId?}` — 32 hex chars plus a UUID
// plus the JSON envelope, ~160 bytes upper-bound. 2 KB is comfortably
// above that so clients never regress while closing the unbounded-body
// surface flagged by the round-1 adversarial review.
const BOOTSTRAP_POST_BODY_LIMIT = 2 * 1024;
const OPS_ERROR_EVENT_RATE_LIMIT = 60;
const OPS_ERROR_EVENT_RATE_WINDOW_MS = 10 * 60 * 1000;
// U5: fresh-insert cap — fires ONLY after the repository reports the
// event is a genuinely new (errorKind, messageFirstLine, firstFrame)
// tuple. Attackers rotating `first_frame` to defeat R24 tuple-dedup
// hit this bucket at event 11 in a 60-minute window. Tunable via
// `env.OPS_ERROR_FRESH_INSERT_LIMIT`.
const OPS_ERROR_FRESH_INSERT_DEFAULT_LIMIT = 10;
const OPS_ERROR_FRESH_INSERT_WINDOW_MS = 60 * 60 * 1000;
// U5: global budget — one route-wide bucket across every subject.
// Sized to absorb a genuine post-release crash loop (6000 events per
// 10-minute window) while blocking a single /64 attacker from
// exhausting the entire budget. Tunable via `env.OPS_ERROR_GLOBAL_LIMIT`.
const OPS_ERROR_GLOBAL_DEFAULT_LIMIT = 6000;
const OPS_ERROR_GLOBAL_WINDOW_MS = 10 * 60 * 1000;
// Phase E adv-e-2: auto-reopen post-commit telemetry bucket. Fires
// AFTER `recordClientErrorEvent` reports `autoReopened: true` — not
// before, because a hard-prevention preflight would require moving the
// 5-condition rule out of the repository into the route, which is more
// coupling than the P1.5 plan buys us. The post-commit cap is still
// useful: it surfaces "attacker forced N reopens on resolved
// fingerprints per subject per hour" as a KPI even though the DB writes
// already committed. Tunable via `env.OPS_ERROR_AUTO_REOPEN_LIMIT`.
const OPS_ERROR_AUTO_REOPEN_DEFAULT_LIMIT = 10;
const OPS_ERROR_AUTO_REOPEN_WINDOW_MS = 60 * 60 * 1000;

function opsErrorFreshInsertLimit(env) {
  const parsed = Number(env?.OPS_ERROR_FRESH_INSERT_LIMIT);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return OPS_ERROR_FRESH_INSERT_DEFAULT_LIMIT;
}

function opsErrorGlobalLimit(env) {
  const parsed = Number(env?.OPS_ERROR_GLOBAL_LIMIT);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return OPS_ERROR_GLOBAL_DEFAULT_LIMIT;
}

function opsErrorAutoReopenLimit(env) {
  const parsed = Number(env?.OPS_ERROR_AUTO_REOPEN_LIMIT);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return OPS_ERROR_AUTO_REOPEN_DEFAULT_LIMIT;
}

// I6 (reviewer): per-bucket-category telemetry. Every 429 at the public
// ingest emits a structured Workers log AND bumps an admin KPI counter
// split by bucket category (`v4`, `v6_64`, `unknown`) so operators can
// distinguish an IPv6 /64 source-rotation attack from an IPv4 flood in
// the admin hub. The helper consolidates the previous "two try/catches
// at every 429 site" pattern into one call.
function opsErrorBucketCategory(bucketKey) {
  if (typeof bucketKey !== 'string' || !bucketKey) return 'unknown';
  const prefix = bucketKey.split(':')[0];
  if (prefix === 'v4') return 'v4';
  if (prefix === 'v6/64') return 'v6_64';
  return 'unknown';
}

async function opsErrorThrottleTelemetry(env, subject, { code, bucketKey, retryAfterSeconds, capacity, now: nowFn = Date.now } = {}) {
  const category = opsErrorBucketCategory(subject?.bucketKey);
  try {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: 'ops_error_rate_limited',
      code,
      bucket_category: category,
      retry_after: Number(retryAfterSeconds) || 0,
    }));
  } catch {
    // Swallow — structured logs are best-effort.
  }
  try {
    // I6 (reviewer): `now` is passed through as a factory so telemetry
    // writes to `admin_kpi_metrics` share the request's clock (when the
    // caller supplied one) and default to `Date.now` otherwise. Without
    // this, the prior reference to an undeclared `now` threw a
    // `ReferenceError` which the outer try/catch silently swallowed,
    // leaving the KPI counters at zero.
    const telemetryRepository = createWorkerRepository({ env, now: nowFn, capacity });
    await telemetryRepository.bumpAdminKpiMetric(bucketKey, 1);
    await telemetryRepository.bumpAdminKpiMetric(`${bucketKey}.${category}`, 1);
  } catch {
    // Swallow — the rate-limit path must never re-enter error ingest.
  }
}

// U3: endpoints on which `meta.capacity` is rendered on successful JSON
// responses. Everything else is explicitly OFF the capacity surface to
// keep the public attack + bundle-size blast radius bounded.
const CAPACITY_RELEVANT_PATH_PATTERNS = [
  /^\/api\/bootstrap$/,
  /^\/api\/subjects\/[^/]+\/command$/,
  /^\/api\/hero\/command$/,
  /^\/api\/hubs\/parent(\/.*)?$/,
  /^\/api\/classroom(\/.*)?$/,
];

function isCapacityRelevantPath(pathname) {
  return CAPACITY_RELEVANT_PATH_PATTERNS.some((re) => re.test(pathname || ''));
}

async function readResponseBytesAndBody(response) {
  if (!response) return { bytes: 0, text: '', contentType: '' };
  const contentType = response.headers.get('content-type') || '';
  // Only non-streaming, JSON-shaped bodies are instrumented — TTS audio
  // and ASSETS passthroughs never get meta.capacity attached (they are
  // not capacity-relevant anyway).
  try {
    const text = await response.clone().text();
    // U3 round 1 (P0 #02): use TextEncoder to measure UTF-8 bytes. Buffer
    // is Node-only and not exposed in Workers without nodejs_compat —
    // which we intentionally do NOT enable (auth.js, http.js, repository.js
    // all use TextEncoder/TextDecoder for consistency).
    return { bytes: measureUtf8Bytes(text), text, contentType };
  } catch {
    return { bytes: 0, text: '', contentType };
  }
}

function attachCapacityToJsonBody(text, capacityJson) {
  try {
    const parsed = JSON.parse(text || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
    const nextMeta = parsed.meta && typeof parsed.meta === 'object' && !Array.isArray(parsed.meta)
      ? { ...parsed.meta, capacity: capacityJson }
      : { capacity: capacityJson };
    return JSON.stringify({ ...parsed, meta: nextMeta });
  } catch {
    return text;
  }
}

function decorateResponse(response, { capacity, attachBody, requestId }) {
  if (!response) return response;
  const headers = new Headers(response.headers);
  if (requestId) headers.set('x-ks2-request-id', requestId);
  if (!attachBody) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  // attachBody path: rebuild the JSON body so meta.capacity lands alongside
  // the original payload. We have already read the body to measure bytes;
  // reuse that text to avoid a second body read.
  return new Response(attachBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createWorkerApp({
  now = Date.now,
  fetchFn = (...args) => fetch(...args),
  subjectRuntime = createWorkerSubjectRuntime(),
} = {}) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);

      // U3: validate incoming x-ks2-request-id ingress; reject non-matching
      // values silently and generate fresh ids so client-log-forging and
      // CRLF-injection attempts cannot reach the structured log or the
      // response headers.
      const validatedRequestId = validateRequestId(request.headers.get('x-ks2-request-id'))
        || generateRequestId();

      const capacityStartedAt = typeof performance?.now === 'function'
        ? performance.now()
        : Date.now();
      const capacity = new CapacityCollector({
        requestId: validatedRequestId,
        endpoint: url.pathname,
        method: request.method,
        startedAt: capacityStartedAt,
      });

      // U3 round 1 (P1 #03): thread the capacity collector through the
      // auth boundary so the production session-lookup query is counted.
      const auth = createSessionAuthBoundary({ env, capacity });

      let response;
      let errorCaught = null;
      const runHandler = async () => {
        if (isPublicSourceLockdownPath(url.pathname)) {
          return publicSourceAssetResponse(request, env);
        }

        if (url.pathname === '/api/health') {
          let databaseStatus = 'missing';
          try {
            requireDatabase(env);
            databaseStatus = 'd1';
          } catch {
            databaseStatus = 'missing';
          }
          return json({
            ok: true,
            name: 'ks2-platform-v2-worker',
            mode: databaseStatus === 'd1' ? 'repository-d1-mvp' : 'repository-missing-db',
            auth: auth.describe(),
            mutationPolicy: {
              version: 1,
              idempotency: 'request-receipts',
              learnerScope: 'compare-and-swap',
              accountScope: 'compare-and-swap',
            },
            now: new Date(now()).toISOString(),
          });
        }

        if (url.pathname === '/api/security/csp-report' && request.method === 'POST') {
          // U7: browser-originated CSP violation receiver. Unauthenticated
          // because the browser sends reports without credentials even
          // when the page itself is authenticated. The `requireSameOrigin`
          // check that default-on in `auth.requireSession()` is bypassed
          // here: browsers stamp CSP reports with `Sec-Fetch-Dest: report`
          // and no Origin on certain UAs. The body cap + rate-limit + IP
          // scoping mitigate abuse.
          return handleCspReportRequest({ request, env, now: now() });
        }

        if (url.pathname === '/api/demo/session' && request.method === 'POST') {
          const currentSession = await auth.getSession(request);
          if (currentSession && !currentSession.demo) {
            return json({
              ok: false,
              code: 'demo_session_conflict',
              message: 'Sign out before starting a demo session.',
            }, 409);
          }
          if (currentSession?.demo) {
            return json(await existingDemoSessionPayload({
              session: currentSession,
              env,
              now,
              capacity,
            }));
          }
          try {
            const result = await createDemoSession({
              env,
              request,
              now: now(),
              capacity,
            });
            return withCookies(json(result.payload, result.status), result.cookies);
          } catch (error) {
            if (error instanceof SessionCreationSuspendedError) {
              // U13: a freshly-created demo account pulled a suspended
              // `ops_status` (operator bulk-suspend during the INSERT race).
              // Return 403 so the client surfaces the suspended banner.
              return json({
                ok: false,
                code: 'account_suspended',
                message: 'Account is suspended. Contact operations.',
              }, 403);
            }
            throw error;
          }
        }

        if (url.pathname === '/demo' && request.method === 'GET') {
          const currentSession = await auth.getSession(request);
          if (currentSession && !currentSession.demo) {
            return redirect(`${url.origin}/`, 302);
          }
          if (currentSession?.demo) {
            return redirect(`${url.origin}/?demo=1`, 302);
          }
          if (isDemoSubresourceRequest(request)) {
            return json({
              ok: false,
              code: 'demo_navigation_required',
              message: 'Open the demo directly to start a session.',
            }, 403);
          }
          try {
            const result = await createDemoSession({
              env,
              request,
              now: now(),
              allowMissingOrigin: true,
              capacity,
            });
            return redirect(`${url.origin}/?demo=1`, 302, result.cookies);
          } catch (error) {
            if (error instanceof SessionCreationSuspendedError) {
              // U13: redirect to canonical suspended-landing URL instead of
              // the `/?demo=1` success path.
              return redirect(`${url.origin}/?auth=account_suspended`, 302);
            }
            throw error;
          }
        }

        if (url.pathname === '/api/session' && request.method === 'GET') {
          return json(await sessionPayload({
            session: await auth.requireSession(request),
            auth,
            env,
            now,
            capacity,
          }));
        }

        if (url.pathname === '/api/auth/session' && request.method === 'GET') {
          return json(await sessionPayload({
            session: await auth.getSession(request),
            auth,
            env,
            now,
            capacity,
          }));
        }

        if (url.pathname === '/api/auth/register' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          try {
            const result = await registerWithEmail(env, request, body);
            return withCookies(json(result.payload, result.status), result.cookies);
          } catch (error) {
            if (error instanceof SessionCreationSuspendedError) {
              // U13: account was marked suspended between credential write and
              // session mint. Return 403 with account_suspended so the
              // app-shell global handler (Phase A U14 router) transitions to
              // the unauthenticated landing with a banner. No cookie issued.
              return json({
                ok: false,
                code: 'account_suspended',
                message: 'Account is suspended. Contact operations.',
              }, 403);
            }
            throw error;
          }
        }

        if (url.pathname === '/api/auth/login' && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          try {
            const result = await loginWithEmail(env, request, body);
            return withCookies(json(result.payload, result.status), result.cookies);
          } catch (error) {
            if (error instanceof SessionCreationSuspendedError) {
              return json({
                ok: false,
                code: 'account_suspended',
                message: 'Account is suspended. Contact operations.',
              }, 403);
            }
            throw error;
          }
        }

        if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
          requireSameOrigin(request, env);
          try {
            await deleteCurrentSession(env, request);
          } finally {
            // U6 (plan KTD F-08): full browsing-state cleanup on logout.
            // Shared school and family devices are an expected deployment
            // context, so we clear cache, cookies, and storage.
            const response = withCookies(json({ ok: true }), [clearSessionCookie(request)]);
            response.headers.set('Clear-Site-Data', '"cache", "cookies", "storage"');
            return response;
          }
        }

        const oauthStart = /^\/api\/auth\/([^/]+)\/start$/.exec(url.pathname);
        if (oauthStart && request.method === 'POST') {
          requireSameOrigin(request, env);
          const body = await readJson(request);
          const result = await startSocialLogin(env, request, oauthStart[1], body);
          return withCookies(json(result.payload, result.status), result.cookies);
        }

        const oauthCallback = /^\/api\/auth\/([^/]+)\/callback$/.exec(url.pathname);
        if (oauthCallback && (request.method === 'GET' || request.method === 'POST')) {
          const payload = request.method === 'POST'
            ? await readForm(request)
            : Object.fromEntries(url.searchParams.entries());
          try {
            const result = await completeSocialLogin(env, request, oauthCallback[1], payload);
            return redirect(`${url.origin}/?auth=success`, 302, result.cookies);
          } catch (error) {
            if (error instanceof SessionCreationSuspendedError) {
              // U13: OAuth completed but the account is suspended. Redirect
              // to the canonical suspended-landing URL so the SPA's global
              // handler can render the unauthenticated shell with a banner.
              // NO cookie set — the user gets no authenticated state.
              return redirect(`${url.origin}/?auth=account_suspended`, 302);
            }
            return callbackErrorRedirect(request, error?.message);
          }
        }

        // Public client-error ingest. Placed BEFORE auth.requireSession per
        // R13/R15: errors in demo, signed-out, or session-expired states must
        // still land. Does NOT call requireSameOrigin — Origin headers are
        // unreliable from error contexts (file://, extensions, mid-navigation).
        // Defence stack per the plan: byte-level body cap (R23), IP rate-
        // limit, server-side redaction, attribution gate.
        if (url.pathname === '/api/ops/error-event' && request.method === 'POST') {
          const nowTs = now();

          // U6 review follow-up (Finding 2): consume the IP rate limit
          // BEFORE reading the request body. Otherwise an attacker can
          // flood the endpoint with 9KB+ bodies; each forces an
          // `arrayBuffer()` read that returns a 400 oversized-body
          // response before the rate-limit bucket is ever touched, so
          // the per-IP abuse counter never increments. With this order,
          // the rate limit is bumped first and 61+ abusive calls from
          // the same IP all collapse to 429.
          //
          // U5 (P1.5 Phase B) closes Finding 6 (deferred): the subject
          // now comes from `rateLimitSubject(request, env)` which
          // collapses every source to a tiered bucket key
          // (v4:<addr> / v6/64:<prefix> / unknown:<reason>). A single
          // attacker on an IPv6 /64 can no longer rotate the low 64
          // bits to evade the per-IP budget.
          //
          // In addition, U5 consumes a route-wide `global:ops-error-capture`
          // bucket (6000 events / 10-minute window) BEFORE the per-IP
          // bucket so a distributed attack across thousands of /64s
          // cannot exhaust the worker. Both buckets must clear for the
          // event to proceed to body-read + repository write.
          // U3 round 1 (P1 #03): route ops-error rate-limit writes through the
          // capacity proxy so bucket-write I/O is counted in telemetry.
          const db = requireDatabaseWithCapacity(env, capacity);
          const subject = rateLimitSubject(request, env, { globalBudgetKey: 'ops-error-capture' });
          const globalBudgetLimit = opsErrorGlobalLimit(env);
          const globalLimit = await consumeRateLimit(db, {
            bucket: 'ops-error-capture-global',
            identifier: subject.globalKey,
            limit: globalBudgetLimit,
            windowMs: OPS_ERROR_GLOBAL_WINDOW_MS,
            now: nowTs,
          });
          if (!globalLimit.allowed) {
            await opsErrorThrottleTelemetry(env, subject, {
              code: 'ops_error_global_budget_exhausted',
              bucketKey: 'ops_error_events.global_budget_exhausted',
              retryAfterSeconds: globalLimit.retryAfterSeconds,
              capacity,
              now,
            });
            // P3 U4: capture rate-limit denial for operator visibility.
            logRequestDenial(db, ctx, {
              denialReason: DENIAL_RATE_LIMIT_EXCEEDED,
              routeName: url.pathname,
              release: env.RELEASE || null,
              detail: { code: 'ops_error_global_budget_exhausted', bucket: 'ops-error-capture-global', retryAfterSeconds: globalLimit.retryAfterSeconds },
              now: nowTs,
            });
            return rateLimitResponse({
              code: 'ops_error_global_budget_exhausted',
              retryAfterSeconds: globalLimit.retryAfterSeconds,
              extra: {
                message: 'Client error ingest is temporarily throttled at the global budget.',
              },
            });
          }

          const rateLimit = await consumeRateLimit(db, {
            bucket: 'ops-error-capture-ip',
            identifier: subject.bucketKey,
            limit: OPS_ERROR_EVENT_RATE_LIMIT,
            windowMs: OPS_ERROR_EVENT_RATE_WINDOW_MS,
            now: nowTs,
          });
          if (!rateLimit.allowed) {
            await opsErrorThrottleTelemetry(env, subject, {
              code: 'ops_error_rate_limited',
              bucketKey: 'ops_error_events.rate_limited',
              retryAfterSeconds: rateLimit.retryAfterSeconds,
              capacity,
              now,
            });
            // P3 U4: capture per-IP rate-limit denial.
            logRequestDenial(db, ctx, {
              denialReason: DENIAL_RATE_LIMIT_EXCEEDED,
              routeName: url.pathname,
              release: env.RELEASE || null,
              detail: { code: 'ops_error_rate_limited', bucket: 'ops-error-capture-ip', retryAfterSeconds: rateLimit.retryAfterSeconds },
              now: nowTs,
            });
            return rateLimitResponse({
              code: 'ops_error_rate_limited',
              retryAfterSeconds: rateLimit.retryAfterSeconds,
              extra: {
                message: 'Too many client error events from this connection.',
              },
            });
          }

          // Rate-limit has cleared — now safe to read the body. Reading the
          // body earlier would let oversized-body 400s short-circuit before
          // the rate-limit bucket ever fires (see Finding 2 comment above).
          let clientEvent;
          try {
            clientEvent = await readJsonBounded(request, OPS_ERROR_EVENT_MAX_BODY_BYTES);
          } catch (error) {
            if (error?.code === 'ops_error_payload_too_large') {
              return json({
                ok: false,
                code: 'ops_error_payload_too_large',
                message: 'Error event payload exceeds the 8KB limit.',
              }, 400);
            }
            throw error;
          }

          // R15-safe attribution: attach account_id ONLY when a real (non-demo)
          // session is present AND the route is not a /demo/ path. Prevents
          // leaking admin-signed-in correlations while they are debugging the
          // demo surface. The session claim alone is not sufficient — the
          // development-stub provider omits `.demo`, so cross-check the DB
          // account_type column to catch demo accounts regardless of how the
          // session was issued.
          let sessionAccountId = null;
          try {
            const maybeSession = await auth.getSession(request);
            if (maybeSession && !maybeSession.demo && maybeSession.accountType !== 'demo') {
              const accountRow = await db.prepare(
                'SELECT account_type FROM adult_accounts WHERE id = ?',
              ).bind(maybeSession.accountId).first();
              const accountType = typeof accountRow?.account_type === 'string'
                ? accountRow.account_type
                : 'real';
              if (accountType !== 'demo') {
                const rawRoute = typeof clientEvent?.routeName === 'string' ? clientEvent.routeName : '';
                if (!rawRoute.startsWith('/demo/')) {
                  sessionAccountId = maybeSession.accountId || null;
                }
              }
            }
          } catch {
            // Anonymous is fine — proceed without attribution.
          }

          const repository = createWorkerRepository({ env, now, capacity });
          try {
            // H2 (reviewer): fresh-insert bucket must be consumed
            // BEFORE `recordClientErrorEvent` writes a new row, not
            // after. Previously, the 11th distinct-fingerprint request
            // wrote its row first, then the bucket rejected — leaving
            // 11 rows persisted for a configured cap of 10. The
            // preflight below uses the same R24 3-tuple dedup lookup
            // that `recordClientErrorEvent` runs internally, so the
            // two agree on "would be a dedup?". A dedup replay
            // (`wouldBeDedup === true`) does NOT consume the bucket
            // because no new row is about to land. Only the genuinely-
            // fresh path consumes, so the table row count for 11
            // distinct fingerprints from a single subject is capped
            // at exactly 10.
            const preflight = await repository.isClientErrorFingerprintKnown({ clientEvent });
            if (preflight.unavailable) {
              return json({
                ok: true,
                eventId: null,
                deduped: false,
                unavailable: true,
              });
            }
            if (!preflight.wouldBeDedup) {
              const freshInsertLimitValue = opsErrorFreshInsertLimit(env);
              const freshInsertLimit = await consumeRateLimit(db, {
                bucket: 'ops-error-fresh-insert',
                identifier: subject.bucketKey,
                limit: freshInsertLimitValue,
                windowMs: OPS_ERROR_FRESH_INSERT_WINDOW_MS,
                now: nowTs,
              });
              if (!freshInsertLimit.allowed) {
                await opsErrorThrottleTelemetry(env, subject, {
                  code: 'ops_error_fresh_insert_throttled',
                  bucketKey: 'ops_error_events.fresh_insert_throttled',
                  retryAfterSeconds: freshInsertLimit.retryAfterSeconds,
                  capacity,
                  now,
                });
                return rateLimitResponse({
                  code: 'ops_error_fresh_insert_throttled',
                  retryAfterSeconds: freshInsertLimit.retryAfterSeconds,
                  extra: {
                    message: 'Too many new error fingerprints from this connection.',
                  },
                });
              }
            }

            const result = await repository.recordClientErrorEvent({
              clientEvent,
              sessionAccountId,
            });
            if (result.unavailable) {
              return json({
                ok: true,
                eventId: null,
                deduped: false,
                unavailable: true,
              });
            }
            // Phase E adv-e-2: when the repository reports that the
            // dedup replay triggered a Phase E auto-reopen, consume a
            // dedicated post-commit rate-limit bucket. An anonymous
            // attacker could otherwise force unlimited resolved→open
            // flips per resolved fingerprint per /64: the dedup-replay
            // path skips the fresh-insert cap because
            // `wouldBeDedup === true`, so without this gate only the
            // 60/10min per-IP and 6000/10min global caps apply — both
            // generous enough to absorb 10+ reopens per hour per
            // subject. This cap is telemetry-only: the DB write already
            // committed, but the KPI counter surfaces the abuse pattern
            // in the admin hub alongside fresh-insert-throttled and
            // rate_limited.
            if (result.autoReopened === true) {
              try {
                const autoReopenLimit = await consumeRateLimit(db, {
                  bucket: 'ops-error-auto-reopen',
                  identifier: subject.bucketKey,
                  limit: opsErrorAutoReopenLimit(env),
                  windowMs: OPS_ERROR_AUTO_REOPEN_WINDOW_MS,
                  now: nowTs,
                });
                if (!autoReopenLimit.allowed) {
                  await opsErrorThrottleTelemetry(env, subject, {
                    code: 'ops_error_auto_reopen_throttled',
                    bucketKey: 'ops_error_events.auto_reopen_throttled',
                    retryAfterSeconds: autoReopenLimit.retryAfterSeconds,
                    capacity,
                    now,
                  });
                }
              } catch {
                // Post-commit telemetry must never fail the ingest — the
                // DB write succeeded, so the client deserves a 200.
              }
            }
            return json({
              ok: true,
              eventId: result.eventId,
              deduped: Boolean(result.deduped),
            });
          } catch (error) {
            // BadRequestError (validation_failed) falls through to errorResponse
            // so the client receives a structured 400.
            throw error;
          }
        }

        const repository = createWorkerRepository({ env, now, capacity });
        const session = await auth.requireSession(request);
        const account = await repository.ensureAccount(session);

        const subjectCommandMatch = /^\/api\/subjects\/([^/]+)\/command$/.exec(url.pathname);
        if (subjectCommandMatch && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const command = normaliseSubjectCommandRequest({
            routeSubjectId: subjectCommandMatch[1],
            body,
            request,
          });
          requireSubjectCommandAvailable(command, env);
          await protectDemoSubjectCommand({
            env,
            request,
            session,
            command,
            now: now(),
            capacity,
          });
          try {
            const result = await repository.runSubjectCommand(
              session.accountId,
              command,
              () => subjectRuntime.dispatch(command, {
                env,
                request,
                session,
                account,
                repository,
                now: now(),
                capacity,
              }),
            );
            return json({
              ok: true,
              ...result,
            });
          } catch (error) {
            // U6: surface a `projection_unavailable` 503 with the validated
            // request id so the client classifier
            // (`isCommandBackendExhausted`) can move the command to pending
            // without transport-retry. Stamp telemetry so operators see the
            // rejected hot-path in structured logs too.
            if (error?.name === 'ProjectionUnavailableError') {
              if (typeof capacity?.setProjectionFallback === 'function') {
                capacity.setProjectionFallback('rejected');
              }
              return json({
                ok: false,
                error: 'projection_unavailable',
                retryable: false,
                requestId: validatedRequestId,
                ...(error.extra && typeof error.extra === 'object' ? { cause: error.extra.cause } : {}),
              }, 503);
            }
            throw error;
          }
        }

        if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
          if (session?.demo) {
            // U3 round 1 (P1 #03): use the capacity-wrapped DB so the
            // demo-active lookup is counted.
            await requireActiveDemoAccount(requireDatabaseWithCapacity(env, capacity), session.accountId, now());
          }
          const usePublic = shouldUsePublicReadModels(request, env);
          // U7: on the public path, upgrade GET to the v2 bounded envelope.
          // Legacy (non-public) callers keep the unrestricted shape for
          // back-compat. `?preferredLearnerId=` echoes the client-side
          // preference precedence.
          const bundle = usePublic
            ? await repository.bootstrapV2Get(session.accountId, {
              publicReadModels: true,
              preferredLearnerId: url.searchParams.get('preferredLearnerId') || null,
            })
            : await repository.bootstrap(session.accountId, {
              publicReadModels: usePublic,
            });
          return json({
            ok: true,
            version: '0.9.0',
            mode: 'repository-d1-mvp',
            auth: auth.describe(),
            session: {
              accountId: session.accountId,
              provider: session.provider,
              platformRole: account?.platform_role || session.platformRole || 'parent',
              accountType: account?.account_type || session.accountType || 'real',
              demo: (account?.account_type || session.accountType) === 'demo',
              demoExpiresAt: Number(account?.demo_expires_at) || session.demoExpiresAt || null,
            },
            mutationPolicy: {
              version: 1,
              strategy: 'account-and-learner-revision-cas',
              idempotency: 'request-receipts',
              merge: 'none',
            },
            subjectExposureGates: subjectExposureGatesFromEnv(env),
            ...bundle,
          });
        }

        // U7: POST /api/bootstrap accepting {lastKnownRevision, preferredLearnerId?}.
        // Returns < 2 KB notModified on hash match; otherwise the full v2
        // bundle. GET remains for back-compat (demo probes, internal
        // callers that cannot mint a POST body).
        if (url.pathname === '/api/bootstrap' && request.method === 'POST') {
          if (session?.demo) {
            await requireActiveDemoAccount(requireDatabaseWithCapacity(env, capacity), session.accountId, now());
          }
          // U7 adv-u7-r1-003: cap the POST body so a 10 KB+ crafted
          // `lastKnownRevision` is rejected before allocation (matches
          // the ops-error ingest pattern).
          let body;
          try {
            body = await readJsonBounded(request, BOOTSTRAP_POST_BODY_LIMIT);
          } catch (error) {
            if (error?.code === 'ops_error_payload_too_large') {
              return json({
                ok: false,
                code: 'ops_error_payload_too_large',
                message: 'Bootstrap body exceeds the 2 KB limit.',
              }, 400);
            }
            throw error;
          }
          const lastKnownRevision = body && typeof body.lastKnownRevision === 'string'
            ? body.lastKnownRevision
            : null;
          const preferredLearnerId = body && typeof body.preferredLearnerId === 'string'
            ? body.preferredLearnerId
            : null;
          const usePublic = shouldUsePublicReadModels(request, env);
          const bundle = await repository.bootstrapV2(session.accountId, {
            publicReadModels: usePublic,
            lastKnownRevision,
            preferredLearnerId,
          });
          if (bundle?.notModified) {
            // U7: notModified body stays tight (< 2 KB). No session
            // rotation, no subject exposure gates — operator tooling
            // reads those from the cached previous response. The
            // `meta.capacity.bootstrapMode: 'not-modified'` stamp is
            // injected by the capacity pipeline (see
            // `attachCapacityToJsonBody`) because `bootstrapV2` called
            // `capacity.setBootstrapMode('not-modified')` above.
            return json({ ...bundle });
          }
          return json({
            ok: true,
            version: '0.9.0',
            mode: 'repository-d1-mvp',
            auth: auth.describe(),
            session: {
              accountId: session.accountId,
              provider: session.provider,
              platformRole: account?.platform_role || session.platformRole || 'parent',
              accountType: account?.account_type || session.accountType || 'real',
              demo: (account?.account_type || session.accountType) === 'demo',
              demoExpiresAt: Number(account?.demo_expires_at) || session.demoExpiresAt || null,
            },
            mutationPolicy: {
              version: 1,
              strategy: 'account-and-learner-revision-cas',
              idempotency: 'request-receipts',
              merge: 'none',
            },
            subjectExposureGates: subjectExposureGatesFromEnv(env),
            ...bundle,
          });
        }

        // U7: GET /api/hubs/parent/summary — compact lazy-loaded digest.
        // No demo access (plan line 744). learnerId query param validated
        // against the caller's writable learner set inside the repo.
        if (url.pathname === '/api/hubs/parent/summary' && request.method === 'GET') {
          if (session?.demo) {
            throw new ForbiddenError('Parent summary is not available for demo sessions.', {
              code: 'parent_summary_demo_refused',
            });
          }
          const learnerId = url.searchParams.get('learnerId') || '';
          const result = await repository.readParentHubSummary(session.accountId, learnerId);
          return json({ ok: true, ...result });
        }

        // U7: GET /api/classroom/learners/summary — paginated at 50 per
        // page. Requires an admin-or-ops platform role (the same role
        // gate used by Admin Hub); demo sessions refused. Classroom
        // certification will layer a narrower role check on top in a
        // later phase — this endpoint is additive and not yet surfaced
        // to parent-only sessions.
        if (url.pathname === '/api/classroom/learners/summary' && request.method === 'GET') {
          if (session?.demo) {
            throw new ForbiddenError('Classroom summary is not available for demo sessions.', {
              code: 'classroom_summary_demo_refused',
            });
          }
          const callerRole = account?.platform_role || session.platformRole || 'parent';
          if (callerRole !== 'admin' && callerRole !== 'ops') {
            throw new ForbiddenError('Classroom summary requires an admin or ops role.', {
              code: 'classroom_summary_role_refused',
            });
          }
          const result = await repository.readClassroomLearnersSummary(session.accountId, {
            cursor: url.searchParams.get('cursor') || null,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/hero/read-model' && request.method === 'GET') {
          return handleHeroReadModel({ request, url, session, account, repository, env, now, capacity });
        }

        if (url.pathname === '/api/hero/command' && request.method === 'POST') {
          if (!envFlagEnabled(env.HERO_MODE_LAUNCH_ENABLED)) {
            throw new NotFoundError('Hero launch is not available.', {
              code: 'hero_launch_disabled',
            });
          }
          if (!envFlagEnabled(env.HERO_MODE_SHADOW_ENABLED)) {
            throw new ConflictError('Hero launch requires shadow mode to be enabled.', {
              code: 'hero_launch_misconfigured',
            });
          }
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const heroLearnerId = body?.learnerId || '';
          await repository.requireLearnerReadAccess(session.accountId, heroLearnerId);
          const { heroLaunch, subjectCommand } = await resolveHeroStartTaskCommand({
            body,
            repository,
            env,
            now: now(),
          });
          requireSubjectCommandAvailable(subjectCommand, env);
          await protectDemoSubjectCommand({
            env,
            request,
            session,
            command: subjectCommand,
            now: now(),
            capacity,
          });
          try {
            const result = await repository.runSubjectCommand(
              session.accountId,
              subjectCommand,
              () => subjectRuntime.dispatch(subjectCommand, {
                env,
                request,
                session,
                account,
                repository,
                now: now(),
                capacity,
              }),
            );
            return json({
              ok: true,
              heroLaunch,
              ...result,
            });
          } catch (error) {
            if (error?.name === 'ProjectionUnavailableError') {
              if (typeof capacity?.setProjectionFallback === 'function') {
                capacity.setProjectionFallback('rejected');
              }
              return json({
                ok: false,
                error: 'projection_unavailable',
                retryable: false,
                requestId: body?.requestId || '',
                ...(error.extra && typeof error.extra === 'object' ? { cause: error.extra.cause } : {}),
              }, 503);
            }
            throw error;
          }
        }

        if (url.pathname === '/api/demo/reset' && request.method === 'POST') {
          requireMutationCapability(session);
          await resetDemoAccount({
            env,
            request,
            session,
            now: now(),
            capacity,
          });
          const bundle = await repository.bootstrap(session.accountId, {
            publicReadModels: shouldUsePublicReadModels(request, env),
          });
          return json({
            ok: true,
            session: {
              accountId: session.accountId,
              provider: session.provider,
              accountType: 'demo',
              demo: true,
              demoExpiresAt: session.demoExpiresAt || null,
            },
            subjectExposureGates: subjectExposureGatesFromEnv(env),
            ...bundle,
          });
        }

        if (url.pathname === '/api/learners/reset-progress' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          requireDemoWriteAllowed(session);
          const body = await readJson(request);
          const result = await repository.resetLearnerRuntime(
            session.accountId,
            body.learnerId,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/tts' && request.method === 'POST') {
          requireMutationCapability(session);
          return await handleTextToSpeechRequest({
            env,
            request,
            session,
            repository,
            now: now(),
            fetchFn,
          });
        }

        if (url.pathname === '/api/content/spelling' && request.method === 'GET') {
          const result = await repository.exportSubjectContent(session.accountId, 'spelling');
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/subjects/spelling/word-bank' && request.method === 'GET') {
          const learnerId = url.searchParams.get('learnerId') || account?.selected_learner_id || '';
          const result = await repository.readSpellingWordBank(session.accountId, learnerId, {
            query: url.searchParams.get('q') || url.searchParams.get('query') || '',
            status: url.searchParams.get('status') || 'all',
            year: url.searchParams.get('year') || 'all',
            page: url.searchParams.get('page') || 1,
            pageSize: url.searchParams.get('pageSize') || 250,
            detailSlug: url.searchParams.get('detailSlug') || '',
          });
          return json({ ok: true, wordBank: result });
        }

        // U9: Punctuation telemetry query surface. Returns events for a
        // learner, optionally filtered by kind and/or since-time. Authz
        // fires inside `repository.readPunctuationEvents` via
        // `requireLearnerReadAccess` so a caller without membership of
        // the requested learner receives a 403.
        if (url.pathname === '/api/subjects/punctuation/events' && request.method === 'GET') {
          const learnerId = url.searchParams.get('learner')
            || url.searchParams.get('learnerId')
            || account?.selected_learner_id
            || '';
          const kind = url.searchParams.get('kind') || null;
          const sinceRaw = url.searchParams.get('since');
          const limitRaw = url.searchParams.get('limit');
          const result = await repository.readPunctuationEvents(session.accountId, learnerId, {
            kind,
            sinceMs: sinceRaw != null ? Number(sinceRaw) : null,
            limit: limitRaw != null ? Number(limitRaw) : null,
          });
          return json({ ok: true, learnerId, ...result });
        }

        if (url.pathname === '/api/hubs/parent/recent-sessions' && request.method === 'GET') {
          await protectDemoParentHubRead({
            env,
            request,
            session,
            now: now(),
            capacity,
          });
          const result = await repository.readParentRecentSessions(session.accountId, {
            learnerId: url.searchParams.get('learnerId') || null,
            limit: url.searchParams.get('limit') || null,
            cursor: url.searchParams.get('cursor') || null,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/hubs/parent/activity' && request.method === 'GET') {
          await protectDemoParentHubRead({
            env,
            request,
            session,
            now: now(),
            capacity,
          });
          const result = await repository.readParentActivity(session.accountId, {
            learnerId: url.searchParams.get('learnerId') || null,
            limit: url.searchParams.get('limit') || null,
            cursor: url.searchParams.get('cursor') || null,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/hubs/parent' && request.method === 'GET') {
          await protectDemoParentHubRead({
            env,
            request,
            session,
            now: now(),
            capacity,
          });
          const learnerId = url.searchParams.get('learnerId') || null;
          const result = await repository.readParentHub(session.accountId, learnerId);
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/hubs/admin' && request.method === 'GET') {
          const result = await repository.readAdminHub(session.accountId, {
            learnerId: url.searchParams.get('learnerId') || null,
            requestId: url.searchParams.get('requestId') || null,
            auditLimit: url.searchParams.get('auditLimit') || 20,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/accounts' && request.method === 'GET') {
          const result = await repository.listAdminAccounts(session.accountId);
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/accounts/role' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          // H3 (Phase C reviewer): forward the client-observed
          // `expectedRepoRevision` CAS pre-image so the repository helper
          // can reject stale role writes with 409 `account_role_stale`.
          // When the client omits the field, the helper falls back to the
          // current on-disk value (transitional safety net for legacy
          // clients; new UI always passes it).
          const result = await repository.updateAdminAccountRole(session.accountId, {
            targetAccountId: body.accountId,
            platformRole: body.platformRole,
            requestId: body.requestId || request.headers.get('x-ks2-request-id') || null,
            correlationId: body.correlationId || request.headers.get('x-ks2-correlation-id') || null,
            expectedRepoRevision: Number.isInteger(body.expectedRepoRevision) ? body.expectedRepoRevision : null,
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/draft' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const result = await repository.saveMonsterVisualConfigDraft(session.accountId, {
            draft: body.draft || body.config,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/publish' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const result = await repository.publishMonsterVisualConfig(session.accountId, {
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/monster-visual-config/restore' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const result = await repository.restoreMonsterVisualConfigVersion(session.accountId, {
            version: body.version,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/ops/kpi' && request.method === 'GET') {
          requireSameOrigin(request, env);
          const result = await repository.readAdminOpsKpi(session.accountId);
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/ops/activity' && request.method === 'GET') {
          requireSameOrigin(request, env);
          const limit = Number(url.searchParams.get('limit')) || undefined;
          const result = await repository.listAdminOpsActivity(session.accountId, { limit });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/admin/ops/error-events' && request.method === 'GET') {
          requireSameOrigin(request, env);
          const status = url.searchParams.get('status') || null;
          const limit = Number(url.searchParams.get('limit')) || undefined;
          // U19: optional filter query params. Each is individually
          // nullable; the repository validates shape + bounds and throws
          // `validation_failed` on malformed input. Empty strings collapse
          // to null so the client can clear a filter without sending the
          // key at all.
          const route = url.searchParams.get('route') || null;
          const kind = url.searchParams.get('kind') || null;
          const lastSeenAfter = url.searchParams.get('lastSeenAfter') || null;
          const lastSeenBefore = url.searchParams.get('lastSeenBefore') || null;
          const release = url.searchParams.get('release') || null;
          const reopenedAfterResolved = url.searchParams.get('reopenedAfterResolved');
          const filter = {
            status,
            route,
            kind,
            lastSeenAfter,
            lastSeenBefore,
            release,
            reopenedAfterResolved: reopenedAfterResolved === 'true' || reopenedAfterResolved === '1',
          };
          const result = await repository.readAdminOpsErrorEvents(session.accountId, { status, limit, filter });
          return json({ ok: true, ...result });
        }

        // PR #188 H1: dedicated narrow GET for the account-ops-metadata panel.
        // Mirrors the three sibling /api/admin/ops/* reads so each of the four
        // admin ops panels can refresh independently (R18 extended to 4 panels).
        if (url.pathname === '/api/admin/ops/accounts-metadata' && request.method === 'GET') {
          requireSameOrigin(request, env);
          const result = await repository.readAdminOpsAccountsMetadata(session.accountId);
          return json({ ok: true, ...result });
        }

        // R31: regex dispatch for parameterised admin ops mutations. Placed
        // AFTER literal /api/admin/accounts and /api/admin/accounts/role so
        // those take priority, and AFTER the four /api/admin/ops/* GET
        // routes above.
        //
        // I3 (Phase C reviewer): a per-session rate limit (60/min) applies
        // to every admin-ops mutation. 60 requests per minute per
        // authenticated session is generous for a legit dashboard
        // (spamming 'save' once per second is still allowed) but stops a
        // runaway loop from saturating the CAS / batch write path. Scope
        // is `admin-ops-mutation` + session.accountId so a dashboard user
        // cannot cross-pollute rate-limit buckets across routes.
        const accountOpsMetadataMatch = /^\/api\/admin\/accounts\/([^/]+)\/ops-metadata$/.exec(url.pathname);
        if (accountOpsMetadataMatch && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const adminMutationLimit = await consumeRateLimit(env, {
            bucket: 'admin-ops-mutation',
            identifier: session.accountId,
            limit: 60,
            windowMs: 60_000,
          });
          if (!adminMutationLimit.allowed) {
            return rateLimitResponse({
              code: 'admin_ops_mutation_rate_limited',
              retryAfterSeconds: adminMutationLimit.retryAfterSeconds,
              extra: {
                message: 'Admin-ops mutations are rate-limited at 60 per minute per session.',
              },
            });
          }
          const targetAccountId = decodeURIComponent(accountOpsMetadataMatch[1]);
          const body = await readJson(request);
          // U8 CAS: forward the client-observed `expectedRowVersion` pre-image
          // so the repository helper can reject stale writes with 409
          // `account_ops_metadata_stale` before the batch is composed.
          const result = await repository.updateAccountOpsMetadata(session.accountId, {
            targetAccountId,
            patch: body?.patch,
            mutation: mutationFromRequest(body, request),
            expectedRowVersion: body?.expectedRowVersion ?? null,
          });
          return json({ ok: true, ...result });
        }

        // U10: admin-only KPI reconciliation. Server recomputes authoritative
        // counts from source tables — client `computedValues` is used for
        // forensic-diff logging only (never trusted for writes). Single-flight
        // lock with CAS-takeover guards against concurrent reconciliations.
        if (url.pathname === '/api/admin/ops/reconcile-kpis' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const reconcileLimit = await consumeRateLimit(env, {
            bucket: 'admin-ops-mutation',
            identifier: session.accountId,
            limit: 60,
            windowMs: 60_000,
          });
          if (!reconcileLimit.allowed) {
            return rateLimitResponse({
              code: 'admin_ops_mutation_rate_limited',
              retryAfterSeconds: reconcileLimit.retryAfterSeconds,
              extra: {
                message: 'Admin-ops mutations are rate-limited at 60 per minute per session.',
              },
            });
          }
          const body = await readJson(request);
          const mutation = mutationFromRequest(body, request);
          const result = await repository.reconcileAdminKpiMetrics(session.accountId, {
            requestId: mutation.requestId,
            correlationId: mutation.correlationId,
            clientComputed: body && typeof body === 'object' && body.computedValues && typeof body.computedValues === 'object'
              ? body.computedValues
              : null,
          });
          return json({ ok: true, ...result });
        }

        const opsErrorEventStatusMatch = /^\/api\/admin\/ops\/error-events\/([^/]+)\/status$/.exec(url.pathname);
        if (opsErrorEventStatusMatch && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const errorStatusLimit = await consumeRateLimit(env, {
            bucket: 'admin-ops-mutation',
            identifier: session.accountId,
            limit: 60,
            windowMs: 60_000,
          });
          if (!errorStatusLimit.allowed) {
            return rateLimitResponse({
              code: 'admin_ops_mutation_rate_limited',
              retryAfterSeconds: errorStatusLimit.retryAfterSeconds,
              extra: {
                message: 'Admin-ops mutations are rate-limited at 60 per minute per session.',
              },
            });
          }
          const eventId = decodeURIComponent(opsErrorEventStatusMatch[1]);
          const body = await readJson(request);
          // U5 review follow-up (Finding 2): forward the optional
          // `expectedPreviousStatus` CAS pre-image from the client so the
          // repository can reject stale dispatches (two admins racing with
          // the same pre-read state) with a 409 before the batch runs.
          const result = await repository.updateOpsErrorEventStatus(session.accountId, {
            eventId,
            status: body?.status,
            expectedPreviousStatus: typeof body?.expectedPreviousStatus === 'string'
              ? body.expectedPreviousStatus
              : null,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        // P2 U3: admin-gated QA seed harness for post-Mega learner states.
        // Routed through the Admin Ops P1 mutation-receipt path (scopeType=
        // 'platform'). `requireSameOrigin` blocks cross-origin POSTs; the
        // receipt header proves the admin session intent — a malicious
        // iframe without the header cannot forge a replay.
        if (url.pathname === '/api/admin/spelling/seed-post-mega' && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          // U3 reviewer follow-up (P2 security, HIGH per plan §U3): 10 req/min
          // per IP. The seed harness is admin-gated, but a compromised admin
          // session should not be able to flood the endpoint (each call
          // overwrites a learner's spelling state). We reuse the shared
          // `consumeRateLimit` helper (via the same `rateLimitSubject` tiered
          // bucket key the ops-error route uses) and return the standard 429
          // response with `Retry-After` when the budget is exhausted.
          const seedDb = requireDatabase(env);
          const seedSubject = rateLimitSubject(request, env);
          const seedLimit = await consumeRateLimit(seedDb, {
            bucket: 'admin-post-mega-seed-ip',
            identifier: seedSubject.bucketKey,
            limit: 10,
            windowMs: 60_000,
            now: Date.now(),
          });
          if (!seedLimit.allowed) {
            return rateLimitResponse({
              code: 'post_mega_seed_rate_limited',
              retryAfterSeconds: seedLimit.retryAfterSeconds,
              extra: {
                message: 'Too many post-Mega seed requests from this connection. Slow down and retry.',
              },
            });
          }
          const body = await readJson(request);
          const result = await repository.seedPostMegaLearnerState(session.accountId, {
            learnerId: typeof body?.learnerId === 'string' ? body.learnerId : '',
            shapeName: typeof body?.shapeName === 'string' ? body.shapeName : '',
            // U3 reviewer follow-up (HIGH correctness): forward `undefined`
            // when the body omits `today` so the repository's ts-derived
            // fallback fires. Passing `null` triggered the `Number(null) === 0`
            // coercion trap before the repository-side guard was fixed.
            today: body?.today == null
              ? undefined
              : (Number.isFinite(Number(body.today)) ? Number(body.today) : null),
            confirmOverwrite: body?.confirmOverwrite === true,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        // U10: Grammar Writing Try admin archive + hard-delete. First
        // admin-scoped subject-data pathway in the repo. The learner
        // subject-command dispatcher at
        // `worker/src/subjects/grammar/commands.js` never inspects role,
        // so these dedicated HTTP routes bypass the command path and
        // invoke the repository's admin helpers directly. The helpers
        // run `requireAdminHubAccess` up-front via
        // `assertAdminHubActor`, so a non-admin session receives a 403
        // `admin_hub_forbidden` before any state is read. The body is
        // parsed only for the `mutation` envelope; the role is derived
        // from the session account, never from any `actor.role` field
        // in the body. `requireSameOrigin` blocks cross-origin POSTs
        // (CSRF floor); the admin role gate does the per-session
        // authorisation.
        const grammarTransferArchiveMatch = /^\/api\/admin\/learners\/([^/]+)\/grammar\/transfer-evidence\/([^/]+)\/archive$/
          .exec(url.pathname);
        if (grammarTransferArchiveMatch && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          // U10 follower (MEDIUM): rate-limit the admin archive route at
          // 60/min per session, matching the sibling admin-ops mutations
          // (lines 1285-1312). Same `admin-ops-mutation` bucket — both
          // routes are admin-gated destructive mutations, so sharing the
          // bucket gives a single spam floor across the hub.
          const grammarArchiveLimit = await consumeRateLimit(env, {
            bucket: 'admin-ops-mutation',
            identifier: session.accountId,
            limit: 60,
            windowMs: 60_000,
          });
          if (!grammarArchiveLimit.allowed) {
            return rateLimitResponse({
              code: 'admin_ops_mutation_rate_limited',
              retryAfterSeconds: grammarArchiveLimit.retryAfterSeconds,
              extra: {
                message: 'Admin-ops mutations are rate-limited at 60 per minute per session.',
              },
            });
          }
          const learnerId = decodeURIComponent(grammarTransferArchiveMatch[1]);
          const promptId = decodeURIComponent(grammarTransferArchiveMatch[2]);
          const body = await readJson(request);
          const result = await repository.archiveGrammarTransferEvidence(session.accountId, {
            learnerId,
            promptId,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }
        const grammarTransferDeleteMatch = /^\/api\/admin\/learners\/([^/]+)\/grammar\/transfer-evidence\/([^/]+)\/delete$/
          .exec(url.pathname);
        if (grammarTransferDeleteMatch && request.method === 'POST') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          // U10 follower (MEDIUM): mirror the archive route limiter — 60
          // per minute per session, same `admin-ops-mutation` bucket.
          const grammarDeleteLimit = await consumeRateLimit(env, {
            bucket: 'admin-ops-mutation',
            identifier: session.accountId,
            limit: 60,
            windowMs: 60_000,
          });
          if (!grammarDeleteLimit.allowed) {
            return rateLimitResponse({
              code: 'admin_ops_mutation_rate_limited',
              retryAfterSeconds: grammarDeleteLimit.retryAfterSeconds,
              extra: {
                message: 'Admin-ops mutations are rate-limited at 60 per minute per session.',
              },
            });
          }
          const learnerId = decodeURIComponent(grammarTransferDeleteMatch[1]);
          const promptId = decodeURIComponent(grammarTransferDeleteMatch[2]);
          const body = await readJson(request);
          const result = await repository.deleteGrammarTransferEvidence(session.accountId, {
            learnerId,
            promptId,
            mutation: mutationFromRequest(body, request),
          });
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/content/spelling' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          const body = await readJson(request);
          const result = await repository.writeSubjectContent(
            session.accountId,
            'spelling',
            body.content,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/learners' && request.method === 'PUT') {
          requireSameOrigin(request, env);
          requireMutationCapability(session);
          requireDemoWriteAllowed(session);
          const body = await readJson(request);
          const result = await repository.writeLearners(session.accountId, body.learners, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-subject-state' && request.method === 'PUT') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writeSubjectState(
            session.accountId,
            body.learnerId,
            body.subjectId,
            body.record,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-subject-state' && request.method === 'DELETE') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearSubjectState(
            session.accountId,
            body.learnerId,
            body.subjectId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/practice-sessions' && request.method === 'PUT') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writePracticeSession(session.accountId, body.record || {}, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/practice-sessions' && request.method === 'DELETE') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearPracticeSessions(
            session.accountId,
            body.learnerId,
            body.subjectId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-game-state' && request.method === 'PUT') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.writeGameState(
            session.accountId,
            body.learnerId,
            body.systemId,
            body.state,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/child-game-state' && request.method === 'DELETE') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearGameState(
            session.accountId,
            body.learnerId,
            body.systemId || null,
            mutationFromRequest(body, request),
          );
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/event-log' && request.method === 'POST') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.appendEvent(session.accountId, body.event, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/event-log' && request.method === 'DELETE') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.clearEventLog(session.accountId, body.learnerId, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (url.pathname === '/api/debug/reset' && request.method === 'POST') {
          requireMutationCapability(session);
          requireLegacyRuntimeWriteAllowed(session, env);
          const body = await readJson(request);
          const result = await repository.resetAccountScope(session.accountId, mutationFromRequest(body, request));
          return json({ ok: true, ...result });
        }

        if (env.ASSETS && request.method === 'GET') {
          return env.ASSETS.fetch(request);
        }

        return json({ ok: false, message: 'Not found.' }, 404);
      };

      try {
        response = await runHandler();
      } catch (error) {
        errorCaught = error;
        response = errorResponse(error);

        // P3 U4: capture auth-boundary denials as structured events in
        // `admin_request_denials`. Fire-and-forget via ctx.waitUntil —
        // the 403/401 response is never blocked by the INSERT.
        try {
          const db = env?.DB && typeof env.DB.prepare === 'function' ? env.DB : null;
          if (db) {
            const denialSession = error?.__denialSession || null;
            if (error instanceof AccountSuspendedError) {
              logRequestDenial(db, ctx, {
                denialReason: 'account_suspended',
                routeName: url.pathname,
                accountId: denialSession?.accountId || null,
                sessionId: denialSession?.sessionId || null,
                isDemo: Boolean(denialSession?.demo),
                release: env.RELEASE || null,
                detail: { code: 'account_suspended', opsStatus: 'suspended' },
                now: now(),
              });
            } else if (error instanceof AccountPaymentHoldError) {
              logRequestDenial(db, ctx, {
                denialReason: 'payment_hold',
                routeName: url.pathname,
                accountId: denialSession?.accountId || null,
                sessionId: denialSession?.sessionId || null,
                isDemo: Boolean(denialSession?.demo),
                release: env.RELEASE || null,
                detail: { code: 'account_payment_hold', opsStatus: 'payment_hold' },
                now: now(),
              });
            } else if (error instanceof SessionInvalidatedError) {
              logRequestDenial(db, ctx, {
                denialReason: 'session_invalidated',
                routeName: url.pathname,
                release: env.RELEASE || null,
                detail: { code: 'session_invalidated' },
                now: now(),
              });
            } else if (error instanceof ForbiddenError && error?.extra?.code === 'same_origin_required') {
              logRequestDenial(db, ctx, {
                denialReason: 'csrf_rejection',
                routeName: url.pathname,
                release: env.RELEASE || null,
                detail: { code: 'same_origin_required' },
                now: now(),
              });
            }
          }
        } catch {
          // Denial logging is best-effort — never block the response.
        }
      }

      // U3: capacity telemetry emit. All paths land here — including
      // unauthenticated pre-route 401s from auth.requireSession() thrown
      // before any route matched. That path is marked `phase: 'pre-route'`
      // so operators can distinguish it from a handled 401 further down
      // the pipeline. meta.capacity is NEVER attached to pre-route 401s
      // (the body is a terse auth-failure payload; adding capacity would
      // fan out PII attack surface on unauthenticated responses).
      return finaliseTelemetry({
        response,
        errorCaught,
        url,
        capacity,
        capacityStartedAt,
        validatedRequestId,
        env,
      });
    },
  };
}

async function finaliseTelemetry({
  response,
  errorCaught,
  url,
  capacity,
  capacityStartedAt,
  validatedRequestId,
  env,
}) {
  const wallMs = typeof performance?.now === 'function'
    ? Math.max(0, performance.now() - capacityStartedAt)
    : 0;
  const outgoing = response || new Response(JSON.stringify({ ok: false, message: 'No response produced.' }), {
    status: 500,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

  // Detect pre-route 401 (no handler matched before auth.requireSession
  // threw). An UnauthenticatedError raised by `auth.requireSession(request)`
  // flows through `errorResponse()` as a 401 with `code: 'unauthenticated'`.
  // Because the auth boundary is the first guarded call before any route
  // handler, we can flag the whole 401 surface as pre-route for operators.
  const isPreRouteAuthFail = Boolean(
    errorCaught
    && outgoing.status === 401
    && String(errorCaught?.extra?.code || errorCaught?.code || '') === 'unauthenticated',
  );

  const capacityRelevant = !isPreRouteAuthFail && isCapacityRelevantPath(url.pathname);
  const contentType = outgoing.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let attachText = null;
  let responseBytes = 0;

  if (isJson) {
    const { bytes, text } = await readResponseBytesAndBody(outgoing);
    responseBytes = bytes;
    if (capacityRelevant) {
      // Render meta.capacity only on JSON responses for capacity-relevant
      // endpoints — not on 4xx/5xx error envelopes (body still flows
      // untouched; downstream middleware still sees the error shape).
      if (outgoing.status >= 200 && outgoing.status < 400) {
        capacity.setFinal({
          wallMs,
          responseBytes: bytes,
          status: outgoing.status,
        });
        const publicJson = capacity.toPublicJSON();
        const rewritten = attachCapacityToJsonBody(text, publicJson);
        attachText = rewritten;
        responseBytes = measureUtf8Bytes(rewritten);
      } else {
        attachText = text;
      }
    } else {
      attachText = text;
    }
  }

  capacity.setFinal({
    wallMs,
    responseBytes,
    status: outgoing.status,
    phase: isPreRouteAuthFail ? 'pre-route' : null,
  });

  capacityRequest(capacity, { env });

  return decorateResponse(outgoing, {
    capacity,
    attachBody: attachText,
    requestId: validatedRequestId,
  });
}
