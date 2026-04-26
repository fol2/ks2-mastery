import {
  WORD_BANK_FILTER_IDS,
  WORD_BANK_YEAR_FILTER_IDS,
} from './components/spelling-view-model.js';
import {
  applyOptimisticSpellingPrefs,
  optimisticSpellingPrefsPatchForAction,
} from './optimistic-prefs.js';
import {
  normaliseMonsterCelebrationEvents,
  shouldDelayMonsterCelebrations,
  spellingSessionEnded,
} from '../../platform/game/monster-celebrations.js';
import {
  unacknowledgedMonsterCelebrationEvents,
} from '../../platform/game/monster-celebration-acks.js';
import { isPostMasteryMode } from './service-contract.js';

const READ_ONLY_MESSAGE = 'Practice is read-only while sync is degraded. Retry sync before continuing.';
const SETUP_PREF_SAVE_DEBOUNCE_MS = 120;
const SPELLING_COMPENSATION_EVENT_LIMIT = 25;

const SPELLING_COMMAND_ACTIONS = new Set([
  'spelling-set-mode',
  'spelling-set-pref',
  'spelling-toggle-pref',
  'spelling-start',
  'spelling-start-again',
  'spelling-shortcut-start',
  'spelling-submit-form',
  'spelling-continue',
  'spelling-skip',
  'spelling-end-early',
  'spelling-drill-all',
  'spelling-drill-single',
]);

const SPELLING_SETUP_PREF_ACTIONS = new Set([
  'spelling-set-mode',
  'spelling-set-pref',
  'spelling-toggle-pref',
]);

const SPELLING_IN_FLIGHT_DEDUPE_COMMANDS = new Set([
  'save-prefs',
  'start-session',
  'submit-answer',
  'continue-session',
  'skip-word',
  'end-session',
]);

const SPELLING_UI_LOCAL_ACTIONS = new Set([
  'spelling-back',
  'spelling-replay',
  'spelling-replay-slow',
]);

const SPELLING_WORD_BANK_ACTIONS = new Set([
  'spelling-open-word-bank',
  'spelling-close-word-bank',
  'spelling-analytics-search',
  'spelling-analytics-year-filter',
  'spelling-analytics-status-filter',
  'spelling-word-detail-open',
  'spelling-word-detail-close',
  'spelling-word-detail-mode',
  'spelling-word-bank-drill-input',
  'spelling-word-bank-drill-submit',
  'spelling-word-bank-drill-try-again',
  'spelling-word-bank-word-replay',
  'spelling-word-bank-drill-replay',
  'spelling-word-bank-drill-replay-slow',
  'spelling-word-bank-load-more',
]);

function commandErrorMessage(error, fallback) {
  return error?.payload?.message || error?.message || fallback;
}

function spellingPendingCommand(appState = {}) {
  return appState.transientUi?.spellingPendingCommand || '';
}

function pendingCommandBlocksAction(action, appState = {}) {
  const pendingCommand = spellingPendingCommand(appState);
  if (!pendingCommand || !SPELLING_COMMAND_ACTIONS.has(action)) return false;
  if (pendingCommand === 'save-prefs' && SPELLING_SETUP_PREF_ACTIONS.has(action)) return false;
  return true;
}

export function shouldHandleRemoteSpellingAction(action) {
  return SPELLING_COMMAND_ACTIONS.has(action)
    || SPELLING_UI_LOCAL_ACTIONS.has(action)
    || SPELLING_WORD_BANK_ACTIONS.has(action);
}

export function shouldStopSpellingTtsForCommandResponse(command, response) {
  if (response?.audio?.promptToken) return false;
  const nextPhase = response?.subjectReadModel?.phase || response?.state?.phase || '';
  return command === 'submit-answer' || (nextPhase && nextPhase !== 'session');
}

export function spellingCommandDedupeKey(command, appState = {}) {
  if (!SPELLING_IN_FLIGHT_DEDUPE_COMMANDS.has(command)) return '';
  const learnerId = appState.learners?.selectedId || '';
  if (!learnerId) return '';
  if (command === 'start-session') return `${command}:${learnerId}:setup`;
  if (command === 'save-prefs') return `${command}:${learnerId}:prefs`;
  const session = appState.subjectUi?.spelling?.session || {};
  const sessionId = session.id || '';
  if (!sessionId) return '';
  const currentSlug = session.currentSlug || 'unknown';
  const phase = session.phase || 'unknown';
  const promptCount = Number.isFinite(Number(session.promptCount)) ? Number(session.promptCount) : 0;
  return `${command}:${learnerId}:${sessionId}:${currentSlug}:${phase}:${promptCount}`;
}

export function findLoadedWordBankEntry(analytics, slug) {
  if (!slug) return null;
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  for (const group of groups) {
    const words = Array.isArray(group.words) ? group.words : [];
    const found = words.find((word) => word.slug === slug);
    if (found) return found;
  }
  return null;
}

export function mergeWordBankAnalytics(current, incoming, { append = false } = {}) {
  if (!append || !current?.wordGroups?.length) return incoming;
  const currentGroups = new Map(current.wordGroups.map((group) => [group.key, group]));
  const nextGroups = (Array.isArray(incoming?.wordGroups) ? incoming.wordGroups : []).map((group) => {
    const existing = currentGroups.get(group.key);
    const seen = new Set((existing?.words || []).map((word) => word.slug));
    const additions = (Array.isArray(group.words) ? group.words : []).filter((word) => {
      if (!word?.slug || seen.has(word.slug)) return false;
      seen.add(word.slug);
      return true;
    });
    return {
      ...group,
      words: [...(existing?.words || []), ...additions],
    };
  });
  return {
    ...incoming,
    wordGroups: nextGroups,
    wordBank: {
      ...(incoming.wordBank || {}),
      returnedRows: nextGroups.reduce((count, group) => count + (Array.isArray(group.words) ? group.words.length : 0), 0),
    },
  };
}

function eventIds(events) {
  return new Set((Array.isArray(events) ? events : [])
    .map((event) => (typeof event?.id === 'string' ? event.id : ''))
    .filter(Boolean));
}

function visibleMonsterCelebrationIds(state = {}) {
  return eventIds([
    ...(state.monsterCelebrations?.pending || []),
    ...(state.monsterCelebrations?.queue || []),
  ]);
}

function spellingRewardEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => !event?.subjectId || event.subjectId === 'spelling');
}

export function createRemoteSpellingActionHandler({
  store,
  services,
  subjectCommands,
  readModels,
  tts,
  isReadOnly = () => false,
  preferenceSaveDebounceMs = SETUP_PREF_SAVE_DEBOUNCE_MS,
  setRuntimeError = (message) => {
    store?.updateSubjectUi?.('spelling', { error: message || 'Practice is temporarily unavailable.' });
  },
  pendingCommandKeys = new Set(),
} = {}) {
  const pendingPreferenceSaves = new Map();
  const preferenceSaveChains = new Map();
  const preferenceIntentCounters = new Map();
  const latestPreferenceIntents = new Map();
  const scopedRuntimeErrors = new Map();

  function appState() {
    return store?.getState?.() || {};
  }

  function wordBankAnalyticsFromState(state = appState()) {
    return state.subjectUi?.spelling?.analytics || null;
  }

  function currentSpellingRewardEventIds(learnerId) {
    const list = store.repositories?.eventLog?.list;
    if (typeof list !== 'function') return null;
    try {
      return eventIds(spellingRewardEvents(list.call(store.repositories.eventLog, learnerId) || []));
    } catch {
      return null;
    }
  }

  function selectedLearnerId() {
    return appState().learners?.selectedId || '';
  }

  function safePrefsPatch(prefsPatch = {}) {
    return prefsPatch && typeof prefsPatch === 'object' && !Array.isArray(prefsPatch) ? prefsPatch : {};
  }

  function patchSpellingSubjectUiLocally(updater) {
    store.patch((current) => {
      const previous = current.subjectUi?.spelling || {};
      const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater };
      return {
        subjectUi: {
          ...current.subjectUi,
          spelling: next,
        },
      };
    });
  }

  function applyOptimisticPrefsPatch(patch) {
    if (!patch || !Object.keys(patch).length) return false;
    patchSpellingSubjectUiLocally((current) => applyOptimisticSpellingPrefs(current, patch));
    return true;
  }

  function pendingOptimisticPrefsForLearner(learnerId) {
    return latestPreferenceIntents.get(String(learnerId || ''))?.prefs || {};
  }

  function visiblePrefsForLearner(learnerId, state = appState()) {
    const persistedPrefs = services?.spelling?.getPrefs?.(learnerId) || {};
    const visiblePrefs = state.learners?.selectedId === learnerId
      && state.subjectUi?.spelling?.prefs
      && typeof state.subjectUi.spelling.prefs === 'object'
      && !Array.isArray(state.subjectUi.spelling.prefs)
      ? state.subjectUi.spelling.prefs
      : {};
    return {
      ...persistedPrefs,
      ...visiblePrefs,
      ...pendingOptimisticPrefsForLearner(learnerId),
    };
  }

  function reapplyPendingOptimisticPrefs() {
    const learnerId = selectedLearnerId();
    const appliedPrefs = applyOptimisticPrefsPatch(pendingOptimisticPrefsForLearner(learnerId));
    const scopedError = scopedRuntimeErrors.get(learnerId);
    if (scopedError) {
      patchSpellingSubjectUiLocally({ error: scopedError });
    }
    return appliedPrefs || Boolean(scopedError);
  }

  function setRuntimeErrorForLearner(learnerId, message) {
    const targetLearnerId = String(learnerId || '');
    const safeMessage = message || 'Practice is temporarily unavailable.';
    if (!targetLearnerId) {
      setRuntimeError(safeMessage);
      return;
    }
    scopedRuntimeErrors.set(targetLearnerId, safeMessage);
    if (selectedLearnerId() === targetLearnerId) {
      setRuntimeError(safeMessage);
    }
  }

  function clearRuntimeErrorForLearner(learnerId) {
    const targetLearnerId = String(learnerId || '');
    if (targetLearnerId) scopedRuntimeErrors.delete(targetLearnerId);
  }

  function applyCommandResponse(response, {
    command = '',
    learnerId: requestedLearnerId = '',
    preferenceVersion = 0,
    compensationBaselineEventIds = null,
  } = {}) {
    const previousState = appState();
    const previousSubjectUi = previousState.subjectUi?.spelling || null;
    const learnerId = String(response?.learnerId || requestedLearnerId || previousState.learners?.selectedId || '');
    const wasSelectedLearner = !learnerId || previousState.learners?.selectedId === learnerId;
    const rewardProjection = response?.projections?.rewards || {};
    const toastEvents = Array.isArray(rewardProjection.toastEvents) ? rewardProjection.toastEvents : [];
    const responseMonsterEvents = normaliseMonsterCelebrationEvents(rewardProjection.events || []);

    if (wasSelectedLearner && shouldStopSpellingTtsForCommandResponse(command, response)) {
      tts.stop();
    }
    store.reloadFromRepositories({ preserveRoute: true, preserveMonsterCelebrations: true });
    clearRuntimeErrorForLearner(learnerId);
    reconcilePreferenceSaveResponse({ command, learnerId, preferenceVersion });
    reapplyPendingOptimisticPrefs();
    const nextState = appState();
    const nextSubjectUi = response?.subjectReadModel || response?.state || nextState.subjectUi?.spelling || null;
    const isSelectedLearner = !learnerId || nextState.learners?.selectedId === learnerId;

    if (isSelectedLearner && toastEvents.length) {
      store.pushToasts(toastEvents);
    }

    const endedSession = spellingSessionEnded(previousSubjectUi, nextSubjectUi);
    let monsterEvents = responseMonsterEvents;
    if (isSelectedLearner && endedSession && !monsterEvents.length) {
      const loggedRewardEvents = spellingRewardEvents(store.repositories?.eventLog?.list?.(learnerId) || []);
      const ignoredIds = new Set([
        ...eventIds(rewardProjection.events || []),
        ...visibleMonsterCelebrationIds(nextState),
      ]);
      monsterEvents = unacknowledgedMonsterCelebrationEvents(
        loggedRewardEvents,
        {
          learnerId,
          ignoredIds,
          excludeEventIds: compensationBaselineEventIds,
          limit: SPELLING_COMPENSATION_EVENT_LIMIT,
          baselineExisting: true,
          baselineEventIds: compensationBaselineEventIds,
        },
      );
    }

    if (isSelectedLearner && monsterEvents.length) {
      if (shouldDelayMonsterCelebrations('spelling', previousSubjectUi, nextSubjectUi)) {
        store.deferMonsterCelebrations(monsterEvents);
      } else {
        store.pushMonsterCelebrations(monsterEvents);
      }
    }

    if (isSelectedLearner && endedSession) {
      store.releaseMonsterCelebrations();
    }

    if (isSelectedLearner && response?.audio?.promptToken) {
      tts.speak(response.audio);
    }
  }

  async function loadWordBank({ detailSlug = '', page = 1, append = false } = {}) {
    const state = appState();
    const learnerId = state.learners?.selectedId;
    if (!learnerId) return null;
    const params = new URLSearchParams({
      learnerId,
      page: String(page),
      pageSize: '250',
    });
    if (detailSlug) params.set('detailSlug', detailSlug);
    const payload = await readModels.readJson(`/api/subjects/spelling/word-bank?${params.toString()}`);
    const wordBank = payload.wordBank || null;
    if (!wordBank?.analytics) return null;
    const current = wordBankAnalyticsFromState();
    const analytics = mergeWordBankAnalytics(current, wordBank.analytics, { append });
    store.updateSubjectUi('spelling', {
      analytics,
      error: '',
    });
    if (wordBank.detail) {
      store.patch((currentState) => ({
        transientUi: {
          ...currentState.transientUi,
          spellingWordDetail: wordBank.detail,
        },
      }));
    }
    return wordBank;
  }

  function loadedWordBankDetail(state = appState()) {
    const detail = state.transientUi?.spellingWordDetail;
    const slug = state.transientUi?.spellingWordDetailSlug || '';
    if (detail?.slug && (!slug || detail.slug === slug)) return detail;
    return findLoadedWordBankEntry(wordBankAnalyticsFromState(state), slug);
  }

  function speakWordBankCue(kind, { slow = false } = {}) {
    const detail = loadedWordBankDetail();
    const cue = kind === 'word'
      ? detail?.audio?.word
      : detail?.audio?.dictation;
    if (cue?.promptToken) {
      tts.speak({ ...cue, slow });
    }
  }

  function setPendingCommand(command, { preserveExisting = false } = {}) {
    if (!SPELLING_IN_FLIGHT_DEDUPE_COMMANDS.has(command)) return false;
    if (preserveExisting && spellingPendingCommand(appState())) return false;
    store.patch((current) => ({
      transientUi: {
        ...current.transientUi,
        spellingPendingCommand: command,
      },
    }));
    return true;
  }

  function clearPendingCommand(command) {
    if (!SPELLING_IN_FLIGHT_DEDUPE_COMMANDS.has(command)) return;
    store.patch((current) => {
      if (current.transientUi?.spellingPendingCommand !== command) return {};
      return {
        transientUi: {
          ...current.transientUi,
          spellingPendingCommand: '',
        },
      };
    });
  }

  function beginPendingCommand(command) {
    const state = appState();
    const dedupeKey = spellingCommandDedupeKey(command, state);
    if (dedupeKey && pendingCommandKeys.has(dedupeKey)) return { ok: false, dedupeKey: '' };
    if (SPELLING_IN_FLIGHT_DEDUPE_COMMANDS.has(command) && spellingPendingCommand(state)) {
      return { ok: false, dedupeKey: '' };
    }
    if (dedupeKey) pendingCommandKeys.add(dedupeKey);
    setPendingCommand(command);
    return { ok: true, dedupeKey };
  }

  function releasePendingCommand(command, dedupeKey) {
    if (dedupeKey) pendingCommandKeys.delete(dedupeKey);
    clearPendingCommand(command);
  }

  async function sendCommand(command, payload = {}, { learnerId: requestedLearnerId = '', preferenceVersion = 0 } = {}) {
    const state = appState();
    const learnerId = requestedLearnerId || state.learners?.selectedId;
    if (!learnerId) return null;
    const compensationBaselineEventIds = currentSpellingRewardEventIds(learnerId);
    const response = await subjectCommands.send({
      subjectId: 'spelling',
      learnerId,
      command,
      payload,
    });
    applyCommandResponse(response, {
      command,
      learnerId,
      preferenceVersion,
      compensationBaselineEventIds,
    });
    return response;
  }

  function preferenceSaveDelayMs() {
    return Math.max(0, Number(preferenceSaveDebounceMs) || 0);
  }

  function updateOptimisticPrefs(prefsPatch = {}) {
    return applyOptimisticPrefsPatch(safePrefsPatch(prefsPatch));
  }

  function recordPreferenceIntent(learnerId, prefsPatch = {}) {
    const patch = safePrefsPatch(prefsPatch);
    if (!learnerId || !Object.keys(patch).length) return null;
    clearRuntimeErrorForLearner(learnerId);
    const version = (preferenceIntentCounters.get(learnerId) || 0) + 1;
    const previous = latestPreferenceIntents.get(learnerId);
    const intent = {
      version,
      prefs: {
        ...(previous?.prefs || {}),
        ...patch,
      },
    };
    preferenceIntentCounters.set(learnerId, version);
    latestPreferenceIntents.set(learnerId, intent);
    return intent;
  }

  function reconcilePreferenceSaveResponse({ command = '', learnerId = '', preferenceVersion = 0 } = {}) {
    if (command !== 'save-prefs' || !learnerId) return;
    const latest = latestPreferenceIntents.get(learnerId);
    if (!latest) return;
    if (Number(latest.version) <= Number(preferenceVersion)) {
      latestPreferenceIntents.delete(learnerId);
    }
  }

  function takePendingPreferenceSave(learnerId) {
    const entry = pendingPreferenceSaves.get(learnerId);
    if (!entry) return null;
    if (entry.timer) clearTimeout(entry.timer);
    pendingPreferenceSaves.delete(learnerId);
    return entry.prefs && typeof entry.prefs === 'object' && !Array.isArray(entry.prefs) ? entry : null;
  }

  function trackPreferenceSave(learnerId, prefs, preferenceVersion = 0) {
    const previous = preferenceSaveChains.get(learnerId) || Promise.resolve();
    let tracked;
    const next = previous
      .catch(() => {})
      .then(() => {
        setPendingCommand('save-prefs', { preserveExisting: true });
        return sendCommand('save-prefs', { prefs }, { learnerId, preferenceVersion });
      })
      .catch((error) => {
        handlePreferenceSaveError(error, { learnerId, preferenceVersion });
        throw error;
      });
    tracked = next.finally(() => {
      if (preferenceSaveChains.get(learnerId) === tracked) {
        preferenceSaveChains.delete(learnerId);
        if (spellingPendingCommand(appState()) === 'save-prefs') {
          clearPendingCommand('save-prefs');
        }
      }
    });
    preferenceSaveChains.set(learnerId, tracked);
    return tracked;
  }

  function flushPendingPreferenceSave(learnerId) {
    if (!learnerId) return Promise.resolve(null);
    const pending = takePendingPreferenceSave(learnerId);
    if (pending?.prefs && Object.keys(pending.prefs).length) {
      return trackPreferenceSave(learnerId, pending.prefs, pending.version);
    }
    return preferenceSaveChains.get(learnerId) || Promise.resolve(null);
  }

  function handlePreferenceSaveError(error, { learnerId = '', preferenceVersion = 0 } = {}) {
    globalThis.console?.warn?.('Spelling preference save failed.', error);
    const latest = latestPreferenceIntents.get(learnerId);
    if (latest && Number(latest.version) <= Number(preferenceVersion)) {
      latestPreferenceIntents.delete(learnerId);
    }
    store.reloadFromRepositories({ preserveRoute: true });
    reapplyPendingOptimisticPrefs();
    setRuntimeErrorForLearner(learnerId, commandErrorMessage(error, 'The spelling options could not be saved.'));
  }

  function schedulePreferenceSave(learnerId, prefsPatch = {}) {
    if (!learnerId) return false;
    const patch = safePrefsPatch(prefsPatch);
    if (!Object.keys(patch).length) return true;
    const intent = recordPreferenceIntent(learnerId, patch);
    const current = pendingPreferenceSaves.get(learnerId);
    if (current?.timer) clearTimeout(current.timer);
    const timer = setTimeout(() => {
      flushPendingPreferenceSave(learnerId).catch(() => {});
    }, preferenceSaveDelayMs());
    pendingPreferenceSaves.set(learnerId, { prefs: intent.prefs, version: intent.version, timer });
    return true;
  }

  function runCommand(command, payload = {}, options = {}) {
    const {
      learnerId: requestedLearnerId = '',
      errorLearnerId = '',
      beforeSend = null,
      onSuccess = null,
      onError = null,
      onSettled = null,
    } = options;
    const commandLearnerId = requestedLearnerId || appState().learners?.selectedId || '';
    const pending = beginPendingCommand(command);
    if (!pending.ok) return false;
    const commandPromise = typeof beforeSend === 'function'
      ? Promise.resolve()
        .then(beforeSend)
        .then((nextPayload) => sendCommand(command, nextPayload || payload, { learnerId: commandLearnerId }))
      : sendCommand(command, payload, { learnerId: commandLearnerId });
    commandPromise.then((response) => {
      onSuccess?.(response);
    }).catch((error) => {
      onError?.(error);
      globalThis.console?.warn?.('Spelling command failed.', error);
      setRuntimeErrorForLearner(
        errorLearnerId || commandLearnerId,
        commandErrorMessage(error, 'The spelling command could not be completed.'),
      );
    }).finally(() => {
      releasePendingCommand(command, pending.dedupeKey);
      onSettled?.();
    });
    return true;
  }

  function handle(action, data = {}) {
    if (!shouldHandleRemoteSpellingAction(action)) return false;

    const state = appState();
    const learnerId = state.learners?.selectedId;
    const ui = state.subjectUi?.spelling || {};
    const spelling = services?.spelling;

    if (action === 'spelling-replay' || action === 'spelling-replay-slow') {
      const audio = spelling?.getAudioCue?.(learnerId) || ui.audio || null;
      if (audio?.promptToken) {
        tts.speak({ ...audio, slow: action === 'spelling-replay-slow' });
      }
      return true;
    }

    if (action === 'spelling-back') {
      tts.stop();
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-open-word-bank') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordDetail: null,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
          spellingWordBankStatus: isReadOnly() ? 'cached' : 'loading',
        },
      }));
      store.updateSubjectUi('spelling', { phase: 'word-bank', error: '' });
      if (!isReadOnly()) {
        loadWordBank().then(() => {
          store.patch((current) => ({
            transientUi: {
              ...current.transientUi,
              spellingWordBankStatus: 'loaded',
            },
          }));
        }).catch((error) => {
          globalThis.console?.warn?.('Word bank load failed.', error);
          setRuntimeError(commandErrorMessage(error, 'The word bank could not be loaded.'));
          store.patch((current) => ({
            transientUi: {
              ...current.transientUi,
              spellingWordBankStatus: 'error',
            },
          }));
        });
      }
      return true;
    }

    if (action === 'spelling-close-word-bank') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordDetail: null,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-analytics-search') {
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsWordSearch: String(data.value || '').slice(0, 80),
        },
      }));
      return true;
    }

    if (action === 'spelling-analytics-year-filter') {
      const raw = String(data.value || 'all');
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsYearFilter: WORD_BANK_YEAR_FILTER_IDS.has(raw) ? raw : 'all',
        },
      }));
      return true;
    }

    if (action === 'spelling-analytics-status-filter') {
      const raw = String(data.value || 'all');
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsStatusFilter: WORD_BANK_FILTER_IDS.has(raw) ? raw : 'all',
        },
      }));
      return true;
    }

    if (action === 'spelling-word-detail-open') {
      const slug = String(data.slug || '').trim();
      if (!slug) return true;
      const mode = data.value === 'drill' ? 'drill' : 'explain';
      const existing = findLoadedWordBankEntry(wordBankAnalyticsFromState(state), slug);
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: slug,
          spellingWordDetailMode: mode,
          spellingWordDetail: existing || null,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      if (!isReadOnly()) {
        loadWordBank({ detailSlug: slug }).then(() => {
          if (mode === 'drill') speakWordBankCue('dictation');
        }).catch((error) => {
          globalThis.console?.warn?.('Word detail load failed.', error);
          setRuntimeError(commandErrorMessage(error, 'The spelling word could not be loaded.'));
        });
      }
      return true;
    }

    if (action === 'spelling-word-detail-close') {
      tts.stop();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: '',
          spellingWordDetailMode: 'explain',
          spellingWordDetail: null,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-detail-mode') {
      const mode = data.value === 'drill' ? 'drill' : 'explain';
      const previousMode = state.transientUi?.spellingWordDetailMode === 'drill' ? 'drill' : 'explain';
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailMode: mode,
          ...(mode !== previousMode ? {
            spellingWordBankDrillTyped: '',
            spellingWordBankDrillResult: null,
          } : {}),
        },
      }));
      if (mode === 'drill') speakWordBankCue('dictation');
      return true;
    }

    if (action === 'spelling-word-bank-drill-input') {
      const typed = String(data.value || '').slice(0, 80);
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: typed,
          spellingWordBankDrillResult: current.transientUi?.spellingWordBankDrillResult === 'correct'
            ? 'correct'
            : null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-drill-submit') {
      if (isReadOnly()) {
        setRuntimeError(READ_ONLY_MESSAGE);
        return true;
      }
      const slug = String(data.slug || state.transientUi?.spellingWordDetailSlug || '').trim();
      const typed = String(data.formData?.get?.('typed') || state.transientUi?.spellingWordBankDrillTyped || '').trim();
      if (!slug) return true;
      subjectCommands.send({
        subjectId: 'spelling',
        learnerId,
        command: 'check-word-bank-drill',
        payload: { slug, typed },
      }).then((response) => {
        store.patch((current) => ({
          transientUi: {
            ...current.transientUi,
            spellingWordBankDrillTyped: typed,
            spellingWordBankDrillResult: response.wordBankDrill?.result || 'incorrect',
          },
        }));
      }).catch((error) => {
        globalThis.console?.warn?.('Word-bank drill check failed.', error);
        setRuntimeError(commandErrorMessage(error, 'The drill answer could not be checked.'));
      });
      return true;
    }

    if (action === 'spelling-word-bank-drill-try-again') {
      speakWordBankCue('dictation');
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-word-replay') {
      speakWordBankCue('word');
      return true;
    }

    if (action === 'spelling-word-bank-drill-replay' || action === 'spelling-word-bank-drill-replay-slow') {
      speakWordBankCue('dictation', { slow: action === 'spelling-word-bank-drill-replay-slow' });
      return true;
    }

    if (action === 'spelling-word-bank-load-more') {
      const meta = wordBankAnalyticsFromState(state)?.wordBank || {};
      if (!meta.hasNextPage || isReadOnly()) return true;
      loadWordBank({
        page: (Number(meta.page) || 1) + 1,
        append: true,
      }).catch((error) => {
        globalThis.console?.warn?.('Word bank pagination failed.', error);
        setRuntimeError(commandErrorMessage(error, 'More words could not be loaded.'));
      });
      return true;
    }

    if (isReadOnly()) {
      setRuntimeError(READ_ONLY_MESSAGE);
      return true;
    }

    if (pendingCommandBlocksAction(action, state)) {
      return true;
    }

    if (action === 'spelling-set-pref' || action === 'spelling-set-mode' || action === 'spelling-toggle-pref') {
      const current = visiblePrefsForLearner(learnerId, state);
      const patch = optimisticSpellingPrefsPatchForAction(action, data, current);
      if (!Object.keys(patch).length) return true;
      updateOptimisticPrefs(patch);
      schedulePreferenceSave(learnerId, patch);
      return true;
    }

    if (action === 'spelling-start' || action === 'spelling-start-again') {
      tts.stop();
      runCommand('start-session', {}, {
        learnerId,
        beforeSend: async () => {
          await flushPendingPreferenceSave(learnerId);
          const prefs = visiblePrefsForLearner(learnerId, appState());
          return {
            mode: prefs.mode,
            yearFilter: prefs.yearFilter,
            length: prefs.roundLength,
            extraWordFamilies: prefs.extraWordFamilies,
          };
        },
      });
      return true;
    }

    if (action === 'spelling-shortcut-start') {
      const mode = data.mode;
      if (!mode) return true;
      // Mirror `module.js::spelling-shortcut-start` gate: Guardian Mission
      // (Alt+4) AND Boss Dictation (Alt+5) are both gated on
      // `postMastery.allWordsMega === true`. The gate lives here on the
      // remote-sync path too so a learner who has not graduated yet cannot
      // fire a Boss-start command to the server and receive a stale
      // Smart Review fallback. Without this check the remote-sync path would
      // bypass the local `allWordsMega` guard — adversarial review of U3
      // surfaced the same omission for Guardian, so U9 extends both gates in
      // lockstep to prevent the Boss surface from regressing the same way.
      // U6: uses the shared `isPostMasteryMode` predicate so future post-Mega
      // modes (Pattern Quest in U11, Word Detective later) extend this gate
      // in one place — service-contract.js — rather than hunting across
      // `module.js` and `remote-actions.js` and other dispatchers.
      if (isPostMasteryMode(mode)) {
        const postMastery = typeof spelling?.getPostMasteryState === 'function'
          ? spelling.getPostMasteryState(learnerId)
          : null;
        if (!postMastery?.allWordsMega) return true;
      }
      if (ui.phase === 'session') {
        const confirmed = globalThis.confirm?.('End the current spelling session and switch?');
        if (confirmed === false) return true;
      }
      const pending = beginPendingCommand('start-session');
      if (!pending.ok) return true;
      tts.stop();
      (async () => {
        await flushPendingPreferenceSave(learnerId);
        const current = visiblePrefsForLearner(learnerId, appState());
        const patch = optimisticSpellingPrefsPatchForAction('spelling-set-mode', { value: mode }, current);
        // U10 blocker fix — mirror `module.js::spelling-shortcut-start`:
        //   1. Apply the optimistic `{ mode }` locally so the dashboard
        //      reflects the user's intent immediately.
        //   2. Run `start-session` FIRST. A failed start must NOT leave
        //      `prefs.mode` persisted as the new mode.
        //   3. Only persist `save-prefs` AFTER the start succeeds.
        //   4. On failure, rollback the optimistic patch by clearing the
        //      recorded intent and reloading the persisted prefs via
        //      `reapplyPendingOptimisticPrefs`.
        //
        // U10 blocker fix — Boss-length parity: the Begin button dispatches
        // `{ mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH }` and Alt+5's
        // resolver now does the same. Honour `data.length` when supplied so
        // a Boss round is always 10 cards regardless of `prefs.roundLength`
        // (which could be '20' for a fresh learner, or SATs-set). When the
        // caller does not supply a length we fall back to `prefs.roundLength`
        // so Guardian (Alt+4) and legacy modes keep existing behaviour.
        const intent = recordPreferenceIntent(learnerId, patch);
        updateOptimisticPrefs(patch);
        const prefsBeforeStart = visiblePrefsForLearner(learnerId, appState());
        const shortcutLength = data.length != null ? data.length : prefsBeforeStart.roundLength;
        let startResponse = null;
        try {
          startResponse = await sendCommand('start-session', {
            mode: prefsBeforeStart.mode || mode,
            yearFilter: prefsBeforeStart.yearFilter,
            length: shortcutLength,
            extraWordFamilies: prefsBeforeStart.extraWordFamilies,
          }, { learnerId });
        } catch (error) {
          // Rollback: the optimistic prefs must not outlive a failed
          // start-session. Drop the tracked intent and reload from the
          // persisted prefs so the dashboard re-reflects ground truth.
          const version = intent?.version || 0;
          const latest = latestPreferenceIntents.get(learnerId);
          if (latest && Number(latest.version) <= Number(version)) {
            latestPreferenceIntents.delete(learnerId);
          }
          store.reloadFromRepositories({ preserveRoute: true });
          reapplyPendingOptimisticPrefs();
          throw error;
        }
        // Server may have rejected inline (ok === false or equivalent shape).
        // Treat anything that leaves `phase !== 'session'` on the read model
        // as a non-ok start and skip the prefs persistence step, mirroring
        // the module.js `transition?.ok !== false` guard.
        const nextPhase = startResponse?.subjectReadModel?.phase
          || startResponse?.state?.phase
          || appState().subjectUi?.spelling?.phase
          || '';
        if (startResponse?.ok === false || (nextPhase && nextPhase !== 'session')) {
          // Start did not land on a session — rollback optimistic prefs so
          // `prefs.mode` is not left pointing at the would-be mode.
          const version = intent?.version || 0;
          const latest = latestPreferenceIntents.get(learnerId);
          if (latest && Number(latest.version) <= Number(version)) {
            latestPreferenceIntents.delete(learnerId);
          }
          store.reloadFromRepositories({ preserveRoute: true });
          reapplyPendingOptimisticPrefs();
          return;
        }
        try {
          await sendCommand('save-prefs', { prefs: patch }, { learnerId, preferenceVersion: intent?.version || 0 });
        } catch (error) {
          handlePreferenceSaveError(error, { learnerId, preferenceVersion: intent?.version || 0 });
          throw error;
        }
      })().catch((error) => {
        globalThis.console?.warn?.('Spelling shortcut command failed.', error);
        setRuntimeErrorForLearner(learnerId, commandErrorMessage(error, 'The spelling shortcut could not be completed.'));
      }).finally(() => {
        releasePendingCommand('start-session', pending.dedupeKey);
      });
      return true;
    }

    if (action === 'spelling-submit-form') {
      runCommand('submit-answer', { typed: data.formData?.get?.('typed') || '' });
      return true;
    }

    if (action === 'spelling-continue') {
      runCommand('continue-session');
      return true;
    }

    if (action === 'spelling-skip') {
      runCommand('skip-word');
      return true;
    }

    if (action === 'spelling-end-early') {
      const confirmed = globalThis.confirm?.('End this session now?');
      if (confirmed === false) return true;
      tts.stop();
      runCommand('end-session');
      return true;
    }

    if (action === 'spelling-drill-all') {
      const mistakes = Array.isArray(ui.summary?.mistakes) ? ui.summary.mistakes : [];
      if (!mistakes.length) return true;
      tts.stop();
      // U3: mirror of `module.js` drill-all branch — Guardian-origin summary
      // must never demote Mega via the Worker engine either. Worker's
      // `legacy-engine.js:763` equivalent honours `practiceOnly` identically,
      // so forwarding the flag on the remote start-session command keeps the
      // Mega-never-revoked invariant under remote-sync. Source of truth is
      // `ui.summary?.mode`; summary-phase persistence across refresh is out
      // of scope today — refactors that change this must re-validate the
      // practiceOnly path on both runtimes.
      const originMode = ui.summary?.mode;
      runCommand('start-session', {
        mode: 'trouble',
        words: mistakes.map((word) => word.slug).filter(Boolean),
        yearFilter: 'all',
        length: mistakes.length,
        practiceOnly: originMode === 'guardian',
      });
      return true;
    }

    if (action === 'spelling-drill-single') {
      const slug = String(data.slug || '').trim();
      if (!slug) return true;
      tts.stop();
      // U3: mirror of `module.js` drill-single branch. The Guardian scene
      // hides per-word drill chips so this branch only fires defensively if
      // a future surface re-exposes them — but the defensive guard is the
      // whole point of a parity check between local and remote paths.
      const originMode = ui.summary?.mode;
      runCommand('start-session', {
        mode: 'single',
        words: [slug],
        yearFilter: 'all',
        length: 1,
        practiceOnly: originMode === 'guardian',
      });
      return true;
    }

    return false;
  }

  return {
    applyCommandResponse,
    handle,
    loadWordBank,
    reapplyPendingOptimisticPrefs,
    runCommand,
    sendCommand,
  };
}
