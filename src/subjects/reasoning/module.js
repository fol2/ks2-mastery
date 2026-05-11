import { createReadySubjectVisualAdapter } from '../../platform/ui/subject-visual-adapter.js';
import { createInitialReasoningState, REASONING_SUBJECT_ID } from './metadata.js';
import { normaliseReasoningReadModel } from './client-read-models.js';

export const reasoningModule = {
  id: REASONING_SUBJECT_ID,
  name: 'Reasoning',
  blurb: 'Plan multi-step maths, choose the structure, work accurately and check reasonableness.',
  accent: '#8A5A9D',
  accentSoft: '#E6D9ED',
  accentTint: '#F1E9F4',
  icon: 'brain',
  available: true,
  reactPractice: true,
  visualAdapter: createReadySubjectVisualAdapter('reasoning', {
    setup: { component: 'ReasoningSetupScene', primaryAction: 'reasoning-start' },
    sessionHud: { component: 'SessionHUD', adapter: 'ReasoningSessionScene' },
    companionPanel: { component: 'SubjectCompanionPanel', dataSource: 'activeMonsters+stats' },
    practiceStage: { component: 'PracticeStage', adopted: true },
    summaryFrame: { component: 'SessionSummaryFrame', adapter: 'ReasoningSummaryFrameAdapter' },
  }),
  initState() {
    return createInitialReasoningState();
  },
  sanitiseUiOnRehydrate(entry) {
    return normaliseReasoningReadModel({
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
      streak: Number(stats.evidenceStars) || 0,
      nextUp: stats.weak ? 'Fix Reasoning weak spots' : stats.due ? 'Reasoning review due' : 'Smart Reasoning review',
    };
  },
  handleAction(action, context) {
    if (action === 'reasoning-back') {
      context.store.updateSubjectUi('reasoning', { phase: 'setup', session: null, feedback: null, summary: null, error: '' });
      return true;
    }
    return false;
  },
};
