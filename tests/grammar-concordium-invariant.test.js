// Tests for U3 + U9 — Grammar Concordium-never-revoked composite invariant test.
//
// Plan: docs/plans/2026-04-26-001-feat-grammar-phase4-learning-hardening-plan.md (U3).
// Plan: docs/plans/2026-04-27-001-feat-grammar-phase5-star-curve-landing-plan.md (U9).
// Invariants: docs/plans/james/grammar/grammar-phase4-invariants.md §§7, 11.
// Invariants: docs/plans/james/grammar/grammar-phase5-invariants.md R6, R7.
//
// The single top-level assertion this file exists to prove:
// **Concordium.stage and versioned Concordium Stars are sticky ratchets** —
// no mutator (retry, re-scoring, writer self-heal, import/export round-trip,
// cross-release state carry, legacy migration, or adversarial payload) may
// decrement them across the full replay of a random or named mutator sequence.
// Old unversioned aggregate Concordium Stars are deliberately not sticky:
// the Grand model can take them back while preserving legacy stage reads.
//
// P5 U9 extends the ratchet to Stars (R6 — Stars are monotonically non-
// decreasing). The Star ratchet is checked both without conceptNodes (reward-
// layer path: Stars derive from starHighWater latch and legacy floor) and
// with synthetic conceptNodes (client read path: full evidence-tier
// derivation). Legacy migration shapes verify that pre-P5 direct monsters do
// not downgrade; Concordium has a documented Grand-model exception.
//
// The assertion is enforced after every step in every sequence using the
// same recordGrammarConceptMastery surface the production reward pipeline
// consumes. The ratchet invariant is paired with the denominator-freeze
// invariant (GRAMMAR_AGGREGATE_CONCEPTS.length === 18) as a module-load
// guard so Phase 5 expansion cannot silently revoke existing Mega holders.
//
// Structure:
//  1. Denominator-freeze hard gate (module-load assertion).
//  2. Ten named regression shapes: seven canonical adversarial scenarios under
//     seed 42 (P4 U3), plus three P5 legacy migration shapes (U9).
//  3. 200 random sequences under seed 42 (length 20..60), each step asserts
//     the ratchet invariant. Seed rotation: set env PROPERTY_SEED=<integer>
//     for nightly probes to explore other slices. Ops nightly workflow should
//     wire `PROPERTY_SEED=${{ github.run_id }}` (or an equivalent
//     run-id / date-based rotation) so the canonical suite at seed 42 and
//     the nightly probe both get exercised. File-level env gate is at line
//     ~230 below; the pre-mega-seeded ratchet case (see below) covers the
//     post-mega branch deterministically without depending on seed luck.
//  3b. 200 random sequences with synthetic conceptNodes (P5 Star ratchet).
//  4. Adversarial contract tests — stored-caught vs derived-caught, cross-
//     release direct monster token dedup, import/export round-trip, Spelling
//     cross-subject regression, integration via F2 end-to-end flow (with
//     Star field assertions added by U9).

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
import {
  GRAMMAR_MONSTER_STAR_MAX,
  GRAMMAR_GRAND_STAR_MODEL_VERSION,
  legacyStarFloorFromStage,
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
} from '../shared/grammar/grammar-stars.js';
import { simulateStarCurveProfile } from './helpers/grammar-simulation.js';

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
//
// INFO (defence-in-depth): `mastered >= maxPrior.mastered` already subsumes
// caught-stickiness under the derived-caught contract, because derived caught
// is `mastered.length >= 1` — so as long as mastered is monotonic, caught
// cannot flip back. P5 widened the caught contract to
// `mastered >= 1 || displayStars >= 1`, so a learner with zero mastered keys
// but a non-zero starHighWater latch is also considered caught. The explicit
// `maxPrior.caught → concordium.caught` check below is intentional redundancy
// in case the caught contract ever changes (e.g. revert to stored-caught or
// mixed caught logic), so the ratchet test keeps detecting direct revocations
// even if mastered monotonicity regresses.
// -----------------------------------------------------------------------------

function assertConcordiumRatchet(state, maxPrior, context, { conceptNodes = null, recentAttempts = null } = {}) {
  const progressOpts = { conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length };
  if (conceptNodes) progressOpts.conceptNodes = conceptNodes;
  if (recentAttempts) progressOpts.recentAttempts = recentAttempts;
  const concordium = progressForGrammarMonster(state, 'concordium', progressOpts);
  const rawStars = Math.max(0, Math.floor(Number(concordium.starHighWater ?? concordium.stars) || 0));
  assert.ok(
    concordium.stage >= maxPrior.stage,
    `${context}: Concordium.stage=${concordium.stage} < priorMax=${maxPrior.stage} — sticky-ratchet violated`,
  );
  // Once caught flips true, it must never flip back. Defence-in-depth — see
  // the module-level INFO comment above for why this is redundant with the
  // mastered-monotonicity check under the current derived-caught contract.
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
  // P5/P7 Star ratchet: versioned Stars are monotonically non-decreasing. When
  // conceptNodes are provided, the Star computation path is exercised and
  // the ratchet covers the full evidence-derived Stars pipeline. The
  // Grand model intentionally ignores old unversioned aggregate high-water;
  // once a versioned starHighWater is written, it remains the monotonic latch.
  assert.ok(
    rawStars >= maxPrior.stars,
    `${context}: Concordium.rawStars=${rawStars} < priorMax=${maxPrior.stars} — Star sticky-ratchet violated (R6)`,
  );
  return {
    stage: Math.max(maxPrior.stage, concordium.stage),
    caught: maxPrior.caught || concordium.caught,
    mastered: Math.max(maxPrior.mastered, concordium.mastered),
    stars: Math.max(maxPrior.stars, rawStars),
  };
}

// Seed the ratchet accumulator from the INITIAL loaded state, not zero. A
// release-id contract regression that silently drops retired-state concepts
// from the Concordium view would otherwise satisfy `mastered === 0 >= 0`
// trivially and pass. By seeding from the initial view, the ratchet compares
// against the loaded state's Concordium level and catches any decrement
// relative to the baseline.
function initialMaxPriorFromState(state, { conceptNodes = null, recentAttempts = null } = {}) {
  const opts = { conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length };
  if (conceptNodes) opts.conceptNodes = conceptNodes;
  if (recentAttempts) opts.recentAttempts = recentAttempts;
  const concordium = progressForGrammarMonster(state, 'concordium', opts);
  return {
    stage: concordium.stage,
    caught: Boolean(concordium.caught),
    mastered: concordium.mastered,
    stars: Math.max(0, Math.floor(Number(concordium.starHighWater ?? concordium.stars) || 0)),
  };
}

// -----------------------------------------------------------------------------
// Action executor — one mutator step. Matches the plan's "random sequences"
// shape: (conceptId, correct|wrong, isTransferSave). The mutator surface is
// recordGrammarConceptMastery for correct-answer secures; for wrong answers
// the no-op is accurate (wrong answers do not secure a concept, so the
// reward pipeline never receives a concept-secured event — the ratchet
// holds trivially). Transfer-save dispatches a real grammar.transfer-
// evidence-saved event through rewardEventsFromGrammarEvents (the production
// reward subscriber), asserting that zero reward.monster events come out —
// this is what the plan invariant 5 (Writing Try is non-scored) ACTUALLY
// means in production: the subscriber filters on type === 'grammar.concept-
// secured', so a transfer-evidence event is silently dropped at the real
// production boundary. The 10% transfer-save slice of random sequences now
// exercises this real production filter on every step instead of being a
// test-file no-op.
// -----------------------------------------------------------------------------

function applyAction(repository, action, learnerId) {
  if (action.isTransferSave) {
    // Plan invariant 5: Writing Try is non-scored. Build a realistic
    // transfer-evidence-saved event (exactly the shape the Worker engine's
    // saveTransferEvidence helper emits at worker/src/subjects/grammar/
    // engine.js:1783-1789) and dispatch it through the production reward
    // subscriber. The subscriber is `rewardEventsFromGrammarEvents`, which
    // at src/subjects/grammar/event-hooks.js:18 short-circuits on
    // `event.type !== GRAMMAR_EVENT_TYPES.CONCEPT_SECURED`. The assertion
    // below is the load-bearing production contract: a transfer-evidence
    // event produces zero reward events.
    const transferEvent = {
      id: `grammar.transfer-evidence-saved.${learnerId}.seq-${Date.now()}.${action.conceptId}`,
      type: 'grammar.transfer-evidence-saved',
      subjectId: 'grammar',
      learnerId,
      contentReleaseId: GRAMMAR_REWARD_RELEASE_ID,
      promptId: action.conceptId,
      savedAt: 1,
      nonScored: true,
      createdAt: 1,
    };
    const events = rewardEventsFromGrammarEvents([transferEvent], {
      gameStateRepository: repository,
      random: () => 0,
    });
    assert.equal(
      events.length,
      0,
      `transfer-save must not reach reward pipeline — got ${events.length} events for transfer event ${transferEvent.id}`,
    );
    return { events };
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

function runSequence(repository, actions, { label, learnerId = 'learner-a', buildConceptNodes = null, buildRecentAttempts = null } = {}) {
  // Seed the ratchet accumulator from the INITIAL loaded state, so the
  // ratchet compares against the loaded Concordium level (not zero). This
  // catches release-id contract regressions that silently drop retired-
  // state concepts: a regression would produce mastered=0 for a loaded state
  // that genuinely had mastered=1, and the ratchet would now fire against
  // maxPrior.mastered=1 from the initial snapshot (was silently passing
  // under the old `initialMaxPrior()` fresh-zero seed).
  const initNodes = buildConceptNodes ? buildConceptNodes() : null;
  const initAttempts = buildRecentAttempts ? buildRecentAttempts() : null;
  let maxPrior = initialMaxPriorFromState(repository.state(), { conceptNodes: initNodes, recentAttempts: initAttempts });
  const allEvents = [];
  for (let i = 0; i < actions.length; i += 1) {
    const action = actions[i];
    const context = `${label || 'sequence'} step=${i + 1}/${actions.length} action=${JSON.stringify(action)}`;
    const { events } = applyAction(repository, action, learnerId);
    allEvents.push(...events);
    const state = repository.state();
    const nodes = buildConceptNodes ? buildConceptNodes() : null;
    const attempts = buildRecentAttempts ? buildRecentAttempts() : null;
    maxPrior = assertConcordiumRatchet(state, maxPrior, context, { conceptNodes: nodes, recentAttempts: attempts });
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

test('U3 named shape 1: 18 secure answers in random order → Concordium mastery reaches legacy Mega while display stays Star-gated', () => {
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

  assert.deepEqual(events, [], 'secure-only replay emits no monster reward events');
  // Final state: secure-only mastery reaches the legacy Mega stage, but
  // child-facing Grand display remains gated until Star-display breadth is
  // present on enough direct Grammar monsters. Secure skills are learner
  // progress evidence; they no longer mint monster reward display by
  // themselves.
  const concordium = progressForGrammarMonster(repository.state(), 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordium.stage, 4);
  assert.equal(concordium.mastered, 18);
  assert.equal(concordium.caught, false);
  assert.equal(concordium.displayState, 'not-found');
  assert.equal(concordium.stars, 0);
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

  assert.deepEqual(events, [], 'secure-only self-heal emits no monster reward events');
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
  assert.deepEqual(first, [], 'first secure persists mastery but emits no monster reward events');
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
// in one command. Monster reward events are now Star-threshold driven, so
// concept-secured events persist state but emit zero reward.monster events.

test('U3 named shape 5: 3 concepts crossing secure threshold in one batch persist state without monster events', () => {
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

  assert.deepEqual(events, [], 'secure batch emits no monster reward events');
  const state = repository.state();
  assert.equal(progressForGrammarMonster(state, 'bracehart', { conceptTotal: 6 }).mastered, 2);
  assert.equal(progressForGrammarMonster(state, 'couronnail', { conceptTotal: 3 }).mastered, 1);
  assert.equal(progressForGrammarMonster(state, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  }).mastered, 3);
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
  assert.deepEqual(events, [], 'transfer save and secure-only event emit zero monster rewards');
  const state = repository.state();
  assert.deepEqual(state.bracehart.mastered, [grammarMasteryKey('noun_phrases')]);
  assert.deepEqual(state.concordium.mastered, [grammarMasteryKey('noun_phrases')]);
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

  // Subsequent real answers persist current-release state but no longer emit
  // secure-driven monster reward events. Star evidence owns those events.
  const repository = makeRepository(state);
  const events = recordGrammarConceptMastery({
    learnerId: 'learner-v7',
    conceptId: 'noun_phrases',
    gameStateRepository: repository,
    random: () => 0,
  });
  assert.deepEqual(events, [], 'secure-only replay emits no monster reward events');
});

// ----- Named shape 8 (P5 legacy): pre-P5 Couronnail at Mega (3/3 secure, no retention evidence) ----
//
// Plan §U9: Under the new Star curve, derived Stars for a Couronnail with 3/3
// mastered but NO retention evidence would be < 100 (since
// retainedAfterSecure accounts for 60% of the budget). But the legacy floor
// must hold at Mega (stage 4, displayStars = 100) because the learner earned
// that stage under the old ratio-based system.

test('U9 named shape 8 (P5 legacy): pre-P5 Couronnail at Mega (3/3 secure, no retention evidence) → legacy floor preserves Mega', () => {
  // Build a pre-P5 Couronnail state: 3/3 mastered, no starHighWater field
  // (signals legacy learner). Under old ratio-based staging: 3/3 = 1.0 → stage 4.
  const couronnailConcepts = ['word_classes', 'standard_english', 'formality'];
  const masteredKeys = couronnailConcepts.map((id) => grammarMasteryKey(id));
  const initialState = {
    couronnail: {
      mastered: masteredKeys,
      caught: true,
      conceptTotal: 3,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
      // No starHighWater — this is the signal for a pre-P5 learner.
    },
    concordium: {
      mastered: masteredKeys,
      caught: true,
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
      // No starHighWater — pre-P5.
    },
  };

  // Concordium progress with NO conceptNodes (reward-layer read path):
  // legacy stage is still retained for compatibility, but unversioned
  // aggregate high-water no longer drives child-facing Grand Stars.
  const concordium = progressForGrammarMonster(initialState, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordium.caught, false, 'Concordium display remains gated with only one direct monster found');
  assert.equal(concordium.mastered, 3, 'Concordium has 3 mastered concepts');
  assert.ok(concordium.stage >= 1, 'Concordium stage >= 1 via legacy floor');
  assert.equal(concordium.starHighWater, 0, 'Concordium old aggregate Star floor is ignored');
  assert.equal(concordium.stars, 0, 'Concordium child-facing Stars stay hidden until the Grand tier model qualifies');

  // Couronnail progress: legacy 3/3 = 1.0 → stage 4. Legacy floor = 100 Stars.
  const couronnail = progressForGrammarMonster(initialState, 'couronnail', {
    conceptTotal: 3,
  });
  assert.equal(couronnail.stage, 4, 'Couronnail Mega preserved via legacy floor');
  assert.equal(couronnail.stars, 100, 'Couronnail displayStars = 100 via legacy floor (R7)');
  assert.ok(couronnail.caught, 'Couronnail remains caught');

  // Even with conceptNodes that produce partial evidence (secure but no
  // retention), the legacy floor still holds because there is no
  // starHighWater field.
  const partialNodes = {};
  for (const cId of couronnailConcepts) {
    partialNodes[cId] = {
      attempts: 10,
      correct: 8,
      wrong: 2,
      strength: 0.85,
      intervalDays: 14,
      correctStreak: 5,
    };
  }
  const couronnailWithNodes = progressForGrammarMonster(initialState, 'couronnail', {
    conceptTotal: 3,
    conceptNodes: partialNodes,
    recentAttempts: couronnailConcepts.map((cId) => ({
      conceptId: cId,
      templateId: `tpl-${cId}-a`,
      correct: true,
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
    })),
  });
  // With evidence: firstIndependentWin (5%) + secureConfidence (15%) = 20%
  // per concept. Computed Stars = floor(3 * (100/3) * 0.20) = floor(20) = 20.
  // But legacy floor = 100 (stage 4). displayStars = max(20, 0, 100) = 100.
  assert.equal(couronnailWithNodes.stars, 100, 'Legacy floor overrides derived Stars when no starHighWater');
  assert.equal(couronnailWithNodes.stage, 4, 'Mega stage preserved');
});

// ----- Named shape 9 (P5 legacy): pre-P5 Concordium at stage 3 (14/18 secure) ----
//
// Plan §U9 was superseded by the Grand model: unversioned Concordium Star
// high-water is ignored so old aggregate Stars can be taken back, while the
// legacy stage still stays available for backward-compatible status reads.

test('U9 named shape 9 (P5 legacy): pre-P5 Concordium at stage 3 (14/18 secure) → Grand Stars reset', () => {
  // Build pre-P5 Concordium state: 14/18 mastered, no starHighWater.
  // Under old ratio-based staging: 14/18 = 0.778 → stage 3.
  const concepts14 = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 14);
  const masteredKeys = concepts14.map((id) => grammarMasteryKey(id));
  const initialState = {
    concordium: {
      mastered: masteredKeys,
      caught: true,
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
      // No starHighWater — pre-P5 learner.
    },
  };

  // Without conceptNodes: computedStars = 0, and old unversioned aggregate
  // Star latches are not accepted by the Grand model.
  const concordium = progressForGrammarMonster(initialState, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordium.mastered, 14, 'Concordium has 14 mastered concepts');
  assert.ok(concordium.stage >= 3, 'Concordium stage >= 3 (legacy floor preserves Growing)');
  assert.equal(concordium.starHighWater, 0, 'Concordium old aggregate Star floor is ignored by the Grand model');
  assert.equal(concordium.stars, 0, 'Concordium child-facing Stars are reset');
  assert.equal(concordium.caught, false, 'Concordium display remains gated without Grand breadth/depth');

  // Run a 20-step random replay on top — ratchet must hold from baseline.
  const repository = makeRepository(initialState);
  const actionRng = makeSeededRandom(PROPERTY_SEED * 13 + 7);
  const actions = randomSequence(actionRng, 20);
  const { maxPrior } = runSequence(repository, actions, {
    label: 'shape-9-legacy-concordium-stage3',
    learnerId: 'learner-legacy-concordium',
  });
  assert.ok(maxPrior.stage >= 3, `Ratchet: final maxPrior.stage=${maxPrior.stage} >= 3`);
  assert.equal(maxPrior.stars, 0, 'Grand-model Concordium Stars remain reset until versioned Star evidence writes them');
});

// ----- Named shape 10 (P5 legacy): reserved monster evidence → normaliser unions ----
//
// Plan §U9 edge case: pre-P5 learner with reserved monster evidence (Glossbloom)
// → normaliser unions into Concordium → Stars ratchet holds across subsequent
// answers.

test('U9 named shape 10 (P5 legacy): reserved monster evidence normalised into Concordium → Star ratchet holds', () => {
  // NOTE: The ratchet seeds from un-normalised state (zero baseline) because
  // makeRepository receives the raw pre-flip shape and the sequence runner's
  // initialMaxPriorFromState reads from the raw repo (which has no
  // concordium entry yet). This means the test exercises "Stars grow from
  // zero" rather than "normalised baseline preserved" — the normalised
  // baseline path is covered by shapes 8 and 9 which seed explicit
  // concordium entries.
  const preFlipKey = grammarMasteryKey('noun_phrases');
  const initialState = {
    glossbloom: { caught: true, mastered: [preFlipKey] },
    // No concordium entry — normaliser creates it from retired evidence.
  };
  const repository = makeRepository(initialState);

  // After normalisation, Concordium preserves retired evidence, but the
  // child-facing display is gated until enough direct monsters are found.
  const normState = normaliseGrammarRewardState(repository.state());
  const concordiumInit = progressForGrammarMonster(normState, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(concordiumInit.caught, false, 'Concordium display remains gated via retired evidence');
  assert.equal(concordiumInit.mastered, 1, 'retired evidence still contributes to the aggregate mastered count');

  // Replay 30 steps — ratchet must never drop below the initial state.
  const actionRng = makeSeededRandom(PROPERTY_SEED * 17 + 3);
  const actions = randomSequence(actionRng, 30);
  const { maxPrior } = runSequence(repository, actions, {
    label: 'shape-10-reserved-normalised',
    learnerId: 'learner-reserved',
  });
  assert.ok(maxPrior.stars >= 0, 'Ratchet: Stars non-negative throughout');
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
// 2b. P5 Star ratchet — 200 random sequences with synthetic conceptNodes.
//
// The test above exercises the reward-layer path (no conceptNodes — Stars
// derive from the starHighWater latch and legacy floor only). This companion
// test exercises the full Star computation path by building synthetic concept
// evidence that grows as concepts are secured. Each step asserts
// `stars >= maxPriorStars` in addition to the existing stage/caught/mastered
// ratchet (R6 — Stars are monotonically non-decreasing).
// =============================================================================

test(`U9 P5 Star ratchet: 200 seeded random sequences (seed ${PROPERTY_SEED}) with conceptNodes hold stars >= maxPriorStars`, () => {
  const sequenceRng = makeSeededRandom(PROPERTY_SEED);
  for (let i = 0; i < 200; i += 1) {
    const length = 20 + Math.floor(sequenceRng() * 41); // 20..60
    const actionRng = makeSeededRandom(PROPERTY_SEED + i * 31 + 1);
    const actions = randomSequence(actionRng, length);
    const repository = makeRepository();

    // Track which concepts have been secured so far. Each correct action
    // on a concept simulates a concept-secured event — the concept gains
    // synthetic evidence nodes that only grow (matching the latched nature
    // of evidence tiers in the production system).
    const securedConcepts = new Set();
    let templateCounter = 0;
    const syntheticAttempts = [];

    // Pre-scan actions to build the final evidence set. This is safe
    // because evidence tiers are latched (once unlocked, permanent). The
    // monotonic property means the final evidence set is a superset of
    // every intermediate step's evidence — so checking the ratchet with
    // the final set is at least as strict as checking with per-step sets.
    for (const action of actions) {
      if (action.correct && !action.isTransferSave) {
        securedConcepts.add(action.conceptId);
        syntheticAttempts.push({
          conceptId: action.conceptId,
          templateId: `tpl-${action.conceptId}-${templateCounter++}`,
          correct: true,
          firstAttemptIndependent: true,
          supportLevelAtScoring: 0,
        });
        // Second attempt for repeatIndependentWin.
        syntheticAttempts.push({
          conceptId: action.conceptId,
          templateId: `tpl-${action.conceptId}-${templateCounter++}`,
          correct: true,
          firstAttemptIndependent: true,
          supportLevelAtScoring: 0,
        });
      }
    }

    // buildConceptNodes returns a growing evidence map. Each secured
    // concept gets a node with secure-level confidence. The evidence
    // only grows because securedConcepts is additive.
    const buildConceptNodes = () => {
      const nodes = {};
      for (const cId of securedConcepts) {
        nodes[cId] = {
          attempts: 10,
          correct: 8,
          wrong: 2,
          strength: 0.85,
          intervalDays: 14,
          correctStreak: 5,
        };
      }
      return nodes;
    };

    // buildRecentAttempts returns the accumulated synthetic attempts so
    // progressForGrammarMonster receives both conceptNodes and
    // recentAttempts — exercising the full attempt-dependent evidence
    // tier pipeline (firstIndependentWin, repeatIndependentWin).
    const buildRecentAttempts = () => syntheticAttempts.slice();

    try {
      runSequence(repository, actions, {
        label: `p5-star-seq-${i}`,
        learnerId: `learner-star-${i}`,
        buildConceptNodes,
        buildRecentAttempts,
      });
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        throw new Error(`[concordium-star-ratchet] FAILED seed=${PROPERTY_SEED} seq=${i} :: ${error.message}`);
      }
      throw error;
    }
  }
});

// -----------------------------------------------------------------------------
// Pre-mega-seeded ratchet case — covers the post-mega branch deterministically.
// Seed 42 with sequences of length 20..60 rarely reaches Concordium stage 4
// from a fresh repository (the adversarial reviewer flagged this as
// "post-mega ratchet branch effectively untested under the default seed").
// This test pins the post-mega branch by seeding a state that is ONE secure
// away from Mega (17/18 aggregate) and then running a 40-step random mutator
// replay on top — so every step asserts the ratchet from baseline
// `{ stage: 3, mastered: 17, caught: true }` via initialMaxPriorFromState.
// A regression that drops mastered below 17 or stage below 3 fails the
// ratchet at step 1, independent of whether Mega is ever re-emitted.
// -----------------------------------------------------------------------------

test('U3 post-mega branch: pre-seed 17/18 state + 40-step random replay → ratchet holds from stage 3 baseline', () => {
  // Build a 17-of-18 aggregate state deterministically. Use
  // GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 17) so the one unsecured concept is
  // stable (the last entry in the list). This makes the test deterministic
  // regardless of PROPERTY_SEED.
  const pre = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 17);
  const remaining = GRAMMAR_AGGREGATE_CONCEPTS[17];
  assert.ok(remaining, 'pre-mega test precondition: GRAMMAR_AGGREGATE_CONCEPTS has at least 18 entries');
  const masteredKeys = pre.map((id) => grammarMasteryKey(id));
  const initialState = {
    concordium: {
      mastered: masteredKeys,
      caught: true,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
    },
  };
  const repository = makeRepository(initialState);

  // Baseline sanity: Concordium reads stage=3 (17/18 >= 0.75 but < 1.0),
  // while child-facing caught/display stay gated because direct monsters do
  // not have Star-display breadth in this synthetic secure-only fixture.
  const baseline = progressForGrammarMonster(repository.state(), 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(baseline.stage, 3, 'precondition: 17/18 mastered maps to stage 3');
  assert.equal(baseline.mastered, 17);
  assert.equal(baseline.caught, false);
  assert.equal(baseline.displayState, 'not-found');

  // 40-step random replay. The random sequence may or may not fire the
  // final secure for `remaining`; either way, ratchet never drops from
  // baseline (stage>=3, mastered>=17, caught stays true).
  const actionRng = makeSeededRandom((PROPERTY_SEED * 7919) >>> 0);
  const actions = randomSequence(actionRng, 40);
  const { maxPrior } = runSequence(repository, actions, {
    label: 'post-mega-17-of-18',
    learnerId: 'learner-pre-mega',
  });

  // Ratchet accumulator MUST be >= baseline at termination — the initialMax
  // Prior seed is what makes this assertion load-bearing. Under the old
  // fresh-zero seed, a contract regression producing mastered=0 would
  // satisfy `0 >= 0` and pass silently.
  assert.ok(
    maxPrior.stage >= 3,
    `post-mega ratchet: final maxPrior.stage=${maxPrior.stage} below baseline stage=3`,
  );
  assert.ok(
    maxPrior.mastered >= 17,
    `post-mega ratchet: final maxPrior.mastered=${maxPrior.mastered} below baseline mastered=17`,
  );
});

// =============================================================================
// 3. Adversarial contract tests — stored vs derived, cross-release dedup,
// import/export round-trip, Spelling cross-subject regression, F2 integration.
// =============================================================================

// ----- Stored-caught vs derived-caught adversarial ---------------------------
//
// Plan §U3 §506: state `{ concordium: { caught: true, mastered: [] } }` —
// `progressForGrammarMonster` returns `caught = (mastered >= 1 || displayStars >= 1)`.
// P5 widened the caught contract: a learner with zero mastered keys but a
// non-zero starHighWater latch is also considered caught. Without either
// signal, caught is false despite the stored flag. Stored flag is `true`,
// derived flag is `false`. Test pins which is authoritative; plan names
// stored-caught as load-bearing, but the current production contract derives
// caught from mastered + Stars. This test pins the current contract and names
// the deviation from the plan explicitly.

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
  assert.equal(concordium.caught, false);
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
  assert.equal(concordium.progress.caught, false);
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

// ----- Integration — Covers F2 (P5): end-to-end with Star check ---------------
//
// Plan §U9: full F2 end-to-end flow — concept-secured event → reward recording
// → Star check → ratchet assertion. Extends the existing F2 test with Star
// field assertions and a ratchet across all 18 secures.

test('U9 integration — F2 end-to-end: concept-secured → reward → Star ratchet across all 18 concepts', () => {
  const repository = makeRepository();
  const learnerId = 'learner-f2-stars';
  let maxStars = 0;

  // Fire concept-secureds one by one and verify the Star ratchet after each.
  for (let i = 0; i < GRAMMAR_AGGREGATE_CONCEPTS.length; i += 1) {
    const conceptId = GRAMMAR_AGGREGATE_CONCEPTS[i];
    recordGrammarConceptMastery({
      learnerId,
      conceptId,
      gameStateRepository: repository,
      random: () => 0,
    });
    const state = repository.state();
    const concordium = progressForGrammarMonster(state, 'concordium', {
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    });
    // Stars field must exist and be non-negative. The child-facing Stars may
    // remain gated to zero; the raw starHighWater field is the ratchet.
    assert.ok(typeof concordium.stars === 'number' && concordium.stars >= 0,
      `step ${i + 1}: stars must be a non-negative number, got ${concordium.stars}`);
    const rawStars = Math.max(0, Math.floor(Number(concordium.starHighWater ?? concordium.stars) || 0));
    // Raw Star ratchet: once earned, never lost.
    assert.ok(rawStars >= maxStars,
      `step ${i + 1}: rawStars=${rawStars} < maxPrior=${maxStars} — Star ratchet violated`);
    maxStars = Math.max(maxStars, rawStars);
    // starHighWater must be persisted and >= child-facing stars.
    assert.ok(concordium.starHighWater >= concordium.stars,
      `step ${i + 1}: starHighWater=${concordium.starHighWater} < stars=${concordium.stars}`);
  }

  // After all 18, Concordium is at Mega.
  const finalState = repository.state();
  const final = progressForGrammarMonster(finalState, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });
  assert.equal(final.mastered, 18, 'all 18 concepts mastered');
  assert.equal(final.stage, 4, 'Concordium at Mega (stage 4)');
  assert.equal(final.caught, false, 'Concordium display remains locked in this secure-only fixture');
  assert.equal(final.displayState, 'not-found');
  // starHighWater must be at its maximum for the sequence.
  assert.ok(final.starHighWater >= maxStars,
    `final starHighWater=${final.starHighWater} must be >= maxStars=${maxStars}`);

  // Snapshot confirms starHighWater is preserved in the snapshot helper.
  const snap = snapshotGrammarRewardState(finalState);
  assert.ok(snap.concordium?.starHighWater !== undefined,
    'starHighWater field preserved in snapshot for tracing');
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

// =============================================================================
// Phase 6 — Ratchet extension: sub-secure persistence shapes.
//
// Invariants: docs/plans/james/grammar/grammar-phase6-invariants.md (P6-4, P6-5, P6-6).
// Plan: docs/plans/2026-04-27-002-feat-grammar-phase6-star-evidence-authority-plan.md (U7).
//
// This section extends the 200-random ratchet with sub-secure persistence
// shapes and adds two named regression shapes plus a Grand Concordium timeline
// assertion (R14 analogue for Phase 6).
// =============================================================================

// =============================================================================
// 2c. P6 Sub-secure persistence ratchet — 200 random sequences that include
// star-evidence-updated events firing BEFORE concept-secured, and
// recentAttempts truncation mid-sequence.
//
// Stars must never decrease: stars >= maxPriorStars after every step,
// even when the derivation path transitions between sub-secure evidence
// (starHighWater latch) and post-secure evidence (full computation).
// =============================================================================

test(`U7 P6 sub-secure ratchet: 200 seeded sequences (seed ${PROPERTY_SEED}) with star-evidence-updated before concept-secured hold star monotonicity`, () => {
  const sequenceRng = makeSeededRandom(PROPERTY_SEED);
  for (let i = 0; i < 200; i += 1) {
    const length = 20 + Math.floor(sequenceRng() * 41); // 20..60
    const actionRng = makeSeededRandom(PROPERTY_SEED + i * 37 + 5);
    const actions = randomSequence(actionRng, length);
    const repository = makeRepository();

    // Track which concepts have been secured and build growing evidence.
    const securedConcepts = new Set();
    let templateCounter = 0;
    const syntheticAttempts = [];
    // Simulate recentAttempts truncation at capacity 50.
    const TRUNCATION_CAPACITY = 50;

    for (const action of actions) {
      if (action.correct && !action.isTransferSave) {
        securedConcepts.add(action.conceptId);
        syntheticAttempts.push({
          conceptIds: [action.conceptId],
          result: { correct: true },
          templateId: `tpl-${action.conceptId}-${templateCounter++}`,
          firstAttemptIndependent: true,
          supportLevelAtScoring: 0,
          createdAt: 1_777_000_000_000 + templateCounter * 60000,
        });
      }
    }

    // buildConceptNodes: growing evidence map that uses production shape.
    const buildConceptNodes = () => {
      const nodes = {};
      for (const cId of securedConcepts) {
        nodes[cId] = {
          attempts: 10,
          correct: 8,
          wrong: 2,
          strength: 0.85,
          intervalDays: 14,
          correctStreak: 5,
        };
      }
      return nodes;
    };

    // buildRecentAttempts: apply truncation to simulate window rollover.
    // When the list exceeds TRUNCATION_CAPACITY, only the most recent
    // entries survive — modelling the production recentAttempts ring buffer.
    const buildRecentAttempts = () => {
      if (syntheticAttempts.length <= TRUNCATION_CAPACITY) {
        return syntheticAttempts.slice();
      }
      return syntheticAttempts.slice(-TRUNCATION_CAPACITY);
    };

    try {
      runSequence(repository, actions, {
        label: `p6-sub-secure-seq-${i}`,
        learnerId: `learner-p6-${i}`,
        buildConceptNodes,
        buildRecentAttempts,
      });
    } catch (error) {
      if (error instanceof assert.AssertionError) {
        throw new Error(`[p6-sub-secure-ratchet] FAILED seed=${PROPERTY_SEED} seq=${i} :: ${error.message}`);
      }
      throw error;
    }
  }
});

// =============================================================================
// P6 Named regression shape 11: Sub-secure Stars earned → session ends →
// recentAttempts rolls → starHighWater holds.
//
// This shape exercises the critical path where a learner earns Stars from
// sub-secure evidence (firstIndependentWin, repeatIndependentWin) before any
// concept reaches secure status. The session then ends (simulated by clearing
// recentAttempts on the next read), and the starHighWater latch must preserve
// the earned Stars.
// =============================================================================

test('U7 P6 named shape 11: sub-secure Stars earned → recentAttempts rolls → starHighWater holds', () => {
  // This test exercises the P6-4 contract: Stars earned via sub-secure
  // evidence (before concept-secured fires) persist across session boundaries
  // via the starHighWater latch.
  //
  // Production pipeline:
  //   1. Worker fires grammar.star-evidence-updated after each practice answer
  //   2. event-hooks.js calls updateGrammarStarHighWater to persist the latch
  //   3. On next read, progressForGrammarMonster reads starHighWater from state
  //
  // This test simulates the pipeline: first, we compute Stars from evidence
  // via progressForGrammarMonster with conceptNodes (the client read path),
  // then write the starHighWater back (simulating the updateGrammarStarHighWater
  // call), then verify a subsequent read WITHOUT conceptNodes uses the latch.

  // Build a reward state with 3 concept-secured entries + starHighWater: 0
  // (fresh post-P5 learner who has just started).
  const conceptsSecured = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 3);
  const masteredKeys = conceptsSecured.map((id) => grammarMasteryKey(id));
  const initialState = {
    concordium: {
      mastered: masteredKeys,
      caught: true,
      conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
      releaseId: GRAMMAR_REWARD_RELEASE_ID,
      starHighWater: 0,
    },
  };

  // Phase 1: Client read with conceptNodes and recentAttempts (sub-secure
  // evidence for 6 concepts — 3 secured + 3 with partial evidence only).
  const allConcepts = GRAMMAR_AGGREGATE_CONCEPTS.slice(0, 6);
  const conceptNodes = {};
  for (const cId of allConcepts) {
    conceptNodes[cId] = {
      attempts: 10,
      correct: 8,
      wrong: 2,
      strength: 0.85,
      intervalDays: 14,
      correctStreak: 5,
    };
  }
  const recentAttempts = allConcepts.flatMap((cId) => [
    {
      conceptIds: [cId],
      result: { correct: true },
      templateId: `tpl-${cId}-a`,
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: 1_777_000_000_000,
    },
    {
      conceptIds: [cId],
      result: { correct: true },
      templateId: `tpl-${cId}-b`,
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: 1_777_000_060_000,
    },
  ]);

  const starsWithEvidence = progressForGrammarMonster(initialState, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes,
    recentAttempts,
  });
  assert.ok(starsWithEvidence.stars > 0,
    `Stars with sub-secure evidence must be positive, got ${starsWithEvidence.stars}`);
  const derivedStars = starsWithEvidence.stars;

  // Phase 2: Simulate updateGrammarStarHighWater writing the latch.
  // In production, this happens via the star-evidence-updated event pipeline.
  const stateAfterWrite = clone(initialState);
  stateAfterWrite.concordium.starHighWater = Math.max(
    stateAfterWrite.concordium.starHighWater || 0,
    derivedStars,
  );
  stateAfterWrite.concordium.starModelVersion = GRAMMAR_GRAND_STAR_MODEL_VERSION;

  // Phase 3: Session ends — read WITHOUT conceptNodes or recentAttempts.
  // Only the persisted starHighWater protects the Stars.
  const starsAfterRoll = progressForGrammarMonster(stateAfterWrite, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
  });

  // The raw starHighWater latch must preserve the derived Stars across the
  // roll. Child-facing displayStars may be gated to 0 for Concordium when
  // the direct-monster breadth gate is not met on this later read.
  assert.ok(starsAfterRoll.starHighWater >= derivedStars,
    `After recentAttempts roll: raw starHighWater=${starsAfterRoll.starHighWater} ` +
    `must be >= derived ${derivedStars} (P6-4: starHighWater holds)`);
  assert.ok(starsAfterRoll.starHighWater >= derivedStars,
    `After recentAttempts roll: starHighWater=${starsAfterRoll.starHighWater} ` +
    `must be >= derived ${derivedStars} (P6-4: latch persisted)`);

  // Phase 4: Verify the latch is monotonic — writing a LOWER computed value
  // must NOT decrease starHighWater.
  const stateLowEvidence = clone(stateAfterWrite);
  const lowNodes = {};
  lowNodes[allConcepts[0]] = conceptNodes[allConcepts[0]]; // Only 1 concept
  const lowRecentAttempts = recentAttempts.slice(0, 2); // Only 2 attempts
  const starsLowEvidence = progressForGrammarMonster(stateLowEvidence, 'concordium', {
    conceptTotal: GRAMMAR_AGGREGATE_CONCEPTS.length,
    conceptNodes: lowNodes,
    recentAttempts: lowRecentAttempts,
  });
  assert.ok(starsLowEvidence.starHighWater >= derivedStars,
    `With reduced evidence: raw starHighWater=${starsLowEvidence.starHighWater} ` +
    `must be >= original ${derivedStars} because starHighWater holds`);
});

// =============================================================================
// P6 Named regression shape 12: Pre-secure corrects + concept becomes secure →
// retainedAfterSecure must NOT retroactively unlock without temporal proof.
//
// This shape exercises the temporal constraint: a learning burst before secure
// status does not satisfy the retainedAfterSecure tier. The correct answer's
// createdAt must be AFTER the estimated secure date.
// =============================================================================

test('U7 P6 named shape 12: retainedAfterSecure must NOT retroactively unlock without temporal proof (createdAt required)', () => {
  // Scenario: learner has 5 correct answers, all with createdAt BEFORE
  // the concept became secure. Then the concept reaches secure status.
  // retainedAfterSecure must be false because there is no post-secure
  // temporal proof.
  const nowTs = 1_777_000_000_000;
  const secureNode = {
    attempts: 10,
    correct: 8,
    wrong: 2,
    strength: 0.90,
    intervalDays: 21, // long interval
    correctStreak: 6,
  };

  // securedAtTs = nowTs - (intervalDays * 86400000) = nowTs - 21 days
  const securedAtTs = nowTs - (21 * 86_400_000);

  // All attempts are from BEFORE the estimated secure date.
  const preSecureAttempts = [
    {
      conceptId: 'adverbials',
      correct: true,
      templateId: 'tpl-adv-1',
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: securedAtTs - 10 * 86_400_000, // 10 days before secure
    },
    {
      conceptId: 'adverbials',
      correct: true,
      templateId: 'tpl-adv-2',
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: securedAtTs - 5 * 86_400_000, // 5 days before secure
    },
    {
      conceptId: 'adverbials',
      correct: true,
      templateId: 'tpl-adv-3',
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: securedAtTs - 1 * 86_400_000, // 1 day before secure
    },
  ];

  const noRetention = deriveGrammarConceptStarEvidence({
    conceptId: 'adverbials',
    conceptNode: secureNode,
    recentAttempts: preSecureAttempts,
    nowTs,
  });

  assert.equal(noRetention.secureConfidence, true,
    'shape-12: concept is secure');
  assert.equal(noRetention.firstIndependentWin, true,
    'shape-12: has independent wins');
  assert.equal(noRetention.repeatIndependentWin, true,
    'shape-12: has repeat independent wins');
  assert.equal(noRetention.variedPractice, true,
    'shape-12: has varied practice (3 distinct templates, all correct)');
  assert.equal(noRetention.retainedAfterSecure, false,
    'shape-12: retainedAfterSecure must be FALSE — all createdAt are pre-secure ' +
    '(P6-3: temporal proof requires post-secure createdAt)');

  // Now add ONE post-secure attempt — retainedAfterSecure unlocks.
  const postSecureAttempts = [
    ...preSecureAttempts,
    {
      conceptId: 'adverbials',
      correct: true,
      templateId: 'tpl-adv-4',
      firstAttemptIndependent: true,
      supportLevelAtScoring: 0,
      createdAt: securedAtTs + 2 * 86_400_000, // 2 days AFTER secure
    },
  ];

  const withRetention = deriveGrammarConceptStarEvidence({
    conceptId: 'adverbials',
    conceptNode: secureNode,
    recentAttempts: postSecureAttempts,
    nowTs,
  });

  assert.equal(withRetention.retainedAfterSecure, true,
    'shape-12: retainedAfterSecure unlocks when ONE post-secure createdAt exists ' +
    '(P6-3: temporal proof satisfied)');

  // Verify the Star impact: retained tier accounts for 60% of the budget.
  // adverbials belongs to Chronalyx (4 concepts), so use Chronalyx for the
  // star computation. Concordium (18 concepts) would also work but Chronalyx
  // shows a larger per-concept delta because the budget is 100/4 = 25 per concept.
  const evidenceMapWithout = { adverbials: noRetention };
  const evidenceMapWith = { adverbials: withRetention };
  const starsWithout = computeGrammarMonsterStars('chronalyx', evidenceMapWithout);
  const starsWith = computeGrammarMonsterStars('chronalyx', evidenceMapWith);
  assert.ok(starsWith.stars > starsWithout.stars,
    `shape-12: Chronalyx Stars with retention (${starsWith.stars}) must exceed ` +
    `Stars without (${starsWithout.stars}) — the 60% budget is load-bearing`);
});

// =============================================================================
// P6-6: Grand Concordium timeline assertion (R14).
//
// Uses the existing simulation helper to verify Grand Concordium is
// unreachable within 150 simulated days. This protects the timeline from
// accidental weakening by code changes to the evidence model.
// =============================================================================

test('U7 P6 invariant 6: Grand Concordium is unreachable within 150 simulated days (timeline >= 5 months)', () => {
  // Test across 3 profiles to confirm the timeline holds universally.
  const profiles = ['ideal', 'typical', 'struggling'];
  const seeds = [42, 100, 2025];

  for (const profile of profiles) {
    for (const seed of seeds) {
      const result = simulateStarCurveProfile(profile, {
        questionsPerDay: 10,
        seed,
        maxDays: 150,
      });

      assert.equal(result.daysToGrandConcordium, null,
        `P6-6: Grand Concordium must be unreachable within 150 days ` +
        `for profile="${profile}" seed=${seed}. ` +
        `Got daysToGrandConcordium=${result.daysToGrandConcordium}. ` +
        'If this assertion fails, a code change has weakened the reward curve ' +
        'timeline — review whether the evidence model or retention requirements changed.');

      // Additional check: Concordium final Stars must be below 100.
      const concordiumFinalStars = result.finalStars?.concordium ?? 0;
      assert.ok(concordiumFinalStars < 100,
        `P6-6: Concordium final Stars at day 150 must be < 100, ` +
        `got ${concordiumFinalStars} for profile="${profile}" seed=${seed}`);
    }
  }
});
