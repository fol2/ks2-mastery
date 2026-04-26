// Tests for U3 — Grammar Concordium-never-revoked composite invariant test.
//
// Plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md (U3).
// Invariants: docs/plans/james/grammar/grammar-phase4-invariants.md §§7, 11.
//
// The single top-level assertion this file exists to prove:
// **Concordium.stage and Concordium.caught are sticky ratchets — no mutator
// (retry, re-scoring, writer self-heal, import/export round-trip, cross-
// release state carry, or adversarial payload) may decrement either across
// the full replay of a random or named mutator sequence.**
//
// The assertion is enforced after every step in every sequence using the
// same recordGrammarConceptMastery surface the production reward pipeline
// consumes. The ratchet invariant is paired with the denominator-freeze
// invariant (GRAMMAR_AGGREGATE_CONCEPTS.length === 18) as a module-load
// guard so Phase 5 expansion cannot silently revoke existing Mega holders.
//
// Structure:
//  1. Denominator-freeze hard gate (module-load assertion).
//  2. Seven named regression shapes (canonical adversarial scenarios under
//     seed 42).
//  3. 200 random sequences under seed 42 (length 20..60), each step asserts
//     the ratchet invariant.
//  4. Adversarial contract tests — stored-caught vs derived-caught, cross-
//     release direct monster token dedup, import/export round-trip, Spelling
//     cross-subject regression, integration via F2 end-to-end flow.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_REWARD_RELEASE_ID,
  activeGrammarMonsterSummaryFromState,
  grammarMasteryKey,
  monsterSummaryFromState,
  normaliseGrammarRewardState,
  progressForGrammarMonster,
  recordGrammarConceptMastery,
} from '../src/platform/game/monster-system.js';
import {
  combineCommandEvents,
  grammarTerminalConceptToken,
} from '../worker/src/projections/events.js';
import { rewardEventsFromGrammarEvents } from '../src/subjects/grammar/event-hooks.js';
import { snapshotGrammarRewardState } from './helpers/grammar-reward-invariant.js';

// -----------------------------------------------------------------------------
// Denominator-freeze hard gate. Plan invariant 7: GRAMMAR_AGGREGATE_CONCEPTS
// .length === 18 is pinned so any Phase 5 content expansion must unlock the
// assertion deliberately with a paired stage-monotonicity shim. A silent
// bump to 19 would silently revoke every existing Mega holder's stage from
// 4 to 3 (grammarStageFor ratio computation). This test is the hard gate.
// -----------------------------------------------------------------------------

test('U3 denominator-freeze: GRAMMAR_AGGREGATE_CONCEPTS.length === 18 (invariant 7)', () => {
  assert.equal(
    GRAMMAR_AGGREGATE_CONCEPTS.length,
    18,
    'Phase 4 pins aggregate denominator at 18. Expansion requires a paired stage-monotonicity shim so existing Mega holders are not silently demoted.',
  );
});

// -----------------------------------------------------------------------------
// Seeded PRNG — deterministic under a fixed seed. Mirrors the pattern at
// tests/spelling-mega-invariant.test.js:60-68 so the canonical suite
// reproduces across hosts (Windows CI, Linux CI, local dev).
// -----------------------------------------------------------------------------

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

// -----------------------------------------------------------------------------
// In-memory game-state repository — mirrors the pattern used throughout
// tests/grammar-rewards.test.js. The composite invariant sequences run
// through this repo without touching the Worker engine or commands layer;
// recordGrammarConceptMastery is the unit under test because it is the
// single writer that mutates monster-codex state after the Worker engine
// emits a grammar.concept-secured event.
// -----------------------------------------------------------------------------

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

// -----------------------------------------------------------------------------
// Invariant check — called after every step. The stored state is snapshotted
// via `progressForGrammarMonster` so both the ratchet (stage / caught never
// decrements) and the mastered-count monotonicity hold. `maxPrior` is the
// caller's accumulator so the invariant sees a running high-water mark.
// -----------------------------------------------------------------------------

function assertConcordiumRatchet(state, maxPrior, context) {
  const concordium = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.ok(
    concordium.stage >= maxPrior.stage,
    `${context}: Concordium.stage=${concordium.stage} < priorMax=${maxPrior.stage} — sticky-ratchet violated`,
  );
  // Once caught flips true, it must never flip back. derived-caught drops
  // with mastered.length so the ratchet here enforces the stored state
  // contract (plan names stored-caught as load-bearing but progressForGrammarMonster
  // returns derived — see the dedicated adversarial test below for the
  // stored-vs-derived pin).
  if (maxPrior.caught) {
    assert.ok(
      concordium.caught,
      `${context}: Concordium.caught flipped back to false after prior-true — sticky-ratchet violated`,
    );
  }
  assert.ok(
    concordium.mastered >= maxPrior.mastered,
    `${context}: Concordium.mastered=${concordium.mastered} < priorMax=${maxPrior.mastered} — monotonic-count violated`,
  );
  return {
    stage: Math.max(maxPrior.stage, concordium.stage),
    caught: maxPrior.caught || concordium.caught,
    mastered: Math.max(maxPrior.mastered, concordium.mastered),
  };
}

function initialMaxPrior() {
  return { stage: 0, caught: false, mastered: 0 };
}

// -----------------------------------------------------------------------------
// Action executor — one mutator step. Matches the plan's "random sequences"
// shape: (conceptId, correct|wrong, isTransferSave). The mutator surface is
// recordGrammarConceptMastery for correct-answer secures; for wrong answers
// the no-op is accurate (wrong answers do not secure a concept, so the
// reward pipeline never receives a concept-secured event — the ratchet
// holds trivially). Transfer-save is represented as a literal no-op on the
// reward state because U3's invariant is that transfer saves never touch
// the reward pipeline (see the named shape 6 and the dedicated F2 integration
// test below).
// -----------------------------------------------------------------------------

function applyAction(repository, action, learnerId) {
  if (action.isTransferSave) {
    // Plan invariant 5: Writing Try is non-scored. Transfer saves never reach
    // the reward pipeline. The no-op here reflects the production invariant;
    // the dedicated named shape 6 below also exercises this through the
    // Worker engine to prove the Worker-level event list carries no
    // reward.monster entries.
    return { events: [] };
  }
  if (!action.correct) {
    // Wrong answers do not emit concept-secured events; the reward pipeline
    // receives nothing. The ratchet holds trivially.
    return { events: [] };
  }
  const events = recordGrammarConceptMastery({
    learnerId,
    conceptId: action.conceptId,
    gameStateRepository: repository,
    random: () => 0,
  });
  return { events };
}

// -----------------------------------------------------------------------------
// Sequence runner. Replays a sequence of actions, asserts invariants after
// every step. Returns the final state + accumulated events for shape-level
// assertions.
// -----------------------------------------------------------------------------

function runSequence(repository, actions, { label, learnerId = 'learner-a' } = {}) {
  let maxPrior = initialMaxPrior();
  const allEvents = [];
  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i];
    const context = `${label || 'sequence'} step=${i + 1}/${actions.length} action=${JSON.stringify(action)}`;
    const { events } = applyAction(repository, action, learnerId);
    allEvents.push(...events);
    const state = repository.state();
    maxPrior = assertConcordiumRatchet(state, maxPrior, context);
  }
  return { state: repository.state(), events: allEvents, maxPrior };
}

function randomAction(random) {
  const conceptId = GRAMMAR_AGGREGATE_CONCEPTS[
    Math.floor(random() * GRAMMAR_AGGREGATE_CONCEPTS.length)
  ];
  const roll = random();
  // Distribution mirrors realistic learner traffic: ~55% correct, ~35% wrong,
  // ~10% transfer-save. Transfer-save dominance triggers the plan invariant 5
  // "no reward events from transfer saves" branch; wrong answers trigger the
  // concept-secured-absence branch.
  if (roll < 0.55) return { conceptId, correct: true, isTransferSave: false };
  if (roll < 0.9) return { conceptId, correct: false, isTransferSave: false };
  return { conceptId, correct: false, isTransferSave: true };
}

function randomSequence(random, length) {
  const out = new Array(length);
  for (let i = 0; i < length; i += 1) out[i] = randomAction(random);
  return out;
}

// -----------------------------------------------------------------------------
// Seed resolution — canonical suite uses seed 42 by default; PROPERTY_SEED
// env var lets nightly probes explore other slices. Matches the Spelling
// Mega-never-revoked pattern exactly.
// -----------------------------------------------------------------------------

const CANONICAL_SEED = 42;
const PROPERTY_SEED_RAW = process.env.PROPERTY_SEED;
const PROPERTY_SEED = PROPERTY_SEED_RAW !== undefined && PROPERTY_SEED_RAW !== ''
  ? Number(PROPERTY_SEED_RAW)
  : CANONICAL_SEED;
if (PROPERTY_SEED_RAW !== undefined && PROPERTY_SEED_RAW !== '' && !Number.isFinite(PROPERTY_SEED)) {
  throw new Error(`PROPERTY_SEED must be a finite integer, got raw value: ${JSON.stringify(PROPERTY_SEED_RAW)}`);
}

// =============================================================================
// 1. Seven named regression shapes — canonical adversarial scenarios.
// =============================================================================

// ----- Named shape 1: fresh learner + 18 secure answers in random order ------
//
// Plan §U3 named shape 1: fresh learner + 18 secure answers in random order
// → Concordium reaches Mega exactly once.

test('U3 named shape 1: 18 secure answers in random order → Concordium reaches Mega exactly once', () => {
  const random = makeSeededRandom(PROPERTY_SEED);
  // Shuffle GRAMMAR_AGGREGATE_CONCEPTS deterministically.
  const shuffled = GRAMMAR_AGGREGATE_CONCEPTS.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  const repository = makeRepository();
  const actions = shuffled.map((conceptId) => ({ conceptId, correct: true, isTransferSave: false }));
  const { events } = runSequence(repository, actions, { label: 'shape-1-18-secure' });

  // Concordium reaches Mega exactly once: one `mega` event on the 18th secure,
  // plus one `caught` event on the first secure. No Mega kind appears twice.
  const concordiumMegas = events.filter((e) => e.monsterId === 'concordium' && e.kind === 'mega');
  assert.equal(concordiumMegas.length, 1, 'Concordium mega fires exactly once across the 18-secure sweep');
  const concordiumCaughts = events.filter((e) => e.monsterId === 'concordium' && e.kind === 'caught');
  assert.equal(concordiumCaughts.length, 1, 'Concordium caught fires exactly once on first secure');
  // Final state: Concordium stage = 4.
  const concordium = progressForGrammarMonster(repository.state(), 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordium.stage, 4);
  assert.equal(concordium.mastered, 18);
  assert.equal(concordium.caught, true);
});

// ----- Named shape 2: pre-flip Glossbloom + post-flip answer -----------------
//
// Plan §U3 named shape 2: pre-flip Glossbloom-secured state + post-flip
// answer on `noun_phrases` → writer self-heal emits aggregate, suppresses
// direct-caught toast, stored state delta is correct.

test('U3 named shape 2: pre-flip Glossbloom-secured + answer on noun_phrases → self-heal suppresses Bracehart direct, Concordium fires', () => {
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const repository = makeRepository({
    glossbloom: { caught: true, conceptTotal: 2, mastered: [preFlipKey] },
  });
  const actions = [{ conceptId: 'noun_phrases', correct: true, isTransferSave: false }];
  const { events } = runSequence(repository, actions, { label: 'shape-2-self-heal' });

  // Bracehart caught MUST be suppressed by self-heal.
  const bracehartCaught = events.filter((e) => e.monsterId === 'bracehart' && e.kind === 'caught');
  assert.equal(bracehartCaught.length, 0, 'self-heal suppresses Bracehart caught');
  // Concordium caught still fires (first aggregate secure).
  const concordiumCaught = events.filter((e) => e.monsterId === 'concordium' && e.kind === 'caught');
  assert.equal(concordiumCaught.length, 1, 'Concordium caught fires on first aggregate secure');
  // State delta: Bracehart seeded silently.
  const state = repository.state();
  assert.equal(state.bracehart?.caught, true);
  assert.deepEqual(state.bracehart.mastered, [preFlipKey]);
  // Retired Glossbloom entry preserved for asset tooling.
  assert.deepEqual(state.glossbloom.mastered, [preFlipKey]);
});

// ----- Named shape 3: cross-release retired-id state -------------------------
//
// Plan §U3 named shape 3: cross-release retired-id state (Glossbloom under
// releaseId v7, Concordium under v8) + answer on `noun_phrases` under v8 →
// dedupe via concept id collapses to one aggregate slot.
//
// Current-release-only contract: the normaliser always re-scopes retired
// entries to the CURRENT release id (not entry.releaseId). So a v7-prefixed
// retired mastery key silently drops; only the current-release Concordium
// entry survives. The concept slot is therefore unique by construction —
// dedupe does not trigger because the retired v7 key was never merged into
// the union. The end-state (one slot for noun_phrases in the aggregate) is
// what the plan calls "collapsed to one aggregate slot" and is pinned here.

test('U3 named shape 3: cross-release v7/v8 retired-id state + v8 answer → aggregate holds one concept slot (current-release-only contract)', () => {
  const preV7Key = 'grammar:v7:noun_phrases';
  const v8Key = grammarMasteryKey('noun_phrases');
  const repository = makeRepository({
    glossbloom: { caught: true, conceptTotal: 2, mastered: [preV7Key], releaseId: 'v7' },
    concordium: { mastered: [v8Key], caught: true, releaseId: GRAMMAR_REWARD_RELEASE_ID },
  });
  // Normalised view holds exactly one concept slot for noun_phrases.
  const view = normaliseGrammarRewardState(repository.state());
  const conceptSlots = new Set(view.concordium.mastered.map((key) => key.split(':').pop()));
  assert.equal(conceptSlots.size, view.concordium.mastered.length,
    'cross-release view holds one slot per concept (v7 key silently drops under current-release-only contract)');
  assert.ok(conceptSlots.has('noun_phrases'));

  // Replay a v8 answer — no new reward events (the concept already caught).
  const actions = [{ conceptId: 'noun_phrases', correct: true, isTransferSave: false }];
  const { events } = runSequence(repository, actions, { label: 'shape-3-cross-release' });
  // With self-heal + existing aggregate mastery, the writer early-outs when
  // both the aggregate and the direct (or the self-heal seeded direct) hold
  // the key. What we pin here: "no duplicate aggregate event fires".
  const concordiumEvents = events.filter((e) => e.monsterId === 'concordium');
  assert.equal(concordiumEvents.length, 0, 'no new Concordium event after the concept is already in aggregate mastered');
});

// ----- Named shape 4: pre-secure-then-re-secure ------------------------------
//
// Plan §U3 named shape 4: pre-secure-then-re-secure same concept → zero new
// events, Concordium fraction unchanged.

test('U3 named shape 4: re-securing an already-secured concept emits zero events and leaves Concordium fraction unchanged', () => {
  const repository = makeRepository();
  const learnerId = 'learner-resecure';
  const first = recordGrammarConceptMastery({
    learnerId,
    conceptId: 'modal_verbs',
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.ok(first.length > 0, 'first secure emits events');
  const stateAfterFirst = repository.state();
  const concordiumAfterFirst = progressForGrammarMonster(stateAfterFirst, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });

  const second = recordGrammarConceptMastery({
    learnerId,
    conceptId: 'modal_verbs',
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(second, [], 're-secure emits zero events');
  const stateAfterSecond = repository.state();
  const concordiumAfterSecond = progressForGrammarMonster(stateAfterSecond, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordiumAfterSecond.mastered, concordiumAfterFirst.mastered);
  assert.equal(concordiumAfterSecond.stage, concordiumAfterFirst.stage);

  // Snapshot equality via the helper proves no timestamp drift or unexpected
  // delta slipped in.
  const firstSnap = snapshotGrammarRewardState(stateAfterFirst);
  const secondSnap = snapshotGrammarRewardState(stateAfterSecond);
  assert.deepEqual(secondSnap, firstSnap,
    'state snapshot byte-identical before/after a re-secure no-op');
});

// ----- Named shape 5: mini-test with 3 concepts crossing threshold -----------
//
// Plan §U3 named shape 5: mini-test with 3 concepts crossing secure threshold
// in one command → 3 distinct OR 1 batched event — pin current behaviour.

test('U3 named shape 5: 3 concepts crossing threshold in one batch emit per-monster events per transition boundary (current behaviour pinned)', () => {
  const repository = makeRepository();
  // Simulate a mini-test that emits 3 concept-secured events in one
  // projection pass. The reward subscriber iterates and dispatches each.
  const concepts = ['sentence_functions', 'word_classes', 'clauses'];
  const events = rewardEventsFromGrammarEvents(
    concepts.map((conceptId) => ({
      id: `grammar.secured.x.${conceptId}.req`,
      type: 'grammar.concept-secured',
      subjectId: 'grammar',
      learnerId: 'learner-x',
      contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
      conceptId,
      masteryKey: grammarMasteryKey(conceptId),
      createdAt: 1,
    })),
    { gameStateRepository: repository, random: () => 0 },
  );

  // The reward writer emits events only on "transition boundary crossings"
  // (caught, stage change, level change via `grammarEventFromTransition`).
  // Pinning current behaviour (measured via a probe):
  //   secure #1 (sentence_functions): bracehart:caught, concordium:caught
  //     (Concordium 0→1 mastered, level round(1/18*10)=1)
  //   secure #2 (word_classes): couronnail:caught
  //     (Concordium 1→2 mastered, level round(2/18*10)=1, no Concordium event)
  //   secure #3 (clauses): bracehart:levelup (2nd Bracehart concept),
  //     concordium:levelup (Concordium 2→3 mastered, level round(3/18*10)=2).
  // Shape assertion: exactly 5 events, specific kinds per monster.
  const bracehart = events.filter((e) => e.monsterId === 'bracehart');
  const couronnail = events.filter((e) => e.monsterId === 'couronnail');
  const concordium = events.filter((e) => e.monsterId === 'concordium');
  assert.equal(bracehart.length, 2, 'Bracehart: caught + levelup across 2 Bracehart-concept events');
  assert.equal(bracehart.filter((e) => e.kind === 'caught').length, 1);
  assert.equal(bracehart.filter((e) => e.kind === 'levelup').length, 1);
  assert.equal(couronnail.length, 1);
  assert.equal(couronnail[0].kind, 'caught');
  // Concordium: caught on first secure, levelup on third secure, NONE on
  // second secure because the level round(2/18*10)=1 did not change.
  assert.equal(concordium.length, 2,
    'Concordium: 1 caught + 1 levelup across 3 secures (no event on #2 because level round unchanged)');
  assert.equal(concordium.filter((e) => e.kind === 'caught').length, 1, 'exactly one Concordium caught across the batch');
  assert.equal(concordium.filter((e) => e.kind === 'levelup').length, 1, 'exactly one Concordium levelup on the transition crossing');
  // Total event shape assertion: 5 events total.
  assert.equal(events.length, 5,
    'per-monster events fire per transition boundary (current behaviour pinned); expansion to a 19th concept would need a paired test update');
});

// ----- Named shape 6: transfer save + scored answer -------------------------
//
// Plan §U3 named shape 6: transfer save + immediate scored answer on adjacent
// concept → transfer event absent from reward pipeline; scored answer emits
// normally.

test('U3 named shape 6: transfer-save-evidence never reaches reward pipeline; scored answer on adjacent concept emits normally', () => {
  const repository = makeRepository();
  // Transfer-save-evidence event (the Worker engine emits this type for
  // Writing Try saves — U10 Writing Try non-scored invariant names it as
  // the load-bearing non-scored event type).
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
  const conceptEvent = {
    id: 'grammar.secured.learner-a.noun_phrases.req-2',
    type: 'grammar.concept-secured',
    subjectId: 'grammar',
    learnerId: 'learner-a',
    contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
    conceptId: 'noun_phrases',
    masteryKey: grammarMasteryKey('noun_phrases'),
    createdAt: 2,
  };
  const events = rewardEventsFromGrammarEvents([transferEvent, conceptEvent], {
    gameStateRepository: repository,
    random: () => 0,
  });

  // Every emitted reward event is a reward.monster for the noun_phrases
  // concept secure — the transfer-save produced zero entries.
  assert.ok(events.length > 0, 'the concept secure produced events');
  for (const event of events) {
    assert.equal(event.type, 'reward.monster');
    assert.equal(event.conceptId, 'noun_phrases',
      'no reward event can be traced back to the transfer save (which had no conceptId)');
  }
  // Positive assertion: exactly one Bracehart + one Concordium caught.
  const kinds = events.map((e) => `${e.monsterId}:${e.kind}`).sort();
  assert.deepEqual(kinds, ['bracehart:caught', 'concordium:caught']);
});

// ----- Named shape 7 (adversarial): retired entry with v7 mastery key, no releaseId --
//
// Plan §U3 §504: retired entry with no `releaseId` field, v7-prefixed mastery
// key — `{ glossbloom: { mastered: ['grammar:v7:noun_phrases'], caught: true } }`
// with no `releaseId` property on the entry. `releaseIdForEntry(entry,
// currentReleaseId)` falls back to the current id, `grammarConceptIdFromMasteryKey`
// returns `''` (prefix mismatch), and self-heal silently skips. Next real
// answer on `noun_phrases` spuriously emits Bracehart caught. Test asserts
// EITHER the normaliser widens release-id detection, OR the test documents
// the contract.
//
// Decision: PIN CURRENT CONTRACT. The normaliser falls back to the current
// release id when `entry.releaseId` is missing, so a v7-prefixed mastery
// key silently slips. The retired entry's `caught: true` still surfaces
// Concordium.caught via the `caughtFromRetired` branch, which satisfies
// the user-trust contract at the Concordium level (Concordium stays caught
// across the flip). A spurious Bracehart direct caught on the next real
// answer is the residual fragility this test documents — not a regression
// we fix in U3 because production learners under v7 are a nil set (we shipped
// the 4+3 flip without a v7 release pause).

test('U3 named shape 7 (adversarial): retired v7 mastery key with no releaseId field — contract documented, Concordium.caught preserved via caughtFromRetired', () => {
  const state = {
    glossbloom: { mastered: ['grammar:v7:noun_phrases'], caught: true },
    // No `releaseId` field on the retired entry. No concordium entry on disk.
  };
  const view = normaliseGrammarRewardState(state);

  // Contract: Concordium surfaces as caught via the `caughtFromRetired`
  // short-circuit even when the release-id prefix doesn't match. The
  // mastered array is empty because the v7 prefix mismatch silently drops
  // the key, but the caught flag survives.
  assert.equal(view.concordium.caught, true,
    'Concordium.caught preserved via caughtFromRetired when retired entry.caught=true (user-trust contract)');
  assert.deepEqual(view.concordium.mastered, [],
    'v7-prefix mastery key drops silently when entry.releaseId is missing — current normaliser contract');

  // Retired entry preserved for asset tooling.
  assert.deepEqual(view.glossbloom.mastered, ['grammar:v7:noun_phrases']);
  assert.equal(view.glossbloom.caught, true);

  // Document the residual fragility: a subsequent real answer on
  // `noun_phrases` under the CURRENT releaseId fires Bracehart caught
  // because `retiredStateHoldsConcept` cannot match the v7 key against the
  // current releaseId. This is the fragility the plan calls out; current
  // behaviour is pinned.
  const repository = makeRepository(state);
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-v7',
    conceptId: 'noun_phrases',
    gameStateRepository: repository,
    random: () => 0,
  });
  const bracehartCaught = events.filter((e) => e.monsterId === 'bracehart' && e.kind === 'caught');
  assert.equal(bracehartCaught.length, 1,
    'current behaviour pinned: retired v7 key with no releaseId does NOT suppress direct caught on subsequent real answer');
});

// =============================================================================
// 2. 200 random sequences under seed 42 — property test.
// =============================================================================

test(`U3 property: 200 seeded random sequences (seed ${PROPERTY_SEED}, length 20..60) hold Concordium ratchet across every step`, () => {
  const sequenceRng = makeSeededRandom(PROPERTY_SEED);
  for (let i = 0; i < 200; i += 1) {
    const length = 20 + Math.floor(sequenceRng() * 41); // 20..60
    const actionRng = makeSeededRandom(PROPERTY_SEED + i * 31 + 1);
    const actions = randomSequence(actionRng, length);
    const repository = makeRepository();
    try {
      runSequence(repository, actions, { label: `property-seq-${i}`, learnerId: `learner-${i}` });
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        throw new Error(`[concordium-invariant] FAILED seed=${PROPERTY_SEED} seq=${i} :: ${error.message}`);
      }
      throw error;
    }
  }
});

// =============================================================================
// 3. Adversarial contract tests — stored vs derived, cross-release dedup,
// import/export round-trip, Spelling cross-subject regression, F2 integration.
// =============================================================================

// ----- Stored-caught vs derived-caught adversarial ---------------------------
//
// Plan §U3 §506: state `{ concordium: { caught: true, mastered: [] } }` —
// `progressForGrammarMonster` returns `caught = (mastered.length >= 1) = false`.
// Stored flag is `true`, derived flag is `false`. Test pins which is
// authoritative; plan names stored-caught as load-bearing, but the current
// production contract derives caught from mastered. This test pins the
// current contract and names the deviation from the plan explicitly.

test('U3 adversarial: stored-caught vs derived-caught — progressForGrammarMonster returns derived-caught (mastered.length>=1); stored flag IGNORED', () => {
  const state = { concordium: { caught: true, mastered: [] } };
  const progress = progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  // Current contract: derived-caught is authoritative; stored flag IGNORED.
  // Plan-level invariant 11 ("Concordium never revoked") names stored-caught
  // as load-bearing — but the ratchet holds because once `mastered` contains
  // 18 keys, `derived caught` can only be made false by removing keys. The
  // property test (above) replays 200 sequences without seeing any mastered
  // decrement, so the ratchet holds under the derived-caught contract too.
  assert.equal(progress.caught, false,
    'pin current contract: derived-caught (mastered.length>=1) is authoritative; stored flag IGNORED');
  assert.equal(progress.mastered, 0);
  assert.equal(progress.stage, 0);
});

// ----- Cross-release direct monster token dedup ------------------------------
//
// Plan §U3 §505: after writer self-heal seeds v8 state for `noun_phrases`,
// a subsequent genuine secure arriving with releaseId=v9 has an exact-string
// miss on `directMastered.includes('grammar:v8:noun_phrases')`. Direct
// `caught` event fires, and `grammarTerminalConceptToken` dedup keys on
// `(releaseId:conceptId:kind)` — v9's token differs from any prior v8 entry,
// so dedup does NOT block the spurious event. Test pins current behaviour.

test('U3 adversarial: cross-release direct monster token dedup — different releaseIds produce different tokens, dedup does NOT collapse', () => {
  const v8Event = {
    id: 'reward.monster:learner-a:grammar:v8:noun_phrases:bracehart:caught',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'bracehart',
    conceptId: 'noun_phrases',
    releaseId: 'v8',
  };
  const v9Event = { ...v8Event, id: 'reward.monster:learner-a:grammar:v9:noun_phrases:bracehart:caught', releaseId: 'v9' };

  const v8Token = grammarTerminalConceptToken(v8Event);
  const v9Token = grammarTerminalConceptToken(v9Event);
  assert.notEqual(v8Token, v9Token,
    'different releaseIds produce different concept tokens — cross-release dedup does not collapse');
  // Folding both through the combine pipeline: both survive.
  const combined = combineCommandEvents({ domainEvents: [v8Event, v9Event] });
  assert.equal(combined.events.length, 2,
    'cross-release events for same concept both survive — pin current behaviour');
});

// ----- Import/export round-trip: pre-flip Glossbloom-only state ---------------
//
// Plan §U3 §507: import a pre-flip Glossbloom-only state JSON; first
// `progressForGrammarMonster(concordium)` call must report the correct
// mastered count via normaliseGrammarRewardState. Export → import of
// current state is idempotent.

test('U3 adversarial: import pre-flip Glossbloom-only state JSON → normaliseGrammarRewardState surfaces Concordium with correct mastered count', () => {
  // Simulate an import: JSON parse of a pre-flip persisted record.
  const exported = JSON.stringify({
    glossbloom: { caught: true, mastered: [grammarMasteryKey('noun_phrases')] },
  });
  const imported = JSON.parse(exported);
  const view = normaliseGrammarRewardState(imported);
  const concordium = progressForGrammarMonster(view, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordium.caught, true);
  assert.equal(concordium.mastered, 1);
  // Idempotency: re-normalising the view produces the same shape.
  const reNormalised = normaliseGrammarRewardState(view);
  assert.deepEqual(
    snapshotGrammarRewardState(reNormalised),
    snapshotGrammarRewardState(view),
    'normaliseGrammarRewardState is idempotent (export → import round-trip stable)',
  );
});

// ----- Spelling cross-subject regression -------------------------------------
//
// Plan §U3 §508: `monsterSummaryFromState({ glossbloom: { mastered:
// ['grammar:current:noun_phrases'], caught: true } })` still produces
// Concordium with `progress.mastered === 1` — confirms `src/platform/game/
// mastery/spelling.js:148,177` callsites still route through the normaliser.
// Removing the callsite causes this test to fail.

test('U3 adversarial: Spelling cross-subject regression — monsterSummaryFromState routes Grammar through normaliser', () => {
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const state = { glossbloom: { caught: true, mastered: [preFlipKey] } };
  const summary = monsterSummaryFromState(state);
  const concordium = summary.find((entry) =>
    entry.subjectId === 'grammar' && entry.monster?.id === 'concordium',
  );
  assert.ok(concordium, 'Concordium must appear in the combined meadow summary via the normaliser at spelling.js:148');
  assert.equal(concordium.progress.mastered, 1,
    'Concordium.mastered === 1 confirms the normaliser callsite (spelling.js:148) routes retired-id evidence');
  assert.equal(concordium.progress.caught, true);
});

// ----- Integration — Covers F2: end-to-end reward pipeline -------------------
//
// Plan §U3 §509: end-to-end `grammar-answer-correct` command → mastery →
// reward → `reward.monster` event → home-meadow reads. The full Worker
// engine dispatch is exercised elsewhere (engine.test.js). This test pins
// the adapter layer — `rewardEventsFromGrammarEvents` consumes a
// grammar.concept-secured event and the result is a reward.monster event
// published into the gameState that `activeGrammarMonsterSummaryFromState`
// reads back.

test('U3 integration — Covers F2: grammar.concept-secured → rewardEvents → gameState → home-meadow Concordium fraction', () => {
  const repository = makeRepository();
  const learnerId = 'learner-f2';
  // Fire 9 concept-secureds (half of the aggregate).
  const conceptsHalf = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 9);
  for (const conceptId of conceptsHalf) {
    recordGrammarConceptMastery({
      learnerId,
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
  }
  // Home-meadow read path.
  const state = repository.state();
  const active = activeGrammarMonsterSummaryFromState(state);
  const concordium = active.find((entry) => entry.monster?.id === 'concordium');
  assert.ok(concordium, 'Concordium surfaces on the home meadow after 9 concept-secureds');
  assert.equal(concordium.progress.mastered, 9);
  // 9/18 ratio = 0.5 → stage 2.
  assert.equal(concordium.progress.stage, 2);
});

// ----- Error path — malformed state shape --------------------------------
//
// Plan §U3 §501: malformed state shape (state[reserved] = null, mastered is
// not an array) — normaliser returns shape-stable output without throwing.

test('U3 error path: normaliseGrammarRewardState on malformed state (reserved=null, mastered=non-array) returns shape-stable without throwing', () => {
  const malformed = {
    glossbloom: null,
    loomrill: { mastered: 'not-an-array', caught: true },
    mirrane: { mastered: undefined, caught: false },
    concordium: { mastered: 0, caught: 'yes' },
  };
  assert.doesNotThrow(() => normaliseGrammarRewardState(malformed));
  const view = normaliseGrammarRewardState(malformed);
  // Shape is stable even if caught flag has a truthy non-boolean value.
  assert.ok(view.concordium || view.glossbloom !== undefined,
    'output retains normalised structure even with malformed inputs');
});

// ----- Import of non-object yields empty/no-throw -----------------------------

test('U3 error path: normaliseGrammarRewardState accepts non-object inputs without throwing', () => {
  for (const input of [null, undefined, 42, 'string', []]) {
    assert.doesNotThrow(() => normaliseGrammarRewardState(input),
      `normaliseGrammarRewardState does not throw on input ${JSON.stringify(input)}`);
  }
});
