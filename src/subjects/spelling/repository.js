import { cloneSerialisable, normalisePracticeSessionRecord } from '../../platform/core/repositories/helpers.js';
import { normaliseGuardianMap, normalisePostMegaRecord } from './service-contract.js';
import { WriteVersionStaleError, isWriteVersionStaleError } from '../../platform/core/repositories/locks/write-version.js';

const SUBJECT_ID = 'spelling';
const PREF_STORAGE_PREFIX = 'ks2-platform-v2.spelling-prefs.';
const PROGRESS_STORAGE_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_STORAGE_PREFIX = 'ks2-spell-guardian-';
// P2 U2: sticky-graduation sibling. Mirrors POST_MEGA_KEY_PREFIX in
// shared/spelling/service.js — must stay byte-identical with that constant.
const POST_MEGA_STORAGE_PREFIX = 'ks2-spell-post-mega-';
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

function parseStorageKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(PREF_STORAGE_PREFIX)) {
    return { type: 'prefs', learnerId: key.slice(PREF_STORAGE_PREFIX.length) || 'default' };
  }
  if (key.startsWith(GUARDIAN_STORAGE_PREFIX)) {
    return { type: 'guardian', learnerId: key.slice(GUARDIAN_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U2: order matters — POST_MEGA_STORAGE_PREFIX must be checked BEFORE
  // PROGRESS_STORAGE_PREFIX because `ks2-spell-post-mega-` starts with
  // `ks2-spell-p`, the same first 11 chars as progress. We keep the unique
  // second-segment prefix check (`post-mega`) to disambiguate.
  if (key.startsWith(POST_MEGA_STORAGE_PREFIX)) {
    return { type: 'postMega', learnerId: key.slice(POST_MEGA_STORAGE_PREFIX.length) || 'default' };
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
  return output;
}

function readSpellingData(repositories, learnerId, todayDay = 0) {
  return normaliseSpellingSubjectData(repositories.subjectStates.read(learnerId, SUBJECT_ID).data || {}, todayDay);
}

// P2 U5: max CAS retry attempts. In practice one retry should suffice —
// the duplicate-leader race resolves after two re-reads in the worst case
// (tab A reads N, tab B writes N+1, tab A re-reads N+1, computes N+2,
// succeeds). Capped at 4 so a pathological re-contention scenario surfaces
// the error instead of looping forever.
const CAS_MAX_ATTEMPTS = 4;

// P2 U5: CAS-aware write. When the platform repository exposes
// `storageCas.readWriteVersion`, this helper reads the current version,
// computes the merged next state from the passed projector (so we always
// merge-on-top-of-latest), then commits via `writeData` with the
// `expectedWriteVersion` hint. On a `WriteVersionStaleError`, re-hydrate
// and retry — this is the duplicate-leader edge case the plan calls out.
//
// Hosts without `storageCas` (api.js remote / legacy tests) fall through
// to the plain `writeData` path so the existing contract is preserved.
function writeSpellingData(repositories, learnerId, nextData, todayDay = 0, options = {}) {
  const cas = repositories.storageCas;
  const project = typeof options.project === 'function'
    ? options.project
    : (() => normaliseSpellingSubjectData(nextData, todayDay));
  if (!cas || typeof cas.readWriteVersion !== 'function') {
    // Legacy path — no CAS available, just write.
    return normaliseSpellingSubjectData(
      repositories.subjectStates.writeData(
        learnerId,
        SUBJECT_ID,
        normaliseSpellingSubjectData(project(null), todayDay),
      ).data,
      todayDay,
    );
  }
  let lastError = null;
  for (let attempt = 0; attempt < CAS_MAX_ATTEMPTS; attempt += 1) {
    // On every retry (including the first), force-rehydrate the repository's
    // in-memory cache from raw storage. This guarantees the projector reads
    // the LATEST persisted state so the write-on-top merge is correct —
    // without rehydration, Tab A's cache would still hold {X} and Tab B's
    // write of {Y} on disk would be invisible to the projector.
    if (typeof cas.rehydrateFromStorage === 'function') {
      cas.rehydrateFromStorage();
    }
    const expected = cas.readWriteVersion();
    const projected = normaliseSpellingSubjectData(project(null), todayDay);
    try {
      const result = repositories.subjectStates.writeData(learnerId, SUBJECT_ID, projected, {
        expectedWriteVersion: expected,
      });
      return normaliseSpellingSubjectData(result.data, todayDay);
    } catch (error) {
      if (isWriteVersionStaleError(error)) {
        // Another tab wrote between our read and pre-commit re-read. Loop
        // back: rehydrate, re-project, and re-commit with the fresher
        // expectedWriteVersion.
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  // Exhausted attempts — surface the last stale-version error so the
  // service layer can raise `feedback.persistenceWarning`. The plan
  // intentionally opts for a soft warning over silent data loss.
  throw lastError || new WriteVersionStaleError({ expected: -1, actual: -1, reason: 'write-version-stale-exhausted' });
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
      return null;
    },
    setItem(key, value) {
      const parsed = parseStorageKey(key);
      if (!parsed) return;
      const day = currentDay();
      const beforeError = readPersistenceError();
      // P2 U5: each field write passes a `project` callback to
      // `writeSpellingData`. The CAS-aware path invokes the callback on
      // every retry with a fresh read of the merged subject state. Tabs
      // that lost the race re-compute their write on top of the winner's
      // persisted state, so the Guardian / progress / postMega slug the
      // caller wanted to update is merged into the fresh bundle instead
      // of being clobbered.
      // P2 U5: multi-slug maps (progress + guardian) merge rather than replace.
      // The caller's `value` is the FULL map as the caller understood it.
      // When a sibling tab writes in parallel, the caller's map is missing
      // the sibling's slug; naive replacement would drop it. Merging per-
      // slug preserves both tabs' writes when the slug sets are disjoint,
      // and last-writer-wins when both tabs wrote the same slug (which is
      // the acceptable local semantic for same-slug contention — Guardian
      // slugs advance monotonically on correct answers). Prefs is a
      // last-writer-wins map on purpose (single-intent settings tray).
      const projectForField = () => {
        const current = readSpellingData(repositories, parsed.learnerId, day);
        if (parsed.type === 'prefs') return { ...current, prefs: parseStoredJson(value, {}) };
        if (parsed.type === 'progress') {
          const incoming = parseStoredJson(value, {});
          const currentProgress = isPlainObject(current.progress) ? current.progress : {};
          const incomingMap = isPlainObject(incoming) ? incoming : {};
          return { ...current, progress: { ...currentProgress, ...incomingMap } };
        }
        if (parsed.type === 'guardian') {
          const incoming = parseStoredJson(value, {});
          const currentGuardian = isPlainObject(current.guardian) ? current.guardian : {};
          const incomingMap = isPlainObject(incoming) ? incoming : {};
          return { ...current, guardian: { ...currentGuardian, ...incomingMap } };
        }
        if (parsed.type === 'postMega') {
          // P2 U2 H3 mitigation guard — idempotency in the persistence
          // critical section. Re-read `current.postMega`; if already set,
          // return the current snapshot unchanged so a concurrent second
          // Mega-producing submit cannot overwrite the original
          // `unlockedAt`. U5 CAS runs this callback on every retry, so
          // the idempotency check sees the freshest state each time.
          if (current.postMega) return current;
          return { ...current, postMega: parseStoredJson(value, null) };
        }
        return current;
      };
      if (parsed.type === 'prefs' || parsed.type === 'progress' || parsed.type === 'guardian' || parsed.type === 'postMega') {
        writeSpellingData(repositories, parsed.learnerId, null, day, { project: projectForField });
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
      // P2 U5: same CAS-aware projection for removal paths. Each retry
      // re-reads the subject state and zeros just the field the caller
      // targeted, leaving other concurrent writes' fields intact.
      const projectForFieldRemoval = () => {
        const current = readSpellingData(repositories, parsed.learnerId, day);
        if (parsed.type === 'prefs') return { ...current, prefs: {} };
        if (parsed.type === 'progress') return { ...current, progress: {} };
        if (parsed.type === 'guardian') return { ...current, guardian: {} };
        return current;
      };
      if (parsed.type === 'prefs' || parsed.type === 'progress' || parsed.type === 'guardian') {
        writeSpellingData(repositories, parsed.learnerId, null, day, { project: projectForFieldRemoval });
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
