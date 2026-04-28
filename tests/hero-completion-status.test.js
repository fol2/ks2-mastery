import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveTaskCompletionStatus,
  deriveDailyCompletionStatus,
  isHeroSessionTerminal,
} from '../shared/hero/completion-status.js';

// ── deriveTaskCompletionStatus ────────────────────────────────────

test('deriveTaskCompletionStatus with null returns not-started', () => {
  assert.equal(deriveTaskCompletionStatus(null, null), 'not-started');
});

test('deriveTaskCompletionStatus with undefined returns not-started', () => {
  assert.equal(deriveTaskCompletionStatus(undefined, null), 'not-started');
});

test('deriveTaskCompletionStatus with status=completed returns completed', () => {
  const task = { taskId: 't1', status: 'completed' };
  assert.equal(deriveTaskCompletionStatus(task, null), 'completed');
});

test('deriveTaskCompletionStatus with status=blocked returns blocked', () => {
  const task = { taskId: 't1', status: 'blocked' };
  assert.equal(deriveTaskCompletionStatus(task, null), 'blocked');
});

test('deriveTaskCompletionStatus with status=started and active session matching returns in-progress', () => {
  const task = { taskId: 't1', status: 'started' };
  const activeSession = { taskId: 't1' };
  assert.equal(deriveTaskCompletionStatus(task, activeSession), 'in-progress');
});

test('deriveTaskCompletionStatus with status=started and no active session returns completed-unclaimed', () => {
  const task = { taskId: 't1', status: 'started' };
  assert.equal(deriveTaskCompletionStatus(task, null), 'completed-unclaimed');
});

test('deriveTaskCompletionStatus with status=started and non-matching session returns completed-unclaimed', () => {
  const task = { taskId: 't1', status: 'started' };
  const activeSession = { taskId: 't2' }; // different task
  assert.equal(deriveTaskCompletionStatus(task, activeSession), 'completed-unclaimed');
});

test('deriveTaskCompletionStatus with status=planned returns not-started', () => {
  const task = { taskId: 't1', status: 'planned' };
  assert.equal(deriveTaskCompletionStatus(task, null), 'not-started');
});

// ── deriveDailyCompletionStatus ───────────────────────────────────

test('deriveDailyCompletionStatus with null returns none', () => {
  assert.equal(deriveDailyCompletionStatus(null), 'none');
});

test('deriveDailyCompletionStatus with status=completed returns completed', () => {
  const daily = { status: 'completed', taskOrder: ['t1'], tasks: { t1: { status: 'completed' } } };
  assert.equal(deriveDailyCompletionStatus(daily), 'completed');
});

test('deriveDailyCompletionStatus with status=expired returns expired', () => {
  const daily = { status: 'expired', taskOrder: ['t1'], tasks: { t1: { status: 'planned' } } };
  assert.equal(deriveDailyCompletionStatus(daily), 'expired');
});

test('deriveDailyCompletionStatus with empty taskOrder returns none', () => {
  const daily = { status: 'active', taskOrder: [], tasks: {} };
  assert.equal(deriveDailyCompletionStatus(daily), 'none');
});

test('deriveDailyCompletionStatus with all tasks completed returns completed', () => {
  const daily = {
    status: 'active', // status field not yet updated
    taskOrder: ['t1', 't2'],
    tasks: {
      t1: { status: 'completed' },
      t2: { status: 'completed' },
    },
  };
  assert.equal(deriveDailyCompletionStatus(daily), 'completed');
});

test('deriveDailyCompletionStatus with partial completion returns active', () => {
  const daily = {
    status: 'active',
    taskOrder: ['t1', 't2'],
    tasks: {
      t1: { status: 'completed' },
      t2: { status: 'started' },
    },
  };
  assert.equal(deriveDailyCompletionStatus(daily), 'active');
});

// ── isHeroSessionTerminal ─────────────────────────────────────────

test('isHeroSessionTerminal for grammar with phase=summary no session returns true', () => {
  assert.equal(isHeroSessionTerminal('grammar', 'summary', false), true);
});

test('isHeroSessionTerminal for grammar with phase=dashboard no session returns true', () => {
  assert.equal(isHeroSessionTerminal('grammar', 'dashboard', false), true);
});

test('isHeroSessionTerminal for grammar with session present returns false', () => {
  assert.equal(isHeroSessionTerminal('grammar', 'summary', true), false);
});

test('isHeroSessionTerminal for grammar with non-terminal phase returns false', () => {
  assert.equal(isHeroSessionTerminal('grammar', 'practice', false), false);
});

test('isHeroSessionTerminal for spelling with phase=idle no session returns true', () => {
  assert.equal(isHeroSessionTerminal('spelling', 'idle', false), true);
});

test('isHeroSessionTerminal for spelling with phase=dashboard no session returns true', () => {
  assert.equal(isHeroSessionTerminal('spelling', 'dashboard', false), true);
});

test('isHeroSessionTerminal for spelling with phase=complete no session returns true', () => {
  assert.equal(isHeroSessionTerminal('spelling', 'complete', false), true);
});

test('isHeroSessionTerminal for spelling with session present returns false', () => {
  assert.equal(isHeroSessionTerminal('spelling', 'idle', true), false);
});

test('isHeroSessionTerminal for punctuation with phase=summary no session returns true', () => {
  assert.equal(isHeroSessionTerminal('punctuation', 'summary', false), true);
});

test('isHeroSessionTerminal for punctuation with phase=complete no session returns true', () => {
  assert.equal(isHeroSessionTerminal('punctuation', 'complete', false), true);
});

test('isHeroSessionTerminal for punctuation with phase=idle no session returns true', () => {
  assert.equal(isHeroSessionTerminal('punctuation', 'idle', false), true);
});

test('isHeroSessionTerminal for punctuation with session present returns false', () => {
  assert.equal(isHeroSessionTerminal('punctuation', 'summary', true), false);
});

test('isHeroSessionTerminal for unknown subject returns false', () => {
  assert.equal(isHeroSessionTerminal('arithmetic', 'summary', false), false);
});

// ── No economy vocabulary in exports ──────────────────────────────

test('completion-status exports contain no economy vocabulary', () => {
  const exportNames = [
    'deriveTaskCompletionStatus',
    'deriveDailyCompletionStatus',
    'isHeroSessionTerminal',
  ];
  const forbidden = ['coins', 'reward', 'xp', 'balance', 'shop', 'monster'];
  for (const name of exportNames) {
    for (const word of forbidden) {
      assert.ok(!name.toLowerCase().includes(word), `${name} must not contain "${word}"`);
    }
  }
});
