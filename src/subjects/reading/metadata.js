import {
  READING_CONTENT_RELEASE_ID,
  READING_GENRES,
  READING_MODES,
  READING_QUESTION_TYPE_LABELS,
  READING_SKILLS,
  readingContentSummary,
} from '../../../shared/reading/metadata.js';

export const READING_SUBJECT_ID = 'reading';
export const READING_CURRENT_RELEASE_ID = READING_CONTENT_RELEASE_ID;
export const READING_MODE_OPTIONS = Object.freeze([
  { id: 'guided', label: 'Guided practice', description: 'Shorter passages, faster feedback and tighter teaching support.' },
  { id: 'core', label: 'Core practice', description: 'Read one full passage, then answer a balanced question set.' },
  { id: 'smart', label: 'Smart review', description: 'Adaptive mix across weak, due and under-practised reading domains.' },
  { id: 'evidence', label: 'Evidence hunt', description: 'Inference and explanation questions that demand exact evidence.' },
  { id: 'vocab', label: 'Vocabulary in context', description: 'Word meanings from sentence and paragraph clues.' },
  { id: 'inference', label: 'Inference lab', description: 'Inference, author choice, comparison and structure practice.' },
  { id: 'punct', label: 'Punctuation lens', description: 'Punctuation only where it supports meaning, voice and phrasing.' },
  { id: 'stamina', label: 'Stamina builder', description: 'Longer texts and delayed feedback for sustained reading.' },
  { id: 'test', label: 'SATs-style paper', description: 'Three original texts with delayed feedback and paper-style timing.' },
]);

export const READING_GENRE_OPTIONS = Object.freeze([
  { id: '', label: 'Mixed' },
  ...READING_GENRES.map((id) => ({ id, label: id === 'non-fiction' ? 'Non-fiction' : id[0].toUpperCase() + id.slice(1) })),
]);

export const READING_DIFFICULTY_OPTIONS = Object.freeze([
  { id: '', label: 'Adaptive' },
  { id: '1', label: '1 easier' },
  { id: '2', label: '2' },
  { id: '3', label: '3' },
  { id: '4', label: '4' },
  { id: '5', label: '5 stretch' },
]);

export const READING_SKILL_OPTIONS = Object.freeze([
  { id: '', label: 'Mixed' },
  ...Object.entries(READING_SKILLS).map(([id, skill]) => ({ id, label: skill.name, domain: skill.domain })),
]);

export function defaultReadingPrefs() {
  return {
    mode: 'smart',
    focusSkillId: '',
    genre: '',
    difficulty: '',
    viewMode: 'one',
    paperId: 'random',
    showParagraphNumbers: true,
  };
}

export function normaliseReadingPrefs(raw = {}) {
  const mode = READING_MODES.includes(raw.mode) ? raw.mode : 'smart';
  const focusSkillId = Object.prototype.hasOwnProperty.call(READING_SKILLS, raw.focusSkillId || raw.skillId)
    ? (raw.focusSkillId || raw.skillId)
    : '';
  const genre = READING_GENRES.includes(raw.genre) ? raw.genre : '';
  const difficulty = ['1', '2', '3', '4', '5'].includes(String(raw.difficulty || '')) ? String(raw.difficulty) : '';
  return {
    ...defaultReadingPrefs(),
    mode,
    focusSkillId,
    genre,
    difficulty,
    viewMode: raw.viewMode === 'list' ? 'list' : 'one',
    paperId: typeof raw.paperId === 'string' && raw.paperId ? raw.paperId : 'random',
    showParagraphNumbers: raw.showParagraphNumbers !== false,
  };
}

export function createInitialReadingState() {
  return {
    subjectId: READING_SUBJECT_ID,
    version: 1,
    learnerId: '',
    releaseId: READING_CURRENT_RELEASE_ID,
    phase: 'setup',
    prefs: defaultReadingPrefs(),
    session: null,
    feedback: null,
    summary: null,
    stats: {
      overview: {
        totalQuestions: 0,
        accuracy: 0,
        independentAccuracy: 0,
        due: 0,
        weak: 0,
        securedSkills: 0,
        streakDays: 0,
        content: readingContentSummary(),
      },
      skills: [],
    },
    analytics: {
      available: true,
      skills: [],
      byGenre: [],
      byType: [],
      misconceptionPatterns: [],
      recentActivity: [],
      reviewQueue: [],
    },
    content: readingContentSummary(),
    parentSummary: 'No Reading practice has been logged yet.',
    pendingCommand: '',
    error: '',
  };
}

export function questionTypeLabel(type) {
  return READING_QUESTION_TYPE_LABELS[type] || type || 'Question';
}
