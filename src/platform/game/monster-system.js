import {
  levelFor,
  MONSTER_BRANCHES,
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  normaliseMonsterBranch,
  stageFor,
} from './monsters.js';

const DEFAULT_SYSTEM_ID = 'monster-codex';
const MONSTER_IDS = Object.freeze(Object.keys(MONSTERS));
const SPELLING_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.spelling || []).filter((monsterId) => MONSTERS[monsterId]),
);
const DIRECT_SPELLING_MONSTER_IDS = Object.freeze(
  SPELLING_MONSTER_IDS.filter((monsterId) => monsterId !== 'phaeton'),
);
const PHAETON_SOURCE_MONSTER_IDS = Object.freeze(['inklet', 'glimmerbug']);

function readGameState(gameStateRepository, learnerId, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return {};
  return gameStateRepository.read(learnerId, systemId) || {};
}

function writeGameState(gameStateRepository, learnerId, state, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return state || {};
  return gameStateRepository.write(learnerId, systemId, state || {});
}

function countMastered(state, monsterId) {
  return masteredList(state?.[monsterId]).length;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function masteredList(entry) {
  return Array.isArray(entry?.mastered) ? entry.mastered.filter((slug) => typeof slug === 'string' && slug) : [];
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
  const mastered = masteredList(entry).length;
  return {
    mastered,
    stage: stageFor(mastered),
    level: levelFor(mastered),
    caught: mastered >= 1,
    branch: branchForMonster(state, monsterId),
    masteredList: masteredList(entry),
  };
}

export function derivePhaeton(state) {
  const combined = PHAETON_SOURCE_MONSTER_IDS
    .reduce((sum, monsterId) => sum + countMastered(state, monsterId), 0);
  let stage = 0;
  if (combined >= 200) stage = 4;
  else if (combined >= 145) stage = 3;
  else if (combined >= 95) stage = 2;
  else if (combined >= 25) stage = 1;
  return {
    mastered: combined,
    stage,
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

export function monsterSummary(learnerId, gameStateRepository) {
  const state = ensureMonsterBranches(learnerId, gameStateRepository);
  return SPELLING_MONSTER_IDS.map((monsterId) => ({
    monster: MONSTERS[monsterId],
    progress: progressForMonster(state, monsterId),
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
  const state = secureWordsFromAnalytics(analytics, branchState);
  return SPELLING_MONSTER_IDS.map((monsterId) => ({
    monster: MONSTERS[monsterId],
    progress: progressForMonster(state, monsterId),
  }));
}
