import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
  PUNCTUATION_RELEASE_ID,
} from './content.js';
import {
  createPunctuationItemAttemptedEvent,
  createPunctuationMisconceptionObservedEvents,
  createPunctuationSessionCompletedEvent,
  createPunctuationUnitSecuredEvent,
} from './events.js';
import { createPunctuationRuntimeManifest } from './generators.js';
import { markPunctuationAnswer, normaliseAnswerText } from './marking.js';
import {
  memorySnapshot,
  normaliseMemoryState,
  selectPunctuationItem,
  updateMemoryState,
} from './scheduler.js';
import {
  cloneSerialisable,
  createInitialPunctuationState,
  normaliseNonNegativeInteger,
  normalisePunctuationFeedback,
  normalisePunctuationMode,
  normalisePunctuationPrefs,
  normalisePunctuationRoundLength,
  normalisePunctuationSummary,
  normaliseStringArray,
  normaliseTimestamp,
  PUNCTUATION_PHASES,
  PUNCTUATION_SERVICE_STATE_VERSION,
} from '../../src/subjects/punctuation/service-contract.js';

const SUBJECT_ID = 'punctuation';
const SERVER_AUTHORITY = 'worker';
const GENERATED_ITEMS_PER_FAMILY = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(now = Date.now) {
  const value = typeof now === 'function' ? Number(now()) : Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function randomSuffix(random = Math.random) {
  const value = typeof random === 'function' ? Number(random()) : Math.random();
  const bounded = Number.isFinite(value) ? Math.max(0, Math.min(0.999999, value)) : 0;
  return Math.floor(bounded * 0xffffffff).toString(36).padStart(6, '0').slice(0, 8);
}

function uid(prefix, now = Date.now, random = Math.random) {
  return `${prefix}-${timestamp(now).toString(36)}-${randomSuffix(random)}`;
}

export class PunctuationServiceError extends Error {
  constructor(message, { code = 'punctuation_command_failed', details = {} } = {}) {
    super(message);
    this.name = 'PunctuationServiceError';
    this.code = code;
    this.details = details;
  }
}

function serviceError(code, message, details = {}) {
  return new PunctuationServiceError(message, { code, details });
}

function createNoopRepository() {
  let data = createInitialPunctuationData();
  let practiceSession = null;
  return {
    readData() {
      return cloneSerialisable(data);
    },
    writeData(_learnerId, nextData) {
      data = normalisePunctuationData(nextData);
      return cloneSerialisable(data);
    },
    syncPracticeSession(_learnerId, _state, record) {
      practiceSession = cloneSerialisable(record);
      return cloneSerialisable(practiceSession);
    },
    abandonPracticeSession() {
      return null;
    },
    resetLearner() {
      data = createInitialPunctuationData();
      practiceSession = null;
    },
    practiceSession() {
      return cloneSerialisable(practiceSession);
    },
  };
}

export function createInitialPunctuationData() {
  return {
    prefs: { mode: 'smart', roundLength: '4' },
    progress: {
      items: {},
      facets: {},
      rewardUnits: {},
      attempts: [],
      sessionsCompleted: 0,
    },
  };
}

export function normalisePunctuationData(value) {
  const raw = isPlainObject(value) ? value : {};
  const progress = isPlainObject(raw.progress) ? raw.progress : {};
  const normaliseMap = (input) => {
    const output = {};
    if (!isPlainObject(input)) return output;
    for (const [key, entry] of Object.entries(input)) {
      if (typeof key !== 'string' || !key) continue;
      output[key] = normaliseMemoryState(entry);
    }
    return output;
  };

  const rewardUnits = {};
  if (isPlainObject(progress.rewardUnits)) {
    for (const [key, entry] of Object.entries(progress.rewardUnits)) {
      if (!key || !isPlainObject(entry)) continue;
      rewardUnits[key] = {
        masteryKey: typeof entry.masteryKey === 'string' && entry.masteryKey ? entry.masteryKey : key,
        releaseId: typeof entry.releaseId === 'string' ? entry.releaseId : PUNCTUATION_RELEASE_ID,
        clusterId: typeof entry.clusterId === 'string' ? entry.clusterId : '',
        rewardUnitId: typeof entry.rewardUnitId === 'string' ? entry.rewardUnitId : '',
        securedAt: normaliseTimestamp(entry.securedAt, 0),
      };
    }
  }

  return {
    prefs: normalisePunctuationPrefs(raw.prefs),
    progress: {
      items: normaliseMap(progress.items),
      facets: normaliseMap(progress.facets),
      rewardUnits,
      attempts: Array.isArray(progress.attempts)
        ? progress.attempts
            .filter(isPlainObject)
            .map((attempt) => ({
              ts: normaliseTimestamp(attempt.ts, 0),
              sessionId: typeof attempt.sessionId === 'string' ? attempt.sessionId : null,
              itemId: typeof attempt.itemId === 'string' ? attempt.itemId : '',
              mode: typeof attempt.mode === 'string' ? attempt.mode : '',
              skillIds: normaliseStringArray(attempt.skillIds),
              rewardUnitId: typeof attempt.rewardUnitId === 'string' ? attempt.rewardUnitId : '',
              correct: attempt.correct === true,
              misconceptionTags: normaliseStringArray(attempt.misconceptionTags),
            }))
            .slice(-1000)
        : [],
      sessionsCompleted: normaliseNonNegativeInteger(progress.sessionsCompleted, 0),
    },
  };
}

function normaliseItemForState(item) {
  if (!item) return null;
  const safe = {
    id: item.id,
    mode: item.mode,
    skillIds: Array.isArray(item.skillIds) ? [...item.skillIds] : [],
    clusterId: item.clusterId || null,
    rewardUnitId: item.rewardUnitId || null,
    prompt: item.prompt || '',
    stem: item.stem || '',
    explanation: item.explanation || '',
    inputKind: item.mode === 'choose' ? 'choice' : 'text',
    model: item.model || '',
    source: item.source || 'fixed',
  };
  if (item.mode === 'choose') {
    safe.options = Array.isArray(item.options)
      ? item.options.map((option, index) => {
          if (isPlainObject(option)) {
            const optionIndex = Number(option.index);
            return {
              text: typeof option.text === 'string' ? option.text : '',
              index: Number.isInteger(optionIndex) && optionIndex >= 0 ? optionIndex : index,
            };
          }
          return { text: typeof option === 'string' ? option : '', index };
        })
      : [];
  }
  return safe;
}

function normaliseSession(value) {
  if (!isPlainObject(value)) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : '',
    releaseId: typeof value.releaseId === 'string' ? value.releaseId : PUNCTUATION_RELEASE_ID,
    mode: normalisePunctuationMode(value.mode),
    length: Math.max(1, normaliseNonNegativeInteger(value.length, 4)),
    phase: value.phase === 'feedback' ? 'feedback' : 'active-item',
    startedAt: normaliseTimestamp(value.startedAt, 0),
    updatedAt: normaliseTimestamp(value.updatedAt, 0),
    answeredCount: normaliseNonNegativeInteger(value.answeredCount, 0),
    correctCount: normaliseNonNegativeInteger(value.correctCount, 0),
    currentItemId: typeof value.currentItemId === 'string' ? value.currentItemId : '',
    currentItem: normaliseItemForState(value.currentItem),
    recentItemIds: normaliseStringArray(value.recentItemIds).slice(-10),
    securedUnits: normaliseStringArray(value.securedUnits),
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    serverAuthority: value.serverAuthority === SERVER_AUTHORITY ? SERVER_AUTHORITY : null,
  };
}

function normaliseState(value) {
  const fallback = createInitialPunctuationState();
  const raw = isPlainObject(value) ? cloneSerialisable(value) : {};
  const phase = PUNCTUATION_PHASES.includes(raw.phase) ? raw.phase : fallback.phase;
  return {
    ...fallback,
    ...raw,
    version: PUNCTUATION_SERVICE_STATE_VERSION,
    phase,
    session: normaliseSession(raw.session),
    feedback: normalisePunctuationFeedback(raw.feedback),
    summary: normalisePunctuationSummary(raw.summary),
    error: typeof raw.error === 'string' ? raw.error : '',
    availability: isPlainObject(raw.availability)
      ? {
          status: raw.availability.status === 'unavailable' ? 'unavailable' : 'ready',
          code: typeof raw.availability.code === 'string' ? raw.availability.code : null,
          message: typeof raw.availability.message === 'string' ? raw.availability.message : '',
        }
      : fallback.availability,
  };
}

function markServerOwnedState(state) {
  const next = cloneSerialisable(state) || createInitialPunctuationState();
  if (next.session) next.session.serverAuthority = SERVER_AUTHORITY;
  return next;
}

function stateTransition(state, { events = [], changed = true, ok = true } = {}) {
  return {
    ok,
    changed,
    state: cloneSerialisable(state),
    events: Array.isArray(events) ? events.filter(Boolean).map(cloneSerialisable) : [],
    audio: null,
  };
}

function itemForId(indexes, itemId) {
  return indexes.itemById.get(itemId) || null;
}

function rewardUnitForItem(indexes, item) {
  return indexes.rewardUnitById.get(item?.rewardUnitId) || null;
}

function facetKey(skillId, mode) {
  return `${skillId}::${mode}`;
}

function sessionFocus(session = {}, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const skills = new Set();
  for (const itemId of session.recentItemIds || []) {
    const item = indexes.itemById.get(itemId);
    for (const skillId of item?.skillIds || []) skills.add(skillId);
  }
  return [...skills];
}

function currentPublishedRewardUnits(data, indexes = PUNCTUATION_CONTENT_INDEXES) {
  const publishedKeys = new Set(indexes.publishedRewardUnits.map((unit) => unit.masteryKey));
  return Object.entries(data.progress.rewardUnits)
    .filter(([key, unit]) => publishedKeys.has(unit.masteryKey || key))
    .map(([, unit]) => unit);
}

function statsFromData(data, indexes = PUNCTUATION_CONTENT_INDEXES, now = Date.now) {
  const publishedItems = indexes.items.filter((item) => indexes.skillById.get(item.skillIds?.[0])?.published);
  const snaps = publishedItems.map((item) => memorySnapshot(data.progress.items[item.id], now));
  const attempts = data.progress.attempts.length;
  const correct = data.progress.attempts.filter((attempt) => attempt.correct).length;
  const securedRewardUnits = currentPublishedRewardUnits(data, indexes);
  return {
    total: publishedItems.length,
    secure: snaps.filter((snap) => snap.bucket === 'secure').length,
    due: snaps.filter((snap) => snap.bucket === 'due').length,
    fresh: snaps.filter((snap) => snap.bucket === 'new').length,
    weak: snaps.filter((snap) => snap.bucket === 'weak').length,
    attempts,
    correct,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    publishedRewardUnits: indexes.publishedRewardUnits.length,
    securedRewardUnits: securedRewardUnits.length,
    sessionsCompleted: data.progress.sessionsCompleted,
  };
}

function analyticsFromData(data, indexes = PUNCTUATION_CONTENT_INDEXES, now = Date.now) {
  const skillRows = indexes.skills.map((skill) => {
    const items = indexes.itemsBySkill.get(skill.id) || [];
    const snaps = items.map((item) => memorySnapshot(data.progress.items[item.id], now));
    const attempts = snaps.reduce((sum, snap) => sum + snap.attempts, 0);
    const correct = items.reduce((sum, item) => sum + (data.progress.items[item.id]?.correct || 0), 0);
    return {
      skillId: skill.id,
      name: skill.name,
      clusterId: skill.clusterId,
      published: Boolean(skill.published),
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      secure: snaps.filter((snap) => snap.secure).length,
      due: snaps.filter((snap) => snap.bucket === 'due').length,
      weak: snaps.filter((snap) => snap.bucket === 'weak').length,
      mastery: snaps.length ? Math.round(snaps.reduce((sum, snap) => sum + snap.mastery, 0) / snaps.length) : 0,
    };
  });
  return {
    releaseId: PUNCTUATION_RELEASE_ID,
    attempts: data.progress.attempts.length,
    correct: data.progress.attempts.filter((attempt) => attempt.correct).length,
    accuracy: data.progress.attempts.length
      ? Math.round((data.progress.attempts.filter((attempt) => attempt.correct).length / data.progress.attempts.length) * 100)
      : 0,
    sessionsCompleted: data.progress.sessionsCompleted,
    skillRows,
    rewardUnits: currentPublishedRewardUnits(data, indexes),
    recentMistakes: data.progress.attempts.filter((attempt) => !attempt.correct).slice(-8).reverse(),
  };
}

function activePracticeSessionRecord(learnerId, state, now) {
  const session = state.session;
  if (!session) return null;
  return {
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session.mode || 'smart',
    status: 'active',
    sessionState: cloneSerialisable(session),
    summary: null,
    createdAt: session.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function completedPracticeSessionRecord(learnerId, session, summary, now) {
  return {
    id: session?.id || uid('punctuation-session', now),
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session?.mode || 'smart',
    status: 'completed',
    sessionState: null,
    summary: cloneSerialisable(summary),
    createdAt: session?.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function abandonedPracticeSessionRecord(learnerId, session, now) {
  if (!session) return null;
  return {
    id: session.id,
    learnerId,
    subjectId: SUBJECT_ID,
    sessionKind: session.mode || 'smart',
    status: 'abandoned',
    sessionState: cloneSerialisable(session),
    summary: null,
    createdAt: session.startedAt || timestamp(now),
    updatedAt: timestamp(now),
  };
}

function roundLengthFromPrefs(prefs = {}) {
  const value = normalisePunctuationRoundLength(prefs.roundLength || prefs.length);
  if (value === 'all') return 8;
  return Math.max(1, Number.parseInt(value, 10) || 4);
}

function prefsForSession(session = {}, fallback = {}) {
  return normalisePunctuationPrefs({
    ...fallback,
    mode: session.mode || fallback.mode,
    roundLength: session.length || fallback.roundLength || fallback.length,
  });
}

function sessionSummary(session, data, indexes, now = Date.now) {
  const total = Number(session?.answeredCount) || 0;
  const correct = Number(session?.correctCount) || 0;
  return {
    label: 'Punctuation session summary',
    message: total ? 'Session complete.' : 'Session ended.',
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    sessionId: session?.id || null,
    completedAt: timestamp(now),
    focus: sessionFocus(session, indexes),
    securedUnits: normaliseStringArray(session?.securedUnits),
    misconceptionTags: normaliseStringArray(session?.misconceptionTags),
    publishedScope: PUNCTUATION_CONTENT_MANIFEST.publishedScopeCopy,
    rewardProgress: {
      secured: currentPublishedRewardUnits(data, indexes).length,
      published: indexes.publishedRewardUnits.length,
    },
  };
}

function nextActiveState({ learnerId, session, data, indexes, prefs, now, random }) {
  const selection = selectPunctuationItem({
    indexes,
    progress: data.progress,
    session,
    prefs,
    now,
    random,
  });
  if (!selection.item) {
    throw serviceError('punctuation_content_unavailable', 'No published Punctuation content is available.');
  }
  const nextSession = {
    ...session,
    phase: 'active-item',
    updatedAt: timestamp(now),
    currentItemId: selection.item.id,
    currentItem: normaliseItemForState(selection.item),
    recentItemIds: [...(session.recentItemIds || []), selection.item.id].slice(-10),
  };
  return {
    version: PUNCTUATION_SERVICE_STATE_VERSION,
    phase: 'active-item',
    session: nextSession,
    feedback: null,
    summary: null,
    error: '',
    availability: { status: 'ready', code: null, message: '' },
    learnerId,
  };
}

function readData(repository, learnerId) {
  return normalisePunctuationData(repository.readData?.(learnerId));
}

function writeData(repository, learnerId, data) {
  return repository.writeData?.(learnerId, normalisePunctuationData(data)) || normalisePunctuationData(data);
}

function syncPracticeSession(repository, learnerId, state, now) {
  if (state.phase === 'active-item' || state.phase === 'feedback') {
    return repository.syncPracticeSession?.(learnerId, state, activePracticeSessionRecord(learnerId, state, now)) || null;
  }
  if (state.phase === 'summary') {
    return repository.syncPracticeSession?.(
      learnerId,
      state,
      completedPracticeSessionRecord(learnerId, state.session, state.summary, now),
    ) || null;
  }
  return null;
}

export function createPunctuationService({
  repository = createNoopRepository(),
  now = Date.now,
  random = Math.random,
  manifest = createPunctuationRuntimeManifest({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    generatedPerFamily: GENERATED_ITEMS_PER_FAMILY,
  }),
  indexes = createPunctuationContentIndexes(manifest),
} = {}) {
  const clock = () => timestamp(now);

  function requireActiveItem(ui, command = 'submit-answer') {
    const state = normaliseState(ui);
    if (state.phase !== 'active-item' || !state.session?.currentItemId) {
      throw serviceError('punctuation_session_stale', 'There is no active Punctuation item to submit.', {
        command,
        phase: state.phase,
      });
    }
    return state;
  }

  function requireFeedback(ui, command = 'continue-session') {
    const state = normaliseState(ui);
    if (state.phase !== 'feedback' || !state.session) {
      throw serviceError('punctuation_transition_invalid', 'This Punctuation command is not valid in the current phase.', {
        command,
        phase: state.phase,
      });
    }
    return state;
  }

  const service = {
    initState(rawState) {
      return normaliseState(rawState);
    },
    getPrefs(learnerId) {
      return cloneSerialisable(readData(repository, learnerId).prefs);
    },
    savePrefs(learnerId, patch = {}) {
      const current = readData(repository, learnerId);
      const next = {
        ...current,
        prefs: normalisePunctuationPrefs({
          ...current.prefs,
          ...(isPlainObject(patch) ? patch : {}),
        }),
      };
      return cloneSerialisable(writeData(repository, learnerId, next).prefs);
    },
    getStats(learnerId) {
      return statsFromData(readData(repository, learnerId), indexes, clock);
    },
    getAnalyticsSnapshot(learnerId) {
      return analyticsFromData(readData(repository, learnerId), indexes, clock);
    },
    startSession(learnerId, options = {}) {
      const current = readData(repository, learnerId);
      const prefs = normalisePunctuationPrefs({ ...current.prefs, ...options });
      const session = {
        id: uid('punctuation-session', clock, random),
        releaseId: manifest.releaseId || PUNCTUATION_RELEASE_ID,
        mode: prefs.mode,
        length: roundLengthFromPrefs(prefs),
        phase: 'active-item',
        startedAt: clock(),
        updatedAt: clock(),
        answeredCount: 0,
        correctCount: 0,
        currentItemId: '',
        currentItem: null,
        recentItemIds: [],
        securedUnits: [],
        misconceptionTags: [],
      };
      const state = nextActiveState({ learnerId, session, data: current, indexes, prefs, now: clock, random });
      syncPracticeSession(repository, learnerId, state, clock);
      return stateTransition(state);
    },
    submitAnswer(learnerId, uiState, rawAnswer = '') {
      const state = requireActiveItem(uiState, 'submit-answer');
      const data = readData(repository, learnerId);
      const item = itemForId(indexes, state.session.currentItemId);
      if (!item) {
        throw serviceError('punctuation_item_unsupported', 'The active Punctuation item is no longer available.', {
          itemId: state.session.currentItemId,
        });
      }
      const answer = isPlainObject(rawAnswer)
        ? rawAnswer
        : { typed: normaliseAnswerText(rawAnswer) };
      const result = markPunctuationAnswer({ item, answer });
      const nowValue = clock();
      const rewardUnit = rewardUnitForItem(indexes, item);
      const previousUnitSnap = rewardUnit
        ? memorySnapshot(data.progress.rewardUnits[rewardUnit.masteryKey] ? { attempts: 3, correct: 3, streak: 3, firstCorrectAt: 0, lastCorrectAt: 8 * 24 * 60 * 60 * 1000 } : data.progress.items[item.id], nowValue)
        : null;

      data.progress.items[item.id] = updateMemoryState(data.progress.items[item.id], result.correct, nowValue);
      for (const skillId of item.skillIds || []) {
        data.progress.facets[facetKey(skillId, item.mode)] = updateMemoryState(
          data.progress.facets[facetKey(skillId, item.mode)],
          result.correct,
          nowValue,
        );
      }
      const nextItemSnap = memorySnapshot(data.progress.items[item.id], nowValue);
      const securedUnits = [];
      if (rewardUnit && nextItemSnap.secure && !data.progress.rewardUnits[rewardUnit.masteryKey]) {
        data.progress.rewardUnits[rewardUnit.masteryKey] = {
          masteryKey: rewardUnit.masteryKey,
          releaseId: rewardUnit.releaseId,
          clusterId: rewardUnit.clusterId,
          rewardUnitId: rewardUnit.rewardUnitId,
          securedAt: nowValue,
        };
        securedUnits.push(rewardUnit.masteryKey);
      }

      data.progress.attempts.push({
        ts: nowValue,
        sessionId: state.session.id,
        itemId: item.id,
        mode: item.mode,
        skillIds: item.skillIds || [],
        rewardUnitId: item.rewardUnitId || '',
        correct: result.correct,
        misconceptionTags: result.misconceptionTags || [],
      });
      data.progress.attempts = data.progress.attempts.slice(-1000);
      writeData(repository, learnerId, data);

      const nextSession = {
        ...state.session,
        phase: 'feedback',
        answeredCount: state.session.answeredCount + 1,
        correctCount: state.session.correctCount + (result.correct ? 1 : 0),
        updatedAt: nowValue,
        securedUnits: [...new Set([...(state.session.securedUnits || []), ...securedUnits])],
        misconceptionTags: [...new Set([...(state.session.misconceptionTags || []), ...(result.misconceptionTags || [])])],
      };
      const feedback = {
        kind: result.correct ? 'success' : 'error',
        headline: result.correct ? 'Correct.' : 'Not quite.',
        body: result.note || item.explanation || '',
        attemptedAnswer: normaliseAnswerText(answer.typed ?? answer.answer ?? answer.choiceIndex ?? ''),
        displayCorrection: result.expected || item.model || '',
        explanation: item.explanation || '',
        misconceptionTags: result.misconceptionTags || [],
        facets: result.facets || [],
      };
      const nextState = {
        ...state,
        phase: 'feedback',
        session: nextSession,
        feedback,
        summary: null,
        error: '',
      };
      syncPracticeSession(repository, learnerId, nextState, clock);

      const attemptEvent = createPunctuationItemAttemptedEvent({
        learnerId,
        session: state.session,
        item,
        result,
        answer: feedback.attemptedAnswer,
        createdAt: nowValue,
      });
      const misconceptionEvents = createPunctuationMisconceptionObservedEvents({
        learnerId,
        session: state.session,
        item,
        result,
        createdAt: nowValue,
      });
      const unitEvents = securedUnits.map((masteryKey) => createPunctuationUnitSecuredEvent({
        learnerId,
        session: state.session,
        item,
        rewardUnit,
        masteryKey,
        createdAt: nowValue,
      }));

      return stateTransition(nextState, {
        events: [attemptEvent, ...misconceptionEvents, ...unitEvents],
        changed: !previousUnitSnap || true,
      });
    },
    continueSession(learnerId, uiState) {
      const state = requireFeedback(uiState, 'continue-session');
      const data = readData(repository, learnerId);
      if (state.session.answeredCount >= state.session.length) {
        data.progress.sessionsCompleted += 1;
        writeData(repository, learnerId, data);
        const summary = sessionSummary(state.session, data, indexes, clock);
        const nextState = {
          ...state,
          phase: 'summary',
          feedback: state.feedback,
          summary,
          error: '',
        };
        syncPracticeSession(repository, learnerId, nextState, clock);
        return stateTransition(nextState, {
          events: [createPunctuationSessionCompletedEvent({ learnerId, session: state.session, summary, createdAt: clock() })],
        });
      }
      const nextState = nextActiveState({
        learnerId,
        session: { ...state.session, phase: 'active-item' },
        data,
        indexes,
        prefs: prefsForSession(state.session, data.prefs),
        now: clock,
        random,
      });
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState);
    },
    skipItem(learnerId, uiState) {
      const state = requireActiveItem(uiState, 'skip-item');
      const data = readData(repository, learnerId);
      const nextSession = {
        ...state.session,
        answeredCount: state.session.answeredCount + 1,
      };
      if (nextSession.answeredCount >= nextSession.length) {
        data.progress.sessionsCompleted += 1;
        writeData(repository, learnerId, data);
        const summary = sessionSummary(nextSession, data, indexes, clock);
        const nextState = {
          ...state,
          phase: 'summary',
          session: nextSession,
          feedback: null,
          summary,
          error: '',
        };
        syncPracticeSession(repository, learnerId, nextState, clock);
        return stateTransition(nextState, {
          events: [createPunctuationSessionCompletedEvent({ learnerId, session: nextSession, summary, createdAt: clock() })],
        });
      }
      const nextState = nextActiveState({
        learnerId,
        session: nextSession,
        data,
        indexes,
        prefs: prefsForSession(nextSession, data.prefs),
        now: clock,
        random,
      });
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState);
    },
    endSession(learnerId, uiState) {
      const state = normaliseState(uiState);
      if (!state.session) return stateTransition(createInitialPunctuationState());
      const data = readData(repository, learnerId);
      data.progress.sessionsCompleted += state.session.answeredCount > 0 ? 1 : 0;
      writeData(repository, learnerId, data);
      const summary = sessionSummary(state.session, data, indexes, clock);
      const nextState = {
        ...state,
        phase: 'summary',
        feedback: state.feedback,
        summary,
        error: '',
      };
      syncPracticeSession(repository, learnerId, nextState, clock);
      return stateTransition(nextState, {
        events: [createPunctuationSessionCompletedEvent({ learnerId, session: state.session, summary, createdAt: clock() })],
      });
    },
    abandonSession(learnerId, uiState) {
      const state = normaliseState(uiState);
      if (state.session) {
        repository.abandonPracticeSession?.(learnerId, state, abandonedPracticeSessionRecord(learnerId, state.session, clock));
      }
      return stateTransition(createInitialPunctuationState());
    },
    resetLearner(learnerId) {
      repository.resetLearner?.(learnerId);
      return stateTransition(createInitialPunctuationState());
    },
  };

  service.markServerOwnedState = markServerOwnedState;
  return service;
}
