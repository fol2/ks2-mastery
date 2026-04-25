import {
  DEFAULT_GRAMMAR_PREFS,
  GRAMMAR_SUBJECT_ID,
  normaliseGrammarReadModel,
} from './metadata.js';
import { normaliseGrammarSpeechRate } from './speech.js';

function selectedLearnerId(context) {
  return (context?.store?.getState?.() || context?.appState || {})?.learners?.selectedId || '';
}

function selectedGrammarUi(context) {
  const appState = context?.store?.getState?.() || context?.appState || {};
  const learnerId = selectedLearnerId(context);
  return normaliseGrammarReadModel(appState?.subjectUi?.[GRAMMAR_SUBJECT_ID], learnerId);
}

function grammarModeKey(value) {
  const mode = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (mode === 'sentence-builder') return 'builder';
  if (mode === 'sentence-surgery') return 'surgery';
  if (mode === 'worked-example' || mode === 'worked-examples') return 'worked';
  if (mode === 'faded-support' || mode === 'faded-guidance') return 'faded';
  return mode;
}

function grammarModeUsesFocus(value) {
  const mode = grammarModeKey(value);
  return mode !== 'trouble' && mode !== 'surgery' && mode !== 'builder';
}

function updateGrammarUiForLearner(context, learnerId, updater) {
  if (!learnerId) return false;
  if (typeof context?.store?.updateSubjectUiForLearner === 'function') {
    return context.store.updateSubjectUiForLearner(learnerId, GRAMMAR_SUBJECT_ID, updater);
  }
  if (selectedLearnerId(context) !== learnerId) return false;
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, updater);
  return true;
}

function setGrammarError(context, message, { learnerId = selectedLearnerId(context) } = {}) {
  updateGrammarUiForLearner(context, learnerId, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: '',
    error: message || 'Grammar practice is temporarily unavailable.',
  }));
}

function applyRemoteReadModel(context, response, { learnerId } = {}) {
  if (!learnerId) return;
  const responseLearnerId = String(response?.subjectReadModel?.learnerId || learnerId);
  if (responseLearnerId && responseLearnerId !== learnerId) return;
  const isSelectedLearner = selectedLearnerId(context) === learnerId;
  if (isSelectedLearner && response?.projections?.rewards?.toastEvents?.length) {
    context.store.pushToasts(response.projections.rewards.toastEvents);
  }
  if (isSelectedLearner && response?.projections?.rewards?.events?.length) {
    context.store.pushMonsterCelebrations(response.projections.rewards.events);
  }
  if (response?.subjectReadModel) {
    updateGrammarUiForLearner(context, learnerId, {
      ...normaliseGrammarReadModel(response.subjectReadModel, learnerId),
      pendingCommand: '',
      error: '',
    });
    return;
  }
  if (!isSelectedLearner) return;
  context.store.reloadFromRepositories?.({ preserveRoute: true });
}

function sendGrammarCommand(context, command, payload = {}) {
  const learnerId = selectedLearnerId(context);
  if (!learnerId) return true;
  const ui = selectedGrammarUi(context);
  if (ui.pendingCommand) return true;
  if (context.runtimeReadOnly) {
    setGrammarError(context, 'Practice is read-only while sync is degraded. Retry sync before continuing.');
    return true;
  }
  const client = context.subjectCommands;
  if (!client?.send) {
    setGrammarError(context, 'Grammar practice needs the Worker command boundary.');
    return true;
  }

  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    pendingCommand: command,
    error: '',
  }));

  client.send({
    subjectId: GRAMMAR_SUBJECT_ID,
    learnerId,
    command,
    payload,
  }).then((response) => {
    applyRemoteReadModel(context, response, { learnerId });
  }).catch((error) => {
    globalThis.console?.warn?.('Grammar command failed.', error);
    setGrammarError(context, error?.payload?.message || error?.message || 'The Grammar command could not be completed.', { learnerId });
  });

  return true;
}

function applyLocalTransition(context, transition) {
  if (!transition) return true;
  return context.applySubjectTransition(GRAMMAR_SUBJECT_ID, transition);
}

function grammarStartPayload(ui, data = {}) {
  const prefs = ui.prefs || DEFAULT_GRAMMAR_PREFS;
  const payload = data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload) ? data.payload : {};
  const mode = payload.mode || data.mode || prefs.mode || DEFAULT_GRAMMAR_PREFS.mode;
  const request = {
    mode,
    roundLength: data.roundLength || prefs.roundLength || DEFAULT_GRAMMAR_PREFS.roundLength,
    goalType: data.goalType || prefs.goalType || DEFAULT_GRAMMAR_PREFS.goalType,
    allowTeachingItems: prefs.allowTeachingItems === true,
    showDomainBeforeAnswer: prefs.showDomainBeforeAnswer !== false,
  };
  if (Object.prototype.hasOwnProperty.call(data, 'focusConceptId')) {
    request.focusConceptId = data.focusConceptId;
  } else if (
    grammarModeUsesFocus(mode)
    && !Object.prototype.hasOwnProperty.call(payload, 'focusConceptId')
    && !Object.prototype.hasOwnProperty.call(payload, 'skillId')
    && !Object.prototype.hasOwnProperty.call(payload, 'templateId')
  ) {
    request.focusConceptId = prefs.focusConceptId || '';
  }
  return {
    ...request,
    ...payload,
  };
}

function responseFromFormData(formData) {
  if (!formData?.entries) return {};
  const response = {};
  for (const [key, value] of formData.entries()) {
    if (!key || key === '_action') continue;
    if (key === 'selected') {
      response.selected = formData.getAll('selected').map((entry) => String(entry));
      continue;
    }
    response[key] = String(value ?? '');
  }
  return response;
}

function hasGrammarResponseValue(value) {
  if (Array.isArray(value)) return value.some((entry) => String(entry || '').trim());
  return String(value ?? '').trim().length > 0;
}

function responseHasAnswer(response) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  return Object.entries(response).some(([, value]) => hasGrammarResponseValue(value));
}

function resetToDashboard(context) {
  const learnerId = selectedLearnerId(context);
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => ({
    ...normaliseGrammarReadModel(current, learnerId),
    phase: 'dashboard',
    session: null,
    feedback: null,
    summary: null,
    awaitingAdvance: false,
    pendingCommand: '',
    error: '',
  }));
  return true;
}

function resetToDashboardWithPrefs(context, prefs) {
  const learnerId = selectedLearnerId(context);
  context.store.updateSubjectUi(GRAMMAR_SUBJECT_ID, (current) => {
    const ui = normaliseGrammarReadModel(current, learnerId);
    return {
      ...ui,
      prefs: { ...ui.prefs, ...(prefs || {}) },
      phase: 'dashboard',
      session: null,
      feedback: null,
      summary: null,
      awaitingAdvance: false,
      pendingCommand: '',
      error: '',
    };
  });
  return true;
}

export const grammarModule = {
  id: GRAMMAR_SUBJECT_ID,
  name: 'Grammar',
  blurb: 'Word classes, clauses, tenses and sentence shape.',
  accent: '#2E8479',
  accentSoft: '#CFE8E3',
  accentTint: '#E3F1EE',
  icon: 'speech',
  available: true,
  reactPractice: true,
  initState() {
    return normaliseGrammarReadModel();
  },
  getDashboardStats(appState) {
    const learnerId = appState.learners?.selectedId || '';
    const ui = normaliseGrammarReadModel(appState.subjectUi?.[GRAMMAR_SUBJECT_ID], learnerId);
    const counts = ui.stats?.concepts || {};
    const total = Math.max(1, Number(counts.total) || 0);
    const secured = Number(counts.secured) || 0;
    const due = (Number(counts.due) || 0) + (Number(counts.weak) || 0);
    const nextUp = ui.phase === 'session' || ui.phase === 'feedback'
      ? 'Continue Grammar round'
      : due
        ? 'Review due Grammar concepts'
        : 'Start Grammar retrieval';
    return {
      pct: Math.round((secured / total) * 100),
      due,
      streak: secured,
      nextUp,
    };
  },
  handleAction(action, context) {
    if (!String(action || '').startsWith('grammar-')) return false;

    const learnerId = selectedLearnerId(context);
    const ui = selectedGrammarUi(context);
    const service = context.service;

    if (action === 'grammar-back') {
      if ((ui.phase === 'session' || ui.phase === 'feedback') && ui.session) {
        if (context.data?.skipConfirm !== true && globalThis.confirm?.('End this Grammar session now?') === false) return true;
        if (service?.endSession) return applyLocalTransition(context, service.endSession(learnerId, ui));
        return sendGrammarCommand(context, 'end-session');
      }
      return resetToDashboard(context);
    }

    if (action === 'grammar-set-mode') {
      const mode = context.data?.value || DEFAULT_GRAMMAR_PREFS.mode;
      const patch = grammarModeUsesFocus(mode) ? { mode } : { mode, focusConceptId: '' };
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, patch);
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: patch });
    }

    if (action === 'grammar-set-round-length') {
      const roundLength = Number(context.data?.value) || DEFAULT_GRAMMAR_PREFS.roundLength;
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { roundLength });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { roundLength } });
    }

    if (action === 'grammar-set-goal') {
      const goalType = context.data?.value || DEFAULT_GRAMMAR_PREFS.goalType;
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { goalType });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { goalType } });
    }

    if (action === 'grammar-set-practice-setting') {
      const key = context.data?.key;
      if (!['allowTeachingItems', 'showDomainBeforeAnswer'].includes(key)) return true;
      const patch = { [key]: Boolean(context.data?.value) };
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, patch);
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: patch });
    }

    if (action === 'grammar-set-speech-rate') {
      const speechRate = normaliseGrammarSpeechRate(context.data?.value, ui.prefs?.speechRate);
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { speechRate });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { speechRate } });
    }

    if (action === 'grammar-set-focus') {
      const focusConceptId = context.data?.value || '';
      if (!grammarModeUsesFocus(ui.prefs?.mode)) {
        if (service?.savePrefs) {
          const prefs = service.savePrefs(learnerId, { focusConceptId: '' });
          return resetToDashboardWithPrefs(context, prefs);
        }
        return sendGrammarCommand(context, 'save-prefs', { prefs: { focusConceptId: '' } });
      }
      if (service?.savePrefs) {
        const prefs = service.savePrefs(learnerId, { focusConceptId });
        return resetToDashboardWithPrefs(context, prefs);
      }
      return sendGrammarCommand(context, 'save-prefs', { prefs: { focusConceptId } });
    }

    if (action === 'grammar-start' || action === 'grammar-start-again') {
      const payload = grammarStartPayload(ui, context.data || {});
      if (service?.startSession) return applyLocalTransition(context, service.startSession(learnerId, payload));
      return sendGrammarCommand(context, 'start-session', payload);
    }

    if (action === 'grammar-submit-form') {
      const response = responseFromFormData(context.data?.formData);
      if (ui.session?.type === 'mini-set') {
        const payload = { response, advance: Boolean(context.data?.advance) };
        if (service?.saveMiniTestResponse) return applyLocalTransition(context, service.saveMiniTestResponse(learnerId, response, payload.advance));
        return sendGrammarCommand(context, 'save-mini-test-response', payload);
      }
      if (!responseHasAnswer(response)) {
        setGrammarError(context, 'Choose or type an answer before submitting.', { learnerId });
        return true;
      }
      if (service?.submitAnswer) return applyLocalTransition(context, service.submitAnswer(learnerId, ui, response));
      return sendGrammarCommand(context, 'submit-answer', { response });
    }

    if (action === 'grammar-save-mini-test-response') {
      const response = responseFromFormData(context.data?.formData);
      const payload = { response, advance: Boolean(context.data?.advance) };
      if (context.data?.index !== undefined) payload.index = Number(context.data.index);
      if (service?.saveMiniTestResponse) return applyLocalTransition(context, service.saveMiniTestResponse(learnerId, response, payload));
      return sendGrammarCommand(context, 'save-mini-test-response', payload);
    }

    if (action === 'grammar-move-mini-test') {
      const payload = {};
      if (Object.prototype.hasOwnProperty.call(context.data || {}, 'index')) payload.index = Number(context.data.index);
      if (Object.prototype.hasOwnProperty.call(context.data || {}, 'delta')) payload.delta = Number(context.data.delta);
      if (service?.moveMiniTest) return applyLocalTransition(context, service.moveMiniTest(learnerId, payload));
      return sendGrammarCommand(context, 'move-mini-test', payload);
    }

    if (action === 'grammar-finish-mini-test') {
      const hasFormData = Boolean(context.data?.formData?.entries);
      const payload = hasFormData
        ? { response: responseFromFormData(context.data.formData) }
        : { saveCurrent: false };
      if (service?.finishMiniTest) return applyLocalTransition(context, service.finishMiniTest(learnerId, payload));
      return sendGrammarCommand(context, 'finish-mini-test', payload);
    }

    if (action === 'grammar-retry-current-question') {
      if (service?.retryCurrentQuestion) return applyLocalTransition(context, service.retryCurrentQuestion(learnerId));
      return sendGrammarCommand(context, 'retry-current-question');
    }

    if (action === 'grammar-use-faded-support') {
      if (service?.useFadedSupport) return applyLocalTransition(context, service.useFadedSupport(learnerId));
      return sendGrammarCommand(context, 'use-faded-support');
    }

    if (action === 'grammar-show-worked-solution') {
      if (service?.showWorkedSolution) return applyLocalTransition(context, service.showWorkedSolution(learnerId));
      return sendGrammarCommand(context, 'show-worked-solution');
    }

    if (action === 'grammar-start-similar-problem') {
      if (service?.startSimilarProblem) return applyLocalTransition(context, service.startSimilarProblem(learnerId));
      return sendGrammarCommand(context, 'start-similar-problem');
    }

    if (action === 'grammar-continue') {
      if (service?.continueSession) return applyLocalTransition(context, service.continueSession(learnerId, ui));
      return sendGrammarCommand(context, 'continue-session');
    }

    if (action === 'grammar-request-ai-enrichment') {
      const payload = context.data?.payload && typeof context.data.payload === 'object' && !Array.isArray(context.data.payload)
        ? context.data.payload
        : { kind: context.data?.kind || 'explanation' };
      if (service?.requestAiEnrichment) return applyLocalTransition(context, service.requestAiEnrichment(learnerId, payload));
      return sendGrammarCommand(context, 'request-ai-enrichment', payload);
    }

    if (action === 'grammar-end-early') {
      if (context.data?.skipConfirm !== true && globalThis.confirm?.('End this Grammar session now?') === false) return true;
      if (service?.endSession) return applyLocalTransition(context, service.endSession(learnerId, ui));
      return sendGrammarCommand(context, 'end-session');
    }

    return false;
  },
};
