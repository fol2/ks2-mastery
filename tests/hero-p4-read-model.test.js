// Hero Mode P4 U5 — Read model v5 with child-safe economy fields.
//
// Tests verify that the read model correctly evolves to v5 when economy
// is enabled, exposes child-safe economy fields, handles edge cases
// gracefully, and preserves v4 behaviour when economy is disabled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { normaliseHeroProgressState, emptyProgressState } from '../shared/hero/progress-state.js';
import { HERO_DAILY_COMPLETION_COINS, HERO_ECONOMY_VERSION } from '../shared/hero/economy.js';

// ── Fixture helpers ───────────────────────────────────────────────────

const BASE_ENV = {
  HERO_MODE_SHADOW_ENABLED: 'true',
  HERO_MODE_LAUNCH_ENABLED: 'true',
  HERO_MODE_CHILD_UI_ENABLED: 'true',
};

const PROGRESS_ENV = {
  ...BASE_ENV,
  HERO_MODE_PROGRESS_ENABLED: 'true',
};

const ECONOMY_ENV = {
  ...PROGRESS_ENV,
  HERO_MODE_ECONOMY_ENABLED: 'true',
};

const SPELLING_DATA = {
  stats: {
    core: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
    all: { total: 50, secure: 30, due: 10, fresh: 5, trouble: 5, attempts: 200, correct: 160, accuracy: 0.8 },
  },
};

const PUNCTUATION_DATA = {
  availability: { status: 'ready' },
  stats: { total: 20, secure: 8, due: 5, fresh: 3, weak: 2, attempts: 100, correct: 75, accuracy: 75 },
};

function makeSubjectReadModels() {
  return {
    spelling: { data: SPELLING_DATA, ui: {} },
    punctuation: { data: PUNCTUATION_DATA, ui: {} },
  };
}

function buildV4(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: PROGRESS_ENV,
    progressEnabled: true,
    economyEnabled: false,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

function buildV5(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: ECONOMY_ENV,
    progressEnabled: true,
    economyEnabled: true,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

function buildProgressState(model, overrides = {}) {
  const daily = model.dailyQuest;
  const tasks = {};
  const taskOrder = [];
  for (const task of daily.tasks) {
    taskOrder.push(task.taskId);
    tasks[task.taskId] = {
      taskId: task.taskId,
      questId: daily.questId,
      questFingerprint: model.questFingerprint,
      dateKey: model.dateKey,
      subjectId: task.subjectId,
      intent: task.intent,
      launcher: task.launcher,
      effortTarget: task.effortTarget || 0,
      status: 'planned',
      launchRequestId: null,
      claimRequestId: null,
      startedAt: null,
      completedAt: null,
      subjectPracticeSessionId: null,
      evidence: null,
      ...((overrides.taskOverrides || {})[task.taskId] || {}),
    };
  }
  return normaliseHeroProgressState({
    version: 1,
    daily: {
      dateKey: model.dateKey,
      timezone: model.timezone,
      questId: daily.questId,
      questFingerprint: model.questFingerprint,
      schedulerVersion: model.schedulerVersion,
      status: overrides.dailyStatus || 'active',
      effortTarget: daily.effortTarget,
      effortPlanned: daily.effortPlanned,
      effortCompleted: overrides.effortCompleted || 0,
      taskOrder,
      completedTaskIds: overrides.completedTaskIds || [],
      tasks,
      generatedAt: Date.now() - 10000,
      firstStartedAt: overrides.firstStartedAt || null,
      completedAt: overrides.completedAt || null,
      lastUpdatedAt: Date.now(),
    },
    recentClaims: [],
  });
}

// ── V5 shape: economy enabled ─────────────────────────────────────────

test('economy enabled → version 5, economy block present with correct balance', () => {
  const model = buildV5();

  assert.equal(model.version, 5);
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy, 'economy block must be present');
  assert.equal(model.economy.enabled, true);
  assert.equal(model.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(model.economy.balance, 0);
  assert.equal(model.economy.lifetimeEarned, 0);
  assert.equal(model.economy.lifetimeSpent, 0);
});

test('economy enabled with balance → economy.balance reflects persisted state', () => {
  const baseModel = buildV5();
  const progressState = buildProgressState(baseModel, {
    dailyStatus: 'completed',
    completedAt: Date.now() - 5000,
  });

  // Add economy state to progress
  progressState.economy = {
    version: 1,
    balance: 300,
    lifetimeEarned: 500,
    lifetimeSpent: 200,
    ledger: [
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-27', createdAt: Date.now() - 172800000 },
      { entryId: 'e2', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-28', createdAt: Date.now() - 86400000 },
      { entryId: 'e3', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-29', createdAt: Date.now() - 1000 },
    ],
    lastUpdatedAt: Date.now() - 1000,
  };

  const model = buildV5({ heroProgressState: progressState });

  assert.equal(model.economy.balance, 300);
  assert.equal(model.economy.lifetimeEarned, 500);
  assert.equal(model.economy.lifetimeSpent, 200);
  assert.equal(model.economy.recentLedger.length, 3);
});

// ── V4 shape: economy disabled ────────────────────────────────────────

test('economy disabled → version 4, coinsEnabled: false, no economy block', () => {
  const model = buildV4();

  assert.equal(model.version, 4);
  assert.equal(model.coinsEnabled, false);
  assert.equal('economy' in model, false, 'No economy block in v4');
});

test('economy disabled still returns all v4 fields', () => {
  const model = buildV4();

  assert.equal(model.mode, 'progress');
  assert.ok(model.progress);
  assert.ok(model.claim);
  assert.ok(model.launch);
  assert.equal(model.writesEnabled, true);
});

// ── today.awardStatus scenarios ───────────────────────────────────────

test('today.awardStatus = awarded after daily completion with coins', () => {
  const baseModel = buildV5();
  const tasks = baseModel.dailyQuest.tasks;
  const taskOverrides = {};
  const completedIds = [];

  for (const task of tasks) {
    taskOverrides[task.taskId] = {
      status: 'completed',
      completedAt: Date.now() - 5000,
      claimRequestId: `claim-${task.taskId}`,
    };
    completedIds.push(task.taskId);
  }

  const progressState = buildProgressState(baseModel, {
    taskOverrides,
    completedTaskIds: completedIds,
    dailyStatus: 'completed',
    completedAt: Date.now() - 1000,
  });

  // Add economy with awarded status
  progressState.economy = {
    version: 1,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'award-1', type: 'daily-completion-award', amount: 100, dateKey: baseModel.dateKey, createdAt: Date.now() - 500 },
    ],
    lastUpdatedAt: Date.now() - 500,
  };

  // Mark daily economy as awarded
  progressState.daily.economy = {
    dailyAwardStatus: 'awarded',
    dailyAwardCoinsAvailable: HERO_DAILY_COMPLETION_COINS,
    dailyAwardCoinsAwarded: HERO_DAILY_COMPLETION_COINS,
    dailyAwardLedgerEntryId: 'award-1',
    dailyAwardedAt: Date.now() - 500,
    dailyAwardReason: 'daily-completion',
  };

  const model = buildV5({ heroProgressState: progressState });

  assert.equal(model.economy.today.awardStatus, 'awarded');
  assert.equal(model.economy.today.coinsAwarded, HERO_DAILY_COMPLETION_COINS);
  assert.equal(model.economy.today.ledgerEntryId, 'award-1');
  assert.ok(model.economy.today.awardedAt > 0);
});

test('today.awardStatus = available before daily coin award', () => {
  const baseModel = buildV5();
  const progressState = buildProgressState(baseModel, {
    dailyStatus: 'active',
  });

  // Add economy state (no daily award yet)
  progressState.economy = {
    version: 1,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    ledger: [],
    lastUpdatedAt: null,
  };

  const model = buildV5({ heroProgressState: progressState });

  assert.equal(model.economy.today.awardStatus, 'in-progress');
  assert.equal(model.economy.today.coinsAwarded, 0);
  assert.equal(model.economy.today.ledgerEntryId, null);
  assert.equal(model.economy.today.awardedAt, null);
});

test('today.awardStatus = not-eligible when no daily state', () => {
  const model = buildV5({ heroProgressState: null });

  assert.equal(model.economy.today.awardStatus, 'not-eligible');
});

// ── Economy state persists but hidden when flag off ────────────────────

test('economy state persists internally but hidden when flag off', () => {
  const baseModel = buildV4();
  const progressState = buildProgressState(baseModel);

  // Learner has earned coins previously but flag is now off
  progressState.economy = {
    version: 1,
    balance: 500,
    lifetimeEarned: 500,
    lifetimeSpent: 0,
    ledger: [
      { entryId: 'e1', type: 'daily-completion-award', amount: 100, dateKey: '2026-04-25', createdAt: Date.now() - 400000 },
    ],
    lastUpdatedAt: Date.now() - 400000,
  };

  const model = buildV4({ heroProgressState: progressState });

  assert.equal(model.version, 4);
  assert.equal(model.coinsEnabled, false);
  assert.equal('economy' in model, false, 'Economy block hidden when flag off');
});

// ── Malformed economy state ───────────────────────────────────────────

test('malformed economy state does not crash read-model assembly', () => {
  const baseModel = buildV5();
  const progressState = buildProgressState(baseModel);

  // Malformed economy: wrong types everywhere
  progressState.economy = {
    version: 'not-a-number',
    balance: 'invalid',
    lifetimeEarned: null,
    lifetimeSpent: undefined,
    ledger: 'not-an-array',
    lastUpdatedAt: {},
  };

  // Must not throw
  const model = buildV5({ heroProgressState: progressState });
  assert.equal(model.version, 5);
  assert.ok(model.economy);
  // Graceful defaults from selectChildSafeEconomyReadModel's || guards
  assert.equal(model.economy.balance, 0);
  assert.equal(model.economy.lifetimeEarned, 0);
  assert.equal(model.economy.lifetimeSpent, 0);
  assert.deepEqual(model.economy.recentLedger, []);
});

test('null heroProgressState with economy enabled → safe default economy block', () => {
  const model = buildV5({ heroProgressState: null });

  assert.equal(model.version, 5);
  assert.equal(model.coinsEnabled, true);
  assert.ok(model.economy);
  assert.equal(model.economy.balance, 0);
  assert.equal(model.economy.lifetimeEarned, 0);
  assert.equal(model.economy.lifetimeSpent, 0);
  assert.deepEqual(model.economy.recentLedger, []);
  assert.equal(model.economy.today.awardStatus, 'not-eligible');
});

// ── Child-safe ledger filtering ───────────────────────────────────────

test('child-safe ledger excludes source details (only entryId, type, amount, dateKey, createdAt)', () => {
  const baseModel = buildV5();
  const progressState = buildProgressState(baseModel);

  progressState.economy = {
    version: 1,
    balance: 100,
    lifetimeEarned: 100,
    lifetimeSpent: 0,
    ledger: [{
      entryId: 'ledger-1',
      idempotencyKey: 'hero-daily-coins:v1:learner-1:2026-04-29:quest-1:fp-1',
      type: 'daily-completion-award',
      amount: 100,
      balanceAfter: 100,
      learnerId: 'learner-1',
      dateKey: '2026-04-29',
      questId: 'quest-1',
      questFingerprint: 'fp-1',
      source: {
        kind: 'hero-daily-completion',
        dailyCompletedAt: Date.now() - 5000,
        completedTaskIds: ['t1', 't2'],
        effortCompleted: 12,
        effortPlanned: 12,
      },
      createdAt: Date.now() - 1000,
      createdBy: 'system',
    }],
    lastUpdatedAt: Date.now() - 1000,
  };

  const model = buildV5({ heroProgressState: progressState });
  const entry = model.economy.recentLedger[0];

  assert.ok(entry, 'Should have one ledger entry');
  // Allowed fields
  assert.equal(entry.entryId, 'ledger-1');
  assert.equal(entry.type, 'daily-completion-award');
  assert.equal(entry.amount, 100);
  assert.equal(entry.dateKey, '2026-04-29');
  assert.ok(entry.createdAt > 0);

  // Disallowed fields must NOT be present
  assert.equal('idempotencyKey' in entry, false, 'idempotencyKey must be excluded');
  assert.equal('balanceAfter' in entry, false, 'balanceAfter must be excluded');
  assert.equal('learnerId' in entry, false, 'learnerId must be excluded');
  assert.equal('questId' in entry, false, 'questId must be excluded');
  assert.equal('questFingerprint' in entry, false, 'questFingerprint must be excluded');
  assert.equal('source' in entry, false, 'source details must be excluded');
  assert.equal('createdBy' in entry, false, 'createdBy must be excluded');
});

test('child-safe ledger capped at 10 entries for display', () => {
  const baseModel = buildV5();
  const progressState = buildProgressState(baseModel);

  const ledger = [];
  for (let i = 0; i < 20; i++) {
    ledger.push({
      entryId: `entry-${i}`,
      type: 'daily-completion-award',
      amount: 100,
      dateKey: `2026-04-${String(10 + i).padStart(2, '0')}`,
      createdAt: Date.now() - (20 - i) * 86400000,
      // Extra fields that should be stripped
      idempotencyKey: `key-${i}`,
      source: { kind: 'hero-daily-completion' },
    });
  }

  progressState.economy = {
    version: 1,
    balance: 2000,
    lifetimeEarned: 2000,
    lifetimeSpent: 0,
    ledger,
    lastUpdatedAt: Date.now(),
  };

  const model = buildV5({ heroProgressState: progressState });

  assert.equal(model.economy.recentLedger.length, 10, 'Max 10 entries');
  // Should be the last 10 entries (most recent)
  assert.equal(model.economy.recentLedger[0].entryId, 'entry-10');
  assert.equal(model.economy.recentLedger[9].entryId, 'entry-19');
});

// ── V5 retains all v4 structural fields ───────────────────────────────

test('v5 retains all v4 structural fields', () => {
  const model = buildV5();

  assert.equal(model.mode, 'progress');
  assert.equal(model.writesEnabled, true);
  assert.ok(model.dateKey);
  assert.ok(model.timezone);
  assert.ok(model.schedulerVersion);
  assert.ok(model.questFingerprint);
  assert.ok(Array.isArray(model.eligibleSubjects));
  assert.ok(Array.isArray(model.lockedSubjects));
  assert.ok(model.dailyQuest);
  assert.ok(model.progress);
  assert.ok(model.launch);
  assert.ok(model.claim);
  assert.ok(model.ui);
  assert.ok('activeHeroSession' in model);
  assert.ok('pendingCompletedHeroSession' in model);
  assert.ok('debug' in model);
});

// ── Economy today block shape ─────────────────────────────────────────

test('economy today block has correct shape', () => {
  const model = buildV5();
  const today = model.economy.today;

  assert.ok('dateKey' in today);
  assert.ok('questId' in today);
  assert.ok('awardStatus' in today);
  assert.ok('coinsAvailable' in today);
  assert.ok('coinsAwarded' in today);
  assert.ok('ledgerEntryId' in today);
  assert.ok('awardedAt' in today);
  assert.equal(today.coinsAvailable, HERO_DAILY_COMPLETION_COINS);
  assert.equal(today.dateKey, model.dateKey);
  assert.equal(today.questId, model.dailyQuest.questId);
});

// ── Flag hierarchy: economy requires progress ─────────────────────────

test('economy enabled but progress disabled → v3 without economy', () => {
  const model = buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: { ...BASE_ENV, HERO_MODE_PROGRESS_ENABLED: 'false', HERO_MODE_ECONOMY_ENABLED: 'true' },
    progressEnabled: false,
    economyEnabled: false, // route layer enforces: progressFlagEnabled && economyFlagEnabled
    heroProgressState: null,
    recentCompletedSessions: [],
  });

  assert.equal(model.version, 3);
  assert.equal('economy' in model, false);
});
