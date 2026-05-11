import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REASONING_TEMPLATES,
  generateReasoningQuestion,
  reasoningContentSummary,
} from '../shared/reasoning/content.js';
import {
  assertNoReasoningMarkerLeak,
  assertReasoningContentSummary,
  parseReasoningQuestionId,
  reasoningCorrectResponseFor,
} from '../scripts/reasoning-production-smoke.mjs';
import { createServerReasoningEngine } from '../worker/src/subjects/reasoning/engine.js';

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
    () => assertReasoningContentSummary({ ...reasoningContentSummary(), templateCount: 109 }),
    /templateCount mismatch/,
  );
  assertNoReasoningMarkerLeak({ currentQuestion: { id: 'safe' } });
  assert.throws(
    () => assertNoReasoningMarkerLeak({ currentQuestion: { evaluate() { return true; } } }),
    /exposed a server-only marker|exposed a function/,
  );
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
