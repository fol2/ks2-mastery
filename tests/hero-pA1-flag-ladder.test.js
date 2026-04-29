// Hero Mode pA1 U3 — Flag Ladder Validation.
//
// Proves the full 6-flag enable/disable/rollback sequence in local/dev
// with seeded fixtures covering all critical learner states.
//
// Flag hierarchy (strict bottom-up enable):
//   HERO_MODE_SHADOW_ENABLED
//   -> HERO_MODE_LAUNCH_ENABLED
//   -> HERO_MODE_CHILD_UI_ENABLED
//   -> HERO_MODE_PROGRESS_ENABLED
//   -> HERO_MODE_ECONOMY_ENABLED
//   -> HERO_MODE_CAMP_ENABLED

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { deriveReadinessChecks } from '../worker/src/hero/readiness.js';
import { normaliseHeroProgressState } from '../shared/hero/progress-state.js';
import { HERO_MONSTER_INVITE_COST } from '../shared/hero/hero-pool.js';

import {
  readySubjectsOnly,
  completedDailyQuest,
  lowBalance,
  sufficientBalance,
  staleRequest,
  duplicateRequest,
} from './fixtures/hero-pA1-seeded-learners.js';

// ── Env helpers ──────────────────────────────────────────────────────

function envShadowOnly() {
  return { HERO_MODE_SHADOW_ENABLED: 'true' };
}

function envShadowAndLaunch() {
  return {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
  };
}

function envUpToChildUI() {
  return {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
  };
}

function envUpToProgress() {
  return {
    ...envUpToChildUI(),
    HERO_MODE_PROGRESS_ENABLED: 'true',
  };
}

function envUpToEconomy() {
  return {
    ...envUpToProgress(),
    HERO_MODE_ECONOMY_ENABLED: 'true',
  };
}

function envAllFlags() {
  return {
    ...envUpToEconomy(),
    HERO_MODE_CAMP_ENABLED: 'true',
  };
}

function envNone() {
  return {};
}

// ── Build helpers ────────────────────────────────────────────────────

function buildModel(envFn, overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-pA1-u3',
    accountId: 'account-pA1-u3',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envFn(),
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// ── A) Enable sequence (bottom-up) ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('A1: Shadow only -> version 3, mode shadow', () => {
  const model = buildModel(envShadowOnly);

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.childVisible, false);
  assert.equal(model.coinsEnabled, false);
  assert.equal(model.writesEnabled, false);
});

test('A2: Shadow + Launch -> version 3, launch enabled', () => {
  const model = buildModel(envShadowAndLaunch);

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.launch.enabled, true);
  assert.equal(model.launch.commandRoute, '/api/hero/command');
});

test('A3: + Child UI -> childVisible true', () => {
  const model = buildModel(envUpToChildUI);

  assert.equal(model.version, 3);
  assert.equal(model.childVisible, true);
  assert.equal(model.ui.enabled, true);
  assert.equal(model.ui.reason, 'enabled');
});

test('A4: + Progress -> version 4, mode progress', () => {
  const model = buildModel(envUpToProgress, {
    progressEnabled: true,
  });

  assert.equal(model.version, 4);
  assert.equal(model.mode, 'progress');
  assert.equal(model.writesEnabled, true);
  assert.ok(model.progress);
  assert.equal(model.progress.enabled, true);
  assert.ok(model.claim);
  assert.equal(model.claim.enabled, true);
});

test('A5: + Economy -> version 5, coinsEnabled true', () => {
  const model = buildModel(envUpToEconomy, {
    progressEnabled: true,
    economyEnabled: true,
  });

  assert.equal(model.version, 5);
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy);
  assert.equal(model.economy.enabled, true);
  assert.equal(model.economy.balance, 0);
});

test('A6: + Camp -> version 6, camp block present', () => {
  const model = buildModel(envAllFlags, {
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
  });

  assert.equal(model.version, 6);
  assert.ok(model.camp);
  assert.equal(model.camp.enabled, true);
  assert.equal(model.camp.monsters.length, 6);
});

// ═══════════════════════════════════════════════════════════════════════
// ── B) Disable sequence (top-down) ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('B1: Disable Camp -> economy still works, no camp block', () => {
  const model = buildModel(envUpToEconomy, {
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: false,
  });

  assert.equal(model.version, 5);
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy);
  assert.equal('camp' in model, false);
});

test('B2: Disable Economy -> progress still works, no coins', () => {
  const model = buildModel(envUpToProgress, {
    progressEnabled: true,
    economyEnabled: false,
  });

  assert.equal(model.version, 4);
  assert.equal(model.coinsEnabled, false);
  assert.equal('economy' in model, false);
  assert.ok(model.progress);
  assert.equal(model.progress.enabled, true);
});

test('B3: Disable Progress -> version 3 shadow mode', () => {
  const model = buildModel(envUpToChildUI, {
    progressEnabled: false,
  });

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.writesEnabled, false);
  assert.equal('progress' in model, false);
  assert.equal('claim' in model, false);
});

test('B4: Disable Child UI -> UI not visible', () => {
  const model = buildModel(envShadowAndLaunch);

  assert.equal(model.childVisible, false);
  assert.equal(model.ui.enabled, false);
  assert.equal(model.ui.reason, 'child-ui-disabled');
});

test('B5: Disable Launch -> commands not launchable', () => {
  const model = buildModel(envShadowOnly);

  assert.equal(model.launch.enabled, false);
  assert.equal(model.ui.reason, 'launch-disabled');
});

test('B6: Disable Shadow -> read model reports shadow-disabled', () => {
  const model = buildModel(envNone);

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.ui.enabled, false);
  assert.equal(model.ui.reason, 'shadow-disabled');
  assert.equal(model.launch.enabled, false);
  assert.equal(model.childVisible, false);
});

// ═══════════════════════════════════════════════════════════════════════
// ── C) Misconfigured combinations ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('C1: Economy without Progress -> readiness reports hierarchy violation', () => {
  const state = normaliseHeroProgressState(sufficientBalance());
  const flags = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'false',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'false',
  };

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_PROGRESS_ENABLED'));
});

test('C2: Camp without Economy -> readiness reports hierarchy violation', () => {
  const state = normaliseHeroProgressState(sufficientBalance());
  const flags = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'false',
    HERO_MODE_CAMP_ENABLED: 'true',
  };

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_ECONOMY_ENABLED'));
});

test('C3: Child UI without Launch -> readiness reports hierarchy violation', () => {
  const state = normaliseHeroProgressState(sufficientBalance());
  const flags = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'false',
    HERO_MODE_CHILD_UI_ENABLED: 'true',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_LAUNCH_ENABLED'));
});

test('C4: Progress without Child UI -> readiness reports hierarchy violation', () => {
  const state = normaliseHeroProgressState(sufficientBalance());
  const flags = {
    HERO_MODE_SHADOW_ENABLED: 'true',
    HERO_MODE_LAUNCH_ENABLED: 'true',
    HERO_MODE_CHILD_UI_ENABLED: 'false',
    HERO_MODE_PROGRESS_ENABLED: 'true',
    HERO_MODE_ECONOMY_ENABLED: 'true',
    HERO_MODE_CAMP_ENABLED: 'true',
  };

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'not_ready');
  const flagCheck = result.checks.find(c => c.name === 'flagsConfigured');
  assert.equal(flagCheck.status, 'fail');
  assert.ok(flagCheck.detail.includes('HERO_MODE_CHILD_UI_ENABLED'));
});

test('C5: Camp enabled but economy disabled in read-model -> camp shows enabled:false marker', () => {
  // Tests the read-model behaviour (not readiness) when flag mismatch occurs at runtime
  const model = buildModel(envUpToProgress, {
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: true,
  });

  assert.equal(model.version, 4);
  assert.ok(model.camp);
  assert.equal(model.camp.enabled, false);
  assert.equal(Object.keys(model.camp).length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// ── D) Rollback state preservation ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('D1: Enable all, earn coins, unlock monster -> disable all -> re-enable -> balance and monsters intact', () => {
  // Simulate: learner has earned coins and unlocked a monster
  const stateWithProgress = normaliseHeroProgressState(completedDailyQuest());

  // Phase 1: All enabled — check economy + camp data visible
  const modelOn = buildHeroShadowReadModel({
    learnerId: 'learner-d1',
    accountId: 'account-d1',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: stateWithProgress,
    recentCompletedSessions: [],
  });

  assert.equal(modelOn.version, 6);
  assert.equal(modelOn.economy.balance, 300);
  const glossbloom = modelOn.camp.monsters.find(m => m.monsterId === 'glossbloom');
  assert.equal(glossbloom.owned, true);
  assert.equal(glossbloom.stage, 1);

  // Phase 2: All disabled — same state passed, no economy/camp exposed
  const modelOff = buildHeroShadowReadModel({
    learnerId: 'learner-d1',
    accountId: 'account-d1',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envNone(),
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: stateWithProgress,
    recentCompletedSessions: [],
  });

  assert.equal(modelOff.version, 3);
  assert.equal(modelOff.mode, 'shadow');
  assert.equal('economy' in modelOff, false);
  assert.equal('camp' in modelOff, false);

  // Phase 3: Re-enable all — same state, everything back
  const modelReEnabled = buildHeroShadowReadModel({
    learnerId: 'learner-d1',
    accountId: 'account-d1',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: stateWithProgress,
    recentCompletedSessions: [],
  });

  assert.equal(modelReEnabled.version, 6);
  assert.equal(modelReEnabled.economy.balance, 300);
  const glossbloomAfter = modelReEnabled.camp.monsters.find(m => m.monsterId === 'glossbloom');
  assert.equal(glossbloomAfter.owned, true);
  assert.equal(glossbloomAfter.stage, 1);
  assert.equal(glossbloomAfter.branch, 'b1');
});

test('D2: Enable all, start quest, claim task -> disable -> re-enable -> completed tasks preserved', () => {
  const stateWithClaim = normaliseHeroProgressState(duplicateRequest());

  // Phase 1: progress visible with completed task
  const modelOn = buildHeroShadowReadModel({
    learnerId: 'learner-d2',
    accountId: 'account-d2',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envUpToProgress(),
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: stateWithClaim,
    recentCompletedSessions: [],
  });

  assert.equal(modelOn.version, 4);
  assert.equal(modelOn.mode, 'progress');

  // Phase 2: All disabled (state dormant)
  const modelOff = buildHeroShadowReadModel({
    learnerId: 'learner-d2',
    accountId: 'account-d2',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envNone(),
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: stateWithClaim,
    recentCompletedSessions: [],
  });

  assert.equal(modelOff.version, 3);
  assert.equal(modelOff.mode, 'shadow');

  // Phase 3: Re-enable — state still has the completed task
  const modelBack = buildHeroShadowReadModel({
    learnerId: 'learner-d2',
    accountId: 'account-d2',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envUpToProgress(),
    progressEnabled: true,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: stateWithClaim,
    recentCompletedSessions: [],
  });

  assert.equal(modelBack.version, 4);
  assert.equal(modelBack.mode, 'progress');
  // The re-enabled output model exposes the completed task data
  assert.equal(modelBack.progress.enabled, true);
  assert.equal(modelBack.progress.effortCompleted, 6);
  assert.ok(modelBack.progress.completedTaskIds.length > 0,
    'Re-enabled model must expose completed task IDs');
  // Verify dailyQuest tasks reflect the completed task with correct status
  const completedTask = modelBack.dailyQuest.tasks.find(
    t => t.completionStatus === 'completed');
  assert.ok(completedTask, 'Re-enabled model must contain a completed task');
  assert.equal(completedTask.effortCompleted, 6);
});

test('D3: CAS revision preserved across rollback', () => {
  const stateWithCas = staleRequest();

  // Verify the CAS field exists before any read-model assembly
  assert.equal(stateWithCas._cas, 'rev-00042');

  // Normalise (this simulates what the DB layer returns)
  const normalised = normaliseHeroProgressState(stateWithCas);

  // Build model with all flags, then disabled, then re-enabled
  const params = {
    learnerId: 'learner-d3',
    accountId: 'account-d3',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: normalised,
    recentCompletedSessions: [],
  };

  const modelOn = buildHeroShadowReadModel(params);
  assert.equal(modelOn.version, 6);

  // Disable all
  const modelOff = buildHeroShadowReadModel({
    ...params,
    env: envNone(),
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
  });
  assert.equal(modelOff.version, 3);

  // The underlying state object is unmodified by the read-model assembly
  // (read-model is pure read-only, never mutates state)
  assert.equal(normalised.daily.questId, 'quest-stale-test');
  assert.equal(normalised.daily.status, 'active');
  assert.equal(normalised.economy.balance, 100);
});

test('D4: Readiness checks show same state health before and after rollback', () => {
  const state = normaliseHeroProgressState(completedDailyQuest());
  const allOn = envAllFlags();
  const allOff = envNone();

  const beforeResult = deriveReadinessChecks(state, allOn);
  assert.equal(beforeResult.overall, 'ready');

  // Rollback
  const rollbackResult = deriveReadinessChecks(state, allOff);
  assert.equal(rollbackResult.overall, 'not_ready');
  // State health checks pass even with flags off
  assert.equal(rollbackResult.checks.find(c => c.name === 'economyHealthy').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'campHealthy').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'stateValid').status, 'pass');
  assert.equal(rollbackResult.checks.find(c => c.name === 'noCorruptState').status, 'pass');

  // Re-enable
  const afterResult = deriveReadinessChecks(state, allOn);
  assert.equal(afterResult.overall, 'ready');

  // Check-by-check equality
  for (let i = 0; i < beforeResult.checks.length; i++) {
    assert.deepEqual(beforeResult.checks[i], afterResult.checks[i],
      `Check '${beforeResult.checks[i].name}' differs after rollback round-trip`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── E) Edge cases ───────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════

test('E1: All subjects locked -> shadow still builds, UI shows no-eligible-subjects', () => {
  // Provide no ready subjects (empty read models)
  const model = buildHeroShadowReadModel({
    learnerId: 'learner-e1',
    accountId: 'account-e1',
    subjectReadModels: {},
    now: Date.now(),
    env: envUpToChildUI(),
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: null,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.ui.reason, 'no-eligible-subjects');
  assert.equal(model.ui.enabled, false);
  assert.ok(Array.isArray(model.eligibleSubjects));
  assert.equal(model.eligibleSubjects.length, 0);
});

test('E2: Empty state (first-time learner) -> safe defaults', () => {
  const model = buildHeroShadowReadModel({
    learnerId: 'learner-e2',
    accountId: 'account-e2',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: null,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 6);
  assert.equal(model.economy.balance, 0);
  assert.equal(model.economy.lifetimeEarned, 0);
  assert.ok(model.camp);
  assert.equal(model.camp.enabled, true);
  // All monsters unowned
  for (const m of model.camp.monsters) {
    assert.equal(m.owned, false);
    assert.equal(m.stage, 0);
  }
});

test('E3: Corrupted/missing state -> normaliser recovers gracefully', () => {
  // Completely invalid input
  const recovered = normaliseHeroProgressState('not-an-object');
  assert.equal(recovered.version, 3);
  assert.equal(recovered.daily, null);
  assert.deepEqual(recovered.recentClaims, []);
  assert.equal(recovered.economy.balance, 0);
  assert.deepEqual(recovered.heroPool.monsters, {});

  // Null input
  const recoveredNull = normaliseHeroProgressState(null);
  assert.equal(recoveredNull.version, 3);
  assert.equal(recoveredNull.daily, null);

  // Undefined input
  const recoveredUndef = normaliseHeroProgressState(undefined);
  assert.equal(recoveredUndef.version, 3);

  // Partial garbage
  const recoveredPartial = normaliseHeroProgressState({ version: 99, daily: 'garbage', economy: null });
  assert.equal(recoveredPartial.version, 3);
  assert.equal(recoveredPartial.daily, null);
  assert.equal(recoveredPartial.economy.balance, 0);
});

test('E4: Low balance learner -> camp shows canAffordInvite false', () => {
  const state = normaliseHeroProgressState(lowBalance());

  const model = buildHeroShadowReadModel({
    learnerId: 'learner-e4',
    accountId: 'account-e4',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: state,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 6);
  assert.equal(model.economy.balance, 50);
  // All unowned monsters should be canAffordInvite: false (50 < 150)
  const unowned = model.camp.monsters.filter(m => !m.owned);
  for (const m of unowned) {
    assert.equal(m.canAffordInvite, false,
      `${m.monsterId} should not be affordable with balance 50`);
  }
  // Owned monster (loomrill) should be present
  const loomrill = model.camp.monsters.find(m => m.monsterId === 'loomrill');
  assert.equal(loomrill.owned, true);
  assert.equal(loomrill.stage, 0);
});

test('E5: Sufficient balance learner -> camp shows canAffordInvite true', () => {
  const state = normaliseHeroProgressState(sufficientBalance());

  const model = buildHeroShadowReadModel({
    learnerId: 'learner-e5',
    accountId: 'account-e5',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: state,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 6);
  assert.equal(model.economy.balance, 500);
  // All unowned monsters should be canAffordInvite: true (500 >= 150)
  const unowned = model.camp.monsters.filter(m => !m.owned);
  assert.ok(unowned.length > 0);
  for (const m of unowned) {
    assert.equal(m.canAffordInvite, true,
      `${m.monsterId} should be affordable with balance 500`);
  }
});

test('E6: Stale CAS fixture preserves state shape through normalisation', () => {
  const raw = staleRequest();
  const normalised = normaliseHeroProgressState(raw);

  // Normaliser preserves daily structure
  assert.equal(normalised.version, 3);
  assert.equal(normalised.daily.questId, 'quest-stale-test');
  assert.equal(normalised.daily.status, 'active');
  assert.equal(normalised.daily.effortCompleted, 0);
  assert.equal(Object.keys(normalised.daily.tasks).length, 2);
  assert.equal(normalised.economy.balance, 100);
});

test('E7: Duplicate request fixture preserves claim history through normalisation', () => {
  const raw = duplicateRequest();
  const normalised = normaliseHeroProgressState(raw);

  // Check completed task and claim preserved
  assert.equal(normalised.daily.tasks.t1.status, 'completed');
  assert.equal(normalised.daily.tasks.t1.claimRequestId, 'req-already-processed');
  assert.equal(normalised.daily.tasks.t2.status, 'started');
  assert.equal(normalised.recentClaims.length, 1);
  assert.equal(normalised.recentClaims[0].claimId, 'req-already-processed');
});

test('E8: Read model assembly is pure (does not mutate input state)', () => {
  const state = normaliseHeroProgressState(completedDailyQuest());
  const stateBefore = JSON.stringify(state);

  // Build model with all flags
  buildHeroShadowReadModel({
    learnerId: 'learner-e8',
    accountId: 'account-e8',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: envAllFlags(),
    progressEnabled: true,
    economyEnabled: true,
    campEnabled: true,
    heroProgressState: state,
    recentCompletedSessions: [],
  });

  const stateAfter = JSON.stringify(state);
  assert.equal(stateBefore, stateAfter, 'Read model must not mutate input state');
});

test('E9: No env bindings at all -> graceful shadow-disabled (not crash)', () => {
  const model = buildHeroShadowReadModel({
    learnerId: 'learner-e9',
    accountId: 'account-e9',
    subjectReadModels: readySubjectsOnly(),
    now: Date.now(),
    env: undefined,
    progressEnabled: false,
    economyEnabled: false,
    campEnabled: false,
    heroProgressState: null,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 3);
  assert.equal(model.ui.reason, 'shadow-disabled');
});

test('E10: Completed quest with all flags -> readiness passes (full stack healthy)', () => {
  const state = normaliseHeroProgressState(completedDailyQuest());
  const flags = envAllFlags();

  const result = deriveReadinessChecks(state, flags);

  assert.equal(result.overall, 'ready');
  for (const check of result.checks) {
    assert.equal(check.status, 'pass',
      `Check '${check.name}' expected pass, got ${check.status}: ${check.detail}`);
  }
});
