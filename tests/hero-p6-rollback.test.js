// Hero Mode P6 U11 — Rollback safety tests.
//
// Verifies:
// 1. Readiness checks correctly report per-flag status
// 2. Flag hierarchy enforcement detects misconfigurations
// 3. State preservation: rollback (flags off) then re-enable shows same state
// 4. Forbidden vocabulary does not leak into this test file's constants

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveReadinessChecks } from '../worker/src/hero/readiness.js';
import { HERO_FORBIDDEN_VOCABULARY } from '../shared/hero/hero-copy.js';

// ── Helpers ──────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);

/** All 6 flags enabled */
function allFlagsOn() {
  return {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };
}

/** All 6 flags disabled */
function allFlagsOff() {
  return {
    HERO_MODE_SHADOW_ENABLED: 'false',
    HERO_MODE_LAUNCH_ENABLED: 'false',
    HERO_MODE_CHILD_UI_ENABLED: 'false',
    HERO_MODE_PROGRESS_ENABLED: 'false',
    HERO_MODE_ECONOMY_ENABLED: 'false',
    HERO_MODE_CAMP_ENABLED: 'false',
  };
}

/** Build a healthy hero state sufficient for all readiness checks to pass */
function buildHealthyState() {
  return {
    version: 3,
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-rollback-test',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 6,
      taskOrder: ['t1', 't2', 't3'],
      completedTaskIds: ['t1'],
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 6 },
        t2: { taskId: 't2', status: 'started', effortTarget: 6 },
        t3: { taskId: 't3', status: 'pending', effortTarget: 6 },
      },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: null,
      lastUpdatedAt: 1002,
    },
    recentClaims: [
      { claimId: 'c1', createdAt: 900 },
    ],
    economy: {
      version: 1,
      balance: 250,
      totalEarned: 300,
      totalSpent: 50,
      dailyCap: 100,
      todayAwarded: 50,
      todayDateKey: '2026-04-29',
      ledger: [
        { id: 'le1', type: 'award', amount: 100, createdAt: 800 },
        { id: 'le2', type: 'award', amount: 100, createdAt: 850 },
        { id: 'le3', type: 'award', amount: 100, createdAt: 900 },
        { id: 'le4', type: 'spend', amount: -50, createdAt: 950 },
      ],
    },
    heroPool: {
      version: 1,
      rosterVersion: 1,
      monsters: {
        'monster-alpha': { monsterId: 'monster-alpha', level: 2, invitedAt: 800 },
        'monster-beta': { monsterId: 'monster-beta', level: 1, invitedAt: 900 },
      },
      recentActions: [],
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ── Readiness checks with individual flags off ──────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('Camp flag off: readiness reports not_ready with camp flag missing', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_CAMP_ENABLED = 'false';
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_CAMP_ENABLED'));
});

test('Economy flag off: readiness reports not_ready with economy flag missing', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_ECONOMY_ENABLED = 'false';
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_ECONOMY_ENABLED'));
});

test('Progress flag off: readiness reports not_ready', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_PROGRESS_ENABLED = 'false';
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_PROGRESS_ENABLED'));
});

test('All flags on + healthy state: readiness reports ready', () => {
  const flags = allFlagsOn();
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'ready');
  for (const check of result.checks) {
    assert.equal(check.status, 'pass', `Check '${check.name}' expected pass, got ${check.status}: ${check.detail}`);
  }
});

test('All flags off: readiness reports not_ready but checks still run', () => {
  const flags = allFlagsOff();
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  // Economy and camp health checks still pass (state is valid)
  const economyCheck = result.checks.find(c => c.name === 'economyHealthy');
  assert.equal(economyCheck.status, 'pass');
  const campCheck = result.checks.find(c => c.name === 'campHealthy');
  assert.equal(campCheck.status, 'pass');
});

test('No hero state: readiness reports not_started', () => {
  const flags = allFlagsOn();

  const result = deriveReadinessChecks(null, flags);

  assert.equal(result.overall, 'not_started');
  for (const check of result.checks) {
    assert.equal(check.status, 'not_started');
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── State preservation across rollback ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('State preserved: rollback (flags off) then re-enable shows identical readiness', () => {
  const state = buildHealthyState();

  // Full readiness with all flags on
  const beforeResult = deriveReadinessChecks(state, allFlagsOn());
  assert.equal(beforeResult.overall, 'ready');

  // Simulate rollback: all flags off — state unchanged
  const rollbackResult = deriveReadinessChecks(state, allFlagsOff());
  assert.equal(rollbackResult.overall, 'not_ready');
  // Economy and camp state checks still pass (state is intact)
  assert.equal(rollbackResult.checks.find(c => c.name === 'economyHealthy').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'campHealthy').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'stateValid').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'noCorruptState').status, 'pass');

  // Re-enable: same state passed with flags on again
  const afterResult = deriveReadinessChecks(state, allFlagsOn());
  assert.equal(afterResult.overall, 'ready');

  // Verify check-by-check equality
  for (let i = 0; i < beforeResult.checks.length; i++) {
    assert.deepEqual(beforeResult.checks[i], afterResult.checks[i],
      `Check ${beforeResult.checks[i].name} differs after rollback round-trip`);
  }
});

test('State preserved: partial rollback (camp off) does not corrupt economy checks', () => {
  const state = buildHealthyState();
  const flags = allFlagsOn();
  flags.HERO_MODE_CAMP_ENABLED = 'false';

  const result = deriveReadinessChecks(state, flags);

  // Economy check passes (economy state is valid regardless of camp flag)
  assert.equal(result.checks.find(c => c.name === 'economyHealthy').status, 'pass');
  // Camp check also passes (state structure is intact even if flag is off)
  assert.equal(result.checks.find(c => c.name === 'campHealthy').status, 'pass');
  // Only the flag check fails
  assert.equal(result.checks.find(c => c.name === 'flagsConfigured').status, 'fail');
});

test('State preserved: economy rollback does not affect state validity check', () => {
  const state = buildHealthyState();
  const flags = allFlagsOn();
  flags.HERO_MODE_ECONOMY_ENABLED = 'false';
  flags.HERO_MODE_CAMP_ENABLED = 'false'; // Camp depends on economy

  const result = deriveReadinessChecks(state, flags);

  // State is valid, no corruption
  assert.equal(result.checks.find(c => c.name === 'stateValid').status, 'pass');
  assert.equal(result.checks.find(c => c.name === 'noCorruptState').status, 'pass');
  // Balance is still there, just hidden from UI
  assert.equal(result.checks.find(c => c.name === 'economyHealthy').status, 'pass');
});

// ═══════════════════════════════════════════════════════════════════════
// ── Flag hierarchy enforcement (misconfiguration detection) ─────────
// ═══════════════════════════════════════════════════════════════════════

test('Misconfiguration: Camp=true but Economy=false detected as not_ready', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_ECONOMY_ENABLED = 'false';
  // Camp is still 'true' — this is a misconfiguration
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_ECONOMY_ENABLED'),
    'Should identify economy flag as missing');
});

test('Misconfiguration: Economy=true but Progress=false detected as not_ready', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_PROGRESS_ENABLED = 'false';
  // Economy is still 'true' — this is a misconfiguration
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_PROGRESS_ENABLED'),
    'Should identify progress flag as missing');
});

test('Misconfiguration: Child UI=true but Launch=false detected as not_ready', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_LAUNCH_ENABLED = 'false';
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_LAUNCH_ENABLED'));
});

test('Misconfiguration: Launch=true but Shadow=false detected as not_ready', () => {
  const flags = allFlagsOn();
  flags.HERO_MODE_SHADOW_ENABLED = 'false';
  const state = buildHealthyState();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_SHADOW_ENABLED'));
});

// ═══════════════════════════════════════════════════════════════════════
// ── Corruption detection across rollback ────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('Corrupt state: negative balance detected regardless of flags', () => {
  const state = buildHealthyState();
  state.economy.balance = -10; // Corruption

  const resultOn = deriveReadinessChecks(state, allFlagsOn());
  const resultOff = deriveReadinessChecks(state, allFlagsOff());

  // Both detect the corruption
  assert.equal(resultOn.checks.find(c => c.name === 'noCorruptState').status, 'fail');
  assert.equal(resultOff.checks.find(c => c.name === 'noCorruptState').status, 'fail');
  assert.ok(resultOn.checks.find(c => c.name === 'noCorruptState').detail.includes('negative-balance'));
});

test('Corrupt state: null ledger entry detected regardless of flags', () => {
  const state = buildHealthyState();
  state.economy.ledger.push(null); // Corruption

  const result = deriveReadinessChecks(state, allFlagsOn());

  assert.equal(result.checks.find(c => c.name === 'noCorruptState').status, 'fail');
  assert.ok(result.checks.find(c => c.name === 'noCorruptState').detail.includes('null-ledger-entry'));
});

test('Corrupt state: malformed monster entry detected', () => {
  const state = buildHealthyState();
  state.heroPool.monsters['monster-corrupt'] = null; // Corruption

  const result = deriveReadinessChecks(state, allFlagsOn());

  assert.equal(result.checks.find(c => c.name === 'noCorruptState').status, 'fail');
  assert.ok(result.checks.find(c => c.name === 'noCorruptState').detail.includes('corrupt-monster:monster-corrupt'));
});

// ═══════════════════════════════════════════════════════════════════════
// ── Forbidden vocabulary boundary scan ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('This test file contains no forbidden pressure/gambling vocabulary', () => {
  const thisSource = fs.readFileSync(__filename, 'utf8');

  // Strip the vocabulary definition imports and this test's own assertion strings
  // by removing lines that reference the HERO_FORBIDDEN_VOCABULARY constant itself
  const lines = thisSource.split('\n');
  const filteredLines = lines.filter(line => {
    // Keep all lines except the ones that define/reference the forbidden list
    return !line.includes('HERO_FORBIDDEN_VOCABULARY') &&
           !line.includes('HERO_FORBIDDEN_PRESSURE_VOCABULARY') &&
           !line.includes('forbiddenWord') &&
           !line.includes('assert.fail(');
  });
  const sourceToScan = filteredLines.join('\n').toLowerCase();

  for (const forbiddenWord of HERO_FORBIDDEN_VOCABULARY) {
    const lower = forbiddenWord.toLowerCase();
    if (sourceToScan.includes(lower)) {
      assert.fail(
        `Forbidden vocabulary "${forbiddenWord}" found in test file string constants`
      );
    }
  }
});
