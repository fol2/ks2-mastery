/**
 * Speech transfer fairness tests — reporting-before and reporting-after forms.
 *
 * Verifies that items with reportingPosition: 'any' accept both
 * reporting-before ("Mia asked, …") and reporting-after ("…" asked Mia.)
 * while items with an explicit position constraint still enforce it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

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

// ─── Reporting-before (canonical form) ────────────────────────────────────────

test('reporting-before with double quotes is correct', () => {
  const result = mark(makeItem(), 'Mia asked, "Can we start now?"');
  assert.equal(result.correct, true);
});

test('reporting-before with single quotes is correct', () => {
  const result = mark(makeItem(), "Mia asked, 'Can we start now?'");
  assert.equal(result.correct, true);
});

// ─── Reporting-after (newly accepted form) ────────────────────────────────────

test('reporting-after with double quotes is correct', () => {
  const result = mark(makeItem(), '"Can we start now?" asked Mia.');
  assert.equal(result.correct, true);
});

test('reporting-after with single quotes is correct', () => {
  const result = mark(makeItem(), "'Can we start now?' asked Mia.");
  assert.equal(result.correct, true);
});

test('reporting-after with curly quotes is correct', () => {
  const result = mark(makeItem(), '“Can we start now?” asked Mia.');
  assert.equal(result.correct, true);
});

// ─── Exclamation reporting-after ──────────────────────────────────────────────

test('exclamation reporting-after with double quotes is correct', () => {
  const item = makeItem({
    id: 'sp_transfer_excl',
    model: 'The teacher shouted, "Stop!"',
    accepted: ['The teacher shouted, "Stop!"', '"Stop!" shouted the teacher.'],
    validator: { type: 'speechWithWords', words: 'stop', requiredTerminal: '!' },
    rubric: {
      type: 'speech',
      reportingPosition: 'any',
      spokenWords: 'stop',
      requiredTerminal: '!',
    },
  });
  const result = mark(item, '"Stop!" shouted the teacher.');
  assert.equal(result.correct, true);
});

// ─── Rejections ───────────────────────────────────────────────────────────────

test('missing inverted commas is rejected', () => {
  const result = mark(makeItem(), 'Can we start now? asked Mia.');
  assert.equal(result.correct, false);
});

test('wrong terminal mark is rejected', () => {
  const result = mark(makeItem(), '"Can we start now." asked Mia.');
  assert.equal(result.correct, false);
});

test('spoken words not preserved is rejected', () => {
  const result = mark(makeItem(), '"Can we go now?" asked Mia.');
  assert.equal(result.correct, false);
});

test('question mark outside quote is rejected (reporting-before)', () => {
  const result = mark(makeItem(), 'Mia asked, "Can we start now"?');
  assert.equal(result.correct, false);
});

// ─── Explicit position constraint still enforced ──────────────────────────────

test('explicit reportingPosition before rejects reporting-after form', () => {
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
});

test('explicit reportingPosition before accepts reporting-before form', () => {
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
