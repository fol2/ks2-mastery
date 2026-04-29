import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyGrammarAttemptToState, bucketElapsedMs } from '../worker/src/subjects/grammar/engine.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
} from '../worker/src/subjects/grammar/content.js';

/**
 * Build minimal state + item for exercising applyGrammarAttemptToState.
 * Uses a known single-choice template with a deterministic correct answer.
 */
function buildTestContext() {
  const templateId = 'qg_modal_verb_explain';
  const seed = 7;
  const question = createGrammarQuestion({ templateId, seed });
  if (!question) throw new Error(`Template ${templateId} not found in content bank`);

  const item = {
    templateId,
    seed,
    itemId: `${templateId}:${seed}`,
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
  };

  // Find the correct response
  let correctResponse = { answer: '' };
  if (question.inputSpec?.type === 'single_choice' && Array.isArray(question.inputSpec.options)) {
    for (const opt of question.inputSpec.options) {
      const result = evaluateGrammarQuestion(question, { answer: opt.value });
      if (result?.correct) {
        correctResponse = { answer: opt.value };
        break;
      }
    }
  }

  const state = {
    mastery: { concepts: {}, templates: {}, questionTypes: {}, items: {} },
    recentAttempts: [],
    retryQueue: [],
    misconceptions: {},
    contentReleaseId: GRAMMAR_CONTENT_RELEASE_ID,
  };

  return { state, item, correctResponse };
}

/**
 * Helper: build a fresh state for each test (state is mutated by applyGrammarAttemptToState).
 */
function freshContext() {
  return buildTestContext();
}

describe('P7 U1: clientElapsedMs plumbing through applyGrammarAttemptToState', () => {
  it('clientElapsedMs: 3500 -> elapsedMsBucket: "2-5s"', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 3500,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.ok(event, 'Should produce an answer event');
    assert.equal(event.elapsedMsBucket, '2-5s');
  });

  it('clientElapsedMs: 500 -> elapsedMsBucket: "<2s"', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 500,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, '<2s');
  });

  it('clientElapsedMs: 25000 -> elapsedMsBucket: ">20s"', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 25000,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, '>20s');
  });

  it('missing/undefined clientElapsedMs -> elapsedMsBucket: null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('negative clientElapsedMs -> null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: -100,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('Infinity clientElapsedMs -> null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: Infinity,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('NaN clientElapsedMs -> null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: NaN,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('string "fast" clientElapsedMs -> null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 'fast',
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('180001 (out of range) clientElapsedMs -> null', () => {
    const { state, item, correctResponse } = freshContext();
    const result = applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 180001,
    });
    const event = result.events.find((e) => e.type === 'grammar.answer-submitted' || e.type === 'grammar.manual-review-saved');
    assert.equal(event.elapsedMsBucket, null);
  });

  it('read model does NOT expose elapsedMsBucket (safeRecentAttempt redacts)', async () => {
    const { buildGrammarReadModel } = await import('../worker/src/subjects/grammar/read-models.js');

    const { state, item, correctResponse } = freshContext();
    applyGrammarAttemptToState(state, {
      item,
      response: correctResponse,
      clientElapsedMs: 5000,
    });

    const readModel = buildGrammarReadModel({
      learnerId: 'test-learner',
      state,
      projections: null,
      now: Date.now(),
    });

    // recentAttempts in the read model should not have elapsedMsBucket
    const recentAttempts = readModel?.mastery?.recentAttempts || [];
    for (const attempt of recentAttempts) {
      assert.equal(attempt.elapsedMsBucket, undefined, 'safeRecentAttempt must not expose elapsedMsBucket');
    }
  });
});

describe('P7 U1: bucketElapsedMs unit tests', () => {
  it('null -> null', () => assert.equal(bucketElapsedMs(null), null));
  it('undefined -> null', () => assert.equal(bucketElapsedMs(undefined), null));
  it('-1 -> null', () => assert.equal(bucketElapsedMs(-1), null));
  it('0 -> "<2s"', () => assert.equal(bucketElapsedMs(0), '<2s'));
  it('1999 -> "<2s"', () => assert.equal(bucketElapsedMs(1999), '<2s'));
  it('2000 -> "2-5s"', () => assert.equal(bucketElapsedMs(2000), '2-5s'));
  it('4999 -> "2-5s"', () => assert.equal(bucketElapsedMs(4999), '2-5s'));
  it('5000 -> "5-10s"', () => assert.equal(bucketElapsedMs(5000), '5-10s'));
  it('9999 -> "5-10s"', () => assert.equal(bucketElapsedMs(9999), '5-10s'));
  it('10000 -> "10-20s"', () => assert.equal(bucketElapsedMs(10000), '10-20s'));
  it('19999 -> "10-20s"', () => assert.equal(bucketElapsedMs(19999), '10-20s'));
  it('20000 -> ">20s"', () => assert.equal(bucketElapsedMs(20000), '>20s'));
  it('100000 -> ">20s"', () => assert.equal(bucketElapsedMs(100000), '>20s'));
});
