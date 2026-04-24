import {
  isMonsterCelebrationEvent,
  normaliseMonsterCelebrationEvents,
} from './monster-celebrations.js';

const ACK_STORAGE_KEY = 'ks2-platform-v2.monster-celebration-acks';
const ACK_LIMIT = 500;
const DEFAULT_BASELINE_RECENT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

function storage() {
  return globalThis.localStorage || null;
}

function eventId(event) {
  return typeof event?.id === 'string' && event.id ? event.id : '';
}

function readSnapshot(store = storage()) {
  try {
    const raw = store?.getItem?.(ACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnapshot(snapshot, store = storage()) {
  try {
    store?.setItem?.(ACK_STORAGE_KEY, JSON.stringify(snapshot || {}));
  } catch {
    // Best-effort acknowledgement only; reward state remains authoritative.
  }
}

function learnerKey(learnerId) {
  return typeof learnerId === 'string' && learnerId ? learnerId : 'default';
}

function normaliseLearnerAckEntry(value) {
  if (Array.isArray(value)) {
    return {
      ids: value.filter((id) => typeof id === 'string' && id).slice(-ACK_LIMIT),
      baselineAt: 0,
    };
  }
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    ids: Array.isArray(raw.ids)
      ? raw.ids.filter((id) => typeof id === 'string' && id).slice(-ACK_LIMIT)
      : [],
    baselineAt: Math.max(0, Number(raw.baselineAt) || 0),
  };
}

function learnerAckEntry(snapshot, learnerId) {
  return normaliseLearnerAckEntry(snapshot[learnerKey(learnerId)]);
}

function saveLearnerAckEntry(snapshot, learnerId, entry) {
  snapshot[learnerKey(learnerId)] = {
    ids: Array.isArray(entry?.ids) ? entry.ids.filter((id) => typeof id === 'string' && id).slice(-ACK_LIMIT) : [],
    baselineAt: Math.max(0, Number(entry?.baselineAt) || 0),
  };
}

export function acknowledgedMonsterCelebrationIds(learnerId, { store = storage() } = {}) {
  const snapshot = readSnapshot(store);
  return new Set(learnerAckEntry(snapshot, learnerId).ids);
}

export function acknowledgeMonsterCelebrationEvents(events, { learnerId = '', store = storage() } = {}) {
  const validEvents = normaliseMonsterCelebrationEvents(events);
  if (!validEvents.length) return false;
  const key = learnerKey(learnerId || validEvents[0]?.learnerId);
  const snapshot = readSnapshot(store);
  const current = normaliseLearnerAckEntry(snapshot[key]);
  const ids = new Set(current.ids);
  for (const event of validEvents) {
    const id = eventId(event);
    if (id) ids.add(id);
  }
  saveLearnerAckEntry(snapshot, key, {
    ...current,
    ids: [...ids],
  });
  writeSnapshot(snapshot, store);
  return true;
}

function baselineExistingEvents(events, {
  learnerId,
  baselineRecentWindowMs,
  now,
  store,
} = {}) {
  const snapshot = readSnapshot(store);
  const entry = learnerAckEntry(snapshot, learnerId);
  if (entry.baselineAt) return entry;

  const cutoff = Math.max(0, Number(now) || Date.now()) - Math.max(0, Number(baselineRecentWindowMs) || 0);
  const staleIds = (Array.isArray(events) ? events : [])
    .filter((event) => {
      const createdAt = Number(event?.createdAt) || 0;
      return eventId(event) && (!createdAt || createdAt < cutoff);
    })
    .map(eventId);

  saveLearnerAckEntry(snapshot, learnerId, {
    ids: [...new Set([...entry.ids, ...staleIds])],
    baselineAt: Math.max(0, Number(now) || Date.now()),
  });
  writeSnapshot(snapshot, store);
  return learnerAckEntry(snapshot, learnerId);
}

export function unacknowledgedMonsterCelebrationEvents(events, {
  learnerId = '',
  ignoredIds = new Set(),
  limit = 1,
  baselineExisting = false,
  baselineRecentWindowMs = DEFAULT_BASELINE_RECENT_WINDOW_MS,
  now = Date.now(),
  store = storage(),
} = {}) {
  const scopedEvents = (Array.isArray(events) ? events : [])
    .filter(isMonsterCelebrationEvent)
    .filter((event) => !learnerId || event.learnerId === learnerId);
  if (baselineExisting) {
    baselineExistingEvents(scopedEvents, {
      learnerId,
      baselineRecentWindowMs,
      now,
      store,
    });
  }
  const acknowledgedIds = acknowledgedMonsterCelebrationIds(learnerId, { store });
  const ignored = ignoredIds instanceof Set ? ignoredIds : new Set();
  const candidates = scopedEvents
    .filter((event) => {
      const id = eventId(event);
      return id && !acknowledgedIds.has(id) && !ignored.has(id);
    })
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

  const count = Math.max(1, Number(limit) || 1);
  return normaliseMonsterCelebrationEvents(candidates.slice(-count));
}
