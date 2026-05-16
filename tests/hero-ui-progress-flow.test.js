import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHeroHomeModel } from '../src/platform/hero/hero-ui-model.js';
import { isHeroSessionTerminal } from '../shared/hero/completion-status.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function readModelFixture({
  uiEnabled = true,
  childVisible = true,
  tasks = [],
  activeHeroSession = null,
  effortPlanned = 3,
  eligibleSubjects = ['spelling', 'grammar'],
  progress = null,
  pendingCompletedHeroSession = null,
  claim = null,
  questId = 'quest-001',
  questFingerprint = 'hero-qf-test-abc',
  dateKey = '2026-04-28',
} = {}) {
  return {
    version: 4,
    childVisible,
    questFingerprint,
    dateKey,
    ui: { enabled: uiEnabled, surface: 'dashboard', reason: uiEnabled ? 'enabled' : 'child-ui-disabled' },
    dailyQuest: {
      questId,
      effortPlanned,
      tasks,
    },
    activeHeroSession,
    eligibleSubjects,
    mode: 'shadow',
    safety: { childVisible, coinsEnabled: false, writesEnabled: false },
    progress,
    pendingCompletedHeroSession,
    claim,
  };
}

function heroUiFixture({
  status = 'ready',
  readModel = null,
  lastLaunch = null,
  lastClaim = null,
  error = '',
} = {}) {
  return {
    status,
    learnerId: 'learner-1',
    requestToken: 1,
    readModel,
    error,
    pendingTaskKey: '',
    pendingClaimKey: null,
    lastLaunch,
    lastClaim,
  };
}

function lastLaunchFixture({
  questId = 'quest-001',
  questFingerprint = 'hero-qf-test-abc',
  taskId = 'task-001',
  subjectId = 'spelling',
} = {}) {
  return {
    questId,
    questFingerprint,
    taskId,
    subjectId,
    intent: 'strengthen',
    launcher: 'standard-practice',
    launchedAt: '2026-04-28T10:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// buildHeroHomeModel — progress fields (P3 U10)
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — progress and claim fields', () => {
  it('includes progress fields from readModel when present', () => {
    const progress = {
      status: 'active',
      effortCompleted: 2,
      effortPlanned: 3,
      completedTaskIds: ['task-a', 'task-b'],
    };
    const rm = readModelFixture({ progress });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.deepEqual(model.progress, progress);
    assert.equal(model.dailyStatus, 'active');
    assert.equal(model.effortCompleted, 2);
    assert.deepEqual(model.completedTaskIds, ['task-a', 'task-b']);
  });

  it('defaults progress fields to null/0/[] when readModel has no progress', () => {
    const rm = readModelFixture({ progress: null });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.progress, null);
    assert.equal(model.dailyStatus, 'none');
    assert.equal(model.effortCompleted, 0);
    assert.deepEqual(model.completedTaskIds, []);
  });

  it('reflects claiming state when status is claiming', () => {
    const rm = readModelFixture();
    const heroUi = heroUiFixture({ readModel: rm, status: 'claiming' });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.claiming, true);
    assert.equal(model.status, 'claiming');
  });

  it('claiming is false when status is ready', () => {
    const rm = readModelFixture();
    const heroUi = heroUiFixture({ readModel: rm, status: 'ready' });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.claiming, false);
  });

  it('includes lastClaim from heroUi state', () => {
    const claimResult = { taskId: 'task-001', completedAt: '2026-04-28T10:05:00.000Z' };
    const rm = readModelFixture();
    const heroUi = heroUiFixture({ readModel: rm, lastClaim: claimResult });
    const model = buildHeroHomeModel(heroUi);

    assert.deepEqual(model.lastClaim, claimResult);
  });

  it('projects daily completion and awarded coins from the latest claim before the refreshed read model arrives', () => {
    const rm = readModelFixture({
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 0,
      today: {
        awardStatus: 'in-progress',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.coinsEnabled, true);
    assert.equal(model.coinsAwardedToday, 100);
    assert.equal(model.coinBalance, 100);
    assert.equal(model.dailyAwardStatus, 'awarded');
    assert.equal(model.showCoinsAwarded, true);
  });

  it('preserves awarded balance on an already-completed duplicate claim without showing a second coin award', () => {
    const rm = readModelFixture({
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 0,
      today: {
        awardStatus: 'in-progress',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'already-completed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 0,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: true,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.coinsEnabled, true);
    assert.equal(model.coinsAwardedToday, 0);
    assert.equal(model.coinBalance, 100);
    assert.equal(model.dailyAwardStatus, 'awarded');
    assert.equal(model.showCoinsAwarded, false);
    assert.equal(model.showCoinBalance, true);
  });

  it('handles production-shaped duplicate claim responses with zero award while the read model is stale', () => {
    const rm = readModelFixture({
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 0,
      today: {
        awardStatus: 'in-progress',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'already-completed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      coinsEnabled: true,
      coinsAwarded: 0,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: true,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.coinsEnabled, true);
    assert.equal(model.coinsAwardedToday, 0);
    assert.equal(model.coinBalance, 100);
    assert.equal(model.dailyAwardStatus, 'awarded');
    assert.equal(model.showCoinsAwarded, false);
  });

  it('prefers refreshed read model economy over the previous claim snapshot', () => {
    const rm = readModelFixture({
      progress: {
        status: 'completed',
        effortCompleted: 6,
        effortPlanned: 6,
        completedTaskIds: ['task-001'],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 80,
      today: {
        awardStatus: 'awarded',
        coinsAwarded: 100,
      },
    };
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.coinBalance, 80);
    assert.equal(model.coinsAwardedToday, 100);
    assert.equal(model.dailyAwardStatus, 'awarded');
    assert.equal(model.showCoinsAwarded, true);
  });

  it('does not project an old claim onto a new daily quest read model', () => {
    const rm = readModelFixture({
      questId: 'quest-002',
      questFingerprint: 'hero-qf-test-def',
      dateKey: '2026-04-29',
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 100,
      today: {
        awardStatus: 'in-progress',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'active');
    assert.equal(model.coinsAwardedToday, 0);
    assert.equal(model.coinBalance, 100);
    assert.equal(model.dailyAwardStatus, 'in-progress');
    assert.equal(model.showCoinsAwarded, false);
  });

  it('does not let a mismatched old claim enable coin UI on an economy-disabled read model', () => {
    const rm = readModelFixture({
      questId: 'quest-002',
      questFingerprint: 'hero-qf-test-def',
      dateKey: '2026-04-29',
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'active');
    assert.equal(model.coinsEnabled, false);
    assert.equal(model.coinBalance, 0);
    assert.equal(model.showCoinBalance, false);
    assert.equal(model.showCoinsAwarded, false);
  });

  it('does not project a claim that is missing strict quest identity fields', () => {
    const rm = readModelFixture({
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = true;
    rm.economy = {
      enabled: true,
      balance: 0,
      today: {
        awardStatus: 'in-progress',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'active');
    assert.equal(model.coinsEnabled, true);
    assert.equal(model.coinBalance, 0);
    assert.equal(model.coinsAwardedToday, 0);
    assert.equal(model.showCoinsAwarded, false);
  });

  it('prefers a matching completed read model over old claim economy when economy is disabled', () => {
    const rm = readModelFixture({
      progress: {
        status: 'completed',
        effortCompleted: 6,
        effortPlanned: 6,
        completedTaskIds: ['task-001'],
      },
    });
    rm.version = 5;
    rm.coinsEnabled = false;
    rm.economy = {
      enabled: false,
      balance: 0,
      today: {
        awardStatus: 'not-eligible',
        coinsAwarded: 0,
      },
    };
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-001',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
      dailyCoinsAlreadyAwarded: false,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.coinsEnabled, false);
    assert.equal(model.coinBalance, 0);
    assert.equal(model.coinsAwardedToday, 0);
    assert.equal(model.dailyAwardStatus, 'not-eligible');
    assert.equal(model.showCoinBalance, false);
    assert.equal(model.showCoinsAwarded, false);
  });

  it('includes pendingCompletedHeroSession from readModel', () => {
    const pending = {
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      taskId: 'task-001',
      practiceSessionId: 'ps-001',
    };
    const rm = readModelFixture({ pendingCompletedHeroSession: pending });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.deepEqual(model.pendingCompletedHeroSession, pending);
  });

  it('pendingCompletedHeroSession is null when not present', () => {
    const rm = readModelFixture();
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.pendingCompletedHeroSession, null);
  });

  it('canClaim is true when readModel.claim.enabled is true', () => {
    const rm = readModelFixture({ claim: { enabled: true } });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.canClaim, true);
  });

  it('canClaim is false when readModel.claim is absent', () => {
    const rm = readModelFixture({ claim: null });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.canClaim, false);
  });

  it('effortPlanned comes from dailyQuest field (backwards compat)', () => {
    const rm = readModelFixture({ effortPlanned: 5 });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.effortPlanned, 5);
  });
});

// ---------------------------------------------------------------------------
// isHeroSessionTerminal — auto-claim trigger conditions
// ---------------------------------------------------------------------------

describe('isHeroSessionTerminal — auto-claim trigger guard', () => {
  it('returns true for grammar at summary phase with no session', () => {
    assert.equal(isHeroSessionTerminal('grammar', 'summary', false), true);
  });

  it('returns true for grammar at dashboard phase with no session', () => {
    assert.equal(isHeroSessionTerminal('grammar', 'dashboard', false), true);
  });

  it('returns false for grammar when session is present', () => {
    assert.equal(isHeroSessionTerminal('grammar', 'summary', true), false);
  });

  it('returns true for spelling at idle phase with no session', () => {
    assert.equal(isHeroSessionTerminal('spelling', 'idle', false), true);
  });

  it('returns true for spelling at dashboard phase with no session', () => {
    assert.equal(isHeroSessionTerminal('spelling', 'dashboard', false), true);
  });

  it('returns true for spelling at complete phase with no session', () => {
    assert.equal(isHeroSessionTerminal('spelling', 'complete', false), true);
  });

  it('returns false for spelling when session is present', () => {
    assert.equal(isHeroSessionTerminal('spelling', 'idle', true), false);
  });

  it('returns true for punctuation at summary phase with no session', () => {
    assert.equal(isHeroSessionTerminal('punctuation', 'summary', false), true);
  });

  it('returns true for punctuation at complete phase with no session', () => {
    assert.equal(isHeroSessionTerminal('punctuation', 'complete', false), true);
  });

  it('returns true for punctuation at idle phase with no session', () => {
    assert.equal(isHeroSessionTerminal('punctuation', 'idle', false), true);
  });

  it('returns false for punctuation when session is present', () => {
    assert.equal(isHeroSessionTerminal('punctuation', 'summary', true), false);
  });

  it('returns false for unknown subject', () => {
    assert.equal(isHeroSessionTerminal('unknown', 'summary', false), false);
  });
});

// ---------------------------------------------------------------------------
// Auto-claim trigger logic — simulated state checks
// ---------------------------------------------------------------------------

describe('auto-claim trigger logic (pure state checks)', () => {
  it('auto-claim fires when isHeroSessionTerminal returns true and lastLaunch exists', () => {
    const lastLaunch = lastLaunchFixture({ subjectId: 'spelling' });
    const heroUi = heroUiFixture({ status: 'ready', lastLaunch });
    // Simulate: subject is now terminal
    const phase = 'idle';
    const sessionPresent = false;

    // Guard conditions that would trigger auto-claim:
    const shouldAutoClaim =
      heroUi.lastLaunch !== null &&
      heroUi.status !== 'claiming' &&
      heroUi.lastLaunch.subjectId === 'spelling' &&
      isHeroSessionTerminal('spelling', phase, sessionPresent);

    assert.equal(shouldAutoClaim, true);
  });

  it('auto-claim does NOT fire when already claiming (deduplication)', () => {
    const lastLaunch = lastLaunchFixture({ subjectId: 'spelling' });
    const heroUi = heroUiFixture({ status: 'claiming', lastLaunch });
    const phase = 'idle';
    const sessionPresent = false;

    const shouldAutoClaim =
      heroUi.lastLaunch !== null &&
      heroUi.status !== 'claiming' &&
      heroUi.lastLaunch.subjectId === 'spelling' &&
      isHeroSessionTerminal('spelling', phase, sessionPresent);

    assert.equal(shouldAutoClaim, false);
  });

  it('auto-claim does NOT fire when lastLaunch is null', () => {
    const heroUi = heroUiFixture({ status: 'ready', lastLaunch: null });
    const phase = 'idle';
    const sessionPresent = false;

    const shouldAutoClaim =
      heroUi.lastLaunch !== null &&
      heroUi.status !== 'claiming' &&
      isHeroSessionTerminal('spelling', phase, sessionPresent);

    assert.equal(shouldAutoClaim, false);
  });

  it('auto-claim does NOT fire when subject does not match lastLaunch', () => {
    const lastLaunch = lastLaunchFixture({ subjectId: 'grammar' });
    const heroUi = heroUiFixture({ status: 'ready', lastLaunch });
    const phase = 'idle';
    const sessionPresent = false;

    const shouldAutoClaim =
      heroUi.lastLaunch !== null &&
      heroUi.status !== 'claiming' &&
      heroUi.lastLaunch.subjectId === 'spelling' &&
      isHeroSessionTerminal('spelling', phase, sessionPresent);

    assert.equal(shouldAutoClaim, false);
  });

  it('auto-claim does NOT fire when subject is not terminal', () => {
    const lastLaunch = lastLaunchFixture({ subjectId: 'spelling' });
    const heroUi = heroUiFixture({ status: 'ready', lastLaunch });
    const phase = 'session';
    const sessionPresent = true;

    const shouldAutoClaim =
      heroUi.lastLaunch !== null &&
      heroUi.status !== 'claiming' &&
      heroUi.lastLaunch.subjectId === 'spelling' &&
      isHeroSessionTerminal('spelling', phase, sessionPresent);

    assert.equal(shouldAutoClaim, false);
  });
});

// ---------------------------------------------------------------------------
// Dashboard-load repair logic — simulated state checks
// ---------------------------------------------------------------------------

describe('dashboard-load repair logic (pure state checks)', () => {
  it('repair fires when pendingCompletedHeroSession exists and status is not claiming', () => {
    const pending = {
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      taskId: 'task-001',
      practiceSessionId: 'ps-001',
    };
    const rm = readModelFixture({ pendingCompletedHeroSession: pending });
    const heroUi = heroUiFixture({ readModel: rm, status: 'ready' });

    const shouldRepair =
      heroUi.readModel?.pendingCompletedHeroSession !== null &&
      heroUi.readModel?.pendingCompletedHeroSession !== undefined &&
      heroUi.status !== 'claiming';

    assert.equal(shouldRepair, true);
  });

  it('repair does NOT fire when already claiming', () => {
    const pending = {
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      taskId: 'task-001',
      practiceSessionId: 'ps-001',
    };
    const rm = readModelFixture({ pendingCompletedHeroSession: pending });
    const heroUi = heroUiFixture({ readModel: rm, status: 'claiming' });

    const shouldRepair =
      heroUi.readModel?.pendingCompletedHeroSession !== null &&
      heroUi.readModel?.pendingCompletedHeroSession !== undefined &&
      heroUi.status !== 'claiming';

    assert.equal(shouldRepair, false);
  });

  it('repair does NOT fire when pendingCompletedHeroSession is null', () => {
    const rm = readModelFixture({ pendingCompletedHeroSession: null });
    const heroUi = heroUiFixture({ readModel: rm, status: 'ready' });

    const shouldRepair =
      heroUi.readModel?.pendingCompletedHeroSession !== null &&
      heroUi.readModel?.pendingCompletedHeroSession !== undefined &&
      heroUi.status !== 'claiming';

    assert.equal(shouldRepair, false);
  });

  it('repair uses server read model data — independent of lastLaunch', () => {
    const pending = {
      questId: 'quest-002',
      questFingerprint: 'hero-qf-server',
      taskId: 'task-002',
      practiceSessionId: 'ps-002',
    };
    const rm = readModelFixture({ pendingCompletedHeroSession: pending });
    // lastLaunch is null — repair works from server read model only
    const heroUi = heroUiFixture({ readModel: rm, status: 'ready', lastLaunch: null });

    const shouldRepair =
      heroUi.readModel?.pendingCompletedHeroSession !== null &&
      heroUi.readModel?.pendingCompletedHeroSession !== undefined &&
      heroUi.status !== 'claiming';

    assert.equal(shouldRepair, true);
    assert.equal(heroUi.readModel.pendingCompletedHeroSession.questId, 'quest-002');
    assert.equal(heroUi.readModel.pendingCompletedHeroSession.taskId, 'task-002');
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — next Hero task progression
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — next task progression', () => {
  it('advances the start CTA to the next uncompleted launchable task', () => {
    const rm = readModelFixture({
      effortPlanned: 12,
      tasks: [
        { taskId: 'task-a', subjectId: 'spelling', launchStatus: 'launchable', completionStatus: 'completed' },
        { taskId: 'task-b', subjectId: 'grammar', launchStatus: 'launchable', completionStatus: 'not-started' },
      ],
      progress: {
        status: 'active',
        effortCompleted: 6,
        effortPlanned: 12,
        completedTaskIds: ['task-a'],
      },
    });
    const heroUi = heroUiFixture({ readModel: rm });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.nextTask.taskId, 'task-b');
    assert.equal(model.canStart, true);
    assert.deepEqual(model.completedTaskIds, ['task-a']);
  });

  it('projects a just-claimed task so the dashboard advances before read-model refresh', () => {
    const rm = readModelFixture({
      effortPlanned: 12,
      tasks: [
        { taskId: 'task-a', subjectId: 'spelling', launchStatus: 'launchable', completionStatus: 'not-started' },
        { taskId: 'task-b', subjectId: 'grammar', launchStatus: 'launchable', completionStatus: 'not-started' },
      ],
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 12,
        completedTaskIds: [],
      },
    });
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-a',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'active',
      effortCompleted: 6,
      effortPlanned: 12,
      coinsEnabled: false,
      coinsAwarded: 0,
      coinBalance: 0,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.deepEqual(model.completedTaskIds, ['task-a']);
    assert.equal(model.effortCompleted, 6);
    assert.equal(model.nextTask.taskId, 'task-b');
    assert.equal(model.canStart, true);
  });

  it('does not offer a start CTA after a matching final claim completes the daily quest', () => {
    const rm = readModelFixture({
      effortPlanned: 6,
      tasks: [
        { taskId: 'task-a', subjectId: 'spelling', launchStatus: 'launchable', completionStatus: 'not-started' },
      ],
      progress: {
        status: 'active',
        effortCompleted: 0,
        effortPlanned: 6,
        completedTaskIds: [],
      },
    });
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-a',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      effortCompleted: 6,
      effortPlanned: 6,
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.equal(model.nextTask, null);
    assert.equal(model.canStart, false);
  });

  it('clears the next task when a final claim completes the daily quest before the read model catches up', () => {
    const rm = readModelFixture({
      effortPlanned: 12,
      tasks: [
        { taskId: 'task-a', subjectId: 'spelling', launchStatus: 'launchable', completionStatus: 'not-started' },
        { taskId: 'task-b', subjectId: 'grammar', launchStatus: 'launchable', completionStatus: 'not-started' },
      ],
      progress: {
        status: 'active',
        effortCompleted: 6,
        effortPlanned: 12,
        completedTaskIds: ['task-a'],
      },
    });
    const lastClaim = {
      status: 'claimed',
      taskId: 'task-b',
      dateKey: '2026-04-28',
      questId: 'quest-001',
      questFingerprint: 'hero-qf-test-abc',
      dailyStatus: 'completed',
      effortCompleted: 12,
      effortPlanned: 12,
      coinsEnabled: true,
      coinsAwarded: 100,
      coinBalance: 100,
    };
    const heroUi = heroUiFixture({ readModel: rm, lastClaim });
    const model = buildHeroHomeModel(heroUi);

    assert.equal(model.dailyStatus, 'completed');
    assert.deepEqual(model.completedTaskIds, ['task-a', 'task-b']);
    assert.equal(model.effortCompleted, 12);
    assert.equal(model.nextTask, null);
    assert.equal(model.canStart, false);
  });
});

// ---------------------------------------------------------------------------
// buildHeroHomeModel — backwards compatibility (P2 fields preserved)
// ---------------------------------------------------------------------------

describe('buildHeroHomeModel — P2 backward compatibility', () => {
  it('preserves all P2 fields when progress/claim fields are absent', () => {
    const tasks = [
      { taskId: 'task-001', subjectId: 'spelling', launchStatus: 'launchable', childLabel: 'Spelling', childReason: 'Practice' },
    ];
    const rm = readModelFixture({ tasks });
    const heroUi = heroUiFixture({ readModel: rm, lastLaunch: lastLaunchFixture() });
    const model = buildHeroHomeModel(heroUi);

    // P2 fields
    assert.equal(model.status, 'ready');
    assert.equal(model.enabled, true);
    assert.deepEqual(model.nextTask, tasks[0]);
    assert.equal(model.canStart, true);
    assert.equal(model.canContinue, false);
    assert.equal(model.error, '');
    assert.equal(model.effortPlanned, 3);
    assert.deepEqual(model.eligibleSubjects, ['spelling', 'grammar']);
    assert.deepEqual(model.lastLaunch, heroUi.lastLaunch);

    // P3 U10 fields default safely
    assert.equal(model.progress, null);
    assert.equal(model.claiming, false);
    assert.equal(model.lastClaim, null);
    assert.equal(model.pendingCompletedHeroSession, null);
    assert.equal(model.canClaim, false);
    assert.equal(model.dailyStatus, 'none');
    assert.equal(model.effortCompleted, 0);
    assert.deepEqual(model.completedTaskIds, []);
  });

  it('lastLaunch is preserved from heroUi', () => {
    const launch = lastLaunchFixture();
    const heroUi = heroUiFixture({ lastLaunch: launch, readModel: readModelFixture() });
    const model = buildHeroHomeModel(heroUi);

    assert.deepEqual(model.lastLaunch, launch);
  });

  it('null heroUi returns safe defaults for all fields', () => {
    const model = buildHeroHomeModel(null);

    assert.equal(model.status, 'idle');
    assert.equal(model.enabled, false);
    assert.equal(model.nextTask, null);
    assert.equal(model.canStart, false);
    assert.equal(model.claiming, false);
    assert.equal(model.lastClaim, null);
    assert.equal(model.progress, null);
    assert.equal(model.pendingCompletedHeroSession, null);
  });
});
