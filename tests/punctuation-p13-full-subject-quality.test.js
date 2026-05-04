import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationRuntimeManifest, repairApostropheContractionGrammar } from '../shared/punctuation/generators.js';
import { countProseSentenceBoundaries, markPunctuationAnswer } from '../shared/punctuation/marking.js';

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

test('P14 apostrophe repair leaves grammatical inputs unchanged (no false positives)', () => {
  // Adversarial review (adv-002) surfaced regex false positives:
  //   * adverb `well` mid-sentence
  //   * hyphenated compound `forget-me-not`
  //   * adjective `ill`, noun `hell`, noun `shell`
  // The repair must rewrite ONLY the contracted-aux + ready-to bigrams in
  // sentence-start position (capitalised) or with apostrophe present.
  const grammaticalInputs = [
    'It works well ready to move forwards.',
    'It isnt forget-me-not season yet.',
    'He works well in this job.',
    'She is ill ready to recover.',
    'The shell ready to use is large.',
    'Mr Smith said he was ready to go home.',
    'The bell rings at noon.',
    'Hell froze over before he agreed.', // unlikely but the noun is grammatical
  ];
  const offenders = grammaticalInputs.filter((input) => repairApostropheContractionGrammar(input) !== input);
  assert.deepEqual(offenders, [], 'repair must not rewrite grammatical inputs');
});

test('P14 apostrophe repair preserves stem (no apostrophe) vs model (apostrophe) contrast', () => {
  // The bank's "fix the apostrophe" exercise design pairs broken stems
  // with corrected models. The repair should only fix the GRAMMAR (ready-
  // to-verb → past-participle/infinitive), never silently add apostrophes
  // — adding apostrophes would collapse the exercise into a tautology.
  assert.equal(
    repairApostropheContractionGrammar('Ive ready to move the lantern.'),
    'Ive moved the lantern.',
    'stem form must keep the no-apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar("I've ready to move the lantern."),
    "I've moved the lantern.",
    'model form must keep the apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar('Ill ready to move the chair.'),
    'Ill move the chair.',
    'will-stem form must keep no-apostrophe form',
  );
  assert.equal(
    repairApostropheContractionGrammar("I'll ready to move the chair."),
    "I'll move the chair.",
    'will-model form must keep apostrophe form',
  );
});

test('P14 countProseSentenceBoundaries handles common abbreviations', () => {
  // adv-003 — title abbreviations (Mr/Mrs/Dr/Prof/St/etc) must NOT be
  // counted as sentence terminators when followed by a capitalised name.
  // Time markers (a.m./p.m.) and country codes (U.K./U.S.) DO count when
  // they sit at a real sentence boundary, because the period serves both
  // as abbreviation marker AND sentence terminator.
  const cases = [
    ['Mr. Smith arrived. Then he sat down.', 1, 'Mr. before name does not count; period after `arrived` does'],
    ['Mrs. Jones smiled. The class waved.', 1, 'Mrs.'],
    ['Dr. Patel arrived. The class clapped.', 1, 'Dr.'],
    ['Prof. Lee asked a question. The room fell silent.', 1, 'Prof.'],
    ['Mr. Smith greeted Dr. Patel. They shook hands.', 1, 'multiple titles in same sentence'],
    ['Mr. Smith said hello.', 0, 'Mr. with no following sentence — zero boundaries'],
    ['She paused. Then she ran.', 1, 'normal prose'],
    ['One. Two. Three.', 2, 'three-sentence chain'],
    ['It is 9 a.m. Time to go.', 1, 'a.m. before sentence start counts'],
    ['We live in the U.K. The end.', 1, 'U.K. before sentence start counts'],
  ];
  const failures = [];
  for (const [input, expected, note] of cases) {
    const got = countProseSentenceBoundaries(input);
    if (got !== expected) failures.push({ input, expected, got, note });
  }
  assert.deepEqual(failures, [], 'abbreviation handling regressed');
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
