import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PUNCTUATION_ITEMS, PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/punctuation-negative-vectors.json'), 'utf8'));

const nonChoiceItems = PUNCTUATION_ITEMS.filter((i) => i.mode !== 'choose');
const chooseItems = PUNCTUATION_ITEMS.filter((i) => i.mode === 'choose');

// ---- Structural assertions ----

test('fixture has correct schema version and metadata', () => {
  assert.equal(fixture._meta.schema_version, 1);
  assert.ok(fixture._meta.description.includes('Negative vectors'));
  assert.ok(Array.isArray(fixture.vectors));
  assert.ok(Array.isArray(fixture.choiceValidation));
});

test('fixture covers all 72 non-choice items with at least 2 vectors each', () => {
  const coverage = new Map();
  for (const v of fixture.vectors) {
    coverage.set(v.itemId, (coverage.get(v.itemId) || 0) + 1);
  }
  assert.equal(coverage.size, 72, `Expected 72 covered items, got ${coverage.size}`);
  for (const item of nonChoiceItems) {
    const count = coverage.get(item.id) || 0;
    assert.ok(count >= 2, `Item ${item.id} has only ${count} vectors (need >= 2)`);
  }
});

test('fixture has exactly 20 choice validation entries', () => {
  assert.equal(fixture.choiceValidation.length, 20);
});

test('total negative vectors >= 189', () => {
  assert.ok(fixture.vectors.length >= 189, `Expected >= 189 vectors, got ${fixture.vectors.length}`);
});

// ---- Negative vector verification ----

test('every negative vector marks INCORRECT through markPunctuationAnswer()', () => {
  for (const vector of fixture.vectors) {
    const item = PUNCTUATION_CONTENT_INDEXES.itemById.get(vector.itemId);
    assert.ok(item, `Item ${vector.itemId} not found in content`);
    const result = markPunctuationAnswer({ item, answer: { typed: vector.answer } });
    assert.equal(
      result.correct,
      false,
      `Vector for ${vector.itemId} (${vector.failureType}) should be incorrect but was correct. Answer: "${vector.answer}"`,
    );
  }
});

// ---- Model answer regression check ----

test('model answers for all 72 non-choice items still mark CORRECT', () => {
  for (const item of nonChoiceItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(
      result.correct,
      true,
      `Model answer for ${item.id} should be correct but was incorrect. Model: "${item.model}"`,
    );
  }
});

// ---- Choice item validation ----

test('each choice item has exactly one correct option at the specified index', () => {
  for (const entry of fixture.choiceValidation) {
    const item = PUNCTUATION_CONTENT_INDEXES.itemById.get(entry.itemId);
    assert.ok(item, `Choice item ${entry.itemId} not found`);
    assert.equal(item.mode, 'choose');
    assert.equal(item.options.length, entry.totalOptions);

    // Correct index marks correct
    const correctResult = markPunctuationAnswer({
      item,
      answer: { choiceIndex: entry.correctIndex },
    });
    assert.equal(
      correctResult.correct,
      true,
      `Choice ${entry.itemId} correct index ${entry.correctIndex} should mark correct`,
    );

    // All other indices mark incorrect
    for (let i = 0; i < entry.totalOptions; i++) {
      if (i === entry.correctIndex) continue;
      const wrongResult = markPunctuationAnswer({
        item,
        answer: { choiceIndex: i },
      });
      assert.equal(
        wrongResult.correct,
        false,
        `Choice ${entry.itemId} index ${i} should mark incorrect`,
      );
    }
  }
});

// ---- Failure type coverage ----

test('vectors cover multiple failure types', () => {
  const types = new Set(fixture.vectors.map((v) => v.failureType));
  // Must have at least 4 distinct failure types
  assert.ok(types.size >= 4, `Expected >= 4 failure types, got ${types.size}: ${[...types].join(', ')}`);
});

// ---- Per-type coverage: changed_required_words ----

test('every closed item (insert/fix/combine) has at least one changed_required_words vector', () => {
  const closedModes = ['insert', 'fix', 'combine'];
  const closedItems = PUNCTUATION_ITEMS.filter((i) => closedModes.includes(i.mode));
  const changedWordVectors = fixture.vectors.filter((v) => v.failureType === 'changed_required_words');
  const coveredIds = new Set(changedWordVectors.map((v) => v.itemId));

  for (const item of closedItems) {
    assert.ok(
      coveredIds.has(item.id),
      `Closed item ${item.id} (mode=${item.mode}) missing changed_required_words vector`,
    );
  }
});

// ---- Per-type coverage: wrong_reporting_clause ----

test('every speech item with reportingClause has at least one wrong_reporting_clause vector', () => {
  const speechItemsWithClause = PUNCTUATION_ITEMS.filter(
    (i) => i.rubric && i.rubric.reportingClause,
  );
  const wrongClauseVectors = fixture.vectors.filter((v) => v.failureType === 'wrong_reporting_clause');
  const coveredIds = new Set(wrongClauseVectors.map((v) => v.itemId));

  for (const item of speechItemsWithClause) {
    assert.ok(
      coveredIds.has(item.id),
      `Speech item ${item.id} (reportingClause="${item.rubric.reportingClause}") missing wrong_reporting_clause vector`,
    );
  }
});
