import { MONSTERS, stageFor, levelFor } from '../monsters.js';
import {
  branchForMonster,
  ensureMonsterBranches,
  eventFromTransition,
  isPlainObject,
  masteredList,
  releaseIdForEntry,
  REASONING_MONSTER_IDS,
  saveMonsterState,
} from './shared.js';
import { REASONING_CONTENT_RELEASE_ID } from '../../../../shared/reasoning/metadata.js';

export const REASONING_REWARD_RELEASE_ID = REASONING_CONTENT_RELEASE_ID;
export const REASONING_GRAND_MONSTER_ID = 'strategon';

export const REASONING_SKILL_TO_MONSTER = Object.freeze({
  pv_rounding: 'numdrake',
  pv_compare: 'numdrake',
  add_sub_multistep: 'numdrake',
  mul_div_structure: 'numdrake',
  inverse_missing: 'numdrake',

  fractions_quantity: 'fractalon',
  fractions_compare: 'fractalon',
  fdp_equiv: 'fractalon',
  percent_number: 'fractalon',
  ratio_scale: 'fractalon',

  unit_conversion: 'measuron',
  time_elapsed: 'measuron',

  perimeter_area: 'georune',
  geometry_angles: 'georune',
  statistics_reading: 'georune',

  reasonableness: 'proofwyrm',
  error_analysis: 'proofwyrm',
});

const REASONING_CORE_SKILL_IDS = Object.freeze(Object.keys(REASONING_SKILL_TO_MONSTER));
export const REASONING_DIRECT_STAR_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);
export const REASONING_GRAND_STAR_THRESHOLDS = Object.freeze([1, 10, 25, 50, 100]);

function monsterTotal(monsterId) {
  return MONSTERS[monsterId]?.masteredMax || 100;
}

function safeStarHighWater(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n + 1e-9) : 0;
}

function reasoningDisplayStars(mastered, total = 100) {
  const safeTotal = Math.max(1, Number(total) || 100);
  const safeMastered = Math.max(0, Math.min(safeTotal, Number(mastered) || 0));
  return Math.min(100, Math.round((safeMastered / safeTotal) * 100));
}

function reasoningReleasePrefix(releaseId = REASONING_REWARD_RELEASE_ID) {
  return `${releaseId}:reasoning-evidence:`;
}

export function reasoningMasteryKey({ skillId = '', releaseId = REASONING_REWARD_RELEASE_ID, itemId = '' } = {}) {
  const safeSkill = String(skillId || 'mixed').trim() || 'mixed';
  const safeItem = String(itemId || 'evidence').trim() || 'evidence';
  return `${releaseId}:reasoning-evidence:${safeSkill}:${safeItem}`;
}

export function monsterIdForReasoningSkill(skillId) {
  return REASONING_SKILL_TO_MONSTER[skillId] || null;
}

function reasoningMasteredList(entry, releaseId = REASONING_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  const scopedReleaseId = releaseIdForEntry(entry, releaseId) || REASONING_REWARD_RELEASE_ID;
  const prefix = reasoningReleasePrefix(scopedReleaseId);
  return mastered.filter((key) => key.startsWith(prefix));
}

function reasoningMasteredCount(entry, releaseId = REASONING_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  if (mastered.length) return reasoningMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function thresholdsForReasoningMonster(monsterId) {
  return monsterId === REASONING_GRAND_MONSTER_ID
    ? REASONING_GRAND_STAR_THRESHOLDS
    : REASONING_DIRECT_STAR_THRESHOLDS;
}

function progressForReasoningMonsterFromState(state, monsterId) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const releaseId = releaseIdForEntry(entry, REASONING_REWARD_RELEASE_ID) || REASONING_REWARD_RELEASE_ID;
  const mastered = reasoningMasteredCount(entry, releaseId);
  const masteredMax = monsterTotal(monsterId);
  const computedStars = reasoningDisplayStars(mastered, masteredMax);
  const starHighWater = Math.max(safeStarHighWater(entry.starHighWater), computedStars);
  const displayStars = Math.min(100, starHighWater);
  const stage = stageFor(displayStars, thresholdsForReasoningMonster(monsterId));
  return {
    mastered,
    masteredMax,
    computedStars,
    displayStars,
    stars: displayStars,
    starMax: 100,
    ...(monsterId === REASONING_GRAND_MONSTER_ID ? { grandStars: displayStars, grandStarMax: 100 } : {}),
    stage,
    displayStage: stage,
    level: levelFor(displayStars),
    caught: entry.caught === true || mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: reasoningMasteredList(entry, releaseId),
    starHighWater,
    releaseId,
  };
}

export function progressForReasoningMonster(state, monsterId) {
  return progressForReasoningMonsterFromState(state, monsterId);
}

export function activeReasoningMonsterSummaryFromState(state = {}) {
  return REASONING_MONSTER_IDS
    .map((monsterId) => ({
      subjectId: 'reasoning',
      monster: MONSTERS[monsterId],
      progress: progressForReasoningMonsterFromState(state, monsterId),
    }))
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function recordReasoningEvidenceMastery({
  learnerId,
  skillId,
  releaseId = REASONING_REWARD_RELEASE_ID,
  masteryKey = reasoningMasteryKey({ skillId, releaseId }),
  gameStateRepository,
  random = Math.random,
} = {}) {
  const directMonsterId = monsterIdForReasoningSkill(skillId);
  if (!directMonsterId || !masteryKey || !MONSTERS[directMonsterId]) return [];

  let workingState = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: REASONING_MONSTER_IDS,
  });
  const rewardEvents = [];

  for (const monsterId of [directMonsterId, REASONING_GRAND_MONSTER_ID]) {
    if (!MONSTERS[monsterId]) continue;
    const previousProgress = progressForReasoningMonsterFromState(workingState, monsterId);
    const entry = isPlainObject(workingState[monsterId]) ? workingState[monsterId] : { mastered: [], caught: false };
    const mastered = masteredList(entry);
    if (mastered.includes(masteryKey)) continue;
    const masteredMax = monsterTotal(monsterId);
    const nextMastered = [...mastered, masteryKey].slice(-masteredMax);
    const computedStars = reasoningDisplayStars(
      reasoningMasteredCount({ ...entry, releaseId, mastered: nextMastered }, releaseId),
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
        ...(monsterId === REASONING_GRAND_MONSTER_ID ? { grandStars: starHighWater, grandStarMax: 100 } : {}),
      },
    };
    const nextProgress = progressForReasoningMonsterFromState(afterState, monsterId);
    workingState = afterState;
    const event = eventFromTransition(learnerId, monsterId, previousProgress, nextProgress);
    if (event) rewardEvents.push({ ...event, subjectId: 'reasoning' });
  }

  if (rewardEvents.length) saveMonsterState(learnerId, workingState, gameStateRepository);
  return rewardEvents;
}

export function reasoningCoreSkillIds() {
  return REASONING_CORE_SKILL_IDS.slice();
}
