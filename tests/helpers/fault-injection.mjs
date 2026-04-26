// U9 (sys-hardening p1): HTTP fault-injection for Playwright chaos scenes.
//
// This module is TEST-ONLY. It MUST NEVER be imported from production
// client or Worker code. The exported symbol name
// `__ks2_injectFault_TESTS_ONLY__` is added to `FORBIDDEN_TEXT` in
// both `scripts/audit-client-bundle.mjs` and
// `scripts/production-bundle-audit.mjs` so any accidental import
// into a shipped bundle fails the audit (security F-11 prompt).
//
// Shape of a fault plan (see `parseFaultPlan()`):
//
//   { kind: string, pathPattern: string, once: boolean }
//
// - `kind`: one of `FAULT_KINDS`.
// - `pathPattern`: regex source OR a simple literal substring; a
//   request whose URL pathname matches triggers the fault.
// - `once`: when true, the fault fires once then is consumed.
//
// Transport: the test scene base64-encodes the JSON plan and either
// (a) appends it as a `?__ks2_fault=<b64>` query param on the page URL
// for Playwright to attach to every request via `page.route()`, or
// (b) sends an `x-ks2-fault-plan` header that the browser-app-server
// middleware consumes.
//
// The middleware is default-OFF. See
// `tests/helpers/browser-app-server.js` — the fault-injection hook
// only activates when the explicit header `x-ks2-fault-opt-in: 1` is
// set on the request AND a plan is attached via header or query
// param. Playwright webServer processes inherit env from the parent,
// but relying on that alone is fragile across CI matrices, so we opt
// for a per-request header contract instead (documented in the plan).
//
// All functions in this module are pure (no I/O, no globals).

const FAULT_KINDS = Object.freeze([
  '401-unauth',
  '403-forbidden',
  '409-stale-write',
  '409-idempotency-reuse',
  '429-rate-limited',
  '500-server-error',
  'timeout',
  'malformed-json',
  'slow-tts',
  'offline',
]);

const PLAN_QUERY_PARAM = '__ks2_fault';
const PLAN_HEADER = 'x-ks2-fault-plan';
const OPT_IN_HEADER = 'x-ks2-fault-opt-in';
const OPT_IN_VALUE = '1';
// U9 follow-up (review blocker-2): `once: true` requires across-request
// memory on the server process. Scenes may ship a deterministic `planId`
// so the middleware can tally consumption per plan without guessing.
// When absent, the middleware falls back to a hash of kind + pathPattern.
const PLAN_ID_HEADER = 'x-ks2-fault-plan-id';

/**
 * Decode a base64-encoded JSON plan into a shape we validate before
 * returning. Invalid plans return `null` rather than throwing, so a
 * malformed query string never degrades the test server.
 */
function decodePlan(encoded) {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    const kind = String(parsed.kind || '').trim();
    if (!FAULT_KINDS.includes(kind)) return null;
    const pathPattern = typeof parsed.pathPattern === 'string' ? parsed.pathPattern : '';
    if (!pathPattern) return null;
    const planId = typeof parsed.planId === 'string' && parsed.planId ? parsed.planId : '';
    return {
      kind,
      pathPattern,
      once: Boolean(parsed.once),
      planId,
    };
  } catch {
    return null;
  }
}

/**
 * Encode a plan object into a base64-JSON string. Used by the
 * Playwright scene when composing URLs and headers.
 */
function encodePlan(plan) {
  const canonical = {
    kind: plan?.kind,
    pathPattern: plan?.pathPattern,
    once: Boolean(plan?.once),
  };
  if (typeof plan?.planId === 'string' && plan.planId) {
    canonical.planId = plan.planId;
  }
  return Buffer.from(JSON.stringify(canonical), 'utf8').toString('base64');
}

/**
 * Compute a deterministic identifier for a plan. When the scene does
 * not supply one, derive it from `kind + pathPattern`. The stability
 * lets the middleware tally consumption deterministically per plan.
 */
function planIdentity(plan) {
  if (!plan) return '';
  if (typeof plan.planId === 'string' && plan.planId) return plan.planId;
  return `${plan.kind}|${plan.pathPattern}`;
}

/**
 * Match a pathname against the stored pattern. We accept both a plain
 * substring and a `/regex/` form — tests choose whichever is clearer.
 */
function pathMatches(pathname, pattern) {
  if (!pattern) return false;
  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
    try {
      const body = pattern.slice(1, -1);
      const re = new RegExp(body);
      return re.test(pathname);
    } catch {
      return false;
    }
  }
  return pathname.includes(pattern);
}

/**
 * Parse a fault plan from an incoming request. Accepts either a
 * Node `http.IncomingMessage`-shaped `{ url, headers }` object OR a
 * plain `{ url, headers }` literal. The opt-in header MUST be set
 * to `'1'` or the plan is ignored (default-off contract).
 *
 * Returns the plan object or `null`.
 */
function parseFaultPlan(request) {
  if (!request) return null;
  const headers = request.headers || {};
  const optIn = headers[OPT_IN_HEADER] || headers[OPT_IN_HEADER.toLowerCase()];
  if (optIn !== OPT_IN_VALUE) return null;

  const headerPlan = headers[PLAN_HEADER] || headers[PLAN_HEADER.toLowerCase()];
  if (headerPlan) {
    const decoded = decodePlan(String(headerPlan));
    if (decoded) return decoded;
  }

  const rawUrl = typeof request.url === 'string' ? request.url : '';
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, 'http://127.0.0.1');
    const queryPlan = parsed.searchParams.get(PLAN_QUERY_PARAM);
    if (queryPlan) return decodePlan(queryPlan);
  } catch {
    return null;
  }
  return null;
}

/**
 * Apply a parsed fault to a forwarding context. The middleware is
 * expected to call this BEFORE it dispatches to the Worker, and to
 * honour the returned `action`:
 *
 *   - action: 'respond'   -> send the synthesised `status` / `body`
 *                            / `headers` back to the client.
 *   - action: 'delay'     -> sleep `delayMs` and then continue to the
 *                            real dispatcher.
 *   - action: 'forward'   -> no fault applies, forward as normal.
 *
 * The function is pure — the caller owns actually performing the
 * delay or sending the response. This keeps the module testable
 * without a live HTTP socket.
 */
function applyFault(plan, request) {
  if (!plan) return { action: 'forward' };
  const pathname = extractPathname(request);
  if (!pathMatches(pathname, plan.pathPattern)) return { action: 'forward' };

  switch (plan.kind) {
    case '401-unauth':
      return respondJson(401, { ok: false, error: 'unauthenticated', code: 'auth_required' });
    case '403-forbidden':
      return respondJson(403, { ok: false, error: 'forbidden', code: 'access_denied' });
    case '409-stale-write':
      return respondJson(409, {
        ok: false,
        error: 'stale revision',
        code: 'stale_write',
        expectedRevision: 1,
        currentRevision: 2,
      });
    case '409-idempotency-reuse':
      return respondJson(409, {
        ok: false,
        error: 'idempotency request id reuse',
        code: 'idempotency_reuse',
      });
    case '429-rate-limited':
      return {
        action: 'respond',
        status: 429,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'retry-after': '1',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'rate limited', code: 'rate_limited' }),
      };
    case '500-server-error':
      return respondJson(500, { ok: false, error: 'internal server error', code: 'internal_error' });
    case 'timeout':
      // 408 stand-in — a real socket timeout is not reproducible inline.
      return respondJson(408, { ok: false, error: 'request timeout', code: 'timeout' });
    case 'malformed-json':
      return {
        action: 'respond',
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        // Intentionally broken JSON: the client adapter should
        // surface a decode error rather than crash.
        body: '{"ok": true, "learners": [',
      };
    case 'slow-tts':
      return { action: 'delay', delayMs: 1500 };
    case 'offline':
      return {
        action: 'respond',
        status: 503,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'offline', code: 'offline' }),
      };
    default:
      return { action: 'forward' };
  }
}

function respondJson(status, body) {
  return {
    action: 'respond',
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function extractPathname(request) {
  if (!request) return '';
  if (typeof request.pathname === 'string') return request.pathname;
  const rawUrl = typeof request.url === 'string' ? request.url : '';
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl, 'http://127.0.0.1').pathname;
  } catch {
    return '';
  }
}

/**
 * Create a per-process consumption registry for `once: true` plans.
 *
 * `applyFault()` itself stays pure — it reports whether a fault
 * WOULD fire. The registry wraps the pure function and enforces the
 * "once" contract by recording the first time a given plan identity
 * is consumed and short-circuiting any subsequent match.
 *
 * Scope: per server process. A fresh process restart clears all
 * consumption records, which matches how chaos scenes spin up a
 * dedicated test server per Playwright run.
 */
function createFaultRegistry() {
  const consumed = new Set();

  return Object.freeze({
    /**
     * Probe a request against a plan. Returns the same decision object
     * `applyFault()` produces. For `once: true` plans, each plan
     * identity may only fire once — subsequent matches return
     * `{ action: 'forward' }` so the real dispatcher handles them.
     */
    decide(plan, request) {
      if (!plan) return { action: 'forward' };
      if (plan.once) {
        const identity = planIdentity(plan);
        if (identity && consumed.has(identity)) {
          return { action: 'forward' };
        }
        const pathname = extractPathname(request);
        if (pathMatches(pathname, plan.pathPattern)) {
          if (identity) consumed.add(identity);
        }
      }
      return applyFault(plan, request);
    },
    /**
     * Clear all consumption records. Exposed for unit tests that
     * need to re-run the `once: true` path without recreating the
     * registry.
     */
    reset() {
      consumed.clear();
    },
    /** Number of plan identities that have been consumed. */
    get size() {
      return consumed.size;
    },
  });
}

/**
 * Defense-in-depth env gate. The per-request header opt-in is the
 * primary safety, but we also refuse to honour any fault plan unless
 * the host process is demonstrably a test harness. Production builds
 * never set any of these — accidental leakage lands every fault into
 * a no-op `forward` even if the header somehow survived.
 *
 * We read the ambient `process.env` at call time (not at module load)
 * so tests that flip env vars mid-run take effect immediately.
 */
function isFaultInjectionAllowed(env = (typeof process !== 'undefined' ? process.env : {}) || {}) {
  return (
    env.NODE_ENV === 'test'
    || env.NODE_TEST_CONTEXT === 'child'
    || env.PLAYWRIGHT_TEST === '1'
    || env.KS2_TEST_HARNESS === '1'
  );
}

/**
 * Uniquely-named named export. The production bundle audit
 * (`scripts/audit-client-bundle.mjs` + `scripts/production-bundle-audit.mjs`)
 * forbids this token, so any accidental import of this module into a
 * shipped bundle fails the audit.
 */
export const __ks2_injectFault_TESTS_ONLY__ = Object.freeze({
  FAULT_KINDS,
  PLAN_QUERY_PARAM,
  PLAN_HEADER,
  PLAN_ID_HEADER,
  OPT_IN_HEADER,
  OPT_IN_VALUE,
  parseFaultPlan,
  applyFault,
  encodePlan,
  decodePlan,
  planIdentity,
  createFaultRegistry,
  isFaultInjectionAllowed,
});
