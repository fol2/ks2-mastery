import {
  cloneSerialisable,
  currentRepositoryMeta,
  emptyLearnersSnapshot,
  emptySubjectStateRecord,
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
  removeCollection,
  REPO_STORAGE_KEYS,
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
  nextWriteVersion,
  readWriteVersion,
  assertNotStale,
  WriteVersionStaleError,
} from './locks/write-version.js';
import { createBroadcastInvalidator } from './locks/broadcast-invalidator.js';

const LEGACY_KEYS = Object.freeze({
  appState: 'ks2-platform-v2.app-state',
  spellingPrefsPrefix: 'ks2-platform-v2.spelling-prefs.',
  spellingProgressPrefix: 'ks2-spell-progress-',
  monstersPrefix: 'ks2-platform-v2.monsters.',
});

function createNoopStorage() {
  return {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    get length() { return 0; },
  };
}

function storageKeys(storage) {
  const keys = [];
  const total = Number(storage?.length) || 0;
  for (let index = 0; index < total; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function hasNewRepositoryData(storage) {
  return [
    REPO_STORAGE_KEYS.learners,
    REPO_STORAGE_KEYS.subjectStates,
    REPO_STORAGE_KEYS.practiceSessions,
    REPO_STORAGE_KEYS.gameState,
    REPO_STORAGE_KEYS.eventLog,
  ].some((key) => Boolean(storage?.getItem?.(key)));
}

function loadLegacySeed(storage) {
  const learners = emptyLearnersSnapshot();
  const subjectStates = {};
  const practiceSessions = [];
  const gameState = {};
  const eventLog = [];

  const appState = loadCollection(storage, LEGACY_KEYS.appState, null);
  if (appState?.learners) {
    const normalised = normaliseLearnersSnapshot(appState.learners);
    learners.byId = normalised.byId;
    learners.allIds = normalised.allIds;
    learners.selectedId = normalised.selectedId;

    if (learners.selectedId && appState.subjectUi && typeof appState.subjectUi === 'object') {
      for (const [subjectId, ui] of Object.entries(appState.subjectUi)) {
        subjectStates[subjectStateKey(learners.selectedId, subjectId)] = {
          ...emptySubjectStateRecord(),
          ui: cloneSerialisable(ui),
          updatedAt: Date.now(),
        };
      }
    }
  }

  for (const key of storageKeys(storage)) {
    if (key.startsWith(LEGACY_KEYS.spellingPrefsPrefix)) {
      const learnerId = key.slice(LEGACY_KEYS.spellingPrefsPrefix.length);
      const currentKey = subjectStateKey(learnerId, 'spelling');
      const record = subjectStates[currentKey] || emptySubjectStateRecord();
      subjectStates[currentKey] = mergeSubjectData(record, {
        ...(record.data || {}),
        prefs: loadCollection(storage, key, {}),
      }, Date.now());
    }

    if (key.startsWith(LEGACY_KEYS.spellingProgressPrefix)) {
      const learnerId = key.slice(LEGACY_KEYS.spellingProgressPrefix.length);
      const currentKey = subjectStateKey(learnerId, 'spelling');
      const record = subjectStates[currentKey] || emptySubjectStateRecord();
      subjectStates[currentKey] = mergeSubjectData(record, {
        ...(record.data || {}),
        progress: loadCollection(storage, key, {}),
      }, Date.now());
    }

    if (key.startsWith(LEGACY_KEYS.monstersPrefix)) {
      const learnerId = key.slice(LEGACY_KEYS.monstersPrefix.length);
      gameState[gameStateKey(learnerId, 'monster-codex')] = cloneSerialisable(loadCollection(storage, key, {}));
    }
  }

  return {
    learners,
    subjectStates,
    practiceSessions,
    gameState,
    eventLog,
  };
}

function persistBundle(storage, bundle) {
  try {
    storage?.setItem?.(REPO_STORAGE_KEYS.meta, JSON.stringify(bundle.meta));
    storage?.setItem?.(REPO_STORAGE_KEYS.learners, JSON.stringify(bundle.learners));
    storage?.setItem?.(REPO_STORAGE_KEYS.subjectStates, JSON.stringify(bundle.subjectStates));
    storage?.setItem?.(REPO_STORAGE_KEYS.practiceSessions, JSON.stringify(bundle.practiceSessions));
    storage?.setItem?.(REPO_STORAGE_KEYS.gameState, JSON.stringify(bundle.gameState));
    storage?.setItem?.(REPO_STORAGE_KEYS.eventLog, JSON.stringify(bundle.eventLog));
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function clearStoredBundle(storage) {
  try {
    Object.values(REPO_STORAGE_KEYS).forEach((key) => removeCollection(storage, key));
    for (const key of storageKeys(storage)) {
      if (
        key.startsWith(LEGACY_KEYS.spellingPrefsPrefix)
        || key.startsWith(LEGACY_KEYS.spellingProgressPrefix)
        || key.startsWith(LEGACY_KEYS.monstersPrefix)
        || key === LEGACY_KEYS.appState
      ) {
        removeCollection(storage, key);
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function createCollections(storage) {
  const bundle = hasNewRepositoryData(storage)
    ? normaliseRepositoryBundle({
      meta: loadCollection(storage, REPO_STORAGE_KEYS.meta, null),
      learners: loadCollection(storage, REPO_STORAGE_KEYS.learners, emptyLearnersSnapshot()),
      subjectStates: loadCollection(storage, REPO_STORAGE_KEYS.subjectStates, {}),
      practiceSessions: loadCollection(storage, REPO_STORAGE_KEYS.practiceSessions, []),
      gameState: loadCollection(storage, REPO_STORAGE_KEYS.gameState, {}),
      eventLog: loadCollection(storage, REPO_STORAGE_KEYS.eventLog, []),
    })
    : normaliseRepositoryBundle(loadLegacySeed(storage));

  // P2 U5: preserve the persisted writeVersion across startup. Without this
  // snapshot, a newly-constructed repository would reset its in-memory
  // writeVersion to 0 and race a sibling tab whose disk counter is higher.
  const persistedWriteVersion = Number(bundle.meta?.writeVersion) > 0
    ? Math.floor(Number(bundle.meta.writeVersion))
    : 0;
  bundle.meta = currentRepositoryMeta();
  if (persistedWriteVersion > 0) {
    bundle.meta.writeVersion = persistedWriteVersion;
  }
  const error = persistBundle(storage, bundle);
  return { bundle, error };
}

function localPersistenceSnapshot({ lastSyncAt, lastError = null, updatedAt = Date.now() } = {}) {
  if (lastError) {
    return {
      mode: PERSISTENCE_MODES.DEGRADED,
      remoteAvailable: false,
      trustedState: PERSISTENCE_TRUSTED_STATES.MEMORY,
      cacheState: PERSISTENCE_CACHE_STATES.MEMORY_ONLY,
      pendingWriteCount: 0,
      inFlightWriteCount: 0,
      lastSyncAt: Number(lastSyncAt) || 0,
      lastError,
      updatedAt: nowTs(updatedAt),
    };
  }

  return {
    ...defaultPersistenceSnapshot(PERSISTENCE_MODES.LOCAL_ONLY, updatedAt),
    trustedState: PERSISTENCE_TRUSTED_STATES.LOCAL,
    cacheState: PERSISTENCE_CACHE_STATES.LOCAL_ONLY,
    lastSyncAt: nowTs(updatedAt),
    lastError: null,
  };
}

export function createLocalPlatformRepositories({
  storage,
  // P2 U5: pluggable broadcast / writeVersion telemetry hooks. In production
  // they default to the real BroadcastChannel adapter + a no-op telemetry
  // sink; tests can inject stubs to drive cross-tab scenarios.
  broadcastInvalidator = null,
  onWriteVersionWraparound = null,
} = {}) {
  const resolvedStorage = storage || globalThis.localStorage || createNoopStorage();
  const { bundle: collections, error: startupError } = createCollections(resolvedStorage);
  let lastSyncAt = startupError ? 0 : nowTs();
  const persistenceChannel = createPersistenceChannel(localPersistenceSnapshot({
    lastSyncAt,
    lastError: startupError
      ? createPersistenceError({
        phase: 'local-startup',
        scope: 'localStorage',
        message: startupError.message,
        retryable: true,
      })
      : null,
  }));

  // P2 U5: BroadcastChannel-backed cache invalidator. In fallback hosts
  // (BroadcastChannel unavailable) the returned adapter is a no-op — the
  // writeVersion monotonic CAS still catches cross-tab races, just without
  // the immediate invalidation nudge.
  const broadcaster = broadcastInvalidator || createBroadcastInvalidator();

  // P2 U5: late-acquired writeVersion from the bundle meta. On first write
  // after this repository instance is constructed, the counter advances
  // from whatever the disk says (or 0 for pre-U5 data).
  if (!collections.meta || typeof collections.meta !== 'object') {
    collections.meta = currentRepositoryMeta();
  }
  if (!Number.isFinite(Number(collections.meta.writeVersion))) {
    collections.meta.writeVersion = readWriteVersion(collections.meta);
  }

  // P2 U5: subscribe to sibling-tab broadcasts. When another tab writes,
  // invalidate our in-memory cache by re-hydrating from storage. The
  // broadcast carries the writing tab's `writeVersion`; if ours is already
  // ahead (shouldn't happen under normal operation — duplicate-leader
  // edge case), skip the re-read.
  let lastBroadcastWriteVersion = collections.meta.writeVersion || 0;
  broadcaster.subscribe((message) => {
    if (!message || message.kind !== 'write') return;
    const incoming = Number(message.writeVersion) || 0;
    if (incoming <= lastBroadcastWriteVersion) return;
    // Re-hydrate from raw storage. This is the single point that closes
    // the per-tab cache gap documented by tests/spelling-guardian.test.js
    // U7's "known limitation" test.
    try {
      const fresh = normaliseRepositoryBundle({
        meta: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.meta, null),
        learners: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.learners, emptyLearnersSnapshot()),
        subjectStates: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.subjectStates, {}),
        practiceSessions: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.practiceSessions, []),
        gameState: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.gameState, {}),
        eventLog: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.eventLog, []),
      });
      collections.meta = fresh.meta;
      collections.learners = fresh.learners;
      collections.subjectStates = fresh.subjectStates;
      collections.practiceSessions = fresh.practiceSessions;
      collections.gameState = fresh.gameState;
      collections.eventLog = fresh.eventLog;
      lastBroadcastWriteVersion = Number(fresh.meta?.writeVersion) || incoming;
    } catch (_error) {
      /* Re-hydration failures are swallowed — next write will attempt to
       * fix storage anyway and writeVersion CAS will catch any drift. */
    }
  });

  function updateLocalPersistence(error = null, phase = 'local-write', scope = 'localStorage') {
    if (error) {
      return persistenceChannel.set(localPersistenceSnapshot({
        lastSyncAt,
        lastError: createPersistenceError({
          phase,
          scope,
          message: error.message || String(error),
          retryable: true,
        }),
      }));
    }

    lastSyncAt = nowTs();
    return persistenceChannel.set(localPersistenceSnapshot({ lastSyncAt }));
  }

  // P2 U5: wraparound telemetry hook. Forwarded to writeVersion.js on each
  // ceiling hit. Caller can opt-in via the `onWriteVersionWraparound`
  // factory option; default is a no-op.
  function onWraparound(event) {
    if (typeof onWriteVersionWraparound === 'function') {
      try {
        onWriteVersionWraparound(event);
      } catch (_error) {
        /* Telemetry failures never break the write path. */
      }
    }
  }

  function persistAll(phase = 'local-write', scope = 'localStorage') {
    // P2 U5: pre-write re-read of the persisted writeVersion to close the
    // duplicate-leader race. If someone else bumped the on-disk counter
    // between the last read and now, the CAS catches it — callers that
    // manage their own optimistic snapshot (see `withCas` below) throw a
    // WriteVersionStaleError. The `persistAll` baseline path just merges
    // forward: take the max of in-memory and on-disk, then bump.
    const diskMeta = loadCollection(resolvedStorage, REPO_STORAGE_KEYS.meta, null);
    const diskVersion = readWriteVersion(diskMeta);
    const memVersion = readWriteVersion(collections.meta);
    const baseVersion = Math.max(diskVersion, memVersion);
    collections.meta = {
      ...currentRepositoryMeta(),
      writeVersion: nextWriteVersion(baseVersion, { telemetry: onWraparound }),
    };
    const error = persistBundle(resolvedStorage, collections);
    if (error) {
      updateLocalPersistence(error, phase, scope);
      return false;
    }
    updateLocalPersistence(null, phase, scope);
    lastBroadcastWriteVersion = collections.meta.writeVersion;
    try {
      broadcaster.broadcast({ writeVersion: collections.meta.writeVersion });
    } catch (_error) {
      /* Broadcast failures never break the write path. */
    }
    return true;
  }

  async function retryPersistence() {
    if (!persistAll('local-retry', 'localStorage')) {
      const snapshot = persistenceChannel.read();
      throw new Error(snapshot.lastError?.message || 'Local persistence retry failed.');
    }
    return persistenceChannel.read();
  }

  const repositories = {
    kind: 'local',
    persistence: {
      read() {
        return persistenceChannel.read();
      },
      subscribe(listener) {
        return persistenceChannel.subscribe(listener);
      },
      retry: retryPersistence,
    },
    // P2 U5: storage-CAS metadata surface. The spelling repository reads the
    // current writeVersion before each Guardian merge-save, passes it back
    // on the next writeData call via `{ expectedWriteVersion }`, and maps
    // any `WriteVersionStaleError` into a retry (re-hydrate, re-compute,
    // re-commit with the fresher snapshot). Broadcast surface is exposed so
    // a lock-wrapped caller can opt into notifying sibling tabs without
    // routing through writeData (e.g. a clearAll / reset action).
    storageCas: {
      readWriteVersion() {
        // Always read from raw storage so a sibling tab's write is visible
        // even when our in-memory cache is stale. The BroadcastChannel
        // invalidation path eventually re-hydrates the cache, but the CAS
        // must not depend on that async propagation — it is the cross-tab
        // correctness boundary.
        const diskMeta = loadCollection(resolvedStorage, REPO_STORAGE_KEYS.meta, null);
        const diskVersion = readWriteVersion(diskMeta);
        const memVersion = readWriteVersion(collections.meta);
        return Math.max(diskVersion, memVersion);
      },
      // P2 U5: rehydrate the in-memory cache from raw storage. Used by the
      // spelling repository's CAS retry loop to ensure the next re-
      // projection sees the winning-tab's state, not the stale cache.
      rehydrateFromStorage() {
        try {
          const fresh = normaliseRepositoryBundle({
            meta: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.meta, null),
            learners: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.learners, emptyLearnersSnapshot()),
            subjectStates: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.subjectStates, {}),
            practiceSessions: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.practiceSessions, []),
            gameState: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.gameState, {}),
            eventLog: loadCollection(resolvedStorage, REPO_STORAGE_KEYS.eventLog, []),
          });
          collections.meta = fresh.meta;
          collections.learners = fresh.learners;
          collections.subjectStates = fresh.subjectStates;
          collections.practiceSessions = fresh.practiceSessions;
          collections.gameState = fresh.gameState;
          collections.eventLog = fresh.eventLog;
          lastBroadcastWriteVersion = readWriteVersion(fresh.meta);
        } catch (_error) {
          /* Ignore — next write will bump writeVersion and catch drift. */
        }
      },
      broadcast(writeVersion) {
        try {
          broadcaster.broadcast({
            writeVersion: Number(writeVersion) || readWriteVersion(collections.meta),
          });
        } catch (_error) {
          /* Broadcast failures are swallowed; writeVersion CAS still protects writes. */
        }
      },
      subscribe(listener) {
        return broadcaster.subscribe(listener);
      },
      isBroadcastAvailable() {
        return Boolean(broadcaster?.available);
      },
      close() {
        if (typeof broadcaster?.close === 'function') broadcaster.close();
      },
    },
    async hydrate() {
      return undefined;
    },
    async flush() {
      if (!persistAll('local-flush', 'localStorage')) {
        const snapshot = persistenceChannel.read();
        throw new Error(snapshot.lastError?.message || 'Local persistence flush failed.');
      }
      return undefined;
    },
    clearAll() {
      collections.meta = currentRepositoryMeta();
      collections.learners = emptyLearnersSnapshot();
      collections.subjectStates = {};
      collections.practiceSessions = [];
      collections.gameState = {};
      collections.eventLog = [];
      const clearError = clearStoredBundle(resolvedStorage);
      if (clearError) {
        updateLocalPersistence(clearError, 'local-reset', 'localStorage');
      } else {
        lastSyncAt = nowTs();
        persistenceChannel.set(localPersistenceSnapshot({ lastSyncAt }));
      }
    },
    learners: {
      read() {
        return cloneSerialisable(collections.learners);
      },
      write(nextSnapshot) {
        collections.learners = normaliseLearnersSnapshot(nextSnapshot);
        persistAll('local-write', 'learners');
        return cloneSerialisable(collections.learners);
      },
      select(learnerId) {
        if (typeof learnerId !== 'string' || !collections.learners.byId[learnerId]) {
          return cloneSerialisable(collections.learners);
        }
        collections.learners = normaliseLearnersSnapshot({
          ...collections.learners,
          selectedId: learnerId,
        });
        persistAll('local-write', 'learners:selected');
        return cloneSerialisable(collections.learners);
      },
    },
    subjectStates: {
      read(learnerId, subjectId) {
        const key = subjectStateKey(learnerId, subjectId);
        return normaliseSubjectStateRecord(collections.subjectStates[key]);
      },
      readForLearner(learnerId) {
        const output = {};
        for (const [key, value] of Object.entries(collections.subjectStates)) {
          if (!key.startsWith(`${learnerId || 'default'}::`)) continue;
          const subjectId = key.split('::')[1];
          output[subjectId] = normaliseSubjectStateRecord(value);
        }
        return output;
      },
      writeUi(learnerId, subjectId, ui) {
        const key = subjectStateKey(learnerId, subjectId);
        const next = mergeSubjectUi(collections.subjectStates[key], ui, nowTs());
        collections.subjectStates[key] = next;
        persistAll('local-write', `subjectStates:${key}`);
        return normaliseSubjectStateRecord(next);
      },
      writeData(learnerId, subjectId, data, options = {}) {
        // P2 U5: optional optimistic-CAS. Callers that pass
        // `{ expectedWriteVersion: N }` trigger a stale-read check before
        // the write commits — used by the spelling service for Guardian
        // merge-saves under two-tab contention. Hosts that don't care
        // about CAS (legacy callers, every existing test) skip the
        // option and the write path stays byte-for-byte compatible.
        //
        // Duplicate-leader handling (RxDB edge): both tabs read a stale
        // snapshot with writeVersion=N. Tab A's pre-commit re-read sees
        // the on-disk value jumped to N+1 (tab B already wrote) so the
        // CAS throws WriteVersionStaleError. Tab A's caller retries,
        // loading the fresh snapshot (via the broadcaster-triggered
        // cache invalidation OR a direct re-read of storage), computes
        // N+2 from it, and succeeds — both tabs' writes survive.
        if (options && typeof options.expectedWriteVersion === 'number') {
          const onDiskMeta = loadCollection(resolvedStorage, REPO_STORAGE_KEYS.meta, null);
          const actual = readWriteVersion(onDiskMeta);
          assertNotStale({ expected: options.expectedWriteVersion, actual });
        }
        const key = subjectStateKey(learnerId, subjectId);
        const next = mergeSubjectData(collections.subjectStates[key], data, nowTs());
        collections.subjectStates[key] = next;
        persistAll('local-write', `subjectStates:${key}`);
        return normaliseSubjectStateRecord(next);
      },
      writeRecord(learnerId, subjectId, record) {
        const key = subjectStateKey(learnerId, subjectId);
        const next = normaliseSubjectStateRecord(record);
        collections.subjectStates[key] = next;
        persistAll('local-write', `subjectStates:${key}`);
        return normaliseSubjectStateRecord(next);
      },
      clear(learnerId, subjectId) {
        delete collections.subjectStates[subjectStateKey(learnerId, subjectId)];
        persistAll('local-write', `subjectStates:${subjectStateKey(learnerId, subjectId)}`);
      },
      clearLearner(learnerId) {
        for (const key of Object.keys(collections.subjectStates)) {
          if (key.startsWith(`${learnerId || 'default'}::`)) delete collections.subjectStates[key];
        }
        persistAll('local-write', `subjectStates:${learnerId || 'default'}`);
      },
    },
    practiceSessions: {
      latest(learnerId, subjectId) {
        return cloneSerialisable(filterSessions(collections.practiceSessions, learnerId, subjectId)[0] || null);
      },
      list(learnerId = null, subjectId = null) {
        return cloneSerialisable(filterSessions(collections.practiceSessions, learnerId, subjectId));
      },
      write(record) {
        const next = normalisePracticeSessionRecord(record);
        if (!next.id || !next.learnerId || !next.subjectId) {
          throw new TypeError('Practice session records require id, learnerId and subjectId.');
        }
        const sessionKey = practiceSessionKey(next);
        const all = filterSessions(collections.practiceSessions);
        const existingIndex = all.findIndex((entry) => practiceSessionKey(entry) === sessionKey);
        if (existingIndex >= 0) all[existingIndex] = next;
        else all.push(next);
        collections.practiceSessions = all;
        persistAll('local-write', `practiceSessions:${sessionKey}`);
        return cloneSerialisable(next);
      },
      clear(learnerId, subjectId) {
        collections.practiceSessions = filterSessions(collections.practiceSessions)
          .filter((record) => !(record.learnerId === learnerId && record.subjectId === subjectId));
        persistAll('local-write', `practiceSessions:${learnerId || 'default'}:${subjectId || 'all'}`);
      },
      clearLearner(learnerId) {
        collections.practiceSessions = filterSessions(collections.practiceSessions)
          .filter((record) => record.learnerId !== learnerId);
        persistAll('local-write', `practiceSessions:${learnerId || 'default'}`);
      },
    },
    gameState: {
      read(learnerId, systemId) {
        return cloneSerialisable(collections.gameState[gameStateKey(learnerId, systemId)] || {});
      },
      readForLearner(learnerId) {
        const output = {};
        for (const [key, value] of Object.entries(collections.gameState)) {
          if (!key.startsWith(`${learnerId || 'default'}::`)) continue;
          const parsed = parseGameStateKey(key);
          if (!parsed) continue;
          output[parsed.systemId] = cloneSerialisable(value) || {};
        }
        return output;
      },
      write(learnerId, systemId, state) {
        collections.gameState[gameStateKey(learnerId, systemId)] = cloneSerialisable(state) || {};
        persistAll('local-write', `gameState:${gameStateKey(learnerId, systemId)}`);
        return this.read(learnerId, systemId);
      },
      clear(learnerId, systemId) {
        delete collections.gameState[gameStateKey(learnerId, systemId)];
        persistAll('local-write', `gameState:${gameStateKey(learnerId, systemId)}`);
      },
      clearLearner(learnerId) {
        for (const key of Object.keys(collections.gameState)) {
          if (key.startsWith(`${learnerId || 'default'}::`)) delete collections.gameState[key];
        }
        persistAll('local-write', `gameState:${learnerId || 'default'}`);
      },
    },
    eventLog: {
      append(event) {
        const next = cloneSerialisable(event) || null;
        if (!next || typeof next !== 'object' || Array.isArray(next)) return null;
        collections.eventLog = [...collections.eventLog, next].slice(-1000);
        persistAll('local-write', 'eventLog');
        return cloneSerialisable(next);
      },
      list(learnerId = null) {
        const events = Array.isArray(collections.eventLog) ? collections.eventLog : [];
        return cloneSerialisable(
          learnerId
            ? events.filter((event) => event?.learnerId === learnerId)
            : events,
        );
      },
      clearLearner(learnerId) {
        collections.eventLog = (Array.isArray(collections.eventLog) ? collections.eventLog : [])
          .filter((event) => event?.learnerId !== learnerId);
        persistAll('local-write', `eventLog:${learnerId || 'default'}`);
      },
    },
  };

  return validatePlatformRepositories(repositories);
}
