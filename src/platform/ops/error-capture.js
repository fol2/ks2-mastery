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
const ALL_CAPS_WORD_REGEX = /\b[A-Z]{4,}\b/g;

const MESSAGE_MAX_CHARS = 500;
const FIRST_FRAME_MAX_CHARS = 300;
const ROUTE_MAX_CHARS = 128;
const USER_AGENT_MAX_CHARS = 256;
const ERROR_KIND_MAX_CHARS = 128;

const MAX_QUEUE = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_JITTER = 0.25;

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
  return scrubSensitive(segments.join('/'));
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
  const firstFrame = scrubSensitive(firstLine(rawStack).slice(0, FIRST_FRAME_MAX_CHARS));

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

function scheduleDrain(credentialFetch, delayMs = 0) {
  if (typeof globalThis.setTimeout !== 'function') return;
  globalThis.setTimeout(() => {
    drainQueue(credentialFetch).catch(() => {
      // Swallow — capture path must never escalate.
    });
  }, Math.max(0, delayMs));
}

function nextBackoffDelay() {
  const jitter = 1 + (Math.random() * BACKOFF_JITTER);
  return Math.min(BACKOFF_MAX_MS, Math.round(BACKOFF_BASE_MS * jitter));
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
    const response = await credentialFetch('/api/ops/error-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    });
    if (response && response.ok) {
      _queue.shift();
      _backoffUntil = 0;
    } else if (response && response.status >= 400 && response.status < 500) {
      // Non-retryable: drop and continue. 4xx means the server rejected the
      // payload shape / rate-limited / etc.; a retry would repeat the outcome.
      _queue.shift();
      _backoffUntil = 0;
    } else {
      // 5xx / transient — back off with jitter and retry later.
      _backoffUntil = Date.now() + nextBackoffDelay();
    }
  } catch {
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
}

// Test-only helper — returns a shallow copy so tests can observe queue length
// without racing the private array.
export function _peekErrorCaptureQueue() {
  return _queue.slice();
}
