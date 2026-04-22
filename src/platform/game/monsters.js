export const MONSTERS = {
  inklet: {
    id: 'inklet',
    name: 'Inklet',
    blurb: 'Grows as Year 3-4 spellings become secure.',
    accent: '#3E6FA8',
    secondary: '#9FC1E8',
    pale: '#E8F0FA',
    nameByStage: ['Inklet Egg', 'Inklet', 'Scribbla', 'Quillorn', 'Mega Quillorn'],
    masteredMax: 100,
  },
  glimmerbug: {
    id: 'glimmerbug',
    name: 'Glimmerbug',
    blurb: 'Appears as Year 5-6 spellings settle into memory.',
    accent: '#B43CD9',
    secondary: '#EAB3D7',
    pale: '#F8E7F1',
    nameByStage: ['Glimmer Egg', 'Glimmerbug', 'Lumisprite', 'Lanternwing', 'Mega Lanternwing'],
    masteredMax: 100,
  },
  phaeton: {
    id: 'phaeton',
    name: 'Phaeton',
    blurb: 'The aggregate creature that rises when both spelling pools grow strong.',
    accent: '#D08A2C',
    secondary: '#E8C45A',
    pale: '#F6EED7',
    nameByStage: ['Stardrop Egg', 'Aetherwisp', 'Cometwing', 'Starquill Owl', 'Phaeton'],
    masteredMax: 213,
  },
  vellhorn: {
    id: 'vellhorn',
    name: 'Vellhorn',
    blurb: 'Appears as Extra spellings stretch beyond the statutory pools.',
    accent: '#2E8479',
    secondary: '#8FD6C7',
    pale: '#E5F3EF',
    nameByStage: ['Vellhorn Egg', 'Vellhorn', 'Mossvell', 'Cresthorn', 'Mega Cresthorn'],
    masteredMax: 100,
  },
};

export const MONSTERS_BY_SUBJECT = {
  spelling: ['inklet', 'glimmerbug', 'phaeton', 'vellhorn'],
};

export const MONSTER_BRANCHES = Object.freeze(['b1', 'b2']);
export const DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);
export const PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 213]);

const DEFAULT_MONSTER_BRANCH = 'b1';
const MONSTER_ASSET_SIZES = Object.freeze([320, 640, 1280]);
const MONSTER_ASSET_VERSION = '20260421-branches';

export function normaliseMonsterBranch(value, fallback = DEFAULT_MONSTER_BRANCH) {
  return MONSTER_BRANCHES.includes(value) ? value : fallback;
}

export function stageFor(mastered, thresholds = DIRECT_STAGE_THRESHOLDS) {
  const count = Number(mastered) || 0;
  const stageThresholds = Array.isArray(thresholds) ? thresholds : DIRECT_STAGE_THRESHOLDS;
  for (let stage = Math.min(4, stageThresholds.length - 1); stage >= 1; stage -= 1) {
    if (count >= stageThresholds[stage]) return stage;
  }
  return 0;
}

export function levelFor(mastered) {
  return Math.min(10, Math.floor(mastered / 10));
}

function normaliseMonsterAssetSize(size) {
  const numeric = Number(size) || 320;
  if (numeric >= 1280) return 1280;
  if (numeric >= 640) return 640;
  return 320;
}

export function monsterAsset(monsterId, stage, size = 320, branch = DEFAULT_MONSTER_BRANCH) {
  const safeStage = Math.max(0, Math.min(4, Number(stage) || 0));
  const safeSize = normaliseMonsterAssetSize(size);
  const safeBranch = normaliseMonsterBranch(branch);
  return `./assets/monsters/${monsterId}/${safeBranch}/${monsterId}-${safeBranch}-${safeStage}.${safeSize}.webp?v=${MONSTER_ASSET_VERSION}`;
}

export function monsterAssetSrcSet(monsterId, stage, branch = DEFAULT_MONSTER_BRANCH) {
  return MONSTER_ASSET_SIZES
    .map((size) => `${monsterAsset(monsterId, stage, size, branch)} ${size}w`)
    .join(', ');
}
