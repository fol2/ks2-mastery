// ── Hero Readiness — pure derivation module ─────────────────────────
// Zero side-effects. No DB access. No imports from react or node: built-ins.
// Derives readiness checks from hero state and feature flags for admin/ops.

/**
 * Derive readiness checklist from hero state and feature flag configuration.
 *
 * Pure function — inspects state only, no writes.
 *
 * @param {Object|null} heroState — normalised hero progress state (or null)
 * @param {Object}      flags     — feature flag map (env-style keys to truthy values)
 * @returns {{ checks: Array<{ name: string, status: 'pass'|'fail'|'not_started', detail: string }>, overall: 'ready'|'not_ready'|'not_started' }}
 */
export function deriveReadinessChecks(heroState, flags) {
  const safeFlags = flags && typeof flags === 'object' ? flags : {};
  const safeState = heroState && typeof heroState === 'object' ? heroState : null;

  // If no state exists at all, the hero system has not started
  if (safeState === null) {
    return {
      checks: [
        { name: 'flagsConfigured', status: 'not_started', detail: 'No hero state exists.' },
        { name: 'economyHealthy', status: 'not_started', detail: 'No hero state exists.' },
        { name: 'campHealthy', status: 'not_started', detail: 'No hero state exists.' },
        { name: 'stateValid', status: 'not_started', detail: 'No hero state exists.' },
        { name: 'noCorruptState', status: 'not_started', detail: 'No hero state exists.' },
      ],
      overall: 'not_started',
    };
  }

  const checks = [];

  // 1. flagsConfigured — all required flags present and truthy
  const requiredFlags = [
    'HERO_MODE_SHADOW_ENABLED',
    'HERO_MODE_LAUNCH_ENABLED',
    'HERO_MODE_CHILD_UI_ENABLED',
    'HERO_MODE_PROGRESS_ENABLED',
    'HERO_MODE_ECONOMY_ENABLED',
    'HERO_MODE_CAMP_ENABLED',
  ];
  const missingFlags = requiredFlags.filter(f => !isFlagEnabled(safeFlags[f]));
  checks.push({
    name: 'flagsConfigured',
    status: missingFlags.length === 0 ? 'pass' : 'fail',
    detail: missingFlags.length === 0
      ? 'All 6 hero flags enabled.'
      : `Missing flags: ${missingFlags.join(', ')}`,
  });

  // 2. economyHealthy — balance is a non-negative finite number
  const economy = safeState.economy;
  const balanceValid = economy
    && typeof economy === 'object'
    && typeof economy.balance === 'number'
    && Number.isFinite(economy.balance)
    && economy.balance >= 0;
  checks.push({
    name: 'economyHealthy',
    status: balanceValid ? 'pass' : 'fail',
    detail: balanceValid
      ? `Balance: ${economy.balance}`
      : 'Economy state missing or balance invalid.',
  });

  // 3. campHealthy — heroPool exists with valid structure
  const heroPool = safeState.heroPool;
  const campValid = heroPool
    && typeof heroPool === 'object'
    && typeof heroPool.monsters === 'object'
    && heroPool.monsters !== null;
  checks.push({
    name: 'campHealthy',
    status: campValid ? 'pass' : 'fail',
    detail: campValid
      ? `Monster count: ${Object.keys(heroPool.monsters).length}`
      : 'Hero pool state missing or malformed.',
  });

  // 4. stateValid — top-level structure is present and has version
  const stateValid = typeof safeState.version === 'number' && safeState.version >= 1;
  checks.push({
    name: 'stateValid',
    status: stateValid ? 'pass' : 'fail',
    detail: stateValid
      ? `State version: ${safeState.version}`
      : 'State missing or invalid version.',
  });

  // 5. noCorruptState — no obvious corruption markers
  const corruptMarkers = [];
  if (economy && typeof economy.balance === 'number' && economy.balance < 0) {
    corruptMarkers.push('negative-balance');
  }
  if (economy && Array.isArray(economy.ledger)) {
    const hasNullEntry = economy.ledger.some(e => e === null || e === undefined);
    if (hasNullEntry) corruptMarkers.push('null-ledger-entry');
  }
  if (heroPool && typeof heroPool === 'object' && heroPool.monsters) {
    for (const [id, m] of Object.entries(heroPool.monsters)) {
      if (!m || typeof m !== 'object') {
        corruptMarkers.push(`corrupt-monster:${id}`);
      }
    }
  }
  checks.push({
    name: 'noCorruptState',
    status: corruptMarkers.length === 0 ? 'pass' : 'fail',
    detail: corruptMarkers.length === 0
      ? 'No corruption detected.'
      : `Corruption markers: ${corruptMarkers.join(', ')}`,
  });

  // Overall: 'ready' if all pass, 'not_ready' if any fail
  const allPass = checks.every(c => c.status === 'pass');
  return {
    checks,
    overall: allPass ? 'ready' : 'not_ready',
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function isFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}
