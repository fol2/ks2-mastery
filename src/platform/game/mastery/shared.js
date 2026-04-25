import {
  MONSTER_BRANCHES,
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  normaliseMonsterBranch,
} from '../monsters.js';

export const DEFAULT_SYSTEM_ID = 'monster-codex';
export const MONSTER_IDS = Object.freeze(Object.keys(MONSTERS));
export const SPELLING_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.spelling || []).filter((monsterId) => MONSTERS[monsterId]),
);
export const PUNCTUATION_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.punctuation || []).filter((monsterId) => MONSTERS[monsterId]),
);
export const GRAMMAR_MONSTER_IDS = Object.freeze(
  (MONSTERS_BY_SUBJECT.grammar || []).filter((monsterId) => MONSTERS[monsterId]),
);
export const DIRECT_SPELLING_MONSTER_IDS = Object.freeze(
  SPELLING_MONSTER_IDS.filter((monsterId) => monsterId !== 'phaeton'),
);
export const PUNCTUATION_GRAND_MONSTER_ID = 'carillon';
export const GRAMMAR_GRAND_MONSTER_ID = 'concordium';

export function readGameState(gameStateRepository, learnerId, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return {};
  return gameStateRepository.read(learnerId, systemId) || {};
}

export function writeGameState(gameStateRepository, learnerId, state, systemId = DEFAULT_SYSTEM_ID) {
  if (!gameStateRepository) return state || {};
  return gameStateRepository.write(learnerId, systemId, state || {});
}

export function countMastered(state, monsterId) {
  return masteredCount(state?.[monsterId]);
}

import { isPlainObject } from '../../core/utils.js';

export { isPlainObject };

export function masteredList(entry) {
  return Array.isArray(entry?.mastered) ? entry.mastered.filter((slug) => typeof slug === 'string' && slug) : [];
}

export function masteredCount(entry) {
  const mastered = masteredList(entry);
  if (mastered.length) return mastered.length;
  const count = Number(entry?.masteredCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

export function releaseIdForEntry(entry, releaseId = null) {
  if (typeof releaseId === 'string' && releaseId) return releaseId;
  if (typeof entry?.releaseId === 'string' && entry.releaseId) return entry.releaseId;
  return null;
}

export function hasMasteryProgress(entry) {
  return masteredCount(entry) > 0 || entry?.caught === true;
}

export function pickMonsterBranch(random = Math.random) {
  const raw = typeof random === 'function' ? Number(random()) : Math.random();
  const index = Math.max(0, Math.min(MONSTER_BRANCHES.length - 1, Math.floor((Number.isFinite(raw) ? raw : 0) * MONSTER_BRANCHES.length)));
  return MONSTER_BRANCHES[index] || MONSTER_BRANCHES[0];
}

export function branchForMonster(state, monsterId) {
  return normaliseMonsterBranch(state?.[monsterId]?.branch);
}

export function normaliseMonsterIdScope(monsterIds = MONSTER_IDS) {
  const requested = Array.isArray(monsterIds) && monsterIds.length ? monsterIds : MONSTER_IDS;
  return requested.filter((monsterId) => MONSTERS[monsterId]);
}

export function withMonsterBranches(rawState, { random = Math.random, monsterIds = MONSTER_IDS } = {}) {
  const state = isPlainObject(rawState) ? { ...rawState } : {};
  let changed = false;

  for (const monsterId of normaliseMonsterIdScope(monsterIds)) {
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

export function loadMonsterState(learnerId, gameStateRepository) {
  return readGameState(gameStateRepository, learnerId, DEFAULT_SYSTEM_ID);
}

export function saveMonsterState(learnerId, state, gameStateRepository) {
  return writeGameState(gameStateRepository, learnerId, state, DEFAULT_SYSTEM_ID);
}

export function ensureMonsterBranches(learnerId, gameStateRepository, options = {}) {
  const before = loadMonsterState(learnerId, gameStateRepository);
  if (!gameStateRepository) return withMonsterBranches(before, { ...options, random: () => 0 }).state;
  const { state, changed } = withMonsterBranches(before, options);
  return changed ? saveMonsterState(learnerId, state, gameStateRepository) : state;
}

export function toastBodyFor(kind) {
  if (kind === 'caught') return 'New creature unlocked.';
  if (kind === 'mega') return 'Maximum evolution reached.';
  if (kind === 'evolve') return 'Creature evolved.';
  return 'Level increased.';
}

export function buildEvent(learnerId, kind, monsterId, previous, next) {
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

export function eventFromTransition(learnerId, monsterId, previous, next) {
  if (!previous.caught && next.caught) return buildEvent(learnerId, 'caught', monsterId, previous, next);
  if (next.stage > previous.stage) return buildEvent(learnerId, next.stage === 4 ? 'mega' : 'evolve', monsterId, previous, next);
  if (next.level > previous.level) return buildEvent(learnerId, 'levelup', monsterId, previous, next);
  return null;
}
