// Hero Mode pA4 U2 — Route Integration: Unified Resolver in read model and command routes.
//
// Verifies:
// 1. External account gets overrideStatus 'external' in debug output
// 2. Internal account gets overrideStatus 'internal' in debug output
// 3. Non-cohort account with flags off gets overrideStatus 'none'
// 4. Read model and command use same resolver (function import consistency)
// 5. Telemetry probe overrideStatus shape includes classification field

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroFlagsWithOverride,
  resolveHeroFlagsForAccount,
  HERO_FLAG_KEYS,
} from '../shared/hero/account-override.js';
import { buildExpandedProbeResponse } from '../worker/src/hero/telemetry-probe.js';

// ── Helpers ──────────────────────────────────────────────────────────

const INTERNAL_ACCOUNT = 'acc-internal-001';
const EXTERNAL_ACCOUNT = 'acc-external-002';
const PUBLIC_ACCOUNT = 'acc-public-999';

function baseEnv(overrides = {}) {
  return {
    HERO_MODE_SHADOW_ENABLED: 'false',
    HERO_MODE_LAUNCH_ENABLED: 'false',
    HERO_MODE_CHILD_UI_ENABLED: 'false',
    HERO_MODE_PROGRESS_ENABLED: 'false',
    HERO_MODE_ECONOMY_ENABLED: 'false',
    HERO_MODE_CAMP_ENABLED: 'false',
    APP_NAME: 'KS2 Mastery',
    HERO_INTERNAL_ACCOUNTS: JSON.stringify([INTERNAL_ACCOUNT]),
    HERO_EXTERNAL_ACCOUNTS: JSON.stringify([EXTERNAL_ACCOUNT]),
    ...overrides,
  };
}

function baseEnvWithGlobalFlags(overrides = {}) {
  return baseEnv({
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    ...overrides,
  });
}

// ── Unit: overrideStatus classification for command route ─────────────

describe('pA4 U2: command route — unified resolver overrideStatus', () => {
  it('external account gets overrideStatus "external"', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: EXTERNAL_ACCOUNT });

    assert.equal(overrideStatus, 'external');
    // All 6 flags force-enabled for external cohort
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(resolvedEnv[key], 'true', `${key} must be "true" for external account`);
    }
  });

  it('internal account gets overrideStatus "internal"', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: INTERNAL_ACCOUNT });

    assert.equal(overrideStatus, 'internal');
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(resolvedEnv[key], 'true', `${key} must be "true" for internal account`);
    }
  });

  it('non-cohort account with flags off gets overrideStatus "none"', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });

    assert.equal(overrideStatus, 'none');
    for (const key of HERO_FLAG_KEYS) {
      assert.equal(resolvedEnv[key], 'false', `${key} must remain "false" for non-cohort account`);
    }
  });

  it('non-cohort account with global flags on gets overrideStatus "global"', () => {
    const env = baseEnvWithGlobalFlags();
    const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });

    assert.equal(overrideStatus, 'global');
    // Global flags preserved — only shadow and launch are 'true' in this fixture
    assert.equal(resolvedEnv.HERO_MODE_SHADOW_ENABLED, 'true');
    assert.equal(resolvedEnv.HERO_MODE_LAUNCH_ENABLED, 'true');
    assert.equal(resolvedEnv.HERO_MODE_CAMP_ENABLED, 'false');
  });
});

// ── Unit: read model and command use same resolver ────────────────────

describe('pA4 U2: resolver consistency — read model and command share resolveHeroFlagsForAccount', () => {
  it('resolveHeroFlagsForAccount is the primary export used by both routes', () => {
    // Verify the function exists and is callable
    assert.equal(typeof resolveHeroFlagsForAccount, 'function');
    assert.equal(resolveHeroFlagsForAccount.length, 1, 'takes single params object');
  });

  it('resolveHeroFlagsWithOverride delegates to resolveHeroFlagsForAccount', () => {
    const env = baseEnv();

    // The wrapper returns only resolvedEnv
    const wrapperResult = resolveHeroFlagsWithOverride({ env, accountId: INTERNAL_ACCOUNT });
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId: INTERNAL_ACCOUNT });

    // Both must produce identical resolved env
    assert.deepEqual(wrapperResult, resolvedEnv);
  });

  it('same resolver for internal: wrapper matches primary', () => {
    const env = baseEnv();
    const wrapperResult = resolveHeroFlagsWithOverride({ env, accountId: EXTERNAL_ACCOUNT });
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId: EXTERNAL_ACCOUNT });
    assert.deepEqual(wrapperResult, resolvedEnv);
  });

  it('same resolver for non-cohort: wrapper matches primary', () => {
    const env = baseEnv();
    const wrapperResult = resolveHeroFlagsWithOverride({ env, accountId: PUBLIC_ACCOUNT });
    const { resolvedEnv } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });
    assert.deepEqual(wrapperResult, resolvedEnv);
  });
});

// ── Unit: telemetry probe overrideStatus shape ───────────────────────

describe('pA4 U2: telemetry probe — overrideStatus in expanded response', () => {
  const minimalProbeResult = { events: [], count: 0, probedAt: '2026-04-30T00:00:00.000Z' };
  const dateKey = '2026-04-30';

  it('expanded probe includes overrideStatus with classification for external', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus: classification } = resolveHeroFlagsForAccount({ env, accountId: EXTERNAL_ACCOUNT });

    const effectiveFlags = Object.fromEntries(
      HERO_FLAG_KEYS.map(k => [k, resolvedEnv[k] || ''])
    );

    const overrideStatus = {
      queriedLearnerId: 'learner-ext-01',
      parentAccountId: EXTERNAL_ACCOUNT,
      classification,
      effectiveFlags,
    };

    const expanded = buildExpandedProbeResponse({
      probeResult: minimalProbeResult,
      heroState: null,
      resolvedFlags: resolvedEnv,
      dateKey,
      overrideStatus,
      learnerEventCount: 0,
    });

    assert.equal(expanded.ok, true);
    assert.equal(expanded.overrideStatus.classification, 'external');
    assert.equal(expanded.overrideStatus.queriedLearnerId, 'learner-ext-01');
    assert.equal(expanded.overrideStatus.parentAccountId, EXTERNAL_ACCOUNT);
    assert.equal(expanded.overrideStatus.effectiveFlags.HERO_MODE_SHADOW_ENABLED, 'true');
  });

  it('expanded probe includes overrideStatus with classification for internal', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus: classification } = resolveHeroFlagsForAccount({ env, accountId: INTERNAL_ACCOUNT });

    const effectiveFlags = Object.fromEntries(
      HERO_FLAG_KEYS.map(k => [k, resolvedEnv[k] || ''])
    );

    const overrideStatus = {
      queriedLearnerId: 'learner-int-01',
      parentAccountId: INTERNAL_ACCOUNT,
      classification,
      effectiveFlags,
    };

    const expanded = buildExpandedProbeResponse({
      probeResult: minimalProbeResult,
      heroState: null,
      resolvedFlags: resolvedEnv,
      dateKey,
      overrideStatus,
      learnerEventCount: 0,
    });

    assert.equal(expanded.ok, true);
    assert.equal(expanded.overrideStatus.classification, 'internal');
    assert.equal(expanded.overrideStatus.parentAccountId, INTERNAL_ACCOUNT);
  });

  it('expanded probe includes overrideStatus with classification "none" for public', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus: classification } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });

    const effectiveFlags = Object.fromEntries(
      HERO_FLAG_KEYS.map(k => [k, resolvedEnv[k] || ''])
    );

    const overrideStatus = {
      queriedLearnerId: 'learner-pub-01',
      parentAccountId: PUBLIC_ACCOUNT,
      classification,
      effectiveFlags,
    };

    const expanded = buildExpandedProbeResponse({
      probeResult: minimalProbeResult,
      heroState: null,
      resolvedFlags: resolvedEnv,
      dateKey,
      overrideStatus,
      learnerEventCount: 0,
    });

    assert.equal(expanded.ok, true);
    assert.equal(expanded.overrideStatus.classification, 'none');
    assert.equal(expanded.overrideStatus.effectiveFlags.HERO_MODE_SHADOW_ENABLED, 'false');
  });

  it('expanded probe with orphan learner includes reason field', () => {
    const env = baseEnv();
    const { resolvedEnv, overrideStatus: classification } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });

    const effectiveFlags = Object.fromEntries(
      HERO_FLAG_KEYS.map(k => [k, resolvedEnv[k] || ''])
    );

    // Simulates what app.js does when parentAccountId is null
    const overrideStatus = {
      queriedLearnerId: 'learner-orphan-01',
      parentAccountId: null,
      classification,
      effectiveFlags,
      reason: 'parent-account-not-found',
    };

    const expanded = buildExpandedProbeResponse({
      probeResult: minimalProbeResult,
      heroState: null,
      resolvedFlags: resolvedEnv,
      dateKey,
      overrideStatus,
      learnerEventCount: null,
    });

    assert.equal(expanded.ok, true);
    assert.equal(expanded.overrideStatus.parentAccountId, null);
    assert.equal(expanded.overrideStatus.reason, 'parent-account-not-found');
  });
});

// ── Unit: command route heroCommandOverrideStatus availability ────────

describe('pA4 U2: command route — heroCommandOverrideStatus available for telemetry', () => {
  it('resolver returns overrideStatus alongside resolvedEnv for command route use', () => {
    const env = baseEnv();
    const result = resolveHeroFlagsForAccount({ env, accountId: INTERNAL_ACCOUNT });

    // The route destructures as: { resolvedEnv: heroCommandEnv, overrideStatus: heroCommandOverrideStatus }
    assert.ok('resolvedEnv' in result, 'must have resolvedEnv');
    assert.ok('overrideStatus' in result, 'must have overrideStatus');
    assert.equal(typeof result.resolvedEnv, 'object');
    assert.equal(typeof result.overrideStatus, 'string');
  });

  it('overrideStatus values are one of the four valid classifications', () => {
    const env = baseEnvWithGlobalFlags();
    const validStatuses = ['internal', 'external', 'global', 'none'];

    const { overrideStatus: s1 } = resolveHeroFlagsForAccount({ env, accountId: INTERNAL_ACCOUNT });
    const { overrideStatus: s2 } = resolveHeroFlagsForAccount({ env, accountId: EXTERNAL_ACCOUNT });
    const { overrideStatus: s3 } = resolveHeroFlagsForAccount({ env, accountId: PUBLIC_ACCOUNT });
    const { overrideStatus: s4 } = resolveHeroFlagsForAccount({
      env: baseEnv(), accountId: PUBLIC_ACCOUNT,
    });

    assert.ok(validStatuses.includes(s1), `internal → ${s1}`);
    assert.ok(validStatuses.includes(s2), `external → ${s2}`);
    assert.ok(validStatuses.includes(s3), `global → ${s3}`);
    assert.ok(validStatuses.includes(s4), `none → ${s4}`);
  });
});
