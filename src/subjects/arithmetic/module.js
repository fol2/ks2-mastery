import { createReadySubjectVisualAdapter } from '../../platform/ui/subject-visual-adapter.js';
import { createInitialArithmeticState, ARITHMETIC_SUBJECT_ID } from './metadata.js';
import { normaliseArithmeticReadModel } from './client-read-models.js';

export const arithmeticModule = {
  id: ARITHMETIC_SUBJECT_ID,
  name: 'Arithmetic',
  blurb: 'Build KS2 arithmetic fluency through mixed retrieval, written methods, exact marking, SATs-style practice and spaced review.',
  accent: '#C06B3E',
  accentSoft: '#FBEEE4',
  accentTint: '#FFF7ED',
  icon: 'calculator',
  available: true,
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
    if (action === 'arithmetic-back') {
      context.store.updateSubjectUi('arithmetic', { phase: 'setup', session: null, feedback: null, summary: null, error: '' });
      return true;
    }
    return false;
  },
};
