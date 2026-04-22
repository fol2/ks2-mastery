const MONSTER_VARIANTS = ['b1', 'b2'];
const DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 90]);
const PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 200]);
const CODEX_POWER_RANK = Object.freeze({
  inklet: 1,
  glimmerbug: 2,
  phaeton: 3,
});

export const REGION_BACKGROUND_URLS = Object.freeze([
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-b3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c4.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c5.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-bg-c6.1280.webp',
]);

const MEADOW_PERSPECTIVE = Object.freeze({
  farFoot: 40,
  nearFoot: 86,
  farScale: 0.78,
  nearScale: 1.18,
});

const MEADOW_STAGE_SCALE = Object.freeze([1, 1.04, 1.16, 1.3, 1.48]);
const MEADOW_SPECIES_SCALE = Object.freeze({
  inklet: 1.02,
  glimmerbug: 0.94,
  phaeton: 1.08,
});

const MEADOW_SLOT_POOLS = Object.freeze({
  eggOnly: Object.freeze([
    { slot: 'egg-centre', size: 86, x: '52%', footY: '70%', lane: 'ground' },
    { slot: 'egg-left',   size: 76, x: '33%', footY: '76%', lane: 'ground' },
    { slot: 'egg-right',  size: 72, x: '70%', footY: '73%', lane: 'ground' },
    { slot: 'egg-back',   size: 58, x: '82%', footY: '61%', lane: 'ground' },
    { slot: 'egg-front',  size: 62, x: '43%', footY: '80%', lane: 'ground' },
  ]),
  eggMixed: Object.freeze([
    { slot: 'egg-mixed-left',  size: 58, x: '28%', footY: '78%', lane: 'ground' },
    { slot: 'egg-mixed-mid',   size: 62, x: '48%', footY: '80%', lane: 'ground' },
    { slot: 'egg-mixed-right', size: 56, x: '70%', footY: '76%', lane: 'ground' },
  ]),
  walk: Object.freeze([
    {
      slot: 'walk-front',
      size: 136,
      x: '58%',
      footY: '82%',
      lane: 'ground',
      path: 'walk',
      dur: 25,
      delay: 0,
      bobDelay: 0,
      roamForward: 46,
      roamBack: 34,
    },
    {
      slot: 'walk-left',
      size: 112,
      x: '31%',
      footY: '78%',
      lane: 'ground',
      path: 'walk',
      dur: 22,
      delay: 2.8,
      bobDelay: 0.4,
      roamForward: 38,
      roamBack: 28,
    },
    {
      slot: 'walk-right',
      size: 96,
      x: '78%',
      footY: '75%',
      lane: 'ground',
      path: 'walk',
      dur: 23,
      delay: 4.2,
      bobDelay: 0.9,
      roamForward: 30,
      roamBack: 24,
    },
  ]),
  'fly-a': Object.freeze([
    {
      slot: 'fly-a-right',
      size: 104,
      x: '78%',
      footY: '58%',
      lane: 'air',
      path: 'fly-a',
      dur: 16,
      delay: 1.2,
      bobDelay: 0.6,
      roamForward: 48,
      roamBack: 30,
      roamForwardY: 0,
      roamBackY: 12,
    },
    {
      slot: 'fly-a-centre',
      size: 86,
      x: '57%',
      footY: '48%',
      lane: 'air',
      path: 'fly-a',
      dur: 14,
      delay: 4.8,
      bobDelay: 0.9,
      roamForward: 34,
      roamBack: 24,
      roamForwardY: -4,
      roamBackY: 14,
    },
    {
      slot: 'fly-a-far',
      size: 76,
      x: '84%',
      footY: '62%',
      lane: 'air',
      path: 'fly-a',
      dur: 18,
      delay: 6,
      bobDelay: 1.1,
      roamForward: 24,
      roamBack: 20,
      roamForwardY: 2,
      roamBackY: 10,
    },
  ]),
  'fly-b': Object.freeze([
    {
      slot: 'fly-b-left',
      size: 106,
      x: '46%',
      footY: '73%',
      lane: 'air',
      path: 'fly-b',
      dur: 19,
      delay: 2.4,
      bobDelay: 1.2,
      roamForward: 42,
      roamBack: 50,
      roamForwardY: -8,
      roamBackY: 18,
    },
    {
      slot: 'fly-b-right',
      size: 90,
      x: '82%',
      footY: '54%',
      lane: 'air',
      path: 'fly-b',
      dur: 17,
      delay: 3.6,
      bobDelay: 0.5,
      roamForward: 28,
      roamBack: 34,
      roamForwardY: -6,
      roamBackY: 14,
    },
    {
      slot: 'fly-b-centre',
      size: 80,
      x: '61%',
      footY: '63%',
      lane: 'air',
      path: 'fly-b',
      dur: 20,
      delay: 5.4,
      bobDelay: 1,
      roamForward: 26,
      roamBack: 28,
      roamForwardY: -4,
      roamBackY: 12,
    },
  ]),
});

const MONSTER_FACE = Object.freeze({
  'inklet-b1-0': 'left',     'inklet-b1-1': 'left',     'inklet-b1-2': 'left',
  'inklet-b1-3': 'left',     'inklet-b1-4': 'left',
  'inklet-b2-0': 'left',     'inklet-b2-1': 'left',     'inklet-b2-2': 'left',
  'inklet-b2-3': 'left',     'inklet-b2-4': 'left',
  'glimmerbug-b1-0': 'left', 'glimmerbug-b1-1': 'left', 'glimmerbug-b1-2': 'left',
  'glimmerbug-b1-3': 'left', 'glimmerbug-b1-4': 'left',
  'glimmerbug-b2-0': 'left', 'glimmerbug-b2-1': 'left', 'glimmerbug-b2-2': 'left',
  'glimmerbug-b2-3': 'left', 'glimmerbug-b2-4': 'right',
  'phaeton-b1-0': 'right',   'phaeton-b1-1': 'right',   'phaeton-b1-2': 'right',
  'phaeton-b1-3': 'right',   'phaeton-b1-4': 'right',
  'phaeton-b2-0': 'left',    'phaeton-b2-1': 'left',    'phaeton-b2-2': 'right',
  'phaeton-b2-3': 'left',    'phaeton-b2-4': 'left',
});

const SUBJECT_DECOR = Object.freeze({
  spelling: {
    eyebrow: 'The Scribe Downs',
    glyph: 'Sp',
    accent: 'linear-gradient(135deg, #3E6FA8, #B43CD9)',
    regionBase: '/assets/regions/the-scribe-downs/the-scribe-downs-bg-a1',
  },
  arithmetic:  { glyph: '×÷', accent: 'linear-gradient(135deg, #C06B3E, #F2B756)' },
  reasoning:   { glyph: '∴',  accent: 'linear-gradient(135deg, #8A5A9D, #C4A5D4)' },
  grammar:     { glyph: '¶',  accent: 'linear-gradient(135deg, #2E8479, #78C2B4)' },
  punctuation: { glyph: ';',  accent: 'linear-gradient(135deg, #B8873F, #E8C88E)' },
  reading:     { glyph: 'Rd', accent: 'linear-gradient(135deg, #4B7A4A, #9CC59A)' },
});

export function randomHeroBackground(random = Math.random) {
  const roll = typeof random === 'function' ? Number(random()) : Math.random();
  const index = Math.max(
    0,
    Math.min(REGION_BACKGROUND_URLS.length - 1, Math.floor(roll * REGION_BACKGROUND_URLS.length)),
  );
  return REGION_BACKGROUND_URLS[index];
}

export function subjectDecor(subjectId) {
  return SUBJECT_DECOR[subjectId] || { glyph: '•', accent: 'linear-gradient(135deg, #6B7280, #9CA3AF)' };
}

export function monsterFaceSign(species, variant, stage) {
  const key = `${species}-${variant}-${stage}`;
  return MONSTER_FACE[key] === 'left' ? -1 : 1;
}

export function monsterAssetPath(species, variant, stage, size) {
  return `./assets/monsters/${species}/${variant}/${species}-${variant}-${stage}.${size}.webp`;
}

export function monsterAssetSrcset(species, variant, stage) {
  return [320, 640, 1280]
    .map((size) => `${monsterAssetPath(species, variant, stage, size)} ${size}w`)
    .join(', ');
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function valueBetween(hash, min, max) {
  return min + (hash / 0xffffffff) * (max - min);
}

export function eggBreatheStyle(seed, context = 'card') {
  const rawSeed = typeof seed === 'string'
    ? seed
    : [
      seed?.id,
      seed?.species,
      seed?.branch || seed?.variant,
      seed?.stage,
      context,
    ].filter((part) => part != null && part !== '').join(':');
  const durationMin = context === 'feature' ? 6.6 : 5.8;
  const durationMax = context === 'feature' ? 8.3 : 7.4;
  const liftMin = context === 'feature' ? 3 : 2.4;
  const liftMax = context === 'feature' ? 5 : 4.2;
  const duration = valueBetween(hashString(`${rawSeed}:duration`), durationMin, durationMax);
  const delay = -valueBetween(hashString(`${rawSeed}:phase`), 0.25, duration - 0.2);
  const lift = -valueBetween(hashString(`${rawSeed}:lift`), liftMin, liftMax);
  const scale = valueBetween(hashString(`${rawSeed}:scale`), 1.007, 1.014);

  return {
    '--egg-breathe-duration': `${duration.toFixed(2)}s`,
    '--egg-breathe-delay': `${delay.toFixed(2)}s`,
    '--egg-breathe-lift': `${lift.toFixed(2)}px`,
    '--egg-breathe-scale': scale.toFixed(3),
  };
}

export function monsterMotionStyle(seed, context = 'card') {
  const stage = Math.max(1, Math.min(4, Number(seed?.stage) || 1));
  const profiles = {
    1: { duration: [2.2, 4.1], lift: [8, 15], pan: [6, 13], scale: [1.006, 1.016], tilt: [1.2, 2.8] },
    2: { duration: [3.5, 6.1], lift: [6, 11], pan: [3.5, 8], scale: [1.006, 1.014], tilt: [0.7, 1.7] },
    3: { duration: [5.2, 8.4], lift: [3.5, 6.4], pan: [1.5, 4.6], scale: [1.003, 1.01], tilt: [0.3, 1] },
    4: { duration: [7.6, 11.8], lift: [5, 8.6], pan: [0.8, 3], scale: [1.022, 1.046], tilt: [0.1, 0.5] },
  };
  const profile = profiles[stage];
  const rawSeed = [
    seed?.id,
    seed?.species,
    seed?.branch || seed?.variant,
    stage,
    context,
  ].filter((part) => part != null && part !== '').join(':');
  const sizeFactor = context === 'feature' ? 1.18 : context === 'preview' ? 1.08 : 1;
  const durationFactor = context === 'feature' ? 1.06 : 1;
  const duration = valueBetween(
    hashString(`${rawSeed}:monster-duration`),
    profile.duration[0],
    profile.duration[1],
  ) * durationFactor;
  const delay = -valueBetween(hashString(`${rawSeed}:monster-phase`), 0.1, duration - 0.12);
  const direction = hashString(`${rawSeed}:monster-direction`) % 2 === 0 ? 1 : -1;
  const liftA = valueBetween(hashString(`${rawSeed}:monster-lift-a`), profile.lift[0], profile.lift[1]) * sizeFactor;
  const liftB = valueBetween(hashString(`${rawSeed}:monster-lift-b`), profile.lift[0] * 0.18, profile.lift[1] * 0.58) * sizeFactor;
  const panA = valueBetween(hashString(`${rawSeed}:monster-pan-a`), profile.pan[0], profile.pan[1]) * sizeFactor * direction;
  const panB = valueBetween(hashString(`${rawSeed}:monster-pan-b`), profile.pan[0] * 0.3, profile.pan[1] * 0.92) * sizeFactor * -direction;
  const scaleA = valueBetween(hashString(`${rawSeed}:monster-scale-a`), profile.scale[0], profile.scale[1]);
  const scaleB = valueBetween(hashString(`${rawSeed}:monster-scale-b`), 1.001, Math.max(1.002, profile.scale[0] - 0.002));
  const tiltA = valueBetween(hashString(`${rawSeed}:monster-tilt-a`), profile.tilt[0], profile.tilt[1]) * direction;
  const tiltB = valueBetween(hashString(`${rawSeed}:monster-tilt-b`), profile.tilt[0] * 0.2, profile.tilt[1] * 0.72) * -direction;

  return {
    '--monster-float-duration': `${duration.toFixed(2)}s`,
    '--monster-float-delay': `${delay.toFixed(2)}s`,
    '--monster-float-lift-a': `${liftA.toFixed(2)}px`,
    '--monster-float-lift-b': `${liftB.toFixed(2)}px`,
    '--monster-float-pan-a': `${panA.toFixed(2)}px`,
    '--monster-float-pan-b': `${panB.toFixed(2)}px`,
    '--monster-float-scale-a': scaleA.toFixed(3),
    '--monster-float-scale-b': scaleB.toFixed(3),
    '--monster-float-tilt-a': `${tiltA.toFixed(2)}deg`,
    '--monster-float-tilt-b': `${tiltB.toFixed(2)}deg`,
  };
}

function pickVariant(seed) {
  const value = typeof seed === 'number' ? seed : Math.floor(Math.random() * 2);
  return MONSTER_VARIANTS[value % MONSTER_VARIANTS.length] || 'b1';
}

function variantForMonster(monsterId, stage, catalogueBranch) {
  if (catalogueBranch && MONSTER_VARIANTS.includes(catalogueBranch)) return catalogueBranch;
  const seed = (monsterId.length + stage) % MONSTER_VARIANTS.length;
  return pickVariant(seed);
}

/**
 * Build the meadow monster list from the real monsterSummary payload. Only
 * caught species appear. Stage-1+ monsters claim path-specific slots while
 * caught-but-unhatched species use the egg layout. Uncaught species are
 * hidden until the learner secures their first qualifying word.
 */
export function buildMeadowMonsters(summary = []) {
  const caughtEntries = meadowEntriesByPower(
    summary.filter((entry) => entry.progress?.caught && entry.progress.stage >= 1),
  );
  const eggEntries = meadowEntriesByPower(
    summary.filter((entry) => entry.progress?.caught && entry.progress.stage === 0),
  );
  const slotPools = {
    walk: [...MEADOW_SLOT_POOLS.walk],
    'fly-a': [...MEADOW_SLOT_POOLS['fly-a']],
    'fly-b': [...MEADOW_SLOT_POOLS['fly-b']],
  };
  const monsters = caughtEntries
    .map((entry, index) => buildRoamingMeadowEntry(entry, slotPools, index))
    .filter(Boolean);
  const eggSlots = caughtEntries.length ? MEADOW_SLOT_POOLS.eggMixed : MEADOW_SLOT_POOLS.eggOnly;
  const eggs = eggEntries
    .slice(0, eggSlots.length)
    .map((entry, index) => buildEggMeadowEntry(entry, eggSlots[index], index))
    .filter(Boolean);

  return [...monsters, ...eggs].sort((left, right) => {
    return (left.footPct - right.footPct) || (left.renderOrder - right.renderOrder);
  });
}

function defaultPathForMonster(monsterId) {
  if (monsterId === 'inklet') return 'walk';
  if (monsterId === 'glimmerbug') return 'fly-a';
  if (monsterId === 'phaeton') return 'fly-b';
  return 'walk';
}

function meadowEntriesByPower(entries) {
  return entries.slice().sort((left, right) => {
    const leftStage = Number(left.progress?.stage) || 0;
    const rightStage = Number(right.progress?.stage) || 0;
    if (leftStage !== rightStage) return rightStage - leftStage;
    return codexPowerRank(right.monster?.id) - codexPowerRank(left.monster?.id);
  });
}

function nextMeadowSlot(slotPools, path) {
  return slotPools[path]?.shift()
    || slotPools.walk.shift()
    || slotPools['fly-a'].shift()
    || slotPools['fly-b'].shift()
    || null;
}

function buildRoamingMeadowEntry(entry, slotPools, index) {
  const { monster, progress } = entry;
  const stage = Math.max(1, Math.min(4, Number(progress?.stage) || 1));
  const path = defaultPathForMonster(monster.id);
  const slot = nextMeadowSlot(slotPools, path);
  if (!slot) return null;
  const variant = variantForMonster(monster.id, stage, progress.branch);

  return buildMeadowEntry({
    id: `${monster.id}-caught`,
    monsterId: monster.id,
    stage,
    variant,
    slot,
    path: slot.path || path,
    size: meadowMonsterSize(monster.id, stage, slot.size),
    renderOrder: 20 + index,
  });
}

function buildEggMeadowEntry(entry, slot, index) {
  if (!slot) return null;
  const { monster, progress } = entry;
  const variant = variantForMonster(monster.id, 0, progress.branch);

  return buildMeadowEntry({
    id: `${monster.id}-egg`,
    monsterId: monster.id,
    stage: 0,
    variant,
    slot,
    path: 'none',
    size: meadowEggSize(monster.id, slot.size),
    renderOrder: 60 + index,
  });
}

function buildMeadowEntry({ id, monsterId, stage, variant, slot, path, size, renderOrder }) {
  const x = slot.x || slot.left || '50%';
  const footY = slot.footY || slot.top || '70%';
  const footPct = percentageNumber(footY);
  const perspectiveScale = meadowPerspectiveScale(footPct);
  const renderedSize = Math.round(size * perspectiveScale);

  return {
    id,
    species: monsterId,
    stage,
    variant,
    size: renderedSize,
    baseSize: size,
    x,
    footY,
    footPct,
    left: x,
    top: footY,
    leftPct: percentageNumber(x),
    topPct: footPct,
    perspectiveScale,
    lane: slot.lane || 'ground',
    path,
    dur: slot.dur,
    delay: slot.delay,
    bobDelay: slot.bobDelay,
    roamForward: slot.roamForward,
    roamBack: slot.roamBack,
    roamForwardY: slot.roamForwardY,
    roamBackY: slot.roamBackY,
    renderOrder,
  };
}

function meadowMonsterSize(monsterId, stage, baseSize) {
  const stageScale = MEADOW_STAGE_SCALE[stage] || MEADOW_STAGE_SCALE[1];
  const speciesScale = MEADOW_SPECIES_SCALE[monsterId] || 1;
  return Math.round(baseSize * stageScale * speciesScale);
}

function meadowEggSize(monsterId, baseSize) {
  const speciesScale = MEADOW_SPECIES_SCALE[monsterId] || 1;
  return Math.round(baseSize * speciesScale);
}

function meadowPerspectiveScale(footPct) {
  const rawDepth = (footPct - MEADOW_PERSPECTIVE.farFoot)
    / (MEADOW_PERSPECTIVE.nearFoot - MEADOW_PERSPECTIVE.farFoot);
  const depth = Math.max(0, Math.min(1, rawDepth));
  const scale = MEADOW_PERSPECTIVE.farScale
    + depth * (MEADOW_PERSPECTIVE.nearScale - MEADOW_PERSPECTIVE.farScale);
  return Number(scale.toFixed(3));
}

function percentageNumber(value) {
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Lay out subject cards for the home grid. Spelling gets the region
 * artwork banner; placeholders get a solid accent banner.
 */
export function buildSubjectCards(subjects = [], dashboardStats = {}) {
  return subjects.map((subject) => {
    const decor = subjectDecor(subject.id);
    const stats = dashboardStats[subject.id] || {};
    const available = subject.available !== false;
    const status = available ? 'live' : 'soon';
    const pctRaw = Number(stats.pct);
    const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : 0;
    return {
      id: subject.id,
      name: subject.name,
      blurb: subject.blurb,
      eyebrow: decor.eyebrow || null,
      status,
      glyph: decor.glyph,
      accent: decor.accent,
      regionBase: decor.regionBase || null,
      progress: pct / 100,
      progressLabel: buildProgressLabel(status, stats),
    };
  });
}

export function buildCodexEntries(summary = []) {
  return summary.map(({ monster, progress }) => {
    const mastered = Math.max(0, Number(progress?.mastered) || 0);
    const max = Math.max(1, Number(monster?.masteredMax) || (monster?.id === 'phaeton' ? 200 : 100));
    const stage = Math.max(0, Math.min(4, Number(progress?.stage) || 0));
    const caught = Boolean(progress?.caught);
    const displayState = !caught ? 'fresh' : stage === 0 ? 'egg' : 'monster';
    const variant = variantForMonster(monster.id, stage, progress?.branch);
    const displayName = caught && !(monster.id === 'phaeton' && stage === 0)
      ? monster.nameByStage?.[stage] || monster.name
      : caught
        ? monster.name
      : 'Unknown creature';
    const pct = Math.max(0, Math.min(1, mastered / max));
    const nextMilestone = nextCodexMilestone(monster.id, mastered);
    const imageAlt = caught ? displayName : `${monster.name} not caught`;

    return {
      id: monster.id,
      name: displayName,
      speciesName: monster.name,
      blurb: monster.blurb,
      caught,
      stage,
      level: Math.max(0, Number(progress?.level) || 0),
      mastered,
      max,
      progress: pct,
      progressPct: Math.round(pct * 100),
      colour: monster.accent,
      soft: monster.pale,
      branch: variant,
      displayState,
      img: caught ? monsterAssetPath(monster.id, variant, stage, 640) : null,
      srcSet: caught ? monsterAssetSrcset(monster.id, variant, stage) : '',
      imageAlt,
      placeholder: caught ? '' : '?',
      stageLabel: caught ? (stage === 0 ? 'Egg' : `Stage ${stage}`) : 'Not caught',
      secureLabel: secureWordLabel(mastered),
      nextGoal: codexNextGoal({ caught, nextMilestone }),
      wordBand: codexWordBand(monster.id),
    };
  });
}

export function pickFeaturedCodexEntry(entries = []) {
  return entries
    .slice()
    .sort((left, right) => {
      if (left.caught !== right.caught) return left.caught ? -1 : 1;
      if (left.level !== right.level) return right.level - left.level;

      const powerDifference = codexPowerRank(right.id) - codexPowerRank(left.id);
      if (powerDifference) return powerDifference;

      if (left.stage !== right.stage) return right.stage - left.stage;
      return right.mastered - left.mastered;
    })[0] || null;
}

function codexPowerRank(monsterId) {
  return CODEX_POWER_RANK[monsterId] || 0;
}

function secureWordLabel(mastered) {
  const count = Math.max(0, Number(mastered) || 0);
  if (count === 1) return '1 secure word';
  if (count > 1) return `${count} secure words`;
  return 'No secure words yet';
}

function codexNextGoal({ caught, nextMilestone }) {
  if (!caught && nextMilestone) {
    return 'Secure words to catch this creature';
  }
  if (nextMilestone) {
    return 'Keep securing words for the next change';
  }
  return 'Fully evolved';
}

function nextCodexMilestone(monsterId, mastered) {
  const thresholds = monsterId === 'phaeton' ? PHAETON_STAGE_THRESHOLDS : DIRECT_STAGE_THRESHOLDS;
  return thresholds.find((threshold) => mastered < threshold) || null;
}

function codexWordBand(monsterId) {
  if (monsterId === 'inklet') return 'Years 3-4 spellings';
  if (monsterId === 'glimmerbug') return 'Years 5-6 spellings';
  if (monsterId === 'phaeton') return 'Whole spelling codex';
  return 'Spelling codex';
}

function buildProgressLabel(status, stats) {
  if (status !== 'live') return 'Coming soon';
  const parts = [];
  if (stats.nextUp) parts.push(stats.nextUp);
  if (stats.due != null && stats.due !== '—') parts.push(`${stats.due} due`);
  return parts.join(' · ') || 'Ready to begin';
}

export function greetForHour(hour) {
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

export function dueCopy(due) {
  const n = Number(due) || 0;
  if (n === 0) return 'Nothing due today — explore for fun.';
  if (n === 1) return 'One word due — one careful try.';
  return `${n} due — you can do this.`;
}
