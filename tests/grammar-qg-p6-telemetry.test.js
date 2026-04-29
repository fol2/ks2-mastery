import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyGrammarAttemptToState,
  bucketElapsedMs,
  createInitialGrammarState,
} from '../worker/src/subjects/grammar/engine.js';
import {
  createGrammarQuestion,
  evaluateGrammarQuestion,
  GRAMMAR_CONTENT_RELEASE_ID,
  grammarTemplateById,
  serialiseGrammarQuestion,
} from '../worker/src/subjects/grammar/content.js';
import { buildGrammarReadModel } from '../worker/src/subjects/grammar/read-models.js';

// ---------------------------------------------------------------------------
// bucketElapsedMs unit tests
// ---------------------------------------------------------------------------

test('bucketElapsedMs maps raw milliseconds to coarse bands', () => {
  assert.equal(bucketElapsedMs(1500), '<2s');
  assert.equal(bucketElapsedMs(3200), '2-5s');
  assert.equal(bucketElapsedMs(7000), '5-10s');
  assert.equal(bucketElapsedMs(15000), '10-20s');
  assert.equal(bucketElapsedMs(25000), '>20s');
  assert.equal(bucketElapsedMs(null), null);
  assert.equal(bucketElapsedMs(-1), null);
  assert.equal(bucketElapsedMs(undefined), null);
});

test('bucketElapsedMs boundary values are correct', () => {
  assert.equal(bucketElapsedMs(0), '<2s');
  assert.equal(bucketElapsedMs(1999), '<2s');
  assert.equal(bucketElapsedMs(2000), '2-5s');
  assert.equal(bucketElapsedMs(4999), '2-5s');
  assert.equal(bucketElapsedMs(5000), '5-10s');
  assert.equal(bucketElapsedMs(9999), '5-10s');
  assert.equal(bucketElapsedMs(10000), '10-20s');
  assert.equal(bucketElapsedMs(19999), '10-20s');
  assert.equal(bucketElapsedMs(20000), '>20s');
});

// ---------------------------------------------------------------------------
// P6 calibration telemetry on grammar.answer-submitted events
// ---------------------------------------------------------------------------

test('Grammar answer-submitted event includes P6 calibration telemetry fields', () => {
  const state = createInitialGrammarState();
  // Use a template known to have tags and answerSpecKind.
  const templateId = 'qg_modal_verb_explain';
  const template = grammarTemplateById(templateId);
  const question = createGrammarQuestion({ templateId, seed: 42 });
  const item = serialiseGrammarQuestion(question);

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-telemetry',
    item,
    response: { answer: question.answerSpec.golden[0] },
    supportLevel: 0,
    attempts: 1,
    requestId: 'req-p6-1',
    now: 1_777_000_000_000,
    mode: 'learn',
  });

  const event = applied.events.find(e => e.type === 'grammar.answer-submitted');
  assert.ok(event, 'should emit grammar.answer-submitted event');

  // tags — matches the template metadata
  assert.ok(Array.isArray(event.tags), 'tags must be an array');
  assert.deepEqual(event.tags, template.tags || []);

  // answerSpecKind — string or null
  assert.equal(event.answerSpecKind, template.answerSpecKind || null);

  // sessionKind — alias for mode
  assert.equal(event.sessionKind, 'learn');

  // elapsedMsBucket — null because no client timing exists yet
  assert.equal(event.elapsedMsBucket, null);

  // wasRetry — false for first attempt
  assert.equal(event.wasRetry, false);

  // conceptStatusBefore — should be an object keyed by concept IDs
  assert.equal(typeof event.conceptStatusBefore, 'object');
  for (const conceptId of event.conceptIds) {
    assert.ok(conceptId in event.conceptStatusBefore, `conceptStatusBefore should include ${conceptId}`);
    assert.equal(typeof event.conceptStatusBefore[conceptId], 'string');
  }

  // conceptStatusAfter — should be an object keyed by concept IDs
  assert.equal(typeof event.conceptStatusAfter, 'object');
  for (const conceptId of event.conceptIds) {
    assert.ok(conceptId in event.conceptStatusAfter, `conceptStatusAfter should include ${conceptId}`);
    assert.equal(typeof event.conceptStatusAfter[conceptId], 'string');
  }
});

test('Grammar answer-submitted event wasRetry is true when attempts > 1', () => {
  const state = createInitialGrammarState();
  const templateId = 'qg_modal_verb_explain';
  const question = createGrammarQuestion({ templateId, seed: 7 });
  const item = serialiseGrammarQuestion(question);

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-retry',
    item,
    response: { answer: question.answerSpec.golden[0] },
    supportLevel: 0,
    attempts: 3,
    requestId: 'req-retry-1',
    now: 1_777_000_000_000,
    mode: 'smart',
  });

  const event = applied.events.find(e => e.type === 'grammar.answer-submitted');
  assert.equal(event.wasRetry, true);
  assert.equal(event.sessionKind, 'smart');
});

// ---------------------------------------------------------------------------
// Manual-review-only (non-scored) attempts still carry calibration fields
// ---------------------------------------------------------------------------

test('Grammar manual-review-only event includes P6 calibration fields with nonScored: true', () => {
  const state = createInitialGrammarState();
  // build_noun_phrase is a manualReviewOnly template
  const templateId = 'build_noun_phrase';
  const template = grammarTemplateById(templateId);
  const question = createGrammarQuestion({ templateId, seed: 1 });
  const item = serialiseGrammarQuestion(question);

  const applied = applyGrammarAttemptToState(state, {
    learnerId: 'learner-manual',
    item,
    response: { part1: 'The nervous young', part2: 'explorer', part3: 'from our class' },
    supportLevel: 0,
    attempts: 1,
    requestId: 'req-manual-1',
    now: 1_777_000_000_000,
    mode: 'learn',
  });

  const event = applied.events[0];
  assert.equal(event.type, 'grammar.manual-review-saved');
  assert.equal(event.nonScored, true);

  // Calibration fields still present
  assert.ok(Array.isArray(event.tags));
  assert.deepEqual(event.tags, template.tags || []);
  assert.equal(event.answerSpecKind, template.answerSpecKind || null);
  assert.equal(event.elapsedMsBucket, null);
  assert.equal(event.wasRetry, false);
  assert.equal(typeof event.conceptStatusBefore, 'object');
  assert.equal(typeof event.conceptStatusAfter, 'object');

  // For non-scored, conceptStatusAfter should equal conceptStatusBefore (no mastery update)
  assert.deepEqual(event.conceptStatusAfter, event.conceptStatusBefore);
});

// ---------------------------------------------------------------------------
// Read model redaction — none of the P6 telemetry fields leak
// ---------------------------------------------------------------------------

test('Grammar read model does NOT contain P6 telemetry fields', () => {
  const state = createInitialGrammarState();
  const templateId = 'qg_modal_verb_explain';
  const question = createGrammarQuestion({ templateId, seed: 42 });
  const item = serialiseGrammarQuestion(question);

  applyGrammarAttemptToState(state, {
    learnerId: 'learner-redact',
    item,
    response: { answer: question.answerSpec.golden[0] },
    supportLevel: 0,
    attempts: 1,
    requestId: 'req-redact-1',
    now: 1_777_000_000_000,
    mode: 'learn',
  });

  const readModel = buildGrammarReadModel({
    learnerId: 'learner-redact',
    state,
    now: 1_777_000_000_000,
  });

  const serialised = JSON.stringify(readModel);
  const forbiddenFields = [
    'elapsedMsBucket',
    'wasRetry',
    'conceptStatusBefore',
    'conceptStatusAfter',
    'answerSpecKind',
    'sessionKind',
  ];

  for (const field of forbiddenFields) {
    assert.equal(
      serialised.includes(`"${field}"`),
      false,
      `read model must NOT contain "${field}"`,
    );
  }

  // tags can legitimately appear elsewhere in read models (e.g. template metadata)
  // but it must NOT appear in recentAttempts or analytics.recentActivity
  const recentAttempts = readModel.analytics?.recentAttempts || [];
  for (const attempt of recentAttempts) {
    assert.equal('tags' in attempt, false, 'recentAttempts must not expose tags');
    assert.equal('answerSpecKind' in attempt, false, 'recentAttempts must not expose answerSpecKind');
    assert.equal('wasRetry' in attempt, false, 'recentAttempts must not expose wasRetry');
    assert.equal('conceptStatusBefore' in attempt, false, 'recentAttempts must not expose conceptStatusBefore');
    assert.equal('conceptStatusAfter' in attempt, false, 'recentAttempts must not expose conceptStatusAfter');
    assert.equal('elapsedMsBucket' in attempt, false, 'recentAttempts must not expose elapsedMsBucket');
  }
});
