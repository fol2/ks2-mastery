import { MONSTERS, stageFor, levelFor } from '../monsters.js';
import {
  branchForMonster,
  ensureMonsterBranches,
  eventFromTransition,
  isPlainObject,
  masteredList,
  READING_MONSTER_IDS,
  saveMonsterState,
} from './shared.js';

export const READING_REWARD_RELEASE_ID = 'reading-poc-promoted-2026-05-05';
export const READING_GRAND_MONSTER_ID = 'lorequill';

export const READING_SKILL_TO_MONSTER = Object.freeze({
  '2a': 'readbloom',
  '2g': 'readbloom',
  '2b': 'readrill',
  '2c': 'readrill',
  '2d': 'inferane',
  '2e': 'inferane',
  '2f': 'structurillon',
  '2h': 'structurillon',
});

const READING_CORE_SKILL_IDS = Object.freeze(Object.keys(READING_SKILL_TO_MONSTER));
const READING_DIRECT_STAR_THRESHOLDS = Object.freeze([1, 25, 50, 75, 100]);
const READING_GRAND_STAR_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);

const READING_MONSTER_SKILL_TOTALS = Object.freeze(
  READING_CORE_SKILL_IDS.reduce((totals, skillId) => {
    const monsterId = READING_SKILL_TO_MONSTER[skillId];
    totals[monsterId] = (totals[monsterId] || 0) + 1;
    return totals;
  }, { [READING_GRAND_MONSTER_ID]: READING_CORE_SKILL_IDS.length }),
);

export function readingMasteryKey(skillId, releaseId = READING_REWARD_RELEASE_ID) {
  return `${releaseId}:reading-skill:${skillId}`;
}

export function monsterIdForReadingSkill(skillId) {
  return READING_SKILL_TO_MONSTER[skillId] || null;
}

function readingMonsterTotal(monsterId) {
  return READING_MONSTER_SKILL_TOTALS[monsterId] || MONSTERS[monsterId]?.masteredMax || 1;
}

function readingDisplayStars(mastered, total) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeMastered = Math.max(0, Math.min(safeTotal, Number(mastered) || 0));
  return Math.min(100, Math.round((safeMastered / safeTotal) * 100));
}

function thresholdsForReadingMonster(monsterId) {
  return monsterId === READING_GRAND_MONSTER_ID
    ? READING_GRAND_STAR_THRESHOLDS
    : READING_DIRECT_STAR_THRESHOLDS;
}

function progressForReadingMonsterFromState(state, monsterId) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = masteredList(entry).length;
  const masteredMax = readingMonsterTotal(monsterId);
  const displayStars = readingDisplayStars(mastered, masteredMax);
  const stage = stageFor(displayStars, thresholdsForReadingMonster(monsterId));
  return {
    mastered,
    masteredMax,
    displayStars,
    starMax: 100,
    stage,
    displayStage: stage,
    level: levelFor(displayStars),
    caught: mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: masteredList(entry),
  };
}

export function progressForReadingMonster(state, monsterId) {
  return progressForReadingMonsterFromState(state, monsterId);
}

export function activeReadingMonsterSummaryFromState(state = {}) {
  return READING_MONSTER_IDS
    .map((monsterId) => ({
      subjectId: 'reading',
      monster: MONSTERS[monsterId],
      progress: progressForReadingMonsterFromState(state, monsterId),
    }))
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function recordReadingSkillMastery({
  learnerId,
  skillId,
  releaseId = READING_REWARD_RELEASE_ID,
  masteryKey = readingMasteryKey(skillId, releaseId),
  gameStateRepository,
  random = Math.random,
} = {}) {
  const directMonsterId = monsterIdForReadingSkill(skillId);
  if (!directMonsterId || !masteryKey || !MONSTERS[directMonsterId]) return [];

  let workingState = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: READING_MONSTER_IDS,
  });
  const rewardEvents = [];

  for (const monsterId of [directMonsterId, READING_GRAND_MONSTER_ID]) {
    if (!MONSTERS[monsterId]) continue;
    const previousProgress = progressForReadingMonsterFromState(workingState, monsterId);
    const entry = isPlainObject(workingState[monsterId]) ? workingState[monsterId] : { mastered: [], caught: false };
    const mastered = masteredList(entry);
    if (mastered.includes(masteryKey)) continue;
    const afterState = {
      ...workingState,
      [monsterId]: {
        ...entry,
        caught: true,
        releaseId,
        mastered: [...mastered, masteryKey],
      },
    };
    const nextProgress = progressForReadingMonsterFromState(afterState, monsterId);
    workingState = afterState;
    const event = eventFromTransition(learnerId, monsterId, previousProgress, nextProgress);
    if (event) rewardEvents.push({ ...event, subjectId: 'reading' });
  }

  if (rewardEvents.length) saveMonsterState(learnerId, workingState, gameStateRepository);
  return rewardEvents;
}
