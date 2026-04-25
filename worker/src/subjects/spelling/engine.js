import {
  cloneSerialisable,
  normalisePracticeSessionRecord,
} from '../../../../src/platform/core/repositories/helpers.js';
import {
  createInitialSpellingState,
  normaliseGuardianMap,
} from '../../../../src/subjects/spelling/service-contract.js';
import { createSpellingService } from '../../../../shared/spelling/service.js';
import { BadRequestError } from '../../errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const SUBJECT_ID = 'spelling';
const SERVER_AUTHORITY = 'worker';
const PREF_STORAGE_PREFIX = 'ks2-platform-v2.spelling-prefs.';
const PROGRESS_STORAGE_PREFIX = 'ks2-spell-progress-';
const GUARDIAN_STORAGE_PREFIX = 'ks2-spell-guardian-';

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
  return {
    prefs: isPlainObject(raw.prefs) ? cloneSerialisable(raw.prefs) : {},
    progress: normaliseProgressMap(raw.progress),
    guardian: normaliseGuardianMap(raw.guardian, Number.isFinite(todayDay) && todayDay >= 0 ? todayDay : 0),
  };
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

function buildActiveRecord(learnerId, state, now) {
  const session = state?.session;
  if (!session) return null;
  return normalisePracticeSessionRecord({
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session.type,
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
      },
      removeItem(key) {
        const parsed = parseStorageKey(key);
        if (!parsed || (parsed.learnerId && parsed.learnerId !== learnerId)) return;
        if (parsed.type === 'prefs') nextData = normaliseServerSpellingData({ ...nextData, prefs: {} }, resolveNow());
        if (parsed.type === 'progress') nextData = normaliseServerSpellingData({ ...nextData, progress: {} }, resolveNow());
        if (parsed.type === 'guardian') nextData = normaliseServerSpellingData({ ...nextData, guardian: {} }, resolveNow());
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
      } else {
        throw new BadRequestError('Unsupported spelling command.', {
          code: 'spelling_command_unsupported',
          subjectId: SUBJECT_ID,
          command,
        });
      }

      const nextState = markServerOwnedState(transition.state);
      return {
        ok: transition.ok !== false,
        changed: transition.changed !== false,
        state: nextState,
        data: persistence.snapshot(),
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
      };
    },
  };
}

export { SERVER_AUTHORITY as SPELLING_SERVER_AUTHORITY };
