import { monsterSummaryFromSpellingAnalytics } from '../../platform/game/monster-system.js';
import { dropSessionEphemeralFields } from '../../platform/core/subject-contract.js';
import { createInitialSpellingState, isPostMasteryMode } from './service-contract.js';
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
  // SH2-U2 (R2): drop post-session-ephemeral fields on rehydrate so
  // browser Back / Refresh on a completed-session summary screen cannot
  // resurrect the summary's "Start another round" CTA. Baseline drop
  // set (`summary`, `transientUi`) lives on `SESSION_EPHEMERAL_FIELDS`
  // in `platform/core/subject-contract.js`. Active-session state
  // (`session`, `feedback`, `awaitingAdvance`) is intentionally
  // preserved so a mid-round reload picks up where the learner left
  // off — `tests/store.test.js::serialisable spelling state survives
  // store persistence for resume` and
  // `tests/spelling-parity.test.js::restored completed spelling card
  // caps progress and resumes auto-advance` lock both the session-
  // resume and awaitingAdvance-resume invariants. Preferences (mode,
  // yearFilter, roundLength, extraWordFamilies), `version`, and any
  // other persisted subject-level static data survive untouched. Runs
  // only on the rehydrate path (`rehydrate: true`); live
  // `updateSubjectUi` dispatches bypass this hook so sessions mid-
  // flight are unaffected.
  sanitiseUiOnRehydrate(entry) {
    return dropSessionEphemeralFields(entry);
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
      // Guardian Mission (Alt+4) AND Boss Dictation (Alt+5) are both gated on
      // allWordsMega. The Alt+N keybindings fire this action unconditionally
      // (so the shortcut resolver stays dumb and symmetric with Alt+1/2/3) —
      // the runtime check lives here so the shortcut is a no-op instead of
      // accidentally starting a stale Smart Review round. `service.getPostMasteryState`
      // is defined on the canonical spelling service; the client-read-model
      // facade returns a conservative `allWordsMega: false` shape so the gate
      // fails safe under remote-sync.
      // Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U9, U10).
      // Remote-sync parity for this gate lives in remote-actions.js — both
      // branches must move together when the rule changes.
      // U6: the `'guardian' || 'boss'` literal is now the single-source
      // `isPostMasteryMode` predicate in service-contract.js so U11's
      // Pattern Quest (and future post-Mega modes) extend this gate in
      // one place, not two.
      if (isPostMasteryMode(mode)) {
        const postMastery = typeof service.getPostMasteryState === 'function'
          ? service.getPostMasteryState(learnerId)
          : null;
        if (!postMastery?.allWordsMega) return true;
      }
      if (ui.phase === 'session') {
        const confirmed = globalThis.confirm?.('End the current spelling session and switch?');
        if (confirmed === false) return true;
      }
      // Read current prefs WITHOUT mutating them — we only persist
      // `{ mode }` once the session actually transitions. A rapid Alt+5
      // double-press where the second press is declined must not leave
      // `prefs.mode` pointing at the new mode if the first attempt was
      // declined or the startSession path bails out. savePrefs runs AFTER
      // a successful transition so the stored preference always matches
      // the session the learner actually landed in. Same pattern must live
      // in remote-actions.js (optimistic-prefs branch).
      const currentPrefs = service.getPrefs(learnerId);
      // U10: Boss Dictation ships with a fixed default round length
      // (BOSS_DEFAULT_ROUND_LENGTH = 10). The Boss begin-button dispatches
      // `{ mode: 'boss', length: 10 }` so the Boss round is always 10 cards
      // regardless of the learner's persisted `roundLength` preference (which
      // could be 20 or 40 from a SATs Test session). When the caller supplies
      // `data.length` we honour it; otherwise we fall back to the persisted
      // pref. The service clamps Boss length into [8, 12] so a stray 20 is
      // rounded down to 12 rather than failing, but the Boss card on the
      // dashboard should not rely on that clamp to land on the spec-mandated
      // 10 — the dispatch carries the intent explicitly. Guardian's Alt+4
      // path does not supply a `length` so it continues to use
      // `currentPrefs.roundLength`, preserving legacy behaviour there.
      const shortcutLength = data.length != null ? data.length : currentPrefs.roundLength;
      tts.stop();
      const transition = service.startSession(learnerId, {
        mode,
        yearFilter: currentPrefs.yearFilter,
        length: shortcutLength,
        extraWordFamilies: currentPrefs.extraWordFamilies,
      });
      if (transition?.ok !== false) {
        service.savePrefs(learnerId, { mode });
      }
      return applySpellingTransition(context, transition);
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
