import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertNoDuplicateActiveTargets,
  createLegacyEngineContentSnapshot,
  validateCatalogueV1,
} from '../shared/spelling/mobile/index.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), 'utf8'));
const starter = read('spelling.mobile-runtime-starter.json');
const full = read('spelling.mobile-runtime-full.json');
const a0 = read('spelling.mobile-source-manifest.json');

test('A2 runtime catalogues contain exact approved Starter and Full inventories', () => {
  assert.equal(validateCatalogueV1(starter).items.length, 20);
  assert.equal(validateCatalogueV1(full).items.length, 213);
  assert.equal(starter.catalogueId, 'ks2-core:starter');
  assert.equal(full.catalogueId, 'ks2-core:full');
  assert.deepEqual(starter.entitlementIds, []);
  assert.deepEqual(full.entitlementIds, ['full-ks2']);
  assert.deepEqual(starter.rewardTracks.map(({ rewardTrackId }) => rewardTrackId), [
    'spelling-core-inklet',
    'spelling-core-glimmerbug',
  ]);
  assert.deepEqual(full.rewardTracks.map(({ rewardTrackId }) => rewardTrackId), [
    'spelling-core-inklet',
    'spelling-core-glimmerbug',
    'spelling-core-phaeton',
  ]);
  assert.deepEqual(starter.items.map(({ itemId }) => itemId), a0.allocations.starter.itemIds);
  assert.deepEqual(full.items.map(({ itemId }) => itemId), a0.allocations.fullKs2.itemIds);
  assert.equal(starter.audio.requiredAssetCount, 840);
  assert.equal(full.audio.requiredAssetCount, 8946);
});

test('A2 shared items retain identity and excluded tiers never leak', () => {
  const fullById = new Map(full.items.map((item) => [item.itemId, item]));
  for (const item of starter.items) {
    assert.equal(item.runtimeItemId, fullById.get(item.itemId)?.runtimeItemId);
  }
  for (const catalogue of [starter, full]) {
    assert.ok(catalogue.items.every((item) => item.packId === 'ks2-core'));
    assert.ok(catalogue.items.every((item) => item.coverageTier === 'statutory-core'));
    assert.doesNotMatch(JSON.stringify(catalogue), /secure-extension|enrichment-extra|vellhorn|secure-vocabulary|extra-vocabulary/);
  }
  assert.equal(assertNoDuplicateActiveTargets([full]), true);
});

test('A2 emits only compact learner runtime fields and deterministic sentence IDs', () => {
  const allowed = [
    'accepted', 'coverageTier', 'explanation', 'family', 'familyWords', 'itemId',
    'legacySlug', 'packId', 'patternIds', 'runtimeItemId', 'sentencePrompts',
    'target', 'yearBand', 'yearLabel',
  ];
  for (const item of full.items) {
    assert.deepEqual(Object.keys(item).sort(), allowed);
    assert.deepEqual(item.sentencePrompts.map((entry) => entry.sentenceId),
      item.sentencePrompts.map((_, index) => `sentence-${index + 1}`));
  }
  assert.deepEqual(full.items[0].familyWords, ['accident', 'accidentally']);
  assert.equal(full.items[0].yearLabel, 'Years 3-4');
});

test('A2 applies the approved Full catalogue correction for famous', () => {
  const famous = full.items.find(({ itemId }) => itemId === 'famous');
  assert.ok(famous);
  assert.equal(
    famous.sentencePrompts.find(({ sentenceId }) => sentenceId === 'sentence-6')?.text,
    'The castle is famous among visitors from many countries.',
  );
  assert.doesNotMatch(
    JSON.stringify(full),
    /The castle is famous with visitors from many countries\./,
  );
});

test('A2 legacy-engine content projection keeps composite identity as metadata', () => {
  const projected = createLegacyEngineContentSnapshot(starter);
  assert.equal(projected.words.length, 20);
  assert.equal(projected.wordBySlug.answer.runtimeItemId, 'ks2-core:answer');
  assert.equal(projected.wordBySlug.answer.slug, 'answer');
  assert.equal(projected.wordBySlug.answer.legacySlug, 'answer');
});
