import { parseChoiceIndex } from '../../../shared/punctuation/choice-index.js';

export function punctuationSubmitAnswerPayload(data = {}) {
  if (data?.formData?.get) return { typed: data.formData.get('typed') || '' };
  const choiceIndex = parseChoiceIndex(data?.choiceIndex);
  if (choiceIndex != null) return { choiceIndex };
  return { typed: data?.typed || data?.answer || '' };
}

function commandExpectationForState(state = {}) {
  const session = state.subjectUi?.punctuation?.session;
  if (!session || typeof session !== 'object') return {};
  const expectation = {};
  if (typeof session.id === 'string' && session.id) expectation.expectedSessionId = session.id;
  if (typeof session.currentItem?.id === 'string' && session.currentItem.id) {
    expectation.expectedItemId = session.currentItem.id;
  }
  if (Number.isFinite(Number(session.answeredCount))) {
    expectation.expectedAnsweredCount = Number(session.answeredCount);
  }
  if (typeof session.releaseId === 'string' && session.releaseId) {
    expectation.expectedReleaseId = session.releaseId;
  }
  return expectation;
}

function withCommandExpectation(payload = {}, state = {}) {
  return {
    ...payload,
    ...commandExpectationForState(state),
  };
}

export const punctuationSubjectCommandActions = Object.freeze({
  'punctuation-start': {
    command: 'start-session',
    payload({ data, state }) {
      const prefs = state.subjectUi?.punctuation?.prefs || {};
      const payload = {
        mode: data?.mode || prefs.mode || 'smart',
        roundLength: data?.roundLength || prefs.roundLength || '4',
      };
      const skillId = data?.skillId || data?.guidedSkillId;
      if (skillId) payload.skillId = skillId;
      return payload;
    },
  },
  'punctuation-start-again': {
    command: 'start-session',
    payload({ state }) {
      const prefs = state.subjectUi?.punctuation?.prefs || {};
      return {
        mode: prefs.mode || 'smart',
        roundLength: prefs.roundLength || '4',
      };
    },
  },
  'punctuation-submit-form': {
    command: 'submit-answer',
    payload({ data, state }) {
      return withCommandExpectation(punctuationSubmitAnswerPayload(data), state);
    },
  },
  'punctuation-continue': { command: 'continue-session' },
  'punctuation-skip': {
    command: 'skip-item',
    payload({ state }) {
      return withCommandExpectation({}, state);
    },
  },
  'punctuation-end-early': {
    command: 'end-session',
    payload({ state }) {
      return withCommandExpectation({}, state);
    },
  },
  // Retained for a future Parent/Admin surface (origin R34) — NOT dispatched
  // by any child scene post-Phase-3. The Worker command still exists at
  // `worker/src/subjects/punctuation/commands.js` (`request-context-pack`) and
  // the AI enrichment pipeline in `worker/src/subjects/punctuation/ai-enrichment.js`
  // continues to work. Child-scope read-models intentionally omit the resulting
  // `contextPack` summary — see `worker/src/subjects/punctuation/read-models.js`
  // and the belt-and-braces strip in `client-read-models.js`.
  'punctuation-context-pack': {
    mutates: false,
    command: 'request-context-pack',
    payload({ data }) {
      return {
        seed: data?.seed || '',
      };
    },
  },
  'punctuation-set-mode': {
    command: 'save-prefs',
    payload({ data }) {
      return { prefs: { mode: data?.value || data?.mode || 'smart' } };
    },
  },
});
