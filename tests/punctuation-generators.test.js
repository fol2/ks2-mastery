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
  assert.notDeepEqual(differentSeed.map((item) => item.id), first.map((item) => item.id));
});

test('generated punctuation model answers pass deterministic marking', () => {
  const generatedItems = createPunctuationGeneratedItems({ seed: 'marking-smoke', perFamily: 2 });
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
