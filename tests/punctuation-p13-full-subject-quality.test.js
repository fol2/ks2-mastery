import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationRuntimeManifest } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const runtime = createPunctuationRuntimeManifest({
  manifest: PUNCTUATION_CONTENT_MANIFEST,
  generatedPerFamily: PRODUCTION_DEPTH,
});

function answerForItem(item) {
  if (item.mode === 'choose' || item.inputKind === 'choice') return { choiceIndex: item.correctIndex };
  return { typed: item.model };
}

function removeSentenceBoundary(text) {
  return String(text || '').replace(/\.\s+(?=[A-Z"'“‘])/u, ' ');
}

// Sentinel for ungrammatical "<contracted-aux> + ready to + verb" — built
// from the full pronoun list rather than a hand-typed alternation so the
// test stops being vacuous if a future bank entry uses a previously
// untested pronoun. Excludes `'s` because `is + ready to + verb` IS
// grammatical (e.g. `"She's ready to move"`).
const HAVE_OR_WILL_PRONOUNS = ['I', 'you', 'we', 'they', 'he', 'she', 'it', 'that', 'there'];
const HAVE_PRONOUN_GROUP = HAVE_OR_WILL_PRONOUNS.flatMap((p) => [`${p}'ve`, `${p.toLowerCase()}ve`, `${p}'ll`, `${p.toLowerCase()}ll`]).join('|');
const BAD_APOSTROPHE_GRAMMAR = new RegExp(`\\b(?:${HAVE_PRONOUN_GROUP})\\s+ready\\s+to\\b|\\b(?:it\\s+isn't|it\\s+isnt|we\\s+aren't|we\\s+arent)\\s+(?:move|forget)\\b`, 'i');

test('P14 runtime serves the post-expansion production pool and model answers self-mark', () => {
  // P13 baseline was 3,312 (512 fixed + 2,800 generated). P14 transfer
  // expansion adds 14 transfer-mode generator families × 18 templates each =
  // 252 transfer items, lifting the generated count to 3,052 and total to
  // 3,564.
  assert.equal(runtime.items.length, 3564);
  assert.equal(runtime.items.filter((item) => item.source !== 'generated').length, 512);
  assert.equal(runtime.items.filter((item) => item.source === 'generated').length, 3052);
  for (const item of runtime.items) {
    const result = markPunctuationAnswer({ item, answer: answerForItem(item) });
    assert.equal(result.correct, true, `${item.id} model/correct answer should mark correct: ${result.note || ''}`);
  }
});

test('P13 generated apostrophe items do not surface ungrammatical contraction stems/models', () => {
  const offenders = runtime.items
    .filter((item) => item.source === 'generated')
    .filter((item) => /^gen_apostrophe_(?:contractions_fix|mix_paragraph)/.test(item.generatorFamilyId || ''))
    .filter((item) => BAD_APOSTROPHE_GRAMMAR.test(`${item.stem}\n${item.model}`));
  assert.deepEqual(offenders.map((item) => ({ id: item.id, stem: item.stem, model: item.model })), []);
});

test('P13 generated apostrophe typed-answer models start as complete sentences', () => {
  const offenders = runtime.items
    .filter((item) => item.source === 'generated')
    .filter((item) => /^gen_apostrophe_(?:contractions_fix|mix_paragraph)/.test(item.generatorFamilyId || ''))
    .filter((item) => item.mode !== 'choose')
    .filter((item) => !/^[A-Z"'“‘]/.test(String(item.model || '').trim()));
  assert.deepEqual(offenders.map((item) => ({ id: item.id, model: item.model })), []);
});

test('P13 paragraph repair rejects missing sentence boundary punctuation', () => {
  const paragraphItems = runtime.items.filter((item) => item.mode === 'paragraph' && item.model && /\.\s+[A-Z"'“‘]/.test(item.model));
  assert.ok(paragraphItems.length >= 100, 'expected paragraph items with multiple sentences');
  const falseAccepts = [];
  for (const item of paragraphItems) {
    const attack = removeSentenceBoundary(item.model);
    if (attack === item.model) continue;
    const result = markPunctuationAnswer({ item, answer: { typed: attack } });
    if (result.correct) falseAccepts.push({ id: item.id, model: item.model, attack });
  }
  assert.deepEqual(falseAccepts.slice(0, 20), []);
});
