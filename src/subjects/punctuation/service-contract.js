import {
  PUNCTUATION_MAP_MONSTER_FILTER_IDS,
  PUNCTUATION_MAP_STATUS_FILTER_IDS,
} from './components/punctuation-view-model.js';

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
// only, never persisted. Validated against the view-model's frozen filter
// lists so a rogue payload cannot smuggle a reserved monster id into the
// Map's monster filter. Invalid inputs fall back to the defaults listed
// below — never throws.
//
// Defaults when the Map phase first opens:
//   { statusFilter: 'all', monsterFilter: 'all', detailOpenSkillId: null,
//     detailTab: 'learn' }
//
// `detailOpenSkillId` is either a non-empty string (the currently-open skill
// detail in U6's modal) or `null`. `detailTab` is either `'learn'` or
// `'practise'`; invalid input falls back to `'learn'`.
const PUNCTUATION_MAP_DETAIL_TABS = Object.freeze(new Set(['learn', 'practise']));

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
  const detailOpenSkillId = typeof raw.detailOpenSkillId === 'string' && raw.detailOpenSkillId
    ? raw.detailOpenSkillId
    : null;
  const rawDetailTab = typeof raw.detailTab === 'string' ? raw.detailTab : 'learn';
  const detailTab = PUNCTUATION_MAP_DETAIL_TABS.has(rawDetailTab) ? rawDetailTab : 'learn';
  return { statusFilter, monsterFilter, detailOpenSkillId, detailTab };
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
