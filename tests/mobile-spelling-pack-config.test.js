import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import { SEEDED_SPELLING_CONTENT_SUMMARY } from '../src/subjects/spelling/data/content-data.js';

const CONFIG_URL = new URL('../config/mobile-spelling-packs.json', import.meta.url);

const APPROVED_STARTER_ITEM_IDS = [
  'answer',
  'appear',
  'arrive',
  'build',
  'busy',
  'circle',
  'early',
  'fruit',
  'group',
  'heard',
  'achieve',
  'muscle',
  'occur',
  'suggest',
  'develop',
  'competition',
  'frequently',
  'queue',
  'rhythm',
  'yacht',
];

const APPROVED_CONFIG = {
  schemaVersion: 1,
  identity: {
    runtimeItemIdFormat: 'packId:itemId',
    packId: 'ks2-core',
    entitlementId: 'full-ks2',
  },
  catalogues: [
    {
      catalogueId: 'ks2-core:starter',
      packId: 'ks2-core',
      releaseScope: 'v1-bundled',
      entitlementIds: [],
      itemIds: APPROVED_STARTER_ITEM_IDS,
      selectionNotes: [
        'Manually reviewed lower-entry Years 3-4 statutory words.',
        'One learning target per item; no duplicate family variants.',
        'Common, recognisable vocabulary with varied spelling patterns.',
      ],
    },
    {
      catalogueId: 'ks2-core:full',
      packId: 'ks2-core',
      releaseScope: 'v1-download',
      entitlementIds: ['full-ks2'],
      selection: {
        coverageTier: 'statutory-core',
      },
    },
    {
      catalogueId: 'secure-vocabulary:future',
      packId: 'secure-vocabulary',
      releaseScope: 'future-independent-product',
      entitlementIds: [],
      selection: {
        coverageTier: 'secure-extension',
      },
      monsterPolicy: 'new-pack-specific-monster-required',
    },
    {
      catalogueId: 'extra-vocabulary:future',
      packId: 'extra-vocabulary',
      releaseScope: 'future-independent-product',
      entitlementIds: [],
      selection: {
        coverageTier: 'enrichment-extra',
      },
      monsterPolicy: 'preserve-vellhorn',
    },
  ],
  sentenceCorrections: [
    {
      catalogueId: 'ks2-core:full',
      itemId: 'famous',
      sentenceId: 'sentence-6',
      expectedText: 'The castle is famous with visitors from many countries.',
      replacementText: 'The castle is famous among visitors from many countries.',
    },
  ],
  rewardTracks: [
    {
      rewardTrackId: 'spelling-core-inklet',
      packId: 'ks2-core',
      monsterId: 'inklet',
      yearBand: '3-4',
      thresholds: [1, 10, 30, 60, 100],
    },
    {
      rewardTrackId: 'spelling-core-glimmerbug',
      packId: 'ks2-core',
      monsterId: 'glimmerbug',
      yearBand: '5-6',
      thresholds: [1, 10, 30, 60, 100],
    },
    {
      rewardTrackId: 'spelling-core-phaeton',
      packId: 'ks2-core',
      monsterId: 'phaeton',
      sourceRewardTrackIds: [
        'spelling-core-inklet',
        'spelling-core-glimmerbug',
      ],
      thresholds: [3, 25, 95, 145, 213],
    },
    {
      rewardTrackId: 'spelling-extra-vellhorn',
      packId: 'extra-vocabulary',
      monsterId: 'vellhorn',
      thresholds: [1, 10, 30, 60, 100],
      releaseScope: 'future-independent-product',
    },
  ],
  audioProfiles: ['Iapetus', 'Sulafat'],
  audioKinds: [
    'word-natural',
    'dictation-normal',
    'dictation-slow',
  ],
};

function readConfig() {
  return JSON.parse(readFileSync(CONFIG_URL, 'utf8'));
}

function normalisedTarget(word) {
  return String(word || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-GB')
    .replaceAll('’', "'");
}

test('mobile pack configuration freezes the complete approved v1 contract', () => {
  assert.deepEqual(readConfig(), APPROVED_CONFIG);
});

test('mobile Starter allocation remains valid against the published spelling snapshot', () => {
  const config = readConfig();
  const wordsBySlug = new Map(WORDS.map((word) => [word.slug, word]));
  const starter = config.catalogues.find((entry) => entry.catalogueId === 'ks2-core:starter');

  assert.ok(starter);
  assert.deepEqual(starter.itemIds, APPROVED_STARTER_ITEM_IDS);
  assert.equal(new Set(starter.itemIds).size, 20);

  for (const itemId of starter.itemIds) {
    const word = wordsBySlug.get(itemId);
    assert.ok(word, `${itemId} must exist in the published snapshot`);
    assert.equal(word.coverageTier, 'statutory-core');
    assert.ok(['3-4', '5-6'].includes(word.year), `${itemId} must have yearBand 3-4 or 5-6`);
  }

  const starterTargets = starter.itemIds.map((itemId) => normalisedTarget(wordsBySlug.get(itemId).word));
  assert.equal(new Set(starterTargets).size, starterTargets.length);
  assert.deepEqual(SEEDED_SPELLING_CONTENT_SUMMARY.coverageTierCounts, {
    statutoryCore: 213,
    secureExtension: 1215,
    enrichmentExtra: 52,
    total: 1480,
  });
});
