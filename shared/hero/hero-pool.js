'use strict';

// ── Hero Pool Registry — shared pure contract ─────────────────────
// Zero side-effects. No imports from worker/, src/, react, or node: built-ins.

// ── Constants ────────────────────────────────────────────────────

export const HERO_MONSTER_INVITE_COST = 150;

export const HERO_MONSTER_GROW_COSTS = Object.freeze({ 1: 300, 2: 600, 3: 1000, 4: 1600 });

export const HERO_POOL_ROSTER_VERSION = 'hero-pool-v1';

// ── Registry ─────────────────────────────────────────────────────

const BRANCH_OPTIONS = Object.freeze([
  Object.freeze({ branch: 'b1', childLabel: 'Path A' }),
  Object.freeze({ branch: 'b2', childLabel: 'Path B' }),
]);

const MAX_STAGE = 4;

const registry = Object.freeze({
  glossbloom: Object.freeze({
    monsterId: 'glossbloom',
    displayName: 'Glossbloom',
    sourceAssetMonsterId: 'glossbloom',
    origin: 'grammar-reserve',
    displayOrder: 1,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A word-garden creature that loves clear phrases.',
  }),
  loomrill: Object.freeze({
    monsterId: 'loomrill',
    displayName: 'Loomrill',
    sourceAssetMonsterId: 'loomrill',
    origin: 'grammar-reserve',
    displayOrder: 2,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A thread creature that keeps ideas joined together.',
  }),
  mirrane: Object.freeze({
    monsterId: 'mirrane',
    displayName: 'Mirrane',
    sourceAssetMonsterId: 'mirrane',
    origin: 'grammar-reserve',
    displayOrder: 3,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A mirror creature that reflects roles and voices.',
  }),
  colisk: Object.freeze({
    monsterId: 'colisk',
    displayName: 'Colisk',
    sourceAssetMonsterId: 'colisk',
    origin: 'punctuation-reserve',
    displayOrder: 4,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A structure creature that builds strong lists and shapes.',
  }),
  hyphang: Object.freeze({
    monsterId: 'hyphang',
    displayName: 'Hyphang',
    sourceAssetMonsterId: 'hyphang',
    origin: 'punctuation-reserve',
    displayOrder: 5,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A boundary creature that links ideas carefully.',
  }),
  carillon: Object.freeze({
    monsterId: 'carillon',
    displayName: 'Carillon',
    sourceAssetMonsterId: 'carillon',
    origin: 'punctuation-reserve',
    displayOrder: 6,
    maxStage: MAX_STAGE,
    inviteCost: HERO_MONSTER_INVITE_COST,
    growCosts: HERO_MONSTER_GROW_COSTS,
    branchOptions: BRANCH_OPTIONS,
    childBlurb: 'A bell creature that gathers the Hero Camp together.',
  }),
});

export const HERO_POOL_REGISTRY = registry;

export const HERO_POOL_INITIAL_MONSTER_IDS = Object.freeze([
  'glossbloom',
  'loomrill',
  'mirrane',
  'colisk',
  'hyphang',
  'carillon',
]);

// ── Helpers ──────────────────────────────────────────────────────

const MONSTER_ID_SET = new Set(HERO_POOL_INITIAL_MONSTER_IDS);
const VALID_BRANCHES = new Set(['b1', 'b2']);

export function getHeroMonsterDefinition(id) {
  return registry[id];
}

export function getInviteCost() {
  return HERO_MONSTER_INVITE_COST;
}

export function getGrowCost(targetStage) {
  return HERO_MONSTER_GROW_COSTS[targetStage];
}

export function isValidHeroMonsterId(id) {
  return typeof id === 'string' && MONSTER_ID_SET.has(id);
}

export function isValidHeroMonsterBranch(branch) {
  return typeof branch === 'string' && VALID_BRANCHES.has(branch);
}

export const isValidBranch = isValidHeroMonsterBranch;

export function getMaxStage() {
  return MAX_STAGE;
}
