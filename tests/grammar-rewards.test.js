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
  // Phase 3 U0: Couronnail is the post-flip direct for `word_classes`.
  // `publishedTotal` of 3 mirrors the new cluster size.
  const state = {
    couronnail: {
      caught: true,
      conceptTotal: 3,
      mastered: [
        'grammar:old-release:word_classes',
        grammarMasteryKey('word_classes'),
        grammarMasteryKey('word_classes'),
      ],
    },
  };

  const progress = progressForGrammarMonster(state, 'couronnail');

  assert.equal(progress.mastered, 1);
  // One concept out of three in Couronnail's cluster -> stage 1 (ratio > 0 but < 0.5).
  assert.equal(progress.stage, 1);
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

// -------- Phase 3 U0: cluster remap regressions ---------------------------

test('Phase 3 U0: word_classes now records Couronnail (not Glossbloom) as the direct', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([securedEvent('word_classes')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  const state = repository.state();

  assert.equal(
    events.some((event) => event.monsterId === 'couronnail' && event.kind === 'caught'),
    true,
    'Couronnail absorbs the retired Glossbloom word_classes cluster',
  );
  assert.equal(events.some((event) => event.monsterId === 'glossbloom'), false);
  assert.ok(state.couronnail);
  assert.equal(state.glossbloom, undefined);
});

test('Phase 3 U0: noun_phrases records Bracehart (Sentence structure absorption)', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([securedEvent('noun_phrases')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'), true);
  assert.equal(events.some((event) => event.monsterId === 'glossbloom'), false);
});

test('Phase 3 U0: adverbials records Chronalyx (Flow / Linkage absorption)', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([securedEvent('adverbials')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(events.some((event) => event.monsterId === 'chronalyx' && event.kind === 'caught'), true);
  assert.equal(events.some((event) => event.monsterId === 'loomrill'), false);
});

test('Phase 3 U0: active_passive records Bracehart (Sentence structure absorption)', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([securedEvent('active_passive')], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'), true);
  assert.equal(events.some((event) => event.monsterId === 'mirrane'), false);
});

// -------- Phase 3 U0: writer self-heal suppresses direct re-emission -----

test('writer self-heal silently seeds Bracehart from retired Glossbloom noun_phrases evidence', () => {
  // Pre-flip learner had Glossbloom.mastered containing the noun_phrases key.
  // Post-flip the direct for noun_phrases is Bracehart. A fresh answer for
  // noun_phrases must persist the Bracehart seed state but must NOT emit a
  // `caught` event for Bracehart (the learner already earned that milestone
  // under Glossbloom).
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const repository = makeRepository({
    glossbloom: { caught: true, conceptTotal: 2, mastered: [preFlipKey] },
  });

  const events = rewardEventsFromGrammarEvents([securedEvent('noun_phrases')], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Bracehart `caught` must be suppressed by the self-heal.
  assert.equal(
    events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'),
    false,
    'writer self-heal suppresses Bracehart caught for pre-flip retired-id holders',
  );
  // Concordium still emits (first secure on the aggregate).
  assert.equal(
    events.some((event) => event.monsterId === 'concordium' && event.kind === 'caught'),
    true,
    'Concordium aggregate still emits when crossing the caught threshold',
  );

  // State delta still persists — Bracehart mastered contains the key.
  const state = repository.state();
  assert.ok(state.bracehart, 'Bracehart seed persisted');
  assert.equal(state.bracehart.caught, true);
  assert.deepEqual(state.bracehart.mastered, [preFlipKey]);
  // Retired Glossbloom entry stays untouched for asset-tool compatibility.
  assert.ok(state.glossbloom);
  assert.deepEqual(state.glossbloom.mastered, [preFlipKey]);
});

test('writer self-heal does not fire for a truly fresh learner (no retired state)', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([securedEvent('noun_phrases')], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // A fresh learner MUST get a Bracehart caught event.
  assert.equal(
    events.some((event) => event.monsterId === 'bracehart' && event.kind === 'caught'),
    true,
    'fresh learners still earn the Bracehart caught milestone',
  );
});
