// Tests for U6 — Reward event semantics: monster events are Star-threshold
// driven, while secure concept updates remain analytics-only.
// Extended by U5 — 1-Star Egg as persisted reward state.
//
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U6).
//
// Verifies:
//  1. caught fires when Stars 0->1 (first evidence), no evolve.
//  2. evolve fires when Stars cross the hatch threshold (15).
//  3. mega fires when Stars cross the mega threshold (100).
//  4. Secure concept updates persist mastered[] but emit no monster events.
//  5. Full 0->100 Star progression emits events in order: caught, evolve, evolve, evolve, mega.
//  6. Large Star jumps can emit caught plus the final stage event.
//  7. Level calculation uses max(legacyLevel, starLevel).
//  8. Concordium caught fires at versioned Grand 1 Star.
//  9. No double-fire for the same monster in a single recordGrammarConceptMastery call.
//  U5-10. Egg persists after fresh read (no re-fire on refresh).
//  U5-11. Legacy caught:true from concept-secured -> star-evidence no-op for caught.
//  U5-12. Cross-path deduplication: star-evidence catches, concept-secured does not re-catch.
//  U5-13. Direct Egg fires from sub-secure evidence (Stars=1 without any concept-secured).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  grammarMasteryKey,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
  updateGrammarStarHighWater,
} from '../src/platform/game/monster-system.js';

import {
  GRAMMAR_EVENT_TYPES,
  rewardEventsFromGrammarEvents,
} from '../src/subjects/grammar/event-hooks.js';

import {
  GRAMMAR_GRAND_STAR_MODEL_VERSION,
  GRAMMAR_STAR_STAGE_THRESHOLDS,
} from '../shared/grammar/grammar-stars.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeRepository(initialState = {}) {
  let state = clone(initialState);
  let writes = 0;
  return {
    read() { return clone(state); },
    write(_learnerId, _systemId, nextState) {
      writes += 1;
      state = clone(nextState);
      return clone(state);
    },
    state() { return clone(state); },
    writeCount() { return writes; },
  };
}

// =============================================================================
// U6 — Star-threshold reward events (secure no longer drives monster events)
// =============================================================================

test('U6 star event: concept-secured persists mastery but emits no monster events', () => {
  const repository = makeRepository();
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-u6-secure-decoupled',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'secure path emits no monster reward events');
  const state = repository.state();
  assert.ok(
    state.bracehart.mastered.includes(grammarMasteryKey('sentence_functions')),
    'direct monster mastered[] still updates',
  );
  assert.ok(
    state.concordium.mastered.includes(grammarMasteryKey('sentence_functions')),
    'aggregate monster mastered[] still updates',
  );
});

test('U6 star event: first Star on Bracehart fires caught only', () => {
  const repository = makeRepository();
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-caught',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'exactly one event');
  assert.equal(events[0].kind, 'caught', 'first Star emits caught');
  assert.equal(events[0].monsterId, 'bracehart');
  assert.equal(events[0].next.displayState, 'egg-found');
  assert.equal(events.some((e) => e.kind === 'evolve'), false, 'no evolve on first Star');
});

test('U6 star event: 14->15 Stars fires evolve for Hatch', () => {
  const repository = makeRepository({
    bracehart: { mastered: [], caught: true, conceptTotal: 6, starHighWater: 14 },
  });
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-hatch',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: GRAMMAR_STAR_STAGE_THRESHOLDS.hatch,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'one threshold event');
  assert.equal(events[0].kind, 'evolve', 'Hatch threshold emits evolve');
  assert.equal(events[0].next.displayState, 'hatch');
});

test('U6 star event: 34->35 Stars fires evolve for Growing', () => {
  const repository = makeRepository({
    bracehart: { mastered: [], caught: true, conceptTotal: 6, starHighWater: 34 },
  });
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-growing',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: GRAMMAR_STAR_STAGE_THRESHOLDS.evolve2,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'one threshold event');
  assert.equal(events[0].kind, 'evolve', 'Growing threshold emits evolve');
  assert.equal(events[0].next.displayState, 'evolve');
});

test('U6 star event: 64->65 Stars fires evolve for Nearly Mega', () => {
  const repository = makeRepository({
    bracehart: { mastered: [], caught: true, conceptTotal: 6, starHighWater: 64 },
  });
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-nearly-mega',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: GRAMMAR_STAR_STAGE_THRESHOLDS.evolve3,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'one threshold event');
  assert.equal(events[0].kind, 'evolve', 'Nearly Mega threshold emits evolve');
  assert.equal(events[0].next.displayState, 'strong');
});

test('U6 star event: 99->100 Stars fires mega', () => {
  const repository = makeRepository({
    couronnail: { mastered: [], caught: true, conceptTotal: 3, starHighWater: 99 },
  });
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-mega',
    monsterId: 'couronnail',
    conceptId: 'word_classes',
    computedStars: GRAMMAR_STAR_STAGE_THRESHOLDS.mega,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'one threshold event');
  assert.equal(events[0].kind, 'mega', 'Mega threshold emits mega');
  assert.equal(events[0].next.displayState, 'mega');
});

test('U6 star event: one large Star jump can emit caught plus final stage event', () => {
  const repository = makeRepository();
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u6-large-jump',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 65,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events.map((e) => e.kind), ['caught', 'evolve']);
  assert.equal(events[1].next.displayState, 'strong');
});

test('U6 star event: full star progression emits caught, evolve, evolve, evolve, mega in order', () => {
  const repository = makeRepository();
  const allEvents = [];
  for (const stars of [1, 15, 35, 65, 100]) {
    allEvents.push(...updateGrammarStarHighWater({
      learnerId: 'learner-u6-full-star-progression',
      monsterId: 'couronnail',
      conceptId: 'word_classes',
      computedStars: stars,
      gameStateRepository: repository,
      random: () => 0,
    }));
  }

  assert.deepEqual(
    allEvents.map((e) => e.kind),
    ['caught', 'evolve', 'evolve', 'evolve', 'mega'],
  );
});

// =============================================================================
// 10. Level calculation uses max(legacyLevel, starLevel)
// =============================================================================

test('U6 star event: level = max(legacyLevel, starLevel)', () => {
  // starHighWater=42 -> starLevel = floor(42/10) = 4.
  // mastered=1/6 -> legacyLevel = round(1/6 * 10) = round(1.667) = 2.
  // max(2, 4) = 4.
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 42,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.level, 4,
    'level = max(legacyLevel=2, starLevel=floor(42/10)=4) = 4');
});

test('U6 star event: level uses legacy when legacy > starLevel', () => {
  // mastered=5/6 -> legacyLevel = round(5/6 * 10) = round(8.333) = 8.
  // starHighWater=5 -> starLevel = floor(5/10) = 0.
  // max(8, 0) = 8.
  const state = {
    bracehart: {
      mastered: [
        grammarMasteryKey('sentence_functions'),
        grammarMasteryKey('clauses'),
        grammarMasteryKey('relative_clauses'),
        grammarMasteryKey('noun_phrases'),
        grammarMasteryKey('active_passive'),
      ],
      caught: true,
      starHighWater: 5,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.level, 8,
    'level = max(legacyLevel=8, starLevel=0) = 8');
});

test('U6 star event: level at starHighWater=100 -> starLevel=10', () => {
  const state = {
    bracehart: {
      mastered: [],
      caught: true,
      starHighWater: 100,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  assert.equal(progress.level, 10,
    'level at 100 Stars = 10 (max)');
});

test('U6 star event: level at starHighWater=0 -> starLevel=0, falls back to legacy', () => {
  const state = {
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      starHighWater: 0,
    },
  };
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });
  // legacyLevel = round(1/6 * 10) = 2. starLevel = 0. Max = 2.
  assert.equal(progress.level, 2, 'level falls back to legacy when starLevel=0');
});

test('U6 star event: secure-driven level increase emits no levelup event', () => {
  const repository = makeRepository({
    bracehart: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      conceptTotal: 6,
      starHighWater: 1,
    },
    concordium: {
      mastered: [grammarMasteryKey('sentence_functions')],
      caught: true,
      conceptTotal: 18,
      starHighWater: 1,
    },
  });
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-u6-levelup',
    conceptId: 'clauses',
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(events, [], 'secure analytics do not emit monster reward events');
});

test('U6 star event: direct and Concordium caught can both emit from Star evidence', () => {
  const repository = makeRepository({
    couronnail: { caught: true, starHighWater: 1 },
  });
  const events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u6-dual-caught',
      conceptId: 'sentence_functions',
      monsterId: 'bracehart',
      computedStars: 1,
    },
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u6-dual-caught',
      conceptId: 'sentence_functions',
      monsterId: 'concordium',
      computedStars: 1,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  const kinds = events.map((e) => `${e.monsterId}:${e.kind}`).sort();
  assert.ok(kinds.includes('bracehart:caught'), 'Bracehart caught fires');
  assert.ok(kinds.includes('concordium:caught'), 'Concordium caught fires');
  assert.equal(events.length, 2, 'exactly two events (one per monster)');
});

test('U6 star event: punctuation-for-grammar sub-secure evidence catches its direct owner, not Concordium', () => {
  const repository = makeRepository();
  const events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u6-punct-gram',
      conceptId: 'speech_punctuation',
      monsterId: 'bracehart',
      computedStars: 1,
    },
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u6-punct-gram',
      conceptId: 'speech_punctuation',
      monsterId: 'concordium',
      computedStars: 0,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(events.length, 1, 'only one visible event before Concordium Grand secure breadth');
  assert.equal(events[0].monsterId, 'bracehart', 'event is for the direct owner');
  assert.equal(events[0].kind, 'caught', 'kind is caught');
});

test('U6 star event: full Bracehart secure progression emits no monster events', () => {
  const repository = makeRepository();
  const allEvents = [];

  for (const conceptId of GRAMMAR_MONSTER_CONCEPTS.bracehart) {
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-u6-bracehart-full',
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const bracehartEvents = events.filter((e) => e.monsterId === 'bracehart');
    allEvents.push(...bracehartEvents);
  }

  assert.deepEqual(allEvents, [], 'secure progression is reward-event silent');
});

test('U6 star event: Concordium secure progression does not drive Mega', () => {
  const repository = makeRepository();
  let megaFired = false;

  for (let i = 0; i < GRAMMAR_AGGREGATE_CONCEPTS.length; i += 1) {
    const events = recordGrammarConceptMastery({
      learnerId: 'learner-u6-conc-mega',
      conceptId: GRAMMAR_AGGREGATE_CONCEPTS[i],
      gameStateRepository: repository,
      random: () => 0,
    });
    const concordiumMega = events.filter(
      (e) => e.monsterId === 'concordium' && e.kind === 'mega',
    );
    if (concordiumMega.length > 0) {
      assert.equal(i, GRAMMAR_AGGREGATE_CONCEPTS.length - 1,
        'Concordium mega fires only on the last concept');
      megaFired = true;
    }
  }

  assert.equal(megaFired, false, 'Concordium Mega is star-threshold driven, not secure-driven');
});

// =============================================================================
// 16. Existing grammar-rewards.test.js scenarios still pass (parity check)
// =============================================================================

test('U6 star event: duplicate concept mastery returns no events', () => {
  const repository = makeRepository();
  recordGrammarConceptMastery({
    learnerId: 'learner-u6-dup',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-u6-dup',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'duplicate concept mastery returns empty events');
});

// =============================================================================
// U5 — 1-Star Egg as persisted reward state
// =============================================================================
// U4 added updateGrammarStarHighWater which sets caught:true and emits a
// caught event when Stars >= 1 on a previously-uncaught monster. U5 verifies
// this behaviour as a persisted reward state with no duplicate emissions
// across the star-evidence and concept-secured code paths.
// =============================================================================

// ---------------------------------------------------------------------------
// U5-1. Fresh Bracehart: star-evidence Stars=1 -> caught event + caught:true
// ---------------------------------------------------------------------------

test('U5 Egg: fresh Bracehart, star-evidence Stars=1 fires caught and persists caught:true', () => {
  const repository = makeRepository();

  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u5-bracehart-egg',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  // caught event emitted
  assert.equal(events.length, 1, 'exactly one event');
  assert.equal(events[0].kind, 'caught', 'event kind is caught');
  assert.equal(events[0].monsterId, 'bracehart', 'event targets Bracehart');

  // caught:true persisted in state
  const state = repository.state();
  assert.equal(state.bracehart.caught, true, 'Bracehart caught persisted');
  assert.equal(state.bracehart.starHighWater, 1, 'starHighWater latched to 1');

  // mastered[] untouched (star-evidence does not add to mastered[])
  assert.deepEqual(state.bracehart.mastered || [], [], 'mastered[] remains empty');
});

// ---------------------------------------------------------------------------
// U5-2. Fresh Concordium: star-evidence Stars=1 -> Concordium caught event
// ---------------------------------------------------------------------------

test('U5 Egg: fresh Concordium, Grand star-evidence Stars=1 latches state and fires caught', () => {
  const repository = makeRepository();

  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u5-concordium-egg',
    monsterId: 'concordium',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.equal(events.length, 1, 'Concordium caught fires once Grand secure breadth is reflected in computedStars');
  assert.equal(events[0].monsterId, 'concordium');
  assert.equal(events[0].kind, 'caught');

  const state = repository.state();
  assert.equal(state.concordium.caught, true, 'Concordium caught latch persists');
  assert.equal(state.concordium.starHighWater, 1, 'Concordium starHighWater=1');
  assert.equal(state.concordium.starModelVersion, GRAMMAR_GRAND_STAR_MODEL_VERSION,
    'Concordium high-water is marked with the Grand Star model version');
});

// ---------------------------------------------------------------------------
// U5-3. caught already true -> no duplicate event on subsequent Star increases
// ---------------------------------------------------------------------------

test('U5 Egg: caught already true, subsequent Star increase emits no caught event', () => {
  const repository = makeRepository({
    bracehart: { caught: true, starHighWater: 1, mastered: [] },
  });

  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u5-no-dup-star',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 5,
    gameStateRepository: repository,
    random: () => 0,
  });

  // No caught event (already caught)
  assert.equal(
    events.some((e) => e.kind === 'caught'),
    false,
    'no duplicate caught event when already caught',
  );

  // starHighWater updated
  const state = repository.state();
  assert.equal(state.bracehart.starHighWater, 5, 'starHighWater raised to 5');
  assert.equal(state.bracehart.caught, true, 'caught remains true');
});

// ---------------------------------------------------------------------------
// U5-4. Refresh after Egg: re-reading state does not re-fire caught
// ---------------------------------------------------------------------------

test('U5 Egg: refresh after Egg — re-reading state and re-applying same Stars does not re-fire caught', () => {
  const repository = makeRepository();

  // First call: catch the monster
  const firstEvents = updateGrammarStarHighWater({
    learnerId: 'learner-u5-refresh',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.equal(firstEvents.length, 1, 'first call fires caught');
  assert.equal(firstEvents[0].kind, 'caught', 'first call is caught');

  // Simulate refresh: re-apply same Stars (client re-derives after page load)
  const refreshEvents = updateGrammarStarHighWater({
    learnerId: 'learner-u5-refresh',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Stars <= existing starHighWater -> early return, no events, no write
  assert.deepEqual(refreshEvents, [], 'refresh with same Stars produces no events');

  // State unchanged
  const state = repository.state();
  assert.equal(state.bracehart.caught, true, 'caught still true after refresh');
  assert.equal(state.bracehart.starHighWater, 1, 'starHighWater still 1 after refresh');
});

// ---------------------------------------------------------------------------
// U5-5. Legacy learner with caught:true from concept-secured ->
//        star-evidence path is no-op for caught
// ---------------------------------------------------------------------------

test('U5 Egg: legacy learner caught via concept-secured, star-evidence at 1 Star is no-op', () => {
  // Legacy learner: caught via recordGrammarConceptMastery (concept-secured path).
  // starHighWater seeded at 1 (from legacy stage 1 via seedStarHighWater).
  const repository = makeRepository({
    bracehart: {
      caught: true,
      mastered: [grammarMasteryKey('sentence_functions')],
      conceptTotal: 6,
      starHighWater: 1,
    },
  });

  // star-evidence arrives with Stars=1 (same as existing starHighWater)
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u5-legacy-caught',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Stars <= existing starHighWater -> early return, no events
  assert.deepEqual(events, [], 'no events when legacy learner already caught with same Stars');
});

test('U5 Egg: legacy learner caught via concept-secured, star-evidence at higher Stars does not re-catch', () => {
  const repository = makeRepository({
    bracehart: {
      caught: true,
      mastered: [grammarMasteryKey('sentence_functions')],
      conceptTotal: 6,
      starHighWater: 1,
    },
  });

  // star-evidence at higher Stars: starHighWater updated, but no caught event
  const events = updateGrammarStarHighWater({
    learnerId: 'learner-u5-legacy-higher',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 3,
    gameStateRepository: repository,
    random: () => 0,
  });

  // No caught event (already caught)
  assert.equal(
    events.some((e) => e.kind === 'caught'),
    false,
    'no caught event on legacy learner with higher Stars',
  );

  // starHighWater updated
  const state = repository.state();
  assert.equal(state.bracehart.starHighWater, 3, 'starHighWater raised to 3');
});

// ---------------------------------------------------------------------------
// U5-6. Cross-path deduplication: star-evidence catches monster, then
//        concept-secured fires — no duplicate caught event
// ---------------------------------------------------------------------------

test('U5 Egg: star-evidence catches Bracehart, then concept-secured does not re-catch', () => {
  const repository = makeRepository();

  // Step 1: star-evidence catches the monster (sub-secure evidence)
  const starEvents = updateGrammarStarHighWater({
    learnerId: 'learner-u5-cross-path',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 2,
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.ok(
    starEvents.some((e) => e.monsterId === 'bracehart' && e.kind === 'caught'),
    'star-evidence fires Bracehart caught',
  );

  // Single-concept sub-secure evidence is below the Concordium Grand threshold.
  updateGrammarStarHighWater({
    learnerId: 'learner-u5-cross-path',
    monsterId: 'concordium',
    conceptId: 'sentence_functions',
    computedStars: 0,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Step 2: concept-secured fires later (concept reaches secure status)
  const securedEvents = recordGrammarConceptMastery({
    learnerId: 'learner-u5-cross-path',
    conceptId: 'sentence_functions',
    gameStateRepository: repository,
    random: () => 0,
  });

  // No caught events from concept-secured path (both monsters already caught)
  assert.equal(
    securedEvents.some((e) => e.kind === 'caught'),
    false,
    'concept-secured does not re-catch already-caught monsters',
  );

  // mastered[] updated by concept-secured
  const state = repository.state();
  const key = grammarMasteryKey('sentence_functions');
  assert.ok(state.bracehart.mastered.includes(key), 'Bracehart mastered[] updated');
  assert.ok(state.concordium.mastered.includes(key), 'Concordium mastered[] updated');

  // Raw secure-state caught is still persisted for aggregate bookkeeping, but
  // display events remain Star-threshold driven.
  assert.equal(state.bracehart.caught, true, 'Bracehart still caught');
  assert.equal(state.concordium.caught, true, 'Concordium raw secure state still caught');
});

// ---------------------------------------------------------------------------
// U5-7. Egg fires from sub-secure evidence (no concept-secured needed)
// ---------------------------------------------------------------------------

test('U5 Egg: Egg fires from sub-secure evidence without any concept-secured event', () => {
  const repository = makeRepository();

  // Only star-evidence, no concept-secured event at all.
  // This simulates a learner who answered correctly once (sub-secure)
  // but has not reached secure status on any concept.
  const events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-sub-secure',
      conceptId: 'tense_aspect',
      monsterId: 'chronalyx',
      computedStars: 1,
      createdAt: Date.now(),
    },
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-sub-secure',
      conceptId: 'tense_aspect',
      monsterId: 'concordium',
      computedStars: 0,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // caught event for Chronalyx only; Concordium needs secure breadth across
  // direct families before it can emit a Grand first-found event.
  assert.ok(
    events.some((e) => e.monsterId === 'chronalyx' && e.kind === 'caught'),
    'Chronalyx caught from sub-secure evidence',
  );
  assert.equal(
    events.some((e) => e.monsterId === 'concordium' && e.kind === 'caught'),
    false,
    'Concordium remains locked from sub-secure evidence',
  );

  // mastered[] remains empty (no concept-secured fired)
  const state = repository.state();
  assert.deepEqual(state.chronalyx.mastered || [], [], 'Chronalyx mastered[] empty (sub-secure)');
  assert.deepEqual(state.concordium.mastered || [], [], 'Concordium mastered[] empty (sub-secure)');

  // caught persisted for direct only.
  assert.equal(state.chronalyx.caught, true, 'Chronalyx caught persisted from sub-secure');
  assert.notEqual(state.concordium.caught, true, 'Concordium not caught from sub-secure');
});

// ---------------------------------------------------------------------------
// U5-8. Egg toast fires exactly once via event-hooks subscriber (integration)
// ---------------------------------------------------------------------------

test('U5 Egg: event-hooks subscriber fires Egg toast exactly once, then no more on repeat', () => {
  const repository = makeRepository();

  // First event stream: initial evidence
  const firstEvents = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-toast',
      conceptId: 'word_classes',
      monsterId: 'couronnail',
      computedStars: 1,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Exactly one caught event with toast
  const caughtEvents = firstEvents.filter(
    (e) => e.monsterId === 'couronnail' && e.kind === 'caught',
  );
  assert.equal(caughtEvents.length, 1, 'exactly one Couronnail caught event');
  assert.ok(caughtEvents[0].toast, 'caught event includes toast');
  assert.ok(caughtEvents[0].toast.title, 'toast has title');
  assert.ok(caughtEvents[0].toast.body, 'toast has body');

  // Second event stream: same or higher Stars
  const secondEvents = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-toast',
      conceptId: 'word_classes',
      monsterId: 'couronnail',
      computedStars: 3,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // No caught events on second pass
  assert.equal(
    secondEvents.some((e) => e.kind === 'caught'),
    false,
    'no duplicate caught on second evidence',
  );

  // Third event stream: same Stars as existing (refresh scenario)
  const thirdEvents = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-toast',
      conceptId: 'word_classes',
      monsterId: 'couronnail',
      computedStars: 3,
      createdAt: Date.now(),
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  assert.deepEqual(thirdEvents, [], 'no events on refresh with same Stars');
});

// ---------------------------------------------------------------------------
// U5-9. Egg persists after navigation (progressForGrammarMonster read)
// ---------------------------------------------------------------------------

test('U5 Egg: caught:true persists in progressForGrammarMonster after star-evidence write', () => {
  const repository = makeRepository();

  // Catch via star-evidence
  updateGrammarStarHighWater({
    learnerId: 'learner-u5-nav',
    monsterId: 'bracehart',
    conceptId: 'sentence_functions',
    computedStars: 1,
    gameStateRepository: repository,
    random: () => 0,
  });

  // Read progress (simulates what the view-model does after navigation)
  const state = repository.state();
  const progress = progressForGrammarMonster(state, 'bracehart', {
    conceptTotal: 6,
  });

  assert.equal(progress.caught, true, 'progress.caught is true after star-evidence Egg');
  assert.ok(progress.stars >= 1, 'progress.stars >= 1');
  assert.equal(progress.starHighWater, 1, 'progress.starHighWater is 1');

  // stage should be at least 1 (Egg found)
  assert.ok(progress.stage >= 1, 'stage >= 1 (Egg found)');
});

// ---------------------------------------------------------------------------
// U5-10. Full cross-path integration: sub-secure -> Egg -> concept-secured -> no re-Egg
// ---------------------------------------------------------------------------

test('U5 Egg: full integration — sub-secure evidence catches, concept-secured later adds mastery without re-catching', () => {
  const repository = makeRepository();

  // Phase 1: sub-secure evidence (learner answered correctly once, not yet secure)
  const phase1Events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-full-int',
      conceptId: 'sentence_functions',
      monsterId: 'bracehart',
      computedStars: 2,
      createdAt: 1,
    },
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-full-int',
      conceptId: 'sentence_functions',
      monsterId: 'concordium',
      computedStars: 0,
      createdAt: 1,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Only the direct monster catches; Concordium is below the Grand threshold
  // until secure breadth exists across direct monster families.
  const phase1Caught = phase1Events.filter((e) => e.kind === 'caught');
  assert.equal(phase1Caught.length, 1, 'phase 1: one caught event (Bracehart only)');

  // Verify persisted state
  const stateAfterPhase1 = repository.state();
  assert.equal(stateAfterPhase1.bracehart.caught, true, 'Bracehart caught after phase 1');
  assert.notEqual(stateAfterPhase1.concordium.caught, true, 'Concordium not caught after phase 1');
  assert.deepEqual(stateAfterPhase1.bracehart.mastered || [], [], 'Bracehart mastered[] empty after phase 1');

  // Phase 2: concept-secured (learner reaches secure status)
  const phase2Events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.CONCEPT_SECURED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-full-int',
      contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
      conceptId: 'sentence_functions',
      masteryKey: grammarMasteryKey('sentence_functions'),
      createdAt: 2,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Secure concept state still does not emit reward events.
  assert.equal(
    phase2Events.some((e) => e.kind === 'caught'),
    false,
    'phase 2: no duplicate caught events',
  );

  // mastered[] now updated
  const stateAfterPhase2 = repository.state();
  const key = grammarMasteryKey('sentence_functions');
  assert.ok(stateAfterPhase2.bracehart.mastered.includes(key), 'Bracehart mastered[] updated in phase 2');
  assert.ok(stateAfterPhase2.concordium.mastered.includes(key), 'Concordium mastered[] updated in phase 2');

  // Direct high-water is preserved. Concordium stays at zero until the Grand
  // tier projection sees enough secure breadth.
  assert.ok(stateAfterPhase2.bracehart.starHighWater >= 2, 'Bracehart starHighWater preserved');
  assert.equal(stateAfterPhase2.concordium.starHighWater, 0, 'Concordium high-water remains zero');

  // Phase 3: refresh (re-derive same Stars)
  const phase3Events = rewardEventsFromGrammarEvents([
    {
      type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
      subjectId: 'grammar',
      learnerId: 'learner-u5-full-int',
      conceptId: 'sentence_functions',
      monsterId: 'bracehart',
      computedStars: 2,
      createdAt: 3,
    },
  ], {
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(phase3Events, [], 'phase 3: no events on refresh');
});
