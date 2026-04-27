import { uid } from '../utils.js';
import {
  cloneSerialisable,
  currentRepositoryMeta,
  emptyLearnersSnapshot,
  filterSessions,
  gameStateKey,
  loadCollection,
  mergeSubjectData,
  mergeSubjectUi,
  normaliseLearnersSnapshot,
  normalisePracticeSessionRecord,
  normaliseRepositoryBundle,
  normaliseSubjectStateRecord,
  nowTs,
  parseGameStateKey,
  practiceSessionKey,
  subjectStateKey,
} from './helpers.js';
import {
  createPersistenceChannel,
  createPersistenceError,
  defaultPersistenceSnapshot,
  PERSISTENCE_CACHE_STATES,
  PERSISTENCE_MODES,
  PERSISTENCE_TRUSTED_STATES,
} from './persistence.js';
import { validatePlatformRepositories } from './contract.js';
import {
  applyRepositoryAuthSession,
  createNoopRepositoryAuthSession,
  repositoryAuthCacheScopeKey,
} from './auth-session.js';
import {
  normaliseMonsterVisualRuntimeConfig,
  resolveMonsterVisualConfigFromPointer,
} from '../../game/monster-visual-config.js';
import {
  buildBreakersDegradedMap,
  createCircuitBreaker,
  isResetableBreakerName,
} from '../circuit-breaker.js';

const MUTATION_POLICY_VERSION = 1;
const OPERATION_STATUS_PENDING = 'pending';
const OPERATION_STATUS_BLOCKED_STALE = 'blocked-stale';
const SUBJECT_STATE_MERGE_STRATEGIES = new Set(['merge', 'ui', 'data', 'replace']);
const BOOTSTRAP_BACKOFF_BASE_MS = 2_000;
const BOOTSTRAP_BACKOFF_MAX_MS = 30_000;
const BOOTSTRAP_BACKOFF_JITTER_MS = 250;
const BOOTSTRAP_COORDINATION_LEASE_MS = BOOTSTRAP_BACKOFF_MAX_MS;
// U8 coord-race fix (adv-u7-coord-001): follower spin-wait budget.
// When a tab loses the acquire race (localStorage last-write-wins
// ordering) but no active foreign lease is visible in the same tick,
// the previous leader may have completed so fast (U7 notModified path
// ~50ms) that its lease was cleared before we could observe it. A
// bounded spin-wait gives the observable-completion signal time to
// surface — either a foreign lease appears (go wait for it) or the
// shared cache updates (rehydrate from localStorage and return). After
// the budget expires the fall-through-to-direct-bootstrap path runs,
// preserving the pre-fix graceful-degradation contract.
//
// 3 × 30ms = 90ms upper bound, well inside the Playwright network-idle
// settle window (typically 500ms+) and well below the legitimate
// waitUntil: 'networkidle' timeout.
const BOOTSTRAP_FOLLOWER_SPIN_ATTEMPTS = 3;
const BOOTSTRAP_FOLLOWER_SPIN_DELAY_MS = 30;
// U8 coord-race fix (adv-u7-coord-001): cross-tab write-settle delay.
//
// Chromium's per-Document localStorage snapshot does NOT reflect
// concurrent cross-tab writes synchronously — writes propagate via a
// `storage` event that is dispatched on the next task boundary, and
// observed delivery latency under Playwright's `Promise.all` three-tab
// dispatch ranges empirically from 50-90ms (Windows Chromium 121,
// same-origin SharedWorker-less localStorage). Without a settle delay
// between our `setItem(ownerId)` and the read-back that confirms
// ownership, every tab reads its own last-write and claims leadership,
// producing an N-way bootstrap fan-out.
//
// The settle delay is a one-time cost on the coordination critical
// path and only runs when a cache fallback is available — cold-start
// bootstrap (the only path that matters for first-paint latency) is
// not affected. A 100ms budget is conservative enough to absorb
// Windows Chromium tail latency while staying well below the pre-U7
// baseline bootstrap round-trip that this optimisation displaces.
// The test-harness memory-storage adapter sees writes synchronously,
// so the delay is purely padding there and is absorbed by the existing
// test-level `await setTimeout(50)` hooks we added to the sibling
// tests.
const BOOTSTRAP_ACQUIRE_SETTLE_MS = 100;
// U7: `meta.capacity.bootstrapCapacity` is the U9 regression-detection
// field. Three consecutive bootstraps without it escalates to an
// operator-visible error and stops retries (plan line 752).
const BOOTSTRAP_MISSING_METADATA_ESCALATION_LIMIT = 3;
// U7: required revision-envelope keys. Used both for the v2 POST body
// and for the client-side schema check before honouring notModified
// (plan line 751).
const BOOTSTRAP_V2_REVISION_KEYS = [
  'accountRevision',
  'accountLearnerListRevision',
  'bootstrapCapacityVersion',
  'hash',
  'selectedLearnerRevision',
];
const LEGACY_RUNTIME_WRITES_ENABLED = typeof process === 'object'
  && process?.env?.NODE_ENV !== 'production';

// U8 (capacity release gates + telemetry): multi-tab coordination
// counters. The singleton lives on `globalThis.__ks2_capacityMeta__`
// so the Playwright scene (`tests/playwright/bootstrap-multi-tab.
// playwright.test.mjs`) and the node unit oracle
// (`tests/capacity-meta-counters.test.js`) can read the same object.
//
// Tree-shake contract: the build pipeline in `scripts/build-client.mjs`
// feeds `define: { 'process.env.NODE_ENV': '"production"' }` into esbuild,
// so every occurrence of the literal expression
// `process.env.NODE_ENV !== 'production'` is statically replaced with
// `false` in the production bundle. Each guard below reads that exact
// expression inline (no intermediate `const`) so esbuild's dead-code
// eliminator folds the `if` body away entirely and no reference to
// `__ks2_capacityMeta__` or the counter keys survives the minifier
// pass. The production-bundle audit in
// `scripts/audit-client-bundle.mjs` enforces this invariant by
// grepping for `__ks2_capacityMeta__` in the shipped bundle and
// failing CI if the token ever leaks back in.
if (process.env.NODE_ENV !== 'production') {
  const CAPACITY_META_COUNTER_KEYS = [
    'bootstrapLeaderAcquired',
    'bootstrapFollowerWaited',
    'bootstrapFollowerUsedCache',
    'bootstrapFollowerTimedOut',
    'bootstrapFallbackFullRefresh',
    'staleCommandSmallRefresh',
    'staleCommandFullBootstrapFallback',
    // U8 round 1 adv-u8-r1-002: coordination-bypass signal when the
    // bootstrap-lease write to browser local storage throws (quota
    // exhausted, managed-profile Chromebook with site storage
    // disabled). Classroom-scale metric for the U9 circuit breaker.
    'bootstrapCoordinationStorageUnavailable',
  ];
  const existing = globalThis.__ks2_capacityMeta__;
  if (!existing || typeof existing.reset !== 'function') {
    const meta = {};
    for (const key of CAPACITY_META_COUNTER_KEYS) meta[key] = 0;
    meta.reset = function reset() {
      for (const key of CAPACITY_META_COUNTER_KEYS) meta[key] = 0;
    };
    globalThis.__ks2_capacityMeta__ = meta;
  }
}

function bumpCapacityMeta(counterKey, amount = 1) {
  if (process.env.NODE_ENV === 'production') return;
  const meta = globalThis.__ks2_capacityMeta__;
  if (!meta) return;
  const previous = Number(meta[counterKey]) || 0;
  meta[counterKey] = previous + (Number(amount) || 0);
}

const LEGACY_RUNTIME_OPERATION_KINDS = new Set([
  'subjectStates.put',
  'subjectStates.delete',
  'subjectStates.clearLearner',
  'practiceSessions.put',
  'practiceSessions.delete',
  'practiceSessions.clearLearner',
  'gameState.put',
  'gameState.delete',
  'gameState.clearLearner',
  'eventLog.append',
  'eventLog.clearLearner',
  'debug.reset',
]);

function apiCacheStorageKey(scope = 'default') {
  return `ks2-platform-v2.api-cache-state:${scope}`;
}

function bootstrapCoordinationStorageKey(storageKey) {
  return `${storageKey}:bootstrap-coordination`;
}

function createNoopStorage() {
  return {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    get length() { return 0; },
  };
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const suffix = String(path || '').startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function isLegacyRuntimeOperationKind(kind) {
  return LEGACY_RUNTIME_OPERATION_KINDS.has(String(kind || ''));
}

function isReplayablePendingOperation(operation, legacyRuntimeWritesEnabled = LEGACY_RUNTIME_WRITES_ENABLED) {
  return legacyRuntimeWritesEnabled || !isLegacyRuntimeOperationKind(operation?.kind);
}

function legacyRuntimePath(...segments) {
  return `/${['api', ...segments].join('/')}`;
}

class RepositoryHttpError extends Error {
  constructor({ url, method, status = 0, payload = null, text = '', correlationId = null }) {
    const message = payload?.message
      || (typeof text === 'string' && text.trim())
      || `Repository sync failed (${status}).`;
    super(`Repository sync failed (${status}): ${message}`);
    this.name = 'RepositoryHttpError';
    this.url = url;
    this.method = method;
    this.status = Number(status) || 0;
    this.payload = payload;
    this.text = text;
    this.code = payload?.code || null;
    this.retryable = status >= 500 || status === 0;
    this.correlationId = correlationId || payload?.correlationId || payload?.requestId || null;
  }
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return {
      payload: await response.json().catch(() => null),
      text: '',
    };
  }
  const text = await response.text().catch(() => '');
  return {
    payload: null,
    text,
  };
}

function generateIngressRequestId() {
  // U3 audit: every outgoing repository request must carry an
  // `x-ks2-request-id` that matches the Worker's ingress validator
  // (`ks2_req_` + UUID v4). The sync operation's internal `id` is kept
  // intact for mutation-receipt idempotency; this header is a parallel
  // telemetry correlation id that never leaks into mutation-receipt
  // dedup keys. Missing `crypto.randomUUID` in very old runtimes falls
  // back to a 48-char-safe synthesised token.
  const uuid = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16).padStart(8, '0')}-${Math.random().toString(16).slice(2, 6)}-4${Math.random().toString(16).slice(2, 5)}-8${Math.random().toString(16).slice(2, 5)}-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
  return `ks2_req_${uuid}`;
}

async function fetchJson(fetchFn, url, init, authSession) {
  const resolvedInit = await applyRepositoryAuthSession(authSession, init);
  const method = String(resolvedInit?.method || 'GET').toUpperCase();

  // U3: stamp a Worker-ingress-valid `x-ks2-request-id` on every outgoing
  // call when the caller has not supplied one in the canonical shape.
  // Callers that set their own (e.g. sync operations that use the
  // mutation receipt id as the header value) are left untouched — the
  // Worker rejects the malformed value at ingress and generates its own
  // anyway. This preserves back-compat while hardening the default path.
  const existingHeaders = resolvedInit?.headers || {};
  const headersWithRequestId = new Headers(existingHeaders);
  if (!headersWithRequestId.has('x-ks2-request-id')) {
    headersWithRequestId.set('x-ks2-request-id', generateIngressRequestId());
  }
  const headersInit = Object.fromEntries(headersWithRequestId.entries());
  const decoratedInit = { ...resolvedInit, headers: headersInit };

  let response;
  try {
    response = await fetchFn(url, decoratedInit);
  } catch (error) {
    const wrapped = new RepositoryHttpError({
      url,
      method,
      status: 0,
      payload: null,
      text: error?.message || String(error),
    });
    wrapped.cause = error;
    throw wrapped;
  }

  const { payload, text } = await parseResponseBody(response);
  if (!response.ok) {
    throw new RepositoryHttpError({
      url,
      method,
      status: response.status,
      payload,
      text,
      correlationId: payload?.mutation?.correlationId || payload?.correlationId || payload?.requestId || null,
    });
  }

  return response.status === 204 ? null : (payload ?? null);
}

function emptyApiBundle() {
  return normaliseRepositoryBundle({
    meta: currentRepositoryMeta(),
    learners: emptyLearnersSnapshot(),
    subjectStates: {},
    practiceSessions: [],
    gameState: {},
    eventLog: [],
  });
}

function emptySyncState() {
  return {
    policyVersion: MUTATION_POLICY_VERSION,
    accountRevision: 0,
    learnerRevisions: {},
  };
}

function normaliseSyncState(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const learnerRevisionsRaw = raw.learnerRevisions && typeof raw.learnerRevisions === 'object' && !Array.isArray(raw.learnerRevisions)
    ? raw.learnerRevisions
    : {};
  const learnerRevisions = Object.fromEntries(Object.entries(learnerRevisionsRaw)
    .filter(([key]) => typeof key === 'string' && key)
    .map(([key, value]) => [key, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0)]));

  return {
    policyVersion: Math.max(1, Number.isFinite(Number(raw.policyVersion)) ? Number(raw.policyVersion) : MUTATION_POLICY_VERSION),
    accountRevision: Math.max(0, Number.isFinite(Number(raw.accountRevision)) ? Number(raw.accountRevision) : 0),
    learnerRevisions,
  };
}

function syncDebugEnabled() {
  const explicit = globalThis.KS2_SYNC_DEBUG;
  if (explicit === true || explicit === 'true' || explicit === '1') return true;

  try {
    const stored = globalThis.localStorage?.getItem?.('ks2-sync-debug');
    return stored === '1' || stored === 'true';
  } catch {
    return false;
  }
}

function shouldLogSync(level) {
  const normalised = String(level || 'log').toLowerCase();
  if (normalised === 'info' || normalised === 'debug' || normalised === 'log') {
    return syncDebugEnabled();
  }
  return true;
}

function logSync(level, event, details = {}) {
  if (!shouldLogSync(level)) return;

  const payload = {
    event,
    ...cloneSerialisable(details),
    at: new Date().toISOString(),
  };
  const fn = globalThis.console?.[level] || globalThis.console?.log;
  if (!fn) return;
  try {
    fn('[ks2-sync]', JSON.stringify(payload));
  } catch {
    fn('[ks2-sync]', payload);
  }
}

function eventToken(event) {
  if (typeof event?.id === 'string' && event.id) return event.id;
  if (typeof event?.type === 'string') {
    return [
      event.type,
      event.learnerId || '',
      event.sessionId || '',
      event.wordSlug || '',
      event.monsterId || '',
      event.createdAt || '',
    ].join(':');
  }
  if (typeof event?.kind === 'string') {
    return [
      'reward',
      event.kind,
      event.learnerId || '',
      event.monsterId || '',
      event.createdAt || '',
    ].join(':');
  }
  return null;
}

function operationKey(kind, payload = {}) {
  if (kind === 'learners.write') return 'learners';
  if (kind === 'subjectStates.put' || kind === 'subjectStates.delete') {
    return `subjectState:${subjectStateKey(payload.learnerId, payload.subjectId)}`;
  }
  if (kind === 'subjectStates.clearLearner') return `subjectStateLearner:${payload.learnerId || 'default'}`;
  if (kind === 'practiceSessions.put') return `practiceSession:${practiceSessionKey(payload.record)}`;
  if (kind === 'practiceSessions.delete') return `practiceSessionClear:${payload.learnerId || 'default'}:${payload.subjectId || 'all'}`;
  if (kind === 'practiceSessions.clearLearner') return `practiceSessionLearner:${payload.learnerId || 'default'}`;
  if (kind === 'gameState.put' || kind === 'gameState.delete') {
    return `gameState:${gameStateKey(payload.learnerId, payload.systemId)}`;
  }
  if (kind === 'gameState.clearLearner') return `gameStateLearner:${payload.learnerId || 'default'}`;
  if (kind === 'eventLog.append') return `event:${eventToken(payload.event) || payload.id || uid('event')}`;
  if (kind === 'eventLog.clearLearner') return `eventLogLearner:${payload.learnerId || 'default'}`;
  if (kind === 'debug.reset') return 'debug/reset';
  return `${kind}:${payload.id || uid('op')}`;
}

function operationScope(raw) {
  if (raw.kind === 'learners.write' || raw.kind === 'debug.reset') {
    return { scopeType: 'account', scopeId: 'account' };
  }
  const learnerId = raw.record?.learnerId || raw.learnerId || raw.event?.learnerId || 'default';
  return { scopeType: 'learner', scopeId: learnerId };
}

function normalisePendingOperation(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : null;
  if (!raw || typeof raw.kind !== 'string' || !raw.kind) return null;
  const createdAt = nowTs(raw.createdAt);
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid('sync');
  const status = raw.status === OPERATION_STATUS_BLOCKED_STALE ? OPERATION_STATUS_BLOCKED_STALE : OPERATION_STATUS_PENDING;
  const scope = operationScope(raw);
  const expectedRevision = Math.max(0, Number.isFinite(Number(raw.expectedRevision)) ? Number(raw.expectedRevision) : 0);
  const correlationId = typeof raw.correlationId === 'string' && raw.correlationId ? raw.correlationId : id;

  switch (raw.kind) {
    case 'learners.write':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        snapshot: normaliseLearnersSnapshot(raw.snapshot),
      };
    case 'subjectStates.put':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
        subjectId: raw.subjectId || 'unknown',
        mergeStrategy: SUBJECT_STATE_MERGE_STRATEGIES.has(raw.mergeStrategy) ? raw.mergeStrategy : 'merge',
        record: normaliseSubjectStateRecord(raw.record),
      };
    case 'subjectStates.delete':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
        subjectId: raw.subjectId || 'unknown',
      };
    case 'subjectStates.clearLearner':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
      };
    case 'practiceSessions.put': {
      const record = normalisePracticeSessionRecord(raw.record);
      if (!record.id || !record.learnerId || !record.subjectId) return null;
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, { record }),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        record,
      };
    }
    case 'practiceSessions.delete':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
        subjectId: raw.subjectId || null,
      };
    case 'practiceSessions.clearLearner':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
      };
    case 'gameState.put':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
        systemId: raw.systemId || 'unknown',
        state: cloneSerialisable(raw.state) || {},
      };
    case 'gameState.delete':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
        systemId: raw.systemId || 'unknown',
      };
    case 'gameState.clearLearner':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
      };
    case 'eventLog.append': {
      const event = cloneSerialisable(raw.event) || null;
      if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, { event, id }),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        event,
      };
    }
    case 'eventLog.clearLearner':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
        learnerId: raw.learnerId || 'default',
      };
    case 'debug.reset':
      return {
        id,
        kind: raw.kind,
        key: operationKey(raw.kind, raw),
        createdAt,
        status,
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        expectedRevision,
        correlationId,
      };
    default:
      return null;
  }
}

function normalisePendingOperations(rawValue) {
  const input = Array.isArray(rawValue) ? rawValue : [];
  return input.map(normalisePendingOperation).filter(Boolean);
}

function normaliseBootstrapBackoff(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : null;
  if (!raw) return null;
  const retryAt = Number(raw.retryAt);
  if (!Number.isFinite(retryAt) || retryAt <= 0) return null;
  const attempt = Math.max(1, Math.floor(Number(raw.attempt) || 1));
  const retryAfterMs = Math.max(0, Math.floor(Number(raw.retryAfterMs) || 0));
  const reasonRaw = raw.reason && typeof raw.reason === 'object' && !Array.isArray(raw.reason)
    ? raw.reason
    : {};
  return {
    attempt,
    retryAfterMs,
    retryAt,
    reason: {
      code: typeof reasonRaw.code === 'string' && reasonRaw.code ? reasonRaw.code : null,
      status: Number.isFinite(Number(reasonRaw.status)) ? Number(reasonRaw.status) : 0,
      message: typeof reasonRaw.message === 'string' && reasonRaw.message ? reasonRaw.message : 'Bootstrap failed.',
    },
  };
}

function loadCachedState(storage, storageKey) {
  const raw = loadCollection(storage, storageKey, null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    // U8 coord-race fix (adv-u7-coord-001): `bootstrapRevisionHash` must
    // survive page loads. Without persistence, the factory re-inits
    // `lastKnownBootstrapRevision` to `null` on every page load, so the
    // U7 `notModified` POST short-circuit NEVER fires — every reload
    // does a full GET bootstrap, which both defeats U7 and widens the
    // multi-tab leader-lease window that U8 relies on. Guard the type
    // so a malformed persisted value degrades gracefully to `null`.
    const persistedRevisionHash = typeof raw.bootstrapRevisionHash === 'string' && raw.bootstrapRevisionHash
      ? raw.bootstrapRevisionHash
      : null;
    return {
      bundle: normaliseRepositoryBundle(raw.bundle || raw),
      pendingOperations: normalisePendingOperations(raw.pendingOperations),
      syncState: normaliseSyncState(raw.syncState),
      monsterVisualConfig: normaliseMonsterVisualRuntimeConfig(raw.monsterVisualConfig),
      bootstrapBackoff: normaliseBootstrapBackoff(raw.bootstrapBackoff),
      bootstrapRevisionHash: persistedRevisionHash,
    };
  }
  return {
    bundle: emptyApiBundle(),
    pendingOperations: [],
    syncState: emptySyncState(),
    monsterVisualConfig: null,
    bootstrapBackoff: null,
    bootstrapRevisionHash: null,
  };
}

function persistCachedState(storage, storageKey, bundle, pendingOperations, syncState, monsterVisualConfig, bootstrapBackoff, bootstrapRevisionHash) {
  try {
    // U8 coord-race fix (adv-u7-coord-001): emit `bootstrapRevisionHash`
    // only when non-null so we do not bloat the cache with redundant
    // null entries on cold-start writes. Guarded string type so any
    // stray non-string value (paranoia check) is coerced away.
    const payload = {
      bundle,
      pendingOperations,
      syncState,
      monsterVisualConfig,
      bootstrapBackoff: normaliseBootstrapBackoff(bootstrapBackoff),
    };
    if (typeof bootstrapRevisionHash === 'string' && bootstrapRevisionHash) {
      payload.bootstrapRevisionHash = bootstrapRevisionHash;
    }
    storage?.setItem?.(storageKey, JSON.stringify(payload));
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function readBootstrapCoordination(storage, storageKey, now) {
  let raw;
  try {
    raw = storage?.getItem?.(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const ownerId = typeof parsed?.ownerId === 'string' && parsed.ownerId ? parsed.ownerId : '';
  const expiresAt = Number(parsed?.expiresAt);
  const startedAt = Number(parsed?.startedAt);
  if (!ownerId || !Number.isFinite(expiresAt) || expiresAt <= now) return null;

  return {
    ownerId,
    startedAt: Number.isFinite(startedAt) ? startedAt : 0,
    expiresAt,
    remainingMs: Math.max(0, expiresAt - now),
  };
}

// U8: detect the follower-timed-out signal. A raw stored lease whose
// `expiresAt <= now` means a previous leader tab never released its
// lease (crashed or closed mid-bootstrap). The next tab taking over
// bumps `bootstrapFollowerTimedOut` before acquiring its own lease.
function readExpiredBootstrapCoordinationLease(storage, storageKey, now) {
  let raw;
  try {
    raw = storage?.getItem?.(storageKey);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const ownerId = typeof parsed?.ownerId === 'string' && parsed.ownerId ? parsed.ownerId : '';
  const expiresAt = Number(parsed?.expiresAt);
  if (!ownerId || !Number.isFinite(expiresAt)) return null;
  if (expiresAt > now) return null;
  return { ownerId, expiresAt };
}

function writeBootstrapCoordination(storage, storageKey, lease) {
  try {
    storage?.setItem?.(storageKey, JSON.stringify(lease));
    return true;
  } catch {
    return false;
  }
}

function clearBootstrapCoordination(storage, storageKey, ownerId, now) {
  const active = readBootstrapCoordination(storage, storageKey, now);
  if (active && active.ownerId !== ownerId) return;
  try {
    storage?.removeItem?.(storageKey);
  } catch {
    // Coordination is best-effort; stale leases expire quickly.
  }
}

function upsertPracticeSession(records, record) {
  const next = normalisePracticeSessionRecord(record);
  if (!next.id || !next.learnerId || !next.subjectId) return filterSessions(records);
  const key = practiceSessionKey(next);
  const output = filterSessions(records);
  const index = output.findIndex((entry) => practiceSessionKey(entry) === key);
  if (index >= 0) output[index] = next;
  else output.push(next);
  return output;
}

function dedupeEventLog(events) {
  const seen = new Set();
  const output = [];
  for (const event of Array.isArray(events) ? events : []) {
    const next = cloneSerialisable(event) || null;
    if (!next || typeof next !== 'object' || Array.isArray(next)) continue;
    const token = eventToken(next);
    if (token && seen.has(token)) continue;
    if (token) seen.add(token);
    output.push(next);
  }
  return output.slice(-1000);
}

function applyOperationToBundle(bundle, operation) {
  switch (operation.kind) {
    case 'learners.write':
      bundle.learners = normaliseLearnersSnapshot(operation.snapshot);
      return bundle;
    case 'subjectStates.put':
      bundle.subjectStates[subjectStateKey(operation.learnerId, operation.subjectId)] = normaliseSubjectStateRecord(operation.record);
      return bundle;
    case 'subjectStates.delete':
      delete bundle.subjectStates[subjectStateKey(operation.learnerId, operation.subjectId)];
      return bundle;
    case 'subjectStates.clearLearner':
      for (const key of Object.keys(bundle.subjectStates)) {
        if (key.startsWith(`${operation.learnerId || 'default'}::`)) delete bundle.subjectStates[key];
      }
      return bundle;
    case 'practiceSessions.put':
      bundle.practiceSessions = upsertPracticeSession(bundle.practiceSessions, operation.record);
      return bundle;
    case 'practiceSessions.delete':
      bundle.practiceSessions = filterSessions(bundle.practiceSessions)
        .filter((record) => !(record.learnerId === operation.learnerId && record.subjectId === operation.subjectId));
      return bundle;
    case 'practiceSessions.clearLearner':
      bundle.practiceSessions = filterSessions(bundle.practiceSessions)
        .filter((record) => record.learnerId !== operation.learnerId);
      return bundle;
    case 'gameState.put':
      bundle.gameState[gameStateKey(operation.learnerId, operation.systemId)] = cloneSerialisable(operation.state) || {};
      return bundle;
    case 'gameState.delete':
      delete bundle.gameState[gameStateKey(operation.learnerId, operation.systemId)];
      return bundle;
    case 'gameState.clearLearner':
      for (const key of Object.keys(bundle.gameState)) {
        if (key.startsWith(`${operation.learnerId || 'default'}::`)) delete bundle.gameState[key];
      }
      return bundle;
    case 'eventLog.append':
      bundle.eventLog = dedupeEventLog([...(Array.isArray(bundle.eventLog) ? bundle.eventLog : []), operation.event]);
      return bundle;
    case 'eventLog.clearLearner':
      bundle.eventLog = dedupeEventLog((Array.isArray(bundle.eventLog) ? bundle.eventLog : [])
        .filter((event) => event?.learnerId !== operation.learnerId));
      return bundle;
    case 'debug.reset':
      bundle.meta = currentRepositoryMeta();
      bundle.learners = emptyLearnersSnapshot();
      bundle.subjectStates = {};
      bundle.practiceSessions = [];
      bundle.gameState = {};
      bundle.eventLog = [];
      return bundle;
    default:
      return bundle;
  }
}

function cloneSyncState(syncState) {
  return normaliseSyncState(cloneSerialisable(syncState));
}

function setScopeRevision(syncState, scopeType, scopeId, appliedRevision) {
  const next = cloneSyncState(syncState);
  const revision = Math.max(0, Number.isFinite(Number(appliedRevision)) ? Number(appliedRevision) : 0);
  if (scopeType === 'account') {
    next.accountRevision = revision;
    return next;
  }
  const learnerId = scopeId || 'default';
  next.learnerRevisions[learnerId] = revision;
  return next;
}

function syncStateFromMutationResponse(syncState, operation, payload) {
  const remoteSyncState = payload && typeof payload === 'object' && !Array.isArray(payload) && payload.syncState
    ? normaliseSyncState(payload.syncState)
    : null;
  if (remoteSyncState) return remoteSyncState;

  const mutation = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload.mutation
    : null;
  const appliedRevision = Number(mutation?.appliedRevision);
  if (!Number.isFinite(appliedRevision)) return cloneSyncState(syncState);
  return setScopeRevision(syncState, operation.scopeType, operation.scopeId, appliedRevision);
}

function advanceSyncState(syncState, operation) {
  const next = cloneSyncState(syncState);
  if (operation.scopeType === 'account') {
    next.accountRevision += 1;
    if (operation.kind === 'debug.reset') next.learnerRevisions = {};
    return next;
  }
  const learnerId = operation.scopeId || operation.learnerId || 'default';
  next.learnerRevisions[learnerId] = Math.max(0, Number(next.learnerRevisions[learnerId]) || 0) + 1;
  return next;
}

function applyPendingOperations(bundle, operations) {
  const next = normaliseRepositoryBundle(cloneSerialisable(bundle));
  for (const operation of normalisePendingOperations(operations)) {
    if (operation.status !== OPERATION_STATUS_PENDING) continue;
    applyOperationToBundle(next, operation);
  }
  return next;
}

function replaySyncState(baseSyncState, operations) {
  let next = cloneSyncState(baseSyncState);
  for (const operation of normalisePendingOperations(operations)) {
    if (operation.status !== OPERATION_STATUS_PENDING) continue;
    next = advanceSyncState(next, operation);
  }
  return next;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergePlainObjects(baseValue, patchValue) {
  const base = plainObject(baseValue) ? cloneSerialisable(baseValue) : {};
  const patch = plainObject(patchValue) ? cloneSerialisable(patchValue) : {};
  const output = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = plainObject(output[key]) && plainObject(value)
      ? mergePlainObjects(output[key], value)
      : cloneSerialisable(value);
  }
  return output;
}

function mergeSubjectStateForRebase(baseRecord, localRecord, strategy = 'merge') {
  const base = normaliseSubjectStateRecord(baseRecord);
  const local = normaliseSubjectStateRecord(localRecord);
  if (strategy === 'replace') return local;
  if (strategy === 'ui') {
    return normaliseSubjectStateRecord({
      ui: local.ui ? mergePlainObjects(base.ui, local.ui) : base.ui,
      data: base.data,
      updatedAt: Math.max(Number(base.updatedAt) || 0, Number(local.updatedAt) || 0),
    });
  }
  if (strategy === 'data') {
    return normaliseSubjectStateRecord({
      ui: base.ui,
      data: mergePlainObjects(base.data, local.data),
      updatedAt: Math.max(Number(base.updatedAt) || 0, Number(local.updatedAt) || 0),
    });
  }

  return normaliseSubjectStateRecord({
    ui: local.ui ? mergePlainObjects(base.ui, local.ui) : base.ui,
    data: mergePlainObjects(base.data, local.data),
    updatedAt: Math.max(Number(base.updatedAt) || 0, Number(local.updatedAt) || 0),
  });
}

function mergeLearnersSnapshotForRebase(baseSnapshot, localSnapshot) {
  const base = normaliseLearnersSnapshot(baseSnapshot);
  const local = normaliseLearnersSnapshot(localSnapshot);
  const byId = {
    ...base.byId,
    ...local.byId,
  };
  const allIds = [
    ...local.allIds.filter((learnerId) => byId[learnerId]),
    ...base.allIds.filter((learnerId) => byId[learnerId] && !local.allIds.includes(learnerId)),
  ];
  const selectedId = local.selectedId && byId[local.selectedId]
    ? local.selectedId
    : (base.selectedId && byId[base.selectedId] ? base.selectedId : (allIds[0] || null));
  return normaliseLearnersSnapshot({ byId, allIds, selectedId });
}

function rebaseOperationPayload(operation, baseBundle) {
  if (operation.kind === 'learners.write') {
    return {
      ...operation,
      snapshot: mergeLearnersSnapshotForRebase(baseBundle.learners, operation.snapshot),
    };
  }

  if (operation.kind === 'subjectStates.put') {
    const key = subjectStateKey(operation.learnerId, operation.subjectId);
    return {
      ...operation,
      record: mergeSubjectStateForRebase(baseBundle.subjectStates[key], operation.record, operation.mergeStrategy),
    };
  }

  if (operation.kind === 'gameState.put') {
    const key = gameStateKey(operation.learnerId, operation.systemId);
    return {
      ...operation,
      state: mergePlainObjects(baseBundle.gameState[key], operation.state),
    };
  }

  return operation;
}

function expectedRevisionForOperation(syncState, operation) {
  const currentSyncState = cloneSyncState(syncState);
  if (operation.scopeType === 'account') return currentSyncState.accountRevision;
  return Math.max(0, Number(currentSyncState.learnerRevisions[operation.scopeId]) || 0);
}

function rebaseOperationsForSyncState(operations, baseSyncState, baseBundle = emptyApiBundle(), { rebasePayloads = false } = {}) {
  let nextSyncState = cloneSyncState(baseSyncState);
  const workingBundle = normaliseRepositoryBundle(cloneSerialisable(baseBundle));
  let rebasedCount = 0;
  let unblockedCount = 0;
  const rebasedOperations = normalisePendingOperations(operations).map((operation) => {
    const rebasedPayloadOperation = rebasePayloads ? rebaseOperationPayload(operation, workingBundle) : operation;
    const expectedRevision = expectedRevisionForOperation(nextSyncState, rebasedPayloadOperation);
    const wasBlocked = operation.status === OPERATION_STATUS_BLOCKED_STALE;
    const nextOperation = {
      ...rebasedPayloadOperation,
      status: OPERATION_STATUS_PENDING,
      expectedRevision,
    };
    if (wasBlocked) unblockedCount += 1;
    if (
      wasBlocked
      || operation.expectedRevision !== expectedRevision
      || JSON.stringify(operation.record || operation.state || null) !== JSON.stringify(nextOperation.record || nextOperation.state || null)
    ) {
      rebasedCount += 1;
    }
    nextSyncState = advanceSyncState(nextSyncState, nextOperation);
    if (rebasePayloads) applyOperationToBundle(workingBundle, nextOperation);
    return nextOperation;
  });
  return {
    operations: rebasedOperations,
    syncState: nextSyncState,
    rebasedCount,
    unblockedCount,
  };
}

function createOperation(kind, payload = {}, syncState = emptySyncState(), now = Date.now) {
  const scope = operationScope({ kind, ...payload });
  const currentSyncState = cloneSyncState(syncState);
  const expectedRevision = scope.scopeType === 'account'
    ? currentSyncState.accountRevision
    : Math.max(0, Number(currentSyncState.learnerRevisions[scope.scopeId]) || 0);
  const operation = normalisePendingOperation({
    id: uid('sync'),
    kind,
    createdAt: nowTs(now),
    status: OPERATION_STATUS_PENDING,
    expectedRevision,
    correlationId: uid('corr'),
    ...payload,
  });
  if (!operation) throw new TypeError(`Could not create pending operation for ${kind}.`);
  return operation;
}

function classifyError(error, fallbackScope = 'remote-sync') {
  if (error instanceof RepositoryHttpError) {
    const retryable = error.status >= 500 || error.status === 0;
    const staleWrite = error.status === 409 && error.code === 'stale_write';
    return createPersistenceError({
      phase: error.status === 409 ? 'remote-conflict' : 'remote-write',
      scope: fallbackScope,
      code: error.code || (error.status === 409 ? 'conflict' : 'remote_error'),
      message: error.payload?.message || error.text || error.message,
      retryable: staleWrite ? true : retryable,
      correlationId: error.correlationId,
      resolution: staleWrite ? 'retry-sync-rebase-latest' : (error.status === 409 ? 'retry-sync-reloads-latest' : 'retry-sync'),
      details: {
        status: error.status,
        payload: error.payload && typeof error.payload === 'object' ? error.payload : null,
        url: error.url,
        method: error.method,
      },
    });
  }

  return createPersistenceError({
    phase: 'remote-write',
    scope: fallbackScope,
    code: 'network_error',
    message: error?.message || String(error),
    retryable: true,
    resolution: 'retry-sync',
  });
}

function hasCacheFallback(bundle, operations) {
  const cache = normaliseRepositoryBundle(bundle);
  return Boolean(
    cache.learners.allIds.length
    || Object.keys(cache.subjectStates).length
    || filterSessions(cache.practiceSessions).length
    || Object.keys(cache.gameState).length
    || (Array.isArray(cache.eventLog) && cache.eventLog.length)
    || countPending(operations),
  );
}

function isBootstrapBackoffError(error) {
  if (!(error instanceof RepositoryHttpError)) return false;
  if (error.status >= 500) return true;

  const signal = [
    error.code,
    error.payload?.code,
    error.payload?.message,
    error.text,
    error.message,
  ].filter(Boolean).join(' ').toLowerCase();

  return signal.includes('exceededcpu')
    || signal.includes('exceeded cpu')
    || signal.includes('cpu limit')
    || signal.includes('error 1102')
    || signal.includes('1102');
}

function boundedJitter(random) {
  const raw = typeof random === 'function' ? Number(random()) : 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.floor(Math.min(1, Math.max(0, raw)) * BOOTSTRAP_BACKOFF_JITTER_MS);
}

function bootstrapBackoffDelay(attempt, random) {
  const exponent = Math.max(0, Math.min(8, Number(attempt) - 1));
  const baseDelay = Math.min(BOOTSTRAP_BACKOFF_MAX_MS, BOOTSTRAP_BACKOFF_BASE_MS * (2 ** exponent));
  return Math.min(BOOTSTRAP_BACKOFF_MAX_MS, baseDelay + boundedJitter(random));
}

function isBootstrapPersistenceError(error) {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
  return error.scope === '/api/bootstrap'
    || error.code === 'bootstrap_retry_backoff'
    || Boolean(error.details?.bootstrapBackoff)
    || String(error.details?.url || '').endsWith('/api/bootstrap');
}

function countPending(operations) {
  return normalisePendingOperations(operations).length;
}

function hasBlockedOperations(operations) {
  return normalisePendingOperations(operations).some((operation) => operation.status === OPERATION_STATUS_BLOCKED_STALE);
}

function firstQueueOperation(operations) {
  return normalisePendingOperations(operations)[0] || null;
}

function operationsShareConflictBranch(operation, blockedOperation) {
  if (!operation || !blockedOperation) return false;
  if (operation.scopeType === 'account' || blockedOperation.scopeType === 'account') return true;
  return operation.scopeType === 'learner'
    && blockedOperation.scopeType === 'learner'
    && operation.scopeId === blockedOperation.scopeId;
}

function blockedBranchOperations(operations) {
  return normalisePendingOperations(operations)
    .filter((operation) => operation.status === OPERATION_STATUS_BLOCKED_STALE);
}

function operationInBlockedBranch(operation, operations) {
  const blocked = blockedBranchOperations(operations);
  return blocked.some((blockedOperation) => operationsShareConflictBranch(operation, blockedOperation));
}

function blockOperationsForConflict(operations, failedOperation) {
  let seenFailed = false;
  return normalisePendingOperations(operations).map((operation) => {
    if (!seenFailed) {
      if (operation.id === failedOperation.id) {
        seenFailed = true;
        return { ...operation, status: OPERATION_STATUS_BLOCKED_STALE };
      }
      return operation;
    }

    if (failedOperation.scopeType === 'account') {
      return { ...operation, status: OPERATION_STATUS_BLOCKED_STALE };
    }

    if (operationsShareConflictBranch(operation, failedOperation)) {
      return { ...operation, status: OPERATION_STATUS_BLOCKED_STALE };
    }

    return operation;
  });
}

export function createApiPlatformRepositories({
  baseUrl = '',
  fetch: fetchFn = globalThis.fetch,
  storage,
  authSession = createNoopRepositoryAuthSession(),
  cacheScopeKey = null,
  publicReadModels = false,
  now = Date.now,
  random = Math.random,
  legacyRuntimeWritesEnabled = LEGACY_RUNTIME_WRITES_ENABLED,
} = {}) {
  if (typeof fetchFn !== 'function') {
    throw new TypeError('API repositories require a fetch implementation.');
  }

  const legacyWritesEnabled = legacyRuntimeWritesEnabled === true;
  const resolvedStorage = storage || globalThis.localStorage || createNoopStorage();
  const resolvedCacheScopeKey = typeof cacheScopeKey === 'string' && cacheScopeKey
    ? cacheScopeKey
    : repositoryAuthCacheScopeKey(authSession);
  const storageKey = apiCacheStorageKey(resolvedCacheScopeKey);
  const bootstrapCoordinationKey = bootstrapCoordinationStorageKey(storageKey);
  const bootstrapCoordinationOwnerId = uid('bootstrap-tab');
  const cachedState = loadCachedState(resolvedStorage, storageKey);
  const cache = normaliseRepositoryBundle(cachedState.bundle);
  let pendingOperations = normalisePendingOperations(cachedState.pendingOperations)
    .filter((operation) => isReplayablePendingOperation(operation, legacyWritesEnabled));
  let syncState = normaliseSyncState(cachedState.syncState);
  let monsterVisualConfig = normaliseMonsterVisualRuntimeConfig(cachedState.monsterVisualConfig);
  let inFlightWriteCount = 0;
  let lastSyncAt = 0;
  let lastRemoteError = null;
  let lastCacheError = null;
  let processingLoop = Promise.resolve();
  let processing = false;
  let syncScheduled = false;
  let bootstrapBackoff = normaliseBootstrapBackoff(cachedState.bootstrapBackoff);
  // U7: last-known revision hash from the most recent successful
  // bootstrap. Sent on subsequent bootstraps to drive the notModified
  // short-circuit path; reset to null when the cache is rebuilt.
  let lastKnownBootstrapRevision = typeof cachedState?.bootstrapRevisionHash === 'string'
    ? cachedState.bootstrapRevisionHash
    : null;
  // U7: consecutive-missing-metadata counter. Increments when a
  // bootstrap response arrives without `meta.capacity.bootstrapCapacity`;
  // resets on every success that includes it. Three in a row ->
  // operator-visible error and retry suppression.
  let consecutiveMissingBootstrapMetadata = 0;
  let bootstrapMetadataOperatorError = null;

  function currentTime() {
    return nowTs(now);
  }

  function activeBootstrapBackoff() {
    if (!bootstrapBackoff) return null;
    const remainingMs = Math.max(0, bootstrapBackoff.retryAt - currentTime());
    if (remainingMs <= 0) {
      bootstrapBackoff = null;
      return null;
    }
    return {
      ...bootstrapBackoff,
      remainingMs,
    };
  }

  function scheduleBootstrapBackoff(error) {
    const attempt = Math.max(1, Number(bootstrapBackoff?.attempt || 0) + 1);
    const retryAfterMs = bootstrapBackoffDelay(attempt, random);
    const retryAt = currentTime() + retryAfterMs;
    bootstrapBackoff = {
      attempt,
      retryAfterMs,
      retryAt,
      reason: {
        code: error?.code || null,
        status: error instanceof RepositoryHttpError ? error.status : 0,
        message: error?.payload?.message || error?.text || error?.message || 'Bootstrap failed.',
      },
    };
    return bootstrapBackoff;
  }

  function createBootstrapCoordinationBackoff(activeCoordination) {
    const retryAfterMs = Math.min(
      BOOTSTRAP_BACKOFF_BASE_MS,
      Math.max(0, Number(activeCoordination?.remainingMs) || 0),
    );
    return {
      attempt: Math.max(1, Number(bootstrapBackoff?.attempt || 0) + 1),
      retryAfterMs,
      retryAt: currentTime() + retryAfterMs,
      reason: {
        code: 'bootstrap_in_flight',
        status: 0,
        message: 'Another browser tab is already refreshing bootstrap state. Cached data remains available until this tab retries.',
      },
    };
  }

  function backOffForBootstrapCoordination(activeCoordination) {
    const coordinationBackoff = createBootstrapCoordinationBackoff(activeCoordination);
    markRemoteFailure(createBootstrapBackoffError(coordinationBackoff, '/api/bootstrap'));
    // U8: the follower has observed an active foreign lease and has
    // chosen to wait rather than race. One increment per observed
    // foreign lease — the caller controls the "wait" branch transition.
    bumpCapacityMeta('bootstrapFollowerWaited');
  }

  async function confirmBootstrapCoordinationBeforeFetch(lease) {
    if (!lease) return true;
    await Promise.resolve();
    const active = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, currentTime());
    if (!active || active.ownerId === bootstrapCoordinationOwnerId) return true;
    backOffForBootstrapCoordination(active);
    return false;
  }

  function clearBootstrapBackoff() {
    bootstrapBackoff = null;
  }

  function activeBootstrapCoordination() {
    const active = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, currentTime());
    if (!active || active.ownerId === bootstrapCoordinationOwnerId) return null;
    return active;
  }

  // U8 coord-race fix (adv-u7-coord-001): discriminated acquire result.
  //
  // Previous signature returned `null | BootstrapLease`, overloading
  // the null for two very different cases:
  //   (a) localStorage write failed (quota / private mode / managed
  //       profile) — genuine graceful-degradation signal. Caller should
  //       fall through to direct bootstrap.
  //   (b) lost the race to another tab — legitimate follower that
  //       should wait for the leader, not fall through.
  // Post-U7 merge, the fast `notModified` POST path narrowed the leader
  // lease window below the follower's `activeBootstrapCoordination()`
  // check latency, producing the false-null where all three tabs saw
  // "no active foreign lease" and all three fell through to direct
  // bootstrap (coord primitive silently disabled).
  //
  // New contract:
  //   { winner: true,  storageUnavailable: false, ownerId: own-id,
  //     lease: <own-lease> }                     — this tab leads
  //   { winner: false, storageUnavailable: false, ownerId: foreign-id,
  //     lease: null }                            — lost race, should wait
  //   { winner: false, storageUnavailable: true,  ownerId: null,
  //     lease: null }                            — storage failed, degrade
  async function acquireBootstrapCoordination({ skipLeaderCounter = false } = {}) {
    const now = currentTime();
    const active = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, now);
    if (active && active.ownerId !== bootstrapCoordinationOwnerId) {
      return { winner: false, storageUnavailable: false, ownerId: active.ownerId, lease: null };
    }

    // U8: if no live lease is present but a raw expired lease sits in
    // storage from a previous tab that never released it, this tab has
    // just detected the timeout. Count it once before claiming the
    // lease itself. The increment fires BEFORE the write so a failed
    // acquire still records the timeout signal.
    if (!active) {
      const expired = readExpiredBootstrapCoordinationLease(resolvedStorage, bootstrapCoordinationKey, now);
      if (expired && expired.ownerId !== bootstrapCoordinationOwnerId) {
        bumpCapacityMeta('bootstrapFollowerTimedOut');
      }
    }

    const lease = {
      ownerId: bootstrapCoordinationOwnerId,
      startedAt: now,
      expiresAt: now + BOOTSTRAP_COORDINATION_LEASE_MS,
    };
    if (!writeBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, lease)) {
      // U8 round 1 adv-u8-r1-002: localStorage write failed (quota
      // exhausted, Safari Private Browsing, managed-profile Chromebook
      // with site storage disabled). Surface the coordination-bypass
      // path via a dedicated counter so U9 circuit breakers can tune
      // against "storage unavailable" rates. Graceful degradation:
      // the caller falls through to independent bootstrap.
      bumpCapacityMeta('bootstrapCoordinationStorageUnavailable');
      return { winner: false, storageUnavailable: true, ownerId: null, lease: null };
    }

    // U8 coord-race fix (adv-u7-coord-001): wait for cross-tab storage
    // events to settle before confirming ownership. Chromium does not
    // deliver cross-tab `storage` events synchronously — without this
    // delay, three tabs all see their own write reflected immediately
    // and each thinks it won, producing a 3x bootstrap fan-out under
    // Playwright's same-tick `Promise.all` dispatch. 20ms is slightly
    // above typical event-propagation latency on Windows Chromium.
    await new Promise((resolve) => {
      setTimeout(resolve, BOOTSTRAP_ACQUIRE_SETTLE_MS);
    });

    const confirmed = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, currentTime());
    if (confirmed?.ownerId === bootstrapCoordinationOwnerId) {
      // U8: leader path — this tab owns the fresh lease and will run
      // the real fetch. Increment once per successful acquisition so
      // the Playwright scene's "leader count" assertion holds.
      //
      // U8 round 1 adv-u8-r1-001: a cacheDivergence response triggers
      // a recursive `hydrateRemoteState` call on the same tab. The
      // outer lease is still held, so the inner `acquireBootstrapCoordination`
      // reads its own lease and extends it; that is a lease EXTENSION,
      // not a new acquisition, and must NOT re-bump the counter.
      // `skipLeaderCounter` is the internal flag the recursive path
      // threads in; normal call sites leave it false.
      if (!skipLeaderCounter) {
        bumpCapacityMeta('bootstrapLeaderAcquired');
      }
      return { winner: true, storageUnavailable: false, ownerId: bootstrapCoordinationOwnerId, lease };
    }
    // Last-write-wins race: our lease was overwritten by another tab
    // between `setItem` and the post-settle read-back. We are a follower
    // by ownership but we did not get confirmed as owner. Surface the
    // foreign ownerId so the caller can reason about the wait.
    return { winner: false, storageUnavailable: false, ownerId: confirmed?.ownerId || null, lease: null };
  }

  function releaseBootstrapCoordination(lease) {
    if (!lease) return;
    clearBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, bootstrapCoordinationOwnerId, currentTime());
  }

  function createBootstrapBackoffError(backoff, scope = '/api/bootstrap') {
    return createPersistenceError({
      phase: 'remote-degraded',
      scope,
      code: 'bootstrap_retry_backoff',
      message: 'Bootstrap retry is backing off after a retryable server failure. Cached data remains available until the next retry window.',
      retryable: true,
      resolution: 'retry-sync',
      details: {
        attempt: backoff.attempt,
        retryAfterMs: backoff.remainingMs ?? backoff.retryAfterMs,
        retryAt: backoff.retryAt,
        reason: backoff.reason,
      },
      at: currentTime(),
    });
  }

  function attachBootstrapBackoffDetails(persistenceError, backoff) {
    return createPersistenceError({
      ...persistenceError,
      details: {
        ...(persistenceError.details || {}),
        bootstrapBackoff: {
          attempt: backoff.attempt,
          retryAfterMs: backoff.retryAfterMs,
          retryAt: backoff.retryAt,
        },
      },
      at: currentTime(),
    });
  }

  const persistenceChannel = createPersistenceChannel({
    ...defaultPersistenceSnapshot(PERSISTENCE_MODES.REMOTE_SYNC),
    pendingWriteCount: countPending(pendingOperations),
    cacheState: countPending(pendingOperations) ? PERSISTENCE_CACHE_STATES.AHEAD_OF_REMOTE : PERSISTENCE_CACHE_STATES.ALIGNED,
    trustedState: countPending(pendingOperations) ? PERSISTENCE_TRUSTED_STATES.LOCAL_CACHE : PERSISTENCE_TRUSTED_STATES.REMOTE,
  });

  // U9: five named circuit breakers. State lives under
  // `persistenceChannel.read().breakers.*` for internal observability;
  // UI components only read `persistenceChannel.read().breakersDegraded`
  // (the minimal boolean map) per plan line 878.
  //
  // `bootstrapCapacityMetadata` is the only breaker with `cooldownMaxMs:
  // Infinity` — it never auto-recovers; operator action resumes the
  // surface. All other breakers use the default 500ms base / 30s cap /
  // 2x curve + failureThreshold=3.
  const breakerStorage = resolvedStorage;
  // U9.1 item 5: microtask-batched recompute. When N breakers transition
  // simultaneously (e.g. a bulk-reset or multi-surface 5xx burst), each
  // transition's `onTransition` fires this callback. Without batching,
  // `recomputePersistence()` fires N times synchronously — O(N^2) for
  // subscribers that read the full snapshot on every notification. The
  // microtask defer schedules a single recompute after all synchronous
  // transition callbacks have returned.
  let breakerRecomputeScheduled = false;
  const scheduleBreakerRecompute = () => {
    if (breakerRecomputeScheduled) return;
    breakerRecomputeScheduled = true;
    queueMicrotask(() => {
      breakerRecomputeScheduled = false;
      recomputePersistence();
    });
  };
  const breakers = {
    parentHubRecentSessions: createCircuitBreaker({
      name: 'parentHubRecentSessions',
      now: () => currentTime(),
      storage: breakerStorage,
      onTransition: scheduleBreakerRecompute,
    }),
    parentHubActivity: createCircuitBreaker({
      name: 'parentHubActivity',
      now: () => currentTime(),
      storage: breakerStorage,
      onTransition: scheduleBreakerRecompute,
    }),
    classroomSummary: createCircuitBreaker({
      name: 'classroomSummary',
      now: () => currentTime(),
      storage: breakerStorage,
      onTransition: scheduleBreakerRecompute,
    }),
    readModelDerivedWrite: createCircuitBreaker({
      name: 'readModelDerivedWrite',
      now: () => currentTime(),
      storage: breakerStorage,
      onTransition: scheduleBreakerRecompute,
    }),
    bootstrapCapacityMetadata: createCircuitBreaker({
      name: 'bootstrapCapacityMetadata',
      failureThreshold: 3,
      cooldownMaxMs: Infinity,
      now: () => currentTime(),
      storage: breakerStorage,
      onTransition: scheduleBreakerRecompute,
    }),
  };

  // P4/U7: registered listeners for breaker-reset events. Fired from the
  // composition root's explicit `reset()` call sites (NOT from the
  // breaker primitive's `onTransition`) whenever a breaker transitions
  // to `closed`. The store's `clearStaleFetchGuards()` is the primary
  // consumer — it clears the sticky per-session learner-fetch guard so
  // sibling learner stats can be re-fetched after recovery.
  const breakerResetListeners = new Set();

  function fireBreakerResetListeners(breakerName) {
    for (const listener of breakerResetListeners) {
      try { listener({ breakerName }); } catch { /* listener throw swallowed */ }
    }
  }

  function currentBreakersSnapshot() {
    const output = {};
    for (const [key, breaker] of Object.entries(breakers)) {
      output[key] = breaker.snapshot();
    }
    return output;
  }

  function currentBreakersDegradedMap() {
    return buildBreakersDegradedMap(breakers);
  }

  function persistLocalCache(scope = 'api-cache') {
    cache.meta = currentRepositoryMeta();
    const error = persistCachedState(
      resolvedStorage,
      storageKey,
      cache,
      pendingOperations,
      syncState,
      monsterVisualConfig,
      bootstrapBackoff,
      // U8 coord-race fix (adv-u7-coord-001): persist the U7 revision
      // hash so the POST notModified short-circuit survives reloads.
      // `persistCachedState` guards the type and omits the field when
      // null, so cold-start writes are unaffected.
      lastKnownBootstrapRevision,
    );
    if (error) {
      lastCacheError = createPersistenceError({
        phase: 'cache-write',
        scope,
        code: 'cache_write_failed',
        message: error.message || String(error),
        retryable: true,
        resolution: 'retry-sync',
      });
    } else {
      lastCacheError = null;
    }
    recomputePersistence();
    return !error;
  }

  function persistBootstrapBackoff(scope = 'bootstrap-backoff') {
    const sharedState = loadCachedState(resolvedStorage, storageKey);
    const error = persistCachedState(
      resolvedStorage,
      storageKey,
      sharedState.bundle,
      sharedState.pendingOperations,
      sharedState.syncState,
      sharedState.monsterVisualConfig,
      bootstrapBackoff,
      // U8 coord-race fix (adv-u7-coord-001): preserve any persisted
      // revision hash from the shared state we just loaded. A backoff
      // write must not destroy the U7 optimisation that other writers
      // committed.
      sharedState.bootstrapRevisionHash,
    );
    if (error) {
      lastCacheError = createPersistenceError({
        phase: 'cache-write',
        scope,
        code: 'cache_write_failed',
        message: error.message || String(error),
        retryable: true,
        resolution: 'retry-sync',
      });
    } else {
      lastCacheError = null;
    }
    recomputePersistence();
    return !error;
  }

  function currentLastError() {
    if (lastRemoteError) return lastRemoteError;
    if (lastCacheError) return lastCacheError;
    if (countPending(pendingOperations) > 0) {
      const blocked = hasBlockedOperations(pendingOperations);
      const activeSync = syncScheduled || processing || inFlightWriteCount > 0;
      if (!blocked && activeSync) return null;

      return createPersistenceError({
        phase: blocked ? 'remote-conflict' : 'pending-sync',
        scope: 'remote-cache',
        code: blocked ? 'stale_write' : 'pending_sync',
        message: blocked
          ? 'A newer remote change blocked one or more local writes. Retry sync will reload the latest remote state and reapply this browser\'s pending changes.'
          : `${countPending(pendingOperations)} cached change${countPending(pendingOperations) === 1 ? '' : 's'} still need remote sync.`,
        retryable: true,
        resolution: blocked ? 'retry-sync-rebase-latest' : 'retry-sync',
      });
    }
    return null;
  }

  function recomputePersistence() {
    const pendingWriteCount = countPending(pendingOperations);
    const lastError = currentLastError();
    const blocked = hasBlockedOperations(pendingOperations);
    // U9: include breaker snapshots + aggregate boolean map in every
    // recompute so subscribers observe transition edges without a
    // separate channel.
    const breakersSnapshot = currentBreakersSnapshot();
    const breakersDegraded = currentBreakersDegradedMap();

    if (lastError || blocked) {
      const trustedState = lastCacheError
        ? PERSISTENCE_TRUSTED_STATES.MEMORY
        : (blocked ? PERSISTENCE_TRUSTED_STATES.LOCAL_CACHE : PERSISTENCE_TRUSTED_STATES.LOCAL_CACHE);
      const cacheState = lastCacheError
        ? PERSISTENCE_CACHE_STATES.MEMORY_ONLY
        : (pendingWriteCount > 0 ? PERSISTENCE_CACHE_STATES.AHEAD_OF_REMOTE : PERSISTENCE_CACHE_STATES.STALE_COPY);
      return persistenceChannel.set({
        mode: PERSISTENCE_MODES.DEGRADED,
        remoteAvailable: true,
        trustedState,
        cacheState,
        pendingWriteCount,
        inFlightWriteCount,
        lastSyncAt,
        lastError,
        updatedAt: nowTs(),
        breakers: breakersSnapshot,
        breakersDegraded,
      });
    }

    return persistenceChannel.set({
      mode: PERSISTENCE_MODES.REMOTE_SYNC,
      remoteAvailable: true,
      trustedState: pendingWriteCount > 0 ? PERSISTENCE_TRUSTED_STATES.LOCAL_CACHE : PERSISTENCE_TRUSTED_STATES.REMOTE,
      cacheState: pendingWriteCount > 0 ? PERSISTENCE_CACHE_STATES.AHEAD_OF_REMOTE : PERSISTENCE_CACHE_STATES.ALIGNED,
      pendingWriteCount,
      inFlightWriteCount,
      lastSyncAt,
      lastError: null,
      updatedAt: nowTs(),
      breakers: breakersSnapshot,
      breakersDegraded,
    });
  }

  function markRemoteSuccess({ bootstrap = false } = {}) {
    if (bootstrap) clearBootstrapBackoff();
    if (bootstrap || !isBootstrapPersistenceError(lastRemoteError)) {
      lastRemoteError = null;
    }
    lastSyncAt = currentTime();
    recomputePersistence();
  }

  function markRemoteFailure(error) {
    lastRemoteError = error;
    recomputePersistence();
  }

  function assertRuntimeWriteAllowed(kind) {
    if (legacyWritesEnabled) return;
    throw new Error(`Runtime writes must use the subject command boundary (${kind}).`);
  }

  function removeOperationById(id) {
    const next = pendingOperations.filter((operation) => operation.id !== id);
    const removed = next.length !== pendingOperations.length;
    if (removed) pendingOperations = next;
    return removed;
  }

  function applyHydratedState(remoteBundle, remoteSyncState, { rebasePending = false, rebasePayloads = false } = {}) {
    const localSelectedId = cache.learners.selectedId;
    const rebase = rebasePending
      ? rebaseOperationsForSyncState(pendingOperations, remoteSyncState, remoteBundle, { rebasePayloads })
      : {
        operations: normalisePendingOperations(pendingOperations),
        syncState: replaySyncState(remoteSyncState, pendingOperations),
        rebasedCount: 0,
        unblockedCount: 0,
      };
    pendingOperations = rebase.operations;
    const effectiveBundle = applyPendingOperations(remoteBundle, pendingOperations);
    cache.meta = currentRepositoryMeta();
    const selectedId = typeof localSelectedId === 'string' && effectiveBundle.learners.byId[localSelectedId]
      ? localSelectedId
      : effectiveBundle.learners.selectedId;
    cache.learners = { ...effectiveBundle.learners, selectedId };
    cache.subjectStates = effectiveBundle.subjectStates;
    cache.practiceSessions = effectiveBundle.practiceSessions;
    cache.gameState = effectiveBundle.gameState;
    cache.eventLog = effectiveBundle.eventLog;
    syncState = rebase.syncState;
    return rebase;
  }

  function cacheSubjectUi(learnerId, subjectId, ui, { scope = 'subject-state-cache' } = {}) {
    const key = subjectStateKey(learnerId, subjectId);
    const current = normaliseSubjectStateRecord(cache.subjectStates[key]);
    const next = normaliseSubjectStateRecord(mergeSubjectUi(current, ui, nowTs()));
    cache.subjectStates[key] = next;
    persistLocalCache(scope);
    return next;
  }

  function appendCommandEvents(events = []) {
    const current = Array.isArray(cache.eventLog) ? cache.eventLog : [];
    const seen = new Set(current.map(eventToken).filter(Boolean));
    const additions = [];
    for (const event of Array.isArray(events) ? events : []) {
      const next = cloneSerialisable(event) || null;
      if (!next || typeof next !== 'object' || Array.isArray(next)) continue;
      const token = eventToken(next);
      if (token && seen.has(token)) continue;
      if (token) seen.add(token);
      additions.push(next);
    }
    if (additions.length) {
      cache.eventLog = [...current, ...additions];
    }
  }

  function applyLearnerRevisionHint(learnerId, revision) {
    const cleanLearnerId = String(learnerId || '').trim();
    if (revision == null || (typeof revision === 'string' && !revision.trim())) return false;
    const hintedRevision = Number(revision);
    if (!cleanLearnerId || !Number.isFinite(hintedRevision) || hintedRevision < 0) return false;

    const current = normaliseSyncState(syncState);
    const currentRevision = Math.max(0, Number(current.learnerRevisions?.[cleanLearnerId]) || 0);
    if (hintedRevision < currentRevision) return false;

    syncState = setScopeRevision(syncState, 'learner', cleanLearnerId, hintedRevision);
    persistLocalCache('subject-command:stale-revision-hint');
    return true;
  }

  function applyCommandResultToCache({ learnerId, subjectId, response } = {}) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
    const readModel = response.subjectReadModel || null;
    if (readModel) {
      cacheSubjectUi(learnerId, subjectId, readModel, { scope: 'subject-command:read-model' });
    }

    const rewardState = response.projections?.rewards?.state;
    const rewardSystemId = response.projections?.rewards?.systemId;
    if (rewardSystemId && rewardState && typeof rewardState === 'object' && !Array.isArray(rewardState)) {
      cache.gameState[gameStateKey(learnerId, rewardSystemId)] = cloneSerialisable(rewardState) || {};
    }

    appendCommandEvents(response.events || response.domainEvents || []);

    if (Number.isFinite(Number(response.mutation?.appliedRevision))) {
      syncState = setScopeRevision(syncState, 'learner', learnerId, Number(response.mutation.appliedRevision));
    }
    markRemoteSuccess();
    persistLocalCache('subject-command');
    return normaliseSubjectStateRecord(cache.subjectStates[subjectStateKey(learnerId, subjectId)]);
  }

  function queueOperation(operation) {
    syncScheduled = true;
    const queuedOperation = operationInBlockedBranch(operation, pendingOperations)
      ? { ...operation, status: OPERATION_STATUS_BLOCKED_STALE }
      : operation;
    pendingOperations = [...pendingOperations, queuedOperation];
    applyOperationToBundle(cache, queuedOperation);
    syncState = advanceSyncState(syncState, queuedOperation);
    persistLocalCache(queuedOperation.key || queuedOperation.kind);
    recomputePersistence();
    logSync('info', 'sync.operation_queued', {
      id: queuedOperation.id,
      kind: queuedOperation.kind,
      scopeType: queuedOperation.scopeType,
      scopeId: queuedOperation.scopeId,
      status: queuedOperation.status,
      expectedRevision: queuedOperation.expectedRevision,
      pendingWriteCount: countPending(pendingOperations),
    });
  }

  async function sendLegacyRuntimeOperation(operation, mutation, headers) {
    switch (operation.kind) {
      case 'subjectStates.put':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-subject-state')), {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            learnerId: operation.learnerId,
            subjectId: operation.subjectId,
            record: cloneSerialisable(operation.record),
            mutation,
          }),
        }, authSession);
      case 'subjectStates.delete':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-subject-state')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, subjectId: operation.subjectId, mutation }),
        }, authSession);
      case 'subjectStates.clearLearner':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-subject-state')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, mutation }),
        }, authSession);
      case 'practiceSessions.put':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('practice-sessions')), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ record: cloneSerialisable(operation.record), mutation }),
        }, authSession);
      case 'practiceSessions.delete':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('practice-sessions')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, subjectId: operation.subjectId, mutation }),
        }, authSession);
      case 'practiceSessions.clearLearner':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('practice-sessions')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, mutation }),
        }, authSession);
      case 'gameState.put':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-game-state')), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, systemId: operation.systemId, state: cloneSerialisable(operation.state), mutation }),
        }, authSession);
      case 'gameState.delete':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-game-state')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, systemId: operation.systemId, mutation }),
        }, authSession);
      case 'gameState.clearLearner':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('child-game-state')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, mutation }),
        }, authSession);
      case 'eventLog.append':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('event-log')), {
          method: 'POST',
          headers,
          body: JSON.stringify({ event: cloneSerialisable(operation.event), mutation }),
        }, authSession);
      case 'eventLog.clearLearner':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('event-log')), {
          method: 'DELETE',
          headers,
          body: JSON.stringify({ learnerId: operation.learnerId, mutation }),
        }, authSession);
      case 'debug.reset':
        return fetchJson(fetchFn, joinUrl(baseUrl, legacyRuntimePath('debug', 'reset')), {
          method: 'POST',
          headers,
          body: JSON.stringify({ reset: true, mutation }),
        }, authSession);
      default:
        return null;
    }
  }

  async function sendRemoteOperation(operation) {
    const mutation = operation.scopeType === 'account'
      ? {
        requestId: operation.id,
        correlationId: operation.correlationId,
        expectedAccountRevision: operation.expectedRevision,
      }
      : {
        requestId: operation.id,
        correlationId: operation.correlationId,
        expectedLearnerRevision: operation.expectedRevision,
      };
    const headers = {
      'content-type': 'application/json',
      'x-ks2-request-id': operation.id,
      'x-ks2-correlation-id': operation.correlationId,
    };

    if (operation.kind === 'learners.write') {
      return fetchJson(fetchFn, joinUrl(baseUrl, '/api/learners'), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ learners: cloneSerialisable(operation.snapshot), mutation }),
      }, authSession);
    }
    if (legacyWritesEnabled && isLegacyRuntimeOperationKind(operation.kind)) {
      return sendLegacyRuntimeOperation(operation, mutation, headers);
    }
    if (isLegacyRuntimeOperationKind(operation.kind)) {
      assertRuntimeWriteAllowed(operation.kind);
    }
    return null;
  }

  async function syncOperation(operation) {
    const payload = await sendRemoteOperation(operation);
    removeOperationById(operation.id);
    syncState = replaySyncState(syncStateFromMutationResponse(syncState, operation, payload), pendingOperations);
    markRemoteSuccess();
    persistLocalCache(operation.key || operation.kind);
    logSync('info', 'sync.operation_applied', {
      id: operation.id,
      kind: operation.kind,
      scopeType: operation.scopeType,
      scopeId: operation.scopeId,
      replayed: Boolean(payload?.mutation?.replayed),
      appliedRevision: payload?.mutation?.appliedRevision ?? null,
      pendingWriteCount: countPending(pendingOperations),
    });
  }

  function handleConflict(operation, error) {
    pendingOperations = blockOperationsForConflict(pendingOperations, operation);
    lastRemoteError = classifyError(error, operation.key || operation.kind);
    persistLocalCache(operation.key || operation.kind);
    logSync('warn', 'sync.operation_blocked', {
      id: operation.id,
      kind: operation.kind,
      scopeType: operation.scopeType,
      scopeId: operation.scopeId,
      expectedRevision: operation.expectedRevision,
      error: lastRemoteError,
    });
    recomputePersistence();
  }

  function handleTransportFailure(operation, error) {
    lastRemoteError = classifyError(error, operation.key || operation.kind);
    persistLocalCache(operation.key || operation.kind);
    logSync('warn', 'sync.operation_failed', {
      id: operation.id,
      kind: operation.kind,
      scopeType: operation.scopeType,
      scopeId: operation.scopeId,
      expectedRevision: operation.expectedRevision,
      error: lastRemoteError,
    });
    recomputePersistence();
  }

  async function hydrateRemoteState({
    rebasePending = false,
    rebasePayloads = false,
    cacheScope = 'bootstrap',
    // U8 round 1 adv-u8-r1-001: internal flag. When the cacheDivergence
    // recovery path at line ~1855 recurses into `hydrateRemoteState`,
    // the outer lease is still held. The recursive call must extend
    // the lease without re-bumping the leader counter. Leading
    // underscore signals this is an internal-only flag; no public
    // caller should ever set it.
    _hydrateRetrying = false,
  } = {}) {
    const fallbackAvailable = hasCacheFallback(cache, pendingOperations);
    let bootstrapLease = null;
    if (fallbackAvailable) {
      const activeBackoff = activeBootstrapBackoff();
      if (activeBackoff) {
        markRemoteFailure(createBootstrapBackoffError(activeBackoff, '/api/bootstrap'));
        return null;
      }

      const activeCoordination = activeBootstrapCoordination();
      if (activeCoordination) {
        backOffForBootstrapCoordination(activeCoordination);
        // U8: follower served from the previously-warmed local cache
        // because coordination redirected it away from the network.
        // Track this path separately so the Playwright scene can
        // distinguish "waited then cached" from "waited then fetched".
        bumpCapacityMeta('bootstrapFollowerUsedCache');
        return null;
      }

      // U8 coord-race fix (adv-u7-coord-001): discriminated acquire +
      // bounded follower spin-wait.
      //
      // Pre-fix, `acquireBootstrapCoordination` returned nullable, and
      // the fallthrough used `!bootstrapLease` + `activeBootstrapCoordination()`
      // to decide "storage-unavailable (fall through)" vs "lost race
      // (wait)". Under the U7 notModified fast-path, leaders completed
      // and cleared their lease before followers' check could observe
      // it, so ALL tabs fell through to direct bootstrap — the 3-tab
      // scene saw 3 `/api/bootstrap` hits instead of the contracted
      // <= 2. The discriminated result (`storageUnavailable` vs
      // `ownerId`) preserves the genuine graceful-degradation path
      // while giving true race-losers a window to observe completion.
      const coordResult = await acquireBootstrapCoordination({ skipLeaderCounter: _hydrateRetrying });

      if (coordResult.winner) {
        bootstrapLease = coordResult.lease;
      } else if (coordResult.storageUnavailable) {
        // Counter already bumped inside `acquireBootstrapCoordination`.
        // Fall through to direct bootstrap — the degradation contract
        // accepts that storage-unavailable tabs race on the network.
        bootstrapLease = null;
      } else if (_hydrateRetrying) {
        // U8 coord-race fix (adv-u7-coord-001): cacheDivergence recursive
        // retry path. The outer hydrate held the lease and ran fetch
        // POST; when the response triggered the cacheDivergence branch
        // the outer tail-called back into us with `_hydrateRetrying: true`.
        // By the time our acquire's settle-delay read-back happens,
        // the outer's `finally { releaseBootstrapCoordination }` has
        // already cleared the lease — so the read-back sees empty and
        // treats us as a race-loser. That is wrong: the recursion is
        // a continuation of the SAME tab's work, and the retry must
        // fetch GET without a cache fallback. Force the leader path
        // here: write a fresh lease (acquire already did) and proceed
        // to fetch.
        bootstrapLease = {
          ownerId: bootstrapCoordinationOwnerId,
          startedAt: currentTime(),
          expiresAt: currentTime() + BOOTSTRAP_COORDINATION_LEASE_MS,
        };
        writeBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, bootstrapLease);
      } else {
        // Race loser — `coordResult.ownerId` is the foreign tab that
        // won the acquire. Spin briefly for leader completion to
        // surface: either a foreign lease re-appears (leader still
        // working → wait via the existing backoff path) or it stays
        // absent (leader completed fast — the U7 notModified round-
        // trip can finish in ~50ms, well below the follower's
        // `activeBootstrapCoordination()` check latency).
        //
        // Because we reached this branch with `fallbackAvailable === true`
        // (the outer `if (fallbackAvailable)` guard), our in-memory
        // cache already holds a warmed snapshot that the factory loaded
        // from localStorage. When the leader has cleared its lease
        // (fast completion), we safely serve THAT snapshot without a
        // duplicate network round-trip — this is the structural signal
        // that closes the race. Only storage-unavailable tabs may race
        // the network.
        let observed = null;
        for (let attempt = 0; attempt < BOOTSTRAP_FOLLOWER_SPIN_ATTEMPTS; attempt += 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => {
            setTimeout(resolve, BOOTSTRAP_FOLLOWER_SPIN_DELAY_MS);
          });
          observed = activeBootstrapCoordination();
          if (observed) break;
        }
        if (observed) {
          backOffForBootstrapCoordination(observed);
          bumpCapacityMeta('bootstrapFollowerUsedCache');
          return null;
        }
        // No foreign lease surfaced within budget. Leader completed
        // fast (lease cleared after fetch) or the last-write-wins
        // ordering left every tab as a race-loser — either way, we
        // have a usable cache fallback and the contract says we serve
        // it instead of duplicating the bootstrap. The next hydrate
        // cycle (e.g. a subject-command stale-revision hint) will
        // refresh naturally; multi-tab coordination is "avoid
        // simultaneous bootstrap fan-out", not "every tab must fetch
        // on every reload".
        bumpCapacityMeta('bootstrapFollowerUsedCache');
        return null;
      }

      const confirmedBootstrapLease = await confirmBootstrapCoordinationBeforeFetch(bootstrapLease);
      if (!confirmedBootstrapLease) {
        bumpCapacityMeta('bootstrapFollowerUsedCache');
        return null;
      }
    }

    try {
      // U7: if we have a prior revision hash, try the POST notModified
      // short-circuit first. Otherwise fall through to the GET path.
      // The server will return either `{ok, notModified: true, revision}`
      // (< 2 KB) or the full v2 bundle.
      const usePostProbe = typeof lastKnownBootstrapRevision === 'string' && lastKnownBootstrapRevision;
      const payload = usePostProbe
        ? await fetchJson(fetchFn, joinUrl(baseUrl, '/api/bootstrap'), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(publicReadModels ? { 'x-ks2-public-read-models': '1' } : {}),
          },
          body: JSON.stringify({ lastKnownRevision: lastKnownBootstrapRevision }),
        }, authSession)
        : await fetchJson(fetchFn, joinUrl(baseUrl, '/api/bootstrap'), {
          method: 'GET',
          headers: {
            accept: 'application/json',
            ...(publicReadModels ? { 'x-ks2-public-read-models': '1' } : {}),
          },
        }, authSession);
      // U7: 3-consecutive-missing-metadata backstop. The cached bundle
      // stays valid; we simply escalate to an operator-visible error
      // and let the higher layer decide whether to surface it (plan
      // line 752).
      const capacityMeta = payload?.meta?.capacity;
      // adv-u7-001: track whether the natural recovery path already fired
      // reset listeners for a breaker name in this bootstrap handler, so
      // the forceBreakerReset path below can skip the duplicate fire.
      let naturalResetFiredFor = null;
      if (!capacityMeta || !capacityMeta.bootstrapCapacity) {
        consecutiveMissingBootstrapMetadata += 1;
        if (consecutiveMissingBootstrapMetadata >= BOOTSTRAP_MISSING_METADATA_ESCALATION_LIMIT) {
          bootstrapMetadataOperatorError = {
            code: 'bootstrap_metadata_missing',
            consecutiveMisses: consecutiveMissingBootstrapMetadata,
          };
          // U9: trip the `bootstrapCapacityMetadata` breaker and pin it
          // open. Breaker is configured with `cooldownMaxMs: Infinity`
          // so `forceOpen(sticky: true)` is belt-and-braces — operator
          // action is required before retries resume.
          breakers.bootstrapCapacityMetadata.forceOpen({ sticky: true });
        }
      } else {
        consecutiveMissingBootstrapMetadata = 0;
        bootstrapMetadataOperatorError = null;
        // adv-u7-002: only fire reset listeners when actually recovering
        // from an open/half-open breaker, not on every normal bootstrap.
        // Firing unconditionally clears attemptedLearnerFetches on every
        // cycle, partially defeating the R2 storm-prevention contract.
        const wasNonClosed = breakers.bootstrapCapacityMetadata.isOpen
          || breakers.bootstrapCapacityMetadata.state === 'half-open';
        breakers.bootstrapCapacityMetadata.reset();
        if (wasNonClosed) {
          // P4/U7: fire reset listeners so the store clears its sticky
          // learner-fetch guard. Sibling learner stats that failed to
          // fetch while the breaker was open can now be retried.
          fireBreakerResetListeners('bootstrapCapacityMetadata');
          naturalResetFiredFor = 'bootstrapCapacityMetadata';
        }
      }
      // U9.1 item 2: `forceBreakerReset` via bootstrap response. When an
      // admin header triggers the server to include this field, the client
      // resets the named breaker. The name MUST match the closed set in
      // `isResetableBreakerName` — arbitrary strings are silently ignored.
      const forceBreakerResetName = typeof capacityMeta?.forceBreakerReset === 'string'
        ? capacityMeta.forceBreakerReset
        : null;
      if (forceBreakerResetName && isResetableBreakerName(forceBreakerResetName)) {
        const targetBreaker = breakers[forceBreakerResetName];
        if (targetBreaker && typeof targetBreaker.reset === 'function') {
          targetBreaker.reset();
          // adv-u7-001: skip duplicate fire if the natural recovery path
          // above already fired listeners for this same breaker name.
          // Without this guard, every listener executes twice when a
          // bootstrap response has both valid bootstrapCapacity AND
          // forceBreakerReset targeting the same breaker.
          if (forceBreakerResetName !== naturalResetFiredFor) {
            // P4/U7: fire reset listeners for operator-initiated resets
            // (the `forceBreakerReset` admin path). Same rationale as
            // the auto-recovery path above.
            fireBreakerResetListeners(forceBreakerResetName);
          }
        }
      }
      // U9.1 item 3: surface server-side `readModelDerivedWrite` breaker
      // state. The server stamps `derivedWriteBreakerOpen: true` on
      // `meta.capacity` when its breaker is open; the client mirrors this
      // into `breakersDegraded.derivedWrite` so UI components observe
      // parity with the server-side projection-skip path.
      if (capacityMeta && typeof capacityMeta.derivedWriteBreakerOpen === 'boolean') {
        if (capacityMeta.derivedWriteBreakerOpen) {
          // Server breaker is open — trip the client-side mirror so
          // `breakersDegraded.derivedWrite` reads `true`.
          if (!breakers.readModelDerivedWrite.isOpen) {
            breakers.readModelDerivedWrite.forceOpen();
          }
        } else {
          // Server breaker is closed — reset the client mirror.
          if (breakers.readModelDerivedWrite.isOpen) {
            breakers.readModelDerivedWrite.reset();
          }
        }
      }
      // U7: notModified short-circuit. Validate the revision envelope
      // is structurally sound before honouring — a missing field
      // means the server deployed a schema change without a version
      // bump, which our local cache cannot honour. Force a full
      // refresh and log `cacheDivergence` (plan line 751).
      if (payload?.notModified === true) {
        const revision = payload.revision;
        const schemaValid = revision && typeof revision === 'object'
          && BOOTSTRAP_V2_REVISION_KEYS.every((key) => Object.prototype.hasOwnProperty.call(revision, key));
        if (!schemaValid) {
          lastKnownBootstrapRevision = null;
          markRemoteFailure(classifyError(
            new Error('bootstrap_cache_divergence'),
            '/api/bootstrap',
          ));
          // Recursive retry without the lastKnownRevision triggers a
          // full GET. One-shot only — the function falls through on
          // subsequent invocations because the revision is cleared.
          //
          // U8 round 1 adv-u8-r1-001: set `_hydrateRetrying: true` so
          // the recursive acquire extends the lease this tab still
          // holds without re-bumping `bootstrapLeaderAcquired`. The
          // outer `finally` releases the lease once; the inner
          // `releaseBootstrapCoordination` no-ops on a lease that is
          // no longer in storage.
          if (typeof fetchFn === 'function') {
            return hydrateRemoteState({
              rebasePending,
              rebasePayloads,
              cacheScope,
              _hydrateRetrying: true,
            });
          }
        } else {
          lastKnownBootstrapRevision = revision.hash;
          markRemoteSuccess({ bootstrap: true });
          lastSyncAt = currentTime();
          persistLocalCache(cacheScope);
          return { operations: pendingOperations, syncState, rebasedCount: 0, unblockedCount: 0 };
        }
      }
      const remoteBundle = normaliseRepositoryBundle(payload);
      const remoteSyncState = normaliseSyncState(payload?.syncState);
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'monsterVisualConfig')) {
        // U7 adv-u7-r1-001: the server emits a compact pointer on the
        // selected-learner-bounded path. Merge the pointer with the
        // previously cached full config so admin-published custom
        // configs survive across bootstraps. A hash mismatch surfaces
        // the pointer itself; a matching hash preserves the cached full
        // config; a full server response overwrites the cache as before.
        const incoming = normaliseMonsterVisualRuntimeConfig(payload.monsterVisualConfig);
        monsterVisualConfig = resolveMonsterVisualConfigFromPointer(incoming, monsterVisualConfig);
      }
      // U7: capture the revision hash for the next probe when the v2
      // envelope is present. The server only emits `revision` on the
      // selected-learner-bounded path.
      if (payload?.revision && typeof payload.revision.hash === 'string') {
        lastKnownBootstrapRevision = payload.revision.hash;
      }
      const rebase = applyHydratedState(remoteBundle, remoteSyncState, { rebasePending, rebasePayloads });
      markRemoteSuccess({ bootstrap: true });
      persistLocalCache(cacheScope);
      return rebase;
    } catch (error) {
      const backoff = fallbackAvailable && isBootstrapBackoffError(error)
        ? scheduleBootstrapBackoff(error)
        : null;
      const persistenceError = backoff
        ? attachBootstrapBackoffDetails(classifyError(error, '/api/bootstrap'), backoff)
        : classifyError(error, '/api/bootstrap');
      markRemoteFailure(persistenceError);
      if (fallbackAvailable) {
        if (backoff) persistBootstrapBackoff(cacheScope);
        return null;
      }
      // U8: no fallback cache + bootstrap threw === the "full refresh"
      // escape hatch fired. This is the incognito / cold-start path
      // that skips coordination entirely; Playwright scenario D
      // (incognito independence) asserts this counter is non-zero.
      bumpCapacityMeta('bootstrapFallbackFullRefresh');
      throw error;
    } finally {
      releaseBootstrapCoordination(bootstrapLease);
    }
  }

  async function rebasePendingFromRemote(operation, cause, attempt) {
    const rebase = await hydrateRemoteState({
      rebasePending: true,
      rebasePayloads: true,
      cacheScope: operation.key || operation.kind || 'rebase-pending',
    });
    if (!rebase) return false;

    logSync('info', 'sync.operation_rebased', {
      id: operation.id,
      kind: operation.kind,
      scopeType: operation.scopeType,
      scopeId: operation.scopeId,
      staleExpectedRevision: operation.expectedRevision,
      remoteRevision: cause?.payload?.currentRevision ?? null,
      attempt,
      rebasedCount: rebase.rebasedCount,
      unblockedCount: rebase.unblockedCount,
      pendingWriteCount: countPending(pendingOperations),
    });
    return true;
  }

  async function processPendingQueue() {
    if (processing) {
      await processingLoop;
      return;
    }

    processing = true;
    syncScheduled = true;
    processingLoop = (async () => {
      let staleRebaseAttempts = 0;
      while (true) {
        const nextOperation = firstQueueOperation(pendingOperations);
        if (!nextOperation) break;
        if (nextOperation.status === OPERATION_STATUS_BLOCKED_STALE) break;

        inFlightWriteCount += 1;
        recomputePersistence();
        try {
          await syncOperation(nextOperation);
        } catch (error) {
          if (error instanceof RepositoryHttpError && error.status === 409 && error.code === 'stale_write' && staleRebaseAttempts < 3) {
            staleRebaseAttempts += 1;
            const rebased = await rebasePendingFromRemote(nextOperation, error, staleRebaseAttempts);
            if (rebased) continue;
            handleTransportFailure(nextOperation, error);
          } else if (error instanceof RepositoryHttpError && error.status === 409) {
            handleConflict(nextOperation, error);
          } else {
            handleTransportFailure(nextOperation, error);
          }
          break;
        } finally {
          inFlightWriteCount = Math.max(0, inFlightWriteCount - 1);
          recomputePersistence();
        }
      }
    })().finally(() => {
      processing = false;
      syncScheduled = false;
      recomputePersistence();
    });

    return processingLoop;
  }

  function kickQueue() {
    processPendingQueue().catch((error) => {
      logSync('warn', 'sync.queue_unhandled', { message: error?.message || String(error) });
    });
  }

  recomputePersistence();

  const repositories = {
    kind: 'api',
    persistence: {
      read() {
        return persistenceChannel.read();
      },
      subscribe(listener) {
        return persistenceChannel.subscribe(listener);
      },
      // U9: low-level breaker access for hub API adapters and tests.
      // UI components MUST NOT import this — they read the aggregate
      // `breakersDegraded` boolean map from `read()` instead.
      breakers,
      // P4/U7: register a callback that fires whenever a breaker is
      // explicitly reset to `closed` from a composition-root call site.
      // Returns an unsubscribe function. Primary consumer is the
      // store's `clearStaleFetchGuards()`.
      registerBreakerResetHook(listener) {
        if (typeof listener !== 'function') return () => {};
        breakerResetListeners.add(listener);
        return () => breakerResetListeners.delete(listener);
      },
      async retry() {
        const blocked = hasBlockedOperations(pendingOperations);
        await repositories.hydrate({
          cacheScope: countPending(pendingOperations) ? 'retry-rebase' : 'retry-sync',
          rebasePending: countPending(pendingOperations) > 0,
          rebasePayloads: blocked,
        });
        const afterHydrate = persistenceChannel.read();
        if (afterHydrate.lastError?.code === 'bootstrap_retry_backoff') {
          throw new Error(afterHydrate.lastError.message || 'Bootstrap retry is backing off.');
        }
        await repositories.flush();
        const snapshot = persistenceChannel.read();
        if (snapshot.mode === PERSISTENCE_MODES.DEGRADED) {
          throw new Error(snapshot.lastError?.message || 'Remote sync is still degraded.');
        }
        return snapshot;
      },
    },
    async hydrate(options = {}) {
      await hydrateRemoteState(options);
      return undefined;
    },
    async flush() {
      await processPendingQueue();
      const snapshot = persistenceChannel.read();
      if (snapshot.mode === PERSISTENCE_MODES.DEGRADED) {
        throw new Error(snapshot.lastError?.message || 'Remote sync is still degraded.');
      }
      return undefined;
    },
    clearAll() {
      assertRuntimeWriteAllowed('debug.reset');
      const operation = createOperation('debug.reset', {}, syncState);
      queueOperation(operation);
      kickQueue();
    },
    learners: {
      read() {
        return cloneSerialisable(cache.learners);
      },
      write(nextSnapshot) {
        const operation = createOperation('learners.write', {
          snapshot: normaliseLearnersSnapshot(nextSnapshot),
        }, syncState);
        queueOperation(operation);
        kickQueue();
        return cloneSerialisable(cache.learners);
      },
      select(learnerId) {
        if (typeof learnerId !== 'string' || !cache.learners.byId[learnerId]) {
          return cloneSerialisable(cache.learners);
        }
        cache.learners = normaliseLearnersSnapshot({
          ...cache.learners,
          selectedId: learnerId,
        });
        persistLocalCache('learners:selected');
        return cloneSerialisable(cache.learners);
      },
    },
    subjectStates: {
      read(learnerId, subjectId) {
        return normaliseSubjectStateRecord(cache.subjectStates[subjectStateKey(learnerId, subjectId)]);
      },
      readForLearner(learnerId) {
        const output = {};
        for (const [key, value] of Object.entries(cache.subjectStates)) {
          if (!key.startsWith(`${learnerId || 'default'}::`)) continue;
          const resolvedSubjectId = key.split('::')[1];
          output[resolvedSubjectId] = normaliseSubjectStateRecord(value);
        }
        return output;
      },
      writeUi(learnerId, subjectId, ui) {
        return this.writeRecord(learnerId, subjectId, mergeSubjectUi(this.read(learnerId, subjectId), ui, nowTs()), 'ui');
      },
      cacheUi(learnerId, subjectId, ui) {
        return cacheSubjectUi(learnerId, subjectId, ui, { scope: 'subject-state-cache' });
      },
      writeData(learnerId, subjectId, data) {
        return this.writeRecord(learnerId, subjectId, mergeSubjectData(this.read(learnerId, subjectId), data, nowTs()), 'data');
      },
      writeRecord(learnerId, subjectId, record, mergeStrategy = 'replace') {
        assertRuntimeWriteAllowed('subjectStates.put');
        const operation = createOperation('subjectStates.put', {
          learnerId,
          subjectId,
          mergeStrategy,
          record: normaliseSubjectStateRecord(record),
        }, syncState);
        queueOperation(operation);
        kickQueue();
        return normaliseSubjectStateRecord(cache.subjectStates[subjectStateKey(learnerId, subjectId)]);
      },
      clear(learnerId, subjectId) {
        assertRuntimeWriteAllowed('subjectStates.delete');
        const operation = createOperation('subjectStates.delete', { learnerId, subjectId }, syncState);
        queueOperation(operation);
        kickQueue();
      },
      clearLearner(learnerId) {
        assertRuntimeWriteAllowed('subjectStates.clearLearner');
        const operation = createOperation('subjectStates.clearLearner', { learnerId }, syncState);
        queueOperation(operation);
        kickQueue();
      },
    },
    practiceSessions: {
      latest(learnerId, subjectId) {
        const records = filterSessions(cache.practiceSessions);
        return records.find((record) => record.learnerId === learnerId && record.subjectId === subjectId) || null;
      },
      list(learnerId = null, subjectId = null) {
        return filterSessions(cache.practiceSessions).filter((record) => {
          if (learnerId && record.learnerId !== learnerId) return false;
          if (subjectId && record.subjectId !== subjectId) return false;
          return true;
        });
      },
      write(record) {
        assertRuntimeWriteAllowed('practiceSessions.put');
        const operation = createOperation('practiceSessions.put', {
          record: normalisePracticeSessionRecord(record),
        }, syncState);
        queueOperation(operation);
        kickQueue();
        return this.latest(operation.record.learnerId, operation.record.subjectId);
      },
      clear(learnerId, subjectId = null) {
        assertRuntimeWriteAllowed(subjectId ? 'practiceSessions.delete' : 'practiceSessions.clearLearner');
        const operation = createOperation(subjectId ? 'practiceSessions.delete' : 'practiceSessions.clearLearner', {
          learnerId,
          subjectId,
        }, syncState);
        queueOperation(operation);
        kickQueue();
      },
      clearLearner(learnerId) {
        assertRuntimeWriteAllowed('practiceSessions.clearLearner');
        const operation = createOperation('practiceSessions.clearLearner', { learnerId }, syncState);
        queueOperation(operation);
        kickQueue();
      },
    },
    gameState: {
      read(learnerId, systemId) {
        const key = gameStateKey(learnerId, systemId);
        return cloneSerialisable(cache.gameState[key] || {});
      },
      readForLearner(learnerId) {
        const output = {};
        for (const [key, value] of Object.entries(cache.gameState)) {
          const parsed = parseGameStateKey(key);
          if (!parsed || parsed.learnerId !== learnerId) continue;
          output[parsed.systemId] = cloneSerialisable(value) || {};
        }
        return output;
      },
      write(learnerId, systemId, state) {
        assertRuntimeWriteAllowed('gameState.put');
        const operation = createOperation('gameState.put', {
          learnerId,
          systemId,
          state,
        }, syncState);
        queueOperation(operation);
        kickQueue();
        return this.read(learnerId, systemId);
      },
      clear(learnerId, systemId = null) {
        assertRuntimeWriteAllowed(systemId ? 'gameState.delete' : 'gameState.clearLearner');
        const operation = createOperation(systemId ? 'gameState.delete' : 'gameState.clearLearner', {
          learnerId,
          systemId,
        }, syncState);
        queueOperation(operation);
        kickQueue();
      },
      clearLearner(learnerId) {
        assertRuntimeWriteAllowed('gameState.clearLearner');
        const operation = createOperation('gameState.clearLearner', { learnerId }, syncState);
        queueOperation(operation);
        kickQueue();
      },
    },
    eventLog: {
      append(event) {
        const next = cloneSerialisable(event) || null;
        if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
        assertRuntimeWriteAllowed('eventLog.append');
        const operation = createOperation('eventLog.append', { event: next }, syncState);
        queueOperation(operation);
        kickQueue();
        return cloneSerialisable(next);
      },
      list(learnerId = null) {
        const events = Array.isArray(cache.eventLog) ? cache.eventLog : [];
        return cloneSerialisable(learnerId ? events.filter((event) => event?.learnerId === learnerId) : events);
      },
      clearLearner(learnerId) {
        assertRuntimeWriteAllowed('eventLog.clearLearner');
        const operation = createOperation('eventLog.clearLearner', { learnerId }, syncState);
        queueOperation(operation);
        kickQueue();
      },
    },
    monsterVisualConfig: {
      read() {
        return normaliseMonsterVisualRuntimeConfig(monsterVisualConfig);
      },
    },
    runtime: {
      readLearnerRevision(learnerId) {
        const current = normaliseSyncState(syncState);
        return Math.max(0, Number(current.learnerRevisions?.[learnerId]) || 0);
      },
      applyLearnerRevisionHint(learnerId, revision) {
        return applyLearnerRevisionHint(learnerId, revision);
      },
      applySubjectCommandResult({ learnerId, subjectId, response } = {}) {
        return applyCommandResultToCache({ learnerId, subjectId, response });
      },
    },
  };

  return validatePlatformRepositories(repositories);
}
