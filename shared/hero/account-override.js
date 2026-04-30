// Resolve Hero flag overrides with 7-way classification.
// Pure function — no side effects, no DB access.
//
// Precedence (highest first):
//   1. emergency-off  — HERO_EMERGENCY_DISABLED === 'true'
//   2. excluded       — accountId in HERO_EXCLUDED_ACCOUNTS
//   3. internal       — accountId in HERO_INTERNAL_ACCOUNTS
//   4. external       — accountId in HERO_EXTERNAL_ACCOUNTS
//   5. rollout-bucket — hash(accountId:salt) < HERO_ROLLOUT_PERCENT
//   6. global-default — any HERO_MODE_*_ENABLED flag is 'true'
//   7. none           — no override
//
// Emergency-off and excluded return env UNCHANGED (Hero disabled for them).
// Internal, external, and rollout-bucket force all 6 Hero flags on.
// Fail closed on all malformed input.

const HERO_FLAG_KEYS = Object.freeze([
  'HERO_MODE_SHADOW_ENABLED',
  'HERO_MODE_LAUNCH_ENABLED',
  'HERO_MODE_CHILD_UI_ENABLED',
  'HERO_MODE_PROGRESS_ENABLED',
  'HERO_MODE_ECONOMY_ENABLED',
  'HERO_MODE_CAMP_ENABLED',
]);

/**
 * Safely parse a JSON account list from env. Returns null on failure (fail closed).
 * @param {string|null|undefined} raw
 * @returns {string[]|null}
 */
function parseAccountList(raw) {
  if (raw == null || raw === '') return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed;
}

/**
 * Deterministic hash of an input string to a bucket 0–99.
 * Stable: same input = same output forever (no randomness, no crypto).
 * Exported as _hashAccountToBucket for testing.
 *
 * @param {string} input
 * @returns {number} integer 0–99
 */
export function _hashAccountToBucket(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0) % 100;
}

/**
 * Primary resolver — returns resolved env AND classified override status.
 *
 * @param {Object} params
 * @param {Object} params.env — Worker environment bindings
 * @param {string} params.accountId — caller account ID
 * @returns {{ resolvedEnv: Object, overrideStatus: 'emergency-off'|'excluded'|'internal'|'external'|'rollout-bucket'|'global-default'|'none' }}
 */
export function resolveHeroFlagsForAccount({ env, accountId }) {
  const safeEnv = env || {};

  // 1. Emergency kill switch — highest precedence
  if (safeEnv.HERO_EMERGENCY_DISABLED === 'true') {
    return { resolvedEnv: safeEnv, overrideStatus: 'emergency-off' };
  }

  // Early exit — no accountId means we cannot match any list
  if (!accountId) {
    return { resolvedEnv: safeEnv, overrideStatus: _detectGlobalStatus(safeEnv) };
  }

  // 2. Excluded accounts — opt-out override
  const excludedList = parseAccountList(safeEnv.HERO_EXCLUDED_ACCOUNTS);
  if (excludedList && excludedList.includes(accountId)) {
    return { resolvedEnv: safeEnv, overrideStatus: 'excluded' };
  }

  // 3. Internal cohort
  const internalList = parseAccountList(safeEnv.HERO_INTERNAL_ACCOUNTS);
  if (internalList && internalList.includes(accountId)) {
    return { resolvedEnv: _applyAllFlags(safeEnv), overrideStatus: 'internal' };
  }

  // 4. External cohort
  const externalList = parseAccountList(safeEnv.HERO_EXTERNAL_ACCOUNTS);
  if (externalList && externalList.includes(accountId)) {
    return { resolvedEnv: _applyAllFlags(safeEnv), overrideStatus: 'external' };
  }

  // 5. Deterministic rollout bucket
  const salt = safeEnv.HERO_ROLLOUT_SALT;
  if (salt && salt !== '') {
    const percent = _parseRolloutPercent(safeEnv.HERO_ROLLOUT_PERCENT);
    if (percent > 0) {
      const bucket = _hashAccountToBucket(accountId + ':' + salt);
      if (bucket < percent) {
        return { resolvedEnv: _applyAllFlags(safeEnv), overrideStatus: 'rollout-bucket' };
      }
    }
  }

  // 6/7. Global-default or none
  return { resolvedEnv: safeEnv, overrideStatus: _detectGlobalStatus(safeEnv) };
}

/**
 * Backward-compatible wrapper — returns only the resolved env object.
 *
 * @param {Object} params
 * @param {Object} params.env — Worker environment bindings
 * @param {string} params.accountId — caller account ID
 * @returns {Object} env-like object with Hero flags force-enabled for listed accounts
 */
export function resolveHeroFlagsWithOverride({ env, accountId }) {
  return resolveHeroFlagsForAccount({ env, accountId }).resolvedEnv;
}

/**
 * Force all 6 Hero flags on (additive — preserves all other bindings).
 * @param {Object} env
 * @returns {Object}
 */
function _applyAllFlags(env) {
  const overrides = {};
  for (const key of HERO_FLAG_KEYS) {
    overrides[key] = 'true';
  }
  return { ...env, ...overrides };
}

/**
 * Detect whether any global Hero flag is already enabled in env.
 * @param {Object} env
 * @returns {'global-default'|'none'}
 */
function _detectGlobalStatus(env) {
  for (const key of HERO_FLAG_KEYS) {
    if (env[key] === 'true') return 'global-default';
  }
  return 'none';
}

/**
 * Parse HERO_ROLLOUT_PERCENT to a safe integer 0–100.
 * Returns 0 (fail closed) on NaN, negative, or >100.
 * @param {string|null|undefined} raw
 * @returns {number}
 */
function _parseRolloutPercent(raw) {
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0 || n > 100) return 0;
  return n;
}

export { HERO_FLAG_KEYS };
