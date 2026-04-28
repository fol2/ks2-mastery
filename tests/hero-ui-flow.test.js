import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroHomeModel } from '../src/platform/hero/hero-ui-model.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Minimal read model fixture with ui.enabled and childVisible. */
function readModelFixture({
  uiEnabled = true,
  childVisible = true,
  tasks = [],
  activeHeroSession = null,
  effortPlanned = 3,
  eligibleSubjects = ['spelling', 'grammar'],
  questFingerprint = 'hero-qf-abc123def456',
} = {}) {
  return {
    version: 3,
    childVisible,
    questFingerprint,
    ui: { enabled: uiEnabled, surface: 'dashboard', reason: uiEnabled ? 'enabled' : 'child-ui-disabled', copyVersion: 'hero-p2-copy-v1' },
    dailyQuest: {
      questId: 'quest-001',
      effortPlanned,
      tasks,
    },
    activeHeroSession,
    eligibleSubjects,
    mode: 'shadow',
    safety: { childVisible, coinsEnabled: false, writesEnabled: false },
  };
}

function launchableTask(taskId = 'task-001', subjectId = 'spelling') {
  return {
    taskId,
    subjectId,
    intent: 'strengthen',
    launcher: 'standard-practice',
    launchStatus: 'launchable',
    childLabel: 'Spelling practice',
    childReason: 'Strengthen your skills',
  };
}

function completedTask(taskId = 'task-done', subjectId = 'grammar') {
  return {
    taskId,
    subjectId,
    intent: 'introduce',
    launcher: 'standard-practice',
    launchStatus: 'completed',
    childLabel: 'Grammar practice',
    childReason: 'Learn new grammar',
  };
}

function activeSession(subjectId = 'spelling') {
  return {
    subjectId,
    questId: 'quest-001',
    questFingerprint: 'hero-qf-abc123def456',
    taskId: 'task-001',
    intent: 'strengthen',
    launcher: 'standard-practice',
    status: 'in-progress',
  };
}

// ---------------------------------------------------------------------------
// buildHeroHomeModel — enabled derivation (dual check)
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — enabled derivation', () => {
  it('returns enabled: true when readModel has ui.enabled: true AND childVisible: true', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ uiEnabled: true, childVisible: true }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, true);
  });

  it('returns enabled: false when childVisible: false even if ui.enabled: true (dual check)', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ uiEnabled: true, childVisible: false }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
  });

  it('returns enabled: false when ui.enabled: false even if childVisible: true', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ uiEnabled: false, childVisible: true }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
  });

  it('returns enabled: false when readModel is null', () => {
    const heroUi = { status: 'idle', readModel: null };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
  });

  it('returns enabled: false when heroUi is empty object', () => {
    const result = buildHeroHomeModel({});
    assert.equal(result.enabled, false);
  });

  it('returns enabled: false when heroUi is undefined', () => {
    const result = buildHeroHomeModel(undefined);
    assert.equal(result.enabled, false);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — nextTask derivation
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — nextTask', () => {
  it('returns first launchable task as nextTask', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [
          completedTask('task-done', 'grammar'),
          launchableTask('task-002', 'spelling'),
          launchableTask('task-003', 'punctuation'),
        ],
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask.taskId, 'task-002');
    assert.equal(result.nextTask.subjectId, 'spelling');
  });

  it('returns null when no tasks are launchable', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [completedTask('task-done')],
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask, null);
  });

  it('returns null when tasks array is empty', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ tasks: [] }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask, null);
  });

  it('returns null when tasks is missing from dailyQuest', () => {
    const rm = readModelFixture();
    rm.dailyQuest = { questId: 'quest-001', effortPlanned: 3 };
    const heroUi = { status: 'ready', readModel: rm };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask, null);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — canStart / canContinue
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — canStart / canContinue', () => {
  it('canStart: true when enabled, launchable task, no active session', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [launchableTask()],
        activeHeroSession: null,
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.canStart, true);
    assert.equal(result.canContinue, false);
  });

  it('canContinue: true when enabled and activeHeroSession present', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [launchableTask()],
        activeHeroSession: activeSession(),
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.canContinue, true);
    // canStart is false because active session exists
    assert.equal(result.canStart, false);
  });

  it('canStart: false when not enabled (even if launchable task exists)', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        uiEnabled: false,
        tasks: [launchableTask()],
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.canStart, false);
  });

  it('canStart: false when enabled but no launchable tasks', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [completedTask()],
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.canStart, false);
  });

  it('canContinue: false when not enabled (even if active session exists)', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        uiEnabled: false,
        activeHeroSession: activeSession(),
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.canContinue, false);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — status, error, effortPlanned, eligibleSubjects, lastLaunch
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — pass-through fields', () => {
  it('threads status from heroUi', () => {
    const result = buildHeroHomeModel({ status: 'loading' });
    assert.equal(result.status, 'loading');
  });

  it('threads error from heroUi', () => {
    const result = buildHeroHomeModel({ status: 'error', error: 'hero_shadow_disabled' });
    assert.equal(result.error, 'hero_shadow_disabled');
  });

  it('threads effortPlanned from readModel', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ effortPlanned: 5 }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.effortPlanned, 5);
  });

  it('effortPlanned defaults to 0 when readModel is null', () => {
    const result = buildHeroHomeModel({ status: 'idle', readModel: null });
    assert.equal(result.effortPlanned, 0);
  });

  it('threads eligibleSubjects from readModel', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ eligibleSubjects: ['spelling', 'punctuation'] }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.deepEqual(result.eligibleSubjects, ['spelling', 'punctuation']);
  });

  it('eligibleSubjects defaults to empty array when readModel is null', () => {
    const result = buildHeroHomeModel({ status: 'idle', readModel: null });
    assert.deepEqual(result.eligibleSubjects, []);
  });

  it('threads lastLaunch from heroUi', () => {
    const lastLaunch = {
      questId: 'quest-001',
      taskId: 'task-001',
      subjectId: 'spelling',
      intent: 'strengthen',
      launcher: 'standard-practice',
      launchedAt: '2026-04-27T10:00:00.000Z',
    };
    const result = buildHeroHomeModel({ status: 'ready', lastLaunch });
    assert.deepEqual(result.lastLaunch, lastLaunch);
  });

  it('lastLaunch defaults to null when not present', () => {
    const result = buildHeroHomeModel({ status: 'idle' });
    assert.equal(result.lastLaunch, null);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — unexpected shapes (robustness)
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — unexpected / malformed shapes', () => {
  it('missing ui block on readModel returns enabled: false, no crash', () => {
    const heroUi = {
      status: 'ready',
      readModel: { version: 3, childVisible: true, dailyQuest: { tasks: [] } },
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
    assert.equal(result.status, 'ready');
  });

  it('readModel with ui but missing childVisible returns enabled: false', () => {
    const heroUi = {
      status: 'ready',
      readModel: { version: 3, ui: { enabled: true } },
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
  });

  it('readModel with tasks as non-array returns nextTask: null', () => {
    const heroUi = {
      status: 'ready',
      readModel: {
        version: 3,
        childVisible: true,
        ui: { enabled: true },
        dailyQuest: { tasks: 'not-an-array' },
      },
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask, null);
  });

  it('readModel with tasks containing null entries does not crash', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({
        tasks: [null, undefined, launchableTask()],
      }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.nextTask.taskId, 'task-001');
  });

  it('readModel completely empty object returns safe defaults', () => {
    const heroUi = { status: 'ready', readModel: {} };
    const result = buildHeroHomeModel(heroUi);
    assert.equal(result.enabled, false);
    assert.equal(result.nextTask, null);
    assert.equal(result.activeHeroSession, null);
    assert.equal(result.canStart, false);
    assert.equal(result.canContinue, false);
    assert.equal(result.effortPlanned, 0);
    assert.deepEqual(result.eligibleSubjects, []);
  });

  it('activeHeroSession from readModel threads through when present', () => {
    const session = activeSession('grammar');
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ activeHeroSession: session }),
    };
    const result = buildHeroHomeModel(heroUi);
    assert.deepEqual(result.activeHeroSession, session);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — return shape completeness
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — return shape', () => {
  it('returns all expected fields in the output', () => {
    const heroUi = {
      status: 'ready',
      readModel: readModelFixture({ tasks: [launchableTask()] }),
      error: '',
      lastLaunch: null,
    };
    const result = buildHeroHomeModel(heroUi);
    const expectedKeys = [
      'status', 'enabled', 'nextTask', 'activeHeroSession',
      'canStart', 'canContinue', 'error', 'effortPlanned',
      'eligibleSubjects', 'lastLaunch',
    ];
    for (const key of expectedKeys) {
      assert.ok(key in result, `Missing key: ${key}`);
    }
  });
});
