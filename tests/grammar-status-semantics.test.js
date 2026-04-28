// P7-U9 — Grammar status/filter centralised semantics tests.
//
// Validates the single-source-of-truth contract in
// `shared/grammar/grammar-status.js`. Every internal label maps to exactly one
// child label, one CSS tone, and one bank filter id. Unknown/null inputs
// produce safe fallbacks.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAMMAR_STATUS_TAXONOMY,
  grammarStatusForLabel,
  grammarChildLabelForInternal,
  grammarChildToneForInternal,
} from '../shared/grammar/grammar-status.js';

// -----------------------------------------------------------------------------
// GRAMMAR_STATUS_TAXONOMY — shape + freeze contract
// -----------------------------------------------------------------------------

test('P7-U9: GRAMMAR_STATUS_TAXONOMY is frozen and has exactly 5 entries', () => {
  assert.equal(Object.isFrozen(GRAMMAR_STATUS_TAXONOMY), true);
  assert.equal(GRAMMAR_STATUS_TAXONOMY.length, 5);
  for (const entry of GRAMMAR_STATUS_TAXONOMY) {
    assert.equal(Object.isFrozen(entry), true, `entry ${entry.internalLabel} must be frozen`);
  }
});

test('P7-U9: every internal label maps to exactly one child label', () => {
  const labels = GRAMMAR_STATUS_TAXONOMY.map((e) => e.internalLabel);
  const unique = new Set(labels);
  assert.equal(unique.size, 5, 'all 5 internal labels must be unique');
  assert.equal(labels.length, unique.size);
});

// -----------------------------------------------------------------------------
// grammarChildLabelForInternal — happy path
// -----------------------------------------------------------------------------

test('P7-U9: grammarChildLabelForInternal("needs-repair") returns "Trouble spot"', () => {
  assert.equal(grammarChildLabelForInternal('needs-repair'), 'Trouble spot');
});

test('P7-U9: grammarChildLabelForInternal("building") returns "Learning"', () => {
  assert.equal(grammarChildLabelForInternal('building'), 'Learning');
});

test('P7-U9: grammarChildLabelForInternal("consolidating") returns "Nearly secure"', () => {
  assert.equal(grammarChildLabelForInternal('consolidating'), 'Nearly secure');
});

test('P7-U9: grammarChildLabelForInternal("secure") returns "Secure"', () => {
  assert.equal(grammarChildLabelForInternal('secure'), 'Secure');
});

test('P7-U9: grammarChildLabelForInternal("emerging") returns "New"', () => {
  assert.equal(grammarChildLabelForInternal('emerging'), 'New');
});

// -----------------------------------------------------------------------------
// grammarChildLabelForInternal — fallback
// -----------------------------------------------------------------------------

test('P7-U9: grammarChildLabelForInternal(null) returns "Check status"', () => {
  assert.equal(grammarChildLabelForInternal(null), 'Check status');
});

test('P7-U9: grammarChildLabelForInternal("unknown") returns "Check status"', () => {
  assert.equal(grammarChildLabelForInternal('unknown'), 'Check status');
});

// -----------------------------------------------------------------------------
// grammarChildToneForInternal — happy path + fallback
// -----------------------------------------------------------------------------

test('P7-U9: grammarChildToneForInternal("needs-repair") returns "trouble"', () => {
  assert.equal(grammarChildToneForInternal('needs-repair'), 'trouble');
});

test('P7-U9: grammarChildToneForInternal(null) returns "learning" (fallback)', () => {
  assert.equal(grammarChildToneForInternal(null), 'learning');
});

test('P7-U9: grammarChildToneForInternal covers all five labels', () => {
  assert.equal(grammarChildToneForInternal('emerging'), 'new');
  assert.equal(grammarChildToneForInternal('building'), 'learning');
  assert.equal(grammarChildToneForInternal('needs-repair'), 'trouble');
  assert.equal(grammarChildToneForInternal('consolidating'), 'nearly-secure');
  assert.equal(grammarChildToneForInternal('secure'), 'secure');
});

// -----------------------------------------------------------------------------
// isChildCopy flag
// -----------------------------------------------------------------------------

test('P7-U9: isChildCopy is false for "needs-repair"', () => {
  const entry = grammarStatusForLabel('needs-repair');
  assert.equal(entry.isChildCopy, false);
});

test('P7-U9: isChildCopy is true for all labels except "needs-repair"', () => {
  for (const entry of GRAMMAR_STATUS_TAXONOMY) {
    if (entry.internalLabel === 'needs-repair') continue;
    assert.equal(entry.isChildCopy, true, `${entry.internalLabel} should have isChildCopy: true`);
  }
});

// -----------------------------------------------------------------------------
// grammarStatusForLabel — edge cases
// -----------------------------------------------------------------------------

test('P7-U9: grammarStatusForLabel returns null for non-string input', () => {
  assert.equal(grammarStatusForLabel(null), null);
  assert.equal(grammarStatusForLabel(undefined), null);
  assert.equal(grammarStatusForLabel(123), null);
  assert.equal(grammarStatusForLabel({}), null);
});

test('P7-U9: grammarStatusForLabel returns null for unknown string', () => {
  assert.equal(grammarStatusForLabel('bogus'), null);
  assert.equal(grammarStatusForLabel(''), null);
});

test('P7-U9: grammarStatusForLabel returns the correct entry for each label', () => {
  for (const entry of GRAMMAR_STATUS_TAXONOMY) {
    const found = grammarStatusForLabel(entry.internalLabel);
    assert.equal(found, entry);
  }
});
