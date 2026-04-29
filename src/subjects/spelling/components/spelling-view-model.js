import { monsterSummaryFromSpellingAnalytics } from '../../../platform/game/monster-system.js';
import { resolveMonsterVisual } from '../../../platform/game/monster-visual-config.js';
import { monsterVisualFrameStyle } from '../../../platform/game/monster-visual-style.js';
import { formatElapsedMinutes, stableHash as platformStableHash } from '../../../platform/core/utils.js';
import {
  HERO_PAN_SECONDS,
  heroBgStyle as platformHeroBgStyle,
  heroPanDelayStyle as platformHeroPanDelayStyle,
} from '../../../platform/ui/hero-bg.js';
import { createLockedPostMasteryState, isGuardianEligibleSlug } from '../service-contract.js';

export const SPELLING_ACCENT = '#3E6FA8';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MODE_CARDS = Object.freeze([
  {
    id: 'smart',
    iconSrc: '/assets/icons/spelling-modes/smart-review.webp',
    title: 'Smart Review',
    desc: 'Due · weak · one fresh word.',
  },
  {
    id: 'trouble',
    iconSrc: '/assets/icons/spelling-modes/trouble-drill.webp',
    title: 'Trouble Drill',
    desc: 'Only the words you usually miss.',
  },
  {
    id: 'test',
    iconSrc: '/assets/icons/spelling-modes/sats-test.webp',
    title: 'SATs Test',
    desc: 'One-shot dictation, no retries.',
  },
]);

/* Post-Mega dashboard cards. Guardian Mission and Boss Dictation are both
 * active in U10 — they are the two primary post-Mega paths. Word Detective /
 * Story Challenge remain preview placeholders that set the P2+ roadmap
 * without promising dates. Icons stay null because the Guardian / Boss /
 * future-mode art has not been drawn yet — the component renders a
 * typographic glyph placeholder in its place so we never ship an off-brand
 * generic icon.
 *
 * U10: Boss Dictation flips from `disabled: true` (Phase P1 placeholder) to
 * `disabled: false` with its own `ariaLabel`. The PostMegaSetupContent scene
 * branches on `card.id === 'boss-dictation'` to render the Boss variant with
 * its own Begin button — same three-state variant system established by
 * Guardian (`active` / `rested` / `placeholder`). Copy landed via the
 * /frontend-design invocation (plan reference:
 * docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md).
 *
 * Design framing rules (both active cards must honour):
 *   - Glyph is a single letter, matches the pill frame established by Guardian.
 *   - Description is grounded and child-specific; no "Coming soon" stub copy.
 *   - `ariaLabel` is required on every active card so screen readers read the
 *     full intent rather than just the glyph + title + description. */
export const POST_MEGA_MODE_CARDS = Object.freeze([
  {
    id: 'guardian',
    iconSrc: null,
    glyph: 'G',
    title: 'Guardian Mission',
    desc: 'Protect the Word Vault. A short check on words you already own.',
    disabled: false,
  },
  {
    id: 'boss-dictation',
    iconSrc: null,
    glyph: 'B',
    title: 'Boss Dictation',
    desc: 'Ten Mega words. One spelling each. Miss one — it still stays Mega.',
    ariaLabel: 'Boss Dictation — ten-word one-shot dictation from your Mega words. Mega status never drops.',
    disabled: false,
  },
  {
    id: 'pattern-quest',
    iconSrc: null,
    glyph: 'P',
    title: 'Pattern Quest',
    // U11: 5-card quest on a single KS2 spelling pattern (e.g. "-tion"). The
    // description names the flow so a child reading it knows the quest is a
    // short curiosity-first drill, not another Guardian patrol.
    desc: 'Five short cards on one spelling pattern. Spot the clue, fix the trick, lock it in — Mega always stays.',
    ariaLabel: 'Pattern Quest — five-card quest on a single KS2 spelling pattern. Mega status never drops.',
    disabled: false,
  },
  {
    id: 'word-detective',
    iconSrc: null,
    glyph: 'D',
    title: 'Word Detective',
    desc: 'Coming soon — spot what went wrong in tricky misspellings.',
    disabled: true,
  },
  {
    id: 'story-challenge',
    iconSrc: null,
    glyph: 'S',
    title: 'Story Challenge',
    desc: 'Coming soon — weave secure words into a story mission.',
    disabled: true,
  },
]);
export const ROUND_LENGTH_OPTIONS = Object.freeze(['10', '20', '40']);
export const YEAR_FILTER_OPTIONS = Object.freeze([
  { value: 'core', label: 'Core' },
  { value: 'y3-4', label: 'Y3-4' },
  { value: 'y5-6', label: 'Y5-6' },
  { value: 'extra', label: 'Extra' },
]);
export const WORD_BANK_FILTER_IDS = new Set([
  'all',
  'due',
  'weak',
  'learning',
  'secure',
  'unseen',
  // ----- U6 Guardian filters ---------------------------------------------
  // Appended to the legacy set (not reordered) so serialised filter IDs
  // persisted to `transientUi.spellingAnalyticsStatusFilter` remain
  // byte-compatible for any learner who graduated before U6 landed. The
  // `module.js` handler at `spelling-analytics-status-filter` accepts any
  // ID that the Set contains, so surfacing these four chips is enough.
  'guardianDue',
  'wobbling',
  'renewedRecently',
  'neverRenewed',
]);
export const WORD_BANK_GUARDIAN_FILTER_IDS = Object.freeze([
  'guardianDue',
  'wobbling',
  'renewedRecently',
  'neverRenewed',
]);
export const WORD_BANK_GUARDIAN_FILTER_ID_SET = new Set(WORD_BANK_GUARDIAN_FILTER_IDS);
export const WORD_BANK_YEAR_FILTER_IDS = new Set(['all', 'y3-4', 'y5-6', 'extra']);

/* U5: Word Bank Guardian chip copy polish (R10).
 *
 * The chip-label map lives in the view-model (not the JSX scene) so there is
 * a single source of truth for display text; the scene imports from here.
 * Labels are deliberately grounded and child-specific — no "Great work!"
 * slop, no zero-celebration — and because each chip button's visible label
 * span doubles as its accessible name (no explicit aria-label on the chip
 * button), renaming the label here automatically updates the screen-reader
 * text too. The hint map mirrors the chip IDs so an accidental label/hint
 * divergence fails the parity tests.
 *
 * Previous copy (pre-U5, kept in comments for historical reference):
 *   guardianDue     → 'Guardian due'
 *   wobbling        → 'Wobbling'
 *   renewedRecently → 'Renewed (7d)'
 *   neverRenewed    → 'Untouched'
 *
 * New copy (post-U5, ships on R10):
 *   guardianDue     → 'Due for check'
 *   wobbling        → 'Wobbling words'
 *   renewedRecently → 'Guarded this week'
 *   neverRenewed    → 'Not guarded yet'
 */
export const WORD_BANK_GUARDIAN_CHIP_LABELS = Object.freeze({
  guardianDue: 'Due for check',
  wobbling: 'Wobbling words',
  renewedRecently: 'Guarded this week',
  neverRenewed: 'Not guarded yet',
});
export const WORD_BANK_GUARDIAN_FILTER_HINTS = Object.freeze({
  guardianDue: 'Secure words the Vault wants you to recheck today.',
  wobbling: 'Secure words that slipped last time — one more pass clears them.',
  renewedRecently: 'Secure words you renewed in the last seven days.',
  neverRenewed: 'Secure words the Guardian has not inspected yet — nothing is wrong, just untouched.',
});

// How many days after lastReviewedDay still counts as "renewed recently" for
// the Word Bank filter. Seven days mirrors the shortest Guardian interval
// (reviewLevel 1 = 7 days) — anything inside that window is still fresh.
export const GUARDIAN_RENEWED_RECENTLY_WINDOW_DAYS = 7;

const SCRIBE_DOWNS_BASE = '/assets/regions/the-scribe-downs';
const spellingHeroUrl = (variant) => `${SCRIBE_DOWNS_BASE}/the-scribe-downs-${variant}.1280.webp`;
const SPELLING_HERO_REGIONS = Object.freeze({
  smart: Object.freeze(['a', 'b', 'c']),
  trouble: Object.freeze(['d']),
  test: Object.freeze(['e']),
});
const SPELLING_HERO_TONES = Object.freeze(['1', '2', '3']);
// Post-Mega backgrounds live in the `f` slot — Guardian / Boss / Pattern Quest
// scenes (setup + session) draw from `the-scribe-downs-f{tone}-{branch}` where
// the branch tracks the learner's grand-master monster (Phaeton) so the
// vista matches the Codex creature painted on it. b1 / b2 are the only
// branches today; mirror MONSTER_BRANCHES if more land in future.
const SPELLING_POST_MEGA_REGION = 'f';
const SPELLING_POST_MEGA_BRANCHES = Object.freeze(['b1', 'b2']);
const SPELLING_POST_MEGA_DEFAULT_BRANCH = 'b1';
const CONTRAST_DARK = 'dark';
const CONTRAST_LIGHT = 'light';
const SPELLING_HERO_CONTRAST_BY_TONE = Object.freeze({
  1: Object.freeze({ shell: CONTRAST_DARK, controls: CONTRAST_DARK, cards: Object.freeze([CONTRAST_DARK, CONTRAST_DARK, CONTRAST_DARK]) }),
  2: Object.freeze({ shell: CONTRAST_LIGHT, controls: CONTRAST_LIGHT, cards: Object.freeze([CONTRAST_LIGHT, CONTRAST_LIGHT, CONTRAST_LIGHT]) }),
  3: Object.freeze({ shell: CONTRAST_LIGHT, controls: CONTRAST_LIGHT, cards: Object.freeze([CONTRAST_LIGHT, CONTRAST_LIGHT, CONTRAST_LIGHT]) }),
});
const SPELLING_HERO_MODE_INDEX = Object.freeze({ smart: 0, trouble: 1, test: 2 });
export const SPELLING_HERO_BACKGROUNDS = Object.freeze({
  smart: Object.freeze(SPELLING_HERO_REGIONS.smart.flatMap((region) => SPELLING_HERO_TONES.map((tone) => spellingHeroUrl(`${region}${tone}`)))),
  trouble: Object.freeze(SPELLING_HERO_REGIONS.trouble.flatMap((region) => SPELLING_HERO_TONES.map((tone) => spellingHeroUrl(`${region}${tone}`)))),
  test: Object.freeze(SPELLING_HERO_REGIONS.test.flatMap((region) => SPELLING_HERO_TONES.map((tone) => spellingHeroUrl(`${region}${tone}`)))),
  postMega: Object.freeze(SPELLING_POST_MEGA_BRANCHES.flatMap((branch) => SPELLING_HERO_TONES.map((tone) => spellingHeroUrl(`${SPELLING_POST_MEGA_REGION}${tone}-${branch}`)))),
});

export function normalisePostMegaBranch(branch) {
  return SPELLING_POST_MEGA_BRANCHES.includes(String(branch || '').trim())
    ? String(branch).trim()
    : SPELLING_POST_MEGA_DEFAULT_BRANCH;
}

export { SPELLING_POST_MEGA_BRANCHES, SPELLING_POST_MEGA_DEFAULT_BRANCH };

export function accentFor(subject) {
  return subject?.accent || SPELLING_ACCENT;
}

export const stableHash = platformStableHash;

export function spellingHeroMode(mode) {
  if (mode === 'trouble') return 'trouble';
  if (mode === 'test') return 'test';
  return 'smart';
}

export function spellingHeroTone(learnerId) {
  const index = stableHash(`spelling:tone:${learnerId}`) % SPELLING_HERO_TONES.length;
  return SPELLING_HERO_TONES[index];
}

export function selectSpellingSetupTone(learnerId, previousTone = '') {
  if (!SPELLING_HERO_TONES.length) return '1';
  let entropy = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bucket = new Uint32Array(1);
    crypto.getRandomValues(bucket);
    entropy = bucket[0];
  }
  const index = stableHash(`spelling:setup-tone:${learnerId}:${Date.now()}:${entropy}`) % SPELLING_HERO_TONES.length;
  const tone = SPELLING_HERO_TONES[index];
  if (previousTone && tone === previousTone && SPELLING_HERO_TONES.length > 1) {
    return SPELLING_HERO_TONES[(index + 1) % SPELLING_HERO_TONES.length];
  }
  return tone;
}

export function heroBgForMode(mode, learnerId, options = {}) {
  const heroMode = spellingHeroMode(mode);
  const regions = SPELLING_HERO_REGIONS[heroMode] || SPELLING_HERO_REGIONS.smart;
  if (!regions.length) return '';
  const regionIndex = stableHash(`spelling:region:${heroMode}:${learnerId}`) % regions.length;
  const tone = SPELLING_HERO_TONES.includes(String(options.tone)) ? String(options.tone) : spellingHeroTone(learnerId);
  return spellingHeroUrl(`${regions[regionIndex]}${tone}`);
}

/**
 * Post-Mega hero background. Branch follows the learner's grand-master
 * monster (Phaeton for spelling) so the vista matches the Codex creature.
 * `tone` cycles 1 / 2 / 3 the same way the legacy regions do — passing it
 * explicitly lets callers (Setup tone seed, session progress mapping) keep
 * the same dramatic-arc behaviour they have on pre-Mega scenes.
 */
export function heroBgForPostMega(branch, tone, learnerId = '') {
  const safeBranch = normalisePostMegaBranch(branch);
  const safeTone = SPELLING_HERO_TONES.includes(String(tone))
    ? String(tone)
    : spellingHeroTone(learnerId);
  return spellingHeroUrl(`${SPELLING_POST_MEGA_REGION}${safeTone}-${safeBranch}`);
}

export function heroBgForLearner(learnerId, mode = 'smart') {
  return heroBgForMode(mode, learnerId);
}

export function heroBgForSetup(learnerId, prefs, options = {}) {
  // Graduated learners see the post-Mega vista regardless of the cached
  // pref `mode`. The `postMegaBranch` option is supplied by the practice
  // surface from the learner's monster-codex state; falling back to b1
  // keeps the picker safe before a learner has any branch attribution.
  if (options.postMega) {
    return heroBgForPostMega(options.postMegaBranch, options.tone, learnerId);
  }
  return heroBgForMode(prefs?.mode, learnerId, options);
}

function sessionProgressTotal(session) {
  const rawTotal = Number(session?.progress?.total ?? session?.totalWords ?? 0);
  return Number.isFinite(rawTotal) && rawTotal > 0 ? Math.floor(rawTotal) : 1;
}

export function spellingSessionProgressIndex(session, options = {}) {
  const total = sessionProgressTotal(session);
  const explicitIndex = Number(options.questionIndex);
  if (Number.isFinite(explicitIndex) && explicitIndex > 0) {
    return Math.min(total, Math.max(1, Math.floor(explicitIndex)));
  }

  const rawDone = Number(session?.progress?.done ?? session?.progress?.checked ?? 0);
  const done = Number.isFinite(rawDone) && rawDone > 0 ? Math.floor(rawDone) : 0;
  const current = done + (options.awaitingAdvance ? 0 : 1);
  return Math.min(total, Math.max(1, current));
}

export function spellingHeroToneForSessionProgress(session, options = {}) {
  if (options.complete) return '3';
  const total = sessionProgressTotal(session);
  const current = spellingSessionProgressIndex(session, options);
  const firstLimit = Math.max(1, Math.floor(total / SPELLING_HERO_TONES.length));
  const secondLimit = Math.max(firstLimit + 1, Math.floor((total * 2) / SPELLING_HERO_TONES.length));
  if (current <= firstLimit) return '1';
  if (current <= secondLimit) return '2';
  return '3';
}

export function heroBgForSession(learnerId, session, options = {}) {
  const requestedTone = String(options.tone || '');
  const tone = SPELLING_HERO_TONES.includes(requestedTone)
    ? requestedTone
    : spellingHeroToneForSessionProgress(session, options);
  // Post-Mega sessions (Guardian / Boss / Pattern Quest) draw from the f
  // region with the learner's branch baked in — same vista as the post-Mega
  // setup scene so the transition into a round is visually continuous.
  if (options.postMega) {
    return heroBgForPostMega(options.postMegaBranch, tone, learnerId);
  }
  return heroBgForMode(session?.mode || (session?.type === 'test' ? 'test' : 'smart'), learnerId, { tone });
}

export function heroBgPreloadUrls(learnerId, prefs = {}, options = {}) {
  if (!learnerId) return [];
  const modes = ['smart', 'trouble', 'test'];
  const setupTone = SPELLING_HERO_TONES.includes(String(options.setupTone))
    ? String(options.setupTone)
    : spellingHeroTone(learnerId);
  const setupUrls = modes.map((mode) => heroBgForMode(mode, learnerId, { tone: setupTone }));
  const sessionMode = prefs?.mode || 'smart';
  const sessionUrls = SPELLING_HERO_TONES.map((tone) => heroBgForMode(sessionMode, learnerId, { tone }));
  // Post-Mega learners also need the f-region tones preloaded so the
  // setup → session transition does not flash an unloaded background. The
  // branch is sticky per learner so we only emit three URLs (one per tone).
  const postMegaUrls = options.postMega
    ? SPELLING_HERO_TONES.map((tone) => heroBgForPostMega(options.postMegaBranch, tone, learnerId))
    : [];
  return [...new Set([...setupUrls, ...sessionUrls, ...postMegaUrls].filter(Boolean))];
}

export function heroToneForBg(url) {
  const text = String(url || '');
  // Pre-Mega regions (a–e) carry no branch suffix; post-Mega `f` region
  // backgrounds always carry `-bN`. Match either shape so legacy callers
  // (Setup contrast adapter, tests) keep working when the post-Mega vista
  // is the active backdrop.
  const postMegaVariant = text.match(/the-scribe-downs-f([1-3])-b[12]\.1280\.webp(?:$|[?#])/);
  if (postMegaVariant) return postMegaVariant[1];
  const variant = text.match(/the-scribe-downs-[a-e]([1-3])\.1280\.webp(?:$|[?#])/);
  return variant?.[1] || '';
}

export function heroContrastProfileForBg(url, mode = 'smart') {
  const text = String(url || '');
  const postMegaVariant = text.match(/the-scribe-downs-f([1-3])-b[12]\.1280\.webp(?:$|[?#])/);
  // Post-Mega vistas inherit the same per-tone contrast envelope as the
  // legacy regions — tone 1 = dark shell, 2/3 = light. The active mode
  // index is meaningless for post-Mega (Guardian / Boss / Pattern Quest
  // share one CTA per card), so the selected-card override does not apply
  // and every card gets the base tone.
  if (postMegaVariant) {
    const tone = postMegaVariant[1];
    const base = SPELLING_HERO_CONTRAST_BY_TONE[tone];
    if (!base) return null;
    return {
      tone,
      shell: base.shell,
      controls: base.controls,
      cards: base.cards.slice(),
    };
  }
  const variant = text.match(/the-scribe-downs-([a-e])([1-3])\.1280\.webp(?:$|[?#])/);
  if (!variant) return null;
  const base = SPELLING_HERO_CONTRAST_BY_TONE[variant[2]];
  if (!base) return null;
  const selectedIndex = SPELLING_HERO_MODE_INDEX[spellingHeroMode(mode)];
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

// Backwards-compat re-exports — callers in this module and Spelling
// components still import `heroBgStyle` / `heroPanDelayStyle` from
// `spelling-view-model.js`; routing through the platform helpers keeps
// the behaviour identical while letting Grammar / Punctuation share the
// same engine without dragging the spelling view-model along.
export const heroBgStyle = platformHeroBgStyle;
export const heroPanDelayStyle = platformHeroPanDelayStyle;

export function beginLabel(prefs) {
  if (prefs.mode === 'test') return 'Begin SATs test';
  if (prefs.mode === 'trouble') return 'Begin trouble drill';
  return `Begin ${prefs.roundLength || '10'} words`;
}

export function normaliseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Match a word-bank row against an active status filter.
 *
 * Legacy filter IDs (`all`/`due`/`weak`/`learning`/`secure`/`unseen`) look
 * only at `status` — their behaviour is byte-identical to what shipped
 * before the Guardian work, even when `options` omits the guardian context.
 * The four Guardian filter IDs additionally consult the learner's guardian
 * record for the slug so "renewed recently" isn't guessed from `progress`
 * alone.
 *
 * U2: `guardianDue` and `wobbling` additionally run the row through
 * `isGuardianEligibleSlug` when the caller supplies the orphan-sanitiser
 * context (`slug`, `progressMap`, `wordBySlug`). A slug that the runtime no
 * longer publishes, has demoted to the extra pool, or whose progress stage
 * dropped below `GUARDIAN_SECURE_STAGE` must not surface under these chips,
 * even when the persisted guardian record still claims `wobbling: true` or
 * has a due date in the past. Omitting the context preserves the pre-U2
 * behaviour so existing two-arg callers stay byte-compatible.
 *
 * @param {string} filter Active filter id from `WORD_BANK_FILTER_IDS`.
 * @param {string} status Status string on the word-bank row.
 * @param {object} [options]
 * @param {object|null} [options.guardian] Normalised guardian record for the
 *   slug (from `data.guardian[slug]`), or `null`/`undefined` when absent.
 * @param {number} [options.todayDay] Integer day (Math.floor(ts / DAY_MS)).
 * @param {string} [options.slug] Row slug. Required (with progressMap +
 *   wordBySlug) to engage the U2 orphan sanitiser.
 * @param {object} [options.progressMap] slug -> legacy progress record. When
 *   provided alongside `slug` + `wordBySlug`, engages the U2 orphan sanitiser.
 * @param {object} [options.wordBySlug] slug -> published word metadata. When
 *   provided alongside `slug` + `progressMap`, engages the U2 orphan sanitiser.
 */
export function wordBankFilterMatchesStatus(filter, status, options = {}) {
  if (filter === 'all') return true;
  if (filter === 'weak') return status === 'trouble';
  if (filter === 'unseen') return status === 'new';
  if (!WORD_BANK_GUARDIAN_FILTER_ID_SET.has(filter)) {
    // Legacy filters keep their historic semantics. No guardian inspection.
    return filter === status;
  }

  const opts = options && typeof options === 'object' ? options : {};
  const guardian = opts.guardian || null;
  const todayRaw = opts.todayDay;
  const todayDay = Number.isFinite(Number(todayRaw)) ? Math.floor(Number(todayRaw)) : 0;
  const hasGuardian = guardian && typeof guardian === 'object' && !Array.isArray(guardian);
  // U2 orphan sanitiser only engages when the caller supplies the full
  // context triple. Legacy two-arg / guardian+todayDay callers remain
  // byte-identical to the pre-U2 behaviour.
  const hasOrphanContext = typeof opts.slug === 'string'
    && opts.slug.length > 0
    && opts.progressMap && typeof opts.progressMap === 'object'
    && opts.wordBySlug && typeof opts.wordBySlug === 'object';
  const isEligible = hasOrphanContext
    ? isGuardianEligibleSlug(opts.slug, opts.progressMap, opts.wordBySlug)
    : true;

  if (filter === 'guardianDue') {
    // Guardian Due is defined as: guardian record exists AND nextDueDay has
    // arrived. We also require `status === 'secure'` because a word can
    // drop out of `secure` (e.g. dueDay rolls over) while still owning a
    // guardian record from a previous Guardian round — those should show
    // under the legacy `due` chip, not here. U2: orphan slugs (not in
    // runtime, extra-pool, or below Mega stage) never match.
    if (!hasGuardian) return false;
    if (status !== 'secure') return false;
    if (!isEligible) return false;
    const nextDue = Number.isFinite(Number(guardian.nextDueDay)) ? Math.floor(Number(guardian.nextDueDay)) : Infinity;
    return nextDue <= todayDay;
  }

  if (filter === 'wobbling') {
    // U5 + U2 / R10 tightening: wobbling must imply secure AND the slug be
    // Guardian-eligible. A stage < Mega word that still carries a
    // `wobbling: true` flag (from a pre-hardening bug, or a rehydrated
    // legacy record) is no longer in the Vault — it should show under the
    // legacy `due` / `trouble` / `learning` chips, not here. The guard
    // keeps the wobbling count honest: it equals exactly the
    // secure + wobbling intersection, matching the mega-never-revoked
    // invariant proved by U8b. U2: orphan slugs (not in runtime, extra-
    // pool, or below Mega stage) never match — post-hardening, a
    // wobbling + stage<Mega record is an invariant impossibility, but the
    // filter rejects it defensively so a legacy pre-fix state never
    // surfaces under this chip.
    if (!hasGuardian) return false;
    if (guardian.wobbling !== true) return false;
    if (status !== 'secure') return false;
    if (!isEligible) return false;
    return true;
  }

  if (filter === 'renewedRecently') {
    if (!hasGuardian) return false;
    if (guardian.lastReviewedDay == null) return false;
    const last = Number(guardian.lastReviewedDay);
    if (!Number.isFinite(last)) return false;
    return (todayDay - Math.floor(last)) <= GUARDIAN_RENEWED_RECENTLY_WINDOW_DAYS;
  }

  if (filter === 'neverRenewed') {
    // "Never renewed" is the freshly-graduated state: a word is secure (Mega)
    // but has no guardian record yet because the learner hasn't touched it
    // in a Guardian round. Non-secure words don't qualify because they
    // never crossed into the maintenance loop in the first place.
    return status === 'secure' && !hasGuardian;
  }

  return false;
}

export function wordBankYearFilterMatches(filter, word) {
  if (filter === 'all') return true;
  if (filter === 'y3-4') return word.year === '3-4';
  if (filter === 'y5-6') return word.year === '5-6';
  if (filter === 'extra') return word.spellingPool === 'extra';
  return true;
}

export function wordBankYearFilterLabel(filter) {
  if (filter === 'y3-4') return 'Years 3-4';
  if (filter === 'y5-6') return 'Years 5-6';
  if (filter === 'extra') return 'Extra';
  return 'All';
}

export function wordStatusLabel(status) {
  const labels = {
    new: 'New',
    learning: 'Learning',
    due: 'Due',
    secure: 'Secure',
    trouble: 'Trouble',
  };
  return labels[status] || 'Learning';
}

export function wordBankPillClass(status) {
  if (status === 'new') return 'new';
  if (status === 'trouble') return 'trouble';
  return status;
}

export function spellingPoolLabel(word) {
  if (word?.spellingPool === 'extra') return 'Extra';
  return word?.yearLabel || 'Core';
}

export function spellingPoolContextLabel(word) {
  if (word?.spellingPool === 'extra') return 'Extra spelling';
  return word?.yearLabel || 'Core spelling';
}

export function wordMatchesSearch(word, query) {
  if (!query) return true;
  const variants = Array.isArray(word.variants) ? word.variants : [];
  const fields = [
    word.slug,
    word.word,
    word.family,
    word.yearLabel,
    spellingPoolLabel(word),
    word.explanation,
    ...(Array.isArray(word.accepted) ? word.accepted : []),
    ...(Array.isArray(word.familyWords) ? word.familyWords : []),
    ...variants.flatMap((variant) => [
      variant?.word,
      variant?.explanation,
      variant?.sentence,
      ...(Array.isArray(variant?.accepted) ? variant.accepted : []),
      ...(Array.isArray(variant?.sentences) ? variant.sentences : []),
    ]),
  ].map(normaliseSearchText);
  return fields.some((field) => field.includes(query));
}

export function dueLabel(progress) {
  if (!progress) return 'Unseen';
  const attempts = Math.max(0, Number(progress.attempts) || 0);
  if (!attempts) return 'Unseen';
  const dueDay = Number(progress.dueDay);
  if (!Number.isFinite(dueDay)) return 'Unseen';
  const today = Math.floor(Date.now() / DAY_MS);
  if (dueDay - today > 3650) return 'Long-term review';
  const daysUntilDue = Math.floor(dueDay - today);
  if (daysUntilDue <= 0) return 'Today';
  if (daysUntilDue === 1) return 'In 1 day';
  return `In ${daysUntilDue} days`;
}

export function progressAttemptCount(progress) {
  return Math.max(0, Number(progress?.attempts) || 0);
}

export function progressCorrectCount(progress) {
  return Math.max(0, Number(progress?.correct) || 0);
}

export function progressWrongCount(progress) {
  return Math.max(0, Number(progress?.wrong) || 0);
}

export function progressAccuracyLabel(progress) {
  const attempts = progressAttemptCount(progress);
  if (!attempts) return '—';
  const correct = progressCorrectCount(progress);
  const boundedCorrect = Math.min(correct, attempts);
  return `${Math.round((boundedCorrect / attempts) * 100)}%`;
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildDrillCloze(sentence, word) {
  const raw = String(sentence || '');
  const target = String(word?.word || '').trim();
  if (!target) return raw;
  if (raw.includes('________')) return raw;
  const pattern = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i');
  if (pattern.test(raw)) return raw.replace(pattern, '________');
  return '________';
}

let activeSpellingFlowTransition = null;

export function renderAction(actions, event, action, data = {}) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const basePayload = action === 'spelling-word-detail-open' && data && typeof data === 'object'
    ? { ...data, triggerElement: event?.currentTarget || data.triggerElement || null }
    : data;
  const shouldDeferAutoSpeak = action === 'spelling-start' || action === 'spelling-start-again';
  const shouldStartFlowTransition = action === 'spelling-start'
    || action === 'spelling-start-again'
    || (action === 'spelling-continue' && Boolean(data?.flowTransition));
  const supportsFlowTransition = typeof document !== 'undefined'
    && typeof document.startViewTransition === 'function';
  const deferAutoSpeakUntilTransitionEnd = shouldDeferAutoSpeak
    && shouldStartFlowTransition
    && supportsFlowTransition;
  const payload = deferAutoSpeakUntilTransitionEnd
    ? {
        ...(basePayload && typeof basePayload === 'object' && !Array.isArray(basePayload) ? basePayload : {}),
        deferAudioUntilFlowTransitionEnd: true,
      }
    : basePayload;
  if (
    shouldStartFlowTransition
    && supportsFlowTransition
  ) {
    if (activeSpellingFlowTransition) return;
    const token = {};
    activeSpellingFlowTransition = token;
    document.documentElement.classList.add('spelling-flow-transition');
    let transition = null;
    try {
      transition = document.startViewTransition(() => {
        actions.dispatch(action, payload);
      });
    } catch (error) {
      if (activeSpellingFlowTransition === token) activeSpellingFlowTransition = null;
      document.documentElement.classList.remove('spelling-flow-transition');
      throw error;
    }
    Promise.resolve(transition?.finished)
      .catch(() => {})
      .finally(() => {
        if (activeSpellingFlowTransition === token) activeSpellingFlowTransition = null;
        document.documentElement.classList.remove('spelling-flow-transition');
        if (deferAutoSpeakUntilTransitionEnd) actions.flushSpellingDeferredAudio?.();
      });
    return;
  }
  actions.dispatch(action, payload);
}

export function renderFormAction(actions, event, action, extra = {}) {
  event.preventDefault();
  event.stopPropagation();
  actions.dispatch(action, { ...extra, formData: new FormData(event.currentTarget) });
}

export function pathProgressDots({ done, current, total }) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const display = Math.min(safeTotal, 20);
  const perDot = safeTotal / display;
  return Array.from({ length: display }, (_, index) => {
    const start = index * perDot;
    const end = (index + 1) * perDot;
    if (end <= done) return 'done';
    if (current >= start && current < end) return 'current';
    return '';
  });
}

export function feedbackTone(kind) {
  if (kind === 'error') return 'bad';
  if (kind === 'warn') return 'warn';
  return 'good';
}

export function summaryModeLabel(mode) {
  if (mode === 'trouble') return 'Trouble Drill';
  if (mode === 'test') return 'SATs Test';
  if (mode === 'single') return 'Single-word Drill';
  if (mode === 'guardian') return 'Guardian Mission';
  // U10: Boss Dictation lives alongside Guardian Mission as a post-Mega
  // surface. Without this branch `summaryRibbonSub` would display "Smart
  // Review" on the Boss summary mode chip, leaking legacy copy into the
  // graduated surface.
  if (mode === 'boss') return 'Boss Dictation';
  // U11: Pattern Quest summary mode label.
  if (mode === 'pattern-quest') return 'Pattern Quest';
  return 'Smart Review';
}

/**
 * Human-readable microcopy for a single guardian record. Used on the
 * post-Mega dashboard to explain why a word is in the Vault today.
 *
 * Rules:
 *  - If the record is missing, report "Not guarded yet".
 *  - If the record is wobbling, lead with "Wobbling" regardless of due day.
 *  - Otherwise render the next-check delta (today / in 1 day / in N days).
 *
 * `todayDay` should be an integer day (Math.floor(ts / DAY_MS)), matching
 * the convention used by the rest of the spelling read-model.
 */
export function guardianLabel(record, todayDay) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return 'Not guarded yet';
  }
  const today = Number.isFinite(Number(todayDay)) ? Math.floor(Number(todayDay)) : 0;
  const nextDue = Number.isFinite(Number(record.nextDueDay)) ? Math.floor(Number(record.nextDueDay)) : today;
  const delta = nextDue - today;

  if (record.wobbling === true) {
    if (delta <= 0) return 'Wobbling — due today';
    if (delta === 1) return 'Wobbling — due in 1 day';
    return `Wobbling — due in ${delta} days`;
  }

  if (delta <= 0) return 'Due today';
  if (delta === 1) return 'Next check in 1 day';
  return `Next check in ${delta} days`;
}

/**
 * Build the three Guardian-specific summary cards appended to the base
 * summary stat grid after a Guardian Mission round.
 *
 * The shared `normaliseSummary` contract (service-contract.js) is
 * intentionally minimal and does not carry Guardian-specific aggregates.
 * Rather than widening that contract we derive counts from the two fields
 * every `learningSummary` already populates:
 *
 *   • `summary.totalWords`    — round size (derived by `normaliseSummary`)
 *   • `summary.mistakes`      — every word that was wrong at least once
 *
 * In Guardian mode a wrong answer emits `spelling.guardian.wobbled`, so
 * `mistakes.length` is the wobbled count. Everything else was renewed
 * (including words that recovered from a previous wobble — recoveries and
 * fresh renewals both count as "kept alive in the Vault" for summary
 * purposes; the event log still distinguishes them for downstream analytics).
 *
 * `nextGuardianDueDay` is the min `nextDueDay` across the learner's current
 * guardian map (from `service.getPostMasteryState(...).nextGuardianDueDay`)
 * threaded through as a prop so we can say "Next check: tomorrow" without a
 * second storage round-trip in the scene.
 *
 * @param {object} params
 * @param {object} params.summary Normalised summary (`normaliseSummary` shape).
 * @param {number|null} params.nextGuardianDueDay Min across all records, or null.
 * @param {number|null} params.todayDay Integer day for the delta calculation.
 */
export function guardianSummaryCards({ summary, nextGuardianDueDay, todayDay }) {
  const totalWords = Math.max(0, Number(summary?.totalWords) || 0);
  const mistakes = Array.isArray(summary?.mistakes) ? summary.mistakes : [];
  const wobbledCount = Math.min(totalWords, mistakes.length);
  const renewedTotal = Math.max(0, totalWords - wobbledCount);

  const today = typeof todayDay === 'number' && Number.isFinite(todayDay) ? Math.floor(todayDay) : null;
  const nextDue = typeof nextGuardianDueDay === 'number' && Number.isFinite(nextGuardianDueDay)
    ? Math.floor(nextGuardianDueDay)
    : null;
  let nextCheckValue = '—';
  let nextCheckSub = 'No more duties scheduled';
  if (nextDue !== null && today !== null) {
    const delta = nextDue - today;
    if (delta <= 0) {
      nextCheckValue = 'Today';
      nextCheckSub = 'A fresh round is waiting';
    } else if (delta === 1) {
      nextCheckValue = 'Tomorrow';
      nextCheckSub = 'Come back for the next check';
    } else if (delta <= 30) {
      nextCheckValue = `${delta} days`;
      nextCheckSub = 'Words resting until next check';
    } else {
      nextCheckValue = `${delta} days`;
      nextCheckSub = 'Long-term maintenance schedule';
    }
  }
  return [
    {
      id: 'guardian-renewed',
      label: 'Words renewed',
      value: renewedTotal,
      sub: renewedTotal === 0
        ? 'No words held the line'
        : 'Kept alive in the Vault',
    },
    {
      id: 'guardian-wobbling',
      label: 'Words wobbling',
      value: wobbledCount,
      sub: wobbledCount === 0
        ? 'No new wobbles today'
        : 'Returning tomorrow for recovery',
    },
    {
      id: 'guardian-next-check',
      label: 'Next check',
      value: nextCheckValue,
      sub: nextCheckSub,
    },
  ];
}

/**
 * Canonical label for the Guardian-origin summary "Practice wobbling words"
 * button (U3). Lives in the view-model so the scene, telemetry, and future
 * automated-tour copy all read the same string. Every deviation weakens the
 * identity separation between Guardian's single-attempt contract and the
 * optional practice-only drill — see the plan's Key Technical Decisions entry
 * on the practice-button identity trade-off.
 *
 * @returns {string} The exact button label. Always call this helper rather
 *   than hard-coding the string, so a future rename (e.g. for i18n) stays a
 *   one-line change.
 */
export function guardianPracticeActionLabel() {
  return 'Practice wobbling words';
}

/**
 * Canonical help-text copy rendered below the Practice button on a Guardian
 * summary (U3). Holds the Mega-never-revoked invariant ("schedule will not
 * change") + the Guardian identity guardrail ("Official recovery check
 * returns tomorrow"). Same single-source-of-truth rationale as
 * `guardianPracticeActionLabel()` — telemetry copy, scene copy, and test
 * fixtures all read this string.
 *
 * @returns {string} The exact help copy. Treat as append-only for phrasing
 *   tweaks; do not drop the "schedule will not change" or "tomorrow" clauses
 *   — they carry product intent that the separation between practice + real
 *   Guardian rounds depends on.
 */
export function guardianSummaryCopy() {
  return 'Optional practice. Mega and Guardian schedule will not change. Official recovery check returns tomorrow.';
}

export function summaryHeadline(summary) {
  if (summary?.totalWords > 0 && typeof summary.correct === 'number') {
    return `${summary.correct} of ${summary.totalWords} words landed.`;
  }
  return summary?.message || '';
}

export function summaryRibbonSub(summary) {
  const parts = [summaryModeLabel(summary?.mode), formatElapsedMinutes(summary?.elapsedMs)];
  if (typeof summary?.accuracy === 'number') parts.push(`${summary.accuracy}% accuracy`);
  return parts.filter(Boolean).join(' · ');
}

export function countWordBankStatus(words, status) {
  return words.reduce((count, word) => count + (word.status === status ? 1 : 0), 0);
}

export function countWordBankYear(words, year) {
  return words.reduce((count, word) => count + (word.year === year ? 1 : 0), 0);
}

export function countWordBankExtra(words) {
  return words.reduce((count, word) => count + (word.spellingPool === 'extra' ? 1 : 0), 0);
}

/**
 * Build the six legacy counts plus (optionally) four Guardian-scoped counts.
 *
 * When called as `wordBankAggregateStats(words)` the output is the exact
 * six-field shape that shipped before U6. Passing `{ guardianMap, todayDay }`
 * opts in to the Guardian aggregation — the extra counts are appended to the
 * same object so one pass over the word list is enough. Legacy consumers
 * that destructure `{ total, secure, due, trouble, learning, unseen }` keep
 * their existing shape; Guardian-aware consumers also read the four new
 * fields without a second reducer pass.
 *
 * U2: pass `{ progressMap, wordBySlug }` alongside `{ guardianMap, todayDay }`
 * to engage the orphan sanitiser for `guardianDue` and `wobbling` counts.
 * Omitting the sanitiser context keeps the pre-U2 behaviour, so existing
 * two-field callers stay byte-compatible.
 *
 * @param {Array} words Word-bank rows (each has `slug`, `status`).
 * @param {object} [options]
 * @param {object} [options.guardianMap] slug -> guardian record.
 * @param {number} [options.todayDay] Integer day (Math.floor(ts / DAY_MS)).
 * @param {object} [options.progressMap] slug -> legacy progress record (U2).
 * @param {object} [options.wordBySlug] slug -> published word metadata (U2).
 */
export function wordBankAggregateStats(words, options = {}) {
  const stats = {
    total: 0,
    secure: 0,
    due: 0,
    trouble: 0,
    learning: 0,
    unseen: 0,
  };
  const hasGuardianContext = Boolean(
    options && typeof options === 'object' && options.guardianMap && typeof options.guardianMap === 'object',
  );
  if (hasGuardianContext) {
    stats.guardianDue = 0;
    stats.wobbling = 0;
    stats.renewedRecently = 0;
    stats.neverRenewed = 0;
  }
  const guardianMap = hasGuardianContext ? options.guardianMap : null;
  const todayRaw = hasGuardianContext ? options.todayDay : undefined;
  const todayDay = Number.isFinite(Number(todayRaw)) ? Math.floor(Number(todayRaw)) : 0;
  const progressMap = options && typeof options === 'object' && options.progressMap && typeof options.progressMap === 'object'
    ? options.progressMap
    : null;
  const wordBySlug = options && typeof options === 'object' && options.wordBySlug && typeof options.wordBySlug === 'object'
    ? options.wordBySlug
    : null;

  for (const word of Array.isArray(words) ? words : []) {
    stats.total += 1;
    if (word.status === 'secure') stats.secure += 1;
    else if (word.status === 'due') stats.due += 1;
    else if (word.status === 'trouble') stats.trouble += 1;
    else if (word.status === 'learning') stats.learning += 1;
    else if (word.status === 'new') stats.unseen += 1;

    if (!hasGuardianContext) continue;
    const guardian = word && word.slug ? guardianMap[word.slug] : null;
    // U2: pass orphan context through so `guardianDue` / `wobbling` counts
    // track the visible-row count exactly even when a content hot-swap
    // leaves a stale guardianMap entry behind.
    const sanitiserOptions = { guardian, todayDay, slug: word && word.slug, progressMap, wordBySlug };
    if (wordBankFilterMatchesStatus('guardianDue', word.status, sanitiserOptions)) stats.guardianDue += 1;
    if (wordBankFilterMatchesStatus('wobbling', word.status, sanitiserOptions)) stats.wobbling += 1;
    if (wordBankFilterMatchesStatus('renewedRecently', word.status, sanitiserOptions)) stats.renewedRecently += 1;
    if (wordBankFilterMatchesStatus('neverRenewed', word.status, sanitiserOptions)) stats.neverRenewed += 1;
  }
  return stats;
}

export function wordBankAggregateCards(stats, totalSub, options = {}) {
  const baseCards = [
    { label: 'Total', value: stats.total, sub: totalSub },
    { label: 'Secure', value: stats.secure, sub: 'Stable recall' },
    { label: 'Due now', value: stats.due, sub: 'Due today or overdue' },
    { label: 'Trouble', value: stats.trouble, sub: 'Weak or fragile' },
    { label: 'Learning', value: stats.learning, sub: 'Introduced, not secure' },
    { label: 'Unseen', value: stats.unseen, sub: 'Not yet introduced' },
  ];
  const showGuardian = Boolean(options && typeof options === 'object' && options.showGuardian === true);
  if (!showGuardian) return baseCards;
  return [
    ...baseCards,
    { label: 'Renewed (7d)', value: Number(stats.renewedRecently) || 0, sub: 'Guarded this week' },
    { label: 'Guardian due', value: Number(stats.guardianDue) || 0, sub: 'Ready for a check' },
    { label: 'Wobbling', value: Number(stats.wobbling) || 0, sub: 'One miss away' },
    { label: 'Untouched', value: Number(stats.neverRenewed) || 0, sub: 'Secure, never guarded' },
  ];
}

export function findWordBankEntry(analytics, slug) {
  if (!slug) return null;
  const groups = Array.isArray(analytics?.wordGroups) ? analytics.wordGroups : [];
  for (const group of groups) {
    const words = Array.isArray(group.words) ? group.words : [];
    const match = words.find((entry) => entry.slug === slug);
    if (match) return match;
  }
  return null;
}

export function buildSpellingContext({ appState, service, repositories, subject }) {
  const learner = appState.learners.byId[appState.learners.selectedId];
  const ui = {
    ...service.initState(appState.subjectUi.spelling, learner.id),
    pendingCommand: appState.transientUi?.spellingPendingCommand || '',
  };
  const needsAnalytics = ui.phase === 'dashboard' || ui.phase === 'word-bank';
  const analytics = needsAnalytics ? service.getAnalyticsSnapshot(learner.id) : null;
  // Post-mastery aggregates are needed on the dashboard (mode selection,
  // Alt+4 gate), the summary scene (to render "Next check" in Guardian
  // mode), and the Word Bank (to gate the four Guardian filter chips and
  // feed `guardianMap` into the row predicates). Session-phase rendering
  // does not consult these, so we skip the storage read there to keep the
  // session hot-path cheap.
  const postMasteryPhases = new Set(['dashboard', 'summary', 'word-bank']);
  // When the session-phase shortcut skips the service read, we still
  // hand the dashboard a structurally complete snapshot so every field the
  // PostMegaSetupContent (or later Guardian summary) reads is defined.
  // Uses the same factory as `client-read-models.js` so the three
  // historical fallback shapes stay in sync.
  const postMastery = postMasteryPhases.has(ui.phase) && typeof service.getPostMasteryState === 'function'
    ? service.getPostMasteryState(learner.id)
    : {
        ...createLockedPostMasteryState(),
        todayDay: Math.floor(Date.now() / DAY_MS),
      };
  // P2 U9: durable persistence-warning sibling. Read on every context build
  // so the banner surfaces the instant the service writes a new record
  // (submit-path failure) and disappears the instant it is acknowledged.
  // The normaliser in service-contract.js drops garbage back to null, so
  // `persistenceWarning` is either a `{ reason, occurredAt, acknowledged }`
  // record or `null`. Setup + session scenes branch on `!acknowledged` to
  // decide whether to render the banner.
  const persistenceWarning = typeof service.getPersistenceWarning === 'function'
    ? service.getPersistenceWarning(learner.id)
    : null;
  return {
    learner,
    ui,
    accent: accentFor(subject),
    prefs: service.getPrefs(learner.id),
    analytics,
    postMastery,
    persistenceWarning,
    codex: ui.phase === 'dashboard' && analytics
      ? monsterSummaryFromSpellingAnalytics(analytics, {
          learnerId: learner.id,
          gameStateRepository: repositories?.gameState,
          persistBranches: false,
        })
      : [],
  };
}

export function monsterImageProps(monster, progress, visualConfig = null) {
  return monsterImageVisual(monster, progress, visualConfig).imageProps;
}

export function monsterImageVisual(monster, progress, visualConfig = null) {
  const visual = resolveMonsterVisual({
    monsterId: monster.id,
    branch: progress.branch,
    stage: progress.stage,
    context: 'codexCard',
    config: visualConfig,
    preferredSize: 320,
  });
  return {
    style: monsterVisualFrameStyle(visual),
    imageProps: {
      src: visual.src,
      srcSet: visual.srcSet,
      sizes: 'min(30vw, 120px)',
    },
  };
}
