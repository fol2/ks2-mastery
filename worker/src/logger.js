// Capacity telemetry collector and structured log emitter (Phase 2 U3).
//
// Design choice: constructor injection, NOT AsyncLocalStorage. The
// `CapacityCollector` is instantiated per request in `createWorkerApp.fetch`
// and passed explicitly through `createWorkerRepository({ env, now, capacity })`
// plus any D1 wrapper that records query-level metrics. Workers
// AsyncLocalStorage requires `nodejs_compat` and carries per-hop CPU cost,
// contrary to Phase 1's "bounded, small, boring" principle. See
// `worker/README.md` for the full rationale. The collector mutation surface
// is telemetry-only — it is not a general pattern for side effects.
//
// Redaction contract (closed allowlist):
//   - `toPublicJSON()` is the ONLY surface returned to clients via
//     `meta.capacity`. It emits ONLY documented fields; per-statement
//     breakdown is NEVER included.
//   - `toStructuredLog()` is the ONLY surface written to structured logs
//     via `capacityRequest()`. It MAY include per-statement breakdown but
//     NEVER includes request/response bodies, learner identifiers beyond
//     the request id, answer-bearing fields, spelling prompts, or full
//     event JSON.
//
// Adding a new collector field requires BOTH surfaces to be updated and an
// explicit regression test in `tests/worker-capacity-telemetry.test.js`.

const STATEMENT_HARD_CAP = 50;
const REQUEST_ID_PATTERN = /^ks2_req_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_REQUEST_ID_LENGTH = 48;

// U3 round 1 (P0 #01): closed allowlist of signal tokens that may appear
// on `meta.capacity.signals[]`. Any string outside the set is silently
// rejected (match the existing "non-string ignored" pattern) and the
// internal `signalsRejected` counter is incremented so misuse is visible
// to tests and, if ever needed, ad-hoc logs — but NEVER to public JSON.
//
// Provenance:
//   - `exceededCpu`, `d1Overloaded`, `d1DailyLimit`, `rateLimited`,
//     `networkFailure`, `server5xx`, `bootstrapFallback`,
//     `projectionFallback`, `derivedWriteSkipped`, `breakerTransition`
//     landed via U3 round 1 P0 #01.
//   - `redactionFailure`, `staleWrite`, `idempotencyReuse` absorbed from
//     PR #207's `CAPACITY_FAILURE_CATEGORIES` closed enum during the
//     Option B merge (2026-04-26). Each captures a dimension the HTTP
//     status cannot: `redactionFailure` is a silent-fail mode (no status
//     change), `staleWrite` is distinct from arbitrary 409s, and
//     `idempotencyReuse` is a 200-OK replay. Tokens that would duplicate
//     HTTP status (`authFailure` → 401/403, `badRequest` → 400,
//     `notFound` → 404, `backendUnavailable` → 503) were deliberately
//     NOT absorbed because they are already observable via `status`.
const SIGNAL_ALLOWED_TOKENS = new Set([
  'exceededCpu',
  'd1Overloaded',
  'd1DailyLimit',
  'rateLimited',
  'networkFailure',
  'server5xx',
  'bootstrapFallback',
  'projectionFallback',
  'derivedWriteSkipped',
  'breakerTransition',
  'redactionFailure',
  'staleWrite',
  'idempotencyReuse',
]);

// U3 round 1 (P1 #05): closed allowlist of `bootstrapCapacity` keys that
// may be stamped onto the collector. Matches what `bootstrapBundle()` in
// `worker/src/repository.js` can emit today: version, mode, limits,
// learners, practiceSessions, eventLog. Unknown keys are dropped silently
// and counted via `bootstrapCapacityDroppedKeys`.
const BOOTSTRAP_CAPACITY_ALLOWED_KEYS = new Set([
  'version',
  'mode',
  'limits',
  'learners',
  'practiceSessions',
  'eventLog',
]);

// U3 round 1 (P1 #05): closed allowlist of `bootstrapMode` strings. Any
// string outside the set resets the field to null (silent reject).
const BOOTSTRAP_MODE_ALLOWED = new Set([
  'fresh',
  'rehydrated',
  'miss-rehydrated',
  'public-bounded',
]);

// U3 round 1 (P0 #02): measure UTF-8 byte length without referencing the
// Node-only `Buffer` global. Cloudflare Workers does not expose `Buffer`
// unless `nodejs_compat` is enabled, and the rest of the worker (auth.js,
// http.js, repository.js) already uses `TextEncoder` for byte math — keep
// the pattern consistent.
export function measureUtf8Bytes(text) {
  if (text == null) return 0;
  return new TextEncoder().encode(String(text)).byteLength;
}

/**
 * Validate an incoming `x-ks2-request-id` header and return it only when it
 * matches the prefix + UUID v4 shape. Non-matching, missing, blank, or
 * oversized values are rejected and the caller should generate a fresh id.
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function validateRequestId(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_REQUEST_ID_LENGTH) return null;
  if (!REQUEST_ID_PATTERN.test(raw)) return null;
  return raw;
}

/**
 * Generate a fresh server-side request id using crypto.randomUUID().
 *
 * @returns {string}
 */
export function generateRequestId() {
  // `crypto` is globally available in Workers runtime and Node >= 20.
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : fallbackUuidV4();
  return `ks2_req_${uuid}`;
}

function fallbackUuidV4() {
  // 16 random bytes, set version (4) + variant (10xx) bits per RFC 4122.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toFiniteNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Per-request telemetry collector. Mutable; lifetime bounded to a single
 * `fetch()` handler invocation. Constructor injection only.
 */
export class CapacityCollector {
  constructor({
    requestId = null,
    endpoint = null,
    method = null,
    startedAt = null,
  } = {}) {
    this.requestId = typeof requestId === 'string' ? requestId : null;
    this.endpoint = typeof endpoint === 'string' ? endpoint : null;
    this.method = typeof method === 'string' ? method : null;
    this.startedAt = Number.isFinite(Number(startedAt)) ? Number(startedAt) : null;

    this.queryCount = 0;
    this.d1RowsRead = 0;
    this.d1RowsWritten = 0;
    this.d1DurationMs = 0;
    this.statements = [];
    this.statementsTruncated = false;

    this.wallMs = null;
    this.responseBytes = null;
    this.status = null;
    this.phase = null;

    this.bootstrapCapacity = null;
    this.projectionFallback = null;
    this.derivedWriteSkipped = null;
    this.bootstrapMode = null;
    this.signals = [];

    // U3 round 1 internal counters: test-visible, never published. These
    // NEVER appear in `toPublicJSON()` or `toStructuredLog()`.
    this.signalsRejected = 0;
    this.bootstrapCapacityDroppedKeys = 0;

    // U3 round 1 (P2 #06): once `setFinal()` stamps the final status,
    // further mutations to `signals[]` are a no-op. This preserves the
    // invariant that the structured log emitted via `capacityRequest()`
    // matches the `meta.capacity` on the returned body; otherwise a late
    // `addSignal()` race could land in the log but not the response.
    this.finalised = false;
  }

  /**
   * Record one D1 statement. `rowsRead` and `rowsWritten` may be null when
   * D1 does not expose `meta.rows_read` / `meta.rows_written` (e.g. a
   * `first()` call before the Workers runtime exposes per-statement meta).
   * `null` is preserved end-to-end so operators can distinguish "zero rows"
   * from "unknown".
   *
   * @param {{name?: string, rowsRead?: number|null, rowsWritten?: number|null, durationMs?: number|null}} entry
   */
  recordStatement({ name = null, rowsRead = null, rowsWritten = null, durationMs = null } = {}) {
    this.queryCount += 1;

    const normalisedRead = rowsRead == null ? null : toFiniteNumber(rowsRead);
    const normalisedWritten = rowsWritten == null ? null : toFiniteNumber(rowsWritten);
    const normalisedDuration = durationMs == null ? null : toFiniteNumber(durationMs);

    if (Number.isFinite(normalisedRead)) this.d1RowsRead += Math.max(0, normalisedRead);
    if (Number.isFinite(normalisedWritten)) this.d1RowsWritten += Math.max(0, normalisedWritten);
    if (Number.isFinite(normalisedDuration)) this.d1DurationMs += Math.max(0, normalisedDuration);

    if (this.statements.length < STATEMENT_HARD_CAP) {
      this.statements.push({
        name: typeof name === 'string' ? name : null,
        rowsRead: normalisedRead,
        rowsWritten: normalisedWritten,
        durationMs: normalisedDuration,
      });
    } else {
      this.statementsTruncated = true;
    }
  }

  /**
   * Append a short-lived, bounded signal string (e.g. a rate-limit or
   * backoff hint) to the collector. Signals are part of the public
   * allowlist so they may appear in `meta.capacity`. Tokens MUST belong
   * to the closed `SIGNAL_ALLOWED_TOKENS` set — arbitrary strings (PII,
   * raw error messages, learner names) are silently rejected and the
   * internal `signalsRejected` counter increments so tests can catch
   * misuse. Post-`setFinal()` calls are a no-op (P2 #06) to preserve
   * log/response parity.
   *
   * @param {string} token
   */
  addSignal(token) {
    if (this.finalised) return;
    if (typeof token !== 'string' || !token) return;
    if (!SIGNAL_ALLOWED_TOKENS.has(token)) {
      this.signalsRejected += 1;
      return;
    }
    if (this.signals.length >= 20) return; // Defence in depth: bounded.
    this.signals.push(token);
  }

  /**
   * Validate and stamp the `bootstrapCapacity` structural meta. Non-object
   * inputs and arrays are rejected outright. Unknown keys are dropped
   * silently and counted via `bootstrapCapacityDroppedKeys`.
   *
   * @param {object|null} value
   */
  setBootstrapCapacity(value) {
    if (value == null) {
      this.bootstrapCapacity = null;
      return;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.bootstrapCapacity = null;
      return;
    }
    const filtered = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (BOOTSTRAP_CAPACITY_ALLOWED_KEYS.has(key)) {
        filtered[key] = entryValue;
      } else {
        this.bootstrapCapacityDroppedKeys += 1;
      }
    }
    this.bootstrapCapacity = filtered;
  }

  /**
   * Boolean-only setter for `projectionFallback`. Non-booleans are
   * silently ignored — retains the previous value (null on first call).
   *
   * @param {boolean|null} value
   */
  setProjectionFallback(value) {
    if (value === null) { this.projectionFallback = null; return; }
    if (typeof value === 'boolean') this.projectionFallback = value;
  }

  /**
   * Boolean-only setter for `derivedWriteSkipped`.
   *
   * @param {boolean|null} value
   */
  setDerivedWriteSkipped(value) {
    if (value === null) { this.derivedWriteSkipped = null; return; }
    if (typeof value === 'boolean') this.derivedWriteSkipped = value;
  }

  /**
   * Closed-set setter for `bootstrapMode`. Accepts only the documented
   * enum values; everything else is ignored.
   *
   * @param {string|null} value
   */
  setBootstrapMode(value) {
    if (value === null) { this.bootstrapMode = null; return; }
    if (typeof value === 'string' && BOOTSTRAP_MODE_ALLOWED.has(value)) {
      this.bootstrapMode = value;
    }
  }

  /**
   * Final status and byte budget. Called once, just before log emit.
   * Only fields the caller supplies are updated (P2 #08): absent keys do
   * NOT zero-overwrite previously-set values. Sets `this.finalised` so
   * later `addSignal()` calls are a no-op (P2 #06).
   *
   * @param {{wallMs?: number, responseBytes?: number, status?: number, phase?: string}} state
   */
  setFinal(state = {}) {
    if (state && typeof state === 'object') {
      if (Object.prototype.hasOwnProperty.call(state, 'wallMs')) {
        const n = Number(state.wallMs);
        if (Number.isFinite(n)) this.wallMs = n;
      }
      if (Object.prototype.hasOwnProperty.call(state, 'responseBytes')) {
        const n = Number(state.responseBytes);
        if (Number.isFinite(n)) this.responseBytes = n;
      }
      if (Object.prototype.hasOwnProperty.call(state, 'status')) {
        const n = Number(state.status);
        if (Number.isFinite(n)) this.status = n;
      }
      if (Object.prototype.hasOwnProperty.call(state, 'phase')) {
        if (typeof state.phase === 'string' && state.phase) this.phase = state.phase;
      }
    }
    this.finalised = true;
  }

  /**
   * Closed allowlist surface returned to clients via `meta.capacity`. Add
   * a key here only alongside a test in
   * `tests/worker-capacity-telemetry.test.js`.
   *
   * @returns {object}
   */
  toPublicJSON() {
    const output = {
      requestId: this.requestId,
      queryCount: this.queryCount,
      d1RowsRead: this.d1RowsRead,
      d1RowsWritten: this.d1RowsWritten,
      wallMs: this.wallMs,
      responseBytes: this.responseBytes,
      signals: Array.isArray(this.signals) ? [...this.signals] : [],
    };
    if (this.bootstrapCapacity != null) output.bootstrapCapacity = this.bootstrapCapacity;
    if (this.projectionFallback != null) output.projectionFallback = this.projectionFallback;
    if (this.derivedWriteSkipped != null) output.derivedWriteSkipped = this.derivedWriteSkipped;
    if (this.bootstrapMode != null) output.bootstrapMode = this.bootstrapMode;
    return output;
  }

  /**
   * Full structured-log surface. Includes per-statement breakdown. Never
   * returned to clients.
   *
   * @returns {object}
   */
  toStructuredLog() {
    return {
      event: 'capacity.request',
      requestId: this.requestId,
      endpoint: this.endpoint,
      method: this.method,
      status: this.status,
      phase: this.phase,
      queryCount: this.queryCount,
      d1RowsRead: this.d1RowsRead,
      d1RowsWritten: this.d1RowsWritten,
      d1DurationMs: this.d1DurationMs,
      wallMs: this.wallMs,
      responseBytes: this.responseBytes,
      statements: this.statements.map((entry) => ({ ...entry })),
      statementsTruncated: this.statementsTruncated,
      bootstrapCapacity: this.bootstrapCapacity,
      projectionFallback: this.projectionFallback,
      derivedWriteSkipped: this.derivedWriteSkipped,
      bootstrapMode: this.bootstrapMode,
      signals: Array.isArray(this.signals) ? [...this.signals] : [],
    };
  }
}

/**
 * Emit a single `[ks2-worker]` structured log line carrying the
 * `capacity.request` event. Sampling is applied here: when
 * `CAPACITY_LOG_SAMPLE_RATE` is below 1.0, non-error requests may be
 * suppressed. Force-logged (never sampled) cases:
 *   - `status >= 500` — all server errors land.
 *   - `phase === 'pre-route'` — plan line 492 (auth-storm observability).
 *     Pre-route 401s are force-logged so operators can see credential-
 *     stuffing bursts at production sample 0.1.
 *
 * @param {CapacityCollector} collector
 * @param {{env?: object, random?: () => number, console?: Console}} [options]
 */
export function capacityRequest(collector, { env = null, random = Math.random, console: consoleRef = globalThis.console } = {}) {
  if (!collector || typeof collector.toStructuredLog !== 'function') return;

  const payload = collector.toStructuredLog();
  if (!payload) return;

  const alwaysLog = Number(payload.status) >= 500 || payload.phase === 'pre-route';
  if (!alwaysLog) {
    const rawRate = env?.CAPACITY_LOG_SAMPLE_RATE;
    const rate = normaliseSampleRate(rawRate);
    if (rate <= 0) return;
    if (rate < 1 && random() >= rate) return;
  }

  // Match `logMutation()` in worker/src/repository.js: use `console.log` so
  // the `[ks2-worker]` prefix stream is consistent across event types and
  // existing log aggregators treat both lines identically.
  const fn = consoleRef?.log;
  if (!fn) return;
  const decorated = { ...payload, at: new Date().toISOString() };
  try {
    fn.call(consoleRef, '[ks2-worker]', JSON.stringify(decorated));
  } catch {
    fn.call(consoleRef, '[ks2-worker]', decorated);
  }
}

/**
 * Normalise `CAPACITY_LOG_SAMPLE_RATE` to a 0–1 number. Missing or invalid
 * values fall back to 1.0 (full sampling) to keep local dev chatty.
 *
 * @param {unknown} raw
 * @returns {number}
 */
export function normaliseSampleRate(raw) {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
