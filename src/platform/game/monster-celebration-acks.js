import {
  isMonsterCelebrationEvent,
  normaliseMonsterCelebrationEvents,
} from './monster-celebrations.js';

const ACK_STORAGE_KEY = 'ks2-platform-v2.monster-celebration-acks';
const ACK_LIMIT = 500;

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

export function acknowledgedMonsterCelebrationIds(learnerId, { store = storage() } = {}) {
  const snapshot = readSnapshot(store);
  const ids = snapshot[learnerKey(learnerId)];
  return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string' && id) : []);
}

export function acknowledgeMonsterCelebrationEvents(events, { learnerId = '', store = storage() } = {}) {
  const validEvents = normaliseMonsterCelebrationEvents(events);
  if (!validEvents.length) return false;
  const key = learnerKey(learnerId || validEvents[0]?.learnerId);
  const snapshot = readSnapshot(store);
  const current = Array.isArray(snapshot[key]) ? snapshot[key].filter((id) => typeof id === 'string' && id) : [];
  const ids = new Set(current);
  for (const event of validEvents) {
    const id = eventId(event);
    if (id) ids.add(id);
  }
  snapshot[key] = [...ids].slice(-ACK_LIMIT);
  writeSnapshot(snapshot, store);
  return true;
}

export function unacknowledgedMonsterCelebrationEvents(events, {
  learnerId = '',
  ignoredIds = new Set(),
  limit = 1,
  acknowledgeSkipped = false,
  store = storage(),
} = {}) {
  const acknowledgedIds = acknowledgedMonsterCelebrationIds(learnerId, { store });
  const ignored = ignoredIds instanceof Set ? ignoredIds : new Set();
  const candidates = (Array.isArray(events) ? events : [])
    .filter(isMonsterCelebrationEvent)
    .filter((event) => !learnerId || event.learnerId === learnerId)
    .filter((event) => {
      const id = eventId(event);
      return id && !acknowledgedIds.has(id) && !ignored.has(id);
    })
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));

  const count = Math.max(1, Number(limit) || 1);
  const selected = normaliseMonsterCelebrationEvents(candidates.slice(-count));
  if (acknowledgeSkipped && candidates.length > selected.length) {
    acknowledgeMonsterCelebrationEvents(candidates.slice(0, -selected.length), { learnerId, store });
  }
  return selected;
}
