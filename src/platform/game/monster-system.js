import {
  levelFor,
  MONSTER_BRANCHES,
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  normaliseMonsterBranch,
  PHAETON_STAGE_THRESHOLDS,
  stageFor,
} from './monsters.js';
import { PUNCTUATION_CURRENT_RELEASE_ID } from '../../subjects/punctuation/service-contract.js';

const DEFAULT_SYSTEM_ID = 'monster-codex';
const MONSTER_IDS = Object.freeze(Object.keys(MONSTERS));
const SPELLING_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.spelling || []).filter((monsterId) => MONSTERS[monsterId]),
);
const PUNCTUATION_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.punctuation || []).filter((monsterId) => MONSTERS[monsterId]),
);
const DIRECT_SPELLING_MONSTER_IDS = Object.freeze(
  SPELLING_MONSTER_IDS.filter((monsterId) => monsterId !== 'phaeton'),
);
const PHAETON_SOURCE_MONSTER_IDS = Object.freeze(['inklet', 'glimmerbug']);
const PUNCTUATION_GRAND_MONSTER_ID = 'carillon';

function readGameState(gameStateRepository, learnerId, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return {};
  return gameStateRepository.read(learnerId, systemId) || {};
}

function writeGameState(gameStateRepository, learnerId, state, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return state || {};
  return gameStateRepository.write(learnerId, systemId, state || {});
}

function countMastered(state, monsterId) {
  return masteredCount(state?.[monsterId]);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function masteredList(entry) {
  return Array.isArray(entry?.mastered) ? entry.mastered.filter((slug) => typeof slug === 'string' && slug) : [];
}

function masteredCount(entry) {
  const mastered = masteredList(entry);
  if (mastered.length) return mastered.length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function releaseIdForEntry(entry, releaseId = null) {
  if (typeof releaseId === 'string' && releaseId) return releaseId;
  if (typeof entry?.releaseId === 'string' && entry.releaseId) return entry.releaseId;
  return null;
}

function punctuationMasteredList(entry, releaseId = null) {
  const mastered = masteredList(entry);
  const scopedReleaseId = releaseIdForEntry(entry, releaseId);
  if (!scopedReleaseId) return mastered;
  const releasePrefix = `punctuation:${scopedReleaseId}:`;
  return mastered.filter((key) => key.startsWith(releasePrefix));
}

function punctuationMasteredCount(entry, releaseId = null) {
  const mastered = masteredList(entry);
  if (mastered.length) return punctuationMasteredList(entry, releaseId).length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function punctuationTotal(entry, fallback = 1) {
  const count = Number(entry?.publishedTotal);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : Math.max(1, Number(fallback) || 1);
}

function punctuationStageFor(mastered, total) {
  const denominator = Math.max(1, Number(total) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(mastered) || 0) / denominator));
  if (ratio >= 1) return 4;
  if (ratio >= 2 / 3) return 3;
  if (ratio >= 1 / 3) return 2;
  if (ratio > 0) return 1;
  return 0;
}

function hasMasteryProgress(entry) {
  return masteredCount(entry) > 0 || entry?.caught === true;
}

function hasMonsterMasteryProgress(state) {
  if (!isPlainObject(state)) return false;
  return SPELLING_MONSTER_IDS.some((monsterId) => hasMasteryProgress(state[monsterId]));
}

function activePunctuationMonsterSummaryFromState(state = {}) {
  return punctuationMonsterSummaryFromState(state)
    .filter((entry) => entry.progress.caught || entry.progress.mastered > 0);
}

function analyticsHasWordRows(analytics) {
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  return groups.some((group) => {
    const words = Array.isArray(group?.words) ? group.words : [];
    return words.some((word) => typeof word?.slug === 'string' && word.slug);
  });
}

function pickMonsterBranch(random = Math.random) {
  const raw = typeof random === 'function' ? Number(random()) : Math.random();
  const index = Math.max(0, Math.min(MONSTER_BRANCHES.length - 1, Math.floor((Number.isFinite(raw) ? raw : 0) * MONSTER_BRANCHES.length)));
  return MONSTER_BRANCHES[index] || MONSTER_BRANCHES[0];
}

function branchForMonster(state, monsterId) {
  return normaliseMonsterBranch(state?.[monsterId]?.branch);
}

function withMonsterBranches(rawState, { random = Math.random } = {}) {
  const state = isPlainObject(rawState) ? { ...rawState } : {};
  let changed = false;

  for (const monsterId of MONSTER_IDS) {
    const current = isPlainObject(state[monsterId]) ? state[monsterId] : {};
    const branch = normaliseMonsterBranch(current.branch, null);
    if (branch) continue;
    state[monsterId] = {
      ...current,
      branch: pickMonsterBranch(random),
    };
    changed = true;
  }

  return { state, changed };
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

export function loadMonsterState(learnerId, gameStateRepository) {
  return readGameState(gameStateRepository, learnerId, DEFAULT_SYSTEM_ID);
}

export function saveMonsterState(learnerId, state, gameStateRepository) {
  return writeGameState(gameStateRepository, learnerId, state, DEFAULT_SYSTEM_ID);
}

export function ensureMonsterBranches(learnerId, gameStateRepository, options = {}) {
  const before = loadMonsterState(learnerId, gameStateRepository);
  if (!gameStateRepository) return withMonsterBranches(before, { random: () => 0 }).state;
  const { state, changed } = withMonsterBranches(before, options);
  return changed ? saveMonsterState(learnerId, state, gameStateRepository) : state;
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

export function progressForPunctuationMonster(state, monsterId, { publishedTotal = null, releaseId = PUNCTUATION_CURRENT_RELEASE_ID } = {}) {
  const entry = isPlainObject(state?.[monsterId]) ? state[monsterId] : { mastered: [], caught: false };
  const mastered = punctuationMasteredCount(entry, releaseId);
  const total = punctuationTotal(entry, publishedTotal || MONSTERS[monsterId]?.masteredMax || 1);
  return {
    mastered,
    publishedTotal: total,
    stage: punctuationStageFor(mastered, total),
    level: Math.min(10, Math.round((mastered / Math.max(1, total)) * 10)),
    caught: mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: punctuationMasteredList(entry, releaseId),
  };
}

export function derivePhaeton(state) {
  const combined = PHAETON_SOURCE_MONSTER_IDS
    .reduce((sum, monsterId) => sum + countMastered(state, monsterId), 0);
  return {
    mastered: combined,
    stage: stageFor(combined, PHAETON_STAGE_THRESHOLDS),
    level: Math.min(10, Math.floor(combined / 20)),
    caught: combined >= 3,
    branch: branchForMonster(state, 'phaeton'),
    masteredList: [],
  };
}

function eventFromTransition(learnerId, monsterId, previous, next) {
  if (!previous.caught && next.caught) return buildEvent(learnerId, 'caught', monsterId, previous, next);
  if (next.stage > previous.stage) return buildEvent(learnerId, next.stage === 4 ? 'mega' : 'evolve', monsterId, previous, next);
  if (next.level > previous.level) return buildEvent(learnerId, 'levelup', monsterId, previous, next);
  return null;
}

function toastBodyFor(kind) {
  if (kind === 'caught') return 'New creature unlocked.';
  if (kind === 'mega') return 'Maximum evolution reached.';
  if (kind === 'evolve') return 'Creature evolved.';
  return 'Level increased.';
}

function buildEvent(learnerId, kind, monsterId, previous, next) {
  const monster = MONSTERS[monsterId];
  const createdAt = Date.now();
  return {
    id: `reward.monster:${learnerId || 'default'}:${monsterId}:${kind}:${next.stage}:${next.level}`,
    type: 'reward.monster',
    kind,
    learnerId,
    systemId: DEFAULT_SYSTEM_ID,
    monsterId,
    monster,
    previous,
    next,
    createdAt,
    toast: {
      title: monster?.name || 'Reward update',
      body: toastBodyFor(kind),
    },
  };
}

function buildPunctuationEvent({
  learnerId,
  kind,
  monsterId,
  previous,
  next,
  releaseId,
  clusterId,
  rewardUnitId,
  masteryKey,
  createdAt = Date.now(),
} = {}) {
  const monster = MONSTERS[monsterId];
  return {
    id: `reward.monster:${learnerId || 'default'}:punctuation:${releaseId}:${clusterId}:${rewardUnitId}:${monsterId}:${kind}`,
    type: 'reward.monster',
    kind,
    learnerId,
    subjectId: 'punctuation',
    systemId: DEFAULT_SYSTEM_ID,
    releaseId,
    clusterId,
    rewardUnitId,
    masteryKey,
    monsterId,
    monster,
    previous,
    next,
    createdAt,
    toast: {
      title: monster?.name || 'Reward update',
      body: toastBodyFor(kind),
    },
  };
}

function punctuationEventFromTransition(payload, previous, next) {
  if (!previous.caught && next.caught) {
    return buildPunctuationEvent({ ...payload, kind: 'caught', previous, next });
  }
  if (next.stage > previous.stage) {
    return buildPunctuationEvent({ ...payload, kind: next.stage === 4 ? 'mega' : 'evolve', previous, next });
  }
  if (next.level > previous.level) {
    return buildPunctuationEvent({ ...payload, kind: 'levelup', previous, next });
  }
  return null;
}

export function recordMonsterMastery(learnerId, monsterId, wordSlug, gameStateRepository, options = {}) {
  if (monsterId === 'phaeton' || !MONSTERS[monsterId]) return [];
  const before = ensureMonsterBranches(learnerId, gameStateRepository, options);
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

export function recordPunctuationRewardUnitMastery({
  learnerId,
  releaseId,
  clusterId,
  rewardUnitId,
  masteryKey,
  monsterId,
  publishedTotal = 1,
  aggregateMonsterId = PUNCTUATION_GRAND_MONSTER_ID,
  aggregatePublishedTotal = 1,
  createdAt = Date.now(),
  gameStateRepository,
  random = Math.random,
} = {}) {
  if (!MONSTERS[monsterId] || !masteryKey) return [];
  const scopedReleaseId = typeof releaseId === 'string' && releaseId ? releaseId : PUNCTUATION_CURRENT_RELEASE_ID;
  const expectedMasteryKey = `punctuation:${scopedReleaseId}:${clusterId}:${rewardUnitId}`;
  if (masteryKey !== expectedMasteryKey) return [];
  const before = ensureMonsterBranches(learnerId, gameStateRepository, { random });
  const directEntry = isPlainObject(before[monsterId]) ? before[monsterId] : { mastered: [], caught: false };
  const directMastered = masteredList(directEntry);
  if (directMastered.includes(masteryKey)) return [];

  const aggregateEntry = isPlainObject(before[aggregateMonsterId]) ? before[aggregateMonsterId] : { mastered: [], caught: false };
  const aggregateMastered = masteredList(aggregateEntry);
  const beforeDirect = progressForPunctuationMonster(before, monsterId, { publishedTotal, releaseId: scopedReleaseId });
  const beforeAggregate = progressForPunctuationMonster(before, aggregateMonsterId, { publishedTotal: aggregatePublishedTotal, releaseId: scopedReleaseId });

  const after = {
    ...before,
    [monsterId]: {
      ...directEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal,
      mastered: [...directMastered, masteryKey],
    },
    [aggregateMonsterId]: {
      ...aggregateEntry,
      caught: true,
      releaseId: scopedReleaseId,
      publishedTotal: aggregatePublishedTotal,
      mastered: aggregateMastered.includes(masteryKey)
        ? aggregateMastered
        : [...aggregateMastered, masteryKey],
    },
  };

  const afterDirect = progressForPunctuationMonster(after, monsterId, { publishedTotal, releaseId: scopedReleaseId });
  const afterAggregate = progressForPunctuationMonster(after, aggregateMonsterId, { publishedTotal: aggregatePublishedTotal, releaseId: scopedReleaseId });
  saveMonsterState(learnerId, after, gameStateRepository);

  const events = [];
  const directEvent = punctuationEventFromTransition({
    learnerId,
    monsterId,
    releaseId: scopedReleaseId,
    clusterId,
    rewardUnitId,
    masteryKey,
    createdAt,
  }, beforeDirect, afterDirect);
  if (directEvent) events.push(directEvent);

  const aggregateEvent = punctuationEventFromTransition({
    learnerId,
    monsterId: aggregateMonsterId,
    releaseId: scopedReleaseId,
    clusterId: 'published_release',
    rewardUnitId,
    masteryKey,
    createdAt,
  }, beforeAggregate, afterAggregate);
  if (aggregateEvent) events.push(aggregateEvent);

  return events;
}

export function monsterSummary(learnerId, gameStateRepository) {
  const state = ensureMonsterBranches(learnerId, gameStateRepository);
  return monsterSummaryFromState(state);
}

export function monsterSummaryFromState(state = {}) {
  const spelling = SPELLING_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'spelling',
    monster: MONSTERS[monsterId],
    progress: progressForMonster(state, monsterId),
  }));
  return [...spelling, ...activePunctuationMonsterSummaryFromState(state)];
}

export function punctuationMonsterSummaryFromState(state = {}, { clusterTotals = {}, aggregateTotal = 1, releaseId = PUNCTUATION_CURRENT_RELEASE_ID } = {}) {
  return PUNCTUATION_MONSTER_IDS.map((monsterId) => ({
    subjectId: 'punctuation',
    monster: MONSTERS[monsterId],
    progress: progressForPunctuationMonster(state, monsterId, {
      publishedTotal: monsterId === PUNCTUATION_GRAND_MONSTER_ID
        ? aggregateTotal
        : (clusterTotals[monsterId] || MONSTERS[monsterId]?.masteredMax || 1),
      releaseId,
    }),
  }));
}

export function monsterSummaryFromSpellingAnalytics(analytics, {
  learnerId = null,
  gameStateRepository = null,
  random = Math.random,
  persistBranches = true,
} = {}) {
  let branchState = {};
  if (learnerId && gameStateRepository) {
    branchState = persistBranches
      ? ensureMonsterBranches(learnerId, gameStateRepository, { random })
      : loadMonsterState(learnerId, gameStateRepository);
  }

  if (!analyticsHasWordRows(analytics) && hasMonsterMasteryProgress(branchState)) {
    return monsterSummaryFromState(branchState);
  }

  const state = secureWordsFromAnalytics(analytics, branchState);
  return [
    ...monsterSummaryFromState(state),
    ...activePunctuationMonsterSummaryFromState(branchState),
  ];
}
