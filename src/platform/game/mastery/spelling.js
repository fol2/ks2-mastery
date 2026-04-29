import {
  levelFor,
  MONSTERS,
  stageFor,
} from '../monsters.js';
import {
  branchForMonster,
  ensureMonsterBranches,
  eventFromTransition,
  hasMasteryProgress,
  isPlainObject,
  loadMonsterState,
  masteredCount,
  masteredList,
  MONSTER_IDS,
  saveMonsterState,
  SPELLING_MONSTER_IDS,
  DIRECT_SPELLING_MONSTER_IDS,
  withMonsterBranches,
} from './shared.js';
import { derivePhaeton, PHAETON_SOURCE_MONSTER_IDS } from './phaeton.js';
import { activePunctuationMonsterSummaryFromState } from './punctuation.js';
import { activeGrammarMonsterSummaryFromState, normaliseGrammarRewardState } from './grammar.js';

function hasMonsterMasteryProgress(state) {
  if (!isPlainObject(state)) return false;
  return SPELLING_MONSTER_IDS.some((monsterId) => hasMasteryProgress(state[monsterId]));
}

function analyticsHasWordRows(analytics) {
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  return groups.some((group) => {
    const words = Array.isArray(group?.words) ? group.words : [];
    return words.some((word) => typeof word?.slug === 'string' && word.slug);
  });
}

export function monsterIdForSpellingYearBand(yearBand) {
  return yearBand === '5-6' ? 'glimmerbug' : 'inklet';
}

export function monsterIdForSpellingWord(word = {}) {
  const spellingPool = word?.spellingPool === 'extra' ? 'extra' : 'core';
  if (spellingPool === 'extra' || word?.yearBand === 'extra' || word?.year === 'extra') return 'vellhorn';
  return monsterIdForSpellingYearBand(word?.yearBand || word?.year);
}

function secureWordsFromAnalytics(analytics, branchState = {}) {
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  const state = Object.fromEntries(SPELLING_MONSTER_IDS.map((monsterId) => [
    monsterId,
    monsterId === 'phaeton'
      ? { branch: branchForMonster(branchState, monsterId) }
      : { mastered: [], caught: false, branch: branchForMonster(branchState, monsterId) },
  ]));

  for (const group of groups) {
    const words = Array.isArray(group?.words) ? group.words : [];
    for (const word of words) {
      if (!word?.slug) continue;
      const isSecure = word.status === 'secure' || Number(word.progress?.stage) >= 4;
      if (!isSecure) continue;
      const monsterId = monsterIdForSpellingWord({
        spellingPool: word.spellingPool,
        year: word.year,
        yearBand: word.year,
      });
      if (!state[monsterId]) continue;
      if (!state[monsterId].mastered.includes(word.slug)) {
        state[monsterId].mastered.push(word.slug);
      }
    }
  }

  for (const monsterId of DIRECT_SPELLING_MONSTER_IDS) {
    state[monsterId].caught = state[monsterId].mastered.length > 0;
  }
  return state;
}

export function progressForMonster(state, monsterId) {
  if (monsterId === 'phaeton') return derivePhaeton(state);
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = masteredCount(entry);
  return {
    mastered,
    stage: stageFor(mastered),
    level: levelFor(mastered),
    caught: mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: masteredList(entry),
  };
}

export function recordMonsterMastery(learnerId, monsterId, wordSlug, gameStateRepository, options = {}) {
  if (monsterId === 'phaeton' || !MONSTERS[monsterId]) return [];
  const before = ensureMonsterBranches(learnerId, gameStateRepository, {
    ...options,
    monsterIds: SPELLING_MONSTER_IDS,
  });
  const directEntry = isPlainObject(before[monsterId]) ? before[monsterId] : { mastered: [], caught: false };
  const directMastered = masteredList(directEntry);
  if (directMastered.includes(wordSlug)) return [];

  const beforeDirect = progressForMonster(before, monsterId);
  const shouldUpdatePhaeton = PHAETON_SOURCE_MONSTER_IDS.includes(monsterId);
  const beforePhaeton = shouldUpdatePhaeton ? derivePhaeton(before) : null;

  const after = {
    ...before,
    [monsterId]: {
      ...directEntry,
      caught: true,
      mastered: [...directMastered, wordSlug],
    },
  };

  const afterDirect = progressForMonster(after, monsterId);
  const afterPhaeton = shouldUpdatePhaeton ? derivePhaeton(after) : null;
  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  const directEvent = eventFromTransition(learnerId, monsterId, beforeDirect, afterDirect);
  if (directEvent) events.push(directEvent);
  if (shouldUpdatePhaeton) {
    const aggregateEvent = eventFromTransition(learnerId, 'phaeton', beforePhaeton, afterPhaeton);
    if (aggregateEvent) events.push(aggregateEvent);
  }
  return events;
}

export function monsterSummary(learnerId, gameStateRepository, { punctuationStarView = null } = {}) {
  const state = ensureMonsterBranches(learnerId, gameStateRepository, {
    monsterIds: SPELLING_MONSTER_IDS,
  });
  return monsterSummaryFromState(state, { punctuationStarView });
}

export function monsterSummaryFromState(state = {}, { punctuationStarView = null } = {}) {
  const spelling = SPELLING_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'spelling',
    monster: MONSTERS[monsterId],
    progress: progressForMonster(state, monsterId),
  }));
  // Route Grammar through `normaliseGrammarRewardState` so pre-flip learners
  // whose only evidence is under a retired direct id (Glossbloom / Loomrill /
  // Mirrane) still surface Concordium on the home meadow via the unioned
  // view. Without the normaliser, `activeGrammarMonsterSummaryFromState`
  // would read the four active ids only and miss retired-id progress.
  const normalisedGrammarState = normaliseGrammarRewardState(state);
  return [
    ...spelling,
    ...activePunctuationMonsterSummaryFromState(state, { starView: punctuationStarView }),
    ...activeGrammarMonsterSummaryFromState(normalisedGrammarState),
  ];
}

export function monsterSummaryFromSpellingAnalytics(analytics, {
  learnerId = null,
  gameStateRepository = null,
  punctuationStarView = null,
  random = Math.random,
  persistBranches = true,
} = {}) {
  let branchState = {};
  if (learnerId && gameStateRepository) {
    branchState = persistBranches
      ? ensureMonsterBranches(learnerId, gameStateRepository, { random, monsterIds: SPELLING_MONSTER_IDS })
      : loadMonsterState(learnerId, gameStateRepository);
    if (!persistBranches) {
      branchState = withMonsterBranches(branchState, {
        learnerId,
        random: () => 0,
        monsterIds: MONSTER_IDS,
      }).state;
    }
  }

  if (!analyticsHasWordRows(analytics) && hasMonsterMasteryProgress(branchState)) {
    return monsterSummaryFromState(branchState, { punctuationStarView });
  }

  const state = secureWordsFromAnalytics(analytics, branchState);
  // `monsterSummaryFromState(state)` already routes Grammar through the
  // normaliser; use the same treatment for the fallback branch state so
  // pre-flip retired-id progress still surfaces Concordium on the meadow.
  const normalisedBranchState = normaliseGrammarRewardState(branchState);
  return [
    ...monsterSummaryFromState(state),
    ...activePunctuationMonsterSummaryFromState(branchState, { starView: punctuationStarView }),
    ...activeGrammarMonsterSummaryFromState(normalisedBranchState),
  ];
}
