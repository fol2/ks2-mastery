import { normaliseReadingReadModel } from './client-read-models.js';
import { createInitialReadingState, normaliseReadingPrefs } from './metadata.js';

function selectedReadingUi(state) {
  return normaliseReadingReadModel(state?.subjectUi?.reading, state?.learners?.selectedId || '');
}

function formDataValue(formData, name) {
  if (!formData || typeof formData.get !== 'function') return '';
  return formData.get(name) ?? '';
}

function responseFromFormData(formData, question) {
  if (!question) return {};
  if (question.type === 'mcq') return { answer: String(formDataValue(formData, 'answer')) };
  if (question.type === 'multiSelect') {
    return { answer: typeof formData?.getAll === 'function' ? formData.getAll('answer').map(String) : [] };
  }
  if (question.type === 'short') return { answer: String(formDataValue(formData, 'answer')) };
  if (question.type === 'evidenceShort') {
    return {
      answer: String(formDataValue(formData, 'answer')),
      evidence: String(formDataValue(formData, 'evidence')),
    };
  }
  if (question.type === 'open') return { answer: String(formDataValue(formData, 'answer')) };
  if (question.type === 'match') {
    const map = {};
    (question.prompts || []).forEach((_, index) => { map[index] = String(formDataValue(formData, `map_${index}`)); });
    return { map };
  }
  if (question.type === 'order') {
    const order = {};
    (question.items || []).forEach((_, index) => { order[index] = String(formDataValue(formData, `order_${index}`)); });
    return { order };
  }
  return { answer: String(formDataValue(formData, 'answer')) };
}

function currentQuestion(state) {
  return selectedReadingUi(state).session?.currentQuestion || null;
}

function currentSession(state) {
  return selectedReadingUi(state).session || null;
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
    payload: ({ data, state }) => ({ ...responsePayload({ data, state }), advance: data?.advance !== false }),
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
    payload: {},
    dedupeKey: false,
  },
  'reading-mark-session': {
    command: 'mark-session',
    payload: {},
    dedupeKey: false,
  },
  'reading-end': {
    command: 'end-session',
    payload: {},
    dedupeKey: false,
  },
});
