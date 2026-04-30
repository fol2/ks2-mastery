#!/usr/bin/env node
// Hero Mode pA4 — Operator Health Lookup Script.
// Shows why an account is enabled/hidden and current Hero health state.
// Pure function (buildOperatorLookup) exported for testability.
//
// Usage: node scripts/hero-pA4-operator-lookup.mjs --account-id=abc123

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveHeroFlagsForAccount,
  HERO_FLAG_KEYS,
} from '../shared/hero/account-override.js';
import { deriveReadinessChecks } from '../worker/src/hero/readiness.js';
import { stripPrivacyFields } from '../shared/hero/metrics-privacy.js';

// ── Constants ─────────────────────────────────────────────────────────

const MAX_RECENT_EVENTS = 10;
const DAILY_CAP = 100;

// ── Primary export: buildOperatorLookup ───────────────────────────────

/**
 * Build a structured operator health report for a given account.
 * Pure function — no DB access, no side effects.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.accountId — the queried account
 * @param {Object} params.env — Worker environment bindings (flags, cohort lists)
 * @param {Object|null} params.heroState — normalised hero progress state (or null)
 * @param {Array} params.eventLog — raw event log entries (will be privacy-stripped)
 * @returns {Object} structured health report
 */
export function buildOperatorLookup({ accountId, env, heroState, eventLog }) {
  // Guard: null/undefined accountId
  if (accountId == null || accountId === '') {
    return {
      ok: false,
      error: 'accountId is required but was null or empty.',
      accountId: accountId ?? null,
      overrideStatus: null,
      resolvedFlags: null,
      readinessChecks: null,
      recentEvents: null,
      economyHealth: null,
      cohortClassification: null,
      recommendations: ['Provide a valid accountId to perform lookup.'],
    };
  }

  const safeEnv = env && typeof env === 'object' ? env : {};
  const safeEventLog = Array.isArray(eventLog) ? eventLog : [];
  const safeState = heroState && typeof heroState === 'object' ? heroState : null;

  // 1. Resolve override status and flags
  const { resolvedEnv, overrideStatus } = resolveHeroFlagsForAccount({
    env: safeEnv,
    accountId,
  });

  // 2. Determine which Hero flags are active
  const resolvedFlags = {};
  for (const key of HERO_FLAG_KEYS) {
    resolvedFlags[key] = resolvedEnv[key] === 'true';
  }
  const allFlagsEnabled = HERO_FLAG_KEYS.every(k => resolvedFlags[k]);

  // 3. Readiness checks (from heroState)
  const readinessChecks = deriveReadinessChecks(safeState, resolvedEnv);

  // 4. Recent events (privacy-stripped, limited to MAX_RECENT_EVENTS)
  const recentEvents = deriveRecentEvents(safeEventLog);

  // 5. Economy health assessment
  const economyHealth = deriveEconomyHealth(safeState);

  // 6. Cohort classification
  const cohortClassification = deriveCohortClassification(overrideStatus, allFlagsEnabled);

  // 7. Recommendations
  const recommendations = deriveRecommendations({
    overrideStatus,
    allFlagsEnabled,
    readinessChecks,
    economyHealth,
    recentEvents,
  });

  return {
    ok: true,
    accountId,
    overrideStatus,
    resolvedFlags,
    readinessChecks,
    recentEvents,
    economyHealth,
    cohortClassification,
    recommendations,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Derive recent events with privacy stripping and limit.
 */
function deriveRecentEvents(eventLog) {
  if (eventLog.length === 0) {
    return { events: [], count: 0, message: 'No observations yet.' };
  }

  const stripped = eventLog
    .slice(0, MAX_RECENT_EVENTS)
    .map(event => stripPrivacyFields(event));

  return { events: stripped, count: stripped.length };
}

/**
 * Derive economy health from hero state.
 */
function deriveEconomyHealth(heroState) {
  if (!heroState) {
    return {
      status: 'no_state',
      balance: null,
      dailyAwarded: null,
      anomalies: [],
      message: 'No hero state available.',
    };
  }

  const economy = heroState.economy;
  if (!economy || typeof economy !== 'object') {
    return {
      status: 'missing',
      balance: null,
      dailyAwarded: null,
      anomalies: [],
      message: 'Economy sub-state missing from hero state.',
    };
  }

  const balance = typeof economy.balance === 'number' ? economy.balance : null;
  const ledger = Array.isArray(economy.ledger) ? economy.ledger : [];

  // Calculate daily awarded (awards from today's ledger entries)
  const today = new Date().toISOString().slice(0, 10);
  const todayAwards = ledger.filter(
    e => e && e.type === 'daily_award' && e.date === today,
  );
  const dailyAwarded = todayAwards.reduce(
    (sum, e) => sum + (typeof e.amount === 'number' ? e.amount : 0),
    0,
  );

  // Detect anomalies
  const anomalies = [];
  if (balance !== null && balance < 0) {
    anomalies.push('negative-balance');
  }
  if (balance !== null && !Number.isFinite(balance)) {
    anomalies.push('non-finite-balance');
  }
  if (dailyAwarded > DAILY_CAP) {
    anomalies.push(`daily-cap-exceeded:${dailyAwarded}/${DAILY_CAP}`);
  }
  if (ledger.some(e => e === null || e === undefined)) {
    anomalies.push('null-ledger-entry');
  }

  const status = anomalies.length === 0 ? 'healthy' : 'unhealthy';

  return { status, balance, dailyAwarded, anomalies };
}

/**
 * Classify why the account is enabled or hidden.
 */
function deriveCohortClassification(overrideStatus, allFlagsEnabled) {
  switch (overrideStatus) {
    case 'internal':
      return {
        enabled: true,
        reason: 'Account is in HERO_INTERNAL_ACCOUNTS cohort list. All Hero flags force-enabled.',
      };
    case 'external':
      return {
        enabled: true,
        reason: 'Account is in HERO_EXTERNAL_ACCOUNTS cohort list. All Hero flags force-enabled.',
      };
    case 'global':
      return {
        enabled: allFlagsEnabled,
        reason: allFlagsEnabled
          ? 'Hero flags are globally enabled in environment. Account benefits from global rollout.'
          : 'Some Hero flags are globally enabled but not all. Partial visibility.',
      };
    case 'none':
    default:
      return {
        enabled: false,
        reason: 'Account is not in any cohort list and no global Hero flags are enabled. Hero Mode is hidden.',
      };
  }
}

/**
 * Derive actionable recommendations based on current state.
 */
function deriveRecommendations({
  overrideStatus,
  allFlagsEnabled,
  readinessChecks,
  economyHealth,
  recentEvents,
}) {
  const recs = [];

  // Cohort-based recommendations
  if (overrideStatus === 'none') {
    recs.push('Account not in any cohort list. Add to HERO_INTERNAL_ACCOUNTS or HERO_EXTERNAL_ACCOUNTS to enable.');
  }

  // Readiness-based recommendations
  if (readinessChecks.overall === 'not_ready') {
    const failing = readinessChecks.checks
      .filter(c => c.status === 'fail')
      .map(c => c.name);
    recs.push(`Readiness checks failing: ${failing.join(', ')}. Investigate and resolve before full enablement.`);
  }
  if (readinessChecks.overall === 'not_started') {
    recs.push('Hero state has not been initialised for this account. Trigger initial Hero session to bootstrap state.');
  }

  // Economy-based recommendations
  if (economyHealth.status === 'unhealthy') {
    recs.push(`Economy anomalies detected: ${economyHealth.anomalies.join(', ')}. Manual intervention required.`);
  }

  // Event-based recommendations
  if (recentEvents.count === 0) {
    recs.push('No event log observations. Account has not interacted with Hero Mode yet.');
  }

  // Partial flags
  if (overrideStatus === 'global' && !allFlagsEnabled) {
    recs.push('Partial global flag enablement. Either enable all 6 flags or add account to a cohort list for full access.');
  }

  // All good
  if (recs.length === 0) {
    recs.push('Account is healthy and fully enabled. No action required.');
  }

  return recs;
}

// ── CLI ───────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { accountId: null };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--account-id=')) {
      args.accountId = arg.slice('--account-id='.length);
    } else if (arg === '--account-id' && argv[i + 1]) {
      args.accountId = argv[++i];
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);

  console.log('Hero Mode pA4 — Operator Health Lookup');
  console.log('─'.repeat(40));

  if (!args.accountId) {
    console.error('Error: --account-id is required.');
    console.error('Usage: node scripts/hero-pA4-operator-lookup.mjs --account-id=abc123');
    process.exitCode = 1;
    return;
  }

  // In CLI mode we have no live DB — demonstrate with empty state
  const report = buildOperatorLookup({
    accountId: args.accountId,
    env: {},
    heroState: null,
    eventLog: [],
  });

  console.log(JSON.stringify(report, null, 2));
}

const _scriptUrl = fileURLToPath(import.meta.url);
const _invokedAs = process.argv[1] ? resolve(process.argv[1]) : '';
if (_scriptUrl === _invokedAs) {
  main();
}
