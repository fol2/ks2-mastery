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
  pealark: {
    id: 'pealark',
    name: 'Pealark',
    blurb: 'Rises with sentence endings, speech and sentence boundaries.',
    accent: '#B8873F',
    secondary: '#E8C66F',
    pale: '#F7EEDC',
    nameByStage: ['Pealark Egg', 'Pealark', 'Chimewing', 'Bellcrest', 'Mega Bellcrest'],
    // Endmarks (1) + Speech (1) + Boundary (3) = 5 reward units post-remap.
    masteredMax: 5,
  },
  claspin: {
    id: 'claspin',
    name: 'Claspin',
    blurb: 'Locks in as apostrophe evidence becomes secure.',
    accent: '#7D6BB3',
    secondary: '#C8B7EA',
    pale: '#EFEAF8',
    nameByStage: ['Claspin Egg', 'Claspin', 'Lockling', 'Apostral', 'Mega Apostral'],
    masteredMax: 2,
  },
  quoral: {
    id: 'quoral',
    name: 'Quoral',
    blurb: 'The grand Bellstorm Coast creature for full Punctuation mastery.',
    accent: '#2E8479',
    secondary: '#8FD6C7',
    pale: '#E5F3EF',
    nameByStage: ['Quoral Egg', 'Quoral', 'Voiceling', 'Choruscrest', 'Grand Quoral'],
    masteredMax: 14,
  },
  curlune: {
    id: 'curlune',
    name: 'Curlune',
    blurb: 'Grows with commas, flow, lists and structural punctuation.',
    accent: '#4B7A4A',
    secondary: '#AACF93',
    pale: '#E8F0E6',
    nameByStage: ['Curlune Egg', 'Curlune', 'Commasprig', 'Flowhorn', 'Mega Flowhorn'],
    // Comma / Flow (3) + Structure (4) = 7 reward units post-remap.
    masteredMax: 7,
  },
  colisk: {
    id: 'colisk',
    name: 'Colisk',
    blurb: 'Reserved future Punctuation creature; not active in this release.',
    accent: '#C06B3E',
    secondary: '#EAB08A',
    pale: '#FBEEE4',
    nameByStage: ['Colisk Egg', 'Colisk', 'Structling', 'Listwyrm', 'Mega Listwyrm'],
    masteredMax: 4,
  },
  hyphang: {
    id: 'hyphang',
    name: 'Hyphang',
    blurb: 'Reserved future Punctuation creature; not active in this release.',
    accent: '#8A5A9D',
    secondary: '#CDAFE1',
    pale: '#F1E9F4',
    nameByStage: ['Hyphang Egg', 'Hyphang', 'Dashlet', 'Boundrake', 'Mega Boundrake'],
    masteredMax: 3,
  },
  carillon: {
    id: 'carillon',
    name: 'Carillon',
    blurb: 'Reserved future Punctuation creature; not active in this release.',
    accent: '#D08A2C',
    secondary: '#E8C45A',
    pale: '#F6EED7',
    nameByStage: ['Carillon Egg', 'Carillon', 'Chordwing', 'Bellstorm', 'Grand Carillon'],
    masteredMax: 14,
  },
  bracehart: {
    id: 'bracehart',
    name: 'Bracehart',
    blurb: 'Hatches as sentence functions, clauses and relative clauses become secure.',
    accent: '#4F8A72',
    secondary: '#A8D8BF',
    pale: '#E8F4EE',
    nameByStage: ['Bracehart Egg', 'Bracehart', 'Clausecub', 'Archhart', 'Mega Archhart'],
    masteredMax: 3,
  },
  glossbloom: {
    id: 'glossbloom',
    name: 'Glossbloom',
    blurb: 'Blooms as word classes and expanded noun phrases settle.',
    accent: '#B45C83',
    secondary: '#E6A8C7',
    pale: '#F8E9F1',
    nameByStage: ['Glossbloom Egg', 'Glossbloom', 'Petalphrase', 'Lexibloom', 'Mega Lexibloom'],
    masteredMax: 2,
  },
  loomrill: {
    id: 'loomrill',
    name: 'Loomrill',
    blurb: 'Threads adverbials, pronouns and cohesion into clear flow.',
    accent: '#4E79A8',
    secondary: '#9EC4E6',
    pale: '#E8F1FA',
    nameByStage: ['Loomrill Egg', 'Loomrill', 'Threadling', 'Coherill', 'Mega Coherill'],
    masteredMax: 2,
  },
  chronalyx: {
    id: 'chronalyx',
    name: 'Chronalyx',
    blurb: 'Turns time, aspect and modal meaning into secure Grammar evidence.',
    accent: '#7867B8',
    secondary: '#BFB4EC',
    pale: '#EFECFA',
    nameByStage: ['Chronalyx Egg', 'Chronalyx', 'Tenseling', 'Modalisk', 'Mega Modalisk'],
    masteredMax: 2,
  },
  couronnail: {
    id: 'couronnail',
    name: 'Couronnail',
    blurb: 'Crowns Standard English and formal register as they become secure.',
    accent: '#B8873F',
    secondary: '#E8C66F',
    pale: '#F7EEDC',
    nameByStage: ['Couronnail Egg', 'Couronnail', 'Regalcurl', 'Formacrest', 'Mega Formacrest'],
    masteredMax: 2,
  },
  mirrane: {
    id: 'mirrane',
    name: 'Mirrane',
    blurb: 'Reflects active, passive, subject and object roles with precision.',
    accent: '#6F7D86',
    secondary: '#B8C7CF',
    pale: '#EDF2F4',
    nameByStage: ['Mirrane Egg', 'Mirrane', 'Roleglint', 'Voiceglass', 'Mega Voiceglass'],
    masteredMax: 2,
  },
  concordium: {
    id: 'concordium',
    name: 'Concordium',
    blurb: 'The Clause Conservatory legendary for the full Grammar mastery denominator.',
    accent: '#2F8F7A',
    secondary: '#D7B85E',
    pale: '#F4F0DC',
    nameByStage: ['Concordium Egg', 'Concordium', 'Syntaxwing', 'Crowncord', 'Grand Concordium'],
    masteredMax: 18,
  },
};

export const MONSTERS_BY_SUBJECT = {
  spelling: ['inklet', 'glimmerbug', 'phaeton', 'vellhorn'],
  // Active Punctuation roster: 3 direct cluster creatures (Pealark, Curlune,
  // Claspin) + the grand legendary (Quoral) that aggregates all 14 reward
  // units. Colisk / Hyphang / Carillon remain in MONSTERS for asset tooling
  // and future activation but are no longer part of the learner-facing set.
  punctuation: ['pealark', 'curlune', 'claspin', 'quoral'],
  punctuationReserve: ['colisk', 'hyphang', 'carillon'],
  // Active Grammar roster (Phase 3 U0): 3 direct cluster creatures (Bracehart,
  // Chronalyx, Couronnail) + the grand legendary (Concordium) that aggregates
  // all 18 Grammar concepts. Glossbloom / Loomrill / Mirrane move to reserve:
  // their assets stay in MONSTERS for asset tooling and future activation but
  // they no longer appear in any active learner-facing summary. Pre-flip
  // reward state is preserved by `normaliseGrammarRewardState` in
  // `src/platform/game/mastery/grammar.js`.
  grammar: ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  grammarReserve: ['glossbloom', 'loomrill', 'mirrane'],
};

export const MONSTER_BRANCHES = Object.freeze(['b1', 'b2']);
export const DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);
export const PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 213]);
export const PUNCTUATION_MASTERED_THRESHOLDS = Object.freeze([1, 1, 2, 4, 14]);
export const PUNCTUATION_STAR_THRESHOLDS = Object.freeze([1, 10, 30, 60, 100]);
export const PUNCTUATION_GRAND_STAR_THRESHOLDS = Object.freeze([1, 10, 25, 50, 100]);

const DEFAULT_MONSTER_BRANCH = 'b1';
const MONSTER_ASSET_SIZES = Object.freeze([320, 640, 1280]);
export const MONSTER_ASSET_VERSION = '20260421-branches';

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
