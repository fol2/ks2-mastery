import {
  ARITHMETIC_CONTENT_RELEASE_ID,
  ARITHMETIC_GOAL_OPTIONS,
  ARITHMETIC_MODE_OPTIONS,
  ARITHMETIC_SKILLS,
  ARITHMETIC_STRANDS,
  ARITHMETIC_TEST_FORMS,
} from '../../../shared/arithmetic/metadata.js';

export const ARITHMETIC_SUBJECT_ID = 'arithmetic';
export { ARITHMETIC_CONTENT_RELEASE_ID };

export const ARITHMETIC_SKILL_OPTIONS = Object.freeze([
  Object.freeze({ id: '', label: 'Mixed arithmetic' }),
  ...Object.entries(ARITHMETIC_SKILLS).map(([id, skill]) => Object.freeze({ id, label: skill.name, strand: skill.strand })),
]);

export { ARITHMETIC_MODE_OPTIONS, ARITHMETIC_GOAL_OPTIONS, ARITHMETIC_TEST_FORMS, ARITHMETIC_SKILLS, ARITHMETIC_STRANDS };

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function arithmeticContentSummary() {
  return {
    subjectId: ARITHMETIC_SUBJECT_ID,
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    templateCount: 30,
    skillCount: Object.keys(ARITHMETIC_SKILLS).length,
    rewardUnitCount: 90,
    strands: clone(ARITHMETIC_STRANDS),
    skills: clone(ARITHMETIC_SKILLS),
    strandTotals: {
      facts_place_value: 12,
      operations_methods: 39,
      decimals_fractions: 30,
      percentages_mixed: 9,
    },
  };
}

export function normaliseArithmeticPrefs(raw = {}) {
  const mode = ARITHMETIC_MODE_OPTIONS.some((option) => option.id === raw.mode) ? raw.mode : 'smart';
  const focusSkillId = ARITHMETIC_SKILLS[raw.focusSkillId] ? raw.focusSkillId : '';
  const goal = ARITHMETIC_GOAL_OPTIONS.some((option) => option.id === raw.goal) ? raw.goal : '10q';
  const testForm = ARITHMETIC_TEST_FORMS.some((option) => option.id === raw.testForm) ? raw.testForm : 'short';
  return { mode, focusSkillId, goal, testForm };
}

export function createInitialArithmeticState() {
  return {
    version: 1,
    subjectId: ARITHMETIC_SUBJECT_ID,
    learnerId: '',
    releaseId: ARITHMETIC_CONTENT_RELEASE_ID,
    phase: 'setup',
    prefs: normaliseArithmeticPrefs(),
    pendingCommand: '',
    error: '',
    session: null,
    feedback: null,
    summary: null,
    stats: { overview: { totalQuestions: 0, accuracy: 0, due: 0, weak: 0, securedSkills: 0, streakDays: 0, securedRewardUnits: 0 }, skills: [] },
    analytics: { skills: [], strands: [], misconceptions: [], recentAttempts: [] },
    content: arithmeticContentSummary(),
    parentSummary: 'Arithmetic is ready. Start with Smart Review to build a baseline.',
  };
}
