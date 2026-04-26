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

const MUTATION_POLICY_VERSION = 1;
const OPERATION_STATUS_PENDING = 'pending';
const OPERATION_STATUS_BLOCKED_STALE = 'blocked-stale';
const SUBJECT_STATE_MERGE_STRATEGIES = new Set(['merge', 'ui', 'data', 'replace']);
const BOOTSTRAP_BACKOFF_BASE_MS = 2_000;
const BOOTSTRAP_BACKOFF_MAX_MS = 30_000;
const BOOTSTRAP_BACKOFF_JITTER_MS = 250;
const BOOTSTRAP_COORDINATION_LEASE_MS = BOOTSTRAP_BACKOFF_MAX_MS;
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
    return {
      bundle: normaliseRepositoryBundle(raw.bundle || raw),
      pendingOperations: normalisePendingOperations(raw.pendingOperations),
      syncState: normaliseSyncState(raw.syncState),
      monsterVisualConfig: normaliseMonsterVisualRuntimeConfig(raw.monsterVisualConfig),
      bootstrapBackoff: normaliseBootstrapBackoff(raw.bootstrapBackoff),
    };
  }
  return {
    bundle: emptyApiBundle(),
    pendingOperations: [],
    syncState: emptySyncState(),
    monsterVisualConfig: null,
    bootstrapBackoff: null,
  };
}

function persistCachedState(storage, storageKey, bundle, pendingOperations, syncState, monsterVisualConfig, bootstrapBackoff) {
  try {
    storage?.setItem?.(storageKey, JSON.stringify({
      bundle,
      pendingOperations,
      syncState,
      monsterVisualConfig,
      bootstrapBackoff: normaliseBootstrapBackoff(bootstrapBackoff),
    }));
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

  function acquireBootstrapCoordination() {
    const now = currentTime();
    const active = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, now);
    if (active && active.ownerId !== bootstrapCoordinationOwnerId) return null;

    const lease = {
      ownerId: bootstrapCoordinationOwnerId,
      startedAt: now,
      expiresAt: now + BOOTSTRAP_COORDINATION_LEASE_MS,
    };
    if (!writeBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, lease)) return null;
    const confirmed = readBootstrapCoordination(resolvedStorage, bootstrapCoordinationKey, now);
    return confirmed?.ownerId === bootstrapCoordinationOwnerId ? lease : null;
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

  async function hydrateRemoteState({ rebasePending = false, rebasePayloads = false, cacheScope = 'bootstrap' } = {}) {
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
        return null;
      }

      bootstrapLease = acquireBootstrapCoordination();
      if (!bootstrapLease) {
        const lostCoordinationRace = activeBootstrapCoordination();
        if (lostCoordinationRace) {
          backOffForBootstrapCoordination(lostCoordinationRace);
          return null;
        }
      }

      const confirmedBootstrapLease = await confirmBootstrapCoordinationBeforeFetch(bootstrapLease);
      if (!confirmedBootstrapLease) return null;
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
      if (!capacityMeta || !capacityMeta.bootstrapCapacity) {
        consecutiveMissingBootstrapMetadata += 1;
        if (consecutiveMissingBootstrapMetadata >= BOOTSTRAP_MISSING_METADATA_ESCALATION_LIMIT) {
          bootstrapMetadataOperatorError = {
            code: 'bootstrap_metadata_missing',
            consecutiveMisses: consecutiveMissingBootstrapMetadata,
          };
        }
      } else {
        consecutiveMissingBootstrapMetadata = 0;
        bootstrapMetadataOperatorError = null;
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
          if (typeof fetchFn === 'function') {
            return hydrateRemoteState({ rebasePending, rebasePayloads, cacheScope });
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
