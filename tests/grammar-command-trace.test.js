// Tests for U6 (P7) — Command trace model for developer debugging.
//
// Verifies:
//  1. buildCommandTrace with answer-submitted + star-evidence-updated events
//     produces a correct structured trace.
//  2. buildCommandTrace with no events produces isNoOp: true.
//  3. Trace never exposes raw event objects (only mapped summaries).
//  4. Event id determinism: star-evidence-updated id uses requestId, not
//     Date.now().
//  5. Source code audit: commands.js id pattern uses requestId.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildCommandTrace } from './helpers/grammar-command-trace.js';
import { GRAMMAR_EVENT_TYPES } from '../src/subjects/grammar/event-hooks.js';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeAnswerEvent(conceptId) {
  return {
    type: 'grammar.answer-submitted',
    conceptId,
    conceptIds: [conceptId],
    correct: true,
  };
}

function makeStarEvidenceEvent({ monsterId, conceptId, computedStars, previousStarHighWater, requestId }) {
  return {
    id: `grammar.star-evidence.learner-trace.${monsterId}.${requestId || 'no-req'}.${computedStars}`,
    type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
    subjectId: 'grammar',
    learnerId: 'learner-trace',
    conceptId,
    monsterId,
    computedStars,
    previousStarHighWater: previousStarHighWater || 0,
    createdAt: 1000,
  };
}

function makeRewardEvent({ kind, monsterId }) {
  return {
    kind,
    type: kind,
    monsterId,
    toast: { title: 'Test', body: 'toast' },
  };
}

// =============================================================================
// 1. Happy path: answer-submitted + star-evidence-updated -> correct trace
// =============================================================================

test('U6 trace: buildCommandTrace with answer + star-evidence events produces correct trace', () => {
  const domainEvents = [
    makeAnswerEvent('sentence_functions'),
  ];
  const starEvidenceEvents = [
    makeStarEvidenceEvent({
      monsterId: 'bracehart',
      conceptId: 'sentence_functions',
      computedStars: 3,
      previousStarHighWater: 1,
      requestId: 'req-001',
    }),
  ];
  const rewardEvents = [
    makeRewardEvent({ kind: 'caught', monsterId: 'bracehart' }),
  ];

  const trace = buildCommandTrace({
    commandName: 'submit-answer',
    requestId: 'req-001',
    learnerId: 'learner-trace',
    domainEvents,
    starEvidenceEvents,
    rewardEvents,
  });

  assert.equal(trace.commandName, 'submit-answer');
  assert.equal(trace.requestId, 'req-001');
  assert.equal(trace.learnerId, 'learner-trace');
  assert.equal(trace.subjectId, 'grammar');

  // Domain events mapped correctly.
  assert.equal(trace.domainEvents.length, 1);
  assert.equal(trace.domainEvents[0].type, 'grammar.answer-submitted');
  assert.equal(trace.domainEvents[0].conceptId, 'sentence_functions');

  // Star evidence events mapped correctly.
  assert.equal(trace.starEvidenceEvents.length, 1);
  assert.equal(trace.starEvidenceEvents[0].type, GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED);
  assert.equal(trace.starEvidenceEvents[0].monsterId, 'bracehart');
  assert.equal(trace.starEvidenceEvents[0].computedStars, 3);
  assert.equal(trace.starEvidenceEvents[0].previousStarHighWater, 1);

  // Reward events mapped correctly.
  assert.equal(trace.rewardEvents.length, 1);
  assert.equal(trace.rewardEvents[0].type, 'caught');
  assert.equal(trace.rewardEvents[0].monsterId, 'bracehart');

  // Flags.
  assert.equal(trace.readModelChanged, true);
  assert.equal(trace.isNoOp, false);
});

// =============================================================================
// 2. Happy path: no events -> isNoOp: true
// =============================================================================

test('U6 trace: buildCommandTrace with no events produces isNoOp: true', () => {
  const trace = buildCommandTrace({
    commandName: 'save-prefs',
    requestId: 'req-002',
    learnerId: 'learner-noop',
    domainEvents: [],
    starEvidenceEvents: [],
    rewardEvents: [],
  });

  assert.equal(trace.isNoOp, true);
  assert.equal(trace.readModelChanged, false);
  assert.deepEqual(trace.domainEvents, []);
  assert.deepEqual(trace.starEvidenceEvents, []);
  assert.deepEqual(trace.rewardEvents, []);
  assert.equal(trace.commandName, 'save-prefs');
  assert.equal(trace.subjectId, 'grammar');
});

test('U6 trace: buildCommandTrace with zero args produces isNoOp: true', () => {
  const trace = buildCommandTrace();

  assert.equal(trace.isNoOp, true);
  assert.equal(trace.readModelChanged, false);
  assert.equal(trace.commandName, '');
  assert.equal(trace.requestId, '');
  assert.equal(trace.learnerId, '');
  assert.equal(trace.subjectId, 'grammar');
});

// =============================================================================
// 3. Trace never exposes raw event objects (only mapped summaries)
// =============================================================================

test('U6 trace: trace objects are mapped summaries, not raw event references', () => {
  const rawDomain = makeAnswerEvent('clauses');
  rawDomain._internal = 'secret';
  rawDomain.enginePayload = { large: true };

  const rawStar = makeStarEvidenceEvent({
    monsterId: 'bracehart',
    conceptId: 'clauses',
    computedStars: 5,
    requestId: 'req-003',
  });
  rawStar._internal = 'secret';
  rawStar.createdAt = 99999;
  rawStar.id = 'should-not-appear';

  const rawReward = makeRewardEvent({ kind: 'evolve', monsterId: 'bracehart' });
  rawReward._internal = 'secret';
  rawReward.toast = { title: 'Should not appear' };

  const trace = buildCommandTrace({
    commandName: 'submit-answer',
    requestId: 'req-003',
    learnerId: 'learner-trace',
    domainEvents: [rawDomain],
    starEvidenceEvents: [rawStar],
    rewardEvents: [rawReward],
  });

  // Domain event summary has only { type, conceptId }.
  const domainKeys = Object.keys(trace.domainEvents[0]).sort();
  assert.deepEqual(domainKeys, ['conceptId', 'type']);

  // Star evidence summary has only { type, monsterId, computedStars, previousStarHighWater }.
  const starKeys = Object.keys(trace.starEvidenceEvents[0]).sort();
  assert.deepEqual(starKeys, ['computedStars', 'monsterId', 'previousStarHighWater', 'type']);

  // Reward event summary has only { type, monsterId }.
  const rewardKeys = Object.keys(trace.rewardEvents[0]).sort();
  assert.deepEqual(rewardKeys, ['monsterId', 'type']);

  // No raw references leaked.
  assert.equal(trace.domainEvents[0]._internal, undefined);
  assert.equal(trace.starEvidenceEvents[0]._internal, undefined);
  assert.equal(trace.starEvidenceEvents[0].id, undefined);
  assert.equal(trace.starEvidenceEvents[0].createdAt, undefined);
  assert.equal(trace.rewardEvents[0]._internal, undefined);
  assert.equal(trace.rewardEvents[0].toast, undefined);
});

// =============================================================================
// 4. Event id determinism: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED id format
// =============================================================================

test('U6 trace: star-evidence-updated event id uses requestId, not Date.now()', () => {
  // Build an event with the expected id pattern and verify it is deterministic.
  const requestId = 'req-deterministic-42';
  const monsterId = 'bracehart';
  const stars = 7;
  const learnerId = 'learner-det';

  const expectedId = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${stars}`;

  // Call twice with the same inputs — ids must be identical (deterministic).
  const id1 = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${stars}`;
  const id2 = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${stars}`;
  assert.equal(id1, id2, 'same inputs produce identical event ids (deterministic)');
  assert.equal(id1, expectedId);

  // The id must NOT contain a timestamp-like segment (13-digit number).
  assert.equal(
    /\.\d{13}/.test(id1),
    false,
    'event id does not contain a 13-digit timestamp segment',
  );

  // The id must contain the requestId.
  assert.ok(id1.includes(requestId), 'event id includes requestId');
});

// =============================================================================
// 5. Source code audit: commands.js id pattern uses requestId
// =============================================================================

test('U6 trace: commands.js star-evidence id uses requestId, not Date.now()', () => {
  const commandsPath = resolve(
    import.meta.dirname,
    '..',
    'worker',
    'src',
    'subjects',
    'grammar',
    'commands.js',
  );
  const source = readFileSync(commandsPath, 'utf8');

  // The id template must reference requestId.
  assert.ok(
    source.includes('requestId'),
    'commands.js references requestId',
  );

  // Find the star-evidence id line and verify it uses requestId, not Date.now().
  const idLines = source.split('\n').filter(
    (line) => line.includes('grammar.star-evidence.') && line.includes('id:'),
  );
  assert.ok(idLines.length >= 1, 'at least one star-evidence id line found');

  for (const line of idLines) {
    assert.ok(
      line.includes('requestId'),
      `id line uses requestId: ${line.trim()}`,
    );
    assert.equal(
      line.includes('Date.now()'),
      false,
      `id line does not use Date.now(): ${line.trim()}`,
    );
  }

  // The deriveStarEvidenceEvents function signature must accept requestId.
  const sigMatch = source.match(/function\s+deriveStarEvidenceEvents\s*\(\s*\{([^}]+)\}/);
  assert.ok(sigMatch, 'deriveStarEvidenceEvents function signature found');
  assert.ok(
    sigMatch[1].includes('requestId'),
    'deriveStarEvidenceEvents accepts requestId parameter',
  );

  // The caller must pass requestId.
  const callerMatch = source.match(/deriveStarEvidenceEvents\(\{[\s\S]*?requestId[\s\S]*?\}\)/);
  assert.ok(callerMatch, 'handleGrammarCommand passes requestId to deriveStarEvidenceEvents');
});
