import { WORDS as DEFAULT_SPELLING_WORDS } from '../../subjects/spelling/data/word-data.js';

export const LOCAL_CODEX_REVIEW_LEARNER_ID = 'local-codex-egg-review';
export const LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS = Object.freeze({
  1: 'local-codex-stage-1-review',
  2: 'local-codex-stage-2-review',
  3: 'local-codex-stage-3-review',
  4: 'local-codex-stage-4-review',
});

const REVIEW_PROFILE_COUNTS = Object.freeze({
  0: { inklet: 2, glimmerbug: 1 },
  1: { inklet: 13, glimmerbug: 13 },
  2: { inklet: 48, glimmerbug: 48 },
  3: { inklet: 73, glimmerbug: 73 },
  4: { inklet: 109, glimmerbug: 104 },
});

const REVIEW_PROFILES = Object.freeze([
  {
    id: LOCAL_CODEX_REVIEW_LEARNER_ID,
    name: 'Codex All Eggs',
    avatarColor: '#D08A2C',
    stage: 0,
  },
  {
    id: LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[1],
    name: 'Codex All Stage 1',
    avatarColor: '#3E6FA8',
    stage: 1,
  },
  {
    id: LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[2],
    name: 'Codex All Stage 2',
    avatarColor: '#B43CD9',
    stage: 2,
  },
  {
    id: LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3],
    name: 'Codex All Stage 3',
    avatarColor: '#4E8C54',
    stage: 3,
  },
  {
    id: LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[4],
    name: 'Codex All Stage 4',
    avatarColor: '#C7552D',
    stage: 4,
  },
]);

export const LOCAL_CODEX_REVIEW_LEARNER_IDS = Object.freeze(REVIEW_PROFILES.map((profile) => profile.id));

const SPELLING_SLUGS_BY_MONSTER = Object.freeze({
  inklet: Object.freeze(DEFAULT_SPELLING_WORDS.filter((word) => word.year === '3-4').map((word) => word.slug)),
  glimmerbug: Object.freeze(DEFAULT_SPELLING_WORDS.filter((word) => word.year === '5-6').map((word) => word.slug)),
});

function secureProgressEntry() {
  return {
    stage: 4,
    attempts: 4,
    correct: 4,
    wrong: 0,
    dueDay: Number.MAX_SAFE_INTEGER,
    lastDay: 0,
    lastResult: 'correct',
  };
}

function slugsForMonster(monsterId, stage) {
  const count = REVIEW_PROFILE_COUNTS[stage]?.[monsterId] || 0;
  return SPELLING_SLUGS_BY_MONSTER[monsterId].slice(0, count);
}

function buildReviewProgress(profile) {
  const slugs = [
    ...slugsForMonster('inklet', profile.stage),
    ...slugsForMonster('glimmerbug', profile.stage),
  ];
  return Object.fromEntries(slugs.map((slug) => [slug, secureProgressEntry()]));
}

function buildMonsterCodexState(profile) {
  return {
    inklet: {
      caught: true,
      branch: 'b1',
      mastered: slugsForMonster('inklet', profile.stage),
    },
    glimmerbug: {
      caught: true,
      branch: 'b2',
      mastered: slugsForMonster('glimmerbug', profile.stage),
    },
    phaeton: { branch: 'b1' },
    vellhorn: {
      caught: false,
      branch: 'b2',
      mastered: [],
    },
  };
}

function buildReviewLearner(profile, now = Date.now) {
  const createdAt = typeof now === 'function' ? Number(now()) : Date.now();
  return {
    id: profile.id,
    name: profile.name,
    yearGroup: 'Y5',
    avatarColor: profile.avatarColor,
    goal: 'confidence',
    dailyMinutes: 15,
    weakSubjects: ['spelling'],
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

function appendMissingIds(allIds, reviewIds) {
  const output = Array.isArray(allIds) ? [...allIds] : [];
  for (const id of reviewIds) {
    if (!output.includes(id)) output.push(id);
  }
  return output;
}

function normaliseReviewLearnerId(value) {
  return LOCAL_CODEX_REVIEW_LEARNER_IDS.includes(value) ? value : '';
}

export function ensureLocalCodexReviewProfile(
  repositories,
  { now = Date.now, select = false, selectLearnerId = '' } = {},
) {
  if (!repositories?.learners || !repositories?.subjectStates || !repositories?.gameState) return false;

  const learners = repositories.learners.read();
  const hasReviewLearner = Boolean(learners.byId?.[LOCAL_CODEX_REVIEW_LEARNER_ID]);
  const createdAnyReviewLearner = REVIEW_PROFILES.some((profile) => !learners.byId?.[profile.id]);
  const nextById = { ...(learners.byId || {}) };
  for (const profile of REVIEW_PROFILES) {
    nextById[profile.id] = buildReviewLearner(profile, now);
  }
  const nextAllIds = appendMissingIds(learners.allIds, LOCAL_CODEX_REVIEW_LEARNER_IDS);
  const requestedLearnerId = normaliseReviewLearnerId(selectLearnerId)
    || (select ? LOCAL_CODEX_REVIEW_LEARNER_ID : '');
  const hasValidSelectedLearner = Boolean(learners.selectedId && nextById[learners.selectedId]);

  repositories.learners.write({
    byId: nextById,
    allIds: nextAllIds,
    selectedId: requestedLearnerId
      || (!hasReviewLearner || !hasValidSelectedLearner ? LOCAL_CODEX_REVIEW_LEARNER_ID : learners.selectedId),
  });

  for (const profile of REVIEW_PROFILES) {
    repositories.subjectStates.writeData(profile.id, 'spelling', {
      prefs: { mode: 'smart', yearFilter: 'all', roundLength: '3' },
      progress: buildReviewProgress(profile),
    });
    repositories.gameState.write(profile.id, 'monster-codex', buildMonsterCodexState(profile));
  }

  return createdAnyReviewLearner;
}
