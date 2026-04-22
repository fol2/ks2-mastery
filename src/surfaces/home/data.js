import {
  CODEX_REFERENCE_STAGE_SIZES,
  CODEX_STAGE_SCALE,
} from './codex-visual-scale.js';

const MONSTER_VARIANTS = ['b1', 'b2'];
const DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 90]);
const PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 200]);
const CODEX_POWER_RANK = Object.freeze({
  inklet: 1,
  glimmerbug: 2,
  phaeton: 3,
  vellhorn: 4,
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

const MEADOW_SPECIES_SCALE = Object.freeze({
  inklet: 1.02,
  glimmerbug: 0.94,
  phaeton: 1.08,
  vellhorn: 1,
});

const MEADOW_RANDOM_ZONES = Object.freeze({
  eggOnly: Object.freeze({
    x: [25, 82],
    footY: [60, 82],
    size: [160, 220],
    lane: 'ground',
  }),
  eggMixed: Object.freeze({
    x: [24, 78],
    footY: [68, 84],
    size: [145, 184],
    lane: 'ground',
  }),
  walk: Object.freeze({
    x: [28, 78],
    footY: [72, 86],
    size: [172, 210],
    lane: 'ground',
    path: 'walk',
    dur: [22, 28],
    roamForward: [28, 52],
    roamBack: [22, 40],
  }),
  'walk-b': Object.freeze({
    x: [18, 46],
    footY: [74, 86],
    size: [168, 206],
    lane: 'ground',
    path: 'walk',
    dur: [23, 30],
    roamForward: [20, 38],
    roamBack: [24, 42],
  }),
  'fly-a': Object.freeze({
    x: [36, 86],
    footY: [50, 74],
    size: [124, 166],
    lane: 'air',
    path: 'fly-a',
    dur: [14, 19],
    roamForward: [24, 52],
    roamBack: [20, 34],
    roamForwardY: [-4, 4],
    roamBackY: [8, 18],
  }),
  'fly-b': Object.freeze({
    x: [30, 82],
    footY: [56, 80],
    size: [130, 172],
    lane: 'air',
    path: 'fly-b',
    dur: [17, 22],
    roamForward: [24, 48],
    roamBack: [28, 56],
    roamForwardY: [-10, -2],
    roamBackY: [12, 24],
  }),
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
  'vellhorn-b1-0': 'right',  'vellhorn-b1-1': 'right',  'vellhorn-b1-2': 'right',
  'vellhorn-b1-3': 'right',  'vellhorn-b1-4': 'right',
  'vellhorn-b2-0': 'left',   'vellhorn-b2-1': 'left',   'vellhorn-b2-2': 'left',
  'vellhorn-b2-3': 'left',   'vellhorn-b2-4': 'left',
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
 * caught species appear. Stage-1+ monsters and caught-but-unhatched
 * species are placed through a seeded meadow projection, so their foot
 * points can move around the hero while preserving depth and scale.
 * Uncaught species are hidden until the learner secures their first
 * qualifying word.
 */
export function buildMeadowMonsters(summary = [], { seed = 'default-meadow' } = {}) {
  const caughtEntries = meadowEntriesByPower(
    summary.filter((entry) => entry.progress?.caught && entry.progress.stage >= 1),
  );
  const eggEntries = meadowEntriesByPower(
    summary.filter((entry) => entry.progress?.caught && entry.progress.stage === 0),
  );
  const placed = [];
  const monsters = caughtEntries
    .map((entry, index) => buildRoamingMeadowEntry(entry, { index, placed, seed }))
    .filter(Boolean);
  const eggZone = caughtEntries.length ? 'eggMixed' : 'eggOnly';
  const eggs = eggEntries
    .slice(0, 5)
    .map((entry, index) => buildEggMeadowEntry(entry, { index, placed, seed, zoneName: eggZone }))
    .filter(Boolean);

  return [...monsters, ...eggs].sort((left, right) => {
    return (left.footPct - right.footPct) || (left.renderOrder - right.renderOrder);
  });
}

function defaultPathForMonster(monsterId) {
  if (monsterId === 'inklet') return 'walk';
  if (monsterId === 'glimmerbug') return 'fly-a';
  if (monsterId === 'phaeton') return 'fly-b';
  if (monsterId === 'vellhorn') return 'walk-b';
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

function buildRoamingMeadowEntry(entry, { index, placed, seed }) {
  const { monster, progress } = entry;
  const stage = Math.max(1, Math.min(4, Number(progress?.stage) || 1));
  const path = defaultPathForMonster(monster.id);
  const slot = randomMeadowSlot({ entry, zoneName: path, index, placed, seed, stage });
  const variant = variantForMonster(monster.id, stage, progress.branch);
  placed.push(slot);

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

function buildEggMeadowEntry(entry, { index, placed, seed, zoneName }) {
  const { monster, progress } = entry;
  const slot = randomMeadowSlot({ entry, zoneName, index, placed, seed, stage: 0 });
  const variant = variantForMonster(monster.id, 0, progress.branch);
  placed.push(slot);

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

function randomMeadowSlot({ entry, zoneName, index, placed, seed, stage }) {
  const zone = meadowZoneForStage(zoneName, stage);
  const rawSeed = [
    seed,
    entry?.monster?.id,
    entry?.progress?.branch,
    stage,
    zoneName,
    index,
  ].filter((part) => part != null && part !== '').join(':');
  let candidate = null;
  let bestCandidate = null;
  let bestScore = -Infinity;

  function remember(nextCandidate) {
    const score = meadowSpacingScore(nextCandidate, placed);
    if (score > bestScore) {
      bestCandidate = nextCandidate;
      bestScore = score;
    }
    return nextCandidate;
  }

  for (let attempt = 0; attempt < 48; attempt += 1) {
    candidate = remember(buildMeadowSlotCandidate(zone, rawSeed, attempt));
    if (hasMeadowSpacing(candidate, placed)) return candidate;
  }

  const columns = 9;
  const rows = 6;
  const cells = columns * rows;
  const startCell = hashString(`${rawSeed}:fallback-grid`) % cells;
  for (let step = 0; step < cells; step += 1) {
    const cell = (startCell + step * 11) % cells;
    const xFraction = columns === 1 ? 0.5 : (cell % columns) / (columns - 1);
    const yFraction = rows === 1 ? 0.5 : Math.floor(cell / columns) / (rows - 1);
    const xPct = interpolateRange(zone.x, xFraction);
    const footPct = interpolateRange(zone.footY, yFraction);
    candidate = remember(withMeadowSlotPosition(
      buildMeadowSlotCandidate(zone, rawSeed, 30 + step),
      xPct,
      footPct,
    ));
    if (hasMeadowSpacing(candidate, placed)) return candidate;
  }

  return bestCandidate || candidate || buildMeadowSlotCandidate(zone, rawSeed, 0);
}

function meadowZoneForStage(zoneName, stage) {
  const zone = MEADOW_RANDOM_ZONES[zoneName] || MEADOW_RANDOM_ZONES.walk;
  if (stage < 3 || zone.path === 'none') return zone;
  const matureKey = MEADOW_RANDOM_ZONES[zoneName] ? zoneName : zone.path;
  const matureXByPath = {
    walk: [45, 70],
    'walk-b': [22, 40],
    'fly-a': [64, 86],
    'fly-b': [44, 62],
  };
  const matureFootYByPath = {
    walk: [78, 86],
    'walk-b': [82, 86],
    'fly-a': [58, 66],
    'fly-b': [66, 78],
  };
  return {
    ...zone,
    x: matureXByPath[matureKey] || matureXByPath[zone.path] || zone.x,
    footY: matureFootYByPath[matureKey] || matureFootYByPath[zone.path] || [Math.max(zone.footY[0], 58), zone.footY[1]],
  };
}

function buildMeadowSlotCandidate(zone, rawSeed, attempt) {
  const xPct = valueBetween(hashString(`${rawSeed}:x:${attempt}`), zone.x[0], zone.x[1]);
  const footPct = valueBetween(hashString(`${rawSeed}:foot:${attempt}`), zone.footY[0], zone.footY[1]);
  const size = Math.round(valueBetween(hashString(`${rawSeed}:size:${attempt}`), zone.size[0], zone.size[1]));
  const duration = zone.dur
    ? valueBetween(hashString(`${rawSeed}:dur:${attempt}`), zone.dur[0], zone.dur[1])
    : 0;

  return {
    slot: `random-${hashString(`${rawSeed}:slot:${attempt}`).toString(36)}`,
    size,
    x: `${xPct.toFixed(1)}%`,
    footY: `${footPct.toFixed(1)}%`,
    xPct,
    footPct,
    lane: zone.lane,
    path: zone.path || 'none',
    dur: duration ? Number(duration.toFixed(2)) : 0,
    delay: Number((-valueBetween(hashString(`${rawSeed}:delay:${attempt}`), 0, Math.max(0.5, duration || 4))).toFixed(2)),
    bobDelay: Number(valueBetween(hashString(`${rawSeed}:bob:${attempt}`), 0, 1.4).toFixed(2)),
    roamForward: roundedZoneValue(zone.roamForward, rawSeed, attempt, 'forward'),
    roamBack: roundedZoneValue(zone.roamBack, rawSeed, attempt, 'back'),
    roamForwardY: roundedZoneValue(zone.roamForwardY, rawSeed, attempt, 'forward-y'),
    roamBackY: roundedZoneValue(zone.roamBackY, rawSeed, attempt, 'back-y'),
  };
}

function roundedZoneValue(range, rawSeed, attempt, label) {
  if (!range) return undefined;
  return Math.round(valueBetween(hashString(`${rawSeed}:${label}:${attempt}`), range[0], range[1]));
}

function interpolateRange(range, fraction) {
  return range[0] + Math.max(0, Math.min(1, fraction)) * (range[1] - range[0]);
}

function withMeadowSlotPosition(candidate, xPct, footPct) {
  return {
    ...candidate,
    x: `${xPct.toFixed(1)}%`,
    footY: `${footPct.toFixed(1)}%`,
    xPct,
    footPct,
  };
}

function hasMeadowSpacing(candidate, placed) {
  return placed.every((other) => {
    return meadowDistance(candidate, other) >= meadowMinimumSpacing(candidate, other);
  });
}

function meadowSpacingScore(candidate, placed) {
  if (!placed.length) return Infinity;
  return Math.min(...placed.map((other) => {
    const minimum = meadowMinimumSpacing(candidate, other);
    return meadowDistance(candidate, other) / minimum;
  }));
}

function meadowDistance(left, right) {
  const dx = left.xPct - right.xPct;
  const dy = (left.footPct - right.footPct) * 1.45;
  return Math.hypot(dx, dy);
}

function meadowMinimumSpacing(left, right) {
  const hasMonster = left.path !== 'none' || right.path !== 'none';
  return hasMonster ? 30 : 17;
}

function buildMeadowEntry({ id, monsterId, stage, variant, slot, path, size, renderOrder }) {
  const x = slot.x || slot.left || '50%';
  const footY = slot.footY || slot.top || '70%';
  const footPct = percentageNumber(footY);
  const perspectiveScale = meadowPerspectiveScale(footPct);
  const stageScale = meadowStageScale(stage);
  const codexSize = meadowCodexSize(stage);
  const renderedSize = Math.round(size * perspectiveScale);

  return {
    id,
    species: monsterId,
    stage,
    variant,
    size: renderedSize,
    baseSize: size,
    codexSize,
    stageScale,
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
  const stageScale = meadowStageScale(stage);
  const speciesScale = MEADOW_SPECIES_SCALE[monsterId] || 1;
  return Math.round(baseSize * stageScale * speciesScale);
}

function meadowEggSize(monsterId, baseSize) {
  return meadowMonsterSize(monsterId, 0, baseSize);
}

function meadowCodexSize(stage) {
  return CODEX_REFERENCE_STAGE_SIZES[Math.max(0, Math.min(4, Number(stage) || 0))]
    || CODEX_REFERENCE_STAGE_SIZES[0];
}

function meadowStageScale(stage) {
  return CODEX_STAGE_SCALE[Math.max(0, Math.min(4, Number(stage) || 0))]
    || CODEX_STAGE_SCALE[0];
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
  if (monsterId === 'vellhorn') return 'Extra spellings';
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
