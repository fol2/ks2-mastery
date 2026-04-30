#!/usr/bin/env node
// Hero Mode pA5 — Rollout Resolver Evidence (U9)
// Runs the resolveHeroFlagsForAccount resolver against fixture accounts to prove
// that all 7 precedence levels function correctly.
//
// Usage: node scripts/hero-pA5-rollout-resolver-evidence.mjs
//
// Key constraint: NEVER imports from worker/src/ — only from shared/hero/.

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  resolveHeroFlagsForAccount,
  HERO_FLAG_KEYS,
  _hashAccountToBucket,
} from '../shared/hero/account-override.js';

// ── Fixture accounts ─────────────────────────────────────────────────

const FIXTURE_INTERNAL = 'acct-internal-001';
const FIXTURE_EXTERNAL = 'acct-external-002';
const FIXTURE_EXCLUDED = 'acct-excluded-003';
const FIXTURE_ROLLOUT_IN = 'acct-rollout-in-004';
const FIXTURE_ROLLOUT_OUT = 'acct-rollout-out-005';
const FIXTURE_GLOBAL = 'acct-global-006';
const FIXTURE_NONE = 'acct-none-007';

// ── Scenario definitions ─────────────────────────────────────────────

const scenarios = [
  {
    id: 'S1-internal-allowlist',
    description: 'Internal allowlist account gets all flags enabled',
    env: {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([FIXTURE_INTERNAL]),
    },
    accountId: FIXTURE_INTERNAL,
    expectedStatus: 'internal',
    expectAllFlagsOn: true,
  },
  {
    id: 'S2-external-allowlist',
    description: 'External allowlist account gets all flags enabled',
    env: {
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify([FIXTURE_EXTERNAL]),
    },
    accountId: FIXTURE_EXTERNAL,
    expectedStatus: 'external',
    expectAllFlagsOn: true,
  },
  {
    id: 'S3-rollout-percentage',
    description: 'Account inside rollout bucket gets all flags enabled',
    env: {
      HERO_ROLLOUT_SALT: 'pA5-evidence-salt',
      HERO_ROLLOUT_PERCENT: '100', // 100% — everyone is in
    },
    accountId: FIXTURE_ROLLOUT_IN,
    expectedStatus: 'rollout-bucket',
    expectAllFlagsOn: true,
  },
  {
    id: 'S4-excluded-account',
    description: 'Excluded account stays excluded even if on internal list',
    env: {
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([FIXTURE_EXCLUDED]),
      HERO_EXCLUDED_ACCOUNTS: JSON.stringify([FIXTURE_EXCLUDED]),
    },
    accountId: FIXTURE_EXCLUDED,
    expectedStatus: 'excluded',
    expectAllFlagsOn: false,
  },
  {
    id: 'S5-emergency-rollback',
    description: 'Emergency rollback overrides everything — even internal accounts',
    env: {
      HERO_EMERGENCY_DISABLED: 'true',
      HERO_INTERNAL_ACCOUNTS: JSON.stringify([FIXTURE_INTERNAL]),
      HERO_EXTERNAL_ACCOUNTS: JSON.stringify([FIXTURE_EXTERNAL]),
      HERO_ROLLOUT_SALT: 'salt',
      HERO_ROLLOUT_PERCENT: '100',
    },
    accountId: FIXTURE_INTERNAL,
    expectedStatus: 'emergency-off',
    expectAllFlagsOn: false,
  },
  {
    id: 'S6-malformed-json-fails-closed',
    description: 'Malformed JSON in allowlist fails closed — no account resolves',
    env: {
      HERO_INTERNAL_ACCOUNTS: '{not valid json[',
      HERO_EXTERNAL_ACCOUNTS: 'also broken',
    },
    accountId: FIXTURE_INTERNAL,
    expectedStatus: 'none',
    expectAllFlagsOn: false,
  },
  {
    id: 'S7-override-status-visible',
    description: 'overrideStatus is always a string visible to ops tooling',
    env: {},
    accountId: FIXTURE_NONE,
    expectedStatus: 'none',
    expectAllFlagsOn: false,
  },
  {
    id: 'S8-rollout-zero-percent',
    description: 'Rollout at 0% means nobody gets in via bucket',
    env: {
      HERO_ROLLOUT_SALT: 'pA5-evidence-salt',
      HERO_ROLLOUT_PERCENT: '0',
    },
    accountId: FIXTURE_ROLLOUT_OUT,
    expectedStatus: 'none',
    expectAllFlagsOn: false,
  },
  {
    id: 'S9-global-default-detection',
    description: 'Global default detected when at least one Hero flag is already on',
    env: {
      HERO_MODE_SHADOW_ENABLED: 'true',
    },
    accountId: FIXTURE_GLOBAL,
    expectedStatus: 'global-default',
    expectAllFlagsOn: false,
  },
];

// ── Validation logic ─────────────────────────────────────────────────

function allFlagsOn(env) {
  return HERO_FLAG_KEYS.every(key => env[key] === 'true');
}

function runScenario(scenario) {
  const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({
    env: scenario.env,
    accountId: scenario.accountId,
  });

  const statusMatch = overrideStatus === scenario.expectedStatus;
  const flagsMatch = scenario.expectAllFlagsOn
    ? allFlagsOn(resolvedEnv)
    : !allFlagsOn(resolvedEnv);

  const pass = statusMatch && flagsMatch;

  return {
    id: scenario.id,
    description: scenario.description,
    pass,
    overrideStatus,
    expectedStatus: scenario.expectedStatus,
    flagsAllOn: allFlagsOn(resolvedEnv),
    expectAllFlagsOn: scenario.expectAllFlagsOn,
    statusMatch,
    flagsMatch,
  };
}

// ── Main (CLI execution) ─────────────────────────────────────────────

function main() {
  console.log('Hero Mode pA5 — Rollout Resolver Evidence');
  console.log('='.repeat(50));
  console.log(`Scenarios: ${scenarios.length}`);
  console.log(`Flag keys: ${HERO_FLAG_KEYS.length}`);
  console.log('');

  const results = scenarios.map(runScenario);
  let failures = 0;

  for (const r of results) {
    const icon = r.pass ? '[PASS]' : '[FAIL]';
    console.log(`${icon} ${r.id}: ${r.description}`);
    console.log(`       overrideStatus: ${r.overrideStatus} (expected: ${r.expectedStatus})`);
    console.log(`       allFlagsOn: ${r.flagsAllOn} (expected: ${r.expectAllFlagsOn})`);

    if (!r.pass) {
      failures++;
      if (!r.statusMatch) {
        console.log(`       ERROR: status mismatch`);
      }
      if (!r.flagsMatch) {
        console.log(`       ERROR: flag state mismatch`);
      }
    }
    console.log('');
  }

  // ── Summary ──
  console.log('─'.repeat(50));
  console.log(`Total: ${results.length}  Passed: ${results.length - failures}  Failed: ${failures}`);

  if (failures > 0) {
    console.log('\n[FAIL] Resolver evidence incomplete — not all scenarios pass.');
    process.exit(1);
  }

  console.log('\n[PASS] All resolver precedence levels proven.');
  console.log('       Evidence covers: internal, external, rollout-bucket,');
  console.log('       excluded, emergency-off, malformed-json, global-default, none.');
  process.exit(0);
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
