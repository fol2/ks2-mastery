import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { canonicalPunctuationText, markPunctuationAnswer } from '../shared/punctuation/marking.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

// ---------------------------------------------------------------------------
// ap_transfer_possession: model answer marks correct
// ---------------------------------------------------------------------------

test('ap_transfer_possession model answer is marked correct', () => {
  const entry = item('ap_transfer_possession');
  assert.ok(entry, 'ap_transfer_possession item exists in content');
  const result = markPunctuationAnswer({ item: entry, answer: entry.model });
  assert.strictEqual(result.correct, true, `model answer should be correct: ${entry.model}`);
});

// ---------------------------------------------------------------------------
// Plural possessives: whitespace after terminal apostrophe is preserved
// ---------------------------------------------------------------------------

test('canonicalPunctuationText preserves space after terminal possessive apostrophe', () => {
  const cases = [
    { input: "teachers' notices", expected: "teachers' notices" },
    { input: "boys' jackets", expected: "boys' jackets" },
    { input: "girls' bags", expected: "girls' bags" },
    { input: "doctors' notes", expected: "doctors' notes" },
    { input: "the players' kits were muddy", expected: "the players' kits were muddy" },
    { input: "her parents' house", expected: "her parents' house" },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `possessive: "${input}" should preserve trailing space`,
    );
  }
});

// ---------------------------------------------------------------------------
// Curly apostrophe equivalents: U+2019 treated identically to ASCII '
// ---------------------------------------------------------------------------

test('curly apostrophe possessives normalise without collapsing space', () => {
  const curly = '’'; // RIGHT SINGLE QUOTATION MARK
  const cases = [
    { input: `teachers${curly} notices`, expected: "teachers' notices" },
    { input: `boys${curly} jackets`, expected: "boys' jackets" },
    { input: `girls${curly} bags`, expected: "girls' bags" },
    { input: `doctors${curly} notes`, expected: "doctors' notes" },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `curly possessive: "${input}" should normalise to ASCII without collapsing space`,
    );
  }
});

// ---------------------------------------------------------------------------
// Contractions unaffected: apostrophe mid-word never triggers space collapse
// ---------------------------------------------------------------------------

test('contractions are unaffected by the normalisation fix', () => {
  const cases = [
    { input: "don't stop", expected: "don't stop" },
    { input: "it's fine", expected: "it's fine" },
    { input: "they're here", expected: "they're here" },
    { input: "we've arrived", expected: "we've arrived" },
    { input: "she'll come", expected: "she'll come" },
    { input: "wouldn't dare", expected: "wouldn't dare" },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `contraction: "${input}" must remain unchanged`,
    );
  }
});

test('curly contractions normalise to ASCII without disturbing word spacing', () => {
  const curly = '’';
  const cases = [
    { input: `don${curly}t stop`, expected: "don't stop" },
    { input: `it${curly}s fine`, expected: "it's fine" },
    { input: `they${curly}re here`, expected: "they're here" },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `curly contraction: "${input}" should normalise cleanly`,
    );
  }
});

// ---------------------------------------------------------------------------
// Speech quotes still normalise correctly (space after closing quote collapses)
// ---------------------------------------------------------------------------

test('speech quotes still collapse space after closing double quote', () => {
  // After normalisation, space after a closing " is collapsed
  // (both answer and token go through the same normaliser, so matching works)
  const cases = [
    {
      input: '"Hello," said Mia.',
      expected: '"Hello,"said Mia.',
    },
    {
      input: 'She said, "Hello."',
      expected: 'She said,"Hello."',
    },
    {
      input: '"Wait!" called Tom.',
      expected: '"Wait!"called Tom.',
    },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `speech: "${input}" should collapse space after closing quote`,
    );
  }
});

test('space before opening speech quote still collapses', () => {
  const cases = [
    {
      input: 'She said, "Hello."',
      expected: 'She said,"Hello."',
    },
    {
      input: "He whispered, 'Run!'",
      expected: "He whispered,'Run!'",
    },
  ];
  for (const { input, expected } of cases) {
    assert.strictEqual(
      canonicalPunctuationText(input),
      expected,
      `speech opening: "${input}" should collapse space before opening quote`,
    );
  }
});
