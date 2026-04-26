import { cloneSerialisable, nowTs } from './helpers.js';

export const PERSISTENCE_MODES = Object.freeze({
  LOCAL_ONLY: 'local-only',
  REMOTE_SYNC: 'remote-sync',
  DEGRADED: 'degraded',
});

export const PERSISTENCE_TRUSTED_STATES = Object.freeze({
  LOCAL: 'local',
  REMOTE: 'remote',
  LOCAL_CACHE: 'local-cache',
  MEMORY: 'memory',
});

export const PERSISTENCE_CACHE_STATES = Object.freeze({
  LOCAL_ONLY: 'local-only',
  ALIGNED: 'aligned',
  AHEAD_OF_REMOTE: 'ahead-of-remote',
  STALE_COPY: 'stale-copy',
  MEMORY_ONLY: 'memory-only',
});

function normaliseError(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  return {
    phase: typeof rawValue.phase === 'string' && rawValue.phase ? rawValue.phase : 'unknown',
    scope: typeof rawValue.scope === 'string' && rawValue.scope ? rawValue.scope : 'persistence',
    code: typeof rawValue.code === 'string' && rawValue.code ? rawValue.code : null,
    message: typeof rawValue.message === 'string' && rawValue.message ? rawValue.message : 'Unknown persistence error.',
    retryable: rawValue.retryable !== false,
    correlationId: typeof rawValue.correlationId === 'string' && rawValue.correlationId ? rawValue.correlationId : null,
    resolution: typeof rawValue.resolution === 'string' && rawValue.resolution ? rawValue.resolution : null,
    details: rawValue.details && typeof rawValue.details === 'object' && !Array.isArray(rawValue.details)
      ? cloneSerialisable(rawValue.details)
      : null,
    at: Number.isFinite(Number(rawValue.at)) ? Number(rawValue.at) : 0,
  };
}

// U9: per-breaker internal snapshot shape. NOT serialised directly to
// components — the minimal boolean `breakersDegraded` map is the only
// UI-facing exposure. Kept under `persistenceChannel.read().breakers.*`
// for internal observability (plan line 877-878).
function normaliseBreakerSnapshot(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const state = typeof rawValue.state === 'string' ? rawValue.state : null;
  if (!state) return null;
  return {
    name: typeof rawValue.name === 'string' ? rawValue.name : null,
    state,
    failureCount: Number.isFinite(Number(rawValue.failureCount)) ? Number(rawValue.failureCount) : 0,
    openedAt: Number.isFinite(Number(rawValue.openedAt)) ? Number(rawValue.openedAt) : 0,
    cooldownUntil: rawValue.cooldownUntil == null
      ? null
      : (Number.isFinite(Number(rawValue.cooldownUntil)) ? Number(rawValue.cooldownUntil) : null),
    cooldownMs: Number.isFinite(Number(rawValue.cooldownMs)) ? Number(rawValue.cooldownMs) : 0,
  };
}

function normaliseBreakers(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;
  const output = {};
  for (const [key, value] of Object.entries(rawValue)) {
    const snapshot = normaliseBreakerSnapshot(value);
    if (snapshot) output[key] = snapshot;
  }
  return Object.keys(output).length ? output : null;
}

function normaliseBreakersDegraded(rawValue) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {
      parentHub: false,
      classroomSummary: false,
      derivedWrite: false,
      bootstrapCapacity: false,
    };
  }
  return {
    parentHub: rawValue.parentHub === true,
    classroomSummary: rawValue.classroomSummary === true,
    derivedWrite: rawValue.derivedWrite === true,
    bootstrapCapacity: rawValue.bootstrapCapacity === true,
  };
}

export function normalisePersistenceSnapshot(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  const mode = Object.values(PERSISTENCE_MODES).includes(raw.mode)
    ? raw.mode
    : PERSISTENCE_MODES.LOCAL_ONLY;
  const trustedState = Object.values(PERSISTENCE_TRUSTED_STATES).includes(raw.trustedState)
    ? raw.trustedState
    : (mode === PERSISTENCE_MODES.REMOTE_SYNC ? PERSISTENCE_TRUSTED_STATES.REMOTE : PERSISTENCE_TRUSTED_STATES.LOCAL);
  const cacheState = Object.values(PERSISTENCE_CACHE_STATES).includes(raw.cacheState)
    ? raw.cacheState
    : (mode === PERSISTENCE_MODES.REMOTE_SYNC ? PERSISTENCE_CACHE_STATES.ALIGNED : PERSISTENCE_CACHE_STATES.LOCAL_ONLY);

  return {
    mode,
    remoteAvailable: raw.remoteAvailable === true,
    trustedState,
    cacheState,
    pendingWriteCount: Math.max(0, Number.isFinite(Number(raw.pendingWriteCount)) ? Number(raw.pendingWriteCount) : 0),
    inFlightWriteCount: Math.max(0, Number.isFinite(Number(raw.inFlightWriteCount)) ? Number(raw.inFlightWriteCount) : 0),
    lastSyncAt: Number.isFinite(Number(raw.lastSyncAt)) ? Number(raw.lastSyncAt) : 0,
    lastError: normaliseError(raw.lastError),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    // U9: internal observability sub-namespace. Full state is not
    // exposed to UI components (plan line 878); they read
    // `breakersDegraded` only.
    breakers: normaliseBreakers(raw.breakers),
    breakersDegraded: normaliseBreakersDegraded(raw.breakersDegraded),
  };
}

export function createPersistenceError({ phase, scope, code = null, message, retryable = true, correlationId = null, resolution = null, details = null, at = Date.now() } = {}) {
  return normaliseError({
    phase,
    scope,
    code,
    message,
    retryable,
    correlationId,
    resolution,
    details,
    at: nowTs(at),
  });
}

export function defaultPersistenceSnapshot(mode = PERSISTENCE_MODES.LOCAL_ONLY, now = Date.now) {
  const updatedAt = nowTs(now);
  const defaultBreakersDegraded = {
    parentHub: false,
    classroomSummary: false,
    derivedWrite: false,
    bootstrapCapacity: false,
  };
  if (mode === PERSISTENCE_MODES.REMOTE_SYNC) {
    return {
      mode,
      remoteAvailable: true,
      trustedState: PERSISTENCE_TRUSTED_STATES.REMOTE,
      cacheState: PERSISTENCE_CACHE_STATES.ALIGNED,
      pendingWriteCount: 0,
      inFlightWriteCount: 0,
      lastSyncAt: 0,
      lastError: null,
      updatedAt,
      breakers: null,
      breakersDegraded: defaultBreakersDegraded,
    };
  }

  return {
    mode,
    remoteAvailable: false,
    trustedState: PERSISTENCE_TRUSTED_STATES.LOCAL,
    cacheState: PERSISTENCE_CACHE_STATES.LOCAL_ONLY,
    pendingWriteCount: 0,
    inFlightWriteCount: 0,
    lastSyncAt: updatedAt,
    lastError: null,
    updatedAt,
    breakers: null,
    breakersDegraded: defaultBreakersDegraded,
  };
}

export function createPersistenceChannel(initialSnapshot = defaultPersistenceSnapshot()) {
  let snapshot = normalisePersistenceSnapshot(initialSnapshot);
  const listeners = new Set();

  function emit() {
    const cloned = cloneSerialisable(snapshot);
    for (const listener of listeners) {
      try {
        listener(cloned);
      } catch {
        // persistence listeners must not break the repository.
      }
    }
  }

  return {
    read() {
      return cloneSerialisable(snapshot);
    },
    set(nextSnapshot) {
      snapshot = normalisePersistenceSnapshot(nextSnapshot);
      emit();
      return cloneSerialisable(snapshot);
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
