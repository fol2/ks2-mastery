// Hero Mode pA2 U5 — Internal Override Surface Verification.
//
// Comprehensive coverage for per-account override mechanism under A2 cohort:
// 1. Happy paths (listed account, env preservation)
// 2. Edge cases (empty list, missing secret, malformed, non-array, duplicates, null accountId)
// 3. Security regression (additive-only, HERO_FLAG_KEYS frozen set)
// 4. Read-model route integration for listed internal account

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveHeroFlagsWithOverride, HERO_FLAG_KEYS } from '../shared/hero/account-override.js';

// ── Helpers ──────────────────────────────────────────────────────────

const INTERNAL_ACCOUNT = 'acc-internal-alpha';
const PUBLIC_ACCOUNT = 'acc-public-888';

function baseEnv(overrides = {}) {
  return {
    HERO_MODE_SHADOW_ENABLED: 'false',
    HERO_MODE_LAUNCH_ENABLED: 'false',
    HERO_MODE_CHILD_UI_ENABLED: 'false',
    HERO_MODE_PROGRESS_ENABLED: 'false',
    HERO_MODE_ECONOMY_ENABLED: 'false',
    HERO_MODE_CAMP_ENABLED: 'false',
    APP_NAME: 'KS2 Mastery',
    DB: 'mock-db-binding',
    WORKER_ENV: 'production',
    ...overrides,
  };
}

function envWithInternalList(accounts = [INTERNAL_ACCOUNT]) {
  return baseEnv({ HERO_INTERNAL_ACCOUNTS: JSON.stringify(accounts) });
}

// ── 1. Happy path: listed account gets all 6 flags force-enabled ─────

test('pA2-U5 #1: listed account with global-OFF receives all 6 flags force-enabled', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'true', `${key} must be 'true' for listed internal account`);
  }
  // Confirm exactly 6 flags were overridden
  const enabledFlags = HERO_FLAG_KEYS.filter((k) => result[k] === 'true');
  assert.equal(enabledFlags.length, 6, 'all 6 Hero flags must be enabled');
});

// ── 2. Happy path: preserves all non-Hero env vars ───────────────────

test('pA2-U5 #2: resolveHeroFlagsWithOverride preserves all non-Hero env vars', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  assert.equal(result.APP_NAME, 'KS2 Mastery', 'APP_NAME preserved');
  assert.equal(result.DB, 'mock-db-binding', 'DB binding preserved');
  assert.equal(result.WORKER_ENV, 'production', 'WORKER_ENV preserved');
  assert.equal(
    result.HERO_INTERNAL_ACCOUNTS,
    JSON.stringify([INTERNAL_ACCOUNT]),
    'HERO_INTERNAL_ACCOUNTS secret preserved'
  );
});

// ── 3. Edge case: non-listed account gets no override ────────────────

test('pA2-U5 #3: non-listed account with global-OFF receives NO Hero flag overrides', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: PUBLIC_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false', `${key} must remain 'false' for non-listed account`);
  }
  // Result should be the original env (referential identity — same object)
  assert.equal(result, env, 'non-listed account returns env unchanged (same reference)');
});

// ── 4. Edge case: empty HERO_INTERNAL_ACCOUNTS array ─────────────────

test('pA2-U5 #4: empty HERO_INTERNAL_ACCOUNTS (\'[]\') → no override applied', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '[]' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false', `${key} must remain 'false' with empty accounts list`);
  }
});

// ── 5. Edge case: missing HERO_INTERNAL_ACCOUNTS ─────────────────────

test('pA2-U5 #5a: HERO_INTERNAL_ACCOUNTS is undefined → graceful fallback, no override', () => {
  const env = baseEnv(); // no HERO_INTERNAL_ACCOUNTS key
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
  assert.equal(result, env, 'returns env unchanged');
});

test('pA2-U5 #5b: HERO_INTERNAL_ACCOUNTS is null → graceful fallback, no override', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: null });
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('pA2-U5 #5c: HERO_INTERNAL_ACCOUNTS is empty string → graceful fallback, no override', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
  assert.equal(result, env, 'returns env unchanged');
});

// ── 6. Edge case: malformed JSON ─────────────────────────────────────

test('pA2-U5 #6: malformed JSON string → graceful fallback, no crash', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: 'not json' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false', `${key} must remain 'false' with malformed JSON`);
  }
  assert.equal(result, env, 'returns env unchanged on parse failure');
});

// ── 7. Edge case: HERO_INTERNAL_ACCOUNTS is not an array ─────────────

test('pA2-U5 #7: HERO_INTERNAL_ACCOUNTS is valid JSON but not array (e.g. \'{}\') → graceful fallback', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '{}' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
  assert.equal(result, env, 'returns env unchanged for non-array JSON');
});

// ── 8. Edge case: account listed twice ───────────────────────────────

test('pA2-U5 #8: account listed twice in array → still works, no double-enable side-effect', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT, INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'true', `${key} must be 'true' even with duplicate listing`);
  }
  // Verify result is a plain object with expected keys (no weird side effects)
  const heroKeys = Object.keys(result).filter((k) => k.startsWith('HERO_MODE_'));
  // 6 flag keys + HERO_INTERNAL_ACCOUNTS (not a mode flag)
  assert.equal(heroKeys.length, 6, 'exactly 6 HERO_MODE_ keys present');
});

// ── 9. Edge case: accountId is null or undefined ─────────────────────

test('pA2-U5 #9a: accountId is null → no crash, no override', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: null });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
  assert.equal(result, env, 'returns env unchanged for null accountId');
});

test('pA2-U5 #9b: accountId is undefined → no crash, no override', () => {
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: undefined });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
  assert.equal(result, env, 'returns env unchanged for undefined accountId');
});

// ── 10. Security regression: additive-only ───────────────────────────

test('pA2-U5 #10: override is additive-only — cannot REMOVE existing flags', () => {
  // Scenario: env already has some Hero flags set to 'true' (global-ON partial rollout)
  const env = baseEnv({
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'false',
    HERO_MODE_PROGRESS_ENABLED: 'false',
    HERO_MODE_ECONOMY_ENABLED: 'false',
    HERO_MODE_CAMP_ENABLED: 'false',
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([INTERNAL_ACCOUNT]),
  });

  const result = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  // All 6 must be 'true' after override — none were downgraded
  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'true', `${key} must be 'true' — override never downgrades`);
  }

  // Specifically: the ones that were already 'true' remain 'true'
  assert.equal(result.HERO_MODE_SHADOW_ENABLED, 'true');
  assert.equal(result.HERO_MODE_LAUNCH_ENABLED, 'true');
});

test('pA2-U5 #10b: for non-listed account, existing enabled flags are preserved (not stripped)', () => {
  const env = baseEnv({
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([INTERNAL_ACCOUNT]),
  });

  const result = resolveHeroFlagsWithOverride({ env, accountId: PUBLIC_ACCOUNT });

  // Non-listed: env is returned unchanged, existing 'true' values preserved
  assert.equal(result.HERO_MODE_SHADOW_ENABLED, 'true', 'existing flag not stripped');
  assert.equal(result.HERO_MODE_LAUNCH_ENABLED, 'true', 'existing flag not stripped');
  assert.equal(result, env, 'non-listed account returns original env reference');
});

// ── 11. Security regression: HERO_FLAG_KEYS contains exactly 6 known names ──

test('pA2-U5 #11: HERO_FLAG_KEYS export contains exactly 6 known flag names', () => {
  const expectedFlags = [
    'HERO_MODE_SHADOW_ENABLED',
    'HERO_MODE_LAUNCH_ENABLED',
    'HERO_MODE_CHILD_UI_ENABLED',
    'HERO_MODE_PROGRESS_ENABLED',
    'HERO_MODE_ECONOMY_ENABLED',
    'HERO_MODE_CAMP_ENABLED',
  ];

  assert.equal(HERO_FLAG_KEYS.length, 6, 'exactly 6 flag keys');
  assert.deepEqual([...HERO_FLAG_KEYS].sort(), [...expectedFlags].sort(), 'flag names match expected set');
  assert.ok(Object.isFrozen(HERO_FLAG_KEYS), 'HERO_FLAG_KEYS must be frozen (immutable)');
});

// ── 12. Integration: listed internal account accessing read-model route ──

test('pA2-U5 #12: listed internal account at resolveHeroFlagsWithOverride level enables read-model access', () => {
  // Simulates the scenario: internal account hits /api/hero/read-model route.
  // The route handler calls resolveHeroFlagsWithOverride first, then uses the
  // resolved env to gate access. This test verifies the override step produces
  // an env that would pass all gate checks.
  const env = envWithInternalList([INTERNAL_ACCOUNT]);
  const resolved = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });

  // Gate checks performed by the read-model route handler
  const shadowGate = resolved.HERO_MODE_SHADOW_ENABLED === 'true';
  const launchGate = resolved.HERO_MODE_LAUNCH_ENABLED === 'true';
  const childUiGate = resolved.HERO_MODE_CHILD_UI_ENABLED === 'true';
  const progressGate = resolved.HERO_MODE_PROGRESS_ENABLED === 'true';

  assert.equal(shadowGate, true, 'shadow gate passes for override account');
  assert.equal(launchGate, true, 'launch gate passes for override account');
  assert.equal(childUiGate, true, 'child-ui gate passes for override account');
  assert.equal(progressGate, true, 'progress gate passes for override account');

  // Economy + Camp gates (claim-task and camp commands)
  assert.equal(resolved.HERO_MODE_ECONOMY_ENABLED, 'true', 'economy gate passes');
  assert.equal(resolved.HERO_MODE_CAMP_ENABLED, 'true', 'camp gate passes');
});
