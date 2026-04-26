import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../../../src/platform/core/repositories/helpers.js';
import {
  createInitialSpellingState,
  normaliseAchievementsMap,
  normaliseDurablePersistenceWarning,
  normaliseGuardianMap,
  normalisePatternMap,
  normalisePostMegaRecord,
} from '../../../../src/subjects/spelling/service-contract.js';
import { getSpellingPostMasteryState } from '../../../../src/subjects/spelling/read-model.js';
import { createSpellingService } from '../../../../shared/spelling/service.js';
import { BadRequestError } from '../../errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUBJECT_ID = 'spelling';
const SERVER_AUTHORITY = 'worker';
const PREF_STORAGE_PREFIX = 'ks2-platform-v2.spelling-prefs.';
const PROGRESS_STORAGE_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_STORAGE_PREFIX = 'ks2-spell-guardian-';
// P2 U2: mirror client POST_MEGA_STORAGE_PREFIX in src/subjects/spelling/repository.js.
const POST_MEGA_STORAGE_PREFIX = 'ks2-spell-post-mega-';
// P2 U11: mirror client PATTERN_STORAGE_PREFIX so the Worker twin routes
// `data.pattern` reads/writes through the same byte-identical key space.
const PATTERN_STORAGE_PREFIX = 'ks2-spell-pattern-';
// P2 U9: mirror client PERSISTENCE_WARNING_STORAGE_PREFIX in src/subjects/spelling/repository.js.
const PERSISTENCE_WARNING_STORAGE_PREFIX = 'ks2-spell-persistence-warning-';
// P2 U12: mirror client ACHIEVEMENTS_STORAGE_PREFIX so the Worker twin routes
// `data.achievements` reads/writes through the same byte-identical key space.
const ACHIEVEMENTS_STORAGE_PREFIX = 'ks2-spell-achievements-';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
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

export function normaliseServerSpellingData(rawValue, nowTs = Date.now()) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const todayDay = Math.floor(Number(nowTs) / DAY_MS);
  const output = {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    progress: normaliseProgressMap(raw.progress),
    guardian: normaliseGuardianMap(raw.guardian, Number.isFinite(todayDay) && todayDay >= 0 ? todayDay : 0),
  };
  // P2 U2: Worker twin of client's normaliseSpellingSubjectData. Must be
  // byte-identical in behaviour so a learner's `data.postMega` round-trips
  // through Worker commands without loss.
  const postMega = normalisePostMegaRecord(raw.postMega);
  if (postMega) output.postMega = postMega;
  // P2 U11: mirror Pattern Quest wobble sibling on the Worker twin so the
  // subject-state bundle survives a command round-trip with byte-identical
  // shape. Only attached when at least one wobble record survives so
  // pre-U11 learners keep a null/undefined `pattern` field.
  const pattern = normalisePatternMap(raw.pattern);
  if (pattern && Object.keys(pattern.wobbling).length > 0) output.pattern = pattern;
  // P2 U9: persistenceWarning sibling survives through the Worker twin so
  // a learner who saw a local storage failure and switched tabs to a
  // remote-sync session does not lose their banner.
  const persistenceWarning = normaliseDurablePersistenceWarning(raw.persistenceWarning);
  if (persistenceWarning) output.persistenceWarning = persistenceWarning;
  // P2 U12: achievements sibling — `{ [id]: { unlockedAt } }`. Worker twin
  // must keep the shape byte-identical so a learner who unlocks an
  // achievement via remote-sync does not see it disappear on the next local
  // hydration. Only attached when at least one unlock survives, mirroring
  // `pattern` (U11).
  const achievements = normaliseAchievementsMap(raw.achievements);
  if (achievements && Object.keys(achievements).length > 0) output.achievements = achievements;
  return output;
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
  // P2 U9: persistence-warning prefix must be checked before post-mega and
  // progress for the same reason — all three start with `ks2-spell-p`.
  if (key.startsWith(PERSISTENCE_WARNING_STORAGE_PREFIX)) {
    return { type: 'persistenceWarning', learnerId: key.slice(PERSISTENCE_WARNING_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U2: post-mega prefix must be checked before progress because the two
  // share the first 10 chars (`ks2-spell-`) but diverge at the 11th.
  if (key.startsWith(POST_MEGA_STORAGE_PREFIX)) {
    return { type: 'postMega', learnerId: key.slice(POST_MEGA_STORAGE_PREFIX.length) || 'default' };
  }
  // P2 U11: pattern prefix likewise must be checked before progress.
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

function buildActiveRecord(learnerId, state, now) {
  const session = state?.session;
  if (!session) return null;
  // Mirror src/subjects/spelling/repository.js::buildActiveRecord — Boss and
  // Guardian both override session.type with a shape-only value and the real
  // post-Mega identity lives on session.mode. Persisting session.type here
  // would lose that identity so Resume routes back to SATs Test / Smart
  // Review after a refresh. Both runtimes MUST branch identically or server
  // and client will disagree on which scene to open on Resume.
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

function buildCompletedRecord(learnerId, state, latestSession, now) {
  const summary = state?.summary;
  if (!summary) return null;
  return normalisePracticeSessionRecord({
    id: latestSession?.id || `spelling-${timestamp(now)}`,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: latestSession?.sessionKind || summary.mode || 'practice',
    status: 'completed',
    sessionState: null,
    summary: cloneSerialisable(summary),
    createdAt: latestSession?.createdAt || timestamp(now),
    updatedAt: timestamp(now),
  });
}

function buildAbandonedRecord(learnerId, latestSession, now) {
  if (!latestSession || latestSession.subjectId !== SUBJECT_ID || latestSession.status !== 'active') return null;
  return normalisePracticeSessionRecord({
    ...latestSession,
    learnerId,
    subjectId: SUBJECT_ID,
    status: 'abandoned',
    updatedAt: timestamp(now),
  });
}

function markServerOwnedState(rawState) {
  const state = cloneSerialisable(rawState) || createInitialSpellingState();
  if (state.phase === 'session' && state.session) {
    state.session.serverAuthority = SERVER_AUTHORITY;
  }
  return state;
}

function isServerOwnedRawUi(rawUi) {
  if (rawUi?.phase !== 'session' || !rawUi?.session) return true;
  return rawUi.session.serverAuthority === SERVER_AUTHORITY;
}

function createServerPersistence({ learnerId, data, latestSession, now }) {
  const resolveNow = () => (typeof now === 'function' ? now() : now);
  let nextData = normaliseServerSpellingData(data, resolveNow());
  let practiceSession = null;

  function readDataFor(parsed) {
    if (parsed.learnerId && parsed.learnerId !== learnerId) {
      return normaliseServerSpellingData({}, resolveNow());
    }
    return nextData;
  }

  return {
    storage: {
      getItem(key) {
        const parsed = parseStorageKey(key);
        if (!parsed) return null;
        const current = readDataFor(parsed);
        if (parsed.type === 'prefs') return JSON.stringify(current.prefs || {});
        if (parsed.type === 'progress') return JSON.stringify(current.progress || {});
        if (parsed.type === 'guardian') return JSON.stringify(current.guardian || {});
        // P2 U2: postMega is null until first-graduation; preserve the
        // null vs object distinction so the service-layer reader can gate
        // on it without special-casing the string literal.
        if (parsed.type === 'postMega') return current.postMega ? JSON.stringify(current.postMega) : 'null';
        // P2 U11: return empty `{ wobbling: {} }` for pre-U11 learners so
        // the service reader treats an absent sibling identically to an
        // empty one (no branching on undefined inside the hot path).
        if (parsed.type === 'pattern') return JSON.stringify(current.pattern || { wobbling: {} });
        // P2 U9: persistenceWarning is null for learners who have never
        // encountered a local-storage failure; null vs object distinction
        // lets the service-layer reader skip the banner cleanly.
        if (parsed.type === 'persistenceWarning') {
          return current.persistenceWarning ? JSON.stringify(current.persistenceWarning) : 'null';
        }
        // P2 U12: empty `{}` for learners who have not unlocked anything.
        if (parsed.type === 'achievements') {
          return JSON.stringify(current.achievements || {});
        }
        return null;
      },
      setItem(key, value) {
        const parsed = parseStorageKey(key);
        if (!parsed || (parsed.learnerId && parsed.learnerId !== learnerId)) return;
        if (parsed.type === 'prefs') {
          nextData = normaliseServerSpellingData({
            ...nextData,
            prefs: parseStoredJson(value, {}),
          }, resolveNow());
        }
        if (parsed.type === 'progress') {
          nextData = normaliseServerSpellingData({
            ...nextData,
            progress: parseStoredJson(value, {}),
          }, resolveNow());
        }
        if (parsed.type === 'guardian') {
          nextData = normaliseServerSpellingData({
            ...nextData,
            guardian: parseStoredJson(value, {}),
          }, resolveNow());
        }
        if (parsed.type === 'postMega') {
          // P2 U2 H3 mitigation guard — inside the persistence critical
          // section, re-read the current `postMega` sibling; if non-null,
          // skip the write so a concurrent submit cannot overwrite the
          // original `unlockedAt`.
          if (!nextData.postMega) {
            nextData = normaliseServerSpellingData({
              ...nextData,
              postMega: parseStoredJson(value, null),
            }, resolveNow());
          }
        }
        if (parsed.type === 'pattern') {
          // P2 U11: last-writer-wins for the Pattern Quest wobble map.
          nextData = normaliseServerSpellingData({
            ...nextData,
            pattern: parseStoredJson(value, { wobbling: {} }),
          }, resolveNow());
        }
        if (parsed.type === 'persistenceWarning') {
          // P2 U9: persistence-warning is overwrite-ful. A new failure
          // overwrites `reason` + `occurredAt` and resets acknowledged; an
          // acknowledge dispatcher overwrites with `acknowledged: true`.
          nextData = normaliseServerSpellingData({
            ...nextData,
            persistenceWarning: parseStoredJson(value, null),
          }, resolveNow());
        }
        if (parsed.type === 'achievements') {
          // P2 U12 H4: INSERT-OR-IGNORE for UNLOCK rows, MONOTONIC
          // accept-incoming for PROGRESS rows. Mirrors the client repository
          // semantics — unlock rows are sticky (preserve existing
          // `unlockedAt`); `_progress:*` rows are monotonic aggregate
          // counters (accept the freshly computed superset). Without this
          // split, the Worker twin persists `{days: [lastDay]}` on every
          // write and Guardian 7-day never unlocks via `data.achievements`.
          const incoming = parseStoredJson(value, {});
          const existing = nextData.achievements || {};
          const merged = { ...incoming };
          for (const [id, record] of Object.entries(existing)) {
            if (typeof id !== 'string' || !id) continue;
            if (id.startsWith('_progress:')) {
              // Progress rows: accept incoming monotonic state; do NOT
              // overwrite with existing — that would drop accumulation.
              continue;
            }
            // Unlock rows: sticky — retain existing `unlockedAt`.
            merged[id] = record;
          }
          nextData = normaliseServerSpellingData({
            ...nextData,
            achievements: merged,
          }, resolveNow());
        }
      },
      removeItem(key) {
        const parsed = parseStorageKey(key);
        if (!parsed || (parsed.learnerId && parsed.learnerId !== learnerId)) return;
        if (parsed.type === 'prefs') nextData = normaliseServerSpellingData({ ...nextData, prefs: {} }, resolveNow());
        if (parsed.type === 'progress') nextData = normaliseServerSpellingData({ ...nextData, progress: {} }, resolveNow());
        if (parsed.type === 'guardian') nextData = normaliseServerSpellingData({ ...nextData, guardian: {} }, resolveNow());
        // P2 U11: pattern sibling clears symmetrically with guardian.
        if (parsed.type === 'pattern') nextData = normaliseServerSpellingData({ ...nextData, pattern: { wobbling: {} } }, resolveNow());
        if (parsed.type === 'persistenceWarning') {
          // P2 U9: removable — e.g. a future admin-ops tool may want to
          // clear a resolved warning. Strip the sibling from the bundle.
          const stripped = { ...nextData };
          delete stripped.persistenceWarning;
          nextData = normaliseServerSpellingData(stripped, resolveNow());
        }
        if (parsed.type === 'achievements') {
          // P2 U12: removable via direct removeItem for admin-ops reset
          // paths. Setting the map empty via setItem above would NOT clear
          // because of the INSERT-OR-IGNORE merge; removeItem is the
          // only surface that strips the sibling.
          const stripped = { ...nextData };
          delete stripped.achievements;
          nextData = normaliseServerSpellingData(stripped, resolveNow());
        }
        // postMega intentionally not removable — sticky by contract.
      },
    },
    syncPracticeSession(nextLearnerId, state) {
      if (nextLearnerId !== learnerId) return null;
      if (state?.phase === 'session') {
        practiceSession = buildActiveRecord(learnerId, markServerOwnedState(state), now);
        return practiceSession;
      }
      if (state?.phase === 'summary') {
        practiceSession = buildCompletedRecord(learnerId, state, latestSession || practiceSession, now);
        return practiceSession;
      }
      practiceSession = null;
      return null;
    },
    abandonPracticeSession(nextLearnerId) {
      if (nextLearnerId !== learnerId) return null;
      practiceSession = buildAbandonedRecord(learnerId, latestSession || practiceSession, now);
      return practiceSession;
    },
    resetLearner(nextLearnerId) {
      if (nextLearnerId !== learnerId) return;
      nextData = normaliseServerSpellingData({}, resolveNow());
      practiceSession = null;
    },
    snapshot() {
      return normaliseServerSpellingData(nextData, resolveNow());
    },
    practiceSession() {
      return practiceSession ? cloneSerialisable(practiceSession) : null;
    },
  };
}

function startOptionsFromPayload(payload = {}) {
  const words = Array.isArray(payload.words)
    ? payload.words
    : (typeof payload.slug === 'string' && payload.slug ? [payload.slug] : undefined);
  return {
    mode: payload.mode,
    yearFilter: payload.yearFilter,
    length: payload.length ?? payload.roundLength,
    words,
    practiceOnly: payload.practiceOnly,
    extraWordFamilies: payload.extraWordFamilies,
    // P2 U11: Pattern Quest carries `patternId` through the server command
    // boundary so the service's `startPatternQuestSession` knows which
    // 5-card quest to build.
    patternId: typeof payload.patternId === 'string' ? payload.patternId : undefined,
  };
}

function typedAnswerFromPayload(payload = {}) {
  if (typeof payload.typed === 'string') return payload.typed;
  if (typeof payload.answer === 'string') return payload.answer;
  return '';
}

function buildTransition(state, { events = [], audio = null, changed = true, ok = true } = {}) {
  return {
    ok,
    changed,
    state,
    events: Array.isArray(events) ? events.filter(Boolean) : [],
    audio,
  };
}

function staleSessionError(command) {
  throw new BadRequestError('This spelling session is no longer active on the server.', {
    code: 'spelling_session_stale',
    command,
  });
}

function stateAfterPreferenceChange(currentState) {
  if (currentState?.phase === 'session' && currentState.session) return currentState;
  return createInitialSpellingState();
}

export function createServerSpellingEngine({
  now = Date.now,
  random = Math.random,
  contentSnapshot,
} = {}) {
  const clock = () => timestamp(now);

  return {
    apply({
      learnerId,
      subjectRecord = {},
      latestSession = null,
      command,
      payload = {},
    } = {}) {
      if (!(typeof learnerId === 'string' && learnerId)) {
        throw new BadRequestError('Learner id is required for spelling commands.', {
          code: 'learner_id_required',
          subjectId: SUBJECT_ID,
        });
      }

      const persistence = createServerPersistence({
        learnerId,
        data: subjectRecord.data,
        latestSession,
        now: clock,
      });
      const service = createSpellingService({
        repository: persistence,
        now: clock,
        random,
        contentSnapshot,
        tts: {
          speak() {},
          stop() {},
          warmup() {},
        },
      });

      const currentState = service.initState(subjectRecord.ui, learnerId);
      const currentRawUiWasServerOwned = isServerOwnedRawUi(subjectRecord.ui);
      let transition;

      if (command === 'start-session') {
        transition = service.startSession(learnerId, startOptionsFromPayload(payload));
      } else if (currentState.phase === 'session' && !currentRawUiWasServerOwned) {
        persistence.abandonPracticeSession(learnerId, currentState);
        staleSessionError(command);
      } else if (command === 'submit-answer') {
        transition = service.submitAnswer(learnerId, currentState, typedAnswerFromPayload(payload));
      } else if (command === 'continue-session') {
        transition = service.continueSession(learnerId, currentState);
      } else if (command === 'skip-word') {
        transition = service.skipWord(learnerId, currentState);
      } else if (command === 'end-session') {
        transition = service.endSession(learnerId, currentState);
      } else if (command === 'save-prefs') {
        const prefs = service.savePrefs(learnerId, payload.prefs || payload);
        transition = buildTransition(stateAfterPreferenceChange(currentState), { events: [], audio: null });
        transition.prefs = prefs;
      } else if (command === 'reset-learner') {
        service.resetLearner(learnerId);
        transition = buildTransition(createInitialSpellingState());
      } else if (command === 'acknowledge-persistence-warning') {
        // P2 U9: durable-warning acknowledgement. Service sets
        // `data.persistenceWarning.acknowledged: true` but keeps the record
        // for audit. Worker twin honours the same contract so remote-sync
        // learners can dismiss the banner without a local-storage write.
        service.acknowledgePersistenceWarning(learnerId);
        transition = buildTransition(currentState, { events: [], audio: null });
      } else {
        throw new BadRequestError('Unsupported spelling command.', {
          code: 'spelling_command_unsupported',
          subjectId: SUBJECT_ID,
          command,
        });
      }

      const nextState = markServerOwnedState(transition.state);
      // P2 U4: emit a canonical `postMastery` block on every command
      // response so the client can hydrate `subjectUi.spelling.postMastery`
      // without a second round-trip. Additive by design — old clients that
      // never read the field continue to work. Fed by `getSpellingPostMasteryState`
      // from the read-model (same derivation as every other post-mastery
      // consumer) so Worker and client cannot drift. `sourceHint: 'worker'`
      // flows into `postMasteryDebug.source` so the Admin hub can tell a
      // worker-hydrated snapshot apart from a client-only locked-fallback.
      //
      // PR #277 MEDIUM (reliability) fix — wrap the derivation in a
      // try/catch. If the selector throws (unexpected persisted shape,
      // runtime snapshot corruption, content-bundle drift), fall back to
      // `postMastery: undefined` so the response still ships and the
      // client degrades to its own locked-fallback (or the previous
      // cache via the HIGH adversarial fix in remote-actions.js) instead
      // of hard-failing every spelling command until the derivation is
      // patched. Logged via console.warn so the Admin hub + server logs
      // surface the underlying error.
      const finalSnapshot = persistence.snapshot();
      let postMastery;
      try {
        postMastery = getSpellingPostMasteryState({
          subjectStateRecord: { data: finalSnapshot },
          runtimeSnapshot: contentSnapshot,
          now: clock,
          sourceHint: 'worker',
        });
      } catch (error) {
        globalThis.console?.warn?.('[spelling.apply] postMastery derivation failed, omitting from response', error);
        postMastery = undefined;
      }
      return {
        ok: transition.ok !== false,
        changed: transition.changed !== false,
        state: nextState,
        data: finalSnapshot,
        practiceSession: persistence.practiceSession(),
        events: transition.events || [],
        audio: transition.audio || null,
        prefs: transition.prefs || service.getPrefs(learnerId),
        stats: {
          all: service.getStats(learnerId, 'core'),
          core: service.getStats(learnerId, 'core'),
          y34: service.getStats(learnerId, 'y3-4'),
          y56: service.getStats(learnerId, 'y5-6'),
          extra: service.getStats(learnerId, 'extra'),
        },
        analytics: service.getAnalyticsSnapshot(learnerId),
        postMastery,
      };
    },
  };
}

export { SERVER_AUTHORITY as SPELLING_SERVER_AUTHORITY };
