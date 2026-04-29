// Hero Mode pA1 U8 — Per-Account Flag Override.
//
// Verifies:
// 1. Listed accounts get all 6 Hero flags force-enabled
// 2. Non-listed accounts see original env unchanged
// 3. Graceful handling of missing/empty/malformed HERO_INTERNAL_ACCOUNTS
// 4. Additive-only: non-Hero env vars preserved
// 5. Integration: buildHeroShadowReadModel produces enabled UI for override accounts

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveHeroFlagsWithOverride, HERO_FLAG_KEYS } from '../shared/hero/account-override.js';
import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';

// ── Helpers ──────────────────────────────────────────────────────────

const TEAM_ACCOUNT = 'acc-team-001';
const OTHER_ACCOUNT = 'acc-public-999';

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
    ...overrides,
  };
}

function envWithTeamList(accounts = [TEAM_ACCOUNT]) {
  return baseEnv({ HERO_INTERNAL_ACCOUNTS: JSON.stringify(accounts) });
}

// ── Unit: resolveHeroFlagsWithOverride ──────────────────────────────

test('account in list → all 6 flags resolved as enabled', () => {
  const env = envWithTeamList([TEAM_ACCOUNT, 'acc-other']);
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'true', `${key} must be 'true' for listed account`);
  }
});

test('account NOT in list → flags from env unchanged (all false)', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: OTHER_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false', `${key} must remain 'false' for non-listed account`);
  }
});

test('HERO_INTERNAL_ACCOUNTS is empty string → no override', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('HERO_INTERNAL_ACCOUNTS is missing/undefined → no override', () => {
  const env = baseEnv();
  // No HERO_INTERNAL_ACCOUNTS key at all
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('HERO_INTERNAL_ACCOUNTS is malformed JSON → no override (graceful)', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '{not valid json[' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('HERO_INTERNAL_ACCOUNTS is valid JSON but not an array → no override', () => {
  const env = baseEnv({ HERO_INTERNAL_ACCOUNTS: '{"id": "acc-team-001"}' });
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('override is additive-only: non-Hero env vars are preserved unchanged', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  assert.equal(result.APP_NAME, 'KS2 Mastery');
  assert.equal(result.DB, 'mock-db-binding');
  assert.equal(result.HERO_INTERNAL_ACCOUNTS, JSON.stringify([TEAM_ACCOUNT]));
});

test('env is null → returns empty object without throwing', () => {
  const result = resolveHeroFlagsWithOverride({ env: null, accountId: TEAM_ACCOUNT });
  assert.deepEqual(result, {});
});

test('accountId is empty string → no override applied', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: '' });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

test('accountId is undefined → no override applied', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const result = resolveHeroFlagsWithOverride({ env, accountId: undefined });

  for (const key of HERO_FLAG_KEYS) {
    assert.equal(result[key], 'false');
  }
});

// ── Integration: buildHeroShadowReadModel with override ─────────────

test('integration: buildHeroShadowReadModel with override produces enabled UI for listed account', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);

  // Minimal subject read models for eligibility (spelling provider needs data)
  const subjectReadModels = {
    spelling: {
      data: {
        megaStatus: 'not-started',
        units: [
          { id: 'unit-1', status: 'mastered', score: 100, starCount: 3 },
          { id: 'unit-2', status: 'in-progress', score: 60, starCount: 1 },
        ],
      },
      ui: {},
    },
  };

  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-1',
    accountId: TEAM_ACCOUNT,
    subjectReadModels,
    now: Date.now(),
    env,
  });

  // Override forces all flags on → ui.enabled should be true (assuming launchable tasks)
  assert.equal(result.childVisible, true, 'childVisible must be true for overridden account');

  // The ui.reason tells us what happened — if no launchable tasks it could be
  // 'no-launchable-tasks', but the shadow/launch/childUi gates must pass
  assert.notEqual(result.ui.reason, 'shadow-disabled');
  assert.notEqual(result.ui.reason, 'launch-disabled');
  assert.notEqual(result.ui.reason, 'child-ui-disabled');
});

// ── Command route pre-gate simulation ─────────────────────────────────

test('command pre-gate: override account passes launch+shadow gate when global flags are off', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const resolved = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  // Simulate the pre-gate checks from /api/hero/command
  const launchEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(resolved.HERO_MODE_LAUNCH_ENABLED || '').trim().toLowerCase()
  );
  const shadowEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(resolved.HERO_MODE_SHADOW_ENABLED || '').trim().toLowerCase()
  );

  assert.equal(launchEnabled, true, 'launch gate must pass for override account');
  assert.equal(shadowEnabled, true, 'shadow gate must pass for override account');
});

test('command pre-gate: non-override account is blocked by launch gate when global flags are off', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const resolved = resolveHeroFlagsWithOverride({ env, accountId: OTHER_ACCOUNT });

  const launchEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(resolved.HERO_MODE_LAUNCH_ENABLED || '').trim().toLowerCase()
  );

  assert.equal(launchEnabled, false, 'launch gate must block non-override account');
});

test('command pre-gate: override account passes all 6 flag gates (claim-task + camp)', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);
  const resolved = resolveHeroFlagsWithOverride({ env, accountId: TEAM_ACCOUNT });

  // All flag gates that appear in the command route handler
  const gates = [
    'HERO_MODE_LAUNCH_ENABLED',
    'HERO_MODE_SHADOW_ENABLED',
    'HERO_MODE_PROGRESS_ENABLED',
    'HERO_MODE_CHILD_UI_ENABLED',
    'HERO_MODE_ECONOMY_ENABLED',
    'HERO_MODE_CAMP_ENABLED',
  ];

  for (const flag of gates) {
    const enabled = ['1', 'true', 'yes', 'on'].includes(
      String(resolved[flag] || '').trim().toLowerCase()
    );
    assert.equal(enabled, true, `${flag} gate must pass for override account`);
  }
});

test('integration: buildHeroShadowReadModel without override keeps flags from env', () => {
  const env = envWithTeamList([TEAM_ACCOUNT]);

  const subjectReadModels = {
    spelling: {
      data: {
        megaStatus: 'not-started',
        units: [
          { id: 'unit-1', status: 'mastered', score: 100, starCount: 3 },
        ],
      },
      ui: {},
    },
  };

  const result = buildHeroShadowReadModel({
    learnerId: 'learner-test-2',
    accountId: OTHER_ACCOUNT,
    subjectReadModels,
    now: Date.now(),
    env,
  });

  // Non-listed account → all flags off → shadow-disabled
  assert.equal(result.ui.reason, 'shadow-disabled');
  assert.equal(result.childVisible, false);
});
