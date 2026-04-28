import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPunctuationContentIndexes,
  PUNCTUATION_CONTENT_MANIFEST,
} from '../shared/punctuation/content.js';
import {
  createPunctuationGeneratedItems,
  createPunctuationRuntimeManifest,
} from '../shared/punctuation/generators.js';
import { markPunctuationAnswer } from '../shared/punctuation/marking.js';
import { selectPunctuationItem } from '../shared/punctuation/scheduler.js';

test('generated punctuation items are deterministic, unique, and family-scoped', () => {
  const first = createPunctuationGeneratedItems({ seed: 'release-a', perFamily: 2 });
  const second = createPunctuationGeneratedItems({ seed: 'release-a', perFamily: 2 });
  const differentSeed = createPunctuationGeneratedItems({ seed: 'release-b', perFamily: 2 });

  assert.deepEqual(second, first);
  assert.equal(first.length, PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length * 2);
  assert.equal(new Set(first.map((item) => item.id)).size, first.length);
  assert.equal(first.every((item) => item.source === 'generated'), true);
  assert.equal(first.every((item) => item.generatorFamilyId), true);
  assert.equal(first.every((item) => item.templateId), true);
  assert.equal(first.every((item) => /^puncsig_[a-z0-9]+$/.test(item.variantSignature)), true);
  assert.notDeepEqual(differentSeed.map((item) => item.id), first.map((item) => item.id));
});

test('generated punctuation first variants preserve legacy runtime surfaces when banks expand', () => {
  const baseline = createPunctuationGeneratedItems({ seed: 'legacy-runtime', perFamily: 1 });
  const expanded = {
    ...PUNCTUATION_CONTENT_MANIFEST,
    generatorFamilies: PUNCTUATION_CONTENT_MANIFEST.generatorFamilies,
  };
  const after = createPunctuationGeneratedItems({ manifest: expanded, seed: 'legacy-runtime', perFamily: 1 });

  assert.deepEqual(
    after.map((item) => ({ id: item.id, stem: item.stem, model: item.model, templateId: item.templateId })),
    baseline.map((item) => ({ id: item.id, stem: item.stem, model: item.model, templateId: item.templateId })),
  );
});

test('generated punctuation signatures detect duplicate learner-visible surfaces', () => {
  const items = createPunctuationGeneratedItems({ seed: 'signature', perFamily: 3 });
  const clone = {
    ...items[0],
    id: `${items[0].id}_copy`,
  };

  assert.equal(clone.variantSignature, items[0].variantSignature);
});

test('expanded generated banks add distinct signatures after legacy variants', () => {
  const targetFamilies = [
    'gen_sentence_endings_insert',
    'gen_apostrophe_contractions_fix',
    'gen_comma_clarity_insert',
    'gen_dash_clause_fix',
    'gen_dash_clause_combine',
    'gen_hyphen_insert',
    'gen_semicolon_list_fix',
  ];
  const items = createPunctuationGeneratedItems({ seed: 'expanded-bank', perFamily: 4 });

  for (const familyId of targetFamilies) {
    const familyItems = items.filter((item) => item.generatorFamilyId === familyId);
    assert.equal(familyItems.length, 4, familyId);
    assert.equal(new Set(familyItems.map((item) => item.variantSignature)).size, 4, familyId);
    assert.equal(new Set(familyItems.map((item) => item.templateId)).size, 4, familyId);
  }
});

test('generated punctuation model answers pass deterministic marking', () => {
  const generatedItems = createPunctuationGeneratedItems({ seed: 'marking-smoke', perFamily: 4 });
  for (const item of generatedItems) {
    const result = markPunctuationAnswer({ item, answer: { typed: item.model } });
    assert.equal(result.correct, true, item.id);
  }
});

test('runtime manifest adds generated practice without changing reward denominators', () => {
  const baseIndexes = createPunctuationContentIndexes(PUNCTUATION_CONTENT_MANIFEST);
  const runtimeManifest = createPunctuationRuntimeManifest({ seed: 'runtime', generatedPerFamily: 1 });
  const runtimeIndexes = createPunctuationContentIndexes(runtimeManifest);

  assert.equal(runtimeIndexes.items.length, baseIndexes.items.length + PUNCTUATION_CONTENT_MANIFEST.generatorFamilies.length);
  assert.deepEqual(
    runtimeIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
    baseIndexes.publishedRewardUnits.map((unit) => unit.masteryKey),
  );
});

test('scheduler can select generated practice inside the bounded candidate window', () => {
  const indexes = createPunctuationContentIndexes(createPunctuationRuntimeManifest({
    seed: 'scheduler',
    generatedPerFamily: 1,
  }));
  const result = selectPunctuationItem({
    indexes,
    progress: { items: {} },
    session: { answeredCount: 1, recentItemIds: [] },
    prefs: { mode: 'endmarks' },
    now: 0,
    random: () => 0.99,
    candidateWindow: 8,
  });

  assert.equal(result.targetMode, 'insert');
  assert.equal(result.item.source, 'generated');
  assert.equal(result.item.generatorFamilyId, 'gen_sentence_endings_insert');
});
