import { normaliseReasoningReadModel } from './client-read-models.js';
import { createInitialReasoningState, normaliseReasoningPrefs } from './metadata.js';

function selectedReasoningUi(state) {
  return normaliseReasoningReadModel(state?.subjectUi?.reasoning, state?.learners?.selectedId || '');
}

function fieldName(name, prefix = '') {
  return `${prefix || ''}${name}`;
}

function formDataValue(formData, name) {
  if (!formData || typeof formData.get !== 'function') return '';
  return formData.get(name) ?? '';
}

function responseFromFormData(formData, question, prefix = '') {
  const spec = question?.inputSpec || {};
  const response = {};
  if (spec.type === 'multi') {
    for (const field of spec.fields || []) {
      const name = fieldName(field.key, prefix);
      if (field.kind === 'radio' || field.kind === 'select' || field.kind === 'text' || field.kind === 'number') {
        response[field.key] = String(formDataValue(formData, name));
      }
    }
    response.working = String(formDataValue(formData, fieldName('working', prefix)));
    return response;
  }
  response.answer = String(formDataValue(formData, fieldName('answer', prefix)));
  response.working = String(formDataValue(formData, fieldName('working', prefix)));
  return response;
}

function responsesFromFormData(formData, questions = []) {
  const responses = {};
  for (const question of questions || []) {
    if (!question?.id) continue;
    responses[question.id] = responseFromFormData(formData, question, `q_${question.id}_`);
  }
  return responses;
}

function responseHasValue(value) {
  if (Array.isArray(value)) return value.some(responseHasValue);
  if (value && typeof value === 'object') return Object.values(value).some(responseHasValue);
  return String(value == null ? '' : value).trim() !== '';
}

function currentSession(state) {
  return selectedReasoningUi(state).session || null;
}

function currentQuestion(state) {
  return selectedReasoningUi(state).session?.currentQuestion || null;
}

function currentQuestions(state) {
  return selectedReasoningUi(state).session?.questions || [];
}

function responsePayload({ data, state }) {
  const session = currentSession(state);
  const question = currentQuestion(state);
  return {
    expectedSessionId: session?.id || '',
    expectedQuestionId: question?.id || '',
    response: responseFromFormData(data?.formData, question),
  };
}

function allResponsesPayload({ data, state }) {
  const session = currentSession(state);
  const questions = currentQuestions(state);
  const responses = responsesFromFormData(data?.formData, questions);
  const current = currentQuestion(state);
  if (current?.id && !responseHasValue(responses[current.id])) {
    const single = responseFromFormData(data?.formData, current);
    if (responseHasValue(single)) responses[current.id] = single;
  }
  return {
    expectedSessionId: session?.id || '',
    responses,
  };
}

function supportPayload(kind) {
  return ({ state }) => {
    const session = currentSession(state);
    const question = currentQuestion(state);
    return {
      expectedSessionId: session?.id || '',
      expectedQuestionId: question?.id || '',
      kind,
    };
  };
}

export function setReasoningRuntimeError(store, message) {
  store.updateSubjectUi('reasoning', {
    ...createInitialReasoningState(),
    ...(store.getState().subjectUi?.reasoning || {}),
    pendingCommand: '',
    error: message || 'Reasoning practice is temporarily unavailable.',
  });
}

export function applyReasoningCommandResponse({ store, shouldDelayMonsterCelebrations, subjectSessionEnded, notifyHeroSubjectSessionEnded }) {
  return function applyResponse(response) {
    const previousReasoningUi = store.getState().subjectUi?.reasoning || null;
    const learnerId = response?.learnerId ? String(response.learnerId) : '';
    if (learnerId && store.getState().learners?.selectedId !== learnerId) return;
    if (response?.subjectReadModel) {
      store.updateSubjectUi('reasoning', {
        ...normaliseReasoningReadModel(response.subjectReadModel, learnerId),
        pendingCommand: '',
        error: '',
      });
    }
    const nextReasoningUi = store.getState().subjectUi?.reasoning || null;
    const rewards = response?.projections?.rewards;
    if (rewards?.toastEvents?.length) store.pushToasts(rewards.toastEvents);
    const monsterEvents = rewards?.events || [];
    if (monsterEvents.length) {
      if (shouldDelayMonsterCelebrations?.('reasoning', previousReasoningUi, nextReasoningUi)) {
        store.deferMonsterCelebrations(monsterEvents);
      } else {
        store.pushMonsterCelebrations(monsterEvents);
      }
    }
    if (subjectSessionEnded?.('reasoning', previousReasoningUi, nextReasoningUi)) {
      store.releaseMonsterCelebrations?.();
      notifyHeroSubjectSessionEnded?.('reasoning');
    }
  };
}

export const reasoningSubjectCommandActions = Object.freeze({
  'reasoning-start': {
    command: 'start-session',
    payload: ({ data, state }) => ({
      ...normaliseReasoningPrefs({ ...selectedReasoningUi(state).prefs, ...(data || {}) }),
      heroContext: data?.heroContext || null,
    }),
    dedupeKey: false,
  },
  'reasoning-save-prefs': {
    command: 'save-prefs',
    payload: ({ data, state }) => ({ prefs: normaliseReasoningPrefs({ ...selectedReasoningUi(state).prefs, ...(data || {}) }) }),
  },
  'reasoning-submit-form': {
    command: 'submit-answer',
    payload: responsePayload,
    dedupeKey: ({ subjectId, learnerId, state, command }) => {
      const session = currentSession(state);
      const question = currentQuestion(state);
      return [subjectId, command, learnerId, session?.id || 'no-session', question?.id || 'no-question'].join(':');
    },
  },
  'reasoning-save-response': {
    command: 'save-response',
    payload: ({ data, state }) => ({
      ...responsePayload({ data, state }),
      advance: Boolean(data?.advance),
      move: data?.move || null,
    }),
    dedupeKey: false,
  },
  'reasoning-save-all': {
    command: 'save-response',
    payload: ({ data, state }) => ({ ...allResponsesPayload({ data, state }), move: data?.move || null }),
    dedupeKey: false,
  },
  'reasoning-move': {
    command: 'move-question',
    payload: ({ data }) => ({ delta: Number(data?.delta) || 0, questionIndex: data?.questionIndex }),
    dedupeKey: false,
  },
  'reasoning-mark-set': {
    command: 'mark-session',
    payload: allResponsesPayload,
    dedupeKey: false,
  },
  'reasoning-support-faded': {
    command: 'request-support',
    payload: supportPayload('faded'),
    dedupeKey: false,
  },
  'reasoning-support-worked': {
    command: 'request-support',
    payload: supportPayload('worked'),
    dedupeKey: false,
  },
  'reasoning-continue': {
    command: 'continue-session',
    payload: {},
    dedupeKey: false,
  },
  'reasoning-end': {
    command: 'end-session',
    payload: {},
    dedupeKey: false,
  },
});
