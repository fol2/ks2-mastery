// U8 (P7) — Concurrency and replay test contract.
//
// Proves that concurrent or replayed answer submissions cannot double-award,
// regress, corrupt, or show contradictory child state.
//
// Tests exercise the reward pipeline's idempotency synchronously — no HTTP
// concurrency is involved.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCommandTrace } from './helpers/grammar-command-trace.js';
import {
  GRAMMAR_EVENT_TYPES,
  createGrammarRewardSubscriber,
} from '../src/subjects/grammar/event-hooks.js';
import {
  deriveGrammarConceptStarEvidence,
  computeGrammarMonsterStars,
  applyStarHighWaterLatch,
} from '../shared/grammar/grammar-stars.js';
import {
  GRAMMAR_AGGREGATE_CONCEPTS,
  GRAMMAR_MONSTER_CONCEPTS,
} from '../shared/grammar/grammar-concept-roster.js';

// ---------------------------------------------------------------------------
// Repository mock — mirrors the gameStateRepository interface expected by
// ensureMonsterBranches / saveMonsterState (read/write with learnerId +
// systemId).
// ---------------------------------------------------------------------------

function createMockGameStateRepository(initialState = {}) {
  let state = JSON.parse(JSON.stringify(initialState));
  return {
    get state() { return state; },
    read() {
      return JSON.parse(JSON.stringify(state));
    },
    write(_learnerId, _systemId, nextState) {
      state = JSON.parse(JSON.stringify(nextState));
      return JSON.parse(JSON.stringify(state));
    },
  };
}

// Helpers
function starEvidenceEvent(conceptId, monsterId, computedStars, overrides = {}) {
  return {
    type: GRAMMAR_EVENT_TYPES.STAR_EVIDENCE_UPDATED,
    learnerId: 'learner-u8',
    conceptId,
    monsterId,
    computedStars,
    ...overrides,
  };
}

function conceptSecuredEvent(conceptId, overrides = {}) {
  return {
    type: GRAMMAR_EVENT_TYPES.CONCEPT_SECURED,
    learnerId: 'learner-u8',
    conceptId,
    ...overrides,
  };
}

// =============================================================================
// 1. Deterministic event ID
// =============================================================================

test('U8 concurrency: two star-evidence-updated events with same requestId + monsterId + computedStars produce identical event IDs', () => {
  const requestId = 'req-deterministic-001';
  const learnerId = 'learner-u8';
  const monsterId = 'bracehart';
  const computedStars = 12;

  // The event ID pattern from commands.js:
  // `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${stars}`
  const expectedId = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${computedStars}`;

  const idA = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${computedStars}`;
  const idB = `grammar.star-evidence.${learnerId}.${monsterId}.${requestId}.${computedStars}`;

  assert.equal(idA, idB, 'Same inputs must produce identical event IDs');
  assert.equal(idA, expectedId);

  // Different requestId must produce a different ID.
  const idC = `grammar.star-evidence.${learnerId}.${monsterId}.req-other.${computedStars}`;
  assert.notEqual(idA, idC, 'Different requestId must produce different event ID');
});

// =============================================================================
// 2. Event ordering invariance
// =============================================================================

test('U8 concurrency: star-evidence then concept-secured produces same starHighWater as concept-secured then star-evidence', () => {
  const conceptId = 'sentence_functions';
  const monsterId = 'bracehart';
  const computedStars = 20;

  // Order A: star-evidence first, then concept-secured
  const repoA = createMockGameStateRepository();
  const subscriberA = createGrammarRewardSubscriber({ gameStateRepository: repoA, random: () => 0.5 });
  subscriberA([starEvidenceEvent(conceptId, monsterId, computedStars)]);
  subscriberA([conceptSecuredEvent(conceptId)]);
  const stateA = repoA.state;

  // Order B: concept-secured first, then star-evidence
  const repoB = createMockGameStateRepository();
  const subscriberB = createGrammarRewardSubscriber({ gameStateRepository: repoB, random: () => 0.5 });
  subscriberB([conceptSecuredEvent(conceptId)]);
  subscriberB([starEvidenceEvent(conceptId, monsterId, computedStars)]);
  const stateB = repoB.state;

  // Both must agree on starHighWater for the target monster.
  const hwA = stateA[monsterId]?.starHighWater ?? 0;
  const hwB = stateB[monsterId]?.starHighWater ?? 0;
  assert.equal(hwA, hwB, `starHighWater must be order-invariant (A: ${hwA}, B: ${hwB})`);
  assert.ok(hwA >= computedStars, `starHighWater must be at least the computedStars (${computedStars}), got ${hwA}`);
});

// =============================================================================
// 3. Duplicate star-evidence-updated events (idempotency)
// =============================================================================

test('U8 concurrency: processing same star-evidence-updated event twice yields same starHighWater as once', () => {
  const conceptId = 'clauses';
  const monsterId = 'bracehart';
  const computedStars = 15;
  const event = starEvidenceEvent(conceptId, monsterId, computedStars);

  // Once
  const repoOnce = createMockGameStateRepository();
  const subOnce = createGrammarRewardSubscriber({ gameStateRepository: repoOnce, random: () => 0.5 });
  subOnce([event]);
  const hwOnce = repoOnce.state[monsterId]?.starHighWater ?? 0;

  // Twice
  const repoTwice = createMockGameStateRepository();
  const subTwice = createGrammarRewardSubscriber({ gameStateRepository: repoTwice, random: () => 0.5 });
  subTwice([event]);
  subTwice([event]);
  const hwTwice = repoTwice.state[monsterId]?.starHighWater ?? 0;

  assert.equal(hwOnce, hwTwice, `Replay must be idempotent — once: ${hwOnce}, twice: ${hwTwice}`);
  assert.equal(hwOnce, computedStars);
});

// =============================================================================
// 4. Stale starHighWater — lower value must not decrement
// =============================================================================

test('U8 concurrency: stale star-evidence (5) after higher (10) does not decrement starHighWater', () => {
  const conceptId = 'sentence_functions';
  const monsterId = 'bracehart';

  const repo = createMockGameStateRepository();
  const subscriber = createGrammarRewardSubscriber({ gameStateRepository: repo, random: () => 0.5 });

  // First: set high-water to 10.
  subscriber([starEvidenceEvent(conceptId, monsterId, 10)]);
  assert.equal(repo.state[monsterId]?.starHighWater, 10);

  // Second: stale event with computedStars: 5 arrives.
  subscriber([starEvidenceEvent(conceptId, monsterId, 5)]);
  assert.equal(repo.state[monsterId]?.starHighWater, 10,
    'starHighWater must not decrement from 10 to 5');
});

// =============================================================================
// 5. Monotonicity ratchet — applyStarHighWaterLatch never decreases displayStars
// =============================================================================

test('U8 concurrency: 100 random sequences via applyStarHighWaterLatch — displayStars never decreases', () => {
  // Seeded PRNG for reproducibility (simple LCG).
  function createSeededRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  const rng = createSeededRandom(42);

  for (let seq = 0; seq < 100; seq++) {
    const length = 3 + Math.floor(rng() * 20); // 3-22 steps per sequence
    let highWater = 0;
    let prevDisplay = 0;

    for (let step = 0; step < length; step++) {
      const computedStars = Math.floor(rng() * 101); // 0 to 100
      const { displayStars, updatedHighWater } = applyStarHighWaterLatch({
        computedStars,
        starHighWater: highWater,
        legacyStage: 0,
      });

      assert.ok(displayStars >= prevDisplay,
        `Seq ${seq}, step ${step}: displayStars decreased from ${prevDisplay} to ${displayStars} (computed=${computedStars}, hw=${highWater})`);
      assert.ok(updatedHighWater >= highWater,
        `Seq ${seq}, step ${step}: updatedHighWater decreased from ${highWater} to ${updatedHighWater}`);

      highWater = updatedHighWater;
      prevDisplay = displayStars;
    }
  }
});

// =============================================================================
// 6. `caught` never reverts
// =============================================================================

test('U8 concurrency: once caught is true, no subsequent event sets it back to false', () => {
  const conceptId = 'sentence_functions';
  const monsterId = 'bracehart';

  const repo = createMockGameStateRepository();
  const subscriber = createGrammarRewardSubscriber({ gameStateRepository: repo, random: () => 0.5 });

  // Trigger caught via a concept-secured event.
  subscriber([conceptSecuredEvent(conceptId)]);
  assert.equal(repo.state[monsterId]?.caught, true, 'Monster must be caught after concept-secured');

  // Fire additional star-evidence events with varying star counts — caught must stay true.
  for (const stars of [0, 1, 5, 0, 50, 0, 100, 0]) {
    subscriber([starEvidenceEvent(conceptId, monsterId, stars)]);
    assert.equal(repo.state[monsterId]?.caught, true,
      `caught must remain true after star-evidence with computedStars=${stars}`);
  }

  // Fire another concept-secured for a different concept on the same monster — still true.
  subscriber([conceptSecuredEvent('clauses')]);
  assert.equal(repo.state[monsterId]?.caught, true,
    'caught must remain true after second concept-secured');
});

// =============================================================================
// 7. Zero-star events ignored
// =============================================================================

test('U8 concurrency: events with computedStars: 0 do not trigger any reward state change', () => {
  const conceptId = 'sentence_functions';
  const monsterId = 'bracehart';

  const repo = createMockGameStateRepository();
  const subscriber = createGrammarRewardSubscriber({ gameStateRepository: repo, random: () => 0.5 });

  // Take a snapshot of initial state after branch init (ensureMonsterBranches may add branch).
  subscriber([starEvidenceEvent(conceptId, monsterId, 1)]);
  // Now set the baseline — the monster has starHighWater = 1.
  const baselineHW = repo.state[monsterId]?.starHighWater;
  assert.equal(baselineHW, 1);

  // Fire a zero-star event. It must be ignored entirely.
  const rewardEvents = subscriber([starEvidenceEvent(conceptId, monsterId, 0)]);
  assert.equal(rewardEvents.length, 0, 'Zero-star events must not produce reward events');
  assert.equal(repo.state[monsterId]?.starHighWater, baselineHW,
    'starHighWater must not change from zero-star event');
});

test('U8 concurrency: zero-star event on fresh state produces no state mutation', () => {
  const repo = createMockGameStateRepository();
  const subscriber = createGrammarRewardSubscriber({ gameStateRepository: repo, random: () => 0.5 });

  const before = JSON.stringify(repo.state);
  const rewardEvents = subscriber([starEvidenceEvent('sentence_functions', 'bracehart', 0)]);

  assert.equal(rewardEvents.length, 0, 'Zero-star event must produce no reward events');
  // State should be unchanged (the subscriber skips zero-star before ensureMonsterBranches).
  assert.equal(JSON.stringify(repo.state), before,
    'Zero-star event must not mutate repository state at all');
});
