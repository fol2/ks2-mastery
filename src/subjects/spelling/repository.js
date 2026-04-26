import { cloneSerialisable, normalisePracticeSessionRecord } from '../../platform/core/repositories/helpers.js';
import {
  normaliseAchievementsMap,
  normaliseDurablePersistenceWarning,
  normaliseGuardianMap,
  normalisePatternMap,
  normalisePostMegaRecord,
} from './service-contract.js';
import { WriteVersionStaleError, isWriteVersionStaleError } from '../../platform/core/repositories/locks/write-version.js';

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
// P2 U12: achievements sibling. Mirrors ACHIEVEMENTS_KEY_PREFIX in
// shared/spelling/service.js — must stay byte-identical. Deliberately a
// DISTINCT prefix from the `ks2-spell-` family (same reasoning as U9's
// `ks2-spell-persistence-warning-`) so the `parseStorageKey` startsWith
// dispatch cannot collide with `ks2-spell-pattern-` / `ks2-spell-progress-`
// / `ks2-spell-post-mega-` — all four start with `ks2-spell-p`.
const ACHIEVEMENTS_STORAGE_PREFIX = 'ks2-spell-achievements-';
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

// P2 U12: achievements sibling key.
function achievementsKey(learnerId) {
  return `${ACHIEVEMENTS_STORAGE_PREFIX}${learnerId || 'default'}`;
}

function parseStorageKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(PREF_STORAGE_PREFIX)) {
    return { type: 'prefs', learnerId: key.slice(PREF_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U12: achievements prefix (`ks2-spell-a...`) — checked first among the
  // `ks2-spell-` family so it cannot be mis-routed. Prefix is disjoint from
  // every other sibling (all others start with `ks2-spell-p` or `ks2-spell-g`).
  if (key.startsWith(ACHIEVEMENTS_STORAGE_PREFIX)) {
    return { type: 'achievements', learnerId: key.slice(ACHIEVEMENTS_STORAGE_PREFIX.length) || 'default' };
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
  // P2 U12: `achievements` is the unlocks sibling — `{ [id]: { unlockedAt } }`.
  // Once set, an achievement row NEVER reverts (H4 idempotency; INSERT-OR-IGNORE
  // inside setItem below). Attach only when at least one unlock exists so a
  // pre-U12 bundle stays compact and the composite invariant test (U8b) can
  // assert the sibling never reverts from present -> absent.
  const achievements = normaliseAchievementsMap(raw.achievements);
  if (achievements && Object.keys(achievements).length > 0) output.achievements = achievements;
  return output;
}

function readSpellingData(repositories, learnerId, todayDay = 0) {
  return normaliseSpellingSubjectData(repositories.subjectStates.read(learnerId, SUBJECT_ID).data || {}, todayDay);
}

// P2 U5 reviewer-feedback (NEW HIGH 1): raise the attempt cap to survive
// cross-domain writeVersion thrash. The `persistAll` writeVersion counter
// bumps on every write across all bundle domains (learners, subjectStates,
// practiceSessions, gameState, eventLog). An unrelated domain's write —
// e.g. a monster-codex gameState update or a telemetry eventLog append —
// bumps the counter and makes an in-flight Guardian write look stale under
// contention. Empirical repro: 4 concurrent bumps from unrelated domains
// + 1 guardian write exhausted the previous cap of 4. Raising to 16 gives
// the Guardian write room to survive thrash from sibling domains.
//
// The capped-linear backoff (BACKOFF_STEP_MS per attempt) reduces
// re-contention pressure so the thrashing sibling has a chance to complete.
// We avoid true exponential growth because writeVersion CAS is cheap; the
// goal is to nudge scheduling rather than rate-limit aggressively. The
// first attempt has no delay (fast path for the common no-contention case).
const CAS_MAX_ATTEMPTS = 16;
// Backoff helpers kept for future async-call-site use (the sync CAS path
// cannot `await` without invasively touching every caller). An async
// wrapper can import `backoffDelayForAttempt` and `delayMs` when the
// service layer grows an async write surface.
const BACKOFF_STEP_MS = 8;
const BACKOFF_MAX_MS = 128;

export function backoffDelayForAttempt(attempt) {
  const jitter = Math.floor(Math.random() * BACKOFF_STEP_MS);
  const linear = Math.min(attempt * BACKOFF_STEP_MS, BACKOFF_MAX_MS);
  return linear + jitter;
}

export function delayMs(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  let spinCount = 0;
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
        // expectedWriteVersion. Sync retry burns CPU on second+
        // attempts — spin-yield with a short busy wait proxy (Atomics
        // isn't available everywhere, and we cannot `await` here). The
        // primary backpressure lives in the async caller; this sync
        // path accepts more attempts but cannot schedule delays. The
        // 16-attempt cap is sized for the worst case where 3-4 sibling
        // domains race concurrently.
        lastError = error;
        spinCount += 1;
        continue;
      }
      throw error;
    }
  }
  // Exhausted attempts — surface the last stale-version error so the
  // service layer can raise `feedback.persistenceWarning`. The plan
  // intentionally opts for a soft warning over silent data loss.
  throw lastError || new WriteVersionStaleError({
    expected: -1,
    actual: -1,
    reason: `write-version-stale-exhausted-${spinCount}-spins`,
  });
}

// U1 follow-up (reviewer-blocker: ce-data-integrity-guardian HIGH): under a
// CAS retry the `incoming` value is FROZEN at the original setItem call site;
// only `current` is re-read on each retry. Two tabs concurrently completing
// Guardian missions on different days both captured their freshly-computed
// progress record BEFORE the race began — so the losing tab's `incoming`
// sees the days it observed, but not the winning tab's day. A plain
// accept-incoming therefore silently drops the winning tab's accumulated
// day under the retry path. The union helper below merges set-shaped fields
// (`days`, `slugs`) and the pattern-completions map pair-wise so both
// tabs' accumulations survive the CAS replay. Scalar fields like `count`
// use `Math.max` to preserve monotonicity for any future progress shapes
// that carry counters.
//
// The union is deterministic: arrays sort ascending (numeric or
// lexicographic) so repeated calls produce byte-identical output — the
// composite invariant test (U8b) and storage goldens depend on this
// stability.
function unionSortedNumeric(a, b) {
  const set = new Set();
  if (Array.isArray(a)) for (const v of a) { const n = Number(v); if (Number.isFinite(n)) set.add(Math.floor(n)); }
  if (Array.isArray(b)) for (const v of b) { const n = Number(v); if (Number.isFinite(n)) set.add(Math.floor(n)); }
  return [...set].sort((x, y) => x - y);
}

function unionSortedStrings(a, b) {
  const set = new Set();
  if (Array.isArray(a)) for (const v of a) { if (typeof v === 'string' && v) set.add(v); }
  if (Array.isArray(b)) for (const v of b) { if (typeof v === 'string' && v) set.add(v); }
  return [...set].sort();
}

// Union the `_progress:pattern:completions.<patternId>` lists. Each entry is
// `{ createdAt, correctCount, sessionId }`. We dedupe by the
// `(sessionId|createdAt|correctCount)` tuple — the same completion replayed
// under CAS retry must not double-count — then sort ascending by createdAt
// and trim to the last PATTERN_MASTERY_STREAK_LENGTH (3) so the evaluator
// sees the freshest streak window. Importing PATTERN_MASTERY_STREAK_LENGTH
// from achievements.js would cycle imports at module load; we mirror the
// constant locally (kept in sync by the composite invariant test which
// exercises the 3-completion window end-to-end).
const PATTERN_COMPLETION_STREAK_LENGTH = 3;
function unionPatternCompletions(a, b) {
  const safeA = a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  const safeB = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const patternIds = new Set([...Object.keys(safeA), ...Object.keys(safeB)]);
  const merged = {};
  for (const patternId of patternIds) {
    const listA = Array.isArray(safeA[patternId]) ? safeA[patternId] : [];
    const listB = Array.isArray(safeB[patternId]) ? safeB[patternId] : [];
    const seen = new Set();
    const combined = [];
    for (const entry of [...listA, ...listB]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const createdAt = Number.isFinite(Number(entry.createdAt)) ? Number(entry.createdAt) : 0;
      const correctCount = Number.isFinite(Number(entry.correctCount)) ? Number(entry.correctCount) : 0;
      const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : '';
      const key = `${sessionId}|${createdAt}|${correctCount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push({ createdAt, correctCount, sessionId });
    }
    combined.sort((x, y) => Number(x.createdAt) - Number(y.createdAt));
    while (combined.length > PATTERN_COMPLETION_STREAK_LENGTH) combined.shift();
    merged[patternId] = combined;
  }
  return merged;
}

/**
 * Pair-wise union of two `_progress:*` achievement records under a CAS retry.
 *
 * `existing` is the record persisted to disk (read fresh on each retry);
 * `incoming` is the caller's captured record from the original setItem
 * call site — potentially stale relative to `existing` because a sibling
 * tab may have persisted its own progress between the caller computing
 * `incoming` and the CAS commit attempt.
 *
 * Set-shaped fields union (days / slugs). The patternCompletions map
 * unions per-patternId with tuple dedup + chronological trim. Unknown
 * scalar fields take `Math.max` to remain monotonic. If neither side
 * carries a recognised field, the result is an empty object (caller
 * drops the row — matches normaliseProgressRecord's null-return shape).
 *
 * Pure: returns a fresh object, mutates nothing.
 */
function unionProgressRecords(existing, incoming) {
  const safeExisting = existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {};
  const safeIncoming = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  const merged = {};
  if (Array.isArray(safeExisting.days) || Array.isArray(safeIncoming.days)) {
    merged.days = unionSortedNumeric(safeExisting.days, safeIncoming.days);
  }
  if (Array.isArray(safeExisting.slugs) || Array.isArray(safeIncoming.slugs)) {
    merged.slugs = unionSortedStrings(safeExisting.slugs, safeIncoming.slugs);
  }
  if (
    (safeExisting.completions && typeof safeExisting.completions === 'object' && !Array.isArray(safeExisting.completions))
    || (safeIncoming.completions && typeof safeIncoming.completions === 'object' && !Array.isArray(safeIncoming.completions))
  ) {
    merged.completions = unionPatternCompletions(safeExisting.completions, safeIncoming.completions);
  }
  // Scalar monotonic counters — `count` is the canonical name; future
  // progress shapes can follow the same convention and inherit this path.
  const existingCount = Number(safeExisting.count);
  const incomingCount = Number(safeIncoming.count);
  const hasExistingCount = Number.isFinite(existingCount);
  const hasIncomingCount = Number.isFinite(incomingCount);
  if (hasExistingCount || hasIncomingCount) {
    merged.count = Math.max(
      hasExistingCount ? existingCount : 0,
      hasIncomingCount ? incomingCount : 0,
    );
  }
  return merged;
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
      // P2 U12: achievements map — empty `{}` for learners who have unlocked
      // nothing yet (parallel to pattern's `{ wobbling: {} }` shape). The
      // empty-object return lets the service reader treat a missing record
      // identically to an empty record without branching on undefined.
      if (parsed.type === 'achievements') {
        return JSON.stringify(data.achievements || {});
      }
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
        if (parsed.type === 'pattern') {
          // P2 U11: straight last-writer-wins for Pattern Quest wobble. Unlike
          // postMega (sticky by contract), pattern.wobbling entries flip
          // freely as the learner wobbles and recovers; same semantics as
          // guardian.wobbling. The `parseStoredJson` default { wobbling: {} }
          // keeps an absent body from collapsing the sibling into null.
          return { ...current, pattern: parseStoredJson(value, { wobbling: {} }) };
        }
        if (parsed.type === 'persistenceWarning') {
          // P2 U9: unlike `postMega`, the persistence-warning record IS
          // overwrite-ful. A subsequent failure overwrites `reason` +
          // `occurredAt` and resets `acknowledged: false`; an acknowledge
          // dispatcher overwrites with `acknowledged: true`. We persist the
          // parsed payload directly so the callers (service) own the shape.
          return { ...current, persistenceWarning: parseStoredJson(value, null) };
        }
        if (parsed.type === 'achievements') {
          // P2 U12 H4 mitigation — INSERT-OR-IGNORE for UNLOCK rows, UNION-
          // MERGE for PROGRESS rows.
          //
          // Achievements-map entries are polymorphic:
          //   1. Unlock rows (`achievement:...` ids) are STICKY: once
          //      `unlockedAt` is set, it must never change. A concurrent
          //      second-unlock dispatch with stale currentAchievements could
          //      otherwise overwrite the original timestamp — we preserve the
          //      existing row by skipping merge when one is already present.
          //   2. Progress rows (`_progress:*` ids) are MONOTONIC aggregate
          //      counters (days set, slugs set, pattern completions). U1
          //      follow-up (reviewer blocker ce-data-integrity-guardian):
          //      under a CAS retry, `incoming` is FROZEN at the original
          //      setItem call site while `current` is re-read on every
          //      attempt. Two tabs both completing Guardian missions on
          //      different days each capture their own superset relative
          //      to the PRE-race disk state, but NEITHER captures the
          //      other tab's day. A plain accept-incoming therefore drops
          //      the winning tab's day when the losing tab's retry
          //      commits (disk: {days:[1,2,3]}; losing tab `incoming`:
          //      {days:[1,2,4]} -> accept-incoming yields {days:[1,2,4]},
          //      day 3 is LOST). We union the two records instead so both
          //      tabs' accumulations survive (-> {days:[1,2,3,4]}). The
          //      superset assumption held only for sequential single-tab
          //      callers; CAS retry breaks it under multi-tab concurrency.
          //
          // The branch below distinguishes the two shapes and applies the
          // correct merge semantics per row. U1 fix (Cluster A): this logic
          // runs inside `projectForField` so `current` is freshly read on
          // every CAS retry, matching the postMega sibling above.
          const incoming = parseStoredJson(value, {});
          const existing = current.achievements || {};
          const merged = { ...incoming };
          for (const [id, record] of Object.entries(existing)) {
            if (typeof id !== 'string' || !id) continue;
            if (id.startsWith('_progress:')) {
              // Progress rows: union-merge `existing` with `incoming` so
              // neither side's accumulation is dropped under CAS retry.
              // `unionProgressRecords` handles days / slugs / completions
              // pair-wise (see helper above).
              merged[id] = unionProgressRecords(record, incoming[id]);
              continue;
            }
            // Unlock rows: retain existing (sticky unlockedAt).
            merged[id] = record;
          }
          return { ...current, achievements: merged };
        }
        return current;
      };
      // U1 fix (Cluster A): all sibling types now route through a single
      // CAS-aware call. Previously pattern / persistenceWarning /
      // achievements had inline writers referencing an out-of-scope
      // `current` binding, which threw `ReferenceError` on every invocation.
      // Folding them into `projectForField` re-reads `current` inside the
      // callback on each retry, matching the shape already used by
      // postMega.
      writeSpellingData(repositories, parsed.learnerId, null, day, { project: projectForField });
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
        // P2 U11: pattern sibling is clearable through removeItem so
        // resetLearner and explicit clear paths work symmetrically with the
        // guardian + progress siblings. (Unlike postMega, pattern.wobbling is
        // not sticky.)
        if (parsed.type === 'pattern') {
          return { ...current, pattern: { wobbling: {} } };
        }
        // P2 U9: persistenceWarning can be removed via `resetLearner` (below)
        // which clears the whole bundle. A direct removeItem on this key is
        // also honoured — strip the sibling from the normalised bundle. No
        // sticky-lock constraint applies (the record is overwritable anyway).
        if (parsed.type === 'persistenceWarning') {
          const next = { ...current };
          delete next.persistenceWarning;
          return next;
        }
        // P2 U12: achievements can ONLY be cleared through `resetLearner`
        // (which goes through writeSpellingData with an empty bundle). A
        // direct removeItem here is a deliberate reset signal (e.g. admin-ops
        // tool) — strip the sibling. Unlocks are otherwise append-only; the
        // setItem path above enforces INSERT-OR-IGNORE so no path outside of
        // remove / reset can mutate an unlocked id.
        if (parsed.type === 'achievements') {
          const next = { ...current };
          delete next.achievements;
          return next;
        }
        return current;
      };
      // U1 fix (Cluster A): all removable sibling types now route through a
      // single CAS-aware call. Previously pattern / persistenceWarning /
      // achievements had inline writers referencing an out-of-scope
      // `current` binding, which threw `ReferenceError` on every
      // invocation. Folding them into `projectForFieldRemoval` re-reads
      // `current` inside the callback on each retry. postMega is
      // intentionally absent here — it is sticky by contract and can only
      // be cleared via `resetLearner` below.
      writeSpellingData(repositories, parsed.learnerId, null, day, { project: projectForFieldRemoval });
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
    achievementsKey,
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
