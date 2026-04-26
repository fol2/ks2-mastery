import { cloneSerialisable, normalisePracticeSessionRecord } from '../../platform/core/repositories/helpers.js';
import { normaliseGuardianMap } from './service-contract.js';

const SUBJECT_ID = 'spelling';
const PREF_STORAGE_PREFIX = 'ks2-platform-v2.spelling-prefs.';
const PROGRESS_STORAGE_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_STORAGE_PREFIX = 'ks2-spell-guardian-';
const DAY_MS = 24 * 60 * 60 * 1000;

function todayDayForNow(now) {
  const ts = typeof now === 'function' ? Number(now()) : (now == null ? Date.now() : Number(now));
  if (!Number.isFinite(ts) || ts < 0) return 0;
  return Math.floor(ts / DAY_MS);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Date.now();
  return Number.isFinite(value) ? value : Date.now();
}

function progressKey(learnerId) {
  return `${PROGRESS_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function prefsKey(learnerId) {
  return `${PREF_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function guardianKey(learnerId) {
  return `${GUARDIAN_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function parseStorageKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(PREF_STORAGE_PREFIX)) {
    return { type: 'prefs', learnerId: key.slice(PREF_STORAGE_PREFIX.length) || 'default' };
  }
  if (key.startsWith(GUARDIAN_STORAGE_PREFIX)) {
    return { type: 'guardian', learnerId: key.slice(GUARDIAN_STORAGE_PREFIX.length) || 'default' };
  }
  if (key.startsWith(PROGRESS_STORAGE_PREFIX)) {
    return { type: 'progress', learnerId: key.slice(PROGRESS_STORAGE_PREFIX.length) || 'default' };
  }
  return null;
}

function parseStoredJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : cloneSerialisable(fallback);
  } catch {
    return cloneSerialisable(fallback);
  }
}

function normaliseProgressMap(rawValue) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const output = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (!slug || !isPlainObject(entry)) continue;
    output[slug] = cloneSerialisable(entry);
  }
  return output;
}

export function normaliseSpellingSubjectData(rawValue, todayDay = 0) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  return {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    progress: normaliseProgressMap(raw.progress),
    guardian: normaliseGuardianMap(raw.guardian, todayDay),
  };
}

function readSpellingData(repositories, learnerId, todayDay = 0) {
  return normaliseSpellingSubjectData(repositories.subjectStates.read(learnerId, SUBJECT_ID).data || {}, todayDay);
}

function writeSpellingData(repositories, learnerId, nextData, todayDay = 0) {
  return normaliseSpellingSubjectData(
    repositories.subjectStates.writeData(learnerId, SUBJECT_ID, normaliseSpellingSubjectData(nextData, todayDay)).data,
    todayDay,
  );
}

function buildActiveRecord(learnerId, state, now) {
  const session = state?.session;
  if (!session) return null;
  // Boss Dictation (`session.mode === 'boss'`) and Guardian Mission
  // (`session.mode === 'guardian'`) are both "post-Mega" modes that override
  // `session.type` with a shape-only value ('test' for Boss, 'learning' for
  // Guardian). Persisting `sessionKind: session.type` would lose the post-Mega
  // mode and make the Resume button route back to SATs Test / Smart Review.
  // Prefer `session.mode` for those modes so `activeSession.sessionKind` keeps
  // the real identity across refresh; fall back to `session.type` for
  // session-shape-preserved modes (smart / trouble / test / single).
  const sessionKind = session.mode === 'boss' || session.mode === 'guardian'
    ? session.mode
    : session.type;
  return normalisePracticeSessionRecord({
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind,
    status: 'active',
    sessionState: cloneSerialisable(session),
    summary: null,
    createdAt: session.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  });
}

function buildCompletedRecord(learnerId, state, repositories, now) {
  const summary = state?.summary;
  if (!summary) return null;
  const latest = repositories.practiceSessions.latest(learnerId, SUBJECT_ID);
  return normalisePracticeSessionRecord({
    id: latest?.id || `spelling-${timestamp(now)}`,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: latest?.sessionKind || summary.mode || 'practice',
    status: 'completed',
    sessionState: null,
    summary: cloneSerialisable(summary),
    createdAt: latest?.createdAt || timestamp(now),
    updatedAt: timestamp(now),
  });
}

export function createSpellingPersistence({ repositories, now } = {}) {
  if (!repositories) {
    throw new TypeError('Spelling persistence requires platform repositories.');
  }

  const currentDay = () => todayDayForNow(now);

  const storage = {
    getItem(key) {
      const parsed = parseStorageKey(key);
      if (!parsed) return null;
      const data = readSpellingData(repositories, parsed.learnerId, currentDay());
      if (parsed.type === 'prefs') return JSON.stringify(data.prefs || {});
      if (parsed.type === 'progress') return JSON.stringify(data.progress || {});
      if (parsed.type === 'guardian') return JSON.stringify(data.guardian || {});
      return null;
    },
    setItem(key, value) {
      const parsed = parseStorageKey(key);
      if (!parsed) return;
      const day = currentDay();
      const current = readSpellingData(repositories, parsed.learnerId, day);
      if (parsed.type === 'prefs') {
        writeSpellingData(repositories, parsed.learnerId, {
          ...current,
          prefs: parseStoredJson(value, {}),
        }, day);
      }
      if (parsed.type === 'progress') {
        writeSpellingData(repositories, parsed.learnerId, {
          ...current,
          progress: parseStoredJson(value, {}),
        }, day);
      }
      if (parsed.type === 'guardian') {
        writeSpellingData(repositories, parsed.learnerId, {
          ...current,
          guardian: parseStoredJson(value, {}),
        }, day);
      }
    },
    removeItem(key) {
      const parsed = parseStorageKey(key);
      if (!parsed) return;
      const day = currentDay();
      const current = readSpellingData(repositories, parsed.learnerId, day);
      if (parsed.type === 'prefs') {
        writeSpellingData(repositories, parsed.learnerId, { ...current, prefs: {} }, day);
      }
      if (parsed.type === 'progress') {
        writeSpellingData(repositories, parsed.learnerId, { ...current, progress: {} }, day);
      }
      if (parsed.type === 'guardian') {
        writeSpellingData(repositories, parsed.learnerId, { ...current, guardian: {} }, day);
      }
    },
  };

  return {
    storage,
    progressKey,
    prefsKey,
    guardianKey,
    syncPracticeSession(learnerId, state) {
      if (state?.phase === 'session') {
        const record = buildActiveRecord(learnerId, state, now);
        if (record) repositories.practiceSessions.write(record);
        return record;
      }
      if (state?.phase === 'summary') {
        const record = buildCompletedRecord(learnerId, state, repositories, now);
        if (record) repositories.practiceSessions.write(record);
        return record;
      }
      repositories.practiceSessions.clear(learnerId, SUBJECT_ID);
      return null;
    },
    abandonPracticeSession(learnerId, rawState) {
      const sessionId = rawState?.session?.id;
      const latest = repositories.practiceSessions.latest(learnerId, SUBJECT_ID);
      if (!latest || (sessionId && latest.id !== sessionId)) return null;
      const next = normalisePracticeSessionRecord({
        ...latest,
        status: 'abandoned',
        updatedAt: timestamp(now),
      });
      repositories.practiceSessions.write(next);
      return next;
    },
    resetLearner(learnerId) {
      writeSpellingData(repositories, learnerId, {}, currentDay());
      repositories.practiceSessions.clear(learnerId, SUBJECT_ID);
    },
  };
}
