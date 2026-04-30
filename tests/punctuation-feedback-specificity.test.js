import test from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer, evaluateSpeechRubric } from '../shared/punctuation/marking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSpeechItem(overrides = {}) {
  return {
    id: 'sp_test_speech',
    mode: 'transfer',
    stem: 'Mia asked can we start now',
    model: 'Mia asked, "Can we start now?"',
    accepted: ['Mia asked, "Can we start now?"'],
    preserveTokens: ['mia', 'asked', 'can', 'we', 'start', 'now'],
    rubric: { type: 'speech', reportingPosition: 'before', reportingClause: 'Mia asked' },
    validator: {
      type: 'speechWithWords',
      words: 'can we start now',
      requiredTerminal: '?',
      reportingClause: 'Mia asked',
    },
    ...overrides,
  };
}

function makeInsertItem(overrides = {}) {
  return {
    id: 'fa_test_insert',
    mode: 'insert',
    stem: 'After the storm the garden looked beautiful',
    model: 'After the storm, the garden looked beautiful.',
    accepted: ['After the storm, the garden looked beautiful.'],
    preserveTokens: ['after', 'the', 'storm', 'the', 'garden', 'looked', 'beautiful'],
    validator: {
      type: 'startsWithPhraseComma',
      phrase: 'After the storm',
    },
    ...overrides,
  };
}

function makeTransferTokenItem(overrides = {}) {
  return {
    id: 'ac_test_transfer',
    mode: 'transfer',
    stem: '',
    model: "We can't leave yet because we're still tidying up.",
    accepted: ["We can't leave yet because we're still tidying up."],
    validator: {
      type: 'requiresTokens',
      tokens: ["can't", "we're"],
      minMeaningfulWords: 5,
    },
    ...overrides,
  };
}

// ─── U8-1: Preservation failure gives specific feedback ───────────────────────

test('closed item with extra words gives preservation-specific feedback', () => {
  const item = makeInsertItem();
  const result = markPunctuationAnswer({
    item,
    answer: { typed: 'After the storm, the garden looked beautiful and the sky was clear.' },
  });

  assert.equal(result.correct, false);
  assert.equal(result.note, 'You changed the sentence — only add or fix the punctuation.');
  const preservationFacet = result.facets.find((f) => f.id === 'content_preservation');
  assert.ok(preservationFacet, 'content_preservation facet must exist');
  assert.equal(preservationFacet.ok, false);
});

test('combine item with extra words gives preservation-specific feedback', () => {
  const item = {
    id: 'lc_test_combine',
    mode: 'combine',
    stem: 'eggs flour butter',
    model: 'We needed eggs, flour and butter.',
    accepted: ['We needed eggs, flour and butter.'],
    preserveTokens: ['we', 'needed', 'eggs', 'flour', 'and', 'butter'],
    validator: {
      type: 'combineListSentence',
      opening: 'We needed',
      items: ['eggs', 'flour', 'butter'],
    },
  };
  const result = markPunctuationAnswer({
    item,
    answer: { typed: 'We needed eggs, flour, butter and also sugar and spice and everything nice.' },
  });

  assert.equal(result.correct, false);
  assert.equal(result.note, 'You changed the sentence — only add or fix the punctuation.');
});

// ─── U8-2: Speech item reporting-clause failure gives specific feedback ───────

test('speech item with changed reporting clause gives reporting-clause feedback', () => {
  const item = makeSpeechItem();
  // Change "Mia asked" to "Tom shouted"
  const result = markPunctuationAnswer({
    item,
    answer: { typed: 'Tom shouted, "Can we start now?"' },
  });

  assert.equal(result.correct, false);
  assert.equal(result.note, 'Keep the reporting clause from the question.');
});

test('speech item with missing reporting clause gives reporting-clause feedback', () => {
  const item = makeSpeechItem();
  // No reporting clause at all — just speech
  const result = markPunctuationAnswer({
    item,
    answer: { typed: '"Can we start now?"' },
  });

  assert.equal(result.correct, false);
  assert.equal(result.note, 'Keep the reporting clause from the question.');
});

// ─── U8-3: Transfer fragment gives sentence-completeness feedback ─────────────

test('transfer fragment gives sentence-completeness feedback', () => {
  const item = makeTransferTokenItem();
  // Only the tokens, not a full sentence
  const result = markPunctuationAnswer({
    item,
    answer: { typed: "Can't we're." },
  });

  assert.equal(result.correct, false);
  assert.equal(result.note, 'Include your punctuated forms in a complete sentence.');
  const completenessFacet = result.facets.find((f) => f.id === 'sentence_completeness');
  assert.ok(completenessFacet, 'sentence_completeness facet must exist');
  assert.equal(completenessFacet.ok, false);
});

// ─── U8-4: No feedback contains raw validator names or dotted internal IDs ────

test('no feedback note contains raw validator names or dotted IDs', () => {
  const scenarios = [
    // Preservation failure
    { item: makeInsertItem(), answer: 'After the storm the garden looked beautiful and also really wonderful and nice.' },
    // Speech failure
    { item: makeSpeechItem(), answer: 'Tom shouted, "Can we start now?"' },
    // Fragment failure
    { item: makeTransferTokenItem(), answer: "Can't we're." },
    // Generic wrong answer
    { item: makeInsertItem(), answer: 'Completely different sentence here.' },
  ];

  const internalPatterns = [
    /validator\./i,
    /evaluateMeaningfulness/i,
    /evaluatePreservation/i,
    /content_preservation/i,
    /reporting_clause_words/i,
    /sentence_completeness/i,
    /\bfacet\b/i,
  ];

  for (const { item, answer } of scenarios) {
    const result = markPunctuationAnswer({ item, answer: { typed: answer } });
    for (const pattern of internalPatterns) {
      assert.doesNotMatch(
        result.note,
        pattern,
        `note "${result.note}" should not contain internal ID matching ${pattern}`,
      );
    }
  }
});

// ─── U8-5: Correct answers get positive feedback ─────────────────────────────

test('correct speech answer gets positive feedback', () => {
  const item = makeSpeechItem();
  const result = markPunctuationAnswer({
    item,
    answer: { typed: 'Mia asked, "Can we start now?"' },
  });

  assert.equal(result.correct, true);
  assert.ok(result.note.length > 0, 'positive feedback should not be empty');
  assert.doesNotMatch(result.note, /wrong|incorrect|fail/i);
});

test('correct transfer answer gets positive feedback', () => {
  const item = makeTransferTokenItem();
  const result = markPunctuationAnswer({
    item,
    answer: { typed: "We can't leave yet because we're still tidying up." },
  });

  assert.equal(result.correct, true);
  assert.ok(result.note.length > 0, 'positive feedback should not be empty');
});

test('correct insert answer gets positive feedback', () => {
  const item = makeInsertItem();
  const result = markPunctuationAnswer({
    item,
    answer: { typed: 'After the storm, the garden looked beautiful.' },
  });

  assert.equal(result.correct, true);
  assert.ok(result.note.length > 0, 'positive feedback should not be empty');
});
