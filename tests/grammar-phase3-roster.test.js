// Phase 3 U10 — roster absence + positive registry invariants.
//
// This test file complements `tests/grammar-monster-roster.test.js` (U0) by
// sweeping the rendered HTML of every child phase for any mention of the
// three retired monsters (Glossbloom / Loomrill / Mirrane). Absence alone
// would not catch an accidental registry flip — so we also pin the positive
// invariants (retired entries still exist in MONSTERS, route list is four,
// reserved list is three).
//
// SSR blind spots:
//   * Pointer-capture, focus, scroll-into-view, IME, animation frames,
//     requestIdleCallback, MutationObserver, and timer drift are not
//     observable via the SSR harness. This file asserts text absence only;
//     browser-visual roster leaks (e.g., an <img alt="Glossbloom">
//     reintroduced via CSS background) remain manual-QA gates.
//   * React onChange events do not fire in SSR; transitions are modelled
//     through store dispatches.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderGrammarChildPhaseFixture,
  GRAMMAR_PHASE3_CHILD_PHASES,
} from './helpers/grammar-phase3-renders.js';
import {
  MONSTERS,
  MONSTERS_BY_SUBJECT,
} from '../src/platform/game/monsters.js';
import {
  GRAMMAR_MONSTER_IDS,
  GRAMMAR_RESERVED_MONSTER_IDS,
} from '../src/platform/game/mastery/shared.js';
import { GRAMMAR_MONSTER_ROUTES } from '../src/subjects/grammar/metadata.js';

const RESERVED_GRAMMAR_MONSTER_IDS = Object.freeze(['glossbloom', 'loomrill', 'mirrane']);
const RESERVED_GRAMMAR_MONSTER_NAMES = Object.freeze(['Glossbloom', 'Loomrill', 'Mirrane']);

// -----------------------------------------------------------------------------
// Positive registry invariants — the reserved entries must still exist so
// asset tooling can iterate them even though the learner UI never surfaces
// them.
// -----------------------------------------------------------------------------

test('U10 positive: MONSTERS retains every retired Grammar monster for asset tooling', () => {
  for (const id of RESERVED_GRAMMAR_MONSTER_IDS) {
    assert.ok(MONSTERS[id], `MONSTERS.${id} must remain for asset tooling`);
  }
});

test('U10 positive: GRAMMAR_MONSTER_ROUTES has exactly four entries', () => {
  assert.equal(GRAMMAR_MONSTER_ROUTES.length, 4,
    'Grammar routes must list the four active monsters only');
  const routeIds = GRAMMAR_MONSTER_ROUTES.map((route) => route.id);
  assert.deepEqual(routeIds, ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
});

test('U10 positive: MONSTERS_BY_SUBJECT.grammarReserve lists exactly the three retired ids', () => {
  assert.ok(Array.isArray(MONSTERS_BY_SUBJECT.grammarReserve));
  assert.equal(MONSTERS_BY_SUBJECT.grammarReserve.length, 3);
  assert.deepEqual(
    [...MONSTERS_BY_SUBJECT.grammarReserve].sort(),
    [...RESERVED_GRAMMAR_MONSTER_IDS].sort(),
  );
});

test('U10 positive: MONSTERS_BY_SUBJECT.grammar lists exactly the four active ids', () => {
  assert.deepEqual(
    [...MONSTERS_BY_SUBJECT.grammar],
    ['bracehart', 'chronalyx', 'couronnail', 'concordium'],
  );
});

test('U10 positive: GRAMMAR_MONSTER_IDS and GRAMMAR_RESERVED_MONSTER_IDS stay in lockstep', () => {
  assert.deepEqual([...GRAMMAR_MONSTER_IDS], ['bracehart', 'chronalyx', 'couronnail', 'concordium']);
  assert.deepEqual([...GRAMMAR_RESERVED_MONSTER_IDS], [...RESERVED_GRAMMAR_MONSTER_IDS]);
});

// -----------------------------------------------------------------------------
// Absence sweep — every child phase × every reserved monster name.
// -----------------------------------------------------------------------------

for (const phase of GRAMMAR_PHASE3_CHILD_PHASES) {
  test(`U10 absence: ${phase} HTML omits every reserved Grammar monster name`, () => {
    const { html } = renderGrammarChildPhaseFixture(phase);
    for (const name of RESERVED_GRAMMAR_MONSTER_NAMES) {
      assert.doesNotMatch(
        html,
        new RegExp(`\\b${name}\\b`, 'i'),
        `${phase} leaked reserved monster name: ${name}`,
      );
    }
  });
}
