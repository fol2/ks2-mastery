import { parseChoiceIndex } from '../../../shared/punctuation/choice-index.js';

export function punctuationSubmitAnswerPayload(data = {}) {
  if (data?.formData?.get) return { typed: data.formData.get('typed') || '' };
  const choiceIndex = parseChoiceIndex(data?.choiceIndex);
  if (choiceIndex != null) return { choiceIndex };
  return { typed: data?.typed || data?.answer || '' };
}

export const punctuationSubjectCommandActions = Object.freeze({
  'punctuation-start': {
    command: 'start-session',
    payload({ data, state }) {
      const prefs = state.subjectUi?.punctuation?.prefs || {};
      return {
        mode: data?.mode || prefs.mode || 'smart',
        roundLength: data?.roundLength || prefs.roundLength || '4',
      };
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
    payload({ data }) {
      return punctuationSubmitAnswerPayload(data);
    },
  },
  'punctuation-continue': { command: 'continue-session' },
  'punctuation-skip': { command: 'skip-item' },
  'punctuation-end-early': { command: 'end-session' },
  'punctuation-set-mode': {
    command: 'save-prefs',
    payload({ data }) {
      return { prefs: { mode: data?.value || data?.mode || 'smart' } };
    },
  },
});
