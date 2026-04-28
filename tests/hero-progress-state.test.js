import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HERO_PROGRESS_VERSION,
  MAX_RECENT_CLAIMS_AGE_DAYS,
  emptyProgressState,
  normaliseHeroProgressState,
  initialiseDailyProgress,
  applyClaimToProgress,
  pruneRecentClaims,
  markTaskStarted,
} from '../shared/hero/progress-state.js';

// ── normaliseHeroProgressState ────────────────────────────────────

test('normaliseHeroProgressState with null returns empty state with version 1', () => {
  const result = normaliseHeroProgressState(null);
  assert.equal(result.version, HERO_PROGRESS_VERSION);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
});

test('normaliseHeroProgressState with undefined returns empty state', () => {
  const result = normaliseHeroProgressState(undefined);
  assert.equal(result.version, 1);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
});

test('normaliseHeroProgressState with valid state returns normalised structure', () => {
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
  assert.equal(result.version, 1);
  assert.equal(result.daily.dateKey, '2026-04-28');
  assert.equal(result.daily.questId, 'quest-abc');
  assert.equal(result.daily.tasks.t1.status, 'completed');
  assert.equal(result.daily.tasks.t2.status, 'planned');
  assert.deepEqual(result.recentClaims, [{ claimId: 'c1', createdAt: 999 }]);
});

test('normaliseHeroProgressState with wrong version returns empty state', () => {
  const result = normaliseHeroProgressState({ version: 99, daily: null, recentClaims: [] });
  assert.equal(result.version, 1);
  assert.equal(result.daily, null);
});

test('normaliseHeroProgressState with malformed daily repairs safely', () => {
  const result = normaliseHeroProgressState({
    version: 1,
    daily: { dateKey: '2026-04-28', questId: 'q1', status: 'garbage', effortTarget: 'abc' },
    recentClaims: 'not-an-array',
  });
  assert.equal(result.daily.status, 'active'); // unknown status defaults to 'active'
  assert.equal(result.daily.effortTarget, 0); // NaN coerces to 0
  assert.deepEqual(result.recentClaims, []);
});

test('normaliseHeroProgressState with daily missing dateKey returns null daily', () => {
  const result = normaliseHeroProgressState({
    version: 1,
    daily: { questId: 'q1' }, // no dateKey
    recentClaims: [],
  });
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
    version: 1,
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
    version: 1,
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
  };
  const claimResult = { taskId: 't1', requestId: 'req-2' };
  const result = applyClaimToProgress(state, claimResult, 3000);

  // State unchanged — same reference
  assert.equal(result, state);
});

test('applyClaimToProgress when all tasks complete sets daily.status=completed', () => {
  const state = {
    version: 1,
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
    version: 1,
    daily: null,
    recentClaims: [
      { claimId: 'old', createdAt: oldTs },
      { claimId: 'recent', createdAt: recentTs },
    ],
  };
  const result = pruneRecentClaims(state, nowTs);
  assert.equal(result.recentClaims.length, 1);
  assert.equal(result.recentClaims[0].claimId, 'recent');
});

test('pruneRecentClaims returns same reference when nothing to prune', () => {
  const nowTs = Date.now();
  const state = {
    version: 1,
    daily: null,
    recentClaims: [{ claimId: 'fresh', createdAt: nowTs - 1000 }],
  };
  const result = pruneRecentClaims(state, nowTs);
  assert.equal(result, state);
});

test('pruneRecentClaims with empty recentClaims returns same reference', () => {
  const state = { version: 1, daily: null, recentClaims: [] };
  const result = pruneRecentClaims(state, Date.now());
  assert.equal(result, state);
});

// ── markTaskStarted ───────────────────────────────────────────────

test('markTaskStarted sets status=started and startedAt', () => {
  const state = {
    version: 1,
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
    version: 1,
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
  };
  const result = markTaskStarted(state, 't1', 'launch-req-2', 3000);
  assert.equal(result, state); // unchanged
});

test('markTaskStarted preserves existing firstStartedAt', () => {
  const state = {
    version: 1,
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
  };
  const result = markTaskStarted(state, 't1', 'lr-1', 2000);
  assert.equal(result.daily.firstStartedAt, 500); // not overwritten
});

// ── emptyProgressState ────────────────────────────────────────────

test('emptyProgressState returns correct default shape', () => {
  const result = emptyProgressState();
  assert.equal(result.version, HERO_PROGRESS_VERSION);
  assert.equal(result.daily, null);
  assert.deepEqual(result.recentClaims, []);
});

// ── No economy vocabulary ─────────────────────────────────────────

test('progress-state exports contain no economy vocabulary', () => {
  const exportNames = [
    'HERO_PROGRESS_VERSION',
    'MAX_RECENT_CLAIMS_AGE_DAYS',
    'emptyProgressState',
    'normaliseHeroProgressState',
    'initialiseDailyProgress',
    'applyClaimToProgress',
    'pruneRecentClaims',
    'markTaskStarted',
  ];
  const forbidden = ['coins', 'reward', 'xp', 'balance', 'shop', 'monster'];
  for (const name of exportNames) {
    for (const word of forbidden) {
      assert.ok(!name.toLowerCase().includes(word), `${name} must not contain "${word}"`);
    }
  }
});
