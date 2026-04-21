const MONSTER_VARIANTS = ['b1', 'b2'];
const DIRECT_STAGE_THRESHOLDS = Object.freeze([1, 10, 30, 60, 90]);
const PHAETON_STAGE_THRESHOLDS = Object.freeze([3, 25, 95, 145, 200]);

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

const MEADOW_SLOTS = Object.freeze([
  { slot: 'anchor-walker',  size: 148, left: '56%', top: '52%', path: 'walk',  dur: 26, delay: 0,   bobDelay: 0   },
  { slot: 'anchor-flyer-a', size: 112, left: '76%', top: '10%', path: 'fly-a', dur: 16, delay: 1.2, bobDelay: 0.6 },
  { slot: 'anchor-flyer-b', size: 108, left: '38%', top: '24%', path: 'fly-b', dur: 19, delay: 2.4, bobDelay: 1.2 },
  { slot: 'satellite-a',    size:  82, left: '86%', top: '48%', path: 'walk',  dur: 22, delay: 3.6, bobDelay: 0.3 },
  { slot: 'satellite-b',    size:  72, left: '64%', top:  '2%', path: 'fly-a', dur: 14, delay: 4.8, bobDelay: 0.9 },
]);

const EGG_SLOTS = Object.freeze([
  { slot: 'egg-a', size: 68, left: '44%', top: '58%' },
  { slot: 'egg-b', size: 60, left: '62%', top: '64%' },
  { slot: 'egg-c', size: 58, left: '30%', top: '66%' },
]);

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
 * caught species appear — stage-1+ monsters roam via MEADOW_SLOTS while
 * caught-but-unhatched (stage 0) species claim an EGG_SLOT. Uncaught
 * species are hidden until the learner secures their first qualifying word.
 */
export function buildMeadowMonsters(summary = []) {
  const walkSlots = MEADOW_SLOTS.filter((slot) => slot.path === 'walk');
  const flyASlots = MEADOW_SLOTS.filter((slot) => slot.path === 'fly-a');
  const flyBSlots = MEADOW_SLOTS.filter((slot) => slot.path === 'fly-b');
  const buckets = { walk: [...walkSlots], 'fly-a': [...flyASlots], 'fly-b': [...flyBSlots] };

  const caughtEntries = summary.filter((entry) => entry.progress?.caught && entry.progress.stage >= 1);
  const eggEntries = summary.filter((entry) => entry.progress?.caught && entry.progress.stage === 0);

  const monsters = [];

  for (const entry of caughtEntries) {
    const { monster, progress } = entry;
    const path = defaultPathForMonster(monster.id);
    const slot = buckets[path]?.shift() || buckets.walk.shift() || MEADOW_SLOTS[0];
    const variant = variantForMonster(monster.id, progress.stage, progress.branch);
    monsters.push({
      id: `${monster.id}-caught`,
      species: monster.id,
      stage: progress.stage,
      variant,
      size: slot.size,
      left: slot.left,
      top: slot.top,
      path: slot.path,
      dur: slot.dur,
      delay: slot.delay,
      bobDelay: slot.bobDelay,
    });
  }

  const eggPool = [...EGG_SLOTS];
  for (const entry of eggEntries.slice(0, EGG_SLOTS.length)) {
    const { monster, progress } = entry;
    const slot = eggPool.shift();
    if (!slot) break;
    const variant = variantForMonster(monster.id, 0, progress.branch);
    monsters.push({
      id: `${monster.id}-egg`,
      species: monster.id,
      stage: 0,
      variant,
      size: slot.size,
      left: slot.left,
      top: slot.top,
      path: 'none',
    });
  }

  return monsters;
}

function defaultPathForMonster(monsterId) {
  if (monsterId === 'inklet') return 'walk';
  if (monsterId === 'glimmerbug') return 'fly-a';
  if (monsterId === 'phaeton') return 'fly-b';
  return 'walk';
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
    const variant = variantForMonster(monster.id, stage, progress?.branch);
    const displayName = caught
      ? monster.nameByStage?.[stage] || monster.name
      : monster.nameByStage?.[0] || monster.name;
    const pct = Math.max(0, Math.min(1, mastered / max));
    const nextMilestone = nextCodexMilestone(monster.id, mastered);

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
      img: monsterAssetPath(monster.id, variant, stage, 640),
      srcSet: monsterAssetSrcset(monster.id, variant, stage),
      stageLabel: caught ? `Stage ${stage}` : 'Not caught',
      secureLabel: `${mastered} / ${max} secure`,
      nextGoal: nextMilestone
        ? `${Math.max(0, nextMilestone - mastered)} more for the next change`
        : 'Fully evolved',
      wordBand: codexWordBand(monster.id),
    };
  });
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
