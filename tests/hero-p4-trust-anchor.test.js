import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroClaimCommand,
} from '../worker/src/hero/claim.js';
import { validateClaimRequest } from '../shared/hero/claim-contract.js';

// ── Test fixtures ────────────────────────────────────────────────────

function makeValidBody(overrides = {}) {
  return {
    command: 'claim-task',
    learnerId: 'learner-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    taskId: 'task-spelling-1',
    requestId: 'req-001',
    expectedLearnerRevision: 3,
    ...overrides,
  };
}

function makeProgressState(overrides = {}) {
  const dateKey = overrides.dateKey || '2026-04-28';
  return {
    version: 1,
    daily: {
      dateKey,
      timezone: 'Europe/London',
      questId: 'quest-abc',
      questFingerprint: 'fp-xyz',
      status: 'active',
      effortTarget: 18,
      effortPlanned: 18,
      effortCompleted: 0,
      taskOrder: ['task-spelling-1'],
      completedTaskIds: [],
      tasks: {
        'task-spelling-1': {
          taskId: 'task-spelling-1',
          questId: 'quest-abc',
          questFingerprint: 'fp-xyz',
          dateKey,
          subjectId: 'spelling',
          intent: 'due-review',
          launcher: 'smart-practice',
          effortTarget: 6,
          status: 'started',
          launchRequestId: 'launch-001',
          claimRequestId: null,
          startedAt: Date.now(),
          completedAt: null,
          subjectPracticeSessionId: null,
          evidence: null,
        },
      },
      generatedAt: Date.now(),
      firstStartedAt: Date.now(),
      completedAt: null,
      lastUpdatedAt: Date.now(),
      ...overrides,
    },
    recentClaims: [],
  };
}

function makeCompletedRowWithHeroContext() {
  return {
    id: 'session-123',
    learner_id: 'learner-1',
    subject_id: 'spelling',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: 'quest-abc',
        taskId: 'task-spelling-1',
        questFingerprint: 'fp-xyz',
        launchRequestId: 'launch-001',
      },
    }),
  };
}

function makeCompletedRowWithoutHeroContext() {
  return {
    id: 'session-no-ctx',
    learner_id: 'learner-1',
    subject_id: 'spelling',
    status: 'completed',
    summary_json: JSON.stringify({ totalCorrect: 8, totalQuestions: 10 }),
  };
}

const TODAY_MID_TS = Date.UTC(2026, 3, 28, 14, 0, 0);

// ── P4 Trust Anchor: Economy enabled + valid heroContext → success ───

test('P4: claim with valid heroContext succeeds when economy enabled', () => {
  const result = resolveHeroClaimCommand({
    body: makeValidBody(),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
  assert.equal(result.practiceSessionId, 'session-123');
  assert.equal(result.evidence.source, 'practice-session');
});

// ── P4 Trust Anchor: Economy enabled + missing heroContext → rejected ─

test('P4: claim with missing heroContext rejected when economy enabled (targeted session)', () => {
  const result = resolveHeroClaimCommand({
    body: makeValidBody({ practiceSessionId: 'session-no-ctx' }),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithoutHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_missing_hero_context');
  assert.equal(result.reason, 'Economy requires heroContext evidence');
});

test('P4: claim with missing heroContext in for-loop path returns no evidence (economy on)', () => {
  // When no practiceSessionId is in body, the for-loop skips non-heroContext rows
  const result = resolveHeroClaimCommand({
    body: makeValidBody(),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithoutHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_no_evidence');
});

// ── P3 compat: Economy disabled + valid heroContext → success ────────

test('P3 compat: claim with valid heroContext succeeds when economy disabled', () => {
  const result = resolveHeroClaimCommand({
    body: makeValidBody(),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
});

// ── P3 compat: Economy disabled + missing heroContext → still accepted ─
// (practiceSessionId must be in body to hit validatePracticeSession path)

test('P3 compat: claim with missing heroContext still succeeds when economy disabled', () => {
  const result = resolveHeroClaimCommand({
    body: makeValidBody({ practiceSessionId: 'session-no-ctx' }),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithoutHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
  assert.equal(result.practiceSessionId, 'session-no-ctx');
});

// ── P3 compat: Economy unset (undefined) + missing heroContext → still accepted ─

test('P3 compat: claim with missing heroContext still succeeds when economyEnabled is undefined (default)', () => {
  const result = resolveHeroClaimCommand({
    body: makeValidBody({ practiceSessionId: 'session-no-ctx' }),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [makeCompletedRowWithoutHeroContext()],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    // economyEnabled not passed — defaults to undefined (falsy)
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
});

// ── Forbidden fields: economy and amount rejected at validation ──────

test('P4: client sends economy field → rejected with hero_claim_forbidden_fields', () => {
  const body = makeValidBody({ economy: { coins: 50 } });

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: makeProgressState(),
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_forbidden_fields');
  assert.ok(result.reason.includes('economy'));
});

test('P4: client sends amount field → rejected with hero_claim_forbidden_fields', () => {
  const body = makeValidBody({ amount: 100 });

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: makeProgressState(),
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_forbidden_fields');
  assert.ok(result.reason.includes('amount'));
});

// ── Forbidden fields: economy and amount via validateClaimRequest directly ─

test('P4: validateClaimRequest rejects economy field', () => {
  const body = makeValidBody({ economy: true });
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('economy')));
});

test('P4: validateClaimRequest rejects amount field', () => {
  const body = makeValidBody({ amount: 999 });
  const result = validateClaimRequest(body);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('amount')));
});

// ── Economy enabled + practiceSessionId targets session without heroContext ─

test('P4: targeted practiceSessionId without heroContext rejected when economy enabled', () => {
  const row = makeCompletedRowWithoutHeroContext();
  const result = resolveHeroClaimCommand({
    body: makeValidBody({ practiceSessionId: 'session-no-ctx' }),
    heroProgressState: makeProgressState(),
    practiceSessionRows: [row],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
    economyEnabled: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_missing_hero_context');
});
