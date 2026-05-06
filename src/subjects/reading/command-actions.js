import { normaliseReadingReadModel } from './client-read-models.js';
import { createInitialReadingState, normaliseReadingPrefs } from './metadata.js';

function selectedReadingUi(state) {
  return normaliseReadingReadModel(state?.subjectUi?.reading, state?.learners?.selectedId || '');
}

function fieldName(name, prefix = '') {
  return `${prefix || ''}${name}`;
}

function formDataValue(formData, name) {
  if (!formData || typeof formData.get !== 'function') return '';
  return formData.get(name) ?? '';
}

function responseFromFormData(formData, question, prefix = '') {
  if (!question) return {};
  if (question.type === 'mcq') return { answer: String(formDataValue(formData, fieldName('answer', prefix))) };
  if (question.type === 'multiSelect') {
    return { answer: typeof formData?.getAll === 'function' ? formData.getAll(fieldName('answer', prefix)).map(String) : [] };
  }
  if (question.type === 'short') return { answer: String(formDataValue(formData, fieldName('answer', prefix))) };
  if (question.type === 'evidenceShort') {
    return {
      answer: String(formDataValue(formData, fieldName('answer', prefix))),
      evidence: String(formDataValue(formData, fieldName('evidence', prefix))),
    };
  }
  if (question.type === 'open') return { answer: String(formDataValue(formData, fieldName('answer', prefix))) };
  if (question.type === 'match') {
    const map = {};
    (question.prompts || []).forEach((_, index) => { map[index] = String(formDataValue(formData, fieldName(`map_${index}`, prefix))); });
    return { map };
  }
  if (question.type === 'order') {
    const order = {};
    (question.items || []).forEach((_, index) => { order[index] = String(formDataValue(formData, fieldName(`order_${index}`, prefix))); });
    return { order };
  }
  return { answer: String(formDataValue(formData, fieldName('answer', prefix))) };
}

function responsesFromFormData(formData, questions = []) {
  const responses = {};
  for (const question of questions || []) {
    if (!question?.id) continue;
    responses[question.id] = responseFromFormData(formData, question, `q_${question.id}_`);
  }
  return responses;
}

function hasSectionFormFields(formData) {
  if (!formData || typeof formData.keys !== 'function') return false;
  for (const key of formData.keys()) {
    if (String(key || '').startsWith('q_')) return true;
  }
  return false;
}

function responseHasValue(value) {
  if (Array.isArray(value)) return value.some(responseHasValue);
  if (value && typeof value === 'object') return Object.values(value).some(responseHasValue);
  return String(value == null ? '' : value).trim() !== '';
}

function currentQuestion(state) {
  return selectedReadingUi(state).session?.currentQuestion || null;
}

function currentSectionQuestions(state) {
  return selectedReadingUi(state).session?.questions || [];
}

function currentSession(state) {
  return selectedReadingUi(state).session || null;
}

function responsePayload({ data, state }) {
  const session = currentSession(state);
  const question = currentQuestion(state);
  return {
    expectedSessionId: session?.id || '',
    expectedSectionIndex: session?.currentSectionIndex ?? 0,
    expectedQuestionId: question?.id || '',
    response: responseFromFormData(data?.formData, question),
  };
}

function sectionResponsesPayload({ data, state }) {
  const session = currentSession(state);
  const questions = currentSectionQuestions(state);
  const hasSectionFields = hasSectionFormFields(data?.formData);
  const responses = hasSectionFields ? responsesFromFormData(data?.formData, questions) : {};
  const question = currentQuestion(state);
  if (question?.id && (!hasSectionFields || !responseHasValue(responses[question.id]))) {
    const singleResponse = responseFromFormData(data?.formData, question);
    if (responseHasValue(singleResponse)) responses[question.id] = singleResponse;
  }
  return {
    expectedSessionId: session?.id || '',
    expectedSectionIndex: session?.currentSectionIndex ?? 0,
    responses,
    preserveExistingNonEmptyResponses: !hasSectionFields,
  };
}

export function setReadingRuntimeError(store, message) {
  store.updateSubjectUi('reading', {
    ...createInitialReadingState(),
    ...(store.getState().subjectUi?.reading || {}),
    pendingCommand: '',
    error: message || 'Reading practice is temporarily unavailable.',
  });
}

export function applyReadingCommandResponse({ store, shouldDelayMonsterCelebrations, subjectSessionEnded, notifyHeroSubjectSessionEnded }) {
  return function applyResponse(response) {
    const previousReadingUi = store.getState().subjectUi?.reading || null;
    const learnerId = response?.learnerId ? String(response.learnerId) : '';
    if (learnerId && store.getState().learners?.selectedId !== learnerId) return;
    if (response?.subjectReadModel) {
      store.updateSubjectUi('reading', {
        ...normaliseReadingReadModel(response.subjectReadModel, learnerId),
        pendingCommand: '',
        error: '',
      });
    }
    const nextReadingUi = store.getState().subjectUi?.reading || null;
    const rewards = response?.projections?.rewards;
    if (rewards?.toastEvents?.length) store.pushToasts(rewards.toastEvents);
    const monsterEvents = rewards?.events || [];
    if (monsterEvents.length) {
      if (shouldDelayMonsterCelebrations?.('reading', previousReadingUi, nextReadingUi)) {
        store.deferMonsterCelebrations(monsterEvents);
      } else {
        store.pushMonsterCelebrations(monsterEvents);
      }
    }
    if (subjectSessionEnded?.('reading', previousReadingUi, nextReadingUi)) {
      store.releaseMonsterCelebrations?.();
      notifyHeroSubjectSessionEnded?.('reading');
    }
  };
}

export const readingSubjectCommandActions = Object.freeze({
  'reading-start': {
    command: 'start-session',
    payload: ({ data, state }) => ({
      ...normaliseReadingPrefs({ ...selectedReadingUi(state).prefs, ...(data || {}) }),
      heroContext: data?.heroContext || null,
    }),
    dedupeKey: false,
  },
  'reading-save-prefs': {
    command: 'save-prefs',
    payload: ({ data, state }) => ({ prefs: normaliseReadingPrefs({ ...selectedReadingUi(state).prefs, ...(data || {}) }) }),
  },
  'reading-submit-form': {
    command: 'submit-answer',
    payload: responsePayload,
    dedupeKey: ({ subjectId, learnerId, state, command }) => {
      const session = currentSession(state);
      const question = currentQuestion(state);
      return [subjectId, command, learnerId, session?.id || 'no-session', question?.id || 'no-question'].join(':');
    },
  },
  'reading-save-response': {
    command: 'save-response',
    payload: ({ data, state }) => ({
      ...responsePayload({ data, state }),
      advance: Boolean(data?.advance),
      move: data?.move || null,
    }),
    dedupeKey: false,
  },
  'reading-save-section': {
    command: 'save-response',
    payload: ({ data, state }) => ({ ...sectionResponsesPayload({ data, state }), move: data?.move || null }),
    dedupeKey: false,
  },
  'reading-continue': {
    command: 'continue-session',
    payload: {},
    dedupeKey: false,
  },
  'reading-move': {
    command: 'move-question',
    payload: ({ data }) => ({
      delta: Number(data?.delta) || 0,
      questionIndex: data?.questionIndex,
      sectionIndex: data?.sectionIndex,
    }),
    dedupeKey: false,
  },
  'reading-mark-section': {
    command: 'mark-section',
    payload: sectionResponsesPayload,
    dedupeKey: false,
  },
  'reading-mark-session': {
    command: 'mark-session',
    payload: sectionResponsesPayload,
    dedupeKey: false,
  },
  'reading-end': {
    command: 'end-session',
    payload: {},
    dedupeKey: false,
  },
});
