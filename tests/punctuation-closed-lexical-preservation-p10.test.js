import test from 'node:test';
import assert from 'node:assert/strict';

import { PUNCTUATION_CONTENT_MANIFEST, PUNCTUATION_ITEMS } from '../shared/punctuation/content.js';
import { PRODUCTION_DEPTH, createPunctuationGeneratedItems } from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'we', 'you', 'i', 'he', 'she', 'they', 'it',
  'was', 'were', 'is', 'are', 'am', 'be', 'been', 'being', 'had', 'has', 'have',
  'do', 'did', 'does', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by',
  'as', 'that', 'this', 'who', 'which', 'when', 'where', 'why', 'can', 'could',
  'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'our', 'your', 'my',
  'his', 'her', 'their', 'its', 'not',
]);

function productionPool() {
  const generated = createPunctuationGeneratedItems({
    manifest: PUNCTUATION_CONTENT_MANIFEST,
    seed: PUNCTUATION_CONTENT_MANIFEST.generatedSeed || PUNCTUATION_CONTENT_MANIFEST.releaseId || 'punctuation',
    perFamily: PRODUCTION_DEPTH,
  });
  return [
    ...PUNCTUATION_ITEMS.map((item) => ({ ...item, _source: 'fixed' })),
    ...generated.map((item) => ({ ...item, _source: 'generated' })),
  ];
}

function wordMatches(text) {
  return [...String(text).matchAll(/[A-Za-z][A-Za-z']*/g)].map((match) => ({
    word: match[0],
    index: match.index,
  }));
}

function lexicalReplacementVariants(model) {
  return wordMatches(model)
    .filter(({ word }) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 4)
    .map(({ word, index }) => {
      const replacement = word.toLowerCase() === 'banana'
        ? (/^[A-Z]/.test(word) ? 'Orange' : 'orange')
        : (/^[A-Z]/.test(word) ? 'Banana' : 'banana');
      return model.slice(0, index) + replacement + model.slice(index + word.length);
    });
}

function answersFor(item) {
  return [...new Set([
    item.model,
    ...(Array.isArray(item.accepted) ? item.accepted : []),
  ].filter((answer) => typeof answer === 'string' && answer.trim()))];
}

function closedTransferItems(pool) {
  return pool.filter((item) =>
    ['insert', 'fix', 'combine'].includes(item.mode)
    && typeof item.model === 'string'
    && item.model.trim()
  );
}

function generatedItem(pool, familyId) {
  const item = pool.find((entry) => entry.generatorFamilyId === familyId);
  assert.ok(item, `Expected generated family ${familyId} in production pool`);
  return item;
}

test('P10 lexical preservation covers the expanded P12 production pool', () => {
  const pool = productionPool();
  assert.equal(PRODUCTION_DEPTH, 100);
  // P14 update: pool grew from 3,312 (P12) to 3,564 (P14 transfer expansion).
  // 252 new transfer-mode items added; baseline 28 families × 100 templates
  // unchanged at 2,800 baseline generated.
  assert.equal(pool.length, 3564);
  assert.equal(pool.filter((item) => item._source === 'fixed').length, 512);
  assert.equal(pool.filter((item) => item._source === 'generated').length, 3052);
});

test('P10: generated closed insert/fix items reject known lexical substitutions', () => {
  const pool = productionPool();
  const probes = [
    { familyId: 'gen_list_commas_insert' },
    { familyId: 'gen_fronted_adverbial_fix' },
    { familyId: 'gen_apostrophe_possession_insert' },
    { familyId: 'gen_comma_clarity_insert' },
    { familyId: 'gen_hyphen_insert' },
    { familyId: 'gen_semicolon_list_fix' },
  ];

  for (const probe of probes) {
    const item = generatedItem(pool, probe.familyId);
    const modelResult = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(modelResult.correct, true, `Model answer should pass for ${item.id}`);

    const answer = lexicalReplacementVariants(item.model)[0];
    assert.ok(answer, `Probe needs a lexical replacement for ${item.id}`);
    assert.notEqual(answer, item.model, `Probe must change the model answer for ${item.id}`);
    const result = markPunctuationAnswer({ item, answer: { typed: answer } });
    assert.equal(result.correct, false, `${probe.familyId} accepted lexical substitution: ${answer}`);
  }
});

test('P10: closed transfer model and accepted answers still pass', (t) => {
  const pool = productionPool();
  const items = closedTransferItems(pool);
  let answersChecked = 0;

  for (const item of items) {
    for (const answer of answersFor(item)) {
      answersChecked += 1;
      const result = markPunctuationAnswer({ item, answer: { typed: answer } });
      assert.equal(
        result.correct,
        true,
        `Accepted answer should pass for ${item.id}: ${answer}`,
      );
    }
  }

  assert.ok(items.length > 0, 'Expected closed transfer items in production pool');
  assert.ok(answersChecked > items.length, 'Expected accepted-answer coverage beyond one answer per item');
  t.diagnostic(`P10 model/accepted answers checked: items=${items.length}, answers=${answersChecked}`);
});

test('P10: closed transfer items reject same-count lexical substitutions', (t) => {
  const pool = productionPool();
  const items = closedTransferItems(pool);
  const leaks = [];
  let attempts = 0;

  for (const item of items) {
    for (const answer of lexicalReplacementVariants(item.model)) {
      attempts += 1;
      const result = markPunctuationAnswer({ item, answer: { typed: answer } });
      if (result.correct) {
        leaks.push({
          itemId: item.id,
          source: item._source,
          family: item.generatorFamilyId || null,
          answer,
        });
      }
    }
  }

  assert.ok(items.length > 0, 'Expected closed transfer items in production pool');
  assert.ok(attempts >= 200, `P10 lexical-replacement audit must be non-trivial, got ${attempts}`);
  t.diagnostic(`P10 lexical-replacement audit inspected: items=${items.length}, attempts=${attempts}`);
  assert.deepEqual(leaks, []);
});
