// U4 (sys-hardening p1): request-local capacity telemetry for Worker routes.
//
// Emits a single structured `[ks2-capacity]` JSON log line per sampled
// request so capacity incidents can be attributed to CPU, D1 rows, payload
// size, queueing, or failure category without having to reconstruct the
// request shape from free-form log archaeology.
//
// Redaction contract (plan KTD):
//   - Bounded metadata only: endpoint, route, method, status, wallTimeMs,
//     responseBytes, boundedCounts (session / event counts), D1 row metrics,
//     failureCategory, requestId. NEVER answer-bearing payloads, private
//     spelling prompts, cookies, or child-identifying content.
//   - The redaction invariant is structural (the collector cannot see any
//     body payload; only the response bytes count is recorded) and enforced
//     by `tests/worker-capacity-telemetry.test.js` via a full
//     bootstrap + subject-command + hub-read pass scanned for forbidden
//     tokens.
//
// Sampling (plan KTD Feasibility Claim 7):
//   - Happy-path rows (`failureCategory === 'ok'`) emit at 10 %.
//   - Failure rows (`failureCategory !== 'ok'`) bypass sampling and emit at
//     100 %.
//   - `head_sampling_rate: 1` in wrangler.jsonc remains enabled — that is a
//     Cloudflare-observability-level knob, orthogonal to this
//     emission-level filter.

const CAPACITY_TELEMETRY_COLLECTOR_KEY = '__ks2CapacityCollector';

// Exported so tests can stub to 1 (always emit) or 0 (never emit ok rows).
// Production keeps the 10 % sampler. Scaling up happens only after a week of
// production data shows quota headroom.
export const CAPACITY_TELEMETRY_SAMPLE_RATE = 0.1;

export const CAPACITY_FAILURE_CATEGORIES = Object.freeze([
  'ok',
  'exceededCpu',
  'd1Overloaded',
  'd1DailyLimit',
  'staleWrite',
  'idempotencyReuse',
  'authFailure',
  'rateLimited',
  'redactionFailure',
  'server5xx',
  'badRequest',
  'notFound',
  'backendUnavailable',
]);

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function nowTimerFn() {
  // `performance.now()` exists in Workers and in Node 18+; fall back to
  // `Date.now()` so the module remains usable under unusual test runners.
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

function sanitiseEndpoint(urlPathname) {
  if (typeof urlPathname !== 'string' || !urlPathname) return '/';
  // Drop query string defensively so a malformed caller cannot include a
  // learner name or UUID in the telemetry endpoint field. Path-only.
  const queryIndex = urlPathname.indexOf('?');
  const pathname = queryIndex >= 0 ? urlPathname.slice(0, queryIndex) : urlPathname;
  return pathname.length > 256 ? pathname.slice(0, 256) : pathname;
}

// Route-template resolution — collapse dynamic segments so telemetry
// aggregates cleanly. Keep this list explicit; do NOT regex-derive a
// route key from the path, otherwise renamed or versioned routes would
// quietly fragment dashboards.
const ROUTE_TEMPLATES = Object.freeze([
  { pattern: /^\/api\/subjects\/[^/]+\/command$/, template: '/api/subjects/:subjectId/command' },
  { pattern: /^\/api\/admin\/accounts\/[^/]+\/ops-metadata$/, template: '/api/admin/accounts/:accountId/ops-metadata' },
  { pattern: /^\/api\/admin\/ops\/error-events\/[^/]+\/status$/, template: '/api/admin/ops/error-events/:eventId/status' },
  { pattern: /^\/api\/auth\/[^/]+\/start$/, template: '/api/auth/:provider/start' },
  { pattern: /^\/api\/auth\/[^/]+\/callback$/, template: '/api/auth/:provider/callback' },
]);

export function resolveRouteTemplate(pathname) {
  const safe = sanitiseEndpoint(pathname);
  for (const entry of ROUTE_TEMPLATES) {
    if (entry.pattern.test(safe)) return entry.template;
  }
  return safe;
}

export function routeKey(method, pathname) {
  const verb = typeof method === 'string' && method ? method.toUpperCase() : 'GET';
  return `${verb} ${resolveRouteTemplate(pathname)}`;
}

// Map raw HTTP/error shape to the canonical failure taxonomy. The taxonomy
// mirrors `scripts/classroom-load-test.mjs::signalFor` so operators can
// pivot between load-test output and Worker logs without re-mapping names.
export function categoriseFailure({ status, error } = {}) {
  const numericStatus = toFiniteNumber(status);
  const code = typeof error?.extra?.code === 'string' ? error.extra.code : '';
  const message = String(error?.message || '').toLowerCase();

  if (numericStatus === 1102 || code === 'exceeded_cpu' || /exceeded[_\s-]?cpu|cpu limit|worker cpu|error\s*1102/.test(message)) {
    return 'exceededCpu';
  }
  if (code === 'd1_overloaded' || /d1.*overloaded|overloaded/.test(message)) {
    return 'd1Overloaded';
  }
  if (code === 'd1_daily_limit' || /daily.*limit|rows.*limit|quota/.test(message)) {
    return 'd1DailyLimit';
  }
  if (code === 'stale_write') return 'staleWrite';
  if (code === 'idempotency_reuse') return 'idempotencyReuse';
  if (code === 'redaction_failure') return 'redactionFailure';
  if (numericStatus === 401 || numericStatus === 403
    || code === 'unauthenticated' || code === 'forbidden') {
    return 'authFailure';
  }
  if (numericStatus === 429 || code === 'ops_error_rate_limited') return 'rateLimited';
  if (numericStatus === 400 || code === 'bad_request') return 'badRequest';
  if (numericStatus === 404 || code === 'not_found') return 'notFound';
  if (numericStatus === 503 || code === 'backend_unavailable') return 'backendUnavailable';
  if (numericStatus >= 500 && numericStatus < 600) return 'server5xx';
  if (numericStatus >= 200 && numericStatus < 400) return 'ok';
  return 'ok';
}

// Request-ID generation. Prefer an upstream-supplied Cloudflare ray header
// so ops can cross-reference the Worker log with `cf-ray`; fall back to a
// short random ID for local and test runs.
export function resolveRequestId(request) {
  const header = request?.headers?.get?.('cf-ray')
    || request?.headers?.get?.('x-ks2-request-id')
    || '';
  if (typeof header === 'string' && header) {
    const trimmed = header.trim();
    if (trimmed) return `ks2-req-${trimmed.slice(0, 64)}`;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36).slice(-6);
  return `ks2-req-${ts}${rand}`;
}

// Per-request collector. Lives on the cloned env as `__ks2CapacityCollector`
// so every helper that already receives `env` (requireDatabase, d1.js
// helpers, repository.js, auth boundary) can observe the collector without a
// second plumbing channel. The collector itself is a plain object with a
// small mutator surface — no classes, no inheritance, no hidden state.
export function createCapacityCollector({
  request,
  now = Date.now,
  timer = nowTimerFn(),
  random = Math.random,
  sampleRate = CAPACITY_TELEMETRY_SAMPLE_RATE,
} = {}) {
  const url = request ? (() => {
    try { return new URL(request.url); } catch { return null; }
  })() : null;
  const method = typeof request?.method === 'string' ? request.method.toUpperCase() : 'GET';
  const startedAt = typeof timer === 'function' ? timer() : 0;
  const state = {
    requestId: resolveRequestId(request),
    method,
    endpoint: url ? sanitiseEndpoint(url.pathname) : '/',
    route: url ? routeKey(method, url.pathname) : `${method} /`,
    status: 0,
    wallTimeMs: 0,
    responseBytes: 0,
    boundedCounts: {},
    d1: {
      queryCount: 0,
      rowsRead: 0,
      rowsWritten: 0,
    },
    failureCategory: 'ok',
    startedAt,
    now,
    timer,
    random,
    sampleRate,
  };

  return {
    get requestId() { return state.requestId; },
    setStatus(value) {
      state.status = toFiniteNumber(value);
    },
    setEndpoint(path) {
      const safe = sanitiseEndpoint(path);
      state.endpoint = safe;
      state.route = routeKey(state.method, safe);
    },
    setResponseBytes(bytes) {
      state.responseBytes = Math.max(0, toFiniteNumber(bytes));
    },
    setBoundedCount(name, value) {
      if (typeof name !== 'string' || !name) return;
      const numeric = toFiniteNumber(value);
      if (numeric < 0) return;
      // Whitelist bounded-count keys. Any unexpected key is silently
      // dropped — we never want a caller's free-form payload leaking
      // into the telemetry surface.
      const ALLOWED = ['sessions', 'events', 'learners', 'items'];
      if (!ALLOWED.includes(name)) return;
      state.boundedCounts[name] = Math.floor(numeric);
    },
    setFailureCategory(category) {
      if (typeof category !== 'string') return;
      if (!CAPACITY_FAILURE_CATEGORIES.includes(category)) return;
      state.failureCategory = category;
    },
    recordD1Query({ rowsRead = 0, rowsWritten = 0 } = {}) {
      state.d1.queryCount += 1;
      state.d1.rowsRead += Math.max(0, toFiniteNumber(rowsRead));
      state.d1.rowsWritten += Math.max(0, toFiniteNumber(rowsWritten));
    },
    finalise({ status, error } = {}) {
      if (status !== undefined) state.status = toFiniteNumber(status);
      if (error) {
        // Don't overwrite an explicit successful category, but do upgrade
        // a pending 'ok' to the resolved category when an error is known.
        const resolved = categoriseFailure({ status: state.status, error });
        if (resolved !== 'ok' || state.failureCategory === 'ok') {
          state.failureCategory = resolved;
        }
      } else if (state.failureCategory === 'ok') {
        state.failureCategory = categoriseFailure({ status: state.status });
      }
      const endedAt = typeof state.timer === 'function' ? state.timer() : state.startedAt;
      state.wallTimeMs = Math.max(0, Number((endedAt - state.startedAt).toFixed(3)));
    },
    snapshot() {
      return {
        endpoint: state.endpoint,
        route: state.route,
        method: state.method,
        status: state.status,
        wallTimeMs: state.wallTimeMs,
        responseBytes: state.responseBytes,
        boundedCounts: { ...state.boundedCounts },
        d1: { ...state.d1 },
        failureCategory: state.failureCategory,
        requestId: state.requestId,
      };
    },
    shouldEmit() {
      if (state.failureCategory !== 'ok') return true;
      const rate = Number.isFinite(Number(state.sampleRate)) ? Number(state.sampleRate) : 0;
      if (rate >= 1) return true;
      if (rate <= 0) return false;
      const rnd = typeof state.random === 'function' ? state.random() : 1;
      return rnd < rate;
    },
  };
}

// Attach collector to a shallow-clone env so every downstream helper that
// receives `env` (requireDatabase, repository factories, auth, demo) can
// observe the collector without a second plumbing path. Cloning is
// essential — mutating the caller's `env` would leak collectors between
// concurrent Worker requests.
export function attachCollectorToEnv(env, collector) {
  const clone = { ...(env || {}) };
  clone[CAPACITY_TELEMETRY_COLLECTOR_KEY] = collector;
  return clone;
}

export function readCollectorFromEnv(env) {
  if (!env || typeof env !== 'object') return null;
  const collector = env[CAPACITY_TELEMETRY_COLLECTOR_KEY];
  return collector && typeof collector.recordD1Query === 'function' ? collector : null;
}

// Emit the capacity telemetry line. JSON-stringify is guarded so a cyclic
// or exotic object cannot crash the Worker response — if emission fails we
// log a narrow `[ks2-capacity-telemetry-error]` counter instead so the
// outage is still discoverable without blowing up user traffic.
export function emitCapacityTelemetry(collector, {
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!collector || typeof collector.snapshot !== 'function') return false;
  try {
    if (!collector.shouldEmit()) return false;
    const payload = collector.snapshot();
    const line = `[ks2-capacity] ${JSON.stringify(payload)}`;
    if (typeof log === 'function') log(line);
    return true;
  } catch (error) {
    try {
      const errLine = `[ks2-capacity-telemetry-error] ${JSON.stringify({
        message: error?.message || 'emit_failed',
        requestId: collector.requestId || null,
      })}`;
      if (typeof warn === 'function') warn(errLine);
      else if (typeof log === 'function') log(errLine);
    } catch {
      // Absolute last-ditch — never let telemetry re-enter user response path.
    }
    return false;
  }
}

// Byte-count helper used by the app to resolve responseBytes without a body
// clone when the body is a known string/ArrayBuffer shape. For `Response`
// objects we clone+read once in the app at response time.
export function measureBodyBytes(body) {
  if (body == null) return 0;
  if (typeof body === 'string') {
    if (typeof TextEncoder !== 'undefined') {
      try { return new TextEncoder().encode(body).byteLength; } catch { /* fall through */ }
    }
    return body.length;
  }
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return 0;
}

// Wrap a D1 prepared-statement so its terminal `.first()/.run()/.all()`
// calls emit row-metric events to the collector. Preserves the original
// result shape exactly — downstream callers see no behavioural change.
function wrapPreparedStatement(statement, collector) {
  if (!statement || !collector) return statement;
  const originalBind = typeof statement.bind === 'function' ? statement.bind.bind(statement) : null;
  const wrapMethods = (stmt) => {
    const originals = {
      first: typeof stmt.first === 'function' ? stmt.first.bind(stmt) : null,
      run: typeof stmt.run === 'function' ? stmt.run.bind(stmt) : null,
      all: typeof stmt.all === 'function' ? stmt.all.bind(stmt) : null,
    };
    if (originals.first) {
      stmt.first = async (...args) => {
        const result = await originals.first(...args);
        // `.first()` returns either a row object, null, or a scalar column
        // value depending on call shape. For telemetry purposes we can
        // only attribute one rows_read when a row came back; production
        // D1 does expose `meta.rows_read` for `.all()` and `.run()`, not
        // `.first()`, so this is a conservative accounting step.
        const rowsRead = result == null ? 0 : 1;
        collector.recordD1Query({ rowsRead, rowsWritten: 0 });
        return result;
      };
    }
    if (originals.run) {
      stmt.run = async (...args) => {
        const result = await originals.run(...args);
        const meta = result?.meta || {};
        collector.recordD1Query({
          rowsRead: meta.rows_read,
          rowsWritten: meta.rows_written ?? meta.changes,
        });
        return result;
      };
    }
    if (originals.all) {
      stmt.all = async (...args) => {
        const result = await originals.all(...args);
        const meta = result?.meta || {};
        const rowsRead = meta.rows_read ?? (Array.isArray(result?.results) ? result.results.length : 0);
        collector.recordD1Query({ rowsRead, rowsWritten: meta.rows_written || 0 });
        return result;
      };
    }
    return stmt;
  };
  if (originalBind) {
    statement.bind = (...args) => {
      const bound = originalBind(...args);
      return bound === statement ? wrapMethods(bound) : wrapMethods(bound);
    };
  }
  return wrapMethods(statement);
}

// Wrap a D1 database binding so every `prepare()` returns a telemetry-
// aware statement. The wrapper intentionally forwards `batch()`, `exec()`,
// `prepare()`, `supportsSqlTransactions`, and any other property by
// reference so repository/auth code paths see no shape change.
export function wrapDatabaseForTelemetry(db, collector) {
  if (!db || !collector) return db;
  const originalPrepare = typeof db.prepare === 'function' ? db.prepare.bind(db) : null;
  const originalBatch = typeof db.batch === 'function' ? db.batch.bind(db) : null;
  const originalExec = typeof db.exec === 'function' ? db.exec.bind(db) : null;
  // Return a proxy-like object. We cannot use `Proxy` because some D1
  // clients (and the SQLite test double) rely on instance-specific
  // methods — the explicit forwarder keeps the wrapper auditable.
  const wrapper = Object.create(Object.getPrototypeOf(db) || Object.prototype);
  for (const key of Reflect.ownKeys(db)) {
    if (key === 'prepare' || key === 'batch' || key === 'exec') continue;
    Object.defineProperty(wrapper, key, {
      get: () => db[key],
      set: (value) => { db[key] = value; },
      enumerable: true,
      configurable: true,
    });
  }
  if (originalPrepare) {
    wrapper.prepare = (sql) => wrapPreparedStatement(originalPrepare(sql), collector);
  }
  if (originalBatch) {
    wrapper.batch = async (statements) => {
      const results = await originalBatch(statements);
      if (Array.isArray(results)) {
        for (const entry of results) {
          const meta = entry?.meta || {};
          collector.recordD1Query({
            rowsRead: meta.rows_read || 0,
            rowsWritten: meta.rows_written ?? meta.changes ?? 0,
          });
        }
      }
      return results;
    };
  }
  if (originalExec) {
    wrapper.exec = (...args) => originalExec(...args);
  }
  // Tag so `wrapDatabaseForTelemetry` is idempotent if a caller re-wraps.
  wrapper.__ks2CapacityWrapped = true;
  return wrapper;
}
