import test from 'node:test';
import assert from 'node:assert/strict';

import { rewardEventsFromGrammarEvents } from '../src/subjects/grammar/event-hooks.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
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

function securedEvent(conceptId, overrides = {}) {
  return {
    id: `grammar.secured.learner-a.${conceptId}.request-1`,
    type: 'grammar.concept-secured',
    subjectId: 'grammar',
    learnerId: 'learner-a',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    conceptId,
    masteryKey: grammarMasteryKey(conceptId),
    createdAt: 1,
    ...overrides,
  };
}

test('first secure Grammar concept records its domain monster and Concordium once', () => {
  const repository = makeRepository();
  const key = grammarMasteryKey('sentence_functions');

  const events = rewardEventsFromGrammarEvents([securedEvent('sentence_functions')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();

  assert.equal(events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'), true);
  assert.equal(events.some((event) => event.monsterId === 'concordium' && event.kind === 'caught'), true);
  assert.deepEqual(state.bracehart.mastered, [key]);
  assert.deepEqual(state.concordium.mastered, [key]);
  assert.equal(state.pealark, undefined);

  const duplicate = rewardEventsFromGrammarEvents([securedEvent('sentence_functions')], {
    gameStateRepository: repository,
    random: () => 0.9,
  });
  assert.deepEqual(duplicate, []);
  assert.equal(repository.state().bracehart.mastered.length, 1);
});

test('punctuation-for-grammar concepts count for Concordium without touching Punctuation monsters', () => {
  const repository = makeRepository();
  const key = grammarMasteryKey('speech_punctuation');

  const events = rewardEventsFromGrammarEvents([securedEvent('speech_punctuation')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();

  assert.equal(events.length, 1);
  assert.equal(events[0].monsterId, 'concordium');
  assert.deepEqual(state.concordium.mastered, [key]);
  assert.equal(state.quoral, undefined);
});

test('Concordium reaches Mega only when the full Grammar denominator is secure', () => {
  const repository = makeRepository();

  for (const conceptId of GRAMMAR_AGGREGATE_CONCEPTS.slice(0, -1)) {
    recordGrammarConceptMastery({
      learnerId: 'learner-a',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }
  assert.equal(progressForGrammarMonster(repository.state(), 'concordium').stage, 3);

  recordGrammarConceptMastery({
    learnerId: 'learner-a',
    conceptId: GRAMMAR_AGGREGATE_CONCEPTS.at(-1),
    gameStateRepository: repository,
    random: () => 0,
  });
  const concordium = progressForGrammarMonster(repository.state(), 'concordium');

  assert.equal(concordium.mastered, GRAMMAR_AGGREGATE_CONCEPTS.length);
  assert.equal(concordium.stage, 4);
});

test('Grammar progress counts unique current-release concepts only', () => {
  const state = {
    glossbloom: {
      caught: true,
      conceptTotal: 2,
      mastered: [
        'grammar:old-release:word_classes',
        grammarMasteryKey('word_classes'),
        grammarMasteryKey('word_classes'),
      ],
    },
  };

  const progress = progressForGrammarMonster(state, 'glossbloom');

  assert.equal(progress.mastered, 1);
  assert.equal(progress.stage, 2);
  assert.deepEqual(progress.masteredList, [grammarMasteryKey('word_classes')]);
});

test('Grammar reward subscriber ignores non-secured and unknown concept events', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([
    { type: 'grammar.answer-submitted', learnerId: 'learner-a', conceptIds: ['sentence_functions'] },
    securedEvent('not_a_real_concept'),
  ], {
    gameStateRepository: repository,
  });

  assert.deepEqual(events, []);
  assert.equal(repository.writes(), 0);
});
