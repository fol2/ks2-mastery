// Resolve Hero flag overrides for internal team accounts.
// Pure function — no side effects, no DB access.
//
// When HERO_INTERNAL_ACCOUNTS (JSON secret) lists an accountId, all 6 Hero
// flags are force-enabled. Additive-only: non-listed accounts are unchanged.

const HERO_FLAG_KEYS = Object.freeze([
  'HERO_MODE_SHADOW_ENABLED',
  'HERO_MODE_LAUNCH_ENABLED',
  'HERO_MODE_CHILD_UI_ENABLED',
  'HERO_MODE_PROGRESS_ENABLED',
  'HERO_MODE_ECONOMY_ENABLED',
  'HERO_MODE_CAMP_ENABLED',
]);

/**
 * Resolve Hero flag overrides for internal team accounts.
 *
 * @param {Object} params
 * @param {Object} params.env — Worker environment bindings
 * @param {string} params.accountId — caller account ID
 * @returns {Object} env-like object with Hero flags force-enabled for listed accounts
 */
export function resolveHeroFlagsWithOverride({ env, accountId }) {
  const safeEnv = env || {};

  // Parse the secret — must be a valid JSON array of strings
  const raw = safeEnv.HERO_INTERNAL_ACCOUNTS;
  if (raw == null || raw === '') return safeEnv;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return safeEnv;
  }

  if (!Array.isArray(parsed)) return safeEnv;

  // Check membership — only override for listed accounts
  if (!accountId || !parsed.includes(accountId)) return safeEnv;

  // Force all 6 Hero flags on (additive — preserves all other bindings)
  const overrides = {};
  for (const key of HERO_FLAG_KEYS) {
    overrides[key] = 'true';
  }

  return { ...safeEnv, ...overrides };
}

export { HERO_FLAG_KEYS };
