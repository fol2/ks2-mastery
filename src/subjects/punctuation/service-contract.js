export const PUNCTUATION_SERVICE_STATE_VERSION = 1;
export const PUNCTUATION_CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';

export const PUNCTUATION_PHASES = Object.freeze([
  'setup',
  'active-item',
  'feedback',
  'summary',
  'unavailable',
  'error',
  // U5: Punctuation Map is a browsing phase — a learner taps the Map link from
  // Setup, filters the 14 skills by status / monster, and (in U6) opens a
  // skill detail modal. The phase carries ephemeral UI state via `mapUi`
  // (see `normalisePunctuationMapUi`) — no Worker command is issued when
  // entering or leaving the phase.
  'map',
]);

// U5: Phases from which `punctuation-open-map` is a legitimate affordance.
// Setup is the primary entry point (Map link on the dashboard); Summary offers
// "Open Punctuation Map" as a next-action (plan line 519). Any other phase —
// `active-item`, `feedback`, `unavailable`, `error`, or `map` itself — refuses
// the transition to prevent an orphan session / stale feedback from leaking
// into phase=map (adversarial reviewer adv-219-002).
export const PUNCTUATION_OPEN_MAP_ALLOWED_PHASES = Object.freeze(['setup', 'summary']);

// U5: Map filter chip rows and detail-tab ids. These frozen lists are the
// single source of truth — `normalisePunctuationMapUi` validates inputs
// against them, module handlers guard dispatched values against them, and
// the view-model / scene re-exports them for render-time chip iteration.
// Reserved Punctuation monsters (Colisk / Hyphang / Carillon) are absent
// from the monster filter list so a rogue payload cannot surface a retired
// name as a filter option.
//
// Phase 4 U3 (review follow-on): `'unknown'` is included so the filter chip
// row stays consistent with the skill-row status enum once the upstream
// worker starts emitting `analytics.available === false`. Without this
// entry the degraded state would trap a learner on any non-"All" chip
// (every skill is `'unknown'`, but the filter has no matching id → the
// Map renders zero cards with no empty-state message). The chip is a
// harmless extra slot while the upstream wiring is still deferred.
export const PUNCTUATION_MAP_STATUS_FILTER_IDS = Object.freeze([
  'all', 'new', 'learning', 'due', 'weak', 'secure', 'unknown',
]);

export const PUNCTUATION_MAP_MONSTER_FILTER_IDS = Object.freeze([
  'all', 'pealark', 'claspin', 'curlune', 'quoral',
]);

export const PUNCTUATION_MAP_DETAIL_TAB_IDS = Object.freeze(['learn', 'practise']);

// U5: Published skill ids. Client-safe mirror of the 14 skills that ship in
// the current Punctuation release. Defined here (rather than read-model.js)
// so the normaliser + module handler can validate a dispatched `skillId`
// without reaching into a client-only module. The full skill metadata (name +
// clusterId) lives on `PUNCTUATION_CLIENT_SKILLS` in read-model.js; this set
// must stay in lock-step with that list (drift-tested).
export const PUNCTUATION_CLIENT_SKILL_IDS = Object.freeze([
  'sentence_endings',
  'list_commas',
  'apostrophe_contractions',
  'apostrophe_possession',
  'speech',
  'fronted_adverbial',
  'parenthesis',
  'comma_clarity',
  'colon_list',
  'semicolon',
  'dash_clause',
  'semicolon_list',
  'bullet_points',
  'hyphen',
]);

const PUNCTUATION_CLIENT_SKILL_ID_SET = new Set(PUNCTUATION_CLIENT_SKILL_IDS);

export function isPublishedPunctuationSkillId(value) {
  return typeof value === 'string' && PUNCTUATION_CLIENT_SKILL_ID_SET.has(value);
}

export const PUNCTUATION_MODES = Object.freeze([
  'smart',
  'guided',
  'weak',
  'gps',
  'endmarks',
  'apostrophe',
  'speech',
  'comma_flow',
  'boundary',
  'structure',
]);

export const PUNCTUATION_ROUND_LENGTHS = Object.freeze(['1', '2', '3', '4', '6', '8', '12']);

export const DEFAULT_PUNCTUATION_PREFS = Object.freeze({
  mode: 'smart',
  roundLength: '4',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cloneSerialisable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function normaliseOptionalString(value) {
  return typeof value === 'string' && value ? value : null;
}

export function normaliseBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  return fallback;
}

export function normaliseNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseTimestamp(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normaliseStringArray(value, filterFn = null) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry)
    .filter((entry) => (typeof filterFn === 'function' ? filterFn(entry) : true));
}

export function normalisePunctuationMode(value, fallback = DEFAULT_PUNCTUATION_PREFS.mode) {
  return PUNCTUATION_MODES.includes(value) ? value : fallback;
}

export function normalisePunctuationRoundLength(value, fallback = DEFAULT_PUNCTUATION_PREFS.roundLength) {
  if (value === 'all') return 'all';
  const candidate = String(value ?? fallback);
  if (PUNCTUATION_ROUND_LENGTHS.includes(candidate)) return candidate;
  const parsed = Number.parseInt(candidate, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 12 ? String(parsed) : fallback;
}

export function normalisePunctuationPrefs(value = {}) {
  const raw = isPlainObject(value) ? value : {};
  const mode = normalisePunctuationMode(raw.mode);
  return {
    mode,
    roundLength: normalisePunctuationRoundLength(raw.roundLength ?? raw.length),
  };
}

// U5: Punctuation Map UI-state shape. Ephemeral; lives on the in-memory store
// only, never persisted. Validated against the frozen filter / skill-id lists
// above so a rogue payload cannot smuggle a reserved monster id or an
// unpublished skill id into the Map's chip row or detail modal. Invalid
// inputs fall back to the defaults listed below — never throws.
//
// Defaults when the Map phase first opens:
//   { statusFilter: 'all', monsterFilter: 'all', detailOpenSkillId: null,
//     detailTab: 'learn', returnTo: 'setup' }
//
// `detailOpenSkillId` is either a published skill id (currently one of 14)
// or `null`. `detailTab` is either `'learn'` or `'practise'`; invalid input
// falls back to `'learn'`.
//
// U4 follower (adv-238-003): `returnTo` remembers the source phase so
// `punctuation-close-map` can route the learner back to the Summary scene
// instead of always collapsing to Setup. Only `'setup'` and `'summary'` are
// accepted values — any other input falls back to `'setup'` so a rogue
// payload never strands the learner on a dead phase. `punctuation-open-map`
// seeds this from the current phase before flipping to `phase: 'map'`.
const PUNCTUATION_MAP_DETAIL_TABS = new Set(PUNCTUATION_MAP_DETAIL_TAB_IDS);
const PUNCTUATION_MAP_RETURN_PHASES = Object.freeze(['setup', 'summary']);

export function normalisePunctuationMapUi(value = {}) {
  const raw = isPlainObject(value) ? value : {};
  const rawStatusFilter = typeof raw.statusFilter === 'string' ? raw.statusFilter : 'all';
  const statusFilter = PUNCTUATION_MAP_STATUS_FILTER_IDS.includes(rawStatusFilter)
    ? rawStatusFilter
    : 'all';
  const rawMonsterFilter = typeof raw.monsterFilter === 'string' ? raw.monsterFilter : 'all';
  const monsterFilter = PUNCTUATION_MAP_MONSTER_FILTER_IDS.includes(rawMonsterFilter)
    ? rawMonsterFilter
    : 'all';
  // detailOpenSkillId must be a published skill id — unknown ids reset to
  // null so a U6 modal consumer never renders against a rogue payload.
  const detailOpenSkillId = isPublishedPunctuationSkillId(raw.detailOpenSkillId)
    ? raw.detailOpenSkillId
    : null;
  const rawDetailTab = typeof raw.detailTab === 'string' ? raw.detailTab : 'learn';
  const detailTab = PUNCTUATION_MAP_DETAIL_TABS.has(rawDetailTab) ? rawDetailTab : 'learn';
  const rawReturnTo = typeof raw.returnTo === 'string' ? raw.returnTo : 'setup';
  const returnTo = PUNCTUATION_MAP_RETURN_PHASES.includes(rawReturnTo) ? rawReturnTo : 'setup';
  return { statusFilter, monsterFilter, detailOpenSkillId, detailTab, returnTo };
}

// U5 + SH2-U2: Rehydrate-time sanitiser for `subjectUi.punctuation`. Called
// exactly once when the store boots over a persisted `subjectStates`
// snapshot. Two concerns compose here:
//
//   1. (U5, R5 line 565 / line 583) The Map phase and its `mapUi` filter
//      state are session-ephemeral by plan, so a snapshot that carries
//      `phase === 'map'` is coerced back to `'setup'` and `mapUi` is
//      stripped so the Map reopens from defaults.
//
//   2. (SH2-U2, R2) The round-completion transient state — `summary`,
//      `transientUi` — must not survive a reload. The Summary scene's
//      "Start another round" CTA fires a fresh `start-session` reusing
//      the prior round's mode; a zombie summary after reload would
//      silently re-enter a round the learner thought they had finished.
//      Active-session state (`session`, `feedback`, `awaitingAdvance`,
//      `pendingCommand`) is INTENTIONALLY preserved so mid-round /
//      mid-feedback reload resumes the learner's active round. The
//      baseline drop set lives on `SESSION_EPHEMERAL_FIELDS` in
//      `platform/core/subject-contract.js` so every subject drops the
//      same fields.
//
// This sanitiser runs only on rehydrate — live `updateSubjectUi` dispatches
// (which build state from the current in-memory entry) bypass it, so the
// Map phase + summary / feedback / awaitingAdvance fields remain
// legitimate while a session is active in memory.
export function sanitisePunctuationUiOnRehydrate(entry) {
  if (!isPlainObject(entry)) return entry;
  const next = { ...entry };
  // SH2-U2 baseline: drop the post-session-ephemeral fields shared across
  // all subjects (summary, transientUi). `session`, `feedback`,
  // `awaitingAdvance`, `pendingCommand` are intentionally NOT dropped —
  // see the comment above. Inlined rather than importing
  // `dropSessionEphemeralFields` to keep service-contract.js free of
  // platform-layer imports (it runs on both client + Worker contexts).
  if ('summary' in next) delete next.summary;
  if ('transientUi' in next) delete next.transientUi;
  // U5 subject-specific: coerce Map phase + strip mapUi.
  if (next.phase === 'map') next.phase = 'setup';
  if ('mapUi' in next) delete next.mapUi;
  return next;
}

export function createInitialPunctuationState() {
  return {
    version: PUNCTUATION_SERVICE_STATE_VERSION,
    phase: 'setup',
    session: null,
    feedback: null,
    summary: null,
    error: '',
    availability: {
      status: 'ready',
      code: null,
      message: '',
    },
  };
}

export function normalisePunctuationFeedback(value) {
  if (!isPlainObject(value)) return null;
  return {
    kind: value.kind === 'success' || value.kind === 'error' || value.kind === 'warn' ? value.kind : 'info',
    headline: normaliseString(value.headline),
    body: normaliseString(value.body),
    attemptedAnswer: normaliseString(value.attemptedAnswer).trim().slice(0, 500),
    displayCorrection: normaliseString(value.displayCorrection),
    explanation: normaliseString(value.explanation),
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    facets: Array.isArray(value.facets)
      ? value.facets
          .filter(isPlainObject)
          .map((facet) => ({
            id: normaliseString(facet.id),
            ok: normaliseBoolean(facet.ok),
            label: normaliseString(facet.label),
          }))
          .filter((facet) => facet.id)
      : [],
  };
}

function normalisePunctuationFacet(value) {
  if (!isPlainObject(value)) return null;
  const id = normaliseString(value.id);
  if (!id) return null;
  return {
    id,
    ok: normaliseBoolean(value.ok),
    label: normaliseString(value.label),
  };
}

function normaliseGpsReviewItem(value, index) {
  if (!isPlainObject(value)) return null;
  return {
    index: normaliseNonNegativeInteger(value.index, index + 1),
    itemId: normaliseString(value.itemId),
    mode: normaliseString(value.mode),
    skillIds: normaliseStringArray(value.skillIds),
    prompt: normaliseString(value.prompt),
    stem: normaliseString(value.stem),
    attemptedAnswer: normaliseString(value.attemptedAnswer).trim().slice(0, 500),
    displayCorrection: normaliseString(value.displayCorrection),
    explanation: normaliseString(value.explanation),
    correct: normaliseBoolean(value.correct),
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    facets: Array.isArray(value.facets)
      ? value.facets.map(normalisePunctuationFacet).filter(Boolean)
      : [],
  };
}

function normaliseGpsSummary(value) {
  if (!isPlainObject(value)) return null;
  return {
    delayedFeedback: normaliseBoolean(value.delayedFeedback, true),
    recommendedMode: normalisePunctuationMode(value.recommendedMode, 'smart'),
    recommendedLabel: normaliseString(value.recommendedLabel, 'Smart review'),
    reviewItems: Array.isArray(value.reviewItems)
      ? value.reviewItems.map(normaliseGpsReviewItem).filter(Boolean)
      : [],
  };
}

export function normalisePunctuationSummary(value) {
  if (!isPlainObject(value)) return null;
  const total = normaliseNonNegativeInteger(value.total, 0);
  const correct = Math.min(total, normaliseNonNegativeInteger(value.correct, 0));
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  return {
    label: normaliseString(value.label, 'Punctuation session summary'),
    message: normaliseString(value.message, 'Session complete.'),
    total,
    correct,
    accuracy: typeof value.accuracy === 'number' ? value.accuracy : accuracy,
    sessionId: normaliseOptionalString(value.sessionId),
    completedAt: normaliseTimestamp(value.completedAt, 0),
    focus: normaliseStringArray(value.focus),
    securedUnits: normaliseStringArray(value.securedUnits),
    misconceptionTags: normaliseStringArray(value.misconceptionTags),
    gps: normaliseGpsSummary(value.gps),
  };
}
