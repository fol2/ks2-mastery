import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroFlagsForAccount,
  resolveHeroFlagsWithOverride,
  HERO_FLAG_KEYS,
  _hashAccountToBucket,
} from '../shared/hero/account-override.js';

// ── Helper ────────────────────────────────────────────────────────────

function allFlagsEnabled(env) {
  return HERO_FLAG_KEYS.every(k => env[k] === 'true');
}

function noFlagsEnabled(env) {
  return HERO_FLAG_KEYS.every(k => env[k] !== 'true');
}

// ── External cohort: account in HERO_EXTERNAL_ACCOUNTS ────────────────

describe('resolveHeroFlagsForAccount: external cohort', () => {
  it('account in HERO_EXTERNAL_ACCOUNTS enables all 6 flags with status external', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['acc-ext-1', 'acc-ext-2']) };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-ext-1' });

    assert.equal(overrideStatus, 'external');
    assert.ok(allFlagsEnabled(resolvedEnv));
  });

  it('preserves existing env bindings alongside forced flags', () => {
    const env = {
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
      OTHER_BINDING: 'keep-me',
    };
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId: 'ext-1' });

    assert.equal(resolvedEnv.OTHER_BINDING, 'keep-me');
    assert.ok(allFlagsEnabled(resolvedEnv));
  });
});

// ── Internal cohort: account in HERO_INTERNAL_ACCOUNTS ────────────────

describe('resolveHeroFlagsForAccount: internal cohort', () => {
  it('account in HERO_INTERNAL_ACCOUNTS enables all 6 flags with status internal', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-int-1']) };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-int-1' });

    assert.equal(overrideStatus, 'internal');
    assert.ok(allFlagsEnabled(resolvedEnv));
  });
});

// ── Neither list: global or none ──────────────────────────────────────

describe('resolveHeroFlagsForAccount: neither list', () => {
  it('account in neither list with no global flags returns status none', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'unknown-acc' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('account in neither list with a global flag enabled returns status global-default', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
      HERO_MODE_SHADOW_ENABLED: 'true',
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'unknown-acc' });

    assert.equal(overrideStatus, 'global-default');
    // Global flags unchanged — no additional flags forced
    assert.equal(resolvedEnv.HERO_MODE_SHADOW_ENABLED, 'true');
    assert.notEqual(resolvedEnv.HERO_MODE_CAMP_ENABLED, 'true');
  });
});

// ── Precedence: both lists ────────────────────────────────────────────

describe('resolveHeroFlagsForAccount: precedence', () => {
  it('account in BOTH lists resolves as internal (internal takes precedence)', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['dual-acc']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['dual-acc']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'dual-acc' });

    assert.equal(overrideStatus, 'internal');
    assert.ok(allFlagsEnabled(resolvedEnv));
  });
});

// ── HERO_EXTERNAL_ACCOUNTS edge cases ─────────────────────────────────

describe('resolveHeroFlagsForAccount: HERO_EXTERNAL_ACCOUNTS edge cases', () => {
  it('HERO_EXTERNAL_ACCOUNTS is null → skip gracefully', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: null };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('HERO_EXTERNAL_ACCOUNTS is undefined → skip gracefully', () => {
    const env = {};
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('HERO_EXTERNAL_ACCOUNTS is empty string → skip gracefully', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: '' };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('HERO_EXTERNAL_ACCOUNTS is malformed JSON → fail closed (no override)', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: '{not-valid-json' };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('HERO_EXTERNAL_ACCOUNTS is valid JSON but not array → fail closed', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: JSON.stringify({ accounts: ['acc-1'] }) };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('HERO_EXTERNAL_ACCOUNTS is empty array → no override', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: JSON.stringify([]) };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });
});

// ── accountId edge cases ──────────────────────────────────────────────

describe('resolveHeroFlagsForAccount: accountId edge cases', () => {
  it('accountId is null → no override, status based on global flags', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: null });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('accountId is undefined → no override', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: undefined });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('accountId is empty string → no override', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: '' });

    assert.equal(overrideStatus, 'none');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });
});

// ── Emergency-off: HERO_EMERGENCY_DISABLED ──────────────────────────────

describe('resolveHeroFlagsForAccount: emergency-off', () => {
  it('HERO_EMERGENCY_DISABLED=true overrides everything — flags NOT enabled', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_MODE_SHADOW_ENABLED: 'true',
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'emergency-off');
    // Flags NOT force-enabled — env returned unchanged
    assert.equal(resolvedEnv.HERO_MODE_CAMP_ENABLED, undefined);
    assert.equal(resolvedEnv.HERO_MODE_ECONOMY_ENABLED, undefined);
  });

  it('HERO_EMERGENCY_DISABLED=true overrides even with no accountId', () => {
    const env = { HERO_EMERGENCY_DISABLED: 'true' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: null });

    assert.equal(overrideStatus, 'emergency-off');
  });

  it('HERO_EMERGENCY_DISABLED=false does NOT trigger emergency-off', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'false',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'internal');
  });

  it('HERO_EMERGENCY_DISABLED missing does NOT trigger emergency-off', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']) };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'internal');
  });
});

// ── Excluded accounts: HERO_EXCLUDED_ACCOUNTS ────────────────────────────

describe('resolveHeroFlagsForAccount: excluded accounts', () => {
  it('excluded account does NOT get flags enabled', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['banned-1']),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['banned-1']),
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'banned-1' });

    assert.equal(overrideStatus, 'excluded');
    assert.ok(noFlagsEnabled(resolvedEnv));
  });

  it('excluded beats external membership', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['acc-x']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['acc-x']),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-x' });

    assert.equal(overrideStatus, 'excluded');
  });

  it('malformed HERO_EXCLUDED_ACCOUNTS is ignored (fail closed = not excluded)', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: 'not-json',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'internal');
  });

  it('empty HERO_EXCLUDED_ACCOUNTS array does not exclude anyone', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([]),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'internal');
  });
});

// ── Rollout bucket: deterministic percentage ─────────────────────────────

describe('resolveHeroFlagsForAccount: rollout bucket', () => {
  it('account in bucket gets flags enabled with status rollout-bucket', () => {
    // Use 100% rollout to guarantee bucket inclusion
    const env = {
      HERO_ROLLOUT_SALT: 'test-salt-v1',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'rollout-bucket');
    assert.ok(allFlagsEnabled(resolvedEnv));
  });

  it('0% rollout means no one gets bucketed', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'test-salt-v1',
      HERO_ROLLOUT_PERCENT: '0',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('missing salt skips bucket check entirely', () => {
    const env = { HERO_ROLLOUT_PERCENT: '100' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('empty string salt skips bucket check', () => {
    const env = { HERO_ROLLOUT_SALT: '', HERO_ROLLOUT_PERCENT: '100' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('NaN percent treated as 0 (fail closed)', () => {
    const env = { HERO_ROLLOUT_SALT: 'salt', HERO_ROLLOUT_PERCENT: 'abc' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('negative percent treated as 0 (fail closed)', () => {
    const env = { HERO_ROLLOUT_SALT: 'salt', HERO_ROLLOUT_PERCENT: '-5' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('>100 percent treated as 0 (fail closed)', () => {
    const env = { HERO_ROLLOUT_SALT: 'salt', HERO_ROLLOUT_PERCENT: '101' };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'any-account' });

    assert.equal(overrideStatus, 'none');
  });

  it('internal account takes precedence over rollout bucket', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_ROLLOUT_SALT: 'salt',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'internal');
  });

  it('excluded account takes precedence over rollout bucket', () => {
    const env = {
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_ROLLOUT_SALT: 'salt',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const { overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'acc-1' });

    assert.equal(overrideStatus, 'excluded');
  });
});

// ── _hashAccountToBucket: determinism and range ──────────────────────────

describe('_hashAccountToBucket', () => {
  it('returns integer in range 0–99', () => {
    for (const input of ['a', 'test', 'acc-123:salt-v1', '']) {
      const result = _hashAccountToBucket(input);
      assert.ok(Number.isInteger(result), `expected integer for "${input}"`);
      assert.ok(result >= 0, `expected >= 0 for "${input}"`);
      assert.ok(result <= 99, `expected <= 99 for "${input}"`);
    }
  });

  it('same input always produces same output (stability)', () => {
    const input = 'account-xyz:salt-production-v3';
    const first = _hashAccountToBucket(input);
    const second = _hashAccountToBucket(input);
    const third = _hashAccountToBucket(input);

    assert.equal(first, second);
    assert.equal(second, third);
  });

  it('different inputs produce different outputs (distribution)', () => {
    const results = new Set();
    for (let i = 0; i < 200; i++) {
      results.add(_hashAccountToBucket(`account-${i}:salt`));
    }
    // With 200 inputs into 100 buckets, expect at least 50 distinct values
    assert.ok(results.size > 50, `expected good distribution, got ${results.size} distinct values`);
  });

  it('empty string produces a deterministic value', () => {
    const result = _hashAccountToBucket('');
    assert.equal(result, 0); // hash of empty = 0, 0 % 100 = 0
  });
});

// ── Full precedence chain ────────────────────────────────────────────────

describe('resolveHeroFlagsForAccount: full precedence chain', () => {
  it('emergency-off > excluded > internal > external > rollout > global-default > none', () => {
    const fullEnv = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      HERO_ROLLOUT_SALT: 'salt',
      HERO_ROLLOUT_PERCENT: '100',
      HERO_MODE_SHADOW_ENABLED: 'true',
    };

    // Level 1: emergency-off wins over everything
    assert.equal(
      resolveHeroFlagsForAccount({ env: fullEnv, accountId: 'acc-1' }).overrideStatus,
      'emergency-off'
    );

    // Level 2: excluded wins when emergency is off
    const noEmergency = { ...fullEnv, HERO_EMERGENCY_DISABLED: 'false' };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noEmergency, accountId: 'acc-1' }).overrideStatus,
      'excluded'
    );

    // Level 3: internal wins when not excluded
    const noExcluded = { ...noEmergency, HERO_EXCLUDED_ACCOUNTS: JSON.stringify([]) };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noExcluded, accountId: 'acc-1' }).overrideStatus,
      'internal'
    );

    // Level 4: external wins when not internal
    const noInternal = { ...noExcluded, HERO_INTERNAL_ACCOUNTS: JSON.stringify([]) };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noInternal, accountId: 'acc-1' }).overrideStatus,
      'external'
    );

    // Level 5: rollout-bucket when not in named lists
    const noExternal = { ...noInternal, HERO_EXTERNAL_ACCOUNTS: JSON.stringify([]) };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noExternal, accountId: 'acc-1' }).overrideStatus,
      'rollout-bucket'
    );

    // Level 6: global-default when not in bucket
    const noRollout = { ...noExternal, HERO_ROLLOUT_PERCENT: '0' };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noRollout, accountId: 'acc-1' }).overrideStatus,
      'global-default'
    );

    // Level 7: none when no global flags
    const noGlobal = { ...noRollout, HERO_MODE_SHADOW_ENABLED: 'false' };
    assert.equal(
      resolveHeroFlagsForAccount({ env: noGlobal, accountId: 'acc-1' }).overrideStatus,
      'none'
    );
  });
});

// ── Backward compatibility: resolveHeroFlagsWithOverride ──────────────

describe('resolveHeroFlagsWithOverride: backward compatibility', () => {
  it('returns env-like object (not { resolvedEnv, overrideStatus })', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']) };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'acc-1' });

    // Must be a flat object, not wrapped
    assert.equal(typeof result, 'object');
    assert.equal(result.resolvedEnv, undefined);
    assert.equal(result.overrideStatus, undefined);
    assert.ok(allFlagsEnabled(result));
  });

  it('returns unchanged env when account not in internal list', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
      OTHER: 'val',
    };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'unknown' });

    assert.equal(result.OTHER, 'val');
    assert.ok(noFlagsEnabled(result));
  });

  it('returns unchanged env when HERO_INTERNAL_ACCOUNTS is malformed', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: 'not-json' };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'acc-1' });

    assert.ok(noFlagsEnabled(result));
  });

  it('returns unchanged env when HERO_INTERNAL_ACCOUNTS is null', () => {
    const env = { HERO_INTERNAL_ACCOUNTS: null };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'acc-1' });

    assert.ok(noFlagsEnabled(result));
  });

  it('handles env being null/undefined gracefully', () => {
    const result = resolveHeroFlagsWithOverride({ env: null, accountId: 'acc-1' });
    assert.equal(typeof result, 'object');
    assert.ok(noFlagsEnabled(result));
  });

  it('external account override also works via wrapper', () => {
    const env = { HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']) };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'ext-1' });

    assert.ok(allFlagsEnabled(result));
  });

  it('emergency-off returns unchanged env via wrapper (no flags forced)', () => {
    const env = {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['acc-1']),
    };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'acc-1' });

    assert.ok(noFlagsEnabled(result));
  });

  it('rollout-bucket returns flags-enabled env via wrapper', () => {
    const env = {
      HERO_ROLLOUT_SALT: 'salt',
      HERO_ROLLOUT_PERCENT: '100',
    };
    const result = resolveHeroFlagsWithOverride({ env, accountId: 'any-acc' });

    assert.ok(allFlagsEnabled(result));
  });
});
