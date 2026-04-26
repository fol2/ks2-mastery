import { createStore } from '../core/store.js';
import { createSubjectRuntimeBoundary } from '../core/subject-runtime.js';
import { createEventRuntime, createPracticeStreakSubscriber } from '../events/index.js';
import { createSpellingAutoAdvanceController } from '../../subjects/spelling/auto-advance.js';
import { resolveSpellingShortcut } from '../../subjects/spelling/shortcuts.js';
import { resolveGrammarShortcut } from '../../subjects/grammar/shortcuts.js';
import {
  normaliseBufferedGeminiVoice,
  normaliseTtsProvider,
} from '../../subjects/spelling/tts-providers.js';
import {
  isMonsterCelebrationEvent,
  shouldDelayMonsterCelebrations,
  spellingSessionEnded,
} from '../game/monster-celebrations.js';
import {
  acknowledgeMonsterCelebrationEvents,
  clearAllMonsterCelebrationAcknowledgements,
  clearMonsterCelebrationAcknowledgements,
} from '../game/monster-celebration-acks.js';
import { SUBJECTS } from '../core/subject-registry.js';
import {
  exposedSubjects,
  isSubjectExposed,
  normaliseSubjectExposureGates,
} from '../core/subject-availability.js';
import { safeParseInt } from '../core/utils.js';
import { buildControllerSnapshot, createDefaultControllerUiState } from './controller-snapshot.js';
import { createAppSideEffectPorts, createNoopTtsPort } from './side-effect-ports.js';

function resolveSubject(subjects, subjectId) {
  return subjects.find((subject) => subject.id === subjectId) || subjects[0];
}

function defaultSession() {
  return { signedIn: false, mode: 'local-only', platformRole: 'parent' };
}

export function createAppController({
  repositories = null,
  subjects = SUBJECTS,
  session = defaultSession(),
  now = () => Date.now(),
  subscribers = null,
  runtimeBoundary = createSubjectRuntimeBoundary(),
  scheduler = null,
  autoAdvanceDispatchContinue = null,
  tts = createNoopTtsPort(),
  services: extraServices = {},
  ports: portOverrides = {},
  uiState = createDefaultControllerUiState(),
  onEventError = null,
  extraContext = null,
  cacheSubjectUiWrites = false,
  subjectExposureGates = session?.subjectExposureGates || {},
} = {}) {
  const ports = createAppSideEffectPorts(portOverrides);
  const services = extraServices;
  const exposureGates = normaliseSubjectExposureGates(subjectExposureGates);

  const eventRuntime = createEventRuntime({
    repositories,
    subscribers: subscribers || [createPracticeStreakSubscriber()],
    onError: onEventError,
  });

  const store = createStore(subjects, { repositories, cacheSubjectUiWrites });
  const controllerListeners = new Set();
  const setTimeoutFn = scheduler?.setTimeout?.bind(scheduler)
    || (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : null);
  const clearTimeoutFn = scheduler?.clearTimeout?.bind(scheduler)
    || (typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : null);
  const autoAdvance = createSpellingAutoAdvanceController({
    getState: () => store.getState(),
    dispatchContinue: dispatchAutoAdvanceContinue,
    setTimeoutFn,
    clearTimeoutFn,
  });

  store.subscribe(() => {
    notify();
  });

  let currentSnapshot = null;
  let deferredAudio = null;

  function readSnapshot() {
    return buildControllerSnapshot({
      store,
      repositories,
      services,
      subjects: exposedSubjects(subjects, exposureGates),
      session,
      runtimeBoundary,
      uiState,
    });
  }

  function getSnapshot() {
    if (!currentSnapshot) currentSnapshot = readSnapshot();
    return currentSnapshot;
  }

  function notify() {
    currentSnapshot = readSnapshot();
    const snapshot = currentSnapshot;
    for (const listener of controllerListeners) {
      try { listener(snapshot); } catch {
        // Controller subscribers must not break app state updates.
      }
    }
  }

  function subscribe(listener) {
    controllerListeners.add(listener);
    return () => controllerListeners.delete(listener);
  }

  function ensureSpellingAutoAdvanceFromCurrentState() {
    const appState = store.getState();
    if (appState.route.screen !== 'subject' || appState.route.subjectId !== 'spelling' || (appState.route.tab || 'practice') !== 'practice') {
      return false;
    }
    return autoAdvance.ensureScheduledFromState(appState.subjectUi.spelling);
  }

  function dispatchAutoAdvanceContinue() {
    if (typeof autoAdvanceDispatchContinue === 'function') {
      return autoAdvanceDispatchContinue();
    }
    return dispatch('spelling-continue');
  }

  function clearDeferredAudio() {
    deferredAudio = null;
  }

  function queueDeferredAudio(payload) {
    deferredAudio = payload?.word ? payload : null;
    return Boolean(deferredAudio);
  }

  function flushDeferredAudio() {
    const payload = deferredAudio;
    deferredAudio = null;
    if (!payload?.word) return false;
    tts.speak(payload);
    return true;
  }

  function shouldStopSpellingAudio(previousSubjectUi, nextSubjectUi, transition) {
    if (transition?.audio?.word || transition?.audio?.promptToken) return false;
    if (previousSubjectUi?.phase !== 'session') return nextSubjectUi?.phase && nextSubjectUi.phase !== 'session';
    return nextSubjectUi?.phase !== 'session' || Boolean(nextSubjectUi?.awaitingAdvance);
  }

  function applySubjectTransition(subjectId, transition) {
    if (!transition) return false;
    const previousSubjectUi = store.getState().subjectUi[subjectId] || null;
    store.updateSubjectUi(subjectId, transition.state);
    const nextSubjectUi = transition.state || null;
    const published = eventRuntime.publish(transition.events);
    let renderedSideEffect = false;

    if (published.toastEvents.length) {
      store.pushToasts(published.toastEvents);
      renderedSideEffect = true;
    }

    const monsterCelebrations = published.reactionEvents.filter(isMonsterCelebrationEvent);
    if (monsterCelebrations.length) {
      if (shouldDelayMonsterCelebrations(subjectId, previousSubjectUi, nextSubjectUi)) {
        store.deferMonsterCelebrations(monsterCelebrations);
      } else {
        store.pushMonsterCelebrations(monsterCelebrations);
      }
      renderedSideEffect = true;
    }

    if (spellingSessionEnded(previousSubjectUi, nextSubjectUi)) {
      renderedSideEffect = store.releaseMonsterCelebrations() || renderedSideEffect;
    }

    if (!renderedSideEffect && published.reactionEvents.length) {
      store.patch(() => ({}));
    }

    runtimeBoundary.clear({
      learnerId: store.getState().learners.selectedId,
      subjectId,
      tab: store.getState().route.tab || 'practice',
    });

    if (subjectId === 'spelling' && shouldStopSpellingAudio(previousSubjectUi, nextSubjectUi, transition)) {
      clearDeferredAudio();
      tts.stop();
    }

    if (transition.audio?.word) {
      if (transition.deferAudioUntilFlowTransitionEnd) {
        queueDeferredAudio(transition.audio);
      } else {
        clearDeferredAudio();
        tts.speak(transition.audio);
      }
    }
    if (subjectId === 'spelling') autoAdvance.scheduleFromTransition(transition);
    return true;
  }

  function contextFor(subjectId = null) {
    const appState = store.getState();
    const subject = resolveSubject(subjects, subjectId || appState.route.subjectId || 'spelling');
    const baseContext = {
      appState,
      store,
      services,
      repositories,
      subject,
      service: services[subject.id] || null,
      tts,
      applySubjectTransition,
      runtimeBoundary,
      subjects: exposedSubjects(subjects, exposureGates),
      subjectExposureGates: exposureGates,
      snapshot: getSnapshot(),
    };
    const additionalContext = typeof extraContext === 'function'
      ? extraContext({ appState, subject, baseContext })
      : extraContext;
    return {
      ...baseContext,
      ...(additionalContext || {}),
    };
  }

  function resetLearnerData(learnerId) {
    Object.values(services).forEach((service) => {
      service?.resetLearner?.(learnerId);
    });
    repositories.subjectStates.clearLearner(learnerId);
    repositories.practiceSessions.clearLearner(learnerId);
    repositories.gameState.clearLearner(learnerId);
    repositories.eventLog.clearLearner(learnerId);
  }

  function handleGlobalAction(action, data) {
    const appState = store.getState();
    const learnerId = appState.learners.selectedId;

    if (action === 'navigate-home') {
      tts.stop();
      store.goHome();
      return true;
    }

    if (action === 'open-subject') {
      const subject = resolveSubject(subjects, data.subjectId || 'spelling');
      if (!isSubjectExposed(subject, exposureGates)) {
        store.goHome();
        return true;
      }
      tts.stop();
      store.openSubject(subject.id, data.tab || 'practice');
      return true;
    }

    if (action === 'open-codex') {
      tts.stop();
      store.openCodex();
      return true;
    }

    if (action === 'open-parent-hub') {
      tts.stop();
      store.openParentHub();
      return true;
    }

    if (action === 'open-admin-hub') {
      tts.stop();
      store.openAdminHub();
      return true;
    }

    if (action === 'open-profile-settings') {
      tts.stop();
      store.openProfileSettings();
      return true;
    }

    if (action === 'subject-set-tab') {
      store.setTab(data.tab || 'practice');
      return true;
    }

    if (action === 'learner-select') {
      tts.stop();
      runtimeBoundary.clearAll();
      store.selectLearner(data.value);
      return true;
    }

    if (action === 'learner-create') {
      const current = appState.learners.byId[learnerId];
      const fallbackName = `Learner ${appState.learners.allIds.length + 1}`;
      const rawName = typeof data.name === 'string'
        ? data.name
        : ports.prompt('Name for the new learner', fallbackName);
      if (rawName == null) return true;
      const name = String(rawName).trim();
      if (!name) return true;
      store.createLearner({
        name,
        yearGroup: data.yearGroup || current?.yearGroup || 'Y5',
        goal: data.goal || current?.goal || 'sats',
        dailyMinutes: data.dailyMinutes || current?.dailyMinutes || 15,
        avatarColor: data.avatarColor || current?.avatarColor || '#3E6FA8',
      });
      return true;
    }

    if (action === 'tts-test') {
      tts.speak({
        word: 'early',
        sentence: 'The birds sang early in the day.',
        provider: normaliseTtsProvider(data.provider),
        bufferedGeminiVoice: normaliseBufferedGeminiVoice(data.bufferedGeminiVoice),
        kind: 'test',
      });
      return true;
    }

    if (action === 'learner-save-form') {
      const formData = data.formData;
      services.spelling?.savePrefs?.(learnerId, {
        ttsProvider: normaliseTtsProvider(formData.get('ttsProvider')),
        bufferedGeminiVoice: normaliseBufferedGeminiVoice(formData.get('bufferedGeminiVoice')),
      });
      store.updateLearner(learnerId, {
        name: String(formData.get('name') || 'Learner').trim() || 'Learner',
        yearGroup: String(formData.get('yearGroup') || 'Y5'),
        goal: String(formData.get('goal') || 'sats'),
        dailyMinutes: safeParseInt(formData.get('dailyMinutes'), 15),
        avatarColor: String(formData.get('avatarColor') || '#3E6FA8'),
      });
      return true;
    }

    if (action === 'learner-delete') {
      if (!ports.confirm('Warning: delete the current learner and all their subject progress and codex state?')) return true;
      runtimeBoundary.clearLearner(learnerId);
      clearMonsterCelebrationAcknowledgements(learnerId);
      resetLearnerData(learnerId);
      store.deleteLearner(learnerId);
      return true;
    }

    if (action === 'learner-reset-progress') {
      if (!ports.confirm('Warning: reset subject progress and codex rewards for the current learner?')) return true;
      tts.stop();
      runtimeBoundary.clearLearner(learnerId);
      clearMonsterCelebrationAcknowledgements(learnerId);
      resetLearnerData(learnerId);
      store.resetSubjectUi();
      return true;
    }

    if (action === 'platform-reset-all') {
      if (!ports.confirm('Reset all app data for every learner on this browser?')) return true;
      tts.stop();
      runtimeBoundary.clearAll();
      clearAllMonsterCelebrationAcknowledgements();
      store.clearAllProgress();
      ports.reload();
      return true;
    }

    if (action === 'persistence-retry') {
      repositories.persistence.retry()
        .then(() => {
          tts.stop();
          runtimeBoundary.clearAll();
          store.clearMonsterCelebrations();
          store.reloadFromRepositories({ preserveRoute: true });
        })
        .catch((error) => {
          ports.onPersistenceRetryFailure(error);
        });
      return true;
    }

    if (action === 'subject-runtime-retry') {
      runtimeBoundary.clear({
        learnerId,
        subjectId: appState.route.subjectId || 'spelling',
        tab: appState.route.tab || 'practice',
      });
      store.patch(() => ({}));
      return true;
    }

    if (action === 'monster-celebration-dismiss') {
      acknowledgeMonsterCelebrationEvents(store.getState().monsterCelebrations?.queue?.[0], { learnerId });
      store.dismissMonsterCelebration();
      return true;
    }

    return false;
  }

  function handleSubjectAction(action, data) {
    const appState = store.getState();
    const learnerId = appState.learners.selectedId;
    const tab = appState.route.tab || 'practice';
    const subject = resolveSubject(subjects, appState.route.subjectId || 'spelling');

    try {
      if (!isSubjectExposed(subject, exposureGates)) {
        store.goHome();
        return true;
      }
      const handled = subject.handleAction?.(action, {
        ...contextFor(subject.id),
        data,
      });
      if (handled) {
        runtimeBoundary.clear({ learnerId, subjectId: subject.id, tab });
      }
      return Boolean(handled);
    } catch (error) {
      tts.stop();
      runtimeBoundary.capture({
        learnerId,
        subject,
        tab,
        phase: 'action',
        methodName: 'handleAction',
        action,
        error,
      });
      store.patch(() => ({}));
      return true;
    }
  }

  function dispatch(action, data = {}) {
    clearDeferredAudio();
    autoAdvance.clear();
    try {
      if (!handleGlobalAction(action, data)) {
        handleSubjectAction(action, data);
      }
      return true;
    } finally {
      ensureSpellingAutoAdvanceFromCurrentState();
    }
  }

  function keydown(eventLike = {}) {
    const appState = store.getState();
    const shortcut = resolveSpellingShortcut(eventLike, appState)
      || resolveGrammarShortcut(eventLike, appState);
    if (!shortcut) return false;
    if (shortcut.action) {
      dispatch(shortcut.action, shortcut.data || {});
      return true;
    }
    return Boolean(shortcut.focusSelector);
  }

  return {
    store,
    repositories,
    services,
    tts,
    eventRuntime,
    runtimeBoundary,
    subjects,
    session,
    ports,
    contextFor,
    getSnapshot,
    subscribe,
    dispatch,
    // Exposed for tests that need the subject-handler's truthy/falsy return
    // value. Production callers should always use `dispatch` (which wraps
    // `handleSubjectAction` in the autoAdvance / audio lifecycle and
    // swallows the boolean); adv-219-007's refuse-to-dispatch assertion
    // pairs the raw handler return with a state-level check to close
    // learning #7's silent-no-op gap.
    handleSubjectAction,
    keydown,
    autoAdvance,
    scheduler,
    ensureSpellingAutoAdvanceFromCurrentState,
    applySubjectTransition,
    flushDeferredAudio,
  };
}
