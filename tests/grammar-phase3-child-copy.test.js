// Phase 3 U10 — fixture-driven forbidden-term sweep across every child phase.
//
// This is the Phase 3 completeness gate's copy invariant: every entry in
// `GRAMMAR_CHILD_FORBIDDEN_TERMS` must remain absent in every child-facing
// scene, plus a whole-word `/\bWorker\b/i` catch-all that captures the bare
// adult noun even when compound forms (`Worker-marked`, `Worker authority`)
// are already covered by the frozen fixture.
//
// The adult `analytics` phase is treated differently: it is the one place
// where the adult vocabulary (`Evidence snapshot`, `Stage 1`, `Bellstorm
// bridge`, `Reserved reward routes`) is legitimately required — these four
// phrases are **asserted PRESENT** here as the R7 copy preservation gate.
// A future refactor that strips the adult surface would fail this inverse
// matrix rather than silently erasing parent-facing evidence copy.
//
// SSR blind spots:
//   * Pointer-capture, true DOM focus, scroll-into-view, IME composition,
//     animation frames, requestIdleCallback, MutationObserver, and timer
//     drift are not observable via `renderToStaticMarkup`. They remain
//     manual-QA gates.
//   * React onChange events do not fire in SSR; every transition is driven
//     through store dispatches instead.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderGrammarChildPhaseFixture,
  GRAMMAR_PHASE3_CHILD_PHASES,
  GRAMMAR_PHASE3_ADULT_PHASES,
} from './helpers/grammar-phase3-renders.js';
import { GRAMMAR_CHILD_FORBIDDEN_TERMS } from '../src/subjects/grammar/components/grammar-view-model.js';

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// -----------------------------------------------------------------------------
// Forbidden-term sweep — nine child phases × every fixture entry
// -----------------------------------------------------------------------------

test('U10: forbidden-term fixture is non-empty + frozen (fixture integrity)', () => {
  // A mutated or cleared fixture would silently weaken every downstream
  // absence assertion. Pin both invariants before iterating.
  assert.ok(Array.isArray(GRAMMAR_CHILD_FORBIDDEN_TERMS));
  assert.ok(GRAMMAR_CHILD_FORBIDDEN_TERMS.length >= 10,
    `expected at least 10 forbidden terms, saw ${GRAMMAR_CHILD_FORBIDDEN_TERMS.length}`);
  assert.equal(Object.isFrozen(GRAMMAR_CHILD_FORBIDDEN_TERMS), true,
    'GRAMMAR_CHILD_FORBIDDEN_TERMS must stay frozen so mutations throw');
});

test('U10: the nine child-phase allowlist is frozen + complete', () => {
  assert.equal(Object.isFrozen(GRAMMAR_PHASE3_CHILD_PHASES), true);
  assert.deepEqual([...GRAMMAR_PHASE3_CHILD_PHASES], [
    'dashboard',
    'session-pre',
    'session-post-correct',
    'session-post-wrong',
    'mini-test-before',
    'mini-test-after',
    'summary',
    'bank',
    'transfer',
  ]);
});

for (const phase of GRAMMAR_PHASE3_CHILD_PHASES) {
  test(`U10: ${phase} HTML contains none of GRAMMAR_CHILD_FORBIDDEN_TERMS`, () => {
    const { html } = renderGrammarChildPhaseFixture(phase);
    for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
      assert.doesNotMatch(
        html,
        new RegExp(escapeRegExp(term), 'i'),
        `forbidden term leaked into ${phase} HTML: ${term}`,
      );
    }
  });

  test(`U10: ${phase} HTML contains no whole-word /\\bWorker\\b/i catch-all`, () => {
    const { html } = renderGrammarChildPhaseFixture(phase);
    // `\b` boundary keeps legitimate tokens like `workbook` or `homework`
    // from tripping the guard. The iterated fixture above covers every
    // compound form; this catch-all protects against the bare noun.
    assert.doesNotMatch(html, /\bWorker\b/i,
      `bare Worker noun leaked into ${phase} HTML`);
  });
}

// -----------------------------------------------------------------------------
// Adult-phase inverse matrix — R7 copy preservation
// -----------------------------------------------------------------------------

test('U10: analytics phase retains the adult-only Evidence vocabulary (R7 inverse-presence)', () => {
  // The analytics phase is the single adult-facing surface. A stripped-adult
  // refactor that erased Evidence snapshot / Stage 1 / Bellstorm bridge /
  // Reserved reward routes would silently remove parent-facing evidence
  // copy. This matrix fails such a regression.
  const { rawHtml } = renderGrammarChildPhaseFixture('analytics');
  const requiredAdultPhrases = [
    'Evidence snapshot',
    'Stage 1',
    'Bellstorm bridge',
    'Reserved reward routes',
  ];
  for (const phrase of requiredAdultPhrases) {
    assert.match(
      rawHtml,
      new RegExp(escapeRegExp(phrase)),
      `R7 adult copy missing from analytics HTML: ${phrase}`,
    );
  }
});

test('U10: adult-phase allowlist is frozen + contains analytics', () => {
  assert.equal(Object.isFrozen(GRAMMAR_PHASE3_ADULT_PHASES), true);
  assert.deepEqual([...GRAMMAR_PHASE3_ADULT_PHASES], ['analytics']);
});

// -----------------------------------------------------------------------------
// Helper safety — typo-driven silent-skip coverage guard
// -----------------------------------------------------------------------------

test('U10: renderGrammarChildPhaseFixture throws on an unknown phase name', () => {
  // Without this, a typo like `session-postcorrect` in a downstream test
  // would silently return an empty string and skip the coverage loop.
  assert.throws(
    () => renderGrammarChildPhaseFixture('session-postcorrect'),
    /unknown phase/,
  );
  assert.throws(
    () => renderGrammarChildPhaseFixture(''),
    /unknown phase/,
  );
  assert.throws(
    () => renderGrammarChildPhaseFixture('bogus'),
    /unknown phase/,
  );
});

// -----------------------------------------------------------------------------
// Phase 4 U4 follower — extend the 20-term sweep with adversarial render states
//
// The four render states below were added in `grammar-phase3-renders.js` so
// the U4 learning-flow matrix can seed them. They are additionally iterated
// here so the Phase 3 completeness gate's copy invariant protects these states
// too — a forbidden term leaking into a pending-command banner or a mode-flip
// scaffold would be caught by the same sweep that guards the nine base phases.
// -----------------------------------------------------------------------------

const GRAMMAR_PHASE4_U4_ADVERSARIAL_PHASES = Object.freeze([
  'session-pre-pending',
  'session-feedback-pending',
  'session-retry',
  'session-mode-flip-worked',
]);

for (const phase of GRAMMAR_PHASE4_U4_ADVERSARIAL_PHASES) {
  test(`U4 follower: ${phase} HTML contains none of GRAMMAR_CHILD_FORBIDDEN_TERMS`, () => {
    const { html } = renderGrammarChildPhaseFixture(phase);
    for (const term of GRAMMAR_CHILD_FORBIDDEN_TERMS) {
      assert.doesNotMatch(
        html,
        new RegExp(escapeRegExp(term), 'i'),
        `forbidden term leaked into ${phase} HTML: ${term}`,
      );
    }
  });

  test(`U4 follower: ${phase} HTML contains no whole-word /\\bWorker\\b/i catch-all`, () => {
    const { html } = renderGrammarChildPhaseFixture(phase);
    assert.doesNotMatch(html, /\bWorker\b/i,
      `bare Worker noun leaked into ${phase} HTML`);
  });
}
