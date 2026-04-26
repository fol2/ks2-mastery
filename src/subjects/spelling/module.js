import { monsterSummaryFromSpellingAnalytics } from '../../platform/game/monster-system.js';
import { createInitialSpellingState } from './service-contract.js';
import {
  WORD_BANK_FILTER_IDS,
  WORD_BANK_YEAR_FILTER_IDS,
  findWordBankEntry,
} from './components/spelling-view-model.js';
import { shouldHandleRemoteSpellingAction } from './remote-actions.js';

function usesServerSyncedSpellingRuntime(context) {
  const sessionMode = context?.session?.mode || context?.snapshot?.session?.mode || '';
  if (sessionMode === 'remote-sync' || sessionMode === 'demo-sync') return true;

  const persistence = context?.appState?.persistence || context?.snapshot?.appState?.persistence || null;
  if (persistence?.mode === 'remote-sync') return true;
  return persistence?.mode === 'degraded' && persistence?.remoteAvailable === true;
}

function delegateServerSyncedSpellingAction(action, context) {
  if (!shouldHandleRemoteSpellingAction(action) || !usesServerSyncedSpellingRuntime(context)) return null;

  if (typeof context?.handleRemoteSpellingAction === 'function') {
    return Boolean(context.handleRemoteSpellingAction(action, context.data || {}));
  }

  context?.store?.updateSubjectUi?.('spelling', {
    error: 'Spelling practice needs the Worker command boundary.',
  });
  return true;
}

function applySpellingTransition(context, transition) {
  if (!transition) return true;
  const nextTransition = context.data?.deferAudioUntilFlowTransitionEnd && transition.audio?.word
    ? { ...transition, deferAudioUntilFlowTransitionEnd: true }
    : transition;
  if (typeof context.applySubjectTransition === 'function') {
    return context.applySubjectTransition('spelling', nextTransition);
  }
  context.store.updateSubjectUi('spelling', nextTransition.state);
  if (nextTransition.audio?.word) context.tts?.speak?.(nextTransition.audio);
  return true;
}

function spellingReplayPayload({ service, learnerId, ui, slow = false } = {}) {
  const audio = service?.getAudioCue?.(learnerId) || ui?.audio || null;
  if (audio?.promptToken) return { ...audio, slow };
  const card = ui?.session?.currentCard;
  if (!card?.word) return null;
  return { word: card.word, sentence: card.prompt?.sentence, slow };
}

function resetWordBankTransientUi(current) {
  return {
    ...current.transientUi,
    spellingWordDetailSlug: '',
    spellingWordDetailMode: 'explain',
    spellingWordBankDrillTyped: '',
    spellingWordBankDrillResult: null,
  };
}

function wordBankDrillResult(word, typed) {
  const accepted = Array.isArray(word.accepted) && word.accepted.length
    ? word.accepted
    : [word.word, word.slug];
  const normalisedTyped = String(typed || '').trim().toLowerCase();
  return accepted.map((entry) => String(entry).toLowerCase()).includes(normalisedTyped)
    ? 'correct'
    : 'incorrect';
}

function wordBankEntryFor(service, learnerId, slug) {
  if (!slug) return null;
  if (typeof service.getWordBankEntry === 'function') {
    return service.getWordBankEntry(learnerId, slug);
  }
  return findWordBankEntry(service.getAnalyticsSnapshot(learnerId), slug);
}

function combineStats(...entries) {
  const totals = entries.reduce((next, raw) => {
    const stats = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    next.total += Number(stats.total) || 0;
    next.secure += Number(stats.secure) || 0;
    next.due += Number(stats.due) || 0;
    next.fresh += Number(stats.fresh) || 0;
    next.trouble += Number(stats.trouble) || 0;
    next.attempts += Number(stats.attempts) || 0;
    next.correct += Number(stats.correct) || 0;
    return next;
  }, {
    total: 0,
    secure: 0,
    due: 0,
    fresh: 0,
    trouble: 0,
    attempts: 0,
    correct: 0,
  });
  return {
    ...totals,
    accuracy: totals.attempts ? Math.round((totals.correct / totals.attempts) * 100) : null,
  };
}

export function getOverallSpellingStats(service, learnerId) {
  return combineStats(
    service?.getStats?.(learnerId, 'core'),
    service?.getStats?.(learnerId, 'extra'),
  );
}

export const spellingModule = {
  id: 'spelling',
  name: 'Spelling',
  blurb: 'Learn tricky words by sound, sight and meaning.',
  accent: '#3E6FA8',
  accentSoft: '#DCE6F3',
  accentTint: '#EEF3FA',
  icon: 'pen',
  available: true,
  reactPractice: true,
  initState() {
    return createInitialSpellingState();
  },
  getDashboardStats(appState, { service }) {
    const learner = appState.learners.byId[appState.learners.selectedId];
    const stats = getOverallSpellingStats(service, learner.id);
    const codex = monsterSummaryFromSpellingAnalytics(service.getAnalyticsSnapshot(learner.id));
    return {
      pct: stats.total ? Math.round((stats.secure / stats.total) * 100) : 0,
      due: stats.due,
      streak: codex.reduce((max, entry) => Math.max(max, entry.progress.level), 0),
      nextUp: stats.trouble ? 'Trouble drill' : stats.due ? 'Due review' : 'Fresh spellings',
    };
  },
  handleAction(action, context) {
    const delegated = delegateServerSyncedSpellingAction(action, context);
    if (delegated !== null) return delegated;

    const { appState, data, store, service, tts } = context;
    const learnerId = appState.learners.selectedId;
    const ui = service.initState(appState.subjectUi.spelling, learnerId);

    if (action === 'spelling-set-mode') {
      service.savePrefs(learnerId, { mode: data.value });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-set-pref') {
      service.savePrefs(learnerId, { [data.pref]: data.value });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-toggle-pref') {
      const current = service.getPrefs(learnerId);
      service.savePrefs(learnerId, { [data.pref]: !current[data.pref] });
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-analytics-search') {
      const spellingAnalyticsWordSearch = String(data.value || '').slice(0, 80);
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsWordSearch,
        },
      }));
      return true;
    }

    if (action === 'spelling-analytics-year-filter') {
      const raw = String(data.value || 'all');
      const next = WORD_BANK_YEAR_FILTER_IDS.has(raw) ? raw : 'all';
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsYearFilter: next,
        },
      }));
      return true;
    }

    if (action === 'spelling-analytics-status-filter') {
      const raw = String(data.value || 'all');
      const next = WORD_BANK_FILTER_IDS.has(raw) ? raw : 'all';
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingAnalyticsStatusFilter: next,
        },
      }));
      return true;
    }

    if (action === 'spelling-start' || action === 'spelling-start-again') {
      const prefs = service.getPrefs(learnerId);
      tts.stop();
      return applySpellingTransition(context, service.startSession(learnerId, {
        mode: prefs.mode,
        yearFilter: prefs.yearFilter,
        length: prefs.roundLength,
        extraWordFamilies: prefs.extraWordFamilies,
      }));
    }

    if (action === 'spelling-shortcut-start') {
      const mode = data.mode;
      if (!mode) return true;
      // Guardian Mission is gated on allWordsMega. The Alt+4 keybinding fires
      // this action unconditionally (so the shortcut resolver stays dumb and
      // symmetric with Alt+1/2/3) — the runtime check lives here so the
      // shortcut is a no-op instead of accidentally starting a stale Smart
      // Review round. `service.getPostMasteryState` is defined on the canonical
      // spelling service; the client-read-model facade returns a conservative
      // `allWordsMega: false` shape so the gate fails safe under remote-sync.
      // TODO(U10/future): consider migrating Alt+4 gate to postMastery.guardianMissionAvailable — plan R1 kept the guardianDueCount fallback intentionally
      if (mode === 'guardian') {
        const postMastery = typeof service.getPostMasteryState === 'function'
          ? service.getPostMasteryState(learnerId)
          : null;
        if (!postMastery?.allWordsMega) return true;
      }
      if (ui.phase === 'session') {
        const confirmed = globalThis.confirm?.('End the current spelling session and switch?');
        if (confirmed === false) return true;
      }
      service.savePrefs(learnerId, { mode });
      const prefs = service.getPrefs(learnerId);
      tts.stop();
      return applySpellingTransition(context, service.startSession(learnerId, {
        mode: prefs.mode,
        yearFilter: prefs.yearFilter,
        length: prefs.roundLength,
        extraWordFamilies: prefs.extraWordFamilies,
      }));
    }

    if (action === 'spelling-submit-form') {
      const typed = data.formData.get('typed');
      return applySpellingTransition(context, service.submitAnswer(learnerId, ui, typed));
    }

    if (action === 'spelling-continue') {
      return applySpellingTransition(context, service.continueSession(learnerId, ui));
    }

    if (action === 'spelling-skip') {
      return applySpellingTransition(context, service.skipWord(learnerId, ui));
    }

    if (action === 'spelling-replay') {
      const payload = spellingReplayPayload({ service, learnerId, ui });
      if (payload) tts.speak(payload);
      return true;
    }

    if (action === 'spelling-replay-slow') {
      const payload = spellingReplayPayload({ service, learnerId, ui, slow: true });
      if (payload) tts.speak(payload);
      return true;
    }

    if (action === 'spelling-end-early') {
      const confirmed = globalThis.confirm?.('End this session now?');
      if (confirmed === false) return true;
      tts.stop();
      return applySpellingTransition(context, service.endSession(learnerId, ui));
    }

    if (action === 'spelling-back') {
      tts.stop();
      return applySpellingTransition(context, service.endSession(learnerId, ui));
    }

    if (action === 'spelling-drill-all') {
      if (!ui.summary?.mistakes?.length) return true;
      tts.stop();
      // U3: when the origin summary is a Guardian round, force practiceOnly so
      // the dispatched `mode: 'trouble'` session short-circuits at
      // `legacy-engine.js:763` and leaves `progress.stage/dueDay/lastDay/
      // lastResult` + the guardian record untouched. Source of truth is
      // `ui.summary?.mode` (not a payload flag): summary-phase persistence
      // across refresh is out of scope today; refactors that change this
      // must re-validate the practiceOnly path.
      const originMode = ui.summary?.mode;
      return applySpellingTransition(context, service.startSession(learnerId, {
        mode: 'trouble',
        words: ui.summary.mistakes.map((word) => word.slug),
        yearFilter: 'all',
        length: ui.summary.mistakes.length,
        practiceOnly: originMode === 'guardian',
      }));
    }

    if (action === 'spelling-drill-single') {
      const slug = data.slug;
      if (!slug) return true;
      tts.stop();
      // U3: mirror of drill-all — Guardian origin must never demote Mega. We
      // keep the per-word drill using `mode: 'single'` here for legacy
      // behaviour, then gate `practiceOnly` by `summary.mode === 'guardian'`.
      // Note that the Guardian scene hides per-word drill chips (U3), so this
      // branch only fires defensively if a future surface re-exposes them.
      const originMode = ui.summary?.mode;
      return applySpellingTransition(context, service.startSession(learnerId, {
        mode: 'single',
        words: [slug],
        yearFilter: 'all',
        length: 1,
        practiceOnly: originMode === 'guardian',
      }));
    }

    if (action === 'spelling-open-word-bank') {
      tts.stop();
      store.patch((current) => ({ transientUi: resetWordBankTransientUi(current) }));
      store.updateSubjectUi('spelling', { phase: 'word-bank', error: '' });
      return true;
    }

    if (action === 'spelling-close-word-bank') {
      tts.stop();
      store.patch((current) => ({ transientUi: resetWordBankTransientUi(current) }));
      store.updateSubjectUi('spelling', { phase: 'dashboard', error: '' });
      return true;
    }

    if (action === 'spelling-word-detail-open') {
      const slug = data.slug;
      if (!slug) return true;
      const rawMode = data.value === 'drill' ? 'drill' : 'explain';
      const word = wordBankEntryFor(service, learnerId, slug);
      if (word && rawMode === 'drill') {
        tts.speak({ word: word.word, sentence: word.sentence });
      }
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailSlug: slug,
          spellingWordDetailMode: rawMode,
          spellingWordBankDrillTyped: '',
          spellingWordBankDrillResult: null,
        },
      }));
      return true;
    }

    if (action === 'spelling-word-detail-close') {
      tts.stop();
      store.patch((current) => ({ transientUi: resetWordBankTransientUi(current) }));
      return true;
    }

    if (action === 'spelling-word-detail-mode') {
      const rawMode = data.value === 'drill' ? 'drill' : 'explain';
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      const currentMode = appState?.transientUi?.spellingWordDetailMode === 'drill' ? 'drill' : 'explain';
      const modeChanged = rawMode !== currentMode;
      if (rawMode === 'drill' && slug) {
        const word = wordBankEntryFor(service, learnerId, slug);
        if (word) tts.speak({ word: word.word, sentence: word.sentence });
      }
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordDetailMode: rawMode,
          ...(modeChanged
            ? { spellingWordBankDrillTyped: '', spellingWordBankDrillResult: null }
            : {}),
        },
      }));
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
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = wordBankEntryFor(service, learnerId, slug);
      if (!word) return true;
      const typed = String(data.formData?.get?.('typed') || '').trim();
      store.patch((current) => ({
        transientUi: {
          ...current.transientUi,
          spellingWordBankDrillTyped: typed,
          spellingWordBankDrillResult: wordBankDrillResult(word, typed),
        },
      }));
      return true;
    }

    if (action === 'spelling-word-bank-drill-try-again') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (slug) {
        const word = wordBankEntryFor(service, learnerId, slug);
        if (word) tts.speak({ word: word.word, sentence: word.sentence });
      }
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
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = wordBankEntryFor(service, learnerId, slug);
      if (!word) return true;
      tts.speak({
        word: word.word,
        wordOnly: true,
      });
      return true;
    }

    if (action === 'spelling-word-bank-drill-replay' || action === 'spelling-word-bank-drill-replay-slow') {
      const slug = data.slug || appState?.transientUi?.spellingWordDetailSlug || '';
      if (!slug) return true;
      const word = wordBankEntryFor(service, learnerId, slug);
      if (!word) return true;
      tts.speak({
        word: word.word,
        sentence: word.sentence,
        slow: action === 'spelling-word-bank-drill-replay-slow',
      });
      return true;
    }

    return false;
  },
};
