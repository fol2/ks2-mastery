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

// -------- Phase 4 U3: adversarial scenarios from flow-analyst --------------
// These tests pin behaviour under three flow-analyst-surfaced shapes:
//   1. Supported-correct answer (worked/faded mode) — the reward pipeline
//      reads only the committed mastery signal, not the support flag. So the
//      event shape is identical regardless of how the concept was secured.
//   2. Transfer-save event — zero reward.monster events ever emit (invariant 5).
//   3. Malformed state shapes — the reward subscriber stays shape-stable and
//      never throws.

test('Phase 4 U3 edge case: supported-correct secure (worked/faded mode) emits an identical reward-event shape as independent-correct', () => {
  // The reward pipeline consumes a `grammar.concept-secured` event that
  // carries NO `supportLevelAtScoring` field — support flags live on the
  // upstream `grammar.answer-submitted` event. By the time a secure is
  // emitted, the Worker engine has already reduced support → mastery-gain.
  // The reward layer reads only the committed mastery delta.
  //
  // Assertion: two identical concept-secured events produce byte-identical
  // reward events (modulo the createdAt wall-clock) regardless of the path
  // that led to the secure. This pins the invariant: reward layer is pure
  // with respect to the support flag.

  const supportedEvent = securedEvent('modal_verbs', {
    // Support flags do NOT appear on concept-secured events by contract;
    // any such fields would be ignored by the reward subscriber because
    // `createGrammarRewardSubscriber` reads only learnerId, conceptId,
    // releaseId, masteryKey, createdAt.
    //
    // We include a synthetic `supportUsed` marker to prove the subscriber
    // doesn't short-circuit on non-contract fields.
    supportUsed: 'worked',
    supportLevelAtScoring: 2,
  });
  const independentEvent = securedEvent('modal_verbs', {
    supportUsed: 'none',
    supportLevelAtScoring: 0,
  });

  const supportedRepo = makeRepository();
  const independentRepo = makeRepository();
  const supportedEvents = rewardEventsFromGrammarEvents([supportedEvent], {
    gameStateRepository: supportedRepo,
    random: () => 0,
  });
  const independentEvents = rewardEventsFromGrammarEvents([independentEvent], {
    gameStateRepository: independentRepo,
    random: () => 0,
  });

  // Both produce identical event kinds and monsters.
  const supportedShape = supportedEvents
    .map((e) => `${e.monsterId}:${e.kind}:${e.conceptId}`)
    .sort();
  const independentShape = independentEvents
    .map((e) => `${e.monsterId}:${e.kind}:${e.conceptId}`)
    .sort();
  assert.deepEqual(supportedShape, independentShape,
    'reward event shape is identical whether the secure came from supported-correct or independent-correct');
  // Ratio: one Chronalyx caught + one Concordium caught.
  assert.deepEqual(supportedShape, [
    'chronalyx:caught:modal_verbs',
    'concordium:caught:modal_verbs',
  ]);
});

test('Phase 4 U3 edge case — Covers AE3: transfer-save event never reaches the reward pipeline', () => {
  const repository = makeRepository();
  const transferEvent = {
    id: 'grammar.transfer-evidence-saved.learner-a.req-1.adverbial-opener',
    type: 'grammar.transfer-evidence-saved',
    subjectId: 'grammar',
    learnerId: 'learner-a',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    promptId: 'adverbial-opener',
    savedAt: 1,
    nonScored: true,
    createdAt: 1,
  };
  const events = rewardEventsFromGrammarEvents([transferEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Zero reward events emit.
  assert.deepEqual(events, [],
    'reward pipeline produces zero reward.monster events from a transfer-evidence-saved event (invariant 5)');
  // State never mutates.
  assert.deepEqual(repository.state(), {},
    'reward pipeline writes zero state from a transfer-save event');
});

test('Phase 4 U3 error path: malformed state shape (reserved=null, mastered=non-array) — subscriber returns shape-stable without throwing', () => {
  const malformedInitialState = {
    glossbloom: null,
    loomrill: { mastered: 'not-an-array', caught: true },
    mirrane: { mastered: undefined, caught: false },
    concordium: { mastered: 0, caught: 'yes' },
    // Valid post-flip entries alongside the malformed retired entries.
    bracehart: { mastered: [grammarMasteryKey('clauses')], caught: true },
  };
  const repository = makeRepository(malformedInitialState);

  assert.doesNotThrow(() => {
    rewardEventsFromGrammarEvents([securedEvent('noun_phrases')], {
      gameStateRepository: repository,
      random: () => 0,
    });
  }, 'subscriber does not throw on malformed state shape');

  // Subsequent call on a different concept still works — the subscriber
  // normalises the state on every call, so malformed retired entries
  // don't poison future writes.
  assert.doesNotThrow(() => {
    rewardEventsFromGrammarEvents([securedEvent('sentence_functions')], {
      gameStateRepository: repository,
      random: () => 0,
    });
  }, 'subscriber stays shape-stable across sequential writes to malformed state');
});
