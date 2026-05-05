import { createReadySubjectVisualAdapter } from '../../platform/ui/subject-visual-adapter.js';
import { createInitialReadingState, READING_SUBJECT_ID } from './metadata.js';
import { normaliseReadingReadModel } from './client-read-models.js';

export const readingModule = {
  id: READING_SUBJECT_ID,
  name: 'Reading',
  blurb: 'Read original KS2 passages, answer from evidence, and strengthen retrieval, vocabulary, inference, summary, structure and comparison.',
  accent: '#2563EB',
  accentSoft: '#DBEAFE',
  accentTint: '#EFF6FF',
  icon: 'book',
  available: true,
  reactPractice: true,
  visualAdapter: createReadySubjectVisualAdapter('reading', {
    setup: { component: 'ReadingSetupScene', primaryAction: 'reading-start' },
    sessionHud: { component: 'SessionHUD', adapter: 'ReadingSessionScene' },
    companionPanel: { component: 'SubjectCompanionPanel', dataSource: 'activeMonsters+stats' },
    practiceStage: { component: 'PracticeStage', adopted: true },
    summaryFrame: { component: 'SessionSummaryFrame', adapter: 'ReadingSummaryFrameAdapter' },
  }),
  initState() {
    return createInitialReadingState();
  },
  sanitiseUiOnRehydrate(entry) {
    return normaliseReadingReadModel({
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
      streak: Number(stats.securedSkills) || 0,
      nextUp: stats.weak ? 'Fix Reading weak spots' : stats.due ? 'Reading review due' : 'Smart Reading review',
    };
  },
  handleAction(action, context) {
    if (action === 'reading-back') {
      context.store.updateSubjectUi('reading', { phase: 'setup', session: null, feedback: null, summary: null, error: '' });
      return true;
    }
    return false;
  },
};
