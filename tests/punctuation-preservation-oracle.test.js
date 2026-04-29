import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_INDEXES } from '../shared/punctuation/content.js';
import { markPunctuationAnswer, evaluatePreservation, derivePreserveTokens } from '../shared/punctuation/marking.js';
import { createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { derivePreserveTokens as dslDerivePreserveTokens } from '../shared/punctuation/template-dsl.js';

function item(id) {
  return PUNCTUATION_CONTENT_INDEXES.itemById.get(id);
}

function facetById(result, id) {
  return result.facets.find((entry) => entry.id === id);
}

// ─── derivePreserveTokens utility ─────────────────────────────────────────────

test('derivePreserveTokens strips punctuation and returns word array', () => {
  assert.deepEqual(
    derivePreserveTokens('We needed pencils rulers and glue.'),
    ['we', 'needed', 'pencils', 'rulers', 'and', 'glue'],
  );
  assert.deepEqual(
    derivePreserveTokens('The signal failed –and the team waited.'),
    ['the', 'signal', 'failed', 'and', 'the', 'team', 'waited'],
  );
  assert.deepEqual(derivePreserveTokens(''), []);
});

test('DSL derivePreserveTokens matches marking.js utility', () => {
  const stem = 'The shelf held paints brushes and paper.';
  assert.deepEqual(dslDerivePreserveTokens(stem), derivePreserveTokens(stem));
});

// ─── evaluatePreservation function ────────────────────────────────────────────

test('evaluatePreservation passes when only punctuation is added', () => {
  const testItem = item('lc_insert_supplies');
  const result = evaluatePreservation('We needed pencils, rulers and glue.', testItem);
  assert.equal(result.preserved, true);
  assert.deepEqual(result.extraWords, []);
  assert.deepEqual(result.missingWords, []);
});

test('evaluatePreservation fails when extra tail is appended', () => {
  const testItem = item('lc_insert_supplies');
  const result = evaluatePreservation(
    'We needed pencils, rulers and glue in the cupboard.',
    testItem,
  );
  assert.equal(result.preserved, false);
  assert.ok(result.extraWords.length > 0);
});

test('evaluatePreservation uses preserveTokens when provided', () => {
  const testItem = item('dc_fix_signal_team');
  // Model answer matches preserveTokens (no "and")
  const correct = evaluatePreservation('The signal failed – the team waited.', testItem);
  assert.equal(correct.preserved, true);
});

test('evaluatePreservation fails when words are missing from expected', () => {
  const testItem = item('lc_insert_supplies');
  // Replace "needed" with different word (word count same, but sequence broken)
  const result = evaluatePreservation('We bought pencils, rulers and glue.', testItem);
  assert.equal(result.preserved, false);
  assert.ok(result.missingWords.length > 0);
});

// ─── Marking pipeline integration: lc_insert_supplies ─────────────────────────

test('lc_insert_supplies with correct answer (only punctuation added) passes', () => {
  const result = markPunctuationAnswer({
    item: item('lc_insert_supplies'),
    answer: { typed: 'We needed pencils, rulers and glue.' },
  });
  assert.equal(result.correct, true);
  assert.deepEqual(result.misconceptionTags, []);
});

test('lc_insert_supplies with extra tail fails', () => {
  const result = markPunctuationAnswer({
    item: item('lc_insert_supplies'),
    answer: { typed: 'We needed pencils, rulers and glue in the cupboard.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
  assert.ok(result.misconceptionTags.includes('content.words_added_or_changed'));
});

// ─── Marking pipeline integration: lc_fix_display ─────────────────────────────

test('lc_fix_display with correct answer passes', () => {
  const result = markPunctuationAnswer({
    item: item('lc_fix_display'),
    answer: { typed: 'The display showed shells, pebbles and fossils.' },
  });
  assert.equal(result.correct, true);
});

test('lc_fix_display with extra words fails', () => {
  const result = markPunctuationAnswer({
    item: item('lc_fix_display'),
    answer: { typed: 'The display showed shells, pebbles and fossils in the gallery room.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

// ─── Marking pipeline integration: pa_insert_museum ───────────────────────────

test('pa_insert_museum with correct answer passes', () => {
  const result = markPunctuationAnswer({
    item: item('pa_insert_museum'),
    answer: { typed: 'The museum, a former station, was busy.' },
  });
  assert.equal(result.correct, true);
});

test('pa_insert_museum with arbitrary tail fails', () => {
  const result = markPunctuationAnswer({
    item: item('pa_insert_museum'),
    answer: { typed: 'The museum, a former station, was busy and full of visitors today.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

// ─── Marking pipeline integration: pa_fix_author ──────────────────────────────

test('pa_fix_author with correct answer passes', () => {
  const result = markPunctuationAnswer({
    item: item('pa_fix_author'),
    answer: { typed: 'The author, who won the prize, smiled.' },
  });
  assert.equal(result.correct, true);
});

test('pa_fix_author with extra words fails', () => {
  const result = markPunctuationAnswer({
    item: item('pa_fix_author'),
    answer: { typed: 'The author, who won the prize, smiled at the audience with delight.' },
  });
  assert.equal(result.correct, false);
  assert.equal(facetById(result, 'content_preservation')?.ok, false);
});

// ─── Generated list-comma item with extra sentence fails ──────────────────────

test('generated list-comma insert item with extra sentence fails', () => {
  const items = createPunctuationGeneratedItems({ depth: 1 });
  const genItem = items.find((i) => i.generatorFamilyId === 'gen_list_commas_insert');
  assert.ok(genItem, 'Expected at least one gen_list_commas_insert item');

  // Correct answer should pass
  const correct = markPunctuationAnswer({ item: genItem, answer: { typed: genItem.model } });
  assert.equal(correct.correct, true);

  // Answer with extra sentence appended should fail
  const withTail = markPunctuationAnswer({
    item: genItem,
    answer: { typed: `${genItem.model.replace(/\.$/, '')} and extra things from the shop nearby.` },
  });
  assert.equal(withTail.correct, false);
  assert.equal(facetById(withTail, 'content_preservation')?.ok, false);
});

// ─── Transfer items remain flexible (no preservation check applied) ───────────

test('transfer items are not subject to preservation gate', () => {
  const transferItem = item('lc_transfer_trip');
  assert.equal(transferItem.mode, 'transfer');

  // Transfer items accept any well-formed sentence with the right tokens
  const result = markPunctuationAnswer({
    item: transferItem,
    answer: { typed: 'For the trip, we packed torches, maps and water.' },
  });
  assert.equal(result.correct, true);

  // Even a long sentence passes if the validator is satisfied
  const longAnswer = markPunctuationAnswer({
    item: transferItem,
    answer: { typed: 'For the big trip to the coast, we packed torches, maps and water.' },
  });
  assert.equal(longAnswer.correct, true);
});

// ─── Items using markExact are unaffected ─────────────────────────────────────

test('exact-match item without validator still works correctly', () => {
  const exactItem = item('se_insert_question');
  assert.ok(exactItem);
  assert.equal(exactItem.validator, undefined);

  // Correct accepted answer passes
  const correct = markPunctuationAnswer({
    item: exactItem,
    answer: { typed: 'Why was the hall still locked?' },
  });
  assert.equal(correct.correct, true);

  // Wrong answer rejected via exact matching
  const wrong = markPunctuationAnswer({
    item: exactItem,
    answer: { typed: 'Why was the hall still locked.' },
  });
  assert.equal(wrong.correct, false);
});

// ─── Combine items preservation gate ──────────────────────────────────────────

test('combine item with extra tail fails preservation', () => {
  const combineItem = item('lc_combine_trip_list');
  assert.equal(combineItem.mode, 'combine');

  // Correct answer passes
  const correct = markPunctuationAnswer({
    item: combineItem,
    answer: { typed: 'We packed torches, maps and water.' },
  });
  assert.equal(correct.correct, true);

  // Answer with extra tail fails
  const withTail = markPunctuationAnswer({
    item: combineItem,
    answer: { typed: 'We packed torches, maps and water for the camping trip next week.' },
  });
  assert.equal(withTail.correct, false);
  assert.equal(facetById(withTail, 'content_preservation')?.ok, false);
});

// ─── dc_fix_signal_team uses preserveTokens correctly ─────────────────────────

test('dc_fix_signal_team with model answer passes (preserveTokens excludes "and")', () => {
  const testItem = item('dc_fix_signal_team');
  assert.ok(Array.isArray(testItem.preserveTokens));
  assert.ok(!testItem.preserveTokens.includes('and'));

  const result = markPunctuationAnswer({
    item: testItem,
    answer: { typed: 'The signal failed – the team waited.' },
  });
  assert.equal(result.correct, true);
});
