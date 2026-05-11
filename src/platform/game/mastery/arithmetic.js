import { MONSTERS, stageFor, levelFor } from '../monsters.js';
import { ARITHMETIC_CONTENT_RELEASE_ID } from '../../../../shared/arithmetic/metadata.js';
import {
  ARITHMETIC_MONSTER_IDS,
  branchForMonster,
  ensureMonsterBranches,
  eventFromTransition,
  isPlainObject,
  masteredList,
  releaseIdForEntry,
  saveMonsterState,
} from './shared.js';

export const ARITHMETIC_REWARD_RELEASE_ID = ARITHMETIC_CONTENT_RELEASE_ID;
export const ARITHMETIC_GRAND_MONSTER_ID = 'arithon';

export const ARITHMETIC_STRAND_TO_MONSTER = Object.freeze({
  facts_place_value: 'sumkrab',
  operations_methods: 'carryfin',
  decimals_fractions: 'fractail',
  percentages_mixed: 'perciva',
});

export const ARITHMETIC_DIRECT_STAR_THRESHOLDS = Object.freeze([1, 20, 45, 70, 100]);
export const ARITHMETIC_GRAND_STAR_THRESHOLDS = Object.freeze([1, 15, 35, 65, 100]);

const ARITHMETIC_TEMPLATE_STRANDS = Object.freeze({
  bonds_missing: 'facts_place_value',
  place_value_partition: 'facts_place_value',
  powers_of_ten_shift: 'facts_place_value',
  times_table_fact: 'facts_place_value',
  mental_addition: 'operations_methods',
  mental_subtraction: 'operations_methods',
  column_addition: 'operations_methods',
  column_subtraction: 'operations_methods',
  missing_number_inverse: 'operations_methods',
  mental_multiplication: 'operations_methods',
  short_multiplication: 'operations_methods',
  short_division: 'operations_methods',
  long_multiplication: 'operations_methods',
  long_division: 'operations_methods',
  short_multiplication_missing_digit: 'operations_methods',
  short_division_missing_digit: 'operations_methods',
  formal_missing_digit: 'operations_methods',
  decimal_add_sub: 'decimals_fractions',
  decimal_times_integer: 'decimals_fractions',
  decimal_divide_integer: 'decimals_fractions',
  fraction_of_amount: 'decimals_fractions',
  fraction_add_sub: 'decimals_fractions',
  mixed_number_add_sub: 'decimals_fractions',
  fraction_divide_whole: 'decimals_fractions',
  fraction_multiply_fraction: 'decimals_fractions',
  formal_decimal_missing_digit: 'decimals_fractions',
  fraction_decimal_hybrid: 'decimals_fractions',
  percentage_of_amount: 'percentages_mixed',
  fdp_equivalent: 'percentages_mixed',
  order_of_operations: 'percentages_mixed',
});

const ARITHMETIC_MONSTER_UNIT_TOTALS = Object.freeze({
  [ARITHMETIC_STRAND_TO_MONSTER.facts_place_value]: 12,
  [ARITHMETIC_STRAND_TO_MONSTER.operations_methods]: 39,
  [ARITHMETIC_STRAND_TO_MONSTER.decimals_fractions]: 30,
  [ARITHMETIC_STRAND_TO_MONSTER.percentages_mixed]: 9,
  [ARITHMETIC_GRAND_MONSTER_ID]: 90,
});

export function arithmeticMasteryKey(rewardUnitId, releaseId = ARITHMETIC_REWARD_RELEASE_ID) {
  return `${releaseId}:arithmetic-unit:${rewardUnitId}`;
}

export function monsterIdForArithmeticRewardUnit(rewardUnitId) {
  const templateId = String(rewardUnitId || '').split(':')[0];
  return ARITHMETIC_STRAND_TO_MONSTER[ARITHMETIC_TEMPLATE_STRANDS[templateId]] || null;
}

function arithmeticMonsterTotal(monsterId) {
  return ARITHMETIC_MONSTER_UNIT_TOTALS[monsterId] || MONSTERS[monsterId]?.masteredMax || 1;
}

function arithmeticDisplayStars(mastered, total) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeMastered = Math.max(0, Math.min(safeTotal, Number(mastered) || 0));
  return Math.min(100, Math.round((safeMastered / safeTotal) * 100));
}

function safeStarHighWater(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n + 1e-9) : 0;
}

function arithmeticMasteredList(entry, releaseId = ARITHMETIC_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  const scopedReleaseId = releaseIdForEntry(entry, releaseId) || ARITHMETIC_REWARD_RELEASE_ID;
  const releasePrefix = `${scopedReleaseId}:arithmetic-unit:`;
  return mastered.filter((key) => key.startsWith(releasePrefix));
}

function arithmeticMasteredCount(entry, releaseId = ARITHMETIC_REWARD_RELEASE_ID) {
  const mastered = masteredList(entry);
  if (mastered.length) return arithmeticMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function thresholdsForArithmeticMonster(monsterId) {
  return monsterId === ARITHMETIC_GRAND_MONSTER_ID
    ? ARITHMETIC_GRAND_STAR_THRESHOLDS
    : ARITHMETIC_DIRECT_STAR_THRESHOLDS;
}

function progressForArithmeticMonsterFromState(state, monsterId) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const releaseId = releaseIdForEntry(entry, ARITHMETIC_REWARD_RELEASE_ID) || ARITHMETIC_REWARD_RELEASE_ID;
  const mastered = arithmeticMasteredCount(entry, releaseId);
  const masteredMax = arithmeticMonsterTotal(monsterId);
  const computedStars = arithmeticDisplayStars(mastered, masteredMax);
  const starHighWater = Math.max(safeStarHighWater(entry.starHighWater), computedStars);
  const displayStars = Math.min(100, starHighWater);
  const stage = stageFor(displayStars, thresholdsForArithmeticMonster(monsterId));
  return {
    mastered,
    masteredMax,
    computedStars,
    displayStars,
    stars: displayStars,
    starMax: 100,
    ...(monsterId === ARITHMETIC_GRAND_MONSTER_ID ? { grandStars: displayStars, grandStarMax: 100 } : {}),
    stage,
    displayStage: stage,
    level: levelFor(displayStars),
    caught: entry.caught === true || mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: arithmeticMasteredList(entry, releaseId),
    starHighWater,
    releaseId,
  };
}

export function progressForArithmeticMonster(state, monsterId) {
  return progressForArithmeticMonsterFromState(state, monsterId);
}

export function activeArithmeticMonsterSummaryFromState(state = {}) {
  return ARITHMETIC_MONSTER_IDS
    .map((monsterId) => ({
      subjectId: 'arithmetic',
      monster: MONSTERS[monsterId],
      progress: progressForArithmeticMonsterFromState(state, monsterId),
    }))
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

export function recordArithmeticRewardUnitMastery({
  learnerId,
  rewardUnitId,
  releaseId = ARITHMETIC_REWARD_RELEASE_ID,
  masteryKey = arithmeticMasteryKey(rewardUnitId, releaseId),
  gameStateRepository,
  random = Math.random,
} = {}) {
  const directMonsterId = monsterIdForArithmeticRewardUnit(rewardUnitId);
  if (!directMonsterId || !masteryKey || !MONSTERS[directMonsterId]) return [];

  let workingState = ensureMonsterBranches(learnerId, gameStateRepository, {
    random,
    monsterIds: ARITHMETIC_MONSTER_IDS,
  });
  const rewardEvents = [];

  for (const monsterId of [directMonsterId, ARITHMETIC_GRAND_MONSTER_ID]) {
    if (!MONSTERS[monsterId]) continue;
    const previousProgress = progressForArithmeticMonsterFromState(workingState, monsterId);
    const entry = isPlainObject(workingState[monsterId]) ? workingState[monsterId] : { mastered: [], caught: false };
    const mastered = masteredList(entry);
    if (mastered.includes(masteryKey)) continue;
    const nextMastered = [...mastered, masteryKey];
    const starHighWater = Math.min(100, Math.max(
      safeStarHighWater(entry.starHighWater),
      arithmeticDisplayStars(arithmeticMasteredCount({ ...entry, releaseId, mastered: nextMastered }, releaseId), arithmeticMonsterTotal(monsterId)),
    ));
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
        ...(monsterId === ARITHMETIC_GRAND_MONSTER_ID ? { grandStars: starHighWater, grandStarMax: 100 } : {}),
      },
    };
    const nextProgress = progressForArithmeticMonsterFromState(afterState, monsterId);
    workingState = afterState;
    const event = eventFromTransition(learnerId, monsterId, previousProgress, nextProgress);
    if (event) rewardEvents.push({ ...event, subjectId: 'arithmetic' });
  }

  if (rewardEvents.length) saveMonsterState(learnerId, workingState, gameStateRepository);
  return rewardEvents;
}
