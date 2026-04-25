import {
  CODEX_REFERENCE_STAGE_SIZES,
  CODEX_STAGE_SCALE,
} from './codex-visual-scale.js';
import {
  DIRECT_STAGE_THRESHOLDS,
  MONSTERS,
  MONSTERS_BY_SUBJECT,
  PHAETON_STAGE_THRESHOLDS,
} from '../../platform/game/monsters.js';
import { hashString, valueBetween } from '../../platform/game/render/seed.js';
import { computeEggBreatheStyle } from '../../platform/game/render/effects/egg-breathe.js';
import { computeMonsterMotionStyle } from '../../platform/game/render/effects/monster-motion-float.js';
import {
  buildMonsterAssetKey,
  defaultMonsterMeadowPath,
  monsterVisualAssetPath,
  monsterVisualAssetSources,
  monsterVisualFaceSign,
} from '../../platform/game/monster-visual-config.js';

const MONSTER_VARIANTS = ['b1', 'b2'];
const CODEX_POWER_RANK = Object.freeze({
  inklet: 1,
  glimmerbug: 2,
  phaeton: 3,
  vellhorn: 4,
  pealark: 5,
  claspin: 6,
  quoral: 7,
  curlune: 8,
  colisk: 9,
  hyphang: 10,
  carillon: 11,
  bracehart: 12,
  glossbloom: 13,
  loomrill: 14,
  chronalyx: 15,
  couronnail: 16,
  mirrane: 17,
  concordium: 18,
});

const SUBJECT_NAMES = Object.freeze({
  spelling: 'Spelling',
  arithmetic: 'Arithmetic',
  reasoning: 'Reasoning',
  grammar: 'Grammar',
  punctuation: 'Punctuation',
  reading: 'Reading',
});

const SUBJECT_MONSTER_NOUNS = Object.freeze({
  spelling: 'spellings',
  punctuation: 'punctuation units',
  grammar: 'grammar units',
  reading: 'reading evidence',
  arithmetic: 'arithmetic units',
  reasoning: 'reasoning units',
});

export const REGION_BACKGROUND_URLS = Object.freeze([
  '/assets/regions/the-scribe-downs/the-scribe-downs-a1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-a2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-a3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-b1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-b2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-b3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-c1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-c2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-c3.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-d1.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-d2.1280.webp',
  '/assets/regions/the-scribe-downs/the-scribe-downs-d3.1280.webp',
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

const SUBJECT_DECOR = Object.freeze({
  spelling: {
    eyebrow: 'The Scribe Downs',
    glyph: 'Sp',
    accent: 'linear-gradient(135deg, #3E6FA8, #B43CD9)',
    regionBase: '/assets/regions/the-scribe-downs/the-scribe-downs-cover',
  },
  arithmetic: {
    eyebrow: 'The Prism Steps',
    glyph: '×÷',
    accent: 'linear-gradient(135deg, #C06B3E, #F2B756)',
    regionBase: '/assets/regions/prism-steps/prism-steps-cover',
  },
  reasoning: {
    eyebrow: 'Paradox Spires',
    glyph: '∴',
    accent: 'linear-gradient(135deg, #8A5A9D, #C4A5D4)',
    regionBase: '/assets/regions/paradox-spires/paradox-spires-cover',
  },
  grammar: {
    eyebrow: 'The Clause Conservatory',
    glyph: '¶',
    accent: 'linear-gradient(135deg, #2E8479, #78C2B4)',
    regionBase: '/assets/regions/the-clause-conservatory/the-clause-conservatory-cover',
  },
  punctuation: {
    eyebrow: 'Bellstorm Coast',
    glyph: ';',
    accent: 'linear-gradient(135deg, #B8873F, #E8C88E)',
    regionBase: '/assets/regions/bellstorm-coast/bellstorm-coast-cover',
  },
  reading: {
    eyebrow: 'The Moonleaf Archive',
    glyph: 'Rd',
    accent: 'linear-gradient(135deg, #4B7A4A, #9CC59A)',
    regionBase: '/assets/regions/the-moonleaf-archive/the-moonleaf-archive-cover',
  },
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
  return monsterVisualFaceSign(species, variant, stage);
}

export function monsterAssetPath(species, variant, stage, size) {
  return monsterVisualAssetPath(buildMonsterAssetKey(species, variant, stage), size, {
    versioned: false,
  });
}

export function monsterAssetSrcset(species, variant, stage) {
  return monsterVisualAssetSources(buildMonsterAssetKey(species, variant, stage), {
    versioned: false,
  }).srcSet;
}

// Backward-compatible shims: existing surface code still imports
// `eggBreatheStyle` / `monsterMotionStyle` from this module. Both now
// delegate to the canonical effect modules under
// `src/platform/game/render/effects/` so behaviour stays byte-identical.
export function eggBreatheStyle(seed, context = 'card') {
  return computeEggBreatheStyle(seed, context);
}

export function monsterMotionStyle(seed, context = 'card') {
  return computeMonsterMotionStyle(seed, context);
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
  return defaultMonsterMeadowPath(monsterId, 1);
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
 * Lay out subject cards for the home grid. Subjects with region artwork use
 * responsive cover banners; fallback subjects keep a solid accent banner.
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
  return withSynthesisedUncaughtMonsters(summary).map(({ monster, progress, subjectId = 'spelling' }) => {
    const resolvedSubjectId = subjectId || progress?.subjectId || 'spelling';
    const mastered = Math.max(0, Number(progress?.mastered) || 0);
    const isUnitSubject = resolvedSubjectId === 'punctuation' || resolvedSubjectId === 'grammar';
    const max = isUnitSubject
      ? Math.max(1, Number(progress?.publishedTotal) || Number(monster?.masteredMax) || 1)
      : Math.max(1, Number(monster?.masteredMax) || (monster?.id === 'phaeton' ? 213 : 100));
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
    const nextMilestone = nextCodexMilestone(monster.id, mastered, { subjectId: resolvedSubjectId, max });
    const imageAlt = caught ? displayName : `${monster.name} not caught`;

    return {
      id: monster.id,
      subjectId: resolvedSubjectId,
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
      secureLabel: secureProgressLabel(resolvedSubjectId, mastered),
      nextGoal: codexNextGoal({ subjectId: resolvedSubjectId, caught, nextMilestone }),
      wordBand: codexWordBand(monster.id, resolvedSubjectId),
    };
  });
}

function withSynthesisedUncaughtMonsters(summary = []) {
  const presentIds = new Set(
    summary.map(({ monster }) => monster?.id).filter(Boolean),
  );
  const synthesised = [];
  for (const [subjectId, monsterIds] of Object.entries(MONSTERS_BY_SUBJECT)) {
    for (const monsterId of monsterIds) {
      if (presentIds.has(monsterId)) continue;
      const monster = MONSTERS[monsterId];
      if (!monster) continue;
      synthesised.push({
        subjectId,
        monster,
        progress: { caught: false, mastered: 0, stage: 0, level: 0 },
      });
    }
  }
  return [...summary, ...synthesised];
}

export function buildCodexSubjectGroups(entries = []) {
  return Object.keys(MONSTERS_BY_SUBJECT)
    .map((subjectId) => {
      const subjectEntries = entries.filter((entry) => entry.subjectId === subjectId);
      if (!subjectEntries.length) return null;
      return {
        subjectId,
        decor: subjectDecor(subjectId),
        subjectName: subjectName(subjectId),
        entries: subjectEntries,
        totals: codexSubjectTotals(subjectEntries),
        status: deriveSubjectStatus(subjectEntries),
      };
    })
    .filter(Boolean);
}

export function subjectName(subjectId) {
  return SUBJECT_NAMES[subjectId] || subjectId;
}

export function subjectMonsterNoun(subjectId) {
  return SUBJECT_MONSTER_NOUNS[subjectId] || subjectName(subjectId).toLowerCase();
}

export function formatSubjectList(names = []) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function codexSubjectTotals(entries) {
  const caught = entries.filter((entry) => entry.caught).length;
  const total = entries.length;
  const progressPct = total
    ? Math.round(entries.reduce((sum, entry) => sum + (entry.progressPct || 0), 0) / total)
    : 0;
  return { caught, total, progressPct };
}

function deriveSubjectStatus(entries) {
  if (!entries.some((entry) => entry.caught)) return 'unstarted';
  if (entries.every((entry) => entry.caught && entry.stage >= 4)) return 'mastered';
  return 'in-progress';
}

export function pickFeaturedCodexEntry(entries = []) {
  return entries
    .slice()
    .sort((left, right) => {
      if (left.caught !== right.caught) return left.caught ? -1 : 1;
      if (left.level !== right.level) return right.level - left.level;

      // Fresh learners (nothing caught) deserve a familiar on-ramp before they
      // see grammar/punctuation legendaries. Use subject priority first.
      if (!left.caught) {
        const subjectDifference = subjectPriority(left.subjectId) - subjectPriority(right.subjectId);
        if (subjectDifference) return subjectDifference;
      }

      const powerDifference = codexPowerRank(right.id) - codexPowerRank(left.id);
      if (powerDifference) return powerDifference;

      if (left.stage !== right.stage) return right.stage - left.stage;
      return right.mastered - left.mastered;
    })[0] || null;
}

function codexPowerRank(monsterId) {
  return CODEX_POWER_RANK[monsterId] || 0;
}

// Lower index = earlier on-ramp; mirrors the curriculum order encoded by
// MONSTERS_BY_SUBJECT declaration order in src/platform/game/monsters.js.
function subjectPriority(subjectId) {
  const idx = Object.keys(MONSTERS_BY_SUBJECT).indexOf(subjectId);
  return idx === -1 ? 999 : idx;
}

function secureProgressLabel(subjectId, mastered) {
  const count = Math.max(0, Number(mastered) || 0);
  if (subjectId === 'punctuation' || subjectId === 'grammar') {
    if (count === 1) return '1 secure unit';
    if (count > 1) return `${count} secure units`;
    return 'No secure units yet';
  }
  if (count === 1) return '1 secure word';
  if (count > 1) return `${count} secure words`;
  return 'No secure words yet';
}

function codexNextGoal({ subjectId, caught, nextMilestone }) {
  if (!caught && nextMilestone) {
    if (subjectId === 'punctuation') return 'Secure punctuation units to catch this creature';
    if (subjectId === 'grammar') return 'Secure grammar units to catch this creature';
    return 'Secure words to catch this creature';
  }
  if (nextMilestone) {
    if (subjectId === 'punctuation') return 'Keep securing punctuation units for the next change';
    if (subjectId === 'grammar') return 'Keep securing grammar units for the next change';
    return 'Keep securing words for the next change';
  }
  return 'Fully evolved';
}

function nextCodexMilestone(monsterId, mastered, { subjectId = 'spelling', max = null } = {}) {
  if (subjectId === 'punctuation' || subjectId === 'grammar') {
    const limit = Math.max(1, Number(max) || 1);
    return mastered < limit ? mastered + 1 : null;
  }
  const thresholds = monsterId === 'phaeton' ? PHAETON_STAGE_THRESHOLDS : DIRECT_STAGE_THRESHOLDS;
  return thresholds.find((threshold) => mastered < threshold) || null;
}

function codexWordBand(monsterId, subjectId = 'spelling') {
  if (subjectId === 'punctuation') {
    if (monsterId === 'pealark') return 'Endmarks';
    if (monsterId === 'claspin') return 'Apostrophe';
    if (monsterId === 'quoral') return 'Speech punctuation';
    if (monsterId === 'curlune') return 'Comma and flow';
    if (monsterId === 'colisk') return 'List and structure';
    if (monsterId === 'hyphang') return 'Boundary punctuation';
    if (monsterId === 'carillon') return 'Published punctuation release';
    return 'Punctuation codex';
  }
  if (subjectId === 'grammar') {
    if (monsterId === 'bracehart') return 'Sentence and clause';
    if (monsterId === 'glossbloom') return 'Word class and noun phrase';
    if (monsterId === 'loomrill') return 'Flow and cohesion';
    if (monsterId === 'chronalyx') return 'Verb tense and modal';
    if (monsterId === 'couronnail') return 'Standard English';
    if (monsterId === 'mirrane') return 'Voice and role';
    if (monsterId === 'concordium') return 'Whole grammar codex';
    return 'Grammar codex';
  }
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
