// Pure view-model helpers for the Grammar surface. Frozen option lists,
// child-facing label/tone mappings, filter + search helpers, dashboard and
// Grammar Bank model builders, forbidden-term fixture. No React imports.
// No SSR. Every helper is a pure function over plain data so tests can
// assert behaviour without rendering JSX.
//
// The pattern mirrors `src/subjects/spelling/components/spelling-view-model.js`
// — subject-scoped lists + filter helpers + aggregate card builders. The
// intent is that every JSX unit in Phase 3 imports from this single file
// plus `../session-ui.js` rather than restating copy or filter predicates
// inline. When new forbidden terms appear we add them here once and every
// child surface inherits the guard through U10's fixture-driven test.

import {
  isGrammarConfidenceLabel,
} from '../../../../shared/grammar/confidence.js';
import { grammarChildLabelForInternal, grammarChildToneForInternal } from '../../../../shared/grammar/grammar-status.js';
import {
  grammarStarStageName,
  grammarStarDisplayStage,
  GRAMMAR_MONSTER_STAR_MAX,
} from '../../../../shared/grammar/grammar-stars.js';
import { GRAMMAR_CLIENT_CONCEPTS } from '../metadata.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarConceptIdFromMasteryKey,
  progressForGrammarMonster,
  GRAMMAR_MONSTER_CONCEPTS,
} from '../../../platform/game/mastery/grammar.js';
import { GRAMMAR_GRAND_MONSTER_ID } from '../../../platform/game/mastery/shared.js';
import { MONSTERS } from '../../../platform/game/monsters.js';

// --- Frozen option lists ----------------------------------------------------

// U5 Phase 4: Grammar Bank focus dispatch is allowlisted to Smart + Learn only.
// Surgery and Builder are legitimately global/mixed modes — a focused concept
// dispatch into those modes would silently drop the learner's focus because
// Worker's `NO_SESSION_FOCUS_MODES` safety net strips it before the engine
// reads it. James's 2026-04-26 decision: "No focused UI action silently
// becomes mixed practice." The client enforces the allowlist on every
// Practise 5 button + `grammar-focus-concept` dispatch; the Worker's existing
// `NO_SESSION_FOCUS_MODES` and `NO_STORED_FOCUS_MODES` remain as safety net.
//
// Frozen Set so module/UI checks are O(1) and cannot be mutated at runtime.
export const GRAMMAR_FOCUS_ALLOWED_MODES = Object.freeze(new Set(['smart', 'learn']));

/**
 * Returns `true` iff `mode` is one of `GRAMMAR_FOCUS_ALLOWED_MODES`. The
 * client JSX layer + module dispatcher both call this helper so the truth
 * table lives in a single place. Unknown / missing input returns `false`.
 */
export function isGrammarFocusAllowedMode(mode) {
  if (typeof mode !== 'string' || !mode) return false;
  return GRAMMAR_FOCUS_ALLOWED_MODES.has(mode);
}

// U8 Phase 5: Smart Practice is the sole primary CTA. The dashboard renders
// this as a prominent button above the fold with `data-featured="true"`.
// Grammar Bank, Mini Test, and Fix Trouble Spots are demoted to secondary
// links below the monster strip.
export const GRAMMAR_PRIMARY_MODE_CARDS = Object.freeze([
  Object.freeze({
    id: 'smart',
    title: 'Smart Practice',
    desc: 'Due · weak · one fresh concept.',
    featured: true,
  }),
]);

// U8 Phase 5: Three modes demoted from primary cards to secondary links.
// Order: Grammar Bank · Mini Test · Fix Trouble Spots. The JSX renders these
// as text links below the monster strip — still accessible, but no longer
// primary decision-weight buttons.
export const GRAMMAR_SECONDARY_MODE_LINKS = Object.freeze([
  Object.freeze({
    id: 'bank',
    title: 'Grammar Bank',
    desc: 'Browse every concept with child-friendly statuses.',
    action: 'grammar-open-concept-bank',
  }),
  Object.freeze({
    id: 'satsset',
    title: 'Mini Test',
    desc: 'Short timed set. Marks at the end.',
    action: 'grammar-set-mode',
  }),
  Object.freeze({
    id: 'trouble',
    title: 'Fix Trouble Spots',
    desc: 'Only the concepts you usually miss.',
    action: 'grammar-set-mode',
  }),
]);

// Secondary modes disclosed under the dashboard's "More practice" details
// block. U8 Phase 5: Writing Try moves here from the primary area, joining
// Learn → Sentence Surgery → Sentence Builder → Worked Examples → Faded
// Guidance → Writing Try. Surgery and Builder carry a `label: 'Mixed
// practice'` per Phase 4 U5 decision.
export const GRAMMAR_MORE_PRACTICE_MODES = Object.freeze([
  Object.freeze({ id: 'learn', title: 'Learn a concept', desc: 'Focused retrieval on one concept at a time.' }),
  Object.freeze({ id: 'surgery', title: 'Sentence Surgery', desc: 'Fix and rewrite sentence-level errors.', label: 'Mixed practice' }),
  Object.freeze({ id: 'builder', title: 'Sentence Builder', desc: 'Build sentences from structured prompts.', label: 'Mixed practice' }),
  Object.freeze({ id: 'worked', title: 'Worked Examples', desc: 'See a modelled answer before your turn.' }),
  Object.freeze({ id: 'faded', title: 'Faded Guidance', desc: 'Less help each round. You do the reasoning.' }),
  Object.freeze({ id: 'transfer', title: 'Writing Try', desc: 'Non-scored free writing with grammar targets.' }),
]);

// Grammar Bank status filter ids. `all` is the default; `due` surfaces
// concepts the spaced-practice schedule will route next; `trouble` surfaces
// `needs-repair` concepts; `learning` maps to `building`; `nearly-secure`
// maps to `consolidating`; `new` maps to `emerging`. The frozen Set lets
// module actions validate ids in O(1).
export const GRAMMAR_BANK_STATUS_FILTER_IDS = Object.freeze(new Set([
  'all',
  'due',
  'trouble',
  'learning',
  'nearly-secure',
  'secure',
  'new',
]));

// Grammar Bank cluster filter ids. Post-U0 the active roster is 3 direct
// cluster monsters plus Concordium's whole-Grammar aggregate, so `concordium`
// shows every concept including the five punctuation-for-grammar ones. The
// three retired ids (Glossbloom, Loomrill, Mirrane) are intentionally absent.
export const GRAMMAR_BANK_CLUSTER_FILTER_IDS = Object.freeze(new Set([
  'all',
  'bracehart',
  'chronalyx',
  'couronnail',
  'concordium',
]));

// Hero headline + subheadline for the dashboard. Frozen so U1 can swap it in
// one place after James reviews the final copy. Subhead MUST be child-facing
// and must not mention any forbidden term.
export const GRAMMAR_DASHBOARD_HERO = Object.freeze({
  title: 'Grammar Garden',
  subtitle: "One short round. Fix tricky sentences. Grow your Grammar creatures.",
});

// Hero copy for the Grammar Bank scene. Child-facing only — kept frozen so
// U10's absence sweep iterates a single source of truth. Every concept card
// that renders here carries one short example sentence drawn from
// `GRAMMAR_CONCEPT_EXAMPLES` below.
export const GRAMMAR_BANK_HERO = Object.freeze({
  title: 'Grammar Bank',
  subtitle: 'Browse every concept. Tap a card to see examples or practise five questions.',
  empty: 'No concepts match your filters. Try another status or cluster.',
  emptyWithSearch: 'No concepts match. Try clearing your search or changing the filters.',
});

// Frozen map of child-facing labels for each Grammar Bank status filter. The
// scene iterates `GRAMMAR_BANK_STATUS_CHIPS` so the order stays stable across
// renders and matches the plan ordering: All · Due · Trouble · Learning ·
// Nearly secure · Secure · New.
export const GRAMMAR_BANK_STATUS_CHIPS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All', tone: 'all' }),
  Object.freeze({ id: 'due', label: 'Practise next', tone: 'due' }),
  Object.freeze({ id: 'trouble', label: 'Trouble', tone: 'trouble' }),
  Object.freeze({ id: 'learning', label: 'Learning', tone: 'learning' }),
  Object.freeze({ id: 'nearly-secure', label: 'Nearly secure', tone: 'nearly-secure' }),
  Object.freeze({ id: 'secure', label: 'Secure', tone: 'secure' }),
  Object.freeze({ id: 'new', label: 'New', tone: 'new' }),
]);

// Frozen map of cluster filter chips. Order matches the plan: All ·
// Bracehart · Chronalyx · Couronnail · Concordium. Child-facing copy only —
// reserved monster ids (Glossbloom / Loomrill / Mirrane) never appear here.
export const GRAMMAR_BANK_CLUSTER_CHIPS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All clusters' }),
  Object.freeze({ id: 'bracehart', label: 'Bracehart' }),
  Object.freeze({ id: 'chronalyx', label: 'Chronalyx' }),
  Object.freeze({ id: 'couronnail', label: 'Couronnail' }),
  Object.freeze({ id: 'concordium', label: 'Concordium' }),
]);

// Child-facing display names for the active Grammar clusters. Used by the
// concept card badge. Reserved monsters are intentionally absent so a rogue
// concept→cluster mapping cannot surface a retired name as a badge.
export const GRAMMAR_CLUSTER_DISPLAY_NAMES = Object.freeze({
  bracehart: 'Bracehart',
  chronalyx: 'Chronalyx',
  couronnail: 'Couronnail',
  concordium: 'Concordium',
});

// One short KS2-appropriate example sentence per Grammar concept. The bank
// card surfaces the first example; the detail modal surfaces up to two.
// Examples are written as full sentences so a learner can read them aloud.
// Keep sentences short, concrete, and free of adult-diagnostic language.
export const GRAMMAR_CONCEPT_EXAMPLES = Object.freeze({
  sentence_functions: Object.freeze([
    'Have you finished your homework?',
    'Shut the gate before the dog escapes!',
  ]),
  word_classes: Object.freeze([
    'The small fox ran quickly across the field.',
    'She quietly opened the ancient wooden box.',
  ]),
  noun_phrases: Object.freeze([
    'A tall tree with silver bark stood by the lake.',
    'The excited children on the beach built a sandcastle.',
  ]),
  adverbials: Object.freeze([
    'After lunch, we walked to the park.',
    'Suddenly, the lights went out.',
  ]),
  clauses: Object.freeze([
    'We stayed inside because the rain was heavy.',
    'Although it was late, Ben kept reading.',
  ]),
  relative_clauses: Object.freeze([
    'The dog, which was muddy, ran inside.',
    'My friend who plays the piano lives next door.',
  ]),
  tense_aspect: Object.freeze([
    'I have finished my book.',
    'They were playing football when the bell rang.',
  ]),
  standard_english: Object.freeze([
    'We were late for the bus.',
    'She did her homework before tea.',
  ]),
  pronouns_cohesion: Object.freeze([
    'Maya picked up the kitten and stroked it gently.',
    'The children waved at the bus driver, who waved back.',
  ]),
  formality: Object.freeze([
    'May I leave the room, please?',
    'I would be grateful if you could reply soon.',
  ]),
  active_passive: Object.freeze([
    'The chef baked the cake. (active)',
    'The cake was baked by the chef. (passive)',
  ]),
  subject_object: Object.freeze([
    'The cat chased the mouse.',
    'Jamal kicked the ball into the net.',
  ]),
  modal_verbs: Object.freeze([
    'You should wear a coat.',
    'We might visit Gran on Saturday.',
  ]),
  parenthesis_commas: Object.freeze([
    'The garden, full of roses, smelled sweet.',
    'Our teacher (who is very kind) helped us tidy up.',
  ]),
  speech_punctuation: Object.freeze([
    '"Where are my shoes?" asked Leo.',
    'Sara said, "I will meet you at the gate."',
  ]),
  apostrophes_possession: Object.freeze([
    "The girls' coats were on the hooks.",
    "Tom's bag fell off the chair.",
  ]),
  boundary_punctuation: Object.freeze([
    'Bring these items: a pen, a ruler and a book.',
    'The sky turned dark; the storm was close.',
  ]),
  hyphen_ambiguity: Object.freeze([
    'The man-eating shark circled the boat.',
    'Please re-sign the letter and send it back.',
  ]),
});

// Returns the first example sentence for a concept, or an empty string if no
// example exists. Safe on unknown ids.
export function grammarConceptPrimaryExample(conceptId) {
  if (typeof conceptId !== 'string' || !conceptId) return '';
  const entries = GRAMMAR_CONCEPT_EXAMPLES[conceptId];
  return Array.isArray(entries) && entries.length ? entries[0] : '';
}

// Returns the full example list for a concept (up to two sentences) or an
// empty array. Used by the detail modal.
export function grammarConceptExamples(conceptId) {
  if (typeof conceptId !== 'string' || !conceptId) return [];
  const entries = GRAMMAR_CONCEPT_EXAMPLES[conceptId];
  return Array.isArray(entries) ? entries.slice(0, 2) : [];
}

// Child-facing copy for concept attempt evidence. Returns a single short
// sentence like "You've answered 3 of these. 2 were correct." Hides raw
// percentages — learners see whole-number tallies only.
export function grammarConceptEvidenceLine({ attempts = 0, correct = 0 } = {}) {
  const safeAttempts = Number.isFinite(Number(attempts)) && Number(attempts) > 0 ? Math.floor(Number(attempts)) : 0;
  const safeCorrect = Number.isFinite(Number(correct)) && Number(correct) > 0 ? Math.floor(Number(correct)) : 0;
  if (safeAttempts === 0) return 'You have not answered any of these yet.';
  const noun = safeAttempts === 1 ? 'answer' : 'answers';
  const correctWord = safeCorrect === 1 ? 'was correct' : 'were correct';
  return `You have ${safeAttempts} ${noun} on this concept. ${safeCorrect} ${correctWord}.`;
}

// Frozen order of child-facing Grammar monsters. Post-U0 the active roster
// is Bracehart, Chronalyx, Couronnail (3 direct clusters) plus Concordium
// (whole-Grammar aggregate). Retired ids Glossbloom / Loomrill / Mirrane
// never appear here — summary and dashboard consume this list directly.
const ACTIVE_GRAMMAR_MONSTER_IDS = Object.freeze([
  'bracehart',
  'chronalyx',
  'couronnail',
  GRAMMAR_GRAND_MONSTER_ID, // 'concordium'
]);

const ACTIVE_GRAMMAR_MONSTER_DISPLAY_NAMES = Object.freeze({
  bracehart: 'Bracehart',
  chronalyx: 'Chronalyx',
  couronnail: 'Couronnail',
  concordium: 'Concordium',
});

const ACTIVE_GRAMMAR_MONSTER_CONCEPT_COUNTS = Object.freeze({
  bracehart: 6,
  chronalyx: 4,
  couronnail: 3,
  concordium: GRAMMAR_AGGREGATE_CONCEPTS.length,
});

// --- Forbidden-terms fixture ------------------------------------------------

// Every adult/developer term that must not appear in child surfaces. U10
// iterates this list against every child phase. The list is frozen so a
// rogue mutation would throw rather than silently weakening the guard.
//
// Additions here propagate automatically — we do not maintain per-phase
// override lists. `isGrammarChildCopy` uses a case-insensitive match, so
// there is no need to duplicate capitalised variants; the wrapper check
// handles those.
export const GRAMMAR_CHILD_FORBIDDEN_TERMS = Object.freeze([
  'Worker',
  'Worker-marked',
  'Worker authority',
  'Worker marked',
  'Worker-held',
  'Stage 1',
  'Full placeholder map',
  'Full map',
  'Evidence snapshot',
  'Reserved reward routes',
  'Reserved reward',
  'Bellstorm bridge',
  '18-concept denominator',
  'read model',
  'denominator',
  'reward route',
  'projection',
  'retrieval practice',
  'Delayed feedback',
  'Mini-set review',
]);

/**
 * Returns `true` iff `text` contains none of `GRAMMAR_CHILD_FORBIDDEN_TERMS`.
 * Match is case-insensitive. Empty / non-string input returns `true` so the
 * helper is safe to call against e.g. `undefined` chip labels.
 */
export function isGrammarChildCopy(text) {
  if (typeof text !== 'string' || !text) return true;
  const haystack = text.toLowerCase();
  for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
    if (typeof term !== 'string' || !term) continue;
    if (haystack.includes(term.toLowerCase())) return false;
  }
  return true;
}

// --- Child confidence label mapping -----------------------------------------
// U9 Phase 7: label and tone mappings are centralised in
// `shared/grammar/grammar-status.js`. The view-model delegates to
// `grammarChildLabelForInternal` and `grammarChildToneForInternal` so the
// truth table lives in a single place. Validation of incoming labels uses
// `isGrammarConfidenceLabel` so we never silently accept an out-of-taxonomy
// label.

/**
 * Translates the internal five-label taxonomy into child-friendly copy.
 * Delegates to the centralised `grammarChildLabelForInternal` in
 * `shared/grammar/grammar-status.js`. Validates the incoming label via
 * `isGrammarConfidenceLabel` first (defensive against fixture drift).
 */
export function grammarChildConfidenceLabel({ label } = {}) {
  if (!isGrammarConfidenceLabel(label)) return grammarChildLabelForInternal(null);
  return grammarChildLabelForInternal(label);
}

/**
 * CSS-class-appropriate tone for each child confidence label. Delegates to
 * `grammarChildToneForInternal` in `shared/grammar/grammar-status.js`.
 * Matches the status-chip tone family used by Spelling's Word Bank so the
 * visual hierarchy is consistent across subjects.
 */
export function grammarChildConfidenceTone(label) {
  return grammarChildToneForInternal(label);
}

// --- Concept → cluster resolver ---------------------------------------------

/**
 * Resolves a Grammar concept id to its active cluster monster. Returns one
 * of `'bracehart' | 'chronalyx' | 'couronnail' | 'concordium'`. Concepts
 * that are punctuation-for-grammar only (e.g. `parenthesis_commas`) live in
 * Concordium's aggregate cluster — they are not mapped to a direct cluster
 * in `GRAMMAR_CONCEPT_TO_MONSTER`, so this helper falls back to Concordium.
 * Unknown concept ids also return `'concordium'` to keep the dashboard safe.
 */
export function grammarMonsterClusterForConcept(conceptId) {
  if (typeof conceptId !== 'string' || !conceptId) return GRAMMAR_GRAND_MONSTER_ID;
  const directCluster = GRAMMAR_CONCEPT_TO_MONSTER[conceptId];
  if (directCluster) return directCluster;
  return GRAMMAR_GRAND_MONSTER_ID;
}

// --- Grammar Bank filter helpers --------------------------------------------

/**
 * Maps a child-facing status filter id to the internal confidence label.
 * `all` matches every label. Otherwise the mapping is the inverse of
 * `grammarChildConfidenceLabel`. Input `label` is the internal five-label
 * string (e.g., `'needs-repair'`); input `filter` is the child id (e.g.,
 * `'trouble'`).
 */
export function grammarBankFilterMatchesStatus(filter, label) {
  if (filter === 'all') return true;
  if (typeof label !== 'string') return false;
  if (filter === 'trouble') return label === 'needs-repair';
  if (filter === 'learning') return label === 'building';
  if (filter === 'nearly-secure') return label === 'consolidating';
  if (filter === 'new') return label === 'emerging';
  if (filter === 'secure') return label === 'secure';
  if (filter === 'due') return label === 'needs-repair' || label === 'building';
  return false;
}

// --- Search helper ----------------------------------------------------------

function normaliseSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function conceptMatchesQuery(concept, query) {
  if (!query) return true;
  const fields = [
    concept?.name,
    concept?.summary,
    concept?.domain,
    concept?.example,
    ...(Array.isArray(concept?.examples) ? concept.examples : []),
  ].map(normaliseSearchText);
  return fields.some((field) => field.includes(query));
}

// --- Dashboard model builder ------------------------------------------------

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function masteredCountForRewardEntry(entry, releaseId = GRAMMAR_REWARD_RELEASE_ID) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return 0;
  const masteredList = Array.isArray(entry.mastered) ? entry.mastered : [];
  if (masteredList.length === 0) return safeNumber(entry.masteredCount, 0);
  const conceptIds = new Set();
  for (const key of masteredList) {
    const scopedReleaseId = typeof entry.releaseId === 'string' && entry.releaseId
      ? entry.releaseId
      : releaseId;
    const conceptId = grammarConceptIdFromMasteryKey(key, scopedReleaseId);
    if (conceptId) conceptIds.add(conceptId);
  }
  return conceptIds.size || masteredList.length;
}

function concordiumProgressFromReward(rewardState) {
  if (!rewardState || typeof rewardState !== 'object' || Array.isArray(rewardState)) {
    return { mastered: 0, total: GRAMMAR_AGGREGATE_CONCEPTS.length };
  }
  const entry = rewardState[GRAMMAR_GRAND_MONSTER_ID];
  return {
    mastered: masteredCountForRewardEntry(entry),
    total: GRAMMAR_AGGREGATE_CONCEPTS.length,
  };
}

/**
 * Builds the dashboard view-model. Pure reducer over the read-model +
 * learner + reward-state shapes. Returns a safe empty shape when any input
 * is missing, so the dashboard never throws on a fresh learner.
 *
 * Shape:
 *   {
 *     modeCards:     Frozen copy of GRAMMAR_PRIMARY_MODE_CARDS,
 *     todayCards:    Array<{ id, label, value, detail }>,
 *     isEmpty:       boolean, // true when all four Today counts are zero
 *     concordiumProgress: { mastered: number, total: number },
 *     monsterStrip:  Array<{ monsterId, name, stageName, stars, starMax, stageIndex, accentColor }>,
 *     primaryMode:   string,  // grammar.prefs.mode
 *     moreModes:     Frozen copy of GRAMMAR_MORE_PRACTICE_MODES,
 *     writingTryAvailable: boolean,
 *   }
 *
 * U10 Phase 5: `monsterStrip` is wired into the dashboard model alongside
 * the legacy `concordiumProgress` shape. The legacy shape is preserved for
 * backward compatibility — existing JSX consumers continue to read
 * `concordiumProgress.mastered / total`. New Star-aware consumers read
 * `monsterStrip[i].stars / starMax` instead.
 */
export function buildGrammarDashboardModel(grammar, _learner, rewardState, masteryConceptNodes = null, recentAttempts = null) {
  const safeGrammar = grammar && typeof grammar === 'object' && !Array.isArray(grammar) ? grammar : {};
  const progressSnapshot = safeGrammar.analytics?.progressSnapshot && typeof safeGrammar.analytics.progressSnapshot === 'object'
    ? safeGrammar.analytics.progressSnapshot
    : {};
  const counts = safeGrammar.stats?.concepts || {};

  const dueCount = safeNumber(progressSnapshot.dueConcepts ?? counts.due, 0);
  const troubleCount = safeNumber(progressSnapshot.weakConcepts ?? counts.weak, 0);
  const secureCount = safeNumber(progressSnapshot.securedConcepts ?? counts.secured, 0);
  // Streak is surfaced when the progress snapshot carries it (forward-compat
  // for U5 / U1 once a real streak field lands). Falls back to 0 today.
  const streakCount = safeNumber(progressSnapshot.streak ?? progressSnapshot.streakCount, 0);

  const todayCards = [
    Object.freeze({ id: 'due', label: 'Due', value: dueCount, detail: 'Come back to these today' }),
    Object.freeze({ id: 'trouble', label: 'Trouble spots', value: troubleCount, detail: 'Fix what wobbles' }),
    Object.freeze({ id: 'secure', label: 'Secure', value: secureCount, detail: 'You own these' }),
    Object.freeze({ id: 'streak', label: 'Streak', value: streakCount, detail: 'Rounds in a row' }),
  ];

  const aiEnabled = safeGrammar.capabilities?.aiEnrichment?.enabled !== false;
  const primaryMode = typeof safeGrammar.prefs?.mode === 'string' && safeGrammar.prefs.mode
    ? safeGrammar.prefs.mode
    : 'smart';

  // Brand-new learner: all four Today counts are zero. The dashboard swaps
  // the four zero-tiles for a single friendly callout so the first view does
  // not read as a bleak status board.
  const isEmpty = (dueCount + troubleCount + secureCount + streakCount) === 0;

  return {
    modeCards: GRAMMAR_PRIMARY_MODE_CARDS,
    secondaryLinks: GRAMMAR_SECONDARY_MODE_LINKS,
    todayCards: Object.freeze(todayCards),
    isEmpty,
    concordiumProgress: concordiumProgressFromReward(rewardState),
    monsterStrip: buildGrammarMonsterStripModel(rewardState, masteryConceptNodes, recentAttempts),
    primaryMode,
    moreModes: GRAMMAR_MORE_PRACTICE_MODES,
    writingTryAvailable: true,
  };
}

// --- Grammar Bank model builder ---------------------------------------------

function childLabelForConcept(concept) {
  // Analytics concept shape carries an internal `confidenceLabel` after the
  // Worker projects it. Older fixtures may only carry a coarse `status` —
  // `'new' | 'learning' | 'weak' | 'due' | 'secured'`. We map status → label
  // so the bank renders a child label even on first boot.
  if (typeof concept?.confidenceLabel === 'string') return concept.confidenceLabel;
  switch (concept?.status) {
    case 'secured': return 'secure';
    case 'due': return 'needs-repair';
    case 'weak': return 'needs-repair';
    case 'learning': return 'building';
    case 'new':
    default: return 'emerging';
  }
}

function defaultConceptMetadata(conceptId) {
  const entry = GRAMMAR_CLIENT_CONCEPTS.find((concept) => concept.id === conceptId);
  return entry || { id: conceptId, name: conceptId, summary: '', domain: '' };
}

function buildBankCard(concept) {
  const metadata = defaultConceptMetadata(concept?.id || '');
  const label = childLabelForConcept(concept);
  const cluster = grammarMonsterClusterForConcept(metadata.id);
  const examples = grammarConceptExamples(metadata.id);
  return {
    id: metadata.id,
    name: concept?.name || metadata.name,
    domain: concept?.domain || metadata.domain,
    summary: concept?.summary || metadata.summary,
    label,
    childLabel: grammarChildConfidenceLabel({ label }),
    tone: grammarChildConfidenceTone(label),
    cluster,
    clusterName: GRAMMAR_CLUSTER_DISPLAY_NAMES[cluster] || '',
    example: examples[0] || '',
    examples,
    attempts: safeNumber(concept?.attempts, 0),
    correct: safeNumber(concept?.correct, 0),
    wrong: safeNumber(concept?.wrong, 0),
  };
}

function bankCardMatchesFilter(card, { statusFilter, clusterFilter, query }) {
  if (!grammarBankFilterMatchesStatus(statusFilter || 'all', card.label)) return false;
  if (clusterFilter && clusterFilter !== 'all') {
    if (clusterFilter === 'concordium') {
      // The Concordium filter shows every concept (aggregate view).
    } else if (card.cluster !== clusterFilter) {
      return false;
    }
  }
  if (query && !conceptMatchesQuery(card, query)) return false;
  return true;
}

function bankCountsFromCards(cards) {
  const counts = {
    all: cards.length,
    due: 0,
    trouble: 0,
    learning: 0,
    'nearly-secure': 0,
    secure: 0,
    new: 0,
  };
  for (const card of cards) {
    if (card.label === 'needs-repair') counts.trouble += 1;
    if (card.label === 'needs-repair' || card.label === 'building') counts.due += 1;
    if (card.label === 'building') counts.learning += 1;
    if (card.label === 'consolidating') counts['nearly-secure'] += 1;
    if (card.label === 'secure') counts.secure += 1;
    if (card.label === 'emerging') counts.new += 1;
  }
  return counts;
}

/**
 * Builds the Grammar Bank aggregate summary cards (Answered totals across
 * every concept, broken out by status). Counts are whole integers — no
 * percentages — so a learner sees plain tallies. `total` is the globally
 * stable concept count (always 18 for the KS2 roster); the scene passes the
 * `total` from `buildGrammarBankModel` so the Total card stays stable even
 * when a cluster filter narrows the other tallies.
 */
export function grammarBankAggregateCards(counts = {}, { total } = {}) {
  const safe = counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : {};
  const totalValue = Number.isFinite(Number(total)) && Number(total) >= 0
    ? Math.floor(Number(total))
    : safeNumber(safe.all, 0);
  return Object.freeze([
    Object.freeze({ id: 'total', label: 'Total', value: totalValue, sub: 'Grammar concepts tracked' }),
    Object.freeze({ id: 'secure', label: 'Secure', value: safeNumber(safe.secure, 0), sub: 'You own these' }),
    Object.freeze({ id: 'nearly-secure', label: 'Nearly secure', value: safeNumber(safe['nearly-secure'], 0), sub: 'Almost there' }),
    Object.freeze({ id: 'trouble', label: 'Trouble', value: safeNumber(safe.trouble, 0), sub: 'Fix these next' }),
    Object.freeze({ id: 'learning', label: 'Learning', value: safeNumber(safe.learning, 0), sub: 'Building up' }),
    Object.freeze({ id: 'new', label: 'New', value: safeNumber(safe.new, 0), sub: 'Not yet introduced' }),
  ]);
}

/**
 * Builds the Grammar Bank view-model. Filters by `statusFilter` and
 * `clusterFilter`, narrows by `query` (searches concept name, summary,
 * domain, example). Always returns the full 18 concepts when
 * `{ statusFilter: 'all', clusterFilter: 'all', query: '' }`.
 */
export function buildGrammarBankModel(grammar, { statusFilter = 'all', clusterFilter = 'all', query = '' } = {}) {
  const safeGrammar = grammar && typeof grammar === 'object' && !Array.isArray(grammar) ? grammar : {};
  const concepts = Array.isArray(safeGrammar.analytics?.concepts)
    ? safeGrammar.analytics.concepts
    : [];

  // Ensure every known concept is represented. If the read-model is missing
  // a concept (e.g., freshly-boot learner), we fall back to the static
  // metadata so the bank always shows 18 cards when no filter is active.
  const byId = new Map(concepts.map((entry) => [entry?.id, entry]));
  const allCards = GRAMMAR_CLIENT_CONCEPTS.map((metadata) => {
    const analytics = byId.get(metadata.id) || { id: metadata.id, status: 'new' };
    return buildBankCard(analytics);
  });

  const normalisedQuery = normaliseSearchText(query);
  const clusterScopedCards = allCards.filter((card) => {
    if (!clusterFilter || clusterFilter === 'all') return true;
    if (clusterFilter === 'concordium') return true;
    return card.cluster === clusterFilter;
  });
  const filteredCards = allCards.filter((card) => bankCardMatchesFilter(card, {
    statusFilter,
    clusterFilter,
    query: normalisedQuery,
  }));

  // Status-chip counts reflect the currently selected cluster scope so the
  // numbers next to each chip match what clicking the chip would reveal.
  // Cluster-chip counts reflect the full concept list so switching clusters
  // always shows the total for that cluster.
  const clusterCounts = {
    all: allCards.length,
    bracehart: allCards.filter((card) => card.cluster === 'bracehart').length,
    chronalyx: allCards.filter((card) => card.cluster === 'chronalyx').length,
    couronnail: allCards.filter((card) => card.cluster === 'couronnail').length,
    concordium: allCards.length, // aggregate view shows every concept
  };

  return {
    cards: filteredCards,
    counts: bankCountsFromCards(clusterScopedCards),
    clusterCounts,
    total: allCards.length,
  };
}

// --- Summary cards builder --------------------------------------------------

function masteredSummaryFromReward(rewardState) {
  if (!rewardState || typeof rewardState !== 'object' || Array.isArray(rewardState)) {
    return ACTIVE_GRAMMAR_MONSTER_IDS.map((monsterId) => Object.freeze({
      id: monsterId,
      name: ACTIVE_GRAMMAR_MONSTER_DISPLAY_NAMES[monsterId] || monsterId,
      mastered: 0,
      total: ACTIVE_GRAMMAR_MONSTER_CONCEPT_COUNTS[monsterId] || 1,
    }));
  }
  return ACTIVE_GRAMMAR_MONSTER_IDS.map((monsterId) => Object.freeze({
    id: monsterId,
    name: ACTIVE_GRAMMAR_MONSTER_DISPLAY_NAMES[monsterId] || monsterId,
    mastered: masteredCountForRewardEntry(rewardState[monsterId]),
    total: ACTIVE_GRAMMAR_MONSTER_CONCEPT_COUNTS[monsterId] || 1,
  }));
}

/**
 * Builds the five summary cards for the child-facing round-end screen:
 * Answered / Correct / Trouble spots found / New secure / Monster progress
 * (4 active only). Reserved monsters never appear in the monster progress
 * entry, matching R15. Safe on empty summary and empty reward state.
 */
// --- Monster strip child-facing copy ------------------------------------------

export const GRAMMAR_MONSTER_STRIP_CHILD_COPY = Object.freeze(
  'Get 1 Star to find the Egg. Reach 100 Stars for Mega.',
);

// --- Monster strip model builder ---------------------------------------------

/**
 * Builds the compact monster progress strip for the Grammar dashboard.
 * Returns an array of 4 entries (one per active Grammar monster) in the
 * canonical order: Bracehart, Chronalyx, Couronnail, Concordium.
 *
 * Each entry:
 *   {
 *     monsterId:   string,
 *     name:        string,
 *     stageName:   string,   // child-facing label from grammarStarStageName
 *     stars:       number,   // 0–100
 *     starMax:     100,
 *     stageIndex:  number,   // display stage 0–5
 *     accentColor: string,   // CSS hex colour from MONSTERS registry
 *   }
 *
 * @param {object} rewardState — learner's Grammar reward state (monster entries)
 * @param {object} masteryConceptNodes — map of conceptId → mastery node
 * @param {Array}  recentAttempts — engine recentAttempts array
 */
export function buildGrammarMonsterStripModel(rewardState, masteryConceptNodes, recentAttempts) {
  const safeReward = rewardState && typeof rewardState === 'object' && !Array.isArray(rewardState)
    ? rewardState : {};
  const safeConcepts = masteryConceptNodes && typeof masteryConceptNodes === 'object'
    && !Array.isArray(masteryConceptNodes) ? masteryConceptNodes : null;
  const safeAttempts = Array.isArray(recentAttempts) ? recentAttempts : [];

  return ACTIVE_GRAMMAR_MONSTER_IDS.map((monsterId) => {
    const conceptTotal = ACTIVE_GRAMMAR_MONSTER_CONCEPT_COUNTS[monsterId] || 1;
    const progress = progressForGrammarMonster(safeReward, monsterId, {
      conceptTotal,
      conceptNodes: safeConcepts,
      recentAttempts: safeAttempts,
    });

    const stars = typeof progress.stars === 'number' && Number.isFinite(progress.stars)
      ? progress.stars : 0;
    const monster = MONSTERS[monsterId];
    const accentColor = monster?.accent || '#888888';

    return Object.freeze({
      monsterId,
      name: ACTIVE_GRAMMAR_MONSTER_DISPLAY_NAMES[monsterId] || monsterId,
      stageName: progress.stageName || grammarStarStageName(stars),
      stars,
      starMax: GRAMMAR_MONSTER_STAR_MAX,
      stageIndex: Number.isFinite(Number(progress.displayStage))
        ? Math.max(0, Math.floor(Number(progress.displayStage)))
        : grammarStarDisplayStage(stars),
      displayState: progress.displayState || 'not-found',
      accentColor,
    });
  });
}

// --- Summary cards builder --------------------------------------------------

export function grammarSummaryCards(summary, rewardState, masteryConceptNodes = null, recentAttempts = null) {
  const safeSummary = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
  const answered = safeNumber(safeSummary.answered, 0);
  const nonScoredAnswered = safeNumber(safeSummary.nonScoredAnswered, 0);
  const scoredAnswered = Object.prototype.hasOwnProperty.call(safeSummary, 'scoredAnswered')
    ? safeNumber(safeSummary.scoredAnswered, 0)
    : Math.max(0, answered - nonScoredAnswered);
  const correct = safeNumber(safeSummary.correct, 0);
  const troubleSpotsFound = safeNumber(safeSummary.troubleSpotsFound ?? safeSummary.weakConceptsSurfaced, 0);
  const newSecure = safeNumber(safeSummary.conceptsNewlySecured ?? safeSummary.newSecure, 0);
  const correctDetail = scoredAnswered
    ? `${Math.round((correct / scoredAnswered) * 100)}% accuracy`
    : (nonScoredAnswered ? 'Saved for review' : 'No answers yet');

  return Object.freeze([
    Object.freeze({ id: 'answered', label: 'Answered', value: answered, detail: 'Questions this round' }),
    Object.freeze({ id: 'correct', label: 'Correct', value: correct, detail: correctDetail }),
    Object.freeze({ id: 'trouble', label: 'Trouble spots found', value: troubleSpotsFound, detail: 'We will come back to these' }),
    Object.freeze({ id: 'new-secure', label: 'New secure', value: newSecure, detail: 'Concepts you just locked in' }),
    Object.freeze({
      id: 'monster-progress',
      label: 'Monster progress',
      value: buildGrammarMonsterStripModel(rewardState, masteryConceptNodes, recentAttempts),
      detail: 'Your four Grammar creatures',
    }),
  ]);
}
