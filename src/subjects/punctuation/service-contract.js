export const PUNCTUATION_SERVICE_STATE_VERSION = 1;

export const PUNCTUATION_PHASES = Object.freeze([
  'setup',
  'active-item',
  'feedback',
  'summary',
  'unavailable',
  'error',
]);

export const PUNCTUATION_MODES = Object.freeze([
  'smart',
  'endmarks',
  'apostrophe',
  'speech',
  'comma_flow',
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
  };
}
