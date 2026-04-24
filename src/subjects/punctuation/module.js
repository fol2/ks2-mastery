import { createInitialPunctuationState } from './service-contract.js';
import { SUBJECT_EXPOSURE_GATES } from '../../platform/core/subject-availability.js';

function applyTransition(context, transition) {
  if (!transition) return true;
  if (typeof context.applySubjectTransition === 'function') {
    return context.applySubjectTransition('punctuation', transition);
  }
  context.store.updateSubjectUi('punctuation', transition.state);
  return true;
}

function currentUi(context, learnerId) {
  return context.service?.initState?.(context.appState.subjectUi?.punctuation, learnerId)
    || context.appState.subjectUi?.punctuation
    || createInitialPunctuationState();
}

export const punctuationModule = {
  id: 'punctuation',
  name: 'Punctuation',
  blurb: 'Practise sentence endings, apostrophes and speech marks.',
  accent: '#B8873F',
  accentSoft: '#F0E1C4',
  accentTint: '#F7EEDC',
  icon: 'quote',
  available: true,
  exposureGate: SUBJECT_EXPOSURE_GATES.punctuation,
  reactPractice: true,
  initState() {
    return createInitialPunctuationState();
  },
  getDashboardStats(appState, { service }) {
    const learnerId = appState.learners.selectedId;
    const stats = service?.getStats?.(learnerId) || {};
    return {
      pct: stats.publishedRewardUnits ? Math.round(((stats.securedRewardUnits || 0) / stats.publishedRewardUnits) * 100) : 0,
      due: stats.due || 0,
      streak: stats.securedRewardUnits || 0,
      nextUp: stats.weak ? 'Repair weak punctuation' : stats.due ? 'Due review' : 'Endmarks, Apostrophe and Speech',
    };
  },
  handleAction(action, context) {
    const { appState, data, service, store } = context;
    const learnerId = appState.learners.selectedId;
    if (!learnerId || !service) return false;
    const ui = currentUi(context, learnerId);

    if (action === 'punctuation-set-mode') {
      service.savePrefs(learnerId, { mode: data.value });
      store.updateSubjectUi('punctuation', { phase: 'setup', error: '' });
      return true;
    }

    if (action === 'punctuation-start' || action === 'punctuation-start-again') {
      const prefs = service.getPrefs(learnerId);
      return applyTransition(context, service.startSession(learnerId, {
        ...prefs,
        ...(data?.mode ? { mode: data.mode } : {}),
        ...(data?.roundLength ? { roundLength: data.roundLength } : {}),
      }));
    }

    if (action === 'punctuation-submit-form') {
      return applyTransition(context, service.submitAnswer(learnerId, ui, data || {}));
    }

    if (action === 'punctuation-continue') {
      return applyTransition(context, service.continueSession(learnerId, ui));
    }

    if (action === 'punctuation-skip') {
      return applyTransition(context, service.skipItem(learnerId, ui));
    }

    if (action === 'punctuation-end-early') {
      return applyTransition(context, service.endSession(learnerId, ui));
    }

    if (action === 'punctuation-back') {
      store.updateSubjectUi('punctuation', { phase: 'setup', error: '' });
      return true;
    }

    return false;
  },
};
