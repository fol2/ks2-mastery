import { stableHash } from '../../../platform/core/utils.js';

/* Grammar hero backdrop view-model.
 *
 * Mirrors the shape of `spelling-view-model.js`'s hero helpers so the
 * platform-level engine (`HeroBackdrop`, `useSetupHeroContrast`,
 * `probeHeroTextTones`) can drive Grammar's setup scene with the same
 * cross-fade, pan, and contrast probing it gives Spelling.
 *
 * Asset layout:
 *   /assets/regions/the-clause-conservatory/the-clause-conservatory-{region}{tone}.{size}.webp
 *
 * Region letters map to the three primary modes:
 *   smart    → a
 *   trouble  → b
 *   satsset  → c
 *
 * `d` and `e` are reserved for future surfaces (e.g. a transfer scene
 * background) so the URL space stays unified with the existing
 * Conservatory artwork.
 *
 * Tones (1 / 2 / 3) are picked per learner via a stable hash so a
 * learner sees the same vista across reloads. Setup tones can rotate via
 * `selectGrammarSetupTone` when the controller wants to refresh — same
 * pattern Spelling uses for its tone shuffle. */

const CLAUSE_CONSERVATORY_BASE = '/assets/regions/the-clause-conservatory';

export const grammarHeroUrl = (variant, size = 1280) => (
  `${CLAUSE_CONSERVATORY_BASE}/the-clause-conservatory-${variant}.${size}.webp`
);

export const GRAMMAR_HERO_REGIONS = Object.freeze({
  smart: Object.freeze(['a']),
  trouble: Object.freeze(['b']),
  satsset: Object.freeze(['c']),
});

export const GRAMMAR_HERO_TONES = Object.freeze(['1', '2', '3']);
export const GRAMMAR_HERO_MODE_INDEX = Object.freeze({ smart: 0, trouble: 1, satsset: 2 });

const CONTRAST_DARK = 'dark';
const CONTRAST_LIGHT = 'light';

/* Curated per-tone contrast envelope. Tone 1 sits over light dawn skies
 * (clean dark ink reads), tones 2 + 3 sit over saturated jungle tones
 * (light ink reads). The runtime probe will refine per-card if the
 * artwork ever evolves and one of these defaults stops fitting. */
export const GRAMMAR_HERO_CONTRAST_BY_TONE = Object.freeze({
  1: Object.freeze({
    shell: CONTRAST_DARK,
    controls: CONTRAST_DARK,
    cards: Object.freeze([CONTRAST_DARK, CONTRAST_DARK, CONTRAST_DARK]),
  }),
  2: Object.freeze({
    shell: CONTRAST_LIGHT,
    controls: CONTRAST_LIGHT,
    cards: Object.freeze([CONTRAST_LIGHT, CONTRAST_LIGHT, CONTRAST_LIGHT]),
  }),
  3: Object.freeze({
    shell: CONTRAST_LIGHT,
    controls: CONTRAST_LIGHT,
    cards: Object.freeze([CONTRAST_LIGHT, CONTRAST_LIGHT, CONTRAST_LIGHT]),
  }),
});

export function grammarHeroMode(mode) {
  if (mode === 'trouble') return 'trouble';
  if (mode === 'satsset') return 'satsset';
  return 'smart';
}

export function grammarHeroTone(learnerId) {
  const index = stableHash(`grammar:tone:${learnerId}`) % GRAMMAR_HERO_TONES.length;
  return GRAMMAR_HERO_TONES[index];
}

export function selectGrammarSetupTone(learnerId, previousTone = '') {
  if (!GRAMMAR_HERO_TONES.length) return '1';
  let entropy = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bucket = new Uint32Array(1);
    crypto.getRandomValues(bucket);
    entropy = bucket[0];
  }
  const index = stableHash(`grammar:setup-tone:${learnerId}:${Date.now()}:${entropy}`) % GRAMMAR_HERO_TONES.length;
  const tone = GRAMMAR_HERO_TONES[index];
  if (previousTone && tone === previousTone && GRAMMAR_HERO_TONES.length > 1) {
    return GRAMMAR_HERO_TONES[(index + 1) % GRAMMAR_HERO_TONES.length];
  }
  return tone;
}

export function heroBgForGrammarMode(mode, learnerId, options = {}) {
  const heroMode = grammarHeroMode(mode);
  const regions = GRAMMAR_HERO_REGIONS[heroMode] || GRAMMAR_HERO_REGIONS.smart;
  if (!regions.length) return '';
  const regionIndex = stableHash(`grammar:region:${heroMode}:${learnerId}`) % regions.length;
  const tone = GRAMMAR_HERO_TONES.includes(String(options.tone))
    ? String(options.tone)
    : grammarHeroTone(learnerId);
  return grammarHeroUrl(`${regions[regionIndex]}${tone}`);
}

export function heroBgForGrammarSetup(learnerId, prefs, options = {}) {
  return heroBgForGrammarMode(prefs?.mode, learnerId, options);
}

export function heroToneForGrammarBg(url) {
  const text = String(url || '');
  const variant = text.match(/the-clause-conservatory-[a-e]([1-3])\.\d+\.webp(?:$|[?#])/);
  return variant?.[1] || '';
}

export function heroContrastProfileForGrammarBg(url, mode = 'smart') {
  const text = String(url || '');
  const variant = text.match(/the-clause-conservatory-([a-e])([1-3])\.\d+\.webp(?:$|[?#])/);
  if (!variant) return null;
  const base = GRAMMAR_HERO_CONTRAST_BY_TONE[variant[2]];
  if (!base) return null;
  /* For the very first tone (1, light dawn artwork) we keep the selected
   * card a solid dark ink so the active mode card sits highest on the
   * type ladder. Tones 2 / 3 inherit the base envelope unchanged. */
  const selectedIndex = GRAMMAR_HERO_MODE_INDEX[grammarHeroMode(mode)];
  const preferSelectedDark = variant[2] === '1';
  const cards = base.cards.map((tone, index) => (
    index === selectedIndex && preferSelectedDark ? CONTRAST_DARK : tone
  ));
  return {
    tone: variant[2],
    shell: base.shell,
    controls: base.controls,
    cards,
  };
}

export function grammarHeroPreloadUrls(learnerId, prefs = {}) {
  if (!learnerId) return [];
  const modes = ['smart', 'trouble', 'satsset'];
  const setupTone = grammarHeroTone(learnerId);
  const setupUrls = modes.map((mode) => heroBgForGrammarMode(mode, learnerId, { tone: setupTone }));
  const sessionMode = prefs?.mode || 'smart';
  const sessionUrls = GRAMMAR_HERO_TONES.map((tone) => heroBgForGrammarMode(sessionMode, learnerId, { tone }));
  return [...new Set([...setupUrls, ...sessionUrls].filter(Boolean))];
}
