import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { markPunctuationAnswer, evaluatePreservation } from '../shared/punctuation/marking.js';
import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

function facetById(result, id) {
  return result.facets.find((entry) => entry.id === id);
}

// ─── Contract probes: closed items with extra tails must reject ──────────────

test('lc_insert_supplies + "today" → reject', () => {
  const testItem = item('lc_insert_supplies');
  assert.ok(testItem, 'item lc_insert_supplies must exist');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'We needed pencils, rulers and glue today.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
  assert.ok(
    result.misconceptionTags.includes('content.words_added_or_changed'),
    `Expected content.words_added_or_changed, got: ${result.misconceptionTags}`,
  );
});

test('lc_insert_supplies + "in class" → reject', () => {
  const testItem = item('lc_insert_supplies');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'We needed pencils, rulers and glue in class.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
  assert.ok(
    result.misconceptionTags.includes('content.words_added_or_changed'),
    `Expected content.words_added_or_changed, got: ${result.misconceptionTags}`,
  );
});

test('pa_insert_museum + "today" → reject', () => {
  const testItem = item('pa_insert_museum');
  assert.ok(testItem, 'item pa_insert_museum must exist');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'The museum, a former station, was busy today.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
  assert.ok(
    result.misconceptionTags.includes('content.words_added_or_changed'),
    `Expected content.words_added_or_changed, got: ${result.misconceptionTags}`,
  );
});

test('pa_fix_author + "in class" → reject', () => {
  const testItem = item('pa_fix_author');
  assert.ok(testItem, 'item pa_fix_author must exist');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'The author, who won the prize, smiled in class.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
  assert.ok(
    result.misconceptionTags.includes('content.words_added_or_changed'),
    `Expected content.words_added_or_changed, got: ${result.misconceptionTags}`,
  );
});

test('sp_insert_question + "today" → reject (speech misconception)', () => {
  const testItem = item('sp_insert_question');
  assert.ok(testItem, 'item sp_insert_question must exist');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'Ella asked, "Can we start now today?"' },
  });
  assert.equal(result.correct, false);
  assert.ok(
    result.misconceptionTags.includes('speech.extra_words_outside_reporting_clause'),
    `Expected speech.extra_words_outside_reporting_clause, got: ${result.misconceptionTags}`,
  );
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

test('sp_insert_question + "in the cupboard" → reject (speech misconception)', () => {
  const testItem = item('sp_insert_question');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'Ella asked, "Can we start now in the cupboard?"' },
  });
  assert.equal(result.correct, false);
  assert.ok(
    result.misconceptionTags.includes('speech.extra_words_outside_reporting_clause'),
    `Expected speech.extra_words_outside_reporting_clause, got: ${result.misconceptionTags}`,
  );
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

test('sp_fix_question + "in class" → reject (speech misconception)', () => {
  const testItem = item('sp_fix_question');
  assert.ok(testItem, 'item sp_fix_question must exist');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: '"Where are we meeting in class?" asked Zara.' },
  });
  assert.equal(result.correct, false);
  assert.ok(
    result.misconceptionTags.includes('speech.extra_words_outside_reporting_clause'),
    `Expected speech.extra_words_outside_reporting_clause, got: ${result.misconceptionTags}`,
  );
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

// ─── Word-removal: truncated answers must reject ───────────────────────────────

test('lc_insert_supplies with "glue" removed → reject', () => {
  const testItem = item('lc_insert_supplies');
  assert.ok(testItem, 'item lc_insert_supplies must exist');
  // Submit answer with one content word ("glue") removed from the stem
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'We needed pencils, rulers and.' },
  });
  assert.equal(result.correct, false, 'Removing a content word must reject');
});

// ─── Regression: model answers still mark correct ────────────────────────────

test('lc_insert_supplies model answer marks correct', () => {
  const testItem = item('lc_insert_supplies');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: testItem.model },
  });
  assert.equal(result.correct, true);
});

test('pa_insert_museum model answer marks correct', () => {
  const testItem = item('pa_insert_museum');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: testItem.model },
  });
  assert.equal(result.correct, true);
});

test('pa_fix_author model answer marks correct', () => {
  const testItem = item('pa_fix_author');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: testItem.model },
  });
  assert.equal(result.correct, true);
});

test('sp_insert_question model answer marks correct', () => {
  const testItem = item('sp_insert_question');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: testItem.model },
  });
  assert.equal(result.correct, true);
});

test('sp_fix_question model answer marks correct', () => {
  const testItem = item('sp_fix_question');
  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: testItem.model },
  });
  assert.equal(result.correct, true);
});

// ─── Generated closed items with short tail must reject ──────────────────────

test('generated list-comma insert item + "today" rejects', () => {
  const items = createPunctuationGeneratedItems({ depth: 1 });
  const genItem = items.find((i) => i.generatorFamilyId === 'gen_list_commas_insert');
  assert.ok(genItem, 'Expected at least one gen_list_commas_insert item');

  // Model answer passes
  const correct = markPunctuationAnswer({ item: genItem, answer: { typed: genItem.model } });
  assert.equal(correct.correct, true, `Model answer should pass: ${genItem.model}`);

  // With "today" appended (short tail) should reject
  const withTail = markPunctuationAnswer({
    item: genItem,
    answer: { typed: genItem.model.replace(/\.$/, ' today.') },
  });
  assert.equal(withTail.correct, false, 'Extra "today" should reject for gen list-comma insert');
  assert.equal(facetById(withTail, 'content_preservation')?.ok, false);
});

test('generated fronted-adverbial fix item + "today" rejects', () => {
  const items = createPunctuationGeneratedItems({ depth: 1 });
  const genItem = items.find((i) => i.generatorFamilyId === 'gen_fronted_adverbial_fix');
  assert.ok(genItem, 'Expected at least one gen_fronted_adverbial_fix item');

  // Model answer passes
  const correct = markPunctuationAnswer({ item: genItem, answer: { typed: genItem.model } });
  assert.equal(correct.correct, true, `Model answer should pass: ${genItem.model}`);

  // With "today" appended (short tail) should reject
  const withTail = markPunctuationAnswer({
    item: genItem,
    answer: { typed: genItem.model.replace(/\.$/, ' today.') },
  });
  assert.equal(withTail.correct, false, 'Extra "today" should reject for gen fronted-adverbial fix');
  assert.equal(facetById(withTail, 'content_preservation')?.ok, false);
});

test('generated speech-insert item + "today" rejects', () => {
  const items = createPunctuationGeneratedItems({ depth: 1 });
  const genItem = items.find((i) => i.generatorFamilyId === 'gen_speech_insert');
  assert.ok(genItem, 'Expected at least one gen_speech_insert item');

  // Model answer passes
  const correct = markPunctuationAnswer({ item: genItem, answer: { typed: genItem.model } });
  assert.equal(correct.correct, true, `Model answer should pass: ${genItem.model}`);

  // With "today" appended AFTER the closing quote (short tail) should reject
  // e.g. 'Maya asked, "Can we start now?"' → 'Maya asked, "Can we start now?" today.'
  const badAnswer = genItem.model.replace(/\.?$/, '') + ' today.';
  const withTail = markPunctuationAnswer({
    item: genItem,
    answer: { typed: badAnswer },
  });
  assert.equal(withTail.correct, false, `Extra "today" should reject for gen speech-insert: ${badAnswer}`);
  assert.equal(facetById(withTail, 'content_preservation')?.ok, false,
    'content_preservation facet must be present and false');
});

// ─── Guard: at least one generated case inspected ────────────────────────────

test('generated items pool is not empty', () => {
  const items = createPunctuationGeneratedItems({ depth: 1 });
  assert.ok(items.length > 0, 'Generator must produce at least one item');
  const closedItems = items.filter(
    (i) => ['insert', 'fix', 'combine'].includes(i.mode)
      && typeof i.stem === 'string' && i.stem.trim(),
  );
  assert.ok(closedItems.length > 0, 'Generator must produce at least one closed item with a stem');
});
