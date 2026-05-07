import { MONSTERS, stageFor, levelFor } from '../monsters.js';
import {
  branchForMonster,
  ensureMonsterBranches,
  eventFromTransition,
  isPlainObject,
  masteredList,
  releaseIdForEntry,
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
export const READING_DIRECT_STAR_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);
export const READING_GRAND_STAR_THRESHOLDS = Object.freeze([1, 10, 25, 50, 100]);

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

function safeStarHighWater(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n + 1e-9) : 0;
}

function readingMasteredList(entry, releaseId = READING_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  const scopedReleaseId = releaseIdForEntry(entry, releaseId) || READING_REWARD_RELEASE_ID;
  const releasePrefix = `${scopedReleaseId}:reading-skill:`;
  return mastered.filter((key) => key.startsWith(releasePrefix));
}

function readingMasteredCount(entry, releaseId = READING_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  if (mastered.length) return readingMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function thresholdsForReadingMonster(monsterId) {
  return monsterId === READING_GRAND_MONSTER_ID
    ? READING_GRAND_STAR_THRESHOLDS
    : READING_DIRECT_STAR_THRESHOLDS;
}

function progressForReadingMonsterFromState(state, monsterId) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const releaseId = releaseIdForEntry(entry, READING_REWARD_RELEASE_ID) || READING_REWARD_RELEASE_ID;
  const mastered = readingMasteredCount(entry, releaseId);
  const masteredMax = readingMonsterTotal(monsterId);
  const computedStars = readingDisplayStars(mastered, masteredMax);
  const starHighWater = Math.max(safeStarHighWater(entry.starHighWater), computedStars);
  const displayStars = Math.min(100, starHighWater);
  const stage = stageFor(displayStars, thresholdsForReadingMonster(monsterId));
  return {
    mastered,
    masteredMax,
    computedStars,
    displayStars,
    stars: displayStars,
    starMax: 100,
    ...(monsterId === READING_GRAND_MONSTER_ID ? { grandStars: displayStars, grandStarMax: 100 } : {}),
    stage,
    displayStage: stage,
    level: levelFor(displayStars),
    caught: entry.caught === true || mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: readingMasteredList(entry, releaseId),
    starHighWater,
    releaseId,
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
    const masteredMax = readingMonsterTotal(monsterId);
    const nextMastered = [...mastered, masteryKey];
    const computedStars = readingDisplayStars(
      readingMasteredCount({ ...entry, releaseId, mastered: nextMastered }, releaseId),
      masteredMax,
    );
    const starHighWater = Math.min(100, Math.max(safeStarHighWater(entry.starHighWater), computedStars));
    const afterState = {
      ...workingState,
      [monsterId]: {
        ...entry,
        caught: true,
        releaseId,
        mastered: nextMastered,
        starHighWater,
        displayStars: starHighWater,
        starMax: 100,
        ...(monsterId === READING_GRAND_MONSTER_ID ? { grandStars: starHighWater, grandStarMax: 100 } : {}),
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
