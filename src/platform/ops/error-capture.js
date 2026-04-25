// Client-side error capture pipeline for the public `/api/ops/error-event`
// ingest endpoint. Three exported concerns:
//
//   1. redactClientErrorEvent(raw) — pure function returning a closed-allowlist
//      event shape with every sensitive substring stripped. Runs BEFORE any
//      network send. The Worker re-runs equivalent redaction for defence in
//      depth, but this mirror keeps PII off the wire.
//   2. captureClientError({source, error, info, credentialFetch, timestamp}) —
//      redacts, enqueues, and drains. Bounded queue (10 events, drop-oldest)
//      with jittered backoff on transient failures and non-retryable drops on
//      4xx responses. MUST NOT throw — the capture path is a last-resort tool
//      and must never become its own error source.
//   3. installGlobalErrorCapture({credentialFetch}) — attaches `error` and
//      `unhandledrejection` listeners to `globalThis`.
//
// Redaction rules (R12, R28, R29):
//   - Closed allowlist: only `errorKind`, `messageFirstLine`, `firstFrame`,
//     `routeName`, `userAgent`, `timestamp` ever reach the wire.
//   - Sensitive substring regex strips ks2-specific tokens and the R12 baseline
//     (answer_raw, prompt, learner_name, email, password, session, cookie,
//     token, spelling_word, punctuation_answer, grammar_concept, prompt_token,
//     learner_id) case-insensitively from surviving fields.
//   - All-uppercase words of 4+ letters (likely KS2 spelling content leaking
//     as property names) become `[word]`. 3-letter acronyms (URL, TTS, API)
//     survive on purpose; the threshold is a conscious trade-off.
//   - `routeName` strips query+hash, replaces UUID-shaped or `learner-*` path
//     segments with `[id]`, caps at 128 chars.
//   - `messageFirstLine` capped at 500 chars; only the first line of a
//     multi-line message survives. `firstFrame` capped at 300; userAgent 256.

const SENSITIVE_REGEX = /(answer_raw|prompt|learner_name|email|password|session|cookie|token|spelling_word|punctuation_answer|grammar_concept|prompt_token|learner_id)/gi;
const UUID_SEGMENT_REGEX = /^[0-9a-f-]{32,36}$/i;
const LEARNER_ID_SEGMENT_REGEX = /^learner-[a-z0-9-]+$/i;
// U6 review follow-up (Finding 1): broaden the all-caps match to cross
// underscore boundaries. `\b` in JS regex treats `_` as a word character,
// so the previous `\b[A-Z]{4,}\b` was a no-op on `PRINCIPAL_HANDLER`
// (one long `\w+` token). The lookaround pair matches a run of 4+ upper-
// case letters with any non-letter (including `_`) on either side, so
// snake_case identifiers containing spelling words are scrubbed correctly.
const ALL_CAPS_WORD_REGEX = /(?<![A-Za-z])[A-Z]{4,}(?![A-Za-z])/g;

const MESSAGE_MAX_CHARS = 500;
const FIRST_FRAME_MAX_CHARS = 300;
const ROUTE_MAX_CHARS = 128;
const USER_AGENT_MAX_CHARS = 256;
const ERROR_KIND_MAX_CHARS = 128;

const MAX_QUEUE = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
// U6 review follow-up (Finding 4): ±25% two-sided jitter. The previous
// implementation used `1 + Math.random() * 0.25`, which produced [1.00, 1.25]
// — only positive jitter, no real thundering-herd mitigation on retries.
const BACKOFF_JITTER = 0.5; // multiplied by (Math.random() - 0.5): ±25%.
// U6 review follow-up (Finding 4): cap the doubling exponent so the base
// cannot overflow. 2^10 * 1000 ms = ~17min which the 60s ceiling clamps anyway,
// but the explicit cap keeps the computation stable under pathological retry storms.
const BACKOFF_MAX_EXPONENT = 10;
// U6 review follow-up (Finding 3): abort a hung POST after 10s so a stuck
// network connection cannot park the drain loop with `_inFlight=true` forever.
const FETCH_TIMEOUT_MS = 10_000;

function scrubSensitive(value) {
  return String(value || '').replace(SENSITIVE_REGEX, '[redacted]');
}

function scrubAllCaps(value) {
  return String(value || '').replace(ALL_CAPS_WORD_REGEX, '[word]');
}

function firstLine(value) {
  return String(value || '').split('\n', 1)[0] || '';
}

function normaliseRouteName(raw) {
  const source = typeof raw === 'string' && raw
    ? raw
    : (typeof globalThis.location?.pathname === 'string' ? globalThis.location.pathname : '');
  if (!source) return '';
  const withoutQueryHash = source.split(/[?#]/, 1)[0] || '';
  const capped = withoutQueryHash.slice(0, ROUTE_MAX_CHARS);
  const segments = capped.split('/').map((segment) => {
    if (!segment) return segment;
    if (UUID_SEGMENT_REGEX.test(segment) || LEARNER_ID_SEGMENT_REGEX.test(segment)) return '[id]';
    return segment;
  });
  // U6 review follow-up (Finding 1): apply the all-caps scrub to the
  // route name as well. KS2 spelling words routed as path segments
  // (e.g. `/word/PRINCIPAL`) were previously passing through unredacted
  // because only `messageFirstLine` ran the 4+ letter all-caps rule.
  return scrubAllCaps(scrubSensitive(segments.join('/')));
}

export function redactClientErrorEvent(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const errorKind = typeof source.errorKind === 'string' && source.errorKind
    ? source.errorKind.slice(0, ERROR_KIND_MAX_CHARS)
    : 'Error';

  const rawMessage = typeof source.message === 'string'
    ? source.message
    : (typeof source.messageFirstLine === 'string' ? source.messageFirstLine : '');
  const message = scrubAllCaps(scrubSensitive(firstLine(rawMessage).slice(0, MESSAGE_MAX_CHARS)));

  const rawStack = typeof source.stack === 'string'
    ? source.stack
    : (typeof source.firstFrame === 'string' ? source.firstFrame : '');
  // U6 review follow-up (Finding 1): apply the all-caps scrub to the
  // first-frame too. Stack frames like `at PRINCIPAL_HANDLER (x.js:1)`
  // leak KS2 spelling words when a function name mirrors the word being
  // tested. Matches the redaction parity on messageFirstLine.
  const firstFrame = scrubAllCaps(scrubSensitive(firstLine(rawStack).slice(0, FIRST_FRAME_MAX_CHARS)));

  const routeName = normaliseRouteName(source.routeName);

  const rawUserAgent = typeof source.userAgent === 'string' && source.userAgent
    ? source.userAgent
    : (typeof globalThis.navigator?.userAgent === 'string' ? globalThis.navigator.userAgent : '');
  const userAgent = rawUserAgent.slice(0, USER_AGENT_MAX_CHARS);

  const timestampRaw = Number(source.timestamp);
  const timestamp = Number.isFinite(timestampRaw) && timestampRaw > 0 ? timestampRaw : Date.now();

  return {
    errorKind,
    messageFirstLine: message,
    firstFrame,
    routeName,
    userAgent,
    timestamp,
  };
}

// Module-scoped queue state. Tests can reset via _resetErrorCaptureState.
let _queue = [];
let _inFlight = false;
let _backoffUntil = 0;
let _installedCredentialFetch = null;
let _globalListenersInstalled = false;
// U6 review follow-up (Finding 4): consecutive-failure counter powers the
// exponential backoff. Reset to 0 on 2xx success or 4xx drop; incremented on
// 5xx / network / AbortError. Module-scope (not per-event) so a queue of 10
// retries does not reset the exponent to 0 mid-storm.
let _consecutiveFailures = 0;

function scheduleDrain(credentialFetch, delayMs = 0) {
  if (typeof globalThis.setTimeout !== 'function') return;
  globalThis.setTimeout(() => {
    drainQueue(credentialFetch).catch(() => {
      // Swallow — capture path must never escalate.
    });
  }, Math.max(0, delayMs));
}

function nextBackoffDelay() {
  // U6 review follow-up (Finding 4): exponential backoff driven by the
  // module-scoped consecutive-failure counter with two-sided ±25% jitter.
  // Old formula (`1 + Math.random() * 0.25`) produced [1.00, 1.25] only —
  // so the 60s ceiling was never reachable on transient 5xx storms, and
  // jitter was one-sided (not real anti-herd). New formula:
  //   base = BACKOFF_BASE_MS * 2^min(failures, 10)
  //   jittered = base * (1 + (Math.random() - 0.5) * 0.5)   // ±25%
  //   clamped to [BACKOFF_BASE_MS, BACKOFF_MAX_MS]
  const attempt = Math.min(Math.max(0, _consecutiveFailures), BACKOFF_MAX_EXPONENT);
  const base = BACKOFF_BASE_MS * Math.pow(2, attempt);
  const jittered = base * (1 + (Math.random() - 0.5) * BACKOFF_JITTER);
  const clamped = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_BASE_MS, jittered));
  return Math.round(clamped);
}

async function drainQueue(credentialFetch) {
  if (_inFlight) return;
  if (!_queue.length) return;
  if (typeof credentialFetch !== 'function') return;

  const now = Date.now();
  if (now < _backoffUntil) {
    scheduleDrain(credentialFetch, _backoffUntil - now);
    return;
  }

  const event = _queue[0];
  _inFlight = true;
  try {
    // U6 review follow-up (Finding 3): wrap the POST in an AbortSignal with
    // a 10s deadline. Without this, a hung server (dropped connection, DNS
    // stall, TLS handshake stuck) would block `_inFlight = true` forever
    // and the queue would freeze indefinitely. On abort, the catch block
    // treats the outcome as a transient error and backs off.
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    };
    if (typeof globalThis.AbortSignal?.timeout === 'function') {
      init.signal = globalThis.AbortSignal.timeout(FETCH_TIMEOUT_MS);
    }
    const response = await credentialFetch('/api/ops/error-event', init);
    if (response && response.ok) {
      _queue.shift();
      _backoffUntil = 0;
      // U6 review follow-up (Finding 4): reset the consecutive-failure
      // counter on any 2xx so the next outage starts from a 1-second base.
      _consecutiveFailures = 0;
    } else if (response && response.status >= 400 && response.status < 500) {
      // Non-retryable: drop and continue. 4xx means the server rejected the
      // payload shape / rate-limited / etc.; a retry would repeat the outcome.
      _queue.shift();
      _backoffUntil = 0;
      // 4xx is treated as a clean drop — no exponential escalation from
      // client-side validation failures.
      _consecutiveFailures = 0;
    } else {
      // 5xx / transient — escalate backoff and retry later.
      _consecutiveFailures += 1;
      _backoffUntil = Date.now() + nextBackoffDelay();
    }
  } catch {
    // Network error, AbortError (10s timeout), or other fetch-layer failure.
    _consecutiveFailures += 1;
    _backoffUntil = Date.now() + nextBackoffDelay();
  } finally {
    _inFlight = false;
    if (_queue.length > 0) {
      const remainingDelay = Math.max(0, _backoffUntil - Date.now());
      scheduleDrain(credentialFetch, remainingDelay);
    }
  }
}

export function captureClientError({ source, error, info, credentialFetch, timestamp } = {}) {
  try {
    const resolvedFetch = typeof credentialFetch === 'function'
      ? credentialFetch
      : _installedCredentialFetch;
    if (typeof resolvedFetch !== 'function') return;

    const errorObject = error && typeof error === 'object' ? error : {};
    const infoObject = info && typeof info === 'object' ? info : {};
    const componentStack = typeof infoObject.componentStack === 'string' ? infoObject.componentStack : '';
    const stack = typeof errorObject.stack === 'string' ? errorObject.stack : '';
    const message = typeof errorObject.message === 'string' ? errorObject.message : '';
    const errorKind = typeof errorObject.name === 'string' && errorObject.name
      ? errorObject.name
      : (source || 'Error');

    const rawEvent = {
      errorKind,
      message,
      stack: componentStack || stack,
      timestamp,
    };
    const redacted = redactClientErrorEvent(rawEvent);

    // Drop oldest on overflow so recent signal survives (R30 bounded queue).
    while (_queue.length >= MAX_QUEUE) {
      _queue.shift();
    }
    _queue.push(redacted);
    scheduleDrain(resolvedFetch, 0);
  } catch {
    // Capture must never throw.
  }
}

export function installGlobalErrorCapture({ credentialFetch } = {}) {
  if (typeof credentialFetch !== 'function') return;
  _installedCredentialFetch = credentialFetch;
  if (_globalListenersInstalled) return;
  if (typeof globalThis.addEventListener !== 'function') return;

  globalThis.addEventListener('error', (event) => {
    try {
      const rawError = event && event.error ? event.error : {
        name: 'Error',
        message: typeof event?.message === 'string' ? event.message : '',
        stack: '',
      };
      captureClientError({
        source: 'window-onerror',
        error: rawError,
        info: {},
        credentialFetch,
      });
    } catch {
      // Ignore.
    }
  });

  globalThis.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event?.reason;
      const errorLike = reason instanceof Error
        ? reason
        : {
          name: 'UnhandledRejection',
          message: reason == null ? 'Unhandled rejection' : String(reason),
          stack: '',
        };
      captureClientError({
        source: 'unhandled-rejection',
        error: errorLike,
        info: {},
        credentialFetch,
      });
    } catch {
      // Ignore.
    }
  });

  _globalListenersInstalled = true;
}

// Test-only helper. Resets the module-scoped queue state so each test runs
// against a fresh pipeline.
export function _resetErrorCaptureState() {
  _queue = [];
  _inFlight = false;
  _backoffUntil = 0;
  _installedCredentialFetch = null;
  _globalListenersInstalled = false;
  // U6 review follow-up (Finding 4): reset the failure counter so tests
  // running back-to-back do not inherit backoff escalation from a
  // previous scenario.
  _consecutiveFailures = 0;
}

// Test-only helper — returns a shallow copy so tests can observe queue length
// without racing the private array.
export function _peekErrorCaptureQueue() {
  return _queue.slice();
}

// Test-only helper — exposes the internal backoff/failure counters so the
// exponential-backoff + abort-timeout tests can assert on escalation behaviour
// without reaching into the module-scoped `let` bindings directly.
export function _peekErrorCaptureBackoffState() {
  return {
    backoffUntil: _backoffUntil,
    consecutiveFailures: _consecutiveFailures,
    inFlight: _inFlight,
  };
}
