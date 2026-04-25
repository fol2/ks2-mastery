import test from 'node:test';
import assert from 'node:assert/strict';

import {
  affectedGeneratorFamiliesForContextPack,
  normalisePunctuationContextPack,
} from '../shared/punctuation/context-packs.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { createPunctuationContentIndexes } from '../shared/punctuation/content.js';

const VALID_CONTEXT_PACK = Object.freeze({
  names: ['Maya', 'ravi'],
  places: ['harbour'],
  listNouns: ['ropes', 'maps', 'snacks'],
  frontedAdverbialPhrases: ['before sunrise'],
  speechCommands: ['bring the rope'],
  speechQuestions: ['can we start now'],
  parenthesisPhrases: ['our meeting place'],
  stems: ['the crew checked the ropes'],
  hyphenCompoundRows: [
    { left: 'well', right: 'known', noun: 'author' },
  ],
});

test('punctuation context-pack compiler sanitises atoms deterministically', () => {
  const result = normalisePunctuationContextPack({
    ...VALID_CONTEXT_PACK,
    unknown: ['ignored'],
    names: ['Maya', 'Maya', 'Mia!'],
    listNouns: ['ropes', 'maps', 'snacks', 'shells,'],
    stems: ['x'.repeat(60)],
    hyphenCompoundRows: [
      { left: 'well', right: 'known', noun: 'author' },
      { left: 'well', right: 'known', noun: 'author' },
      { left: 'fast-moving', right: 'tide', noun: 'warning' },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.acceptedAtoms.names, ['Maya']);
  assert.deepEqual(result.acceptedAtoms.listNouns, ['ropes', 'maps', 'snacks']);
  assert.equal(result.summary.acceptedCount > 0, true);
  assert.equal(result.summary.rejectedCount, result.rejectedAtoms.length);
  assert.equal(result.rejectedAtoms.some((atom) => atom.reason === 'punctuation_bearing'), true);
  assert.equal(result.rejectedAtoms.some((atom) => atom.reason === 'duplicate'), true);
  assert.equal(result.rejectedAtoms.some((atom) => atom.reason === 'too_long'), true);
  assert.equal(result.rejectedAtoms.some((atom) => atom.reason === 'unknown_kind'), true);
});

test('context packs affect only deterministic generator families', () => {
  const result = normalisePunctuationContextPack(VALID_CONTEXT_PACK);
  const affectedFamilies = affectedGeneratorFamiliesForContextPack(result);

  assert.deepEqual(affectedFamilies, [
    'gen_sentence_endings_insert',
    'gen_speech_insert',
    'gen_list_commas_insert',
    'gen_list_commas_combine',
    'gen_fronted_adverbial_fix',
    'gen_fronted_adverbial_combine',
    'gen_parenthesis_combine',
    'gen_hyphen_insert',
  ]);
  assert.deepEqual(result.summary.affectedGeneratorFamilies, affectedFamilies);
});

test('context-pack generated items still pass deterministic marking', () => {
  const contextPack = normalisePunctuationContextPack(VALID_CONTEXT_PACK);
  const generatedItems = createPunctuationGeneratedItems({
    seed: 'context-pack-marking',
    perFamily: 1,
    contextPack,
  }).filter((item) => contextPack.summary.affectedGeneratorFamilies.includes(item.generatorFamilyId));
  const generatedText = generatedItems.map((item) => `${item.stem}\n${item.model}`).join('\n');

  assert.equal(generatedItems.length, contextPack.summary.affectedGeneratorFamilies.length);
  assert.match(generatedText, /Maya asked/);
  assert.match(generatedText, /ropes, maps and snacks/);
  assert.match(generatedText, /Before sunrise/);
  assert.match(generatedText, /The harbour, our meeting place, was busy/);
  assert.match(generatedText, /well-known author/);
  for (const item of generatedItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true, item.id);
  }
});

test('context-pack runtime manifest keeps reward denominators stable', () => {
  const baseIndexes = createPunctuationContentIndexes();
  const contextPack = normalisePunctuationContextPack(VALID_CONTEXT_PACK);
  const runtimeIndexes = createPunctuationContentIndexes(createPunctuationRuntimeManifest({
    seed: 'context-pack-runtime',
    generatedPerFamily: 1,
    contextPack,
  }));

  assert.equal(runtimeIndexes.items.length, baseIndexes.items.length + baseIndexes.generatorFamilies.length);
  assert.deepEqual(
    runtimeIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
    baseIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
  );
});
