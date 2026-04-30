// Resolve Hero flag overrides for internal and external cohort accounts.
// Pure function — no side effects, no DB access.
//
// Precedence: internal > external > global > none.
// When HERO_INTERNAL_ACCOUNTS or HERO_EXTERNAL_ACCOUNTS (JSON secrets) list
// an accountId, all 6 Hero flags are force-enabled. Internal takes precedence
// if an account appears in both lists. Additive-only: non-listed accounts are
// unchanged.

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
 * Primary resolver — returns resolved env AND classified override status.
 *
 * @param {Object} params
 * @param {Object} params.env — Worker environment bindings
 * @param {string} params.accountId — caller account ID
 * @returns {{ resolvedEnv: Object, overrideStatus: 'internal'|'external'|'global'|'none' }}
 */
export function resolveHeroFlagsForAccount({ env, accountId }) {
  const safeEnv = env || {};

  // Early exit — no accountId means we cannot match any list
  if (!accountId) {
    return { resolvedEnv: safeEnv, overrideStatus: _detectGlobalStatus(safeEnv) };
  }

  // Parse internal list
  const internalList = parseAccountList(safeEnv.HERO_INTERNAL_ACCOUNTS);

  // Check internal membership (highest precedence)
  if (internalList && internalList.includes(accountId)) {
    return { resolvedEnv: _applyAllFlags(safeEnv), overrideStatus: 'internal' };
  }

  // Parse external list
  const externalList = parseAccountList(safeEnv.HERO_EXTERNAL_ACCOUNTS);

  // Check external membership
  if (externalList && externalList.includes(accountId)) {
    return { resolvedEnv: _applyAllFlags(safeEnv), overrideStatus: 'external' };
  }

  // Not in any list — classify as global or none
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
 * @returns {'global'|'none'}
 */
function _detectGlobalStatus(env) {
  for (const key of HERO_FLAG_KEYS) {
    if (env[key] === 'true') return 'global';
  }
  return 'none';
}

export { HERO_FLAG_KEYS };
