import { normaliseArithmeticReadModel } from './client-read-models.js';
import { createInitialArithmeticState, normaliseArithmeticPrefs } from './metadata.js';

function selectedArithmeticUi(state) {
  return normaliseArithmeticReadModel(state?.subjectUi?.arithmetic, state?.learners?.selectedId || '');
}

function value(formData, name) {
  if (!formData || typeof formData.get !== 'function') return '';
  return formData.get(name) ?? '';
}

function responseFromFormData(formData) {
  return { answer: String(value(formData, 'answer')) };
}

function currentSession(state) {
  return selectedArithmeticUi(state).session || null;
}

function responsePayload({ data, state }) {
  const session = currentSession(state);
  const question = session?.currentQuestion || null;
  return {
    expectedSessionId: session?.id || '',
    expectedQuestionId: question?.id || '',
    index: session?.currentIndex || 0,
    response: responseFromFormData(data?.formData),
    working: String(value(data?.formData, 'working')),
    advance: data?.advance !== false,
  };
}

function sessionQuestionPayload({ state }) {
  const session = currentSession(state);
  const question = session?.currentQuestion || null;
  return {
    expectedSessionId: session?.id || '',
    expectedQuestionId: question?.id || '',
    index: session?.currentIndex || 0,
  };
}

export function setArithmeticRuntimeError(store, message) {
  store.updateSubjectUi('arithmetic', {
    ...createInitialArithmeticState(),
    ...(store.getState().subjectUi?.arithmetic || {}),
    pendingCommand: '',
    error: message || 'Arithmetic practice is temporarily unavailable.',
  });
}

export function applyArithmeticCommandResponse({ store, shouldDelayMonsterCelebrations, subjectSessionEnded, notifyHeroSubjectSessionEnded }) {
  return function applyResponse(response) {
    const previousUi = store.getState().subjectUi?.arithmetic || null;
    const learnerId = response?.learnerId ? String(response.learnerId) : '';
    if (learnerId && store.getState().learners?.selectedId !== learnerId) return;
    if (response?.subjectReadModel) {
      store.updateSubjectUi('arithmetic', {
        ...normaliseArithmeticReadModel(response.subjectReadModel, learnerId),
        pendingCommand: '',
        error: '',
      });
    }
    const nextUi = store.getState().subjectUi?.arithmetic || null;
    const rewards = response?.projections?.rewards;
    if (rewards?.toastEvents?.length) store.pushToasts(rewards.toastEvents);
    const monsterEvents = rewards?.events || [];
    if (monsterEvents.length) {
      if (shouldDelayMonsterCelebrations?.('arithmetic', previousUi, nextUi)) store.deferMonsterCelebrations(monsterEvents);
      else store.pushMonsterCelebrations(monsterEvents);
    }
    if (subjectSessionEnded?.('arithmetic', previousUi, nextUi)) {
      store.releaseMonsterCelebrations?.();
      notifyHeroSubjectSessionEnded?.('arithmetic');
    }
  };
}

export const arithmeticSubjectCommandActions = Object.freeze({
  'arithmetic-start': {
    command: 'start-session',
    payload: ({ data, state }) => ({ ...normaliseArithmeticPrefs({ ...selectedArithmeticUi(state).prefs, ...(data || {}) }), heroContext: data?.heroContext || null }),
    dedupeKey: false,
  },
  'arithmetic-save-prefs': {
    command: 'save-prefs',
    payload: ({ data, state }) => ({ prefs: normaliseArithmeticPrefs({ ...selectedArithmeticUi(state).prefs, ...(data || {}) }) }),
  },
  'arithmetic-submit-form': {
    command: 'submit-answer',
    payload: responsePayload,
    dedupeKey: false,
  },
  'arithmetic-save-response': {
    command: 'submit-answer',
    payload: responsePayload,
    dedupeKey: false,
  },
  'arithmetic-finish-test': {
    command: 'finish-test',
    payload: responsePayload,
    dedupeKey: false,
  },
  'arithmetic-continue': {
    command: 'continue-session',
    payload: sessionQuestionPayload,
    dedupeKey: false,
  },
  'arithmetic-end': {
    command: 'end-session',
    payload: sessionQuestionPayload,
    dedupeKey: false,
  },
});
