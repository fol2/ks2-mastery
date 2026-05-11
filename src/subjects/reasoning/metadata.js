import {
  REASONING_CONTENT_RELEASE_ID,
  REASONING_MODES,
  REASONING_QUESTION_TYPE_LABELS,
  REASONING_SKILLS,
  reasoningContentSummary,
} from '../../../shared/reasoning/metadata.js';

export const REASONING_SUBJECT_ID = 'reasoning';
export const REASONING_CURRENT_RELEASE_ID = REASONING_CONTENT_RELEASE_ID;

export const REASONING_MODE_OPTIONS = Object.freeze([
  { id: 'smart', label: 'Smart Review', description: 'Adaptive mixed review across due, weak and under-practised reasoning structures.' },
  { id: 'skill', label: 'Skill Practice', description: 'Focus on one selected KS2 reasoning domain while still varying question families.' },
  { id: 'trouble', label: 'Trouble Drill', description: 'Recent misses, weak skills and shaky templates first.' },
  { id: 'worked', label: 'Worked Examples', description: 'Use a modelled structure first, then solve a close sibling problem.' },
  { id: 'faded', label: 'Faded Guidance', description: 'Partly worked support after the learner has seen the structure.' },
  { id: 'sats', label: 'SATs Single', description: 'One strict SATs-style reasoning item with no early hints.' },
  { id: 'satsset', label: 'SATs Mini-Set', description: 'A mixed timed set across number, calculation, fractions, measure, geometry, statistics and checking.' },
]);

export const REASONING_PRIMARY_MODE_IDS = Object.freeze(['smart', 'trouble', 'satsset']);

export const REASONING_SKILL_OPTIONS = Object.freeze([
  { id: '', label: 'Mixed' },
  ...Object.entries(REASONING_SKILLS).map(([id, skill]) => ({ id, label: skill.name, domain: skill.domain })),
]);

export const REASONING_SET_SIZE_OPTIONS = Object.freeze([
  { id: '8', label: '8 questions' },
  { id: '12', label: '12 questions' },
]);

export const REASONING_ROUND_LENGTH_OPTIONS = Object.freeze([
  { id: '3', label: '3 questions' },
  { id: '6', label: '6 questions' },
  { id: '9', label: '9 questions' },
  { id: '12', label: '12 questions' },
]);

export function defaultReasoningPrefs() {
  return { mode: 'smart', focusSkillId: '', roundLength: 6, setSize: 8, viewMode: 'one' };
}

export function normaliseReasoningPrefs(raw = {}) {
  const mode = REASONING_MODES.includes(raw.mode) ? raw.mode : 'smart';
  const focusSkillId = Object.prototype.hasOwnProperty.call(REASONING_SKILLS, raw.focusSkillId || raw.skillId)
    ? (raw.focusSkillId || raw.skillId)
    : '';
  const roundLength = [3, 6, 9, 12].includes(Number(raw.roundLength)) ? Number(raw.roundLength) : 6;
  const setSize = [8, 12].includes(Number(raw.setSize)) ? Number(raw.setSize) : 8;
  const viewMode = raw.viewMode === 'list' ? 'list' : 'one';
  return { ...defaultReasoningPrefs(), mode, focusSkillId, roundLength, setSize, viewMode };
}

export function createInitialReasoningState() {
  return {
    subjectId: REASONING_SUBJECT_ID,
    version: 1,
    learnerId: '',
    releaseId: REASONING_CURRENT_RELEASE_ID,
    phase: 'setup',
    prefs: defaultReasoningPrefs(),
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
        evidenceStars: 0,
        content: reasoningContentSummary(),
      },
      skills: [],
    },
    analytics: {
      available: true,
      skills: [],
      templates: [],
      misconceptionPatterns: [],
      recentActivity: [],
      reviewQueue: [],
    },
    content: reasoningContentSummary(),
    parentSummary: 'No Reasoning practice has been logged yet.',
    pendingCommand: '',
    error: '',
  };
}

export function questionTypeLabel(type) {
  return REASONING_QUESTION_TYPE_LABELS[type] || type || 'Question';
}
