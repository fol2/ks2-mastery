const POOL_VISIBILITY_STATE_ALIASES = Object.freeze({
  rolloutFlagged: 'rollout-flagged',
  rolloutflagged: 'rollout-flagged',
  rollout_flagged: 'rollout-flagged',
  rollout: 'rollout-flagged',
  flagged: 'rollout-flagged',
});

export const SPELLING_POOL_VISIBILITY_STATES = Object.freeze([
  'visible',
  'hidden',
  'scheduled',
  'rollout-flagged',
]);

const VALID_POOL_VISIBILITY_STATES = new Set(SPELLING_POOL_VISIBILITY_STATES);
const LEARNER_ACTIVATABLE_POOL_VISIBILITY_STATES = new Set(['visible', 'scheduled', 'rollout-flagged']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() || fallback : fallback;
}

function normaliseTimestamp(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function poolVisibilityEnvFlagEnabled(env, flagName) {
  const name = normaliseString(flagName);
  if (!name) return false;
  const value = isPlainObject(env) ? env[name] : undefined;
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalisePoolVisibilityState(value, fallback = 'hidden', context = {}) {
  const raw = normaliseString(value, fallback);
  const lookup = raw.toLowerCase();
  if (lookup === 'staged') {
    const scheduledAt = normaliseTimestamp(context?.scheduledAt, 0);
    const rolloutFlag = normaliseString(context?.rolloutFlag);
    return !scheduledAt && rolloutFlag ? 'rollout-flagged' : 'scheduled';
  }
  const aliased = POOL_VISIBILITY_STATE_ALIASES[raw] || POOL_VISIBILITY_STATE_ALIASES[lookup] || lookup;
  return VALID_POOL_VISIBILITY_STATES.has(aliased) ? aliased : fallback;
}

export function isKnownSpellingPoolVisibilityState(value) {
  const raw = normaliseString(value);
  const lookup = raw.toLowerCase();
  return lookup === 'staged' || VALID_POOL_VISIBILITY_STATES.has(
    POOL_VISIBILITY_STATE_ALIASES[raw] || POOL_VISIBILITY_STATE_ALIASES[lookup] || lookup,
  );
}

export function normalisePoolVisibility(rawValue = null, fallback = null) {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const safeFallback = isPlainObject(fallback) ? fallback : {};
  const rawState = normaliseString(raw.state).toLowerCase();
  const fallbackState = normaliseString(safeFallback.state).toLowerCase();
  const state = normalisePoolVisibilityState(
    rawState || fallbackState,
    'hidden',
    rawState ? raw : safeFallback,
  );
  return {
    state,
    learnerVisible: state === 'visible',
    scheduledAt: normaliseTimestamp(raw.scheduledAt ?? safeFallback.scheduledAt, 0),
    rolloutFlag: normaliseString(raw.rolloutFlag, safeFallback.rolloutFlag || ''),
  };
}

export function isSpellingPoolPotentiallyLearnerVisible(visibility = null) {
  const safe = normalisePoolVisibility(visibility);
  return LEARNER_ACTIVATABLE_POOL_VISIBILITY_STATES.has(safe.state);
}

export function isSpellingPoolLearnerVisible(visibility = null, {
  now = Date.now(),
  env = {},
} = {}) {
  const safe = normalisePoolVisibility(visibility);
  if (safe.state === 'hidden') return false;
  if (safe.state === 'visible') return true;
  if (safe.state === 'scheduled') {
    return safe.scheduledAt > 0 && safe.scheduledAt <= normaliseTimestamp(now, Date.now());
  }
  if (safe.state === 'rollout-flagged') {
    return poolVisibilityEnvFlagEnabled(env, safe.rolloutFlag);
  }
  return false;
}
