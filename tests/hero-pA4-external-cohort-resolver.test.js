import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroFlagsForAccount,
  resolveHeroFlagsWithOverride,
  HERO_FLAG_KEYS,
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

  it('account in neither list with a global flag enabled returns status global', () => {
    const env = {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify(['int-1']),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify(['ext-1']),
      HERO_MODE_SHADOW_ENABLED: 'true',
    };
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: 'unknown-acc' });

    assert.equal(overrideStatus, 'global');
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
});
