/**
 * Speech reporting-clause word enforcement tests (P8 U2).
 *
 * Validates that when rubric.reportingClause is supplied, the marking engine
 * rejects answers that change or omit the required reporting clause words.
 *
 * Covers:
 * - sp_insert_question: reporting-before shape, clause words enforced
 * - sp_fix_question: reporting-after shape, clause words enforced
 * - Transfer items (no reportingClause in rubric): child-created clauses accepted
 * - P7 comma/direction tests remain untouched (reporting_clause facet preserved)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer, evaluateSpeechRubric } from '../shared/punctuation/marking.js';

// ─── Item factories ─────────────────────────────────────────────────────────

function makeInsertItem(overrides = {}) {
  return {
    id: 'sp_insert_question',
    mode: 'insert',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Punctuate the direct speech accurately.',
    stem: 'Ella asked can we start now',
    accepted: ['Ella asked, "Can we start now?"', "Ella asked, 'Can we start now?'"],
    explanation: 'This is a spoken question, so the question mark belongs inside the inverted commas.',
    model: 'Ella asked, "Can we start now?"',
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      reportingClause: 'Ella asked',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_outside_quote', 'speech.reporting_comma_missing', 'speech.capitalisation_missing'],
    ...overrides,
  };
}

function makeFixItem(overrides = {}) {
  return {
    id: 'sp_fix_question',
    mode: 'fix',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Correct the punctuation in this sentence.',
    stem: '"Where are we meeting"? asked Zara.',
    accepted: ['"Where are we meeting?" asked Zara.', "'Where are we meeting?' asked Zara."],
    explanation: 'The question mark belongs inside the closing inverted comma because it is part of the spoken words.',
    model: '"Where are we meeting?" asked Zara.',
    rubric: {
      type: 'speech',
      reportingPosition: 'after',
      reportingClause: 'asked Zara',
      spokenWords: 'where are we meeting',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.punctuation_outside_quote', 'speech.quote_unmatched', 'speech.words_changed'],
    ...overrides,
  };
}

function makeTransferItem(overrides = {}) {
  return {
    id: 'sp_transfer_question',
    mode: 'transfer',
    skillIds: ['speech'],
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    prompt: 'Write one sentence of direct speech using these exact spoken words: Can we start now?',
    stem: '',
    accepted: ['Mia asked, "Can we start now?"', '"Can we start now?" asked Mia.'],
    explanation: 'Direct speech needs inverted commas, a capital letter, and a question mark inside the closing inverted comma.',
    model: 'Mia asked, "Can we start now?"',
    validator: { type: 'speechWithWords', words: 'can we start now', requiredTerminal: '?' },
    rubric: {
      type: 'speech',
      reportingPosition: 'any',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
    misconceptionTags: ['speech.quote_missing', 'speech.punctuation_outside_quote', 'speech.reporting_comma_missing', 'speech.capitalisation_missing', 'speech.words_changed'],
    ...overrides,
  };
}

function mark(item, answer) {
  return markPunctuationAnswer({ item, answer: { typed: answer } });
}

// ─── sp_insert_question: correct answer passes ─────────────────────────────

test('sp_insert_question with correct clause "Ella asked" passes', () => {
  const result = mark(makeInsertItem(), 'Ella asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('sp_insert_question with correct clause (single quotes) passes', () => {
  const result = mark(makeInsertItem(), "Ella asked, 'Can we start now?'");
  assert.equal(result.correct, true);
});

// ─── sp_insert_question: changed clause fails ──────────────────────────────

test('sp_insert_question with changed name "Tom shouted" fails', () => {
  const result = mark(makeInsertItem(), 'Tom shouted, "Can we start now?"');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

test('sp_insert_question: reporting_clause_words facet is false when clause changed', () => {
  const result = mark(makeInsertItem(), 'Tom shouted, "Can we start now?"');
  const clauseFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.ok(clauseFacet, 'reporting_clause_words facet should be present');
  assert.equal(clauseFacet.ok, false);
});

// ─── sp_fix_question: correct answer passes ────────────────────────────────

test('sp_fix_question with correct clause "asked Zara" passes', () => {
  const result = mark(makeFixItem(), '"Where are we meeting?" asked Zara.');
  assert.equal(result.correct, true);
});

test('sp_fix_question with correct clause (single quotes) passes', () => {
  const result = mark(makeFixItem(), "'Where are we meeting?' asked Zara.");
  assert.equal(result.correct, true);
});

// ─── sp_fix_question: omitted clause fails ─────────────────────────────────

test('sp_fix_question with omitted clause (speech-only) fails', () => {
  const result = mark(makeFixItem(), '"Where are we meeting?"');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

test('sp_fix_question: reporting_clause_words facet is false when clause omitted', () => {
  const result = mark(makeFixItem(), '"Where are we meeting?"');
  const clauseFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.ok(clauseFacet, 'reporting_clause_words facet should be present');
  assert.equal(clauseFacet.ok, false);
});

// ─── sp_fix_question: wrong name fails ─────────────────────────────────────

test('sp_fix_question with wrong name "asked Mia" fails', () => {
  const result = mark(makeFixItem(), '"Where are we meeting?" asked Mia.');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

// ─── sp_fix_question: wrong verb + name fails ──────────────────────────────

test('sp_fix_question with wrong verb + name "yelled Tom" fails', () => {
  const result = mark(makeFixItem(), '"Where are we meeting?" yelled Tom.');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

// ─── Transfer item: no reportingClause in rubric, child-created accepted ───

test('transfer item without reportingClause in rubric accepts child-created clause', () => {
  const result = mark(makeTransferItem(), 'She asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('transfer item without reportingClause accepts reporting-after', () => {
  const result = mark(makeTransferItem(), '"Can we start now?" he asked.');
  assert.equal(result.correct, true);
});

test('transfer item: no reporting_clause_words facet emitted when rubric lacks reportingClause', () => {
  const result = mark(makeTransferItem(), 'She asked, "Can we start now?"');
  const clauseFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.equal(clauseFacet, undefined, 'reporting_clause_words facet should not be present');
});

// ─── P7 comma direction: reporting_clause facet (comma) untouched ──────────

test('P7 comma facet: reporting-before missing comma still detected', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'before',
    reportingClause: 'Ella asked',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('Ella asked "Can we start now?"', rubric);
  const commaFacet = result.facets.find((f) => f.id === 'reporting_clause');
  assert.equal(commaFacet.ok, false, 'reporting_clause (comma) facet should fail');
  // But reporting_clause_words should pass since clause words are correct
  const wordsFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.equal(wordsFacet.ok, true, 'reporting_clause_words facet should pass');
});

test('P7 comma facet: reporting-after shape does not require comma', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'after',
    reportingClause: 'asked Zara',
    spokenWords: 'where are we meeting',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('"Where are we meeting?" asked Zara.', rubric);
  const commaFacet = result.facets.find((f) => f.id === 'reporting_clause');
  assert.equal(commaFacet.ok, true, 'reporting_clause (comma) facet should pass for after shape');
});

// ─── evaluateSpeechRubric directly: facet and tag checks ───────────────────

test('evaluateSpeechRubric: correct clause words produce ok facet', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'before',
    reportingClause: 'Ella asked',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('Ella asked, "Can we start now?"', rubric);
  const wordsFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.ok(wordsFacet, 'facet should be present');
  assert.equal(wordsFacet.ok, true);
  assert.equal(result.correct, true);
});

test('evaluateSpeechRubric: changed clause produces speech.reporting_clause_changed tag', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'before',
    reportingClause: 'Ella asked',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('Tom shouted, "Can we start now?"', rubric);
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

test('evaluateSpeechRubric: case-insensitive clause matching', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'before',
    reportingClause: 'Ella asked',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  // "ella asked" in lowercase should still match "Ella asked"
  const result = evaluateSpeechRubric('ella asked, "Can we start now?"', rubric);
  const wordsFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.equal(wordsFacet.ok, true, 'clause words match should be case-insensitive');
});

// ─── Edge: speech-only shape when rubric expects a clause ──────────────────

test('evaluateSpeechRubric: speech-only shape fails when reportingClause expected', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'any',
    reportingClause: 'Ella asked',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('"Can we start now?"', rubric);
  assert.equal(result.correct, false);
  const wordsFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.ok(wordsFacet, 'facet should be present');
  assert.equal(wordsFacet.ok, false);
  assert.ok(result.misconceptionTags.includes('speech.reporting_clause_changed'));
});

// ─── Edge: rubric without reportingClause does not add facet ───────────────

test('evaluateSpeechRubric: no reportingClause in rubric means no clause_words facet', () => {
  const rubric = {
    type: 'speech',
    reportingPosition: 'any',
    spokenWords: 'can we start now',
    requiredTerminal: '?',
  };
  const result = evaluateSpeechRubric('She asked, "Can we start now?"', rubric);
  const wordsFacet = result.facets.find((f) => f.id === 'reporting_clause_words');
  assert.equal(wordsFacet, undefined);
});
