import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REASONING_TEMPLATES,
  generateReasoningQuestion,
  reasoningContentSummary,
} from '../shared/reasoning/content.js';
import {
  DEFAULT_REASONING_PRODUCTION_SMOKE_REPORT,
  assertNoEarlyReasoningHints,
  assertNoReasoningMarkerLeak,
  assertReasoningContentSummary,
  parseReasoningQuestionId,
  reasoningCorrectResponseFor,
} from '../scripts/reasoning-production-smoke.mjs';
import { createServerReasoningEngine } from '../worker/src/subjects/reasoning/engine.js';
import { createReasoningCommandHandlers } from '../worker/src/subjects/reasoning/commands.js';

test('reasoning production smoke helper derives correct responses for the promoted template bank', () => {
  const failures = [];
  for (const template of REASONING_TEMPLATES) {
    for (let seed = 1; seed <= 3; seed += 1) {
      const question = generateReasoningQuestion(template.id, seed);
      try {
        const response = reasoningCorrectResponseFor(question);
        assert.equal(question.evaluate(response).correct, true, question.itemId);
      } catch (error) {
        failures.push(`${question.itemId}: ${error.message}`);
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('reasoning production smoke helper validates content summary and marker redaction', () => {
  assertReasoningContentSummary(reasoningContentSummary());
  assert.throws(
    () => assertReasoningContentSummary({ ...reasoningContentSummary(), templateCount: 123 }),
    /templateCount mismatch/,
  );
  assertNoReasoningMarkerLeak({ currentQuestion: { id: 'safe' } });
  assert.throws(
    () => assertNoReasoningMarkerLeak({ currentQuestion: { evaluate() { return true; } } }),
    /exposed a server-only marker|exposed a function/,
  );
  assertNoEarlyReasoningHints({ currentQuestion: { id: 'q1', itemId: 'q1' } });
  assert.throws(
    () => assertNoEarlyReasoningHints({ currentQuestion: { id: 'pv_rounding_context:1', templateId: 'pv_rounding_context' } }),
    /exposed an early Reasoning hint/,
  );
  assertNoEarlyReasoningHints({ feedback: { question: { id: 'q1', itemId: 'q1' } } });
  assert.throws(
    () => assertNoEarlyReasoningHints({ feedback: { question: { id: 'q1', domain: 'Number' } } }),
    /exposed an early Reasoning hint/,
  );
});

test('reasoning production smoke default report path is not tied to a stale dated release', () => {
  assert.match(DEFAULT_REASONING_PRODUCTION_SMOKE_REPORT, /reasoning-production-smoke-current\.json$/);
  assert.doesNotMatch(DEFAULT_REASONING_PRODUCTION_SMOKE_REPORT, /2026-05-11/);
});

test('reasoning production smoke helper parses deterministic template ids', () => {
  assert.deepEqual(parseReasoningQuestionId('pv_rounding_context:42'), {
    templateId: 'pv_rounding_context',
    seed: 42,
  });
  assert.throws(() => parseReasoningQuestionId('missing-template:1'), /Unknown Reasoning template id/);
});

test('reasoning reset-learner command resets state and data from an active session', () => {
  const engine = createServerReasoningEngine({ now: () => 1000, random: () => 0 });
  const started = engine.apply({
    learnerId: 'learner-1',
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3 },
    requestId: 'start-1',
  });
  assert.equal(started.state.phase, 'session');

  const reset = engine.apply({
    learnerId: 'learner-1',
    subjectRecord: { state: started.state, data: started.data },
    command: 'reset-learner',
    requestId: 'reset-1',
  });
  assert.equal(reset.changed, true);
  assert.equal(reset.state.phase, 'setup');
  assert.equal(reset.state.session, null);
  assert.equal(reset.data.events.length, 0);
  assert.equal(reset.practiceSession, null);
});

test('reasoning command normalises long-history data into bounded storage', () => {
  const now = Date.UTC(2026, 5, 13, 12, 0, 0);
  const legacyEvents = Array.from({ length: 900 }, (_, index) => ({
    timestamp: new Date(now - (900 - index) * 1000).toISOString(),
    templateId: REASONING_TEMPLATES[index % REASONING_TEMPLATES.length].id,
    itemId: `legacy-item-${index}`,
    skillIds: ['number_properties'],
    score: index % 3 === 0 ? 0 : 1,
    maxScore: 1,
    correct: index % 3 !== 0,
    supportLevel: index % 5 === 0 ? 1 : 0,
  }));
  const legacyData = {
    events: legacyEvents,
    retryQueue: Array.from({ length: 500 }, (_, index) => ({
      templateId: REASONING_TEMPLATES[index % REASONING_TEMPLATES.length].id,
      seed: index + 1,
      dueAt: now - index,
      skillIds: ['number_properties'],
    })),
    items: Object.fromEntries(Array.from({ length: 900 }, (_, index) => [
      `legacy-item-${index}`,
      {
        attempts: 1,
        correct: index % 2,
        wrong: index % 2 ? 0 : 1,
        strength: 0.25,
        dueAt: now - index,
        lastSeenAt: new Date(now - (900 - index) * 1000).toISOString(),
      },
    ])),
    evidenceKeys: Array.from({ length: 1500 }, (_, index) => `reasoning-evidence-${index}`),
    sessions: Array.from({ length: 120 }, (_, index) => ({ sessionId: `legacy-session-${index}` })),
    recentTemplateStarts: Array.from({ length: 120 }, (_, index) => ({ templateId: REASONING_TEMPLATES[index % REASONING_TEMPLATES.length].id, at: now - index })),
  };

  const engine = createServerReasoningEngine({ now: () => now, random: () => 0 });
  const result = engine.apply({
    learnerId: 'learner-long-history',
    subjectRecord: { data: legacyData, ui: {} },
    command: 'start-session',
    payload: { mode: 'smart', roundLength: 3 },
    requestId: 'long-history-start',
  });

  assert.equal(result.stats.overview.totalQuestions, legacyEvents.length);
  assert.equal(result.stats.overview.evidenceStars, legacyData.evidenceKeys.length);
  assert.ok(Object.keys(result.data.items).length <= 320, 'Reasoning item nodes stay bounded');
  assert.ok(result.data.retryQueue.length <= 200, 'Reasoning retry queue stays bounded');
  assert.ok(result.data.events.length <= 240, 'Reasoning event history stays bounded');
  assert.ok(result.data.evidenceKeys.length <= 1000, 'Reasoning evidence key ring stays bounded');
  assert.ok(result.data.sessions.length <= 80, 'Reasoning session history stays bounded');
  assert.ok(JSON.stringify(result.data).length < JSON.stringify(legacyData).length / 2, 'bounded data is materially smaller');
});

test('reasoning eventless commands skip projection reads', async () => {
  const handlers = createReasoningCommandHandlers({ now: () => 1000, random: () => 0 });
  let projectionReads = 0;
  const response = await handlers['save-response']({
    subjectId: 'reasoning',
    command: 'save-response',
    learnerId: 'learner-eventless',
    requestId: 'eventless-save',
    expectedLearnerRevision: 7,
    payload: { response: { answer: 'draft' } },
  }, {
    session: { accountId: 'adult-eventless' },
    capacity: null,
    repository: {
      async readSubjectRuntime() {
        return { subjectRecord: { ui: { phase: 'setup' }, data: {} }, latestSession: null };
      },
      async readLearnerProjectionInput() {
        projectionReads += 1;
        throw new Error('eventless command should not read projection input');
      },
    },
  });

  assert.equal(projectionReads, 0);
  assert.equal(response.changed, true);
  assert.deepEqual(response.events, []);
  assert.deepEqual(response.domainEvents, []);
  assert.equal(response.projectionContext, undefined);
});
