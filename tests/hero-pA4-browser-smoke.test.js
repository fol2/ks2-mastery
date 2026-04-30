import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  STEPS,
  validateStep,
  parseArgs,
} from '../scripts/hero-pA4-external-cohort-smoke.mjs';

// ── Mock data factories ───────────────────────────────────────────────

function makeReadModelVisible() {
  return {
    version: 6,
    mode: 'progress',
    ui: { enabled: true, surface: 'dashboard-card', reason: 'enabled', copyVersion: 'v2' },
    dailyQuest: {
      questId: 'quest-abc',
      status: 'active',
      effortTarget: 3,
      effortPlanned: 3,
      tasks: [
        {
          taskId: 'task-001',
          subjectId: 'grammar',
          intent: 'practice',
          launcher: 'session-launcher',
          effortTarget: 1,
          completionStatus: 'not-started',
          launchStatus: 'launchable',
          heroContext: { source: 'hero-mode', questId: 'quest-abc', taskId: 'task-001' },
        },
      ],
    },
    questFingerprint: 'fp-12345',
    dateKey: '2026-04-30',
    pendingCompletedHeroSession: null,
    economy: { enabled: true, version: 1, balance: 200, lifetimeEarned: 200, lifetimeSpent: 0 },
    camp: {
      enabled: true,
      version: 1,
      monsters: [
        { monsterId: 'spark', displayName: 'Spark', owned: true, stage: 1 },
        { monsterId: 'blaze', displayName: 'Blaze', owned: false, stage: 0 },
      ],
      selectedMonsterId: 'spark',
    },
    progress: { enabled: true, canClaim: false, pendingClaimTaskId: null },
  };
}

function makeStartTaskResponse() {
  return {
    heroLaunch: {
      version: 2,
      status: 'started',
      questId: 'quest-abc',
      taskId: 'task-001',
      dateKey: '2026-04-30',
      subjectId: 'grammar',
      intent: 'practice',
      launcher: 'session-launcher',
      effortTarget: 1,
      subjectCommand: 'start-session',
      coinsEnabled: true,
      claimEnabled: true,
      childVisible: true,
    },
  };
}

function makeReturnReadModel() {
  const model = makeReadModelVisible();
  model.pendingCompletedHeroSession = {
    taskId: 'task-001',
    questId: 'quest-abc',
    questFingerprint: 'fp-12345',
    subjectId: 'grammar',
    practiceSessionId: 'ps-999',
  };
  model.progress.canClaim = true;
  model.progress.pendingClaimTaskId = 'task-001';
  return model;
}

function makeClaimResponse() {
  return {
    award: {
      status: 'granted',
      taskId: 'task-001',
      questId: 'quest-abc',
      coins: 100,
      ledgerEntryId: 'le-001',
    },
  };
}

function makePostClaimReadModel() {
  const model = makeReadModelVisible();
  model.economy.balance = 300; // increased from 200 by 100
  model.pendingCompletedHeroSession = null;
  return model;
}

function makeRollbackResponse() {
  return {
    error: 'Hero shadow read model is not available.',
    code: 'hero_shadow_disabled',
  };
}

// ── Step list ─────────────────────────────────────────────────────────

describe('pA4 browser smoke: STEPS constant', () => {
  it('exports all 8 critical flow steps', () => {
    assert.equal(STEPS.length, 8);
    assert.deepEqual(STEPS, [
      'hero-visible',
      'start-task',
      'subject-session',
      'return-from-session',
      'claim',
      'coins',
      'camp',
      'rollback-hidden',
    ]);
  });
});

// ── Individual step validators ────────────────────────────────────────

describe('pA4 browser smoke: hero-visible step', () => {
  it('passes when ui.enabled is true', () => {
    const result = validateStep('hero-visible', makeReadModelVisible());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('ui.enabled=true'));
  });

  it('fails when ui.enabled is false', () => {
    const model = makeReadModelVisible();
    model.ui.enabled = false;
    model.ui.reason = 'shadow-disabled';
    const result = validateStep('hero-visible', model);
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('shadow-disabled'));
  });

  it('fails on null response', () => {
    const result = validateStep('hero-visible', null);
    assert.equal(result.pass, false);
  });

  it('fails on API error response', () => {
    const result = validateStep('hero-visible', { error: 'HTTP 500' });
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('API error'));
  });

  it('non-cohort account: correctly reports hero not visible', () => {
    const model = makeReadModelVisible();
    model.ui.enabled = false;
    model.ui.reason = 'no-eligible-subjects';
    const result = validateStep('hero-visible', model, { expectHidden: true });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('not visible'));
  });

  it('non-cohort account: fails if hero IS visible', () => {
    const model = makeReadModelVisible();
    const result = validateStep('hero-visible', model, { expectHidden: true });
    assert.equal(result.pass, false);
  });
});

describe('pA4 browser smoke: start-task step', () => {
  it('passes with valid heroLaunch response', () => {
    const result = validateStep('start-task', makeStartTaskResponse());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('task-001'));
  });

  it('fails when heroLaunch is missing', () => {
    const result = validateStep('start-task', { ok: true });
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('Missing heroLaunch'));
  });

  it('fails when heroLaunch lacks questId', () => {
    const resp = makeStartTaskResponse();
    resp.heroLaunch.questId = '';
    const result = validateStep('start-task', resp);
    assert.equal(result.pass, false);
  });

  it('fails on API error', () => {
    const result = validateStep('start-task', { error: 'HTTP 409' });
    assert.equal(result.pass, false);
  });
});

describe('pA4 browser smoke: subject-session step', () => {
  it('passes when subjectId and subjectCommand present', () => {
    const result = validateStep('subject-session', makeStartTaskResponse());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('grammar'));
    assert.ok(result.detail.includes('start-session'));
  });

  it('fails when subjectId missing', () => {
    const resp = makeStartTaskResponse();
    resp.heroLaunch.subjectId = '';
    const result = validateStep('subject-session', resp);
    assert.equal(result.pass, false);
  });

  it('fails when subjectCommand missing', () => {
    const resp = makeStartTaskResponse();
    resp.heroLaunch.subjectCommand = '';
    const result = validateStep('subject-session', resp);
    assert.equal(result.pass, false);
  });

  it('dead CTA: fails when heroLaunch absent', () => {
    const result = validateStep('subject-session', {});
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('Missing heroLaunch'));
  });
});

describe('pA4 browser smoke: return-from-session step', () => {
  it('passes when pendingCompletedHeroSession present', () => {
    const result = validateStep('return-from-session', makeReturnReadModel());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('task-001'));
  });

  it('fails when pendingCompletedHeroSession is null', () => {
    const model = makeReadModelVisible();
    model.pendingCompletedHeroSession = null;
    const result = validateStep('return-from-session', model);
    assert.equal(result.pass, false);
  });

  it('fails on API error', () => {
    const result = validateStep('return-from-session', { error: 'Timeout after 15s' });
    assert.equal(result.pass, false);
  });
});

describe('pA4 browser smoke: claim step', () => {
  it('passes when award is granted', () => {
    const result = validateStep('claim', makeClaimResponse());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('granted'));
  });

  it('fails when claim is rejected', () => {
    const result = validateStep('claim', {
      award: { status: 'rejected', reason: 'duplicate-claim' },
    });
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('rejected'));
  });

  it('fails when no award in response', () => {
    const result = validateStep('claim', { ok: true });
    assert.equal(result.pass, false);
  });

  it('accepts claimResult as alternative to award', () => {
    const result = validateStep('claim', {
      claimResult: { status: 'ok', coins: 100 },
    });
    assert.equal(result.pass, true);
  });
});

describe('pA4 browser smoke: coins step', () => {
  it('passes when balance increased by 100', () => {
    const result = validateStep('coins', makePostClaimReadModel(), { previousBalance: 200 });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('300'));
  });

  it('fails when balance did not increase', () => {
    const model = makePostClaimReadModel();
    model.economy.balance = 200; // no increase
    const result = validateStep('coins', model, { previousBalance: 200 });
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('did not increase'));
  });

  it('fails when economy block missing', () => {
    const model = makeReadModelVisible();
    delete model.economy;
    const result = validateStep('coins', model, { previousBalance: 0 });
    assert.equal(result.pass, false);
  });

  it('uses 0 as default previousBalance', () => {
    const model = makePostClaimReadModel();
    model.economy.balance = 100;
    const result = validateStep('coins', model, {});
    assert.equal(result.pass, true);
  });
});

describe('pA4 browser smoke: camp step', () => {
  it('passes when camp.monsters is present and non-empty', () => {
    const result = validateStep('camp', makePostClaimReadModel(), { campEnabled: true });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('2 monster'));
  });

  it('fails when camp block is missing', () => {
    const model = makePostClaimReadModel();
    delete model.camp;
    const result = validateStep('camp', model, { campEnabled: true });
    assert.equal(result.pass, false);
  });

  it('fails when camp.monsters is empty', () => {
    const model = makePostClaimReadModel();
    model.camp.monsters = [];
    const result = validateStep('camp', model, { campEnabled: true });
    assert.equal(result.pass, false);
  });

  it('passes when camp disabled and camp block absent (flag off)', () => {
    const model = makePostClaimReadModel();
    delete model.camp;
    const result = validateStep('camp', model, { campEnabled: false });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('skipped'));
  });

  it('passes when camp disabled and camp.enabled=false', () => {
    const model = makePostClaimReadModel();
    model.camp = { enabled: false };
    const result = validateStep('camp', model, { campEnabled: false });
    assert.equal(result.pass, true);
  });
});

describe('pA4 browser smoke: rollback-hidden step', () => {
  it('passes with hero_shadow_disabled error code (flags off)', () => {
    const result = validateStep('rollback-hidden', makeRollbackResponse());
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('hero_shadow_disabled'));
  });

  it('passes when ui.enabled=false (flags off)', () => {
    const model = makeReadModelVisible();
    model.ui.enabled = false;
    const result = validateStep('rollback-hidden', model);
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('hidden'));
  });

  it('fails when hero is still visible (flags off regression)', () => {
    const result = validateStep('rollback-hidden', makeReadModelVisible());
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('still visible'));
  });

  it('passes on generic API error (e.g. 404)', () => {
    const result = validateStep('rollback-hidden', { error: 'HTTP 404', code: 'not_found' });
    assert.equal(result.pass, true);
  });
});

// ── Full flow simulation ──────────────────────────────────────────────

describe('pA4 browser smoke: full flow all-pass', () => {
  it('all 8 steps pass with correctly mocked data', () => {
    const results = [];

    // Step 1: hero-visible
    results.push({ step: 'hero-visible', ...validateStep('hero-visible', makeReadModelVisible()) });

    // Step 2: start-task
    results.push({ step: 'start-task', ...validateStep('start-task', makeStartTaskResponse()) });

    // Step 3: subject-session
    results.push({ step: 'subject-session', ...validateStep('subject-session', makeStartTaskResponse()) });

    // Step 4: return-from-session
    results.push({ step: 'return-from-session', ...validateStep('return-from-session', makeReturnReadModel()) });

    // Step 5: claim
    results.push({ step: 'claim', ...validateStep('claim', makeClaimResponse()) });

    // Step 6: coins
    results.push({ step: 'coins', ...validateStep('coins', makePostClaimReadModel(), { previousBalance: 200 }) });

    // Step 7: camp
    results.push({ step: 'camp', ...validateStep('camp', makePostClaimReadModel(), { campEnabled: true }) });

    // Step 8: rollback-hidden
    results.push({ step: 'rollback-hidden', ...validateStep('rollback-hidden', makeRollbackResponse()) });

    assert.equal(results.length, 8);
    assert.ok(results.every(r => r.pass), `Some steps failed: ${results.filter(r => !r.pass).map(r => r.step).join(', ')}`);

    // Simulated exit code
    const exitCode = results.every(r => r.pass) ? 0 : 1;
    assert.equal(exitCode, 0);
  });
});

describe('pA4 browser smoke: partial failure (dead CTA)', () => {
  it('subject-session failure produces exit code 1', () => {
    const results = [];

    // Steps 1-2 pass
    results.push({ step: 'hero-visible', ...validateStep('hero-visible', makeReadModelVisible()) });
    results.push({ step: 'start-task', ...validateStep('start-task', makeStartTaskResponse()) });

    // Step 3: dead CTA — heroLaunch has no subjectCommand
    const deadCta = makeStartTaskResponse();
    deadCta.heroLaunch.subjectCommand = '';
    results.push({ step: 'subject-session', ...validateStep('subject-session', deadCta) });

    const exitCode = results.every(r => r.pass) ? 0 : 1;
    assert.equal(exitCode, 1);
    assert.equal(results[2].pass, false);
    assert.ok(results[2].detail.includes('launcher info missing'));
  });
});

describe('pA4 browser smoke: external cohort account (overrideStatus=external)', () => {
  it('flow works for external cohort account when hero is visible', () => {
    // External cohort accounts still get ui.enabled=true via per-account override
    const model = makeReadModelVisible();
    const result = validateStep('hero-visible', model);
    assert.equal(result.pass, true);
  });

  it('start-task works for external cohort account', () => {
    const result = validateStep('start-task', makeStartTaskResponse());
    assert.equal(result.pass, true);
  });

  it('full flow passes for external cohort', () => {
    const steps = [
      validateStep('hero-visible', makeReadModelVisible()),
      validateStep('start-task', makeStartTaskResponse()),
      validateStep('subject-session', makeStartTaskResponse()),
      validateStep('return-from-session', makeReturnReadModel()),
      validateStep('claim', makeClaimResponse()),
      validateStep('coins', makePostClaimReadModel(), { previousBalance: 200 }),
      validateStep('camp', makePostClaimReadModel(), { campEnabled: true }),
      validateStep('rollback-hidden', makeRollbackResponse()),
    ];
    assert.ok(steps.every(r => r.pass));
  });
});

describe('pA4 browser smoke: non-cohort account', () => {
  it('step 1 correctly reports hero not visible', () => {
    const model = makeReadModelVisible();
    model.ui.enabled = false;
    model.ui.reason = 'no-eligible-subjects';
    const result = validateStep('hero-visible', model, { expectHidden: true });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('not visible'));
  });

  it('non-cohort without expectHidden context fails step 1', () => {
    const model = makeReadModelVisible();
    model.ui.enabled = false;
    model.ui.reason = 'shadow-disabled';
    const result = validateStep('hero-visible', model);
    assert.equal(result.pass, false);
  });
});

describe('pA4 browser smoke: rollback (all flags off)', () => {
  it('step 8 correctly reports hidden when hero_shadow_disabled returned', () => {
    const result = validateStep('rollback-hidden', {
      error: 'Hero shadow read model is not available.',
      code: 'hero_shadow_disabled',
    });
    assert.equal(result.pass, true);
    assert.ok(result.detail.includes('hero_shadow_disabled'));
  });

  it('step 8 correctly reports hidden when ui.enabled=false', () => {
    const result = validateStep('rollback-hidden', {
      ui: { enabled: false, reason: 'shadow-disabled' },
    });
    assert.equal(result.pass, true);
  });

  it('step 8 fails if hero still visible after rollback', () => {
    const result = validateStep('rollback-hidden', makeReadModelVisible());
    assert.equal(result.pass, false);
  });
});

// ── Unknown step ──────────────────────────────────────────────────────

describe('pA4 browser smoke: unknown step', () => {
  it('returns fail for unknown step name', () => {
    const result = validateStep('nonexistent-step', {});
    assert.equal(result.pass, false);
    assert.ok(result.detail.includes('Unknown step'));
  });
});

// ── parseArgs ─────────────────────────────────────────────────────────

describe('pA4 browser smoke: parseArgs', () => {
  it('defaults base-url to http://localhost:8787', () => {
    const args = parseArgs(['node', 'script.mjs']);
    assert.equal(args.baseUrl, 'http://localhost:8787');
    assert.equal(args.accountId, '');
  });

  it('--account-id sets accountId', () => {
    const args = parseArgs(['node', 'script.mjs', '--account-id', 'acc-ext-123']);
    assert.equal(args.accountId, 'acc-ext-123');
  });

  it('--account-id= form works', () => {
    const args = parseArgs(['node', 'script.mjs', '--account-id=acc-xyz']);
    assert.equal(args.accountId, 'acc-xyz');
  });

  it('--base-url sets baseUrl', () => {
    const args = parseArgs(['node', 'script.mjs', '--base-url', 'https://staging.example.com']);
    assert.equal(args.baseUrl, 'https://staging.example.com');
  });

  it('--base-url strips trailing slash', () => {
    const args = parseArgs(['node', 'script.mjs', '--base-url', 'http://localhost:8787/']);
    assert.equal(args.baseUrl, 'http://localhost:8787');
  });

  it('--base-url= form works', () => {
    const args = parseArgs(['node', 'script.mjs', '--base-url=http://custom:9000']);
    assert.equal(args.baseUrl, 'http://custom:9000');
  });
});
