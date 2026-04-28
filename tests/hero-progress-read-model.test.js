// Hero Mode P3 U7 — Progress read model v4 tests.
//
// Exercises the evolution of buildHeroShadowReadModel to v4 with progress
// merge, per-task completionStatus, pending completed session detection,
// progress/claim blocks, and backwards compatibility to v3 when progress
// flag is disabled.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHeroShadowReadModel } from '../worker/src/hero/read-model.js';
import { normaliseHeroProgressState, emptyProgressState } from '../shared/hero/progress-state.js';

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

// Minimal subject read models that produce eligible subjects and scheduled tasks
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

function buildV3(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: BASE_ENV,
    progressEnabled: false,
    ...overrides,
  });
}

function buildV4(overrides = {}) {
  return buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels: makeSubjectReadModels(),
    now: Date.now(),
    env: PROGRESS_ENV,
    progressEnabled: true,
    heroProgressState: null,
    recentCompletedSessions: [],
    ...overrides,
  });
}

function buildProgressState(model, overrides = {}) {
  // Build a progress state matching the scheduled quest from a read model
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

// ── V4 shape validation ──────────────────────────────────────────────

test('v4 read model has all required top-level fields', () => {
  const model = buildV4();

  assert.equal(model.version, 4);
  assert.equal(model.mode, 'progress');
  assert.equal(model.childVisible, true);
  assert.equal(model.coinsEnabled, false);
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

test('v4 dailyQuest has effortCompleted, taskCount, completedTaskCount', () => {
  const model = buildV4();
  const dq = model.dailyQuest;

  assert.equal(typeof dq.effortCompleted, 'number');
  assert.equal(typeof dq.taskCount, 'number');
  assert.equal(typeof dq.completedTaskCount, 'number');
  assert.ok(dq.taskCount > 0, 'Should have at least one task');
  assert.equal(dq.completedTaskCount, 0, 'No tasks completed without progress state');
  assert.equal(dq.effortCompleted, 0);
});

test('v4 tasks have completionStatus, completedAt, effortCompleted, canClaim', () => {
  const model = buildV4();
  for (const task of model.dailyQuest.tasks) {
    assert.ok('completionStatus' in task, `Task ${task.taskId} missing completionStatus`);
    assert.ok('completedAt' in task, `Task ${task.taskId} missing completedAt`);
    assert.ok('effortCompleted' in task, `Task ${task.taskId} missing effortCompleted`);
    assert.ok('canClaim' in task, `Task ${task.taskId} missing canClaim`);
  }
});

test('v4 progress block has all required fields', () => {
  const model = buildV4();
  const p = model.progress;

  assert.equal(p.enabled, true);
  assert.equal(p.stateVersion, 1);
  assert.equal(p.dateKey, model.dateKey);
  assert.equal(typeof p.status, 'string');
  assert.equal(typeof p.effortCompleted, 'number');
  assert.equal(typeof p.effortPlanned, 'number');
  assert.ok(Array.isArray(p.completedTaskIds));
  assert.equal(p.justCompletedTaskId, null);
  assert.equal(typeof p.canClaim, 'boolean');
  assert.ok('pendingClaimTaskId' in p);
});

test('v4 launch block has claimEnabled and heroStatePersistenceEnabled', () => {
  const model = buildV4();
  assert.equal(model.launch.claimEnabled, true);
  assert.equal(model.launch.heroStatePersistenceEnabled, true);
  assert.equal(model.launch.command, 'start-task');
  assert.equal(model.launch.commandRoute, '/api/hero/command');
});

test('v4 claim block present with correct shape', () => {
  const model = buildV4();
  assert.equal(model.claim.enabled, true);
  assert.equal(model.claim.commandRoute, '/api/hero/command');
  assert.equal(model.claim.command, 'claim-task');
});

test('v4 has no economy fields (coins, balance, monster)', () => {
  const model = buildV4();
  assert.equal(model.coinsEnabled, false);
  assert.equal('balance' in model, false);
  assert.equal('monster' in model, false);
  assert.equal('coins' in model, false);
});

// ── Task completionStatus from progress ─────────────────────────────

test('task marked completed in progress → completionStatus=completed', () => {
  // First build a v4 without progress to get the task ids
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  // Now build with progress that has first task completed
  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'completed',
        completedAt: Date.now() - 5000,
        claimRequestId: 'claim-1',
      },
    },
    completedTaskIds: [firstTask.taskId],
    effortCompleted: firstTask.effortTarget || 6,
  });

  const model = buildV4({ heroProgressState: progressState });
  const task = model.dailyQuest.tasks.find(t => t.taskId === firstTask.taskId);

  assert.equal(task.completionStatus, 'completed');
  assert.ok(task.completedAt > 0);
  assert.ok(task.effortCompleted > 0);
  assert.equal(task.canClaim, false);
});

test('task marked started + no active session → completionStatus=completed-unclaimed', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'started',
        startedAt: Date.now() - 60000,
        launchRequestId: 'launch-1',
      },
    },
  });

  const model = buildV4({ heroProgressState: progressState });
  const task = model.dailyQuest.tasks.find(t => t.taskId === firstTask.taskId);

  assert.equal(task.completionStatus, 'completed-unclaimed');
  assert.equal(task.canClaim, true);
});

test('task marked started + matching active session → completionStatus=in-progress', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'started',
        startedAt: Date.now() - 60000,
        launchRequestId: 'launch-1',
      },
    },
  });

  // Simulate active session for this task's subject via ui_json
  const subjectReadModels = makeSubjectReadModels();
  subjectReadModels[firstTask.subjectId] = {
    data: subjectReadModels[firstTask.subjectId]?.data || SPELLING_DATA,
    ui: {
      session: {
        heroContext: {
          source: 'hero-mode',
          questId: baseModel.dailyQuest.questId,
          taskId: firstTask.taskId,
          intent: firstTask.intent,
          launcher: firstTask.launcher,
        },
      },
    },
  };

  const model = buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels,
    now: Date.now(),
    env: PROGRESS_ENV,
    progressEnabled: true,
    heroProgressState: progressState,
    recentCompletedSessions: [],
  });

  const task = model.dailyQuest.tasks.find(t => t.taskId === firstTask.taskId);
  assert.equal(task.completionStatus, 'in-progress');
  assert.equal(task.canClaim, false);
});

// ── Pending completed session detection ─────────────────────────────

test('started task + matching completed practice session → pendingCompletedHeroSession', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'started',
        startedAt: Date.now() - 60000,
        launchRequestId: 'launch-1',
      },
    },
  });

  const recentCompletedSessions = [{
    id: 'session-xyz',
    learner_id: 'learner-1',
    subject_id: firstTask.subjectId,
    session_kind: 'practice',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        taskId: firstTask.taskId,
        questId: baseModel.dailyQuest.questId,
        source: 'hero-mode',
      },
    }),
    updated_at: Date.now() - 30000,
  }];

  const model = buildV4({
    heroProgressState: progressState,
    recentCompletedSessions,
  });

  assert.ok(model.pendingCompletedHeroSession, 'pendingCompletedHeroSession must be populated');
  assert.equal(model.pendingCompletedHeroSession.taskId, firstTask.taskId);
  assert.equal(model.pendingCompletedHeroSession.questId, baseModel.dailyQuest.questId);
  assert.equal(model.pendingCompletedHeroSession.subjectId, firstTask.subjectId);
  assert.equal(model.pendingCompletedHeroSession.practiceSessionId, 'session-xyz');
  assert.equal(model.progress.pendingClaimTaskId, firstTask.taskId);
});

test('pendingCompletedHeroSession is null when no unclaimed started tasks exist', () => {
  const model = buildV4();
  assert.equal(model.pendingCompletedHeroSession, null);
});

test('pendingCompletedHeroSession is null when started task has active session (not yet done)', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'started',
        startedAt: Date.now() - 60000,
        launchRequestId: 'launch-1',
      },
    },
  });

  // Active session for this task
  const subjectReadModels = makeSubjectReadModels();
  subjectReadModels[firstTask.subjectId] = {
    data: subjectReadModels[firstTask.subjectId]?.data || SPELLING_DATA,
    ui: {
      session: {
        heroContext: {
          source: 'hero-mode',
          questId: baseModel.dailyQuest.questId,
          taskId: firstTask.taskId,
          intent: firstTask.intent,
          launcher: firstTask.launcher,
        },
      },
    },
  };

  // With a matching completed session (would trigger pending UNLESS active session exists)
  const recentCompletedSessions = [{
    id: 'session-xyz',
    learner_id: 'learner-1',
    subject_id: firstTask.subjectId,
    session_kind: 'practice',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        taskId: firstTask.taskId,
        questId: baseModel.dailyQuest.questId,
        source: 'hero-mode',
      },
    }),
    updated_at: Date.now() - 30000,
  }];

  const model = buildHeroShadowReadModel({
    learnerId: 'learner-1',
    accountId: 'account-1',
    subjectReadModels,
    now: Date.now(),
    env: PROGRESS_ENV,
    progressEnabled: true,
    heroProgressState: progressState,
    recentCompletedSessions,
  });

  // Active session takes precedence → no pending
  assert.equal(model.pendingCompletedHeroSession, null);
});

test('started task with claimRequestId → NOT pending (already claimed)', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'started',
        startedAt: Date.now() - 60000,
        launchRequestId: 'launch-1',
        claimRequestId: 'claim-already', // already claimed
      },
    },
  });

  const recentCompletedSessions = [{
    id: 'session-xyz',
    learner_id: 'learner-1',
    subject_id: firstTask.subjectId,
    session_kind: 'practice',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        taskId: firstTask.taskId,
        questId: baseModel.dailyQuest.questId,
      },
    }),
    updated_at: Date.now() - 30000,
  }];

  const model = buildV4({
    heroProgressState: progressState,
    recentCompletedSessions,
  });

  assert.equal(model.pendingCompletedHeroSession, null);
});

// ── All tasks completed ─────────────────────────────────────────────

test('all tasks completed → dailyQuest.status=completed, progress.status=completed', () => {
  const baseModel = buildV4();
  const tasks = baseModel.dailyQuest.tasks;
  const taskOverrides = {};
  const completedIds = [];
  let totalEffort = 0;

  for (const task of tasks) {
    taskOverrides[task.taskId] = {
      status: 'completed',
      completedAt: Date.now() - 5000,
      claimRequestId: `claim-${task.taskId}`,
    };
    completedIds.push(task.taskId);
    totalEffort += task.effortTarget || 0;
  }

  const progressState = buildProgressState(baseModel, {
    taskOverrides,
    completedTaskIds: completedIds,
    effortCompleted: totalEffort,
    dailyStatus: 'completed',
    completedAt: Date.now() - 1000,
  });

  const model = buildV4({ heroProgressState: progressState });

  assert.equal(model.dailyQuest.status, 'completed');
  assert.equal(model.progress.status, 'completed');
  assert.equal(model.dailyQuest.completedTaskCount, tasks.length);
  assert.ok(model.dailyQuest.effortCompleted > 0);
});

// ── No progress state → zeros ───────────────────────────────────────

test('progress enabled but no existing progress state → progress block shows none/zeros', () => {
  const model = buildV4({ heroProgressState: null });

  assert.equal(model.progress.status, 'none');
  assert.equal(model.progress.effortCompleted, 0);
  assert.deepEqual(model.progress.completedTaskIds, []);
  assert.equal(model.progress.canClaim, false);
  assert.equal(model.progress.pendingClaimTaskId, null);
  assert.equal(model.dailyQuest.effortCompleted, 0);
  assert.equal(model.dailyQuest.completedTaskCount, 0);
});

test('progress enabled with empty progress state → same as null', () => {
  const model = buildV4({ heroProgressState: emptyProgressState() });

  assert.equal(model.progress.status, 'none');
  assert.equal(model.progress.effortCompleted, 0);
  assert.equal(model.dailyQuest.completedTaskCount, 0);
});

// ── Orphan task handling ────────────────────────────────────────────

test('completed task in progress not in current schedule → preserved as completed orphan', () => {
  const baseModel = buildV4();
  const orphanTaskId = 'orphan-task-xyz-999';

  // Build a progress state that has an extra orphan task
  const progressState = buildProgressState(baseModel);
  // Inject orphan task
  progressState.daily.tasks[orphanTaskId] = {
    taskId: orphanTaskId,
    questId: baseModel.dailyQuest.questId,
    questFingerprint: baseModel.questFingerprint,
    dateKey: baseModel.dateKey,
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    status: 'completed',
    launchRequestId: 'launch-orphan',
    claimRequestId: 'claim-orphan',
    startedAt: Date.now() - 120000,
    completedAt: Date.now() - 60000,
    subjectPracticeSessionId: null,
    evidence: null,
  };
  progressState.daily.taskOrder.push(orphanTaskId);
  progressState.daily.completedTaskIds.push(orphanTaskId);

  const model = buildV4({ heroProgressState: progressState });

  const orphan = model.dailyQuest.tasks.find(t => t.taskId === orphanTaskId);
  assert.ok(orphan, 'Orphan completed task must be preserved in tasks list');
  assert.equal(orphan.completionStatus, 'completed');
  assert.equal(orphan.subjectId, 'spelling');
  assert.equal(orphan.launchStatus, 'not-launchable');
  assert.equal(orphan.launchStatusReason, 'orphaned-completed');
});

test('orphan task that is NOT completed → NOT preserved', () => {
  const baseModel = buildV4();
  const orphanTaskId = 'orphan-started-task';

  const progressState = buildProgressState(baseModel);
  progressState.daily.tasks[orphanTaskId] = {
    taskId: orphanTaskId,
    questId: baseModel.dailyQuest.questId,
    questFingerprint: baseModel.questFingerprint,
    dateKey: baseModel.dateKey,
    subjectId: 'spelling',
    intent: 'due-review',
    launcher: 'smart-practice',
    effortTarget: 6,
    status: 'started', // not completed
    launchRequestId: 'launch-orphan',
    claimRequestId: null,
    startedAt: Date.now() - 120000,
    completedAt: null,
    subjectPracticeSessionId: null,
    evidence: null,
  };

  const model = buildV4({ heroProgressState: progressState });

  const orphan = model.dailyQuest.tasks.find(t => t.taskId === orphanTaskId);
  assert.equal(orphan, undefined, 'Non-completed orphan tasks should not be included');
});

// ── Progress disabled → v3 ──────────────────────────────────────────

test('progress disabled → version 3 shape preserved', () => {
  const model = buildV3();

  assert.equal(model.version, 3);
  assert.equal(model.mode, 'shadow');
  assert.equal(model.writesEnabled, false);
  assert.equal('progress' in model, false, 'No progress block in v3');
  assert.equal('claim' in model, false, 'No claim block in v3');
  assert.equal('pendingCompletedHeroSession' in model, false, 'No pendingCompletedHeroSession in v3');
  assert.equal(model.launch.claimEnabled, false);
  assert.equal(model.launch.heroStatePersistenceEnabled, false);
});

test('progress disabled → no effortCompleted, taskCount, completedTaskCount on dailyQuest', () => {
  const model = buildV3();

  assert.equal('effortCompleted' in model.dailyQuest, false);
  assert.equal('taskCount' in model.dailyQuest, false);
  assert.equal('completedTaskCount' in model.dailyQuest, false);
});

test('progress disabled → tasks do not have completionStatus field', () => {
  const model = buildV3();
  for (const task of model.dailyQuest.tasks) {
    assert.equal('completionStatus' in task, false, `v3 task ${task.taskId} should not have completionStatus`);
  }
});

// ── Malformed progress state ────────────────────────────────────────

test('malformed progress state → normalised, no crash', () => {
  const malformed = { version: 99, daily: 'invalid', recentClaims: 'nope' };
  const model = buildV4({ heroProgressState: normaliseHeroProgressState(malformed) });

  // Should not crash, should return empty/zeros
  assert.equal(model.version, 4);
  assert.equal(model.progress.status, 'none');
  assert.equal(model.progress.effortCompleted, 0);
  assert.equal(model.dailyQuest.completedTaskCount, 0);
});

test('progress state with wrong dateKey → tasks treated as not-started', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  // Build progress with a different dateKey (yesterday)
  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'completed',
        completedAt: Date.now() - 86400000,
        claimRequestId: 'claim-old',
      },
    },
    completedTaskIds: [firstTask.taskId],
  });
  // Override dateKey to yesterday
  progressState.daily.dateKey = '2020-01-01';

  const model = buildV4({ heroProgressState: progressState });

  // Date mismatch → no progress merge
  const task = model.dailyQuest.tasks.find(t => t.taskId === firstTask.taskId);
  assert.equal(task.completionStatus, 'not-started');
  assert.equal(task.effortCompleted, 0);
});

// ── Debug stripping for child UI ────────────────────────────────────

test('debug block present in v4 response (route strips it for child)', () => {
  const model = buildV4();
  // The read model builder always includes debug; the route handler strips it.
  assert.ok('debug' in model, 'debug should be present in raw build output');
});

// ── claim block shows enabled:true when progress flag on ────────────

test('claim block enabled:true when progressEnabled=true', () => {
  const model = buildV4();
  assert.equal(model.claim.enabled, true);
});

// ── Completed task persists after quest recomputation ────────────────

test('completed task persists even if scheduler computes same tasks', () => {
  const baseModel = buildV4();
  const firstTask = baseModel.dailyQuest.tasks[0];

  const progressState = buildProgressState(baseModel, {
    taskOverrides: {
      [firstTask.taskId]: {
        status: 'completed',
        completedAt: Date.now() - 10000,
        claimRequestId: 'claim-persist-1',
      },
    },
    completedTaskIds: [firstTask.taskId],
    effortCompleted: firstTask.effortTarget || 6,
  });

  // Rebuild with same inputs (simulating a quest recomputation that produces same schedule)
  const model = buildV4({ heroProgressState: progressState });
  const task = model.dailyQuest.tasks.find(t => t.taskId === firstTask.taskId);

  assert.equal(task.completionStatus, 'completed');
  assert.ok(model.dailyQuest.completedTaskCount >= 1);
});
