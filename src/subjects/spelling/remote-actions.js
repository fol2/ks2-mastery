import {
  WORD_BANK_FILTER_IDS,
  WORD_BANK_YEAR_FILTER_IDS,
} from './components/spelling-view-model.js';

const READ_ONLY_MESSAGE = 'Practice is read-only while sync is degraded. Retry sync before continuing.';

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

const SPELLING_IN_FLIGHT_DEDUPE_COMMANDS = new Set([
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

export function createRemoteSpellingActionHandler({
  store,
  services,
  subjectCommands,
  readModels,
  tts,
  isReadOnly = () => false,
  setRuntimeError = (message) => {
    store?.updateSubjectUi?.('spelling', { error: message || 'Practice is temporarily unavailable.' });
  },
  pendingCommandKeys = new Set(),
} = {}) {
  function appState() {
    return store?.getState?.() || {};
  }

  function wordBankAnalyticsFromState(state = appState()) {
    return state.subjectUi?.spelling?.analytics || null;
  }

  function applyCommandResponse(response, { command = '' } = {}) {
    if (response?.projections?.rewards?.toastEvents?.length) {
      store.pushToasts(response.projections.rewards.toastEvents);
    }
    if (response?.projections?.rewards?.events?.length) {
      store.pushMonsterCelebrations(response.projections.rewards.events);
    }
    if (shouldStopSpellingTtsForCommandResponse(command, response)) {
      tts.stop();
    }
    store.reloadFromRepositories({ preserveRoute: true });
    if (response?.audio?.promptToken) {
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

  async function sendCommand(command, payload = {}) {
    const state = appState();
    const learnerId = state.learners?.selectedId;
    if (!learnerId) return null;
    const response = await subjectCommands.send({
      subjectId: 'spelling',
      learnerId,
      command,
      payload,
    });
    applyCommandResponse(response, { command });
    return response;
  }

  function runCommand(command, payload = {}) {
    const dedupeKey = spellingCommandDedupeKey(command, appState());
    if (dedupeKey && pendingCommandKeys.has(dedupeKey)) return false;
    if (dedupeKey) pendingCommandKeys.add(dedupeKey);
    sendCommand(command, payload).catch((error) => {
      globalThis.console?.warn?.('Spelling command failed.', error);
      setRuntimeError(commandErrorMessage(error, 'The spelling command could not be completed.'));
    }).finally(() => {
      if (dedupeKey) pendingCommandKeys.delete(dedupeKey);
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

    if (action === 'spelling-set-pref') {
      runCommand('save-prefs', { prefs: { [data.pref]: data.value } });
      return true;
    }

    if (action === 'spelling-set-mode') {
      runCommand('save-prefs', { prefs: { mode: data.value } });
      return true;
    }

    if (action === 'spelling-toggle-pref') {
      const current = spelling?.getPrefs?.(learnerId) || {};
      runCommand('save-prefs', { prefs: { [data.pref]: !current[data.pref] } });
      return true;
    }

    if (action === 'spelling-start' || action === 'spelling-start-again') {
      const prefs = spelling?.getPrefs?.(learnerId) || {};
      tts.stop();
      runCommand('start-session', {
        mode: prefs.mode,
        yearFilter: prefs.yearFilter,
        length: prefs.roundLength,
        extraWordFamilies: prefs.extraWordFamilies,
      });
      return true;
    }

    if (action === 'spelling-shortcut-start') {
      const mode = data.mode;
      if (!mode) return true;
      if (ui.phase === 'session') {
        const confirmed = globalThis.confirm?.('End the current spelling session and switch?');
        if (confirmed === false) return true;
      }
      tts.stop();
      (async () => {
        await sendCommand('save-prefs', { prefs: { mode } });
        const prefs = spelling?.getPrefs?.(learnerId) || { mode };
        await sendCommand('start-session', {
          mode: prefs.mode || mode,
          yearFilter: prefs.yearFilter,
          length: prefs.roundLength,
          extraWordFamilies: prefs.extraWordFamilies,
        });
      })().catch((error) => {
        globalThis.console?.warn?.('Spelling shortcut command failed.', error);
        setRuntimeError(commandErrorMessage(error, 'The spelling shortcut could not be completed.'));
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
      runCommand('start-session', {
        mode: 'trouble',
        words: mistakes.map((word) => word.slug).filter(Boolean),
        yearFilter: 'all',
        length: mistakes.length,
      });
      return true;
    }

    if (action === 'spelling-drill-single') {
      const slug = String(data.slug || '').trim();
      if (!slug) return true;
      tts.stop();
      runCommand('start-session', {
        mode: 'single',
        words: [slug],
        yearFilter: 'all',
        length: 1,
      });
      return true;
    }

    return false;
  }

  return {
    applyCommandResponse,
    handle,
    loadWordBank,
    runCommand,
    sendCommand,
  };
}
