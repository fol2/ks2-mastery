import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_PROGRESS_VERSION,
  HERO_POOL_STATE_VERSION,
  HERO_POOL_ROSTER_VERSION,
  MAX_RECENT_CLAIMS_AGE_DAYS,
  emptyProgressState,
  emptyHeroPoolState,
  normaliseHeroProgressState,
  initialiseDailyProgress,
  applyClaimToProgress,
  pruneRecentClaims,
  markTaskStarted,
} from '../shared/hero/progress-state.js';

import { HERO_ECONOMY_VERSION, emptyEconomyState } from '../shared/hero/economy.js';

// ── normaliseHeroProgressState ────────────────────────────────────

test('normaliseHeroProgressState with null returns empty v3 state', () => {
  const result = normaliseHeroProgressState(null);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.deepEqual(result.economy.ledger, []);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('normaliseHeroProgressState with undefined returns empty v3 state', () => {
  const result = normaliseHeroProgressState(undefined);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('normaliseHeroProgressState v1 state migrates to v3 preserving daily and recentClaims', () => {
  const input = {
    version: 1,
    daily: {
      dateKey: '2026-04-28',
      questId: 'quest-abc',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 18,
      effortPlanned: 12,
      effortCompleted: 6,
      taskOrder: ['t1', 't2'],
      completedTaskIds: ['t1'],
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 6 },
        t2: { taskId: 't2', status: 'planned', effortTarget: 6 },
      },
      generatedAt: 1000,
      firstStartedAt: 1001,
      completedAt: null,
      lastUpdatedAt: 1002,
    },
    recentClaims: [{ claimId: 'c1', createdAt: 999 }],
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.dateKey, '2026-04-28');
  assert.equal(result.daily.questId, 'quest-abc');
  assert.equal(result.daily.tasks.t1.status, 'completed');
  assert.equal(result.daily.tasks.t2.status, 'planned');
  assert.deepEqual(result.recentClaims, [{ claimId: 'c1', createdAt: 999 }]);
  // Economy must be empty (v1 had no economy)
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.economy.lifetimeEarned, 0);
  assert.equal(result.economy.lifetimeSpent, 0);
  assert.deepEqual(result.economy.ledger, []);
  assert.equal(result.economy.lastUpdatedAt, null);
  // heroPool must be empty (v1 had no heroPool)
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('normaliseHeroProgressState v2 state with existing economy migrates to v3', () => {
  const input = {
    version: 2,
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-xyz',
      timezone: 'Europe/London',
      status: 'completed',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 18,
      taskOrder: ['t1'],
      completedTaskIds: ['t1'],
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 18 },
      },
      generatedAt: 5000,
      firstStartedAt: 5001,
      completedAt: 5500,
      lastUpdatedAt: 5500,
    },
    recentClaims: [{ claimId: 'c2', createdAt: 5500 }],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 100,
      lifetimeEarned: 200,
      lifetimeSpent: 100,
      ledger: [{ entryId: 'entry-1', type: 'daily-completion-award', amount: 100, balanceAfter: 100, createdAt: 5500 }],
      lastUpdatedAt: 5500,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.daily.questId, 'quest-xyz');
  assert.equal(result.economy.balance, 100);
  assert.equal(result.economy.lifetimeEarned, 200);
  assert.equal(result.economy.lifetimeSpent, 100);
  assert.equal(result.economy.ledger.length, 1);
  assert.equal(result.economy.lastUpdatedAt, 5500);
  // heroPool must be empty (v2 had no heroPool)
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('normaliseHeroProgressState with malformed version (99) returns empty v3 state', () => {
  const result = normaliseHeroProgressState({ version: 99, daily: null, recentClaims: [] });
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('normaliseHeroProgressState with missing version returns empty v3 state', () => {
  const result = normaliseHeroProgressState({ daily: null, recentClaims: [] });
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('normaliseHeroProgressState with version as string returns empty v3 state', () => {
  const result = normaliseHeroProgressState({ version: '3', daily: null, recentClaims: [] });
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('normaliseHeroProgressState v2 with partially corrupt economy normalises safely', () => {
  const input = {
    version: 2,
    daily: {
      dateKey: '2026-04-29',
      questId: 'quest-keep',
      timezone: 'Europe/London',
      status: 'active',
      effortTarget: 12,
      effortPlanned: 12,
      effortCompleted: 0,
      taskOrder: ['t1'],
      completedTaskIds: [],
      tasks: {
        t1: { taskId: 't1', status: 'planned', effortTarget: 12 },
      },
      generatedAt: 7000,
      firstStartedAt: null,
      completedAt: null,
      lastUpdatedAt: 7000,
    },
    recentClaims: [{ claimId: 'c3', createdAt: 7000 }],
    economy: {
      version: HERO_ECONOMY_VERSION,
      balance: 'corrupted', // not a number
      lifetimeEarned: Infinity, // not finite
      lifetimeSpent: -1, // not tested as corrupt, just negative
      ledger: 'not-an-array', // corrupt
      lastUpdatedAt: null,
    },
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  // Daily progress MUST survive
  assert.equal(result.daily.questId, 'quest-keep');
  assert.equal(result.daily.tasks.t1.status, 'planned');
  assert.deepEqual(result.recentClaims, [{ claimId: 'c3', createdAt: 7000 }]);
  // Economy normalises to safe defaults
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0); // 'corrupted' → 0
  assert.equal(result.economy.lifetimeEarned, 0); // Infinity → 0
  assert.deepEqual(result.economy.ledger, []); // 'not-an-array' → []
  // heroPool must be empty (v2 migration)
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.deepEqual(result.heroPool.monsters, {});
});

test('normaliseHeroProgressState v2 with null economy gets empty economy', () => {
  const input = {
    version: 2,
    daily: null,
    recentClaims: [],
    economy: null,
  };
  const result = normaliseHeroProgressState(input);
  assert.equal(result.version, 3);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
});

test('normaliseHeroProgressState with malformed daily repairs safely', () => {
  const result = normaliseHeroProgressState({
    version: 3,
    daily: { dateKey: '2026-04-28', questId: 'q1', status: 'garbage', effortTarget: 'abc' },
    recentClaims: 'not-an-array',
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  });
  assert.equal(result.version, 3);
  assert.equal(result.daily.status, 'active'); // unknown status defaults to 'active'
  assert.equal(result.daily.effortTarget, 0); // NaN coerces to 0
  assert.deepEqual(result.recentClaims, []);
});

test('normaliseHeroProgressState with daily missing dateKey returns null daily', () => {
  const result = normaliseHeroProgressState({
    version: 3,
    daily: { questId: 'q1' }, // no dateKey
    recentClaims: [],
    economy: emptyEconomyState(),
    heroPool: emptyHeroPoolState(),
  });
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
});

// ── initialiseDailyProgress ───────────────────────────────────────

test('initialiseDailyProgress from quest with 3 tasks produces correct shape', () => {
  const quest = {
    questId: 'quest-123',
    questFingerprint: 'fp-abc',
    schedulerVersion: 'hero-p2-child-ui-v1',
    copyVersion: 'hero-p2-copy-v1',
    effortTarget: 18,
    tasks: [
      { taskId: 't1', subjectId: 'grammar', intent: 'due-review', launcher: 'smart-practice', effortTarget: 6 },
      { taskId: 't2', subjectId: 'spelling', intent: 'weak-repair', launcher: 'trouble-practice', effortTarget: 6 },
      { taskId: 't3', subjectId: 'punctuation', intent: 'due-review', launcher: 'mini-test', effortTarget: 6 },
    ],
  };
  const nowTs = 1714300000000;
  const result = initialiseDailyProgress(quest, '2026-04-28', 'Europe/London', nowTs);

  assert.equal(result.dateKey, '2026-04-28');
  assert.equal(result.timezone, 'Europe/London');
  assert.equal(result.questId, 'quest-123');
  assert.equal(result.questFingerprint, 'fp-abc');
  assert.equal(result.schedulerVersion, 'hero-p2-child-ui-v1');
  assert.equal(result.copyVersion, 'hero-p2-copy-v1');
  assert.equal(result.status, 'active');
  assert.equal(result.effortTarget, 18);
  assert.equal(result.effortPlanned, 18);
  assert.equal(result.effortCompleted, 0);
  assert.deepEqual(result.taskOrder, ['t1', 't2', 't3']);
  assert.deepEqual(result.completedTaskIds, []);
  assert.equal(Object.keys(result.tasks).length, 3);
  assert.equal(result.tasks.t1.subjectId, 'grammar');
  assert.equal(result.tasks.t1.status, 'planned');
  assert.equal(result.tasks.t2.launcher, 'trouble-practice');
  assert.equal(result.generatedAt, nowTs);
  assert.equal(result.firstStartedAt, null);
  assert.equal(result.completedAt, null);
  assert.equal(result.lastUpdatedAt, nowTs);
});

// ── applyClaimToProgress ──────────────────────────────────────────

test('applyClaimToProgress increments effortCompleted and adds to completedTaskIds', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      status: 'active',
      effortCompleted: 0,
      taskOrder: ['t1', 't2'],
      completedTaskIds: [],
      completedAt: null,
      lastUpdatedAt: 1000,
      tasks: {
        t1: { taskId: 't1', status: 'started', effortTarget: 6 },
        t2: { taskId: 't2', status: 'planned', effortTarget: 6 },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const claimResult = { taskId: 't1', requestId: 'req-1', practiceSessionId: 'sess-1', evidence: { score: 5 } };
  const nowTs = 2000;
  const result = applyClaimToProgress(state, claimResult, nowTs);

  assert.equal(result.daily.effortCompleted, 6);
  assert.deepEqual(result.daily.completedTaskIds, ['t1']);
  assert.equal(result.daily.tasks.t1.status, 'completed');
  assert.equal(result.daily.tasks.t1.completedAt, 2000);
  assert.equal(result.daily.tasks.t1.subjectPracticeSessionId, 'sess-1');
  assert.deepEqual(result.daily.tasks.t1.evidence, { score: 5 });
  assert.equal(result.daily.status, 'active'); // t2 still not done
  assert.equal(result.daily.lastUpdatedAt, 2000);
});

test('applyClaimToProgress for already-completed task returns unchanged (no double-count)', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      status: 'active',
      effortCompleted: 6,
      taskOrder: ['t1', 't2'],
      completedTaskIds: ['t1'],
      completedAt: null,
      lastUpdatedAt: 1000,
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 6 },
        t2: { taskId: 't2', status: 'planned', effortTarget: 6 },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const claimResult = { taskId: 't1', requestId: 'req-2' };
  const result = applyClaimToProgress(state, claimResult, 3000);

  // State unchanged — same reference
  assert.equal(result, state);
});

test('applyClaimToProgress when all tasks complete sets daily.status=completed', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      status: 'active',
      effortCompleted: 6,
      taskOrder: ['t1', 't2'],
      completedTaskIds: ['t1'],
      completedAt: null,
      lastUpdatedAt: 1000,
      tasks: {
        t1: { taskId: 't1', status: 'completed', effortTarget: 6 },
        t2: { taskId: 't2', status: 'started', effortTarget: 6 },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const claimResult = { taskId: 't2', requestId: 'req-3', practiceSessionId: 'sess-2' };
  const nowTs = 4000;
  const result = applyClaimToProgress(state, claimResult, nowTs);

  assert.equal(result.daily.status, 'completed');
  assert.equal(result.daily.completedAt, 4000);
  assert.equal(result.daily.effortCompleted, 12);
  assert.deepEqual(result.daily.completedTaskIds, ['t1', 't2']);
});

test('applyClaimToProgress with null state returns state unchanged', () => {
  const result = applyClaimToProgress(null, { taskId: 't1' }, 1000);
  assert.equal(result, null);
});

// ── pruneRecentClaims ─────────────────────────────────────────────

test('pruneRecentClaims removes old claims and keeps recent ones', () => {
  const nowTs = Date.now();
  const oldTs = nowTs - (MAX_RECENT_CLAIMS_AGE_DAYS + 1) * 24 * 60 * 60 * 1000;
  const recentTs = nowTs - 1000;
  const state = {
    version: 2,
    daily: null,
    recentClaims: [
      { claimId: 'old', createdAt: oldTs },
      { claimId: 'recent', createdAt: recentTs },
    ],
    economy: emptyEconomyState(),
  };
  const result = pruneRecentClaims(state, nowTs);
  assert.equal(result.recentClaims.length, 1);
  assert.equal(result.recentClaims[0].claimId, 'recent');
});

test('pruneRecentClaims returns same reference when nothing to prune', () => {
  const nowTs = Date.now();
  const state = {
    version: 2,
    daily: null,
    recentClaims: [{ claimId: 'fresh', createdAt: nowTs - 1000 }],
    economy: emptyEconomyState(),
  };
  const result = pruneRecentClaims(state, nowTs);
  assert.equal(result, state);
});

test('pruneRecentClaims with empty recentClaims returns same reference', () => {
  const state = { version: 2, daily: null, recentClaims: [], economy: emptyEconomyState() };
  const result = pruneRecentClaims(state, Date.now());
  assert.equal(result, state);
});

// ── markTaskStarted ───────────────────────────────────────────────

test('markTaskStarted sets status=started and startedAt', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      firstStartedAt: null,
      lastUpdatedAt: 1000,
      tasks: {
        t1: { taskId: 't1', status: 'planned', launchRequestId: null, startedAt: null },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const nowTs = 2000;
  const result = markTaskStarted(state, 't1', 'launch-req-1', nowTs);

  assert.equal(result.daily.tasks.t1.status, 'started');
  assert.equal(result.daily.tasks.t1.launchRequestId, 'launch-req-1');
  assert.equal(result.daily.tasks.t1.startedAt, 2000);
  assert.equal(result.daily.firstStartedAt, 2000);
  assert.equal(result.daily.lastUpdatedAt, 2000);
});

test('markTaskStarted does not regress a completed task', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      firstStartedAt: 1000,
      lastUpdatedAt: 1500,
      tasks: {
        t1: { taskId: 't1', status: 'completed', startedAt: 1000 },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const result = markTaskStarted(state, 't1', 'launch-req-2', 3000);
  assert.equal(result, state); // unchanged
});

test('markTaskStarted preserves existing firstStartedAt', () => {
  const state = {
    version: 2,
    daily: {
      dateKey: '2026-04-28',
      questId: 'q1',
      firstStartedAt: 500,
      lastUpdatedAt: 600,
      tasks: {
        t1: { taskId: 't1', status: 'planned', launchRequestId: null, startedAt: null },
      },
    },
    recentClaims: [],
    economy: emptyEconomyState(),
  };
  const result = markTaskStarted(state, 't1', 'lr-1', 2000);
  assert.equal(result.daily.firstStartedAt, 500); // not overwritten
});

// ── emptyProgressState ────────────────────────────────────────────

test('emptyProgressState returns correct v3 shape with economy + heroPool', () => {
  const result = emptyProgressState();
  assert.equal(result.version, HERO_PROGRESS_VERSION);
  assert.equal(result.version, 3);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
  assert.equal(result.economy.version, HERO_ECONOMY_VERSION);
  assert.equal(result.economy.balance, 0);
  assert.equal(result.economy.lifetimeEarned, 0);
  assert.equal(result.economy.lifetimeSpent, 0);
  assert.deepEqual(result.economy.ledger, []);
  assert.equal(result.economy.lastUpdatedAt, null);
  assert.equal(result.heroPool.version, HERO_POOL_STATE_VERSION);
  assert.equal(result.heroPool.rosterVersion, HERO_POOL_ROSTER_VERSION);
  assert.equal(result.heroPool.selectedMonsterId, null);
  assert.deepEqual(result.heroPool.monsters, {});
  assert.deepEqual(result.heroPool.recentActions, []);
  assert.equal(result.heroPool.lastUpdatedAt, null);
});

// ── HERO_PROGRESS_VERSION is 3 ───────────────────────────────────

test('HERO_PROGRESS_VERSION is 3', () => {
  assert.equal(HERO_PROGRESS_VERSION, 3);
});
