import { createReadySubjectVisualAdapter } from '../../platform/ui/subject-visual-adapter.js';
import { SUBJECT_EXPOSURE_GATES } from '../../platform/core/subject-availability.js';
import { createInitialArithmeticState, ARITHMETIC_SUBJECT_ID } from './metadata.js';
import { normaliseArithmeticReadModel } from './client-read-models.js';

function applyTransition(context, transition) {
  if (!transition) return true;
  return context.applySubjectTransition(ARITHMETIC_SUBJECT_ID, transition);
}

function currentUi(context, learnerId) {
  return context.service?.initState?.(
    context.appState.subjectUi?.[ARITHMETIC_SUBJECT_ID],
    learnerId,
  ) || createInitialArithmeticState();
}

export const arithmeticModule = {
  id: ARITHMETIC_SUBJECT_ID,
  name: 'Arithmetic',
  blurb: 'Build KS2 arithmetic fluency through mixed retrieval, written methods, exact marking, SATs-style practice and spaced review.',
  accent: '#C06B3E',
  accentSoft: '#FBEEE4',
  accentTint: '#FFF7ED',
  icon: 'calculator',
  available: true,
  exposureGate: SUBJECT_EXPOSURE_GATES.arithmetic,
  reactPractice: true,
  visualAdapter: createReadySubjectVisualAdapter('arithmetic', {
    setup: { component: 'ArithmeticSetupScene', primaryAction: 'arithmetic-start' },
    sessionHud: { component: 'SessionHUD', adapter: 'ArithmeticSessionScene' },
    companionPanel: { component: 'SubjectCompanionPanel', dataSource: 'activeMonsters+stats' },
    practiceStage: { component: 'PracticeStage', adopted: true },
    summaryFrame: { component: 'SessionSummaryFrame', adapter: 'ArithmeticSummaryFrameAdapter' },
  }),
  initState() {
    return createInitialArithmeticState();
  },
  sanitiseUiOnRehydrate(entry) {
    return normaliseArithmeticReadModel({
      ...entry,
      pendingCommand: '',
      error: entry?.error || '',
    }, entry?.learnerId || '');
  },
  getDashboardStats(appState, { service } = {}) {
    const learnerId = appState?.learners?.selectedId || '';
    const stats = service?.getStats?.(learnerId) || {};
    return {
      pct: Number(stats.accuracy) || 0,
      due: Number(stats.due) || 0,
      streak: Number(stats.securedRewardUnits) || Number(stats.securedSkills) || 0,
      nextUp: stats.weak ? 'Fix Arithmetic weak spots' : stats.due ? 'Arithmetic review due' : 'Smart Arithmetic review',
    };
  },
  handleAction(action, context) {
    const learnerId = context.appState.learners.selectedId;
    const service = context.service;
    if (!learnerId || !service) return false;
    const ui = currentUi(context, learnerId);

    if (action === 'arithmetic-start') {
      return applyTransition(context, service.startSession(learnerId, context.data || {}));
    }

    if (action === 'arithmetic-submit-form') {
      const formData = context.data?.formData;
      return applyTransition(context, service.submitAnswer(learnerId, ui, {
        answer: formData?.get?.('answer') ?? context.data?.answer ?? '',
      }));
    }

    if (action === 'arithmetic-continue') {
      return applyTransition(context, service.continueSession(learnerId, ui));
    }

    if (action === 'arithmetic-end') {
      return applyTransition(context, service.endSession(learnerId, ui));
    }

    if (action === 'arithmetic-back') {
      return applyTransition(context, service.endSession(learnerId, ui));
    }
    return false;
  },
};
