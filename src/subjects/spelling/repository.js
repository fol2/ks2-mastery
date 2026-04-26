import { cloneSerialisable, normalisePracticeSessionRecord } from '../../platform/core/repositories/helpers.js';
import {
  normaliseDurablePersistenceWarning,
  normaliseGuardianMap,
  normalisePatternMap,
  normalisePostMegaRecord,
} from './service-contract.js';

const SUBJECT_ID = 'spelling';
const PREF_STORAGE_PREFIX = 'ks2-platform-v2.spelling-prefs.';
const PROGRESS_STORAGE_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_STORAGE_PREFIX = 'ks2-spell-guardian-';
// P2 U2: sticky-graduation sibling. Mirrors POST_MEGA_KEY_PREFIX in
// shared/spelling/service.js — must stay byte-identical with that constant.
const POST_MEGA_STORAGE_PREFIX = 'ks2-spell-post-mega-';
// P2 U11: Pattern Quest wobble sibling. Mirrors PATTERN_KEY_PREFIX in
// shared/spelling/service.js — must stay byte-identical with that constant.
const PATTERN_STORAGE_PREFIX = 'ks2-spell-pattern-';
// P2 U9: durable persistence-warning sibling. Mirrors PERSISTENCE_WARNING_KEY_PREFIX
// in shared/spelling/service.js — must stay byte-identical. The prefix
// intentionally differs from the shorter `ks2-spell-` family used by the other
// four siblings (prefs / progress / guardian / post-mega); we pick
// `ks2-spell-persistence-warning-` so the `parseStorageKey` startsWith dispatch
// cannot collide with `ks2-spell-progress-` or `ks2-spell-post-mega-`.
const PERSISTENCE_WARNING_STORAGE_PREFIX = 'ks2-spell-persistence-warning-';
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

function postMegaKey(learnerId) {
  return `${POST_MEGA_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function patternKey(learnerId) {
  return `${PATTERN_STORAGE_PREFIX}${learnerId || 'default'}`;
}

// P2 U9: durable persistence-warning sibling key.
function persistenceWarningKey(learnerId) {
  return `${PERSISTENCE_WARNING_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function parseStorageKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(PREF_STORAGE_PREFIX)) {
    return { type: 'prefs', learnerId: key.slice(PREF_STORAGE_PREFIX.length) || 'default' };
  }
  if (key.startsWith(GUARDIAN_STORAGE_PREFIX)) {
    return { type: 'guardian', learnerId: key.slice(GUARDIAN_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U9: persistence-warning is checked before post-mega and progress
  // because `ks2-spell-persistence-warning-` shares `ks2-spell-p` with both.
  // The longer, unique second-segment keeps the prefixes disambiguated.
  if (key.startsWith(PERSISTENCE_WARNING_STORAGE_PREFIX)) {
    return { type: 'persistenceWarning', learnerId: key.slice(PERSISTENCE_WARNING_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U2: order matters — POST_MEGA_STORAGE_PREFIX must be checked BEFORE
  // PROGRESS_STORAGE_PREFIX because `ks2-spell-post-mega-` starts with
  // `ks2-spell-p`, the same first 11 chars as progress. We keep the unique
  // second-segment prefix check (`post-mega`) to disambiguate.
  if (key.startsWith(POST_MEGA_STORAGE_PREFIX)) {
    return { type: 'postMega', learnerId: key.slice(POST_MEGA_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U11: `ks2-spell-pattern-` also starts with `ks2-spell-p`. Check before
  // the progress prefix so a pattern-sibling key is never mis-routed.
  if (key.startsWith(PATTERN_STORAGE_PREFIX)) {
    return { type: 'pattern', learnerId: key.slice(PATTERN_STORAGE_PREFIX.length) || 'default' };
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
  const output = {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    progress: normaliseProgressMap(raw.progress),
    guardian: normaliseGuardianMap(raw.guardian, todayDay),
  };
  // P2 U2: `postMega` is a sibling of progress/guardian/prefs inside the
  // subject-state record. It is written once (at first-graduation) and
  // thereafter read-only for the lifetime of the learner. Persisted storage
  // format: `data.postMega = { unlockedAt, unlockedContentReleaseId,
  // unlockedPublishedCoreCount, unlockedBy }`. We only attach the sibling
  // when it normalises to a non-null record — keeps the bundle shape stable
  // for pre-graduation learners (no `postMega` key at all).
  const postMega = normalisePostMegaRecord(raw.postMega);
  if (postMega) output.postMega = postMega;
  // P2 U11: `pattern` is the Pattern Quest wobble sibling — parallel to
  // `guardian.wobbling` but keyed by Pattern Quest slugs. Only attached when
  // at least one wobble record exists so pre-U11 learners keep a stable
  // bundle shape (no `pattern` key at all).
  const pattern = normalisePatternMap(raw.pattern);
  if (pattern && Object.keys(pattern.wobbling).length > 0) output.pattern = pattern;
  // P2 U9: `persistenceWarning` is a durable sibling that survives tab close.
  // It is written whenever a `saveJson` throws a `PersistenceSetItemError`
  // and cleared on learner acknowledgement. Storage format:
  // `data.persistenceWarning = { reason, occurredAt, acknowledged }`. Attach
  // only when non-null so pre-failure bundles stay compact.
  const persistenceWarning = normaliseDurablePersistenceWarning(raw.persistenceWarning);
  if (persistenceWarning) output.persistenceWarning = persistenceWarning;
  return output;
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
  // Boss Dictation (`session.mode === 'boss'`), Guardian Mission
  // (`session.mode === 'guardian'`), and Pattern Quest
  // (`session.mode === 'pattern-quest'`) are all post-Mega modes that
  // override `session.type` with a shape-only value. Persisting
  // `sessionKind: session.type` would lose the post-Mega identity and make
  // the Resume button route back to SATs Test / Smart Review. Prefer
  // `session.mode` for those modes so `activeSession.sessionKind` keeps the
  // real identity across refresh; fall back to `session.type` for
  // session-shape-preserved modes (smart / trouble / test / single).
  const sessionKind = session.mode === 'boss' || session.mode === 'guardian' || session.mode === 'pattern-quest'
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

  // U8 review fix: the spelling storage proxy MUST throw on an underlying
  // persistence failure. `repositories.subjectStates.writeData` discards the
  // `persistAll` success flag and routes the failure silently into the
  // persistence channel's `lastError`. Without a throw here, the spelling
  // service's `saveJson` try/catch never fires in production, and U8's
  // feedback.persistenceWarning path is structurally unreachable for real
  // learners (only test fixtures that bypass this proxy could see it).
  //
  // We diff the channel's `lastError` reference and `updatedAt` before/after
  // the `writeData` call. A fresh error raises a throw so `saveJson` can
  // surface the warning. Any persistent prior error does NOT re-throw (the
  // reference / timestamp match). This keeps the contract compatible with
  // the legacy-engine's own saveProgress, whose try/catch silently swallows
  // the throw — that is desirable: we don't want legacy-engine to change,
  // only the service's write paths that consume `saveJson`'s return shape.
  function readPersistenceError() {
    const snapshot = repositories.persistence?.read?.();
    return snapshot?.lastError || null;
  }
  function errorSignatureChanged(before, after) {
    if (!after) return false;
    if (!before) return true;
    // `persistenceChannel.set` creates a fresh snapshot each call, so a
    // re-thrown identical-message error still bumps `updatedAt`. Use that
    // as the primary signal; fall back to message comparison for adapters
    // that might reuse timestamps.
    if (Number(before.at) !== Number(after.at)) return true;
    return before.message !== after.message;
  }

  const storage = {
    getItem(key) {
      const parsed = parseStorageKey(key);
      if (!parsed) return null;
      const data = readSpellingData(repositories, parsed.learnerId, currentDay());
      if (parsed.type === 'prefs') return JSON.stringify(data.prefs || {});
      if (parsed.type === 'progress') return JSON.stringify(data.progress || {});
      if (parsed.type === 'guardian') return JSON.stringify(data.guardian || {});
      // P2 U2: postMega is null for never-graduated learners; stringify
      // preserves null-vs-object distinction for the service-layer reader.
      if (parsed.type === 'postMega') return data.postMega ? JSON.stringify(data.postMega) : 'null';
      // P2 U11: Pattern Quest wobble sibling. Returns an empty
      // `{ wobbling: {} }` shape when the learner has never wobbled so
      // the service reader can treat a missing record identically to an
      // empty record.
      if (parsed.type === 'pattern') return JSON.stringify(data.pattern || { wobbling: {} });
      // P2 U9: persistenceWarning is null for learners who have never seen
      // a save failure; the null-vs-object distinction matters so the
      // service can use a missing record as the "no active warning" marker.
      if (parsed.type === 'persistenceWarning') {
        return data.persistenceWarning ? JSON.stringify(data.persistenceWarning) : 'null';
      }
      return null;
    },
    setItem(key, value) {
      const parsed = parseStorageKey(key);
      if (!parsed) return;
      const day = currentDay();
      const current = readSpellingData(repositories, parsed.learnerId, day);
      const beforeError = readPersistenceError();
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
      if (parsed.type === 'postMega') {
        // P2 U2 H3 mitigation guard — idempotency in the persistence
        // critical section. Re-read `current.postMega`; if already set,
        // skip the write so a concurrent second Mega-producing submit
        // cannot overwrite the original `unlockedAt`. This guard survives
        // the U2-to-U5 window where full storage-CAS is not yet in place;
        // U5 later reinforces it with `navigator.locks` serialisation.
        if (current.postMega) {
          // Already sticky — treat as benign no-op, preserving the
          // original record.
        } else {
          writeSpellingData(repositories, parsed.learnerId, {
            ...current,
            postMega: parseStoredJson(value, null),
          }, day);
        }
      }
      if (parsed.type === 'pattern') {
        // P2 U11: straight last-writer-wins for Pattern Quest wobble. Unlike
        // postMega (sticky by contract), pattern.wobbling entries flip
        // freely as the learner wobbles and recovers; same semantics as
        // guardian.wobbling. The `parseStoredJson` default { wobbling: {} }
        // keeps an absent body from collapsing the sibling into null.
        writeSpellingData(repositories, parsed.learnerId, {
          ...current,
          pattern: parseStoredJson(value, { wobbling: {} }),
        }, day);
      }
      if (parsed.type === 'persistenceWarning') {
        // P2 U9: unlike `postMega`, the persistence-warning record IS
        // overwrite-ful. A subsequent failure overwrites `reason` +
        // `occurredAt` and resets `acknowledged: false`; an acknowledge
        // dispatcher overwrites with `acknowledged: true`. We persist the
        // parsed payload directly so the callers (service) own the shape.
        writeSpellingData(repositories, parsed.learnerId, {
          ...current,
          persistenceWarning: parseStoredJson(value, null),
        }, day);
      }
      const afterError = readPersistenceError();
      if (errorSignatureChanged(beforeError, afterError)) {
        const message = afterError?.message || 'storage-setItem-failed';
        throw Object.assign(new Error(message), {
          name: 'PersistenceSetItemError',
          persistenceError: afterError,
        });
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
      // P2 U11: pattern sibling is clearable through removeItem so
      // resetLearner and explicit clear paths work symmetrically with the
      // guardian + progress siblings. (Unlike postMega, pattern.wobbling is
      // not sticky.)
      if (parsed.type === 'pattern') {
        writeSpellingData(repositories, parsed.learnerId, { ...current, pattern: { wobbling: {} } }, day);
      }
      // P2 U9: persistenceWarning can be removed via `resetLearner` (below)
      // which clears the whole bundle. A direct removeItem on this key is
      // also honoured — strip the sibling from the normalised bundle. No
      // sticky-lock constraint applies (the record is overwritable anyway).
      if (parsed.type === 'persistenceWarning') {
        const next = { ...current };
        delete next.persistenceWarning;
        writeSpellingData(repositories, parsed.learnerId, next, day);
      }
      // P2 U2: postMega cannot be removed through this path — sticky is
      // permanent by contract. `resetLearner` (below) is the only surface
      // that clears postMega, and it goes through writeSpellingData with an
      // explicit empty bundle.
    },
  };

  return {
    storage,
    progressKey,
    prefsKey,
    guardianKey,
    postMegaKey,
    patternKey,
    persistenceWarningKey,
    // U8 review fix: expose the platform persistence channel's `lastError`
    // signal so the spelling service can detect legacy-engine's silent-
    // swallow on Smart Review / SATs submits. Legacy-engine's
    // `saveProgress` catches the proxy throw; the service cannot observe
    // the failure through the storage return value, but the channel holds
    // a fresh error with a bumped `at` timestamp whenever `persistAll`
    // failed. The service compares before/after `at` on each submit.
    readPersistenceError() {
      return repositories.persistence?.read?.()?.lastError || null;
    },
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
