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

import { GRAMMAR_CLIENT_CONCEPTS } from '../metadata.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_CONCEPT_TO_MONSTER,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarConceptIdFromMasteryKey,
} from '../../../platform/game/mastery/grammar.js';
import { GRAMMAR_GRAND_MONSTER_ID } from '../../../platform/game/mastery/shared.js';

// --- Frozen option lists ----------------------------------------------------

// The dashboard's four primary mode cards. `Smart Practice` sits first so it
// is the obvious default action (R2). `Grammar Bank` is the fourth card and
// routes into U2's new bank scene. `satsset` maps to the existing mode id so
// the module dispatcher does not need renaming.
export const GRAMMAR_PRIMARY_MODE_CARDS = Object.freeze([
  Object.freeze({
    id: 'smart',
    title: 'Smart Practice',
    desc: 'Due · weak · one fresh concept.',
    featured: true,
  }),
  Object.freeze({
    id: 'trouble',
    title: 'Fix Trouble Spots',
    desc: 'Only the concepts you usually miss.',
    featured: false,
  }),
  Object.freeze({
    id: 'satsset',
    title: 'Mini Test',
    desc: 'Short timed set. Marks at the end.',
    featured: false,
  }),
  Object.freeze({
    id: 'bank',
    title: 'Grammar Bank',
    desc: 'Browse every concept with child-friendly statuses.',
    featured: false,
  }),
]);

// Secondary modes disclosed under the dashboard's "More practice" details
// block. Order follows the plan: Learn → Sentence Surgery → Sentence Builder
// → Worked Examples → Faded Guidance.
export const GRAMMAR_MORE_PRACTICE_MODES = Object.freeze([
  Object.freeze({ id: 'learn', title: 'Learn a concept', desc: 'Focused retrieval on one concept at a time.' }),
  Object.freeze({ id: 'surgery', title: 'Sentence Surgery', desc: 'Fix and rewrite sentence-level errors.' }),
  Object.freeze({ id: 'builder', title: 'Sentence Builder', desc: 'Build sentences from structured prompts.' }),
  Object.freeze({ id: 'worked', title: 'Worked Examples', desc: 'See a modelled answer before your turn.' }),
  Object.freeze({ id: 'faded', title: 'Faded Guidance', desc: 'Less help each round. You do the reasoning.' }),
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

const CHILD_CONFIDENCE_LABELS = Object.freeze({
  emerging: 'New',
  building: 'Learning',
  'needs-repair': 'Trouble spot',
  consolidating: 'Nearly secure',
  secure: 'Secure',
});

const CHILD_CONFIDENCE_TONES = Object.freeze({
  emerging: 'new',
  building: 'learning',
  'needs-repair': 'trouble',
  consolidating: 'nearly-secure',
  secure: 'secure',
});

/**
 * Translates the internal five-label taxonomy (`emerging | building |
 * consolidating | secure | needs-repair`) into child-friendly copy. Input
 * shape accepts `{ label }` so callers can pass the entire confidence
 * projection. Unknown labels fall back to `Learning`, matching the Spelling
 * wording default.
 */
export function grammarChildConfidenceLabel({ label } = {}) {
  if (typeof label !== 'string') return 'Learning';
  return CHILD_CONFIDENCE_LABELS[label] || 'Learning';
}

/**
 * CSS-class-appropriate tone for each child confidence label. Matches the
 * status-chip tone family used by Spelling's Word Bank so the visual hierarchy
 * is consistent across subjects.
 */
export function grammarChildConfidenceTone(label) {
  if (typeof label !== 'string') return 'learning';
  return CHILD_CONFIDENCE_TONES[label] || 'learning';
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
 *     primaryMode:   string,  // grammar.prefs.mode
 *     moreModes:     Frozen copy of GRAMMAR_MORE_PRACTICE_MODES,
 *     writingTryAvailable: boolean,
 *   }
 */
export function buildGrammarDashboardModel(grammar, _learner, rewardState) {
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
    todayCards: Object.freeze(todayCards),
    isEmpty,
    concordiumProgress: concordiumProgressFromReward(rewardState),
    primaryMode,
    moreModes: GRAMMAR_MORE_PRACTICE_MODES,
    writingTryAvailable: aiEnabled,
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
  return {
    id: metadata.id,
    name: concept?.name || metadata.name,
    domain: concept?.domain || metadata.domain,
    summary: concept?.summary || metadata.summary,
    label,
    childLabel: grammarChildConfidenceLabel({ label }),
    tone: grammarChildConfidenceTone(label),
    cluster: grammarMonsterClusterForConcept(metadata.id),
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
  const filteredCards = allCards.filter((card) => bankCardMatchesFilter(card, {
    statusFilter,
    clusterFilter,
    query: normalisedQuery,
  }));

  return {
    cards: filteredCards,
    counts: bankCountsFromCards(allCards),
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
export function grammarSummaryCards(summary, rewardState) {
  const safeSummary = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
  const answered = safeNumber(safeSummary.answered, 0);
  const correct = safeNumber(safeSummary.correct, 0);
  const troubleSpotsFound = safeNumber(safeSummary.troubleSpotsFound ?? safeSummary.weakConceptsSurfaced, 0);
  const newSecure = safeNumber(safeSummary.conceptsNewlySecured ?? safeSummary.newSecure, 0);

  return Object.freeze([
    Object.freeze({ id: 'answered', label: 'Answered', value: answered, detail: 'Questions this round' }),
    Object.freeze({ id: 'correct', label: 'Correct', value: correct, detail: answered ? `${Math.round((correct / answered) * 100)}% accuracy` : 'No answers yet' }),
    Object.freeze({ id: 'trouble', label: 'Trouble spots found', value: troubleSpotsFound, detail: 'We will come back to these' }),
    Object.freeze({ id: 'new-secure', label: 'New secure', value: newSecure, detail: 'Concepts you just locked in' }),
    Object.freeze({
      id: 'monster-progress',
      label: 'Monster progress',
      value: masteredSummaryFromReward(rewardState),
      detail: 'Your four Grammar creatures',
    }),
  ]);
}
