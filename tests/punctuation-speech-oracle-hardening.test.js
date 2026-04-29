/**
 * Speech oracle hardening tests — direction-aware reporting comma enforcement.
 *
 * Validates that reportingPosition: 'any' correctly detects the answer shape
 * and enforces the comma rule only when the reporting clause is before the quote.
 *
 * Bug: previously, reportingPosition 'any' unconditionally returned true for
 * reportingCommaOk, meaning "Mia asked "Can we start now?"" was incorrectly accepted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer, evaluateSpeechRubric } from '../shared/punctuation/marking.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
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

// ─── Core bug fix: missing comma with reportingPosition 'any' ────────────────

test('missing reporting comma is rejected even with reportingPosition any (double quotes)', () => {
  const result = mark(makeItem(), 'Mia asked "Can we start now?"');
  assert.equal(result.correct, false);
});

test('missing reporting comma produces speech.reporting_comma_missing tag', () => {
  const result = mark(makeItem(), 'Mia asked "Can we start now?"');
  assert.ok(result.misconceptionTags.includes('speech.reporting_comma_missing'));
});

test('reporting comma present is accepted (double quotes)', () => {
  const result = mark(makeItem(), 'Mia asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('reporting-after form is accepted (double quotes)', () => {
  const result = mark(makeItem(), '"Can we start now?" asked Mia.');
  assert.equal(result.correct, true);
});

// ─── Curly quote variants ────────────────────────────────────────────────────

test('missing reporting comma is rejected with curly quotes', () => {
  const result = mark(makeItem(), '“Mia asked “Can we start now?”');
  // This has double opening curly — pair detection may vary; test with proper form:
  const result2 = evaluateSpeechRubric('Mia asked “Can we start now?”', makeItem().rubric);
  assert.equal(result2.correct, false);
});

test('reporting comma present is accepted with curly quotes', () => {
  const result = evaluateSpeechRubric('Mia asked, “Can we start now?”', makeItem().rubric);
  assert.equal(result.correct, true);
});

test('reporting-after form is accepted with curly quotes', () => {
  const result = evaluateSpeechRubric('“Can we start now?” asked Mia.', makeItem().rubric);
  assert.equal(result.correct, true);
});

// ─── Single quote variants ───────────────────────────────────────────────────

test('missing reporting comma is rejected with single quotes', () => {
  const result = evaluateSpeechRubric("Mia asked 'Can we start now?'", makeItem().rubric);
  assert.equal(result.correct, false);
});

test('reporting comma present is accepted with single quotes', () => {
  const result = evaluateSpeechRubric("Mia asked, 'Can we start now?'", makeItem().rubric);
  assert.equal(result.correct, true);
});

test('reporting-after form is accepted with single quotes', () => {
  const result = evaluateSpeechRubric("'Can we start now?' asked Mia.", makeItem().rubric);
  assert.equal(result.correct, true);
});

// ─── Position constraint enforcement ─────────────────────────────────────────

test('reportingPosition before rejects reporting-after shape', () => {
  const item = makeItem({
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
  });
  const result = mark(item, '"Can we start now?" asked Mia.');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.wrong_reporting_position'));
});

test('reportingPosition before accepts reporting-before shape', () => {
  const item = makeItem({
    rubric: {
      type: 'speech',
      reportingPosition: 'before',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
  });
  const result = mark(item, 'Mia asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('reportingPosition after rejects reporting-before shape', () => {
  const item = makeItem({
    rubric: {
      type: 'speech',
      reportingPosition: 'after',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
  });
  const result = mark(item, 'Mia asked, "Can we start now?"');
  assert.equal(result.correct, false);
  assert.ok(result.misconceptionTags.includes('speech.wrong_reporting_position'));
});

test('reportingPosition after accepts reporting-after shape', () => {
  const item = makeItem({
    rubric: {
      type: 'speech',
      reportingPosition: 'after',
      spokenWords: 'can we start now',
      requiredTerminal: '?',
    },
  });
  const result = mark(item, '"Can we start now?" asked Mia.');
  assert.equal(result.correct, true);
});

// ─── Real item shape: sp_transfer_question ───────────────────────────────────

test('real sp_transfer_question item: missing comma rejected', () => {
  const result = mark(makeItem(), 'She asked "Can we start now?"');
  assert.equal(result.correct, false);
});

test('real sp_transfer_question item: with comma accepted', () => {
  const result = mark(makeItem(), 'She asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('real sp_transfer_question item: reporting-after accepted', () => {
  const result = mark(makeItem(), '"Can we start now?" she asked.');
  assert.equal(result.correct, true);
});

// ─── evaluateSpeechRubric directly: shape detection ──────────────────────────

test('evaluateSpeechRubric returns reporting_clause facet false for missing comma', () => {
  const rubric = { type: 'speech', reportingPosition: 'any', spokenWords: 'can we start now', requiredTerminal: '?' };
  const result = evaluateSpeechRubric('Mia asked "Can we start now?"', rubric);
  const reportingFacet = result.facets.find((f) => f.id === 'reporting_clause');
  assert.equal(reportingFacet.ok, false);
});

test('evaluateSpeechRubric returns reporting_position facet true for any position', () => {
  const rubric = { type: 'speech', reportingPosition: 'any', spokenWords: 'can we start now', requiredTerminal: '?' };
  const result = evaluateSpeechRubric('"Can we start now?" asked Mia.', rubric);
  const positionFacet = result.facets.find((f) => f.id === 'reporting_position');
  assert.equal(positionFacet.ok, true);
});

test('evaluateSpeechRubric returns reporting_position facet false for wrong position', () => {
  const rubric = { type: 'speech', reportingPosition: 'before', spokenWords: 'can we start now', requiredTerminal: '?' };
  const result = evaluateSpeechRubric('"Can we start now?" asked Mia.', rubric);
  const positionFacet = result.facets.find((f) => f.id === 'reporting_position');
  assert.equal(positionFacet.ok, false);
});
