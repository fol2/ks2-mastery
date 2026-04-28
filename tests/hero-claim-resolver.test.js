import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHeroClaimCommand,
  findCompletionEvidence,
  isWithinGraceWindow,
} from '../worker/src/hero/claim.js';
import { HERO_CLAIM_GRACE_HOURS } from '../shared/hero/constants.js';

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
      taskOrder: ['task-spelling-1', 'task-grammar-1', 'task-punctuation-1'],
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
        'task-grammar-1': {
          taskId: 'task-grammar-1',
          questId: 'quest-abc',
          questFingerprint: 'fp-xyz',
          dateKey,
          subjectId: 'grammar',
          intent: 'weak-repair',
          launcher: 'trouble-practice',
          effortTarget: 6,
          status: 'started',
          launchRequestId: 'launch-002',
          claimRequestId: null,
          startedAt: Date.now(),
          completedAt: null,
          subjectPracticeSessionId: null,
          evidence: null,
        },
        'task-punctuation-1': {
          taskId: 'task-punctuation-1',
          questId: 'quest-abc',
          questFingerprint: 'fp-xyz',
          dateKey,
          subjectId: 'punctuation',
          intent: 'breadth-maintenance',
          launcher: 'smart-practice',
          effortTarget: 6,
          status: 'started',
          launchRequestId: 'launch-003',
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

function makeCompletedPracticeRow({ id, subjectId, learnerId, taskId, questId, questFingerprint }) {
  return {
    id: id || 'session-123',
    learner_id: learnerId || 'learner-1',
    subject_id: subjectId || 'spelling',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: questId || 'quest-abc',
        taskId: taskId || 'task-spelling-1',
        questFingerprint: questFingerprint || 'fp-xyz',
        launchRequestId: 'launch-001',
      },
    }),
  };
}

// Timestamp for "today" in the middle of 2026-04-28
const TODAY_MID_TS = Date.UTC(2026, 3, 28, 14, 0, 0);

// ── Happy paths ──────────────────────────────────────────────────────

test('valid Spelling Hero session claim returns status=claimed', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({ subjectId: 'spelling' })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
  assert.equal(result.taskId, 'task-spelling-1');
  assert.equal(result.questId, 'quest-abc');
  assert.equal(result.questFingerprint, 'fp-xyz');
  assert.equal(result.subjectId, 'spelling');
  assert.equal(result.practiceSessionId, 'session-123');
  assert.equal(result.effortTarget, 6);
  assert.equal(result.requestId, 'req-001');
  assert.equal(result.evidence.source, 'practice-session');
  assert.equal(result.evidence.heroContextPhase, 'p3');
});

test('valid Grammar Hero session claim returns status=claimed', () => {
  const body = makeValidBody({ taskId: 'task-grammar-1' });
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({
    id: 'session-grammar-1',
    subjectId: 'grammar',
    taskId: 'task-grammar-1',
  })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
  assert.equal(result.subjectId, 'grammar');
  assert.equal(result.practiceSessionId, 'session-grammar-1');
});

test('valid Punctuation Hero session claim returns status=claimed', () => {
  const body = makeValidBody({ taskId: 'task-punctuation-1' });
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({
    id: 'session-punct-1',
    subjectId: 'punctuation',
    taskId: 'task-punctuation-1',
  })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
  assert.equal(result.subjectId, 'punctuation');
  assert.equal(result.practiceSessionId, 'session-punct-1');
});

test('task already completed in progress state returns status=already-completed', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  state.daily.tasks['task-spelling-1'].status = 'completed';

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'already-completed');
  assert.equal(result.taskId, 'task-spelling-1');
  assert.equal(result.reason, 'Task was already claimed');
});

// ── Edge cases ───────────────────────────────────────────────────────

test('session cleared from ui_json but present in practice_sessions succeeds', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({ subjectId: 'spelling' })];
  // ui_json has no session (already cleared)
  const subjectUiStates = { spelling: { session: null } };

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates,
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
});

test('claim at 00:30 for task started at 23:50 (dateKey yesterday) succeeds within grace', () => {
  // Yesterday is 2026-04-27, claim at 00:30 on 2026-04-28 (within 2h grace of midnight)
  const yesterdayDateKey = '2026-04-27';
  const claimTs = Date.UTC(2026, 3, 28, 0, 30, 0); // 00:30 UTC on Apr 28

  const body = makeValidBody();
  const state = makeProgressState({ dateKey: yesterdayDateKey });
  // Update task's dateKey too
  state.daily.tasks['task-spelling-1'].dateKey = yesterdayDateKey;

  const rows = [makeCompletedPracticeRow({ subjectId: 'spelling' })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: claimTs,
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'claimed');
});

test('claim 3 hours after dateKey ends is rejected as stale', () => {
  const yesterdayDateKey = '2026-04-27';
  // 3 hours past midnight = 03:00 UTC Apr 28 (beyond 2h grace)
  const claimTs = Date.UTC(2026, 3, 28, 3, 0, 0);

  const body = makeValidBody();
  const state = makeProgressState({ dateKey: yesterdayDateKey });
  state.daily.tasks['task-spelling-1'].dateKey = yesterdayDateKey;

  const rows = [makeCompletedPracticeRow({ subjectId: 'spelling' })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: claimTs,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_stale_or_expired');
});

// ── Error paths ──────────────────────────────────────────────────────

test('no completed session found returns hero_claim_no_evidence', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  // No practice session rows at all
  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_no_evidence');
});

test('session found but not completed (status=active) returns hero_claim_evidence_not_completed', () => {
  const body = makeValidBody({ practiceSessionId: 'session-active' });
  const state = makeProgressState();
  const rows = [{
    id: 'session-active',
    learner_id: 'learner-1',
    subject_id: 'spelling',
    status: 'active',
    summary_json: JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: 'quest-abc',
        taskId: 'task-spelling-1',
        questFingerprint: 'fp-xyz',
      },
    }),
  }];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_evidence_not_completed');
});

test('session found but heroContext.questId mismatches returns hero_claim_no_evidence', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({
    subjectId: 'spelling',
    questId: 'quest-different', // mismatch
  })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_no_evidence');
});

test('session belongs to different learner returns hero_claim_cross_learner_rejected', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [{
    id: 'session-other',
    learner_id: 'learner-other', // different learner
    subject_id: 'spelling',
    status: 'completed',
    summary_json: JSON.stringify({
      heroContext: {
        source: 'hero-mode',
        questId: 'quest-abc',
        taskId: 'task-spelling-1',
        questFingerprint: 'fp-xyz',
      },
    }),
  }];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_cross_learner_rejected');
});

test('wrong questFingerprint in session returns hero_claim_no_evidence', () => {
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({
    subjectId: 'spelling',
    questFingerprint: 'fp-wrong', // mismatch
  })];

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_no_evidence');
});

test('task not in quest progress state returns hero_claim_task_not_in_quest', () => {
  const body = makeValidBody({ taskId: 'task-nonexistent' });
  const state = makeProgressState();

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_task_not_in_quest');
});

test('forbidden fields in request body (subjectId, payload, coins) returns immediate rejection', () => {
  const body = makeValidBody({ subjectId: 'spelling', coins: 999 });
  const state = makeProgressState();

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_forbidden_fields');
  assert.ok(result.reason.includes('subjectId'));
  assert.ok(result.reason.includes('coins'));
});

test('missing required fields returns hero_claim_invalid_request', () => {
  const body = { command: 'claim-task' }; // missing everything else
  const state = makeProgressState();

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_claim_invalid_request');
});

// ── Quest identity mismatch ──────────────────────────────────────────

test('quest stale (questId mismatch) returns hero_quest_stale', () => {
  const body = makeValidBody({ questId: 'quest-old' });
  const state = makeProgressState();

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_quest_stale');
});

test('quest fingerprint mismatch returns hero_quest_fingerprint_mismatch', () => {
  const body = makeValidBody({ questFingerprint: 'fp-stale' });
  const state = makeProgressState();

  const result = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: [],
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'hero_quest_fingerprint_mismatch');
});

// ── isWithinGraceWindow unit tests ───────────────────────────────────

test('isWithinGraceWindow returns true for timestamp during the dateKey day', () => {
  const midDay = Date.UTC(2026, 3, 28, 12, 0, 0);
  assert.equal(isWithinGraceWindow('2026-04-28', midDay), true);
});

test('isWithinGraceWindow returns true for timestamp within grace hours after midnight', () => {
  // 1 hour after midnight of Apr 29 (dateKey Apr 28 ends at midnight Apr 29)
  const withinGrace = Date.UTC(2026, 3, 29, 1, 0, 0);
  assert.equal(isWithinGraceWindow('2026-04-28', withinGrace), true);
});

test('isWithinGraceWindow returns false for timestamp beyond grace hours', () => {
  // 3 hours after midnight of Apr 29 (beyond 2h grace)
  const pastGrace = Date.UTC(2026, 3, 29, 3, 0, 0);
  assert.equal(isWithinGraceWindow('2026-04-28', pastGrace), false);
});

test('isWithinGraceWindow returns false for null dateKey', () => {
  assert.equal(isWithinGraceWindow(null, Date.now()), false);
});

test('isWithinGraceWindow returns false for invalid dateKey', () => {
  assert.equal(isWithinGraceWindow('not-a-date', Date.now()), false);
});

// ── Boundary: resolver is pure logic ─────────────────────────────────

test('resolveHeroClaimCommand does not reference any DB or fetch functions', async () => {
  // The module should have no side effects — verify by checking it resolves
  // and returns a deterministic result given the same inputs
  const body = makeValidBody();
  const state = makeProgressState();
  const rows = [makeCompletedPracticeRow({ subjectId: 'spelling' })];

  const result1 = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });
  const result2 = resolveHeroClaimCommand({
    body,
    heroProgressState: state,
    practiceSessionRows: rows,
    subjectUiStates: {},
    nowTs: TODAY_MID_TS,
  });

  assert.deepEqual(result1, result2, 'Same inputs must produce same output (pure function)');
});

// ── findCompletionEvidence edge cases ────────────────────────────────

test('findCompletionEvidence with specific practiceSessionId checks it first', () => {
  const rows = [
    makeCompletedPracticeRow({ id: 'session-wrong', subjectId: 'spelling', questId: 'quest-different' }),
    makeCompletedPracticeRow({ id: 'session-target', subjectId: 'spelling' }),
  ];

  const result = findCompletionEvidence({
    taskId: 'task-spelling-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    learnerId: 'learner-1',
    subjectId: 'spelling',
    practiceSessionId: 'session-target',
    practiceSessionRows: rows,
    subjectUiStates: {},
  });

  assert.equal(result.found, true);
  assert.equal(result.completed, true);
  assert.equal(result.practiceSessionId, 'session-target');
});

test('findCompletionEvidence falls back to ui_json when no practice row matches', () => {
  const subjectUiStates = {
    spelling: {
      session: {
        heroContext: {
          source: 'hero-mode',
          questId: 'quest-abc',
          taskId: 'task-spelling-1',
          questFingerprint: 'fp-xyz',
        },
      },
    },
  };

  const result = findCompletionEvidence({
    taskId: 'task-spelling-1',
    questId: 'quest-abc',
    questFingerprint: 'fp-xyz',
    learnerId: 'learner-1',
    subjectId: 'spelling',
    practiceSessionId: null,
    practiceSessionRows: [],
    subjectUiStates,
  });

  assert.equal(result.found, true);
  assert.equal(result.completed, false); // still active in ui
  assert.equal(result.source, 'subject-ui-json');
});

test('HERO_CLAIM_GRACE_HOURS is exported as 2', () => {
  assert.equal(HERO_CLAIM_GRACE_HOURS, 2);
});
