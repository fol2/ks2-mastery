/**
 * P8-U3 Meaningful transfer-sentence gate tests.
 *
 * Validates that requiresTokens transfer items reject token-only fragments
 * while accepting complete sentences with contextual words.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer, evaluateMeaningfulness } from '../shared/punctuation/marking.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    mode: 'transfer',
    model: '',
    misconceptionTags: [],
    ...overrides,
  };
}

function facet(result, id) {
  return (result.facets || []).find((f) => f.id === id);
}

// ─── evaluateMeaningfulness unit tests ──────────────────────────────────────

describe('evaluateMeaningfulness()', () => {
  test('returns meaningful for full sentence with non-required words', () => {
    const result = evaluateMeaningfulness(
      "We can't go because we're too tired.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, true);
    assert.equal(result.allWordsRequired, false);
    assert.equal(result.wordCount >= 5, true);
  });

  test('returns not meaningful for token-only fragment', () => {
    const result = evaluateMeaningfulness(
      "Can't we're.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, false);
    assert.equal(result.allWordsRequired, true);
  });

  test('returns not meaningful when word count below threshold', () => {
    const result = evaluateMeaningfulness(
      "We can't go.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, false);
    assert.equal(result.wordCount, 3);
  });

  test('always meaningful for paragraph mode', () => {
    const result = evaluateMeaningfulness(
      "Can't we're.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'paragraph' },
    );
    assert.equal(result.meaningful, true);
  });

  test('always meaningful when minMeaningfulWords is 0 (opt-out)', () => {
    const result = evaluateMeaningfulness(
      "Can't we're.",
      { type: 'requiresTokens', tokens: ["can't", "we're"], minMeaningfulWords: 0 },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, true);
  });

  test('exactly 5 words with context beyond tokens passes', () => {
    const result = evaluateMeaningfulness(
      "We can't believe we're here.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, true);
    assert.equal(result.wordCount, 5);
    assert.equal(result.allWordsRequired, false);
    assert.equal(result.hasVerbFrame, true);
  });

  test('rejects nonsense with no verb outside required tokens', () => {
    const result = evaluateMeaningfulness(
      "Blue can't red we're purple.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, false);
    assert.equal(result.hasVerbFrame, false);
  });

  test('passes sentence with verb outside required tokens', () => {
    const result = evaluateMeaningfulness(
      "We can't go because we're too tired.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'transfer' },
    );
    assert.equal(result.meaningful, true);
    assert.equal(result.hasVerbFrame, true);
  });
});

// ─── markPunctuationAnswer integration ──────────────────────────────────────

describe('meaningful transfer gate — ac_transfer_contractions shape', () => {
  const baseItem = makeItem({
    id: 'ac_transfer_contractions',
    mode: 'transfer',
    prompt: "Write one sentence that includes both can't and we're.",
    model: "We can't leave yet because we're still tidying up.",
    validator: { type: 'requiresTokens', tokens: ["can't", "we're"] },
    misconceptionTags: ['apostrophe.contraction_missing'],
  });

  test('full sentence passes', () => {
    const result = markPunctuationAnswer({
      item: baseItem,
      answer: { typed: "We can't go because we're too tired." },
    });
    assert.equal(result.correct, true);
  });

  test('token-only fragment is rejected', () => {
    const result = markPunctuationAnswer({
      item: baseItem,
      answer: { typed: "Can't we're." },
    });
    assert.equal(result.correct, false);
    assert.equal(result.misconceptionTags.includes('transfer.sentence_fragment'), true);
    assert.equal(facet(result, 'sentence_completeness')?.ok, false);
    assert.equal(result.note, 'Include your punctuated forms in a complete sentence.');
  });

  test('token-only answer with full stop fails', () => {
    const result = markPunctuationAnswer({
      item: baseItem,
      answer: { typed: "Can't we're here." },
    });
    // 3 words — below threshold
    assert.equal(result.correct, false);
  });
});

describe('meaningful transfer gate — ap_transfer_possession shape', () => {
  const baseItem = makeItem({
    id: 'ap_transfer_possession',
    mode: 'transfer',
    prompt: "Write one sentence that includes both children's and teachers'.",
    model: "The children's coats hung on the teachers' hooks.",
    validator: { type: 'requiresTokens', tokens: ["children's", "teachers'"] },
    misconceptionTags: ['apostrophe.possession_missing', 'apostrophe.possession_number'],
  });

  test('full sentence passes', () => {
    const result = markPunctuationAnswer({
      item: baseItem,
      answer: { typed: "The children's coats hung on the teachers' hooks." },
    });
    assert.equal(result.correct, true);
  });

  test('only required tokens plus possessive article fails', () => {
    const result = markPunctuationAnswer({
      item: baseItem,
      answer: { typed: "The children's teachers'." },
    });
    assert.equal(result.correct, false);
    assert.equal(result.misconceptionTags.includes('transfer.sentence_fragment'), true);
    assert.equal(facet(result, 'sentence_completeness')?.ok, false);
  });
});

describe('meaningful transfer gate — exclusions', () => {
  test('paragraph mode items are unaffected', () => {
    const item = makeItem({
      mode: 'paragraph',
      model: "Can't we're.",
      validator: { type: 'paragraphRepair', checks: [] },
    });
    // Paragraph items go through markParagraph, not markTransfer
    // But if they somehow reach the requiresTokens path via paragraph checks,
    // the evaluateMeaningfulness function bails out for paragraph mode
    const result = evaluateMeaningfulness(
      "Can't we're.",
      { type: 'requiresTokens', tokens: ["can't", "we're"] },
      { mode: 'paragraph' },
    );
    assert.equal(result.meaningful, true);
  });

  test('items without requiresTokens validator are unaffected', () => {
    const item = makeItem({
      mode: 'transfer',
      model: 'Before long, the train arrived.',
      validator: { type: 'startsWithPhraseComma', phrase: 'Before long' },
      misconceptionTags: ['comma.fronted_adverbial_missing'],
    });
    // This item uses startsWithPhraseComma, not requiresTokens
    const result = markPunctuationAnswer({
      item,
      answer: { typed: 'Before long, the train arrived.' },
    });
    assert.equal(result.correct, true);
    // No sentence_completeness facet from meaningfulness gate
    const completeness = facet(result, 'sentence_completeness');
    assert.equal(completeness, undefined);
  });

  test('minMeaningfulWords: 0 opt-out bypasses the gate', () => {
    const item = makeItem({
      mode: 'transfer',
      model: "Can't we're.",
      validator: { type: 'requiresTokens', tokens: ["can't", "we're"], minMeaningfulWords: 0 },
      misconceptionTags: ['apostrophe.contraction_missing'],
    });
    const result = markPunctuationAnswer({
      item,
      answer: { typed: "Can't we're." },
    });
    // Passes meaningfulness (opt-out) but may fail on other checks (word count too low)
    // The key assertion is that sentence_completeness is NOT false from meaningfulness
    const completeness = facet(result, 'sentence_completeness');
    // With opt-out, meaningfulness never fires false
    if (completeness) {
      // If facet shown (due to minimumWordCount), it should reflect completeOk only
      // Since no minimumWordCount is set, completeOk is true
      assert.equal(completeness.ok, true);
    }
  });

  test('exactly 5 words with context beyond tokens passes marking', () => {
    const item = makeItem({
      mode: 'transfer',
      model: "We can't believe we're here.",
      validator: { type: 'requiresTokens', tokens: ["can't", "we're"] },
      misconceptionTags: ['apostrophe.contraction_missing'],
    });
    const result = markPunctuationAnswer({
      item,
      answer: { typed: "We can't believe we're here." },
    });
    assert.equal(result.correct, true);
  });
});
