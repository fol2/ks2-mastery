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

export function readingMasteryKey(skillId, releaseId = READING_REWARD_RELEASE_ID) {
  return `${releaseId}:reading-skill:${skillId}`;
}

export function monsterIdForReadingSkill(skillId) {
  return READING_SKILL_TO_MONSTER[skillId] || null;
}

function progressForReadingMonsterFromState(state, monsterId) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = masteredList(entry).length;
  return {
    mastered,
    stage: stageFor(mastered, [1, 1, 2, 3, 4]),
    level: levelFor(mastered * 25),
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
  const monsterId = monsterIdForReadingSkill(skillId);
  if (!monsterId || !masteryKey || !MONSTERS[monsterId]) return [];
  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: READING_MONSTER_IDS,
  });
  const entry = isPlainObject(before[monsterId]) ? before[monsterId] : { mastered: [], caught: false };
  const mastered = masteredList(entry);
  if (mastered.includes(masteryKey)) return [];
  const beforeProgress = progressForReadingMonsterFromState(before, monsterId);
  const after = {
    ...before,
    [monsterId]: {
      ...entry,
      caught: true,
      releaseId,
      mastered: [...mastered, masteryKey],
    },
  };
  const afterProgress = progressForReadingMonsterFromState(after, monsterId);
  saveMonsterState(learnerId, after, gameStateRepository);
  const event = eventFromTransition(learnerId, monsterId, beforeProgress, afterProgress);
  return event ? [{ ...event, subjectId: 'reading' }] : [];
}
