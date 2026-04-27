import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rewardEventsFromGrammarEvents,
  GRAMMAR_EVENT_TYPES,
} from '../src/subjects/grammar/event-hooks.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
  updateGrammarStarHighWater,
} from '../src/platform/game/monster-system.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRepository(initialState = {}) {
  let state = clone(initialState);
  let writes = 0;
  return {
    read() {
      return clone(state);
    },
    write(_learnerId, _systemId, nextState) {
      writes += 1;
      state = clone(nextState);
      return clone(state);
    },
    state() {
      return clone(state);
    },
    writes() {
      return writes;
    },
  };
}

function starEvidenceEvent(conceptId, computedStars, overrides = {}) {
  return {
    id: `grammar.star-evidence.learner-a.${conceptId}.${Date.now()}`,
    type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
    subjectId: 'grammar',
    learnerId: 'learner-a',
    conceptId,
    monsterId: overrides.monsterId || 'bracehart',
    computedStars,
    previousStarHighWater: overrides.previousStarHighWater || 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

function securedEvent(conceptId, overrides = {}) {
  return {
    id: `grammar.secured.learner-a.${conceptId}.request-1`,
    type: GRAMMAR_EVENT_TYPES.CONCEPT_SECURED,
    subjectId: 'grammar',
    learnerId: 'learner-a',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    conceptId,
    masteryKey: grammarMasteryKey(conceptId),
    createdAt: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path: first independent correct -> star-evidence-updated fires ->
// starHighWater = 1 -> Egg caught
// ---------------------------------------------------------------------------

test('star-evidence-updated with computedStars=1 sets starHighWater=1 and marks Egg caught on the specified monster only', () => {
  const repository = makeRepository();

  // Each star-evidence-updated event targets a single monster. The command
  // handler emits one per monster with monster-specific computedStars.
  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 1, { monsterId: 'bracehart' }),
    starEvidenceEvent('sentence_functions', 1, { monsterId: 'concordium' }),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Bracehart (direct monster for sentence_functions) should have
  // starHighWater=1 and caught=true.
  assert.ok(state.bracehart, 'Bracehart entry exists');
  assert.equal(state.bracehart.caught, true, 'Bracehart caught');
  assert.equal(state.bracehart.starHighWater, 1, 'Bracehart starHighWater is 1');

  // Concordium (aggregate) should also be caught with starHighWater=1.
  assert.ok(state.concordium, 'Concordium entry exists');
  assert.equal(state.concordium.caught, true, 'Concordium caught');
  assert.equal(state.concordium.starHighWater, 1, 'Concordium starHighWater is 1');

  // Reward events should include caught events.
  assert.equal(
    events.some((e) => e.monsterId === 'bracehart' && e.kind === 'caught'),
    true,
    'Bracehart caught event emitted',
  );
  assert.equal(
    events.some((e) => e.monsterId === 'concordium' && e.kind === 'caught'),
    true,
    'Concordium caught event emitted',
  );

  // mastered[] must remain empty (exclusive to concept-secured).
  assert.deepEqual(state.bracehart.mastered || [], [], 'mastered[] untouched on Bracehart');
  assert.deepEqual(state.concordium.mastered || [], [], 'mastered[] untouched on Concordium');
});

// ---------------------------------------------------------------------------
// Happy path: subsequent correct -> starHighWater updated, no duplicate caught
// ---------------------------------------------------------------------------

test('subsequent star-evidence-updated raises starHighWater without re-emitting caught', () => {
  const repository = makeRepository({
    bracehart: { caught: true, starHighWater: 1, mastered: [] },
    concordium: { caught: true, starHighWater: 1, mastered: [] },
  });

  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 3, { monsterId: 'bracehart' }),
    starEvidenceEvent('sentence_functions', 3, { monsterId: 'concordium' }),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  assert.equal(state.bracehart.starHighWater, 3, 'Bracehart starHighWater raised to 3');
  assert.equal(state.concordium.starHighWater, 3, 'Concordium starHighWater raised to 3');

  // No caught event because both were already caught.
  assert.equal(
    events.some((e) => e.kind === 'caught'),
    false,
    'No duplicate caught events',
  );
});

// ---------------------------------------------------------------------------
// Happy path: concept-secured fires later -> full recordGrammarConceptMastery
// -> starHighWater updated further
// ---------------------------------------------------------------------------

test('concept-secured after star-evidence-updated updates mastered[] and preserves starHighWater', () => {
  const repository = makeRepository({
    bracehart: { caught: true, starHighWater: 5, mastered: [] },
    concordium: { caught: true, starHighWater: 5, mastered: [] },
  });

  const events = rewardEventsFromGrammarEvents([
    securedEvent('sentence_functions'),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // mastered[] should now contain the secured concept.
  const key = grammarMasteryKey('sentence_functions');
  assert.ok(
    state.bracehart.mastered.includes(key),
    'Bracehart mastered[] updated with the secured concept',
  );
  assert.ok(
    state.concordium.mastered.includes(key),
    'Concordium mastered[] updated with the secured concept',
  );

  // starHighWater should be preserved (seedStarHighWater preserves existing value).
  assert.ok(
    state.bracehart.starHighWater >= 5,
    'Bracehart starHighWater preserved after concept-secured',
  );
  assert.ok(
    state.concordium.starHighWater >= 5,
    'Concordium starHighWater preserved after concept-secured',
  );
});

// ---------------------------------------------------------------------------
// Edge case: star-evidence-updated but Stars <= existing starHighWater -> no-op
// ---------------------------------------------------------------------------

test('star-evidence-updated with Stars <= existing starHighWater is a no-op', () => {
  // Seed valid branches so ensureMonsterBranches does not trigger a write.
  const repository = makeRepository({
    bracehart: { caught: true, starHighWater: 10, mastered: [], branch: 'b1' },
    chronalyx: { branch: 'b1' },
    couronnail: { branch: 'b1' },
    concordium: { caught: true, starHighWater: 10, mastered: [], branch: 'b1' },
  });
  const writesBefore = repository.writes();

  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 5),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // starHighWater must not decrease.
  assert.equal(state.bracehart.starHighWater, 10, 'Bracehart starHighWater unchanged');
  assert.equal(state.concordium.starHighWater, 10, 'Concordium starHighWater unchanged');

  // No reward events emitted.
  assert.deepEqual(events, [], 'No events for a no-op latch');

  // No write to the repository (state unchanged).
  assert.equal(repository.writes(), writesBefore, 'Repository not written for no-op');
});

// ---------------------------------------------------------------------------
// Edge case: wrong answer, Writing Try, AI explanation -> no event, 0 persistence
// ---------------------------------------------------------------------------

test('non-scored events (transfer-save, misconception-seen, session-completed) produce zero starHighWater writes', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    {
      type: 'grammar.transfer-evidence-saved',
      subjectId: 'grammar',
      learnerId: 'learner-a',
      promptId: 'test-prompt',
      nonScored: true,
      createdAt: 1,
    },
    {
      type: 'grammar.misconception-seen',
      subjectId: 'grammar',
      learnerId: 'learner-a',
      conceptIds: ['sentence_functions'],
      createdAt: 1,
    },
    {
      type: 'grammar.session-completed',
      subjectId: 'grammar',
      learnerId: 'learner-a',
      sessionId: 'test-session',
      createdAt: 1,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'No reward events from non-scored domain events');
  assert.equal(repository.writes(), 0, 'Zero writes from non-scored events');
});

// ---------------------------------------------------------------------------
// Edge case: star-evidence-updated with computedStars=0 -> no persistence
// ---------------------------------------------------------------------------

test('star-evidence-updated with computedStars=0 is silently ignored', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 0),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'No events for 0 Stars');
  assert.equal(repository.writes(), 0, 'No writes for 0 Stars');
});

// ---------------------------------------------------------------------------
// Edge case: invalid conceptId -> rejected (no crash, no write)
// ---------------------------------------------------------------------------

test('star-evidence-updated with invalid conceptId is silently rejected', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('not_a_real_concept', 5),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'No events for invalid concept');
  assert.equal(repository.writes(), 0, 'No writes for invalid concept');
});

// ---------------------------------------------------------------------------
// Integration: session ends, recentAttempts truncation -> starHighWater persists
// ---------------------------------------------------------------------------

test('starHighWater survives recentAttempts truncation: stored value persists across reads', () => {
  const repository = makeRepository();

  // Step 1: earn Stars via star-evidence-updated.
  rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 5),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const stateAfterEvidence = repository.state();
  assert.equal(stateAfterEvidence.bracehart.starHighWater, 5, 'starHighWater set to 5');

  // Step 2: simulate recentAttempts being truncated (they live in the engine
  // state, not in the monster-codex). The monster-codex state is independent.
  // Read the monster state again — starHighWater must persist.
  const freshRead = repository.read();
  assert.equal(freshRead.bracehart.starHighWater, 5, 'starHighWater survives across reads');

  // Step 3: another star-evidence-updated at a lower value must not decrease.
  rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 2),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(repository.state().bracehart.starHighWater, 5, 'starHighWater never decreases');
});

// ---------------------------------------------------------------------------
// Direct function: updateGrammarStarHighWater works correctly
// ---------------------------------------------------------------------------

test('updateGrammarStarHighWater directly latches starHighWater on specified monster only', () => {
  const repository = makeRepository();

  // Call once for the direct monster.
  const directEvents = updateGrammarStarHighWater({
    learnerId: 'learner-a',
    monsterId: 'chronalyx',
    conceptId: 'tense_aspect',
    computedStars: 3,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Call again for Concordium.
  const aggregateEvents = updateGrammarStarHighWater({
    learnerId: 'learner-a',
    monsterId: 'concordium',
    conceptId: 'tense_aspect',
    computedStars: 3,
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Chronalyx is the direct monster for tense_aspect.
  assert.ok(state.chronalyx, 'Chronalyx entry exists');
  assert.equal(state.chronalyx.caught, true, 'Chronalyx caught');
  assert.equal(state.chronalyx.starHighWater, 3, 'Chronalyx starHighWater=3');

  assert.ok(state.concordium, 'Concordium entry exists');
  assert.equal(state.concordium.caught, true, 'Concordium caught');
  assert.equal(state.concordium.starHighWater, 3, 'Concordium starHighWater=3');

  // caught events emitted from each call.
  assert.equal(
    directEvents.some((e) => e.monsterId === 'chronalyx' && e.kind === 'caught'),
    true,
    'Chronalyx caught event',
  );
  assert.equal(
    aggregateEvents.some((e) => e.monsterId === 'concordium' && e.kind === 'caught'),
    true,
    'Concordium caught event',
  );
});

test('updateGrammarStarHighWater returns empty for an invalid concept', () => {
  const repository = makeRepository();
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-a',
    conceptId: 'invalid_concept',
    computedStars: 5,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'Empty events for invalid concept');
  assert.equal(repository.writes(), 0, 'No writes for invalid concept');
});

test('updateGrammarStarHighWater returns empty when computedStars < 1', () => {
  const repository = makeRepository();
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-a',
    conceptId: 'sentence_functions',
    computedStars: 0,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'Empty events for 0 Stars');
});

// ---------------------------------------------------------------------------
// Punctuation-for-grammar concepts: Concordium only, no direct monster
// ---------------------------------------------------------------------------

test('star-evidence-updated for punctuation-for-grammar concept updates only Concordium', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('speech_punctuation', 2, { monsterId: 'concordium' }),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Concordium should be updated.
  assert.ok(state.concordium, 'Concordium entry exists');
  assert.equal(state.concordium.caught, true, 'Concordium caught');
  assert.equal(state.concordium.starHighWater, 2, 'Concordium starHighWater=2');

  // No Quoral or other punctuation monster touched.
  assert.equal(state.quoral, undefined, 'Quoral not created');

  // Caught event for Concordium only.
  assert.equal(
    events.some((e) => e.monsterId === 'concordium' && e.kind === 'caught'),
    true,
    'Concordium caught event emitted',
  );
});

// ---------------------------------------------------------------------------
// Mixed event stream: both star-evidence-updated and concept-secured
// ---------------------------------------------------------------------------

test('mixed event stream processes both star-evidence-updated and concept-secured correctly', () => {
  const repository = makeRepository();

  const events = rewardEventsFromGrammarEvents([
    // Concept secured fires first (in result.events from the command handler).
    securedEvent('clauses'),
    // Star evidence appended after result.events by the command handler.
    starEvidenceEvent('clauses', 2),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // mastered[] should have the secured concept from concept-secured.
  const key = grammarMasteryKey('clauses');
  assert.ok(
    state.bracehart.mastered.includes(key),
    'mastered[] updated from concept-secured',
  );

  // starHighWater should be at least 2 from the star-evidence-updated.
  assert.ok(
    state.bracehart.starHighWater >= 2,
    'starHighWater latched from star-evidence-updated',
  );

  // Both caught events should fire (from star-evidence-updated, concept-secured
  // may also contribute but the important thing is no crash).
  assert.equal(
    events.some((e) => e.monsterId === 'bracehart' && e.kind === 'caught'),
    true,
    'Bracehart caught event',
  );
});

// ---------------------------------------------------------------------------
// ADV-001 regression: no cross-inflation between monsters from the same concept
// ---------------------------------------------------------------------------

test('different computedStars per monster do not cross-inflate starHighWater', () => {
  const repository = makeRepository();

  // The command handler emits two star-evidence-updated events for the same
  // concept but with different computedStars per monster. Concordium (18
  // concepts) earns fewer Stars than Bracehart (6 concepts) because the
  // per-concept budget is spread across more concepts.
  const events = rewardEventsFromGrammarEvents([
    starEvidenceEvent('sentence_functions', 1, { monsterId: 'concordium' }),
    starEvidenceEvent('sentence_functions', 4, { monsterId: 'bracehart' }),
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const state = repository.state();

  // Concordium must have starHighWater=1, NOT 4.
  assert.equal(state.concordium.starHighWater, 1, 'Concordium starHighWater is 1 (not inflated to 4)');
  assert.equal(state.concordium.caught, true, 'Concordium caught');

  // Bracehart must have starHighWater=4.
  assert.equal(state.bracehart.starHighWater, 4, 'Bracehart starHighWater is 4');
  assert.equal(state.bracehart.caught, true, 'Bracehart caught');

  // Both caught events emitted.
  assert.equal(
    events.some((e) => e.monsterId === 'concordium' && e.kind === 'caught'),
    true,
    'Concordium caught event',
  );
  assert.equal(
    events.some((e) => e.monsterId === 'bracehart' && e.kind === 'caught'),
    true,
    'Bracehart caught event',
  );
});

// ---------------------------------------------------------------------------
// GRAMMAR_EVENT_TYPES export includes STAR_EVIDENCE_UPDATED
// ---------------------------------------------------------------------------

test('GRAMMAR_EVENT_TYPES includes STAR_EVIDENCE_UPDATED', () => {
  assert.equal(
    GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
    'grammar.star-evidence-updated',
    'Event type constant is correct',
  );
});
