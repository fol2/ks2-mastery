import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORBIDDEN_CLAIM_FIELDS,
  REQUIRED_CLAIM_FIELDS,
  validateClaimRequest,
  isAlreadyCompleted,
  buildClaimRecord,
} from '../shared/hero/claim-contract.js';

// ── validateClaimRequest ──────────────────────────────────────────

test('validateClaimRequest with valid body returns { valid: true, errors: [] }', () => {
  const body = {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    taskId: 't1',
    requestId: 'req-1',
    expectedLearnerRevision: 5,
  };
  const result = validateClaimRequest(body);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateClaimRequest with forbidden fields returns errors listing each', () => {
  const body = {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    taskId: 't1',
    requestId: 'req-1',
    expectedLearnerRevision: 5,
    coins: 100,
    reward: 'badge',
    shop: { item: 'hat' },
  };
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('coins')));
  assert.ok(result.errors.some(e => e.includes('reward')));
  assert.ok(result.errors.some(e => e.includes('shop')));
});

test('validateClaimRequest with missing required fields returns specific errors', () => {
  const body = {
    command: 'claim-task',
    // missing learnerId, questId, questFingerprint, taskId, requestId, expectedLearnerRevision
  };
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('learnerId')));
  assert.ok(result.errors.some(e => e.includes('questId')));
  assert.ok(result.errors.some(e => e.includes('questFingerprint')));
  assert.ok(result.errors.some(e => e.includes('taskId')));
  assert.ok(result.errors.some(e => e.includes('requestId')));
  assert.ok(result.errors.some(e => e.includes('expectedLearnerRevision')));
});

test('validateClaimRequest with null body returns errors', () => {
  const result = validateClaimRequest(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(e => e.includes('required')));
});

test('validateClaimRequest with wrong command returns error', () => {
  const body = {
    command: 'wrong-command',
    learnerId: 'learner-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    taskId: 't1',
    requestId: 'req-1',
    expectedLearnerRevision: 5,
  };
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('command')));
});

test('validateClaimRequest with non-number expectedLearnerRevision returns error', () => {
  const body = {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    taskId: 't1',
    requestId: 'req-1',
    expectedLearnerRevision: 'not-a-number',
  };
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('expectedLearnerRevision must be a number')));
});

// ── isAlreadyCompleted ────────────────────────────────────────────

test('isAlreadyCompleted with completed task returns true', () => {
  const progressState = {
    daily: {
      tasks: {
        t1: { taskId: 't1', status: 'completed' },
      },
    },
  };
  assert.equal(isAlreadyCompleted(progressState, 't1'), true);
});

test('isAlreadyCompleted with non-completed task returns false', () => {
  const progressState = {
    daily: {
      tasks: {
        t1: { taskId: 't1', status: 'started' },
      },
    },
  };
  assert.equal(isAlreadyCompleted(progressState, 't1'), false);
});

test('isAlreadyCompleted with null progressState returns false', () => {
  assert.equal(isAlreadyCompleted(null, 't1'), false);
});

test('isAlreadyCompleted with unknown taskId returns false', () => {
  const progressState = {
    daily: {
      tasks: {
        t1: { taskId: 't1', status: 'completed' },
      },
    },
  };
  assert.equal(isAlreadyCompleted(progressState, 't99'), false);
});

// ── buildClaimRecord ──────────────────────────────────────────────

test('buildClaimRecord produces correct shape', () => {
  const nowTs = 1714300000000;
  const record = buildClaimRecord({
    requestId: 'req-1',
    learnerId: 'learner-abc',
    dateKey: '2026-04-28',
    questId: 'quest-xyz',
    questFingerprint: 'fp-123',
    taskId: 't1',
    subjectId: 'grammar',
    practiceSessionId: 'sess-1',
    result: 'accepted',
    reason: null,
    nowTs,
  });

  assert.ok(record.claimId.startsWith('hero-claim-'));
  assert.equal(record.requestId, 'req-1');
  assert.equal(record.learnerId, 'learner-abc');
  assert.equal(record.dateKey, '2026-04-28');
  assert.equal(record.questId, 'quest-xyz');
  assert.equal(record.questFingerprint, 'fp-123');
  assert.equal(record.taskId, 't1');
  assert.equal(record.subjectId, 'grammar');
  assert.equal(record.practiceSessionId, 'sess-1');
  assert.equal(record.result, 'accepted');
  assert.equal(record.reason, null);
  assert.equal(record.createdAt, nowTs);
});

test('buildClaimRecord with no practiceSessionId defaults to null', () => {
  const record = buildClaimRecord({
    requestId: 'req-2',
    learnerId: 'learner-2',
    dateKey: '2026-04-28',
    questId: 'q2',
    questFingerprint: 'fp-2',
    taskId: 't2',
    subjectId: 'spelling',
    result: 'rejected',
    reason: 'task-not-found',
    nowTs: 5000,
  });
  assert.equal(record.practiceSessionId, null);
  assert.equal(record.reason, 'task-not-found');
});

// ── No economy vocabulary in exports ──────────────────────────────

test('claim-contract exports contain no economy vocabulary', () => {
  const exportNames = [
    'FORBIDDEN_CLAIM_FIELDS',
    'REQUIRED_CLAIM_FIELDS',
    'validateClaimRequest',
    'isAlreadyCompleted',
    'buildClaimRecord',
  ];
  const forbidden = ['coins', 'reward', 'xp', 'balance', 'shop', 'monster'];
  for (const name of exportNames) {
    for (const word of forbidden) {
      assert.ok(!name.toLowerCase().includes(word), `${name} must not contain "${word}"`);
    }
  }
});
