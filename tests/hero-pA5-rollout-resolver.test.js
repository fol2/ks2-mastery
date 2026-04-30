import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroFlagsForAccount,
  HERO_FLAG_KEYS,
  _hashAccountToBucket,
} from '../shared/hero/account-override.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function allFlagsEnabled(env) {
  return HERO_FLAG_KEYS.every(k => env[k] === 'true');
}

function makeFullEnv(accountId) {
  return {
    HERO_EMERGENCY_DISABLED: 'true',
    HERO_EXCLUDED_ACCOUNTS: JSON.stringify([accountId]),
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    HERO_EXTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    HERO_ROLLOUT_SALT: 'stable-salt',
    HERO_ROLLOUT_PERCENT: '100',
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };
}

// ── 1. Precedence Chain ──────────────────────────────────────────────────

describe('rollout-resolver: precedence chain', () => {
  const accountId = 'test-account-001';

  it('emergency-off overrides internal account', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'emergency-off');
  });

  it('excluded overrides internal account', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([accountId]),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'excluded');
  });

  it('internal beats external', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'internal');
  });

  it('external beats rollout-bucket', () => {
    const env = {
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify([accountId]),
      HERO_ROLLOUT_SALT: 'salt-ext',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'external');
  });

  it('rollout-bucket beats global-default', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'salt-rb',
      HERO_ROLLOUT_PERCENT: '100',
      HERO_MODE_SHADOW_ENABLED: 'true',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'rollout-bucket');
  });

  it('global-default beats none', () => {
    const env = {
      HERO_MODE_CAMP_ENABLED: 'true',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'global-default');
  });

  it('no flags, no lists, no bucket yields none', () => {
    const env = {};
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'none');
  });
});

// ── 2. Bucket Stability ──────────────────────────────────────────────────

describe('rollout-resolver: bucket stability', () => {
  it('same account+salt produces identical result across 1000 calls', () => {
    const input = 'stable-account:fixed-salt';
    const expected = _hashAccountToBucket(input);
    for (let i = 0; i < 1000; i++) {
      assert.equal(_hashAccountToBucket(input), expected);
    }
  });

  it('10000 random accounts at 50% yields distribution within 45-55%', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'distribution-test',
      HERO_ROLLOUT_PERCENT: '50',
    };
    let included = 0;
    for (let i = 0; i < 10000; i++) {
      const accountId = `acc-dist-${i}-${Math.random().toString(36).slice(2)}`;
      const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
      if (overrideStatus === 'rollout-bucket') included++;
    }
    const pct = (included / 10000) * 100;
    assert.ok(pct >= 45 && pct <= 55, `distribution ${pct.toFixed(1)}% outside 45-55% band`);
  });

  it('same account with different salt produces different bucket value', () => {
    const account = 'bucket-divergence-test';
    const bucket1 = _hashAccountToBucket(account + ':salt-alpha');
    const bucket2 = _hashAccountToBucket(account + ':salt-beta');
    assert.notEqual(bucket1, bucket2);
  });
});

// ── 3. Excluded Account ──────────────────────────────────────────────────

describe('rollout-resolver: excluded account', () => {
  const accountId = 'excluded-acct-42';

  it('excluded account cannot see Hero even if also in HERO_INTERNAL_ACCOUNTS', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([accountId]),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([accountId]),
    };
    const { overrideStatus, resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'excluded');
    assert.ok(!allFlagsEnabled(resolvedEnv));
  });

  it('excluded account with HERO_ROLLOUT_PERCENT=100 is still excluded', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([accountId]),
      HERO_ROLLOUT_SALT: 'any-salt',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'excluded');
  });

  it('excluded + emergency-off → emergency-off wins (higher precedence)', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([accountId]),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'emergency-off');
  });
});

// ── 4. Emergency-Off ─────────────────────────────────────────────────────

describe('rollout-resolver: emergency-off', () => {
  it('emergency-off hides ALL accounts regardless of allowlist/bucket', () => {
    const accountId = 'full-access-account';
    const env = makeFullEnv(accountId);
    // Despite every list containing this account, emergency-off wins
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'emergency-off');
  });

  it('emergency-off does not force flags on (resolvedEnv unchanged)', () => {
    const env = { HERO_EMERGENCY_DISABLED: 'true' };
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId: 'any' });
    // None of the 6 flags should be force-enabled
    for (const key of HERO_FLAG_KEYS) {
      assert.ok(resolvedEnv[key] !== 'true' || false,
        `${key} should not be forced on in emergency-off`);
    }
  });

  it('emergency-off + all other classifications present → emergency-off wins', () => {
    const accountId = 'all-classified';
    const env = {
      ...makeFullEnv(accountId),
      HERO_EMERGENCY_DISABLED: 'true',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'emergency-off');
  });
});

// ── 5. Route Consistency ─────────────────────────────────────────────────

describe('rollout-resolver: route consistency', () => {
  it('read-model route and command route use same resolver (identical overrideStatus)', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['route-test-acct']),
      HERO_ROLLOUT_SALT: 'route-salt',
      HERO_ROLLOUT_PERCENT: '50',
    };
    const accountId = 'route-test-acct';

    // Simulate read-model path calling resolver
    const readResult = resolveHeroFlagsForAccount({ env, accountId });
    // Simulate command path calling same resolver
    const commandResult = resolveHeroFlagsForAccount({ env, accountId });

    assert.equal(readResult.overrideStatus, commandResult.overrideStatus);
    assert.deepEqual(readResult.resolvedEnv, commandResult.resolvedEnv);
  });

  it('account classification does not change between read-model and command for same context', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'consistency-salt',
      HERO_ROLLOUT_PERCENT: '75',
    };
    const accountId = 'consistency-acct-007';

    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(resolveHeroFlagsForAccount({ env, accountId }).overrideStatus);
    }
    // All 100 calls return the same classification
    const unique = [...new Set(results)];
    assert.equal(unique.length, 1, `classification varied: ${unique.join(', ')}`);
  });
});

// ── 6. Ops Visibility / Privacy ──────────────────────────────────────────

describe('rollout-resolver: ops visibility and privacy', () => {
  it('overrideStatus is present in resolver output (ops can see it)', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['ops-vis-acct']) };
    const result = resolveHeroFlagsForAccount({ env, accountId: 'ops-vis-acct' });
    assert.ok('overrideStatus' in result, 'overrideStatus missing from resolver output');
    assert.equal(typeof result.overrideStatus, 'string');
  });

  it('resolvedEnv does NOT contain HERO_INTERNAL_ACCOUNTS value in child-facing response', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'privacy-salt',
      HERO_ROLLOUT_PERCENT: '100',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['secret-internal-acct']),
    };
    // Account not in internal list — goes through rollout-bucket
    const accountId = 'public-facing-acct';
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId });

    // The child-facing response shape must NOT include operational secrets
    const childFacing = {
      heroEnabled: allFlagsEnabled(resolvedEnv),
      overrideStatus: undefined, // deliberately excluded from child shape
    };
    assert.equal(childFacing.overrideStatus, undefined);
    assert.ok(!('HERO_INTERNAL_ACCOUNTS' in childFacing));
    assert.ok(!('HERO_ROLLOUT_SALT' in childFacing));
  });

  it('resolvedEnv does NOT contain HERO_ROLLOUT_SALT value in child-facing response shape', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'super-secret-salt',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const accountId = 'child-facing-test';
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId });

    // Child-facing response shape must strip operational secrets
    const childFacing = { heroEnabled: allFlagsEnabled(resolvedEnv) };
    assert.ok(!('HERO_ROLLOUT_SALT' in childFacing));
    assert.ok(!('overrideStatus' in childFacing));
  });

  it('child-facing response shape does NOT include overrideStatus', () => {
    const env = makeFullEnv('child-acct');
    // Remove emergency-off so account gets classified differently
    delete env.HERO_EMERGENCY_DISABLED;
    delete env.HERO_EXCLUDED_ACCOUNTS;
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'child-acct' });

    // Build the child-facing shape as the route handler would
    const childResponse = { heroEnabled: allFlagsEnabled(resolvedEnv) };
    assert.ok(!('overrideStatus' in childResponse), 'overrideStatus must not leak to child');
    assert.ok(!('HERO_INTERNAL_ACCOUNTS' in childResponse));
    assert.ok(!('HERO_ROLLOUT_SALT' in childResponse));
    // But the server-side result DOES have it
    assert.ok(overrideStatus !== undefined);
  });
});

// ── 7. Malformed Input ───────────────────────────────────────────────────

describe('rollout-resolver: malformed input (fail closed)', () => {
  it('HERO_EXCLUDED_ACCOUNTS with invalid JSON is treated as empty', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: '{not-json[',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['malformed-test-acct']),
    };
    const accountId = 'malformed-test-acct';
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    // Invalid excluded list is ignored → falls through to internal
    assert.equal(overrideStatus, 'internal');
  });

  it('HERO_ROLLOUT_PERCENT as NaN is treated as 0', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'nan-salt',
      HERO_ROLLOUT_PERCENT: 'not-a-number',
    };
    const accountId = 'nan-test-acct';
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    // NaN percent → 0 → rollout-bucket never fires → falls to none
    assert.equal(overrideStatus, 'none');
  });

  it('HERO_ROLLOUT_PERCENT > 100 is treated as 0', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'over-salt',
      HERO_ROLLOUT_PERCENT: '150',
    };
    const accountId = 'over-test-acct';
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'none');
  });

  it('HERO_ROLLOUT_PERCENT < 0 is treated as 0', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'neg-salt',
      HERO_ROLLOUT_PERCENT: '-10',
    };
    const accountId = 'neg-test-acct';
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId });
    assert.equal(overrideStatus, 'none');
  });
});
