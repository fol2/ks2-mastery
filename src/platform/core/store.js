import { uid } from './utils.js';
import { buildSubjectRegistry } from './subject-contract.js';
import { validatePlatformRepositories } from './repositories/contract.js';
import { cloneSerialisable, normaliseLearnersSnapshot } from './repositories/helpers.js';
import {
  defaultPersistenceSnapshot,
  normalisePersistenceSnapshot,
} from './repositories/persistence.js';
import {
  emptyMonsterCelebrations,
  normaliseMonsterCelebrationEvents,
  normaliseMonsterCelebrations,
} from '../game/monster-celebrations.js';

const DEFAULT_ROUTE = {
  screen: 'dashboard',
  subjectId: null,
  tab: 'practice',
};

const VALID_ROUTE_SCREENS = new Set(['dashboard', 'subject', 'codex', 'profile-settings', 'parent-hub', 'admin-hub']);
const VALID_ROUTE_TABS = new Set(['practice', 'analytics', 'profiles', 'settings', 'method']);

const DEFAULT_SUBJECT_UI = {
  phase: 'dashboard',
  session: null,
  feedback: null,
  summary: null,
  error: '',
};

function makeLearner(name = 'Learner 1') {
  return {
    id: uid('learner'),
    name,
    yearGroup: 'Y5',
    avatarColor: '#3E6FA8',
    goal: 'sats',
    dailyMinutes: 15,
    weakSubjects: [],
    createdAt: Date.now(),
  };
}

function buildSubjectUiState(subject, persistedEntry = null, { rehydrate = false } = {}) {
  const initialState = subject.initState();
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw new TypeError(`Subject "${subject.id}" initState() must return an object.`);
  }

  const persisted = persistedEntry && typeof persistedEntry === 'object' && !Array.isArray(persistedEntry)
    ? persistedEntry
    : null;

  // On rehydrate (boot over a persisted `subjectStates` snapshot), subjects
  // may opt-in to sanitise the persisted entry before it merges over
  // defaults — typically to strip session-ephemeral fields (e.g. Punctuation
  // U5's `phase: 'map'` + `mapUi`) that must never echo back across a
  // reload. Live `updateSubjectUi` dispatches (which rebuild entries from
  // the current in-memory snapshot) pass `rehydrate: false`, so the Map
  // phase remains legitimate while the session is active.
  const sanitisedPersisted = (rehydrate && persisted && typeof subject.sanitiseUiOnRehydrate === 'function')
    ? subject.sanitiseUiOnRehydrate(persisted)
    : persisted;

  return {
    ...DEFAULT_SUBJECT_UI,
    ...initialState,
    ...(sanitisedPersisted || {}),
  };
}

function buildSubjectUiTree(subjects, persistedUi = {}, { rehydrate = false } = {}) {
  return Object.fromEntries(subjects.map((subject) => [
    subject.id,
    buildSubjectUiState(subject, persistedUi[subject.id] || null, { rehydrate }),
  ]));
}

function emptyState(subjects, learner) {
  return {
    route: { ...DEFAULT_ROUTE },
    learners: {
      byId: { [learner.id]: learner },
      allIds: [learner.id],
      selectedId: learner.id,
    },
    subjectUi: buildSubjectUiTree(subjects),
    persistence: defaultPersistenceSnapshot(),
    transientUi: normaliseTransientUi(),
    toasts: [],
    monsterCelebrations: emptyMonsterCelebrations(),
  };
}

function ensureLearnersSnapshot(repositories, subjects) {
  const snapshot = normaliseLearnersSnapshot(repositories.learners.read());
  if (snapshot.allIds.length) return snapshot;

  const persistenceMode = repositories.persistence.read()?.mode || 'local-only';
  if (persistenceMode !== 'local-only') return snapshot;

  const learner = makeLearner();
  const initial = emptyState(subjects, learner);
  repositories.learners.write(initial.learners);
  return initial.learners;
}

function normaliseRoute(rawRoute, subjects) {
  const raw = rawRoute && typeof rawRoute === 'object' && !Array.isArray(rawRoute) ? rawRoute : {};
  const screen = VALID_ROUTE_SCREENS.has(raw.screen) ? raw.screen : DEFAULT_ROUTE.screen;
  const tab = VALID_ROUTE_TABS.has(raw.tab) ? raw.tab : DEFAULT_ROUTE.tab;
  const subjectId = typeof raw.subjectId === 'string' && subjects.some((subject) => subject.id === raw.subjectId)
    ? raw.subjectId
    : null;

  if (screen === 'subject' && subjectId) {
    return { screen, subjectId, tab };
  }

  if (screen === 'codex' || screen === 'profile-settings' || screen === 'parent-hub' || screen === 'admin-hub') {
    return { screen, subjectId: null, tab: DEFAULT_ROUTE.tab };
  }

  return { ...DEFAULT_ROUTE };
}

function normaliseToasts(rawValue) {
  return (Array.isArray(rawValue) ? rawValue : [])
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .slice(-25);
}

const VALID_SPELLING_WORD_BANK_FILTERS = new Set([
  'all',
  'due',
  'weak',
  'learning',
  'secure',
  'unseen',
  // ----- U6 Guardian filters ---------------------------------------------
  // Mirrors the subject-level WORD_BANK_FILTER_IDS expansion in
  // `src/subjects/spelling/components/spelling-view-model.js`. This Set is
  // the platform-layer transientUi sanitiser — it runs on boot against
  // persisted state, so without the expansion a learner who closed the
  // tab on a Guardian filter would have their persisted filter silently
  // reset to 'all' on next load. Keep these two Sets in lockstep.
  'guardianDue',
  'wobbling',
  'renewedRecently',
  'neverRenewed',
]);
const VALID_SPELLING_WORD_BANK_YEAR_FILTERS = new Set([
  'all',
  'y3-4',
  'y5-6',
  'extra',
]);

const VALID_WORD_DETAIL_MODES = new Set(['explain', 'drill']);
const VALID_WORD_DRILL_RESULTS = new Set(['correct', 'incorrect']);

function normaliseTransientUi(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  /* Word-bank status filter — chips use v1 labels (unseen/weak) while the
     renderer maps them to production word status values. */
  const rawFilter = typeof raw.spellingAnalyticsStatusFilter === 'string'
    ? raw.spellingAnalyticsStatusFilter
    : 'all';
  const rawYearFilter = typeof raw.spellingAnalyticsYearFilter === 'string'
    ? raw.spellingAnalyticsYearFilter
    : 'all';
  /* Word detail modal state — `slug` is the single source of truth for whether
     the modal is open; `mode` toggles between explain/drill inside the modal;
     `drillTyped` + `drillResult` are scoped to a single drill attempt so
     switching away and back resets the input. */
  const rawDetailMode = typeof raw.spellingWordDetailMode === 'string'
    ? raw.spellingWordDetailMode
    : 'explain';
  const rawDrillResult = typeof raw.spellingWordBankDrillResult === 'string'
    ? raw.spellingWordBankDrillResult
    : '';
  const wordDetail = raw.spellingWordDetail
    && typeof raw.spellingWordDetail === 'object'
    && !Array.isArray(raw.spellingWordDetail)
    && typeof raw.spellingWordDetail.slug === 'string'
    ? cloneSerialisable(raw.spellingWordDetail)
    : null;
  return {
    spellingPendingCommand: typeof raw.spellingPendingCommand === 'string'
      ? raw.spellingPendingCommand.slice(0, 80)
      : '',
    spellingAnalyticsWordSearch: typeof raw.spellingAnalyticsWordSearch === 'string'
      ? raw.spellingAnalyticsWordSearch.slice(0, 80)
      : '',
    spellingAnalyticsStatusFilter: VALID_SPELLING_WORD_BANK_FILTERS.has(rawFilter) ? rawFilter : 'all',
    spellingAnalyticsYearFilter: VALID_SPELLING_WORD_BANK_YEAR_FILTERS.has(rawYearFilter) ? rawYearFilter : 'all',
    spellingWordDetailSlug: typeof raw.spellingWordDetailSlug === 'string'
      ? raw.spellingWordDetailSlug.slice(0, 120)
      : '',
    spellingWordDetailMode: VALID_WORD_DETAIL_MODES.has(rawDetailMode) ? rawDetailMode : 'explain',
    spellingWordBankDrillTyped: typeof raw.spellingWordBankDrillTyped === 'string'
      ? raw.spellingWordBankDrillTyped.slice(0, 80)
      : '',
    spellingWordBankDrillResult: VALID_WORD_DRILL_RESULTS.has(rawDrillResult) ? rawDrillResult : null,
    spellingWordDetail: wordDetail,
  };
}

function closeSpellingWordDetailTransientUi(transientUi) {
  return {
    ...transientUi,
    spellingWordDetailSlug: '',
    spellingWordDetailMode: 'explain',
    spellingWordDetail: null,
    spellingWordBankDrillTyped: '',
    spellingWordBankDrillResult: null,
  };
}

function isCleanSpellingSetupEntry(spellingUi, transientUi) {
  return spellingUi.phase === 'dashboard'
    && !spellingUi.session
    && !spellingUi.feedback
    && !spellingUi.summary
    && !spellingUi.error
    && !spellingUi.awaitingAdvance
    && !transientUi?.spellingPendingCommand
    && !transientUi?.spellingWordDetailSlug
    && !transientUi?.spellingWordDetail
    && !transientUi?.spellingWordBankDrillTyped
    && !transientUi?.spellingWordBankDrillResult;
}

function normaliseSubjectEntryForOpen(current, route, writeSubjectUi) {
  if (route.screen !== 'subject' || route.subjectId !== 'spelling' || route.tab !== 'practice') {
    return current;
  }

  const previous = current.subjectUi?.spelling || DEFAULT_SUBJECT_UI;
  if (previous.phase === 'session' && previous.session) return current;
  if (isCleanSpellingSetupEntry(previous, current.transientUi)) return current;

  const nextSpellingUi = {
    ...previous,
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    error: '',
    awaitingAdvance: false,
  };

  if (current.learners.selectedId) writeSubjectUi(current.learners.selectedId, 'spelling', nextSpellingUi);

  return {
    ...current,
    subjectUi: {
      ...current.subjectUi,
      spelling: nextSpellingUi,
    },
    transientUi: closeSpellingWordDetailTransientUi(current.transientUi),
  };
}

function stateFromRepositories(subjects, repositories) {
  const learners = ensureLearnersSnapshot(repositories, subjects);
  const selectedId = learners.selectedId;
  const records = selectedId ? repositories.subjectStates.readForLearner(selectedId) : {};
  const persistedUi = Object.fromEntries(Object.entries(records).map(([subjectId, record]) => [subjectId, record.ui]));

  return {
    route: { ...DEFAULT_ROUTE },
    learners,
    subjectUi: buildSubjectUiTree(subjects, persistedUi),
    persistence: repositories.persistence.read(),
    transientUi: normaliseTransientUi(),
    toasts: [],
    monsterCelebrations: emptyMonsterCelebrations(),
  };
}

function sanitiseState(rawState, subjects, { rehydrate = false } = {}) {
  const learners = normaliseLearnersSnapshot(rawState?.learners);
  return {
    route: normaliseRoute(rawState?.route, subjects),
    learners,
    subjectUi: buildSubjectUiTree(subjects, rawState?.subjectUi || {}, { rehydrate }),
    persistence: normalisePersistenceSnapshot(rawState?.persistence),
    transientUi: normaliseTransientUi(rawState?.transientUi),
    toasts: normaliseToasts(rawState?.toasts),
    monsterCelebrations: normaliseMonsterCelebrations(rawState?.monsterCelebrations),
  };
}

function subjectUiForLearner(registry, repositories, learnerId) {
  const records = learnerId ? repositories.subjectStates.readForLearner(learnerId) : {};
  const persistedUi = Object.fromEntries(Object.entries(records).map(([subjectId, record]) => [subjectId, record.ui]));
  // Switching between learners re-reads each subject's UI from the persisted
  // snapshot, so this is a rehydrate path too — ephemeral fields (e.g.
  // Punctuation's `phase: 'map'`) must be sanitised on entry.
  return buildSubjectUiTree(registry, persistedUi, { rehydrate: true });
}

export function createStore(subjects, { repositories, cacheSubjectUiWrites = false } = {}) {
  const registry = buildSubjectRegistry(subjects);
  const resolvedRepositories = validatePlatformRepositories(repositories);
  // Initial bootstrap reads every subject UI from the persisted snapshot —
  // this is the canonical rehydrate path, so ephemeral fields (e.g.
  // Punctuation U5's `phase: 'map'` + `mapUi`) get sanitised before the
  // store serves its first `getState()`.
  let state = sanitiseState(
    stateFromRepositories(registry, resolvedRepositories),
    registry,
    { rehydrate: true },
  );
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      try { listener(state); } catch {
        // rendering listeners must not break store updates
      }
    }
  }

  function setState(updater) {
    const nextState = typeof updater === 'function' ? updater(state) : updater;
    // Live updates: rehydrate flag stays false, so session-ephemeral
    // sanitisers fire only on bootstrap / learner switch, never on each
    // dispatch.
    state = sanitiseState(nextState, registry);
    notify();
  }

  resolvedRepositories.persistence.subscribe((snapshot) => {
    state = sanitiseState({ ...state, persistence: snapshot }, registry);
    notify();
  });

  function persistLearners(nextLearners) {
    return resolvedRepositories.learners.write(nextLearners);
  }

  function reloadFromRepositories({ preserveRoute = false, preserveMonsterCelebrations = false } = {}) {
    const previousRoute = state.route;
    const previousMonsterCelebrations = state.monsterCelebrations;
    const nextState = stateFromRepositories(registry, resolvedRepositories);
    // adv-219-006: `reloadFromRepositories` re-reads every subject UI entry
    // from the persisted `subjectStates` snapshot, which makes this a
    // rehydrate path just like bootstrap (createStore) and learner-switch
    // (subjectUiForLearner). Without `rehydrate: true` the persisted entry
    // would shallow-merge straight over defaults, echoing
    // `phase: 'map'` + `mapUi` back into in-memory state — defeating the
    // bootstrap sanitiser on persistence-retry, learner-deletion,
    // server-synced settings, clear-all-progress, import-snapshot, and the
    // Punctuation command response adapter. Thread the flag through.
    state = sanitiseState({
      ...nextState,
      route: preserveRoute ? previousRoute : nextState.route,
      monsterCelebrations: preserveMonsterCelebrations
        ? previousMonsterCelebrations
        : nextState.monsterCelebrations,
    }, registry, { rehydrate: true });
    notify();
    return state;
  }

  function resetSubjectUi() {
    const learnerId = state.learners.selectedId;
    const nextTree = buildSubjectUiTree(registry);
    if (learnerId) {
      for (const subject of registry) {
        writeSubjectUi(learnerId, subject.id, nextTree[subject.id]);
      }
    }
    setState((current) => ({
      ...current,
      subjectUi: nextTree,
      monsterCelebrations: emptyMonsterCelebrations(),
    }));
  }

  function writeSubjectUi(learnerId, subjectId, ui) {
    const writer = cacheSubjectUiWrites && resolvedRepositories.subjectStates.cacheUi
      ? resolvedRepositories.subjectStates.cacheUi
      : resolvedRepositories.subjectStates.writeUi;
    return writer.call(resolvedRepositories.subjectStates, learnerId, subjectId, ui);
  }

  function nextSubjectUiEntry(subjectId, currentEntry, updater) {
    const subject = registry.find((entry) => entry.id === subjectId);
    if (!subject) return null;
    const previous = buildSubjectUiState(subject, currentEntry || null);
    return typeof updater === 'function'
      ? updater(previous)
      : { ...previous, ...updater };
  }

  function updateSubjectUi(subjectId, updater) {
    const learnerId = state.learners.selectedId;
    setState((current) => {
      const nextEntry = nextSubjectUiEntry(subjectId, current.subjectUi[subjectId], updater);
      if (!nextEntry) return current;

      if (learnerId) {
        writeSubjectUi(learnerId, subjectId, nextEntry);
      }

      return {
        ...current,
        subjectUi: {
          ...current.subjectUi,
          [subjectId]: nextEntry,
        },
      };
    });
  }

  function updateSubjectUiForLearner(learnerId, subjectId, updater) {
    if (!learnerId || !state.learners.byId[learnerId]) return false;
    if (state.learners.selectedId === learnerId) {
      updateSubjectUi(subjectId, updater);
      return true;
    }

    const record = resolvedRepositories.subjectStates.read(learnerId, subjectId);
    const nextEntry = nextSubjectUiEntry(subjectId, record?.ui, updater);
    if (!nextEntry) return false;
    writeSubjectUi(learnerId, subjectId, nextEntry);
    return true;
  }

  return {
    repositories: resolvedRepositories,
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState,
    reloadFromRepositories,
    patch(updater) {
      setState((current) => ({ ...current, ...updater(current) }));
    },
    goHome() {
      setState((current) => ({ ...current, route: { ...DEFAULT_ROUTE } }));
    },
    openSubject(subjectId, tab = 'practice') {
      setState((current) => {
        const route = normaliseRoute({ screen: 'subject', subjectId, tab }, registry);
        return {
          ...normaliseSubjectEntryForOpen(current, route, writeSubjectUi),
          route,
        };
      });
    },
    openCodex() {
      setState((current) => ({
        ...current,
        route: normaliseRoute({ screen: 'codex' }, registry),
      }));
    },
    openParentHub() {
      setState((current) => ({
        ...current,
        route: normaliseRoute({ screen: 'parent-hub' }, registry),
      }));
    },
    openProfileSettings() {
      setState((current) => ({
        ...current,
        route: normaliseRoute({ screen: 'profile-settings' }, registry),
      }));
    },
    openAdminHub() {
      setState((current) => ({
        ...current,
        route: normaliseRoute({ screen: 'admin-hub' }, registry),
      }));
    },
    setTab(tab) {
      setState((current) => ({
        ...current,
        route: normaliseRoute({ ...current.route, screen: 'subject', tab }, registry),
      }));
    },
    selectLearner(learnerId) {
      if (!state.learners.byId[learnerId]) return;
      const nextLearners = resolvedRepositories.learners.select(learnerId);
      setState((current) => ({
        ...current,
        learners: nextLearners,
        subjectUi: subjectUiForLearner(registry, resolvedRepositories, learnerId),
        monsterCelebrations: emptyMonsterCelebrations(),
      }));
    },
    createLearner(payload = {}) {
      const learner = {
        ...makeLearner(`Learner ${state.learners.allIds.length + 1}`),
        ...payload,
      };
      const nextLearners = {
        byId: { ...state.learners.byId, [learner.id]: learner },
        allIds: [...state.learners.allIds, learner.id],
        selectedId: learner.id,
      };
      persistLearners(nextLearners);
      setState((current) => ({
        ...current,
        learners: nextLearners,
        subjectUi: subjectUiForLearner(registry, resolvedRepositories, learner.id),
        monsterCelebrations: emptyMonsterCelebrations(),
      }));
      return learner;
    },
    updateLearner(learnerId, patch) {
      if (!state.learners.byId[learnerId]) return;
      const nextLearners = {
        ...state.learners,
        byId: {
          ...state.learners.byId,
          [learnerId]: { ...state.learners.byId[learnerId], ...patch },
        },
      };
      persistLearners(nextLearners);
      setState((current) => ({
        ...current,
        learners: nextLearners,
      }));
    },
    deleteLearner(learnerId) {
      if (state.learners.allIds.length <= 1) return false;
      if (!state.learners.byId[learnerId]) return false;
      const nextById = { ...state.learners.byId };
      delete nextById[learnerId];
      const nextIds = state.learners.allIds.filter((id) => id !== learnerId);
      const nextSelectedId = state.learners.selectedId === learnerId ? nextIds[0] : state.learners.selectedId;
      const nextLearners = {
        byId: nextById,
        allIds: nextIds,
        selectedId: nextSelectedId,
      };
      resolvedRepositories.subjectStates.clearLearner(learnerId);
      resolvedRepositories.practiceSessions.clearLearner(learnerId);
      resolvedRepositories.gameState.clearLearner(learnerId);
      resolvedRepositories.eventLog.clearLearner(learnerId);
      persistLearners(nextLearners);
      setState((current) => ({
        ...current,
        learners: nextLearners,
        subjectUi: subjectUiForLearner(registry, resolvedRepositories, nextSelectedId),
        monsterCelebrations: emptyMonsterCelebrations(),
      }));
      return true;
    },
    updateSubjectUi,
    updateSubjectUiForLearner,
    pushToasts(events) {
      const entries = Array.isArray(events) ? events : [events];
      const validEvents = entries.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry));
      if (!validEvents.length) return;
      setState((current) => ({
        ...current,
        toasts: [...current.toasts, ...validEvents].slice(-25),
      }));
    },
    dismissToast(index) {
      setState((current) => ({
        ...current,
        toasts: current.toasts.filter((_, currentIndex) => currentIndex !== index),
      }));
    },
    /* Id-keyed dismissal. Index-based dismissal breaks the auto-dismiss
       timer because indexes shift as earlier toasts leave; keying by the
       event's own id keeps timers stable across reorder. No-op when the
       id is falsy or already gone, so callers can fire-and-forget. */
    dismissToastById(id) {
      if (!id) return;
      setState((current) => {
        if (!current.toasts.some((toast) => toast && toast.id === id)) return current;
        return {
          ...current,
          toasts: current.toasts.filter((toast) => !toast || toast.id !== id),
        };
      });
    },
    clearToasts() {
      setState((current) => ({ ...current, toasts: [] }));
    },
    deferMonsterCelebrations(events) {
      const validEvents = normaliseMonsterCelebrationEvents(events);
      if (!validEvents.length) return false;
      setState((current) => ({
        ...current,
        monsterCelebrations: {
          ...current.monsterCelebrations,
          pending: [...current.monsterCelebrations.pending, ...validEvents].slice(-25),
        },
      }));
      return true;
    },
    pushMonsterCelebrations(events) {
      const validEvents = normaliseMonsterCelebrationEvents(events);
      if (!validEvents.length) return false;
      setState((current) => ({
        ...current,
        monsterCelebrations: {
          ...current.monsterCelebrations,
          queue: [...current.monsterCelebrations.queue, ...validEvents].slice(-25),
        },
      }));
      return true;
    },
    releaseMonsterCelebrations() {
      if (!state.monsterCelebrations.pending.length) return false;
      setState((current) => ({
        ...current,
        monsterCelebrations: {
          pending: [],
          queue: [
            ...current.monsterCelebrations.queue,
            ...current.monsterCelebrations.pending,
          ].slice(-25),
        },
      }));
      return true;
    },
    dismissMonsterCelebration() {
      if (!state.monsterCelebrations.queue.length) return false;
      setState((current) => ({
        ...current,
        monsterCelebrations: {
          ...current.monsterCelebrations,
          queue: current.monsterCelebrations.queue.slice(1),
        },
      }));
      return true;
    },
    clearMonsterCelebrations() {
      setState((current) => ({
        ...current,
        monsterCelebrations: emptyMonsterCelebrations(),
      }));
    },
    clearAllProgress() {
      resolvedRepositories.clearAll();
      reloadFromRepositories();
    },
    resetSubjectUi,
  };
}
