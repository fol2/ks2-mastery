import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELLING_ANALYTICS_POOL_CATEGORIES,
  SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES,
  SPELLING_POOL_CATEGORIES,
  SPELLING_SETUP_POOL_IDS,
  SPELLING_WORD_BANK_FILTER_IDS,
  normaliseSpellingPoolCategoryId,
  normaliseSpellingSetupPoolId,
  normaliseSpellingWordBankFilterId,
  spellingPoolCategoryById,
  spellingPoolCategoryMatchesWord,
  spellingPoolStatsKey,
  spellingSetupPoolOptions,
  spellingWordBankFilterOptions,
  validateSpellingPoolCategories,
} from '../shared/spelling/pool-taxonomy.js';

test('Spelling pool taxonomy pins current category ids, order, and visibility', () => {
  assert.deepEqual(
    SPELLING_POOL_CATEGORIES.map((category) => category.id),
    ['all', 'core', 'y3-4', 'y5-6', 'secure-extension', 'extra'],
  );
  assert.deepEqual(SPELLING_SETUP_POOL_IDS, ['core', 'y3-4', 'y5-6', 'secure-extension', 'extra']);
  assert.deepEqual(SPELLING_WORD_BANK_FILTER_IDS, ['all', 'y3-4', 'y5-6', 'secure-extension', 'extra']);
  assert.deepEqual(
    SPELLING_ANALYTICS_POOL_CATEGORIES.map((category) => category.statsKey),
    ['core', 'y34', 'y56', 'secureExtension', 'extra'],
  );
  assert.deepEqual(
    SPELLING_ANALYTICS_WORD_GROUP_CATEGORIES.map((category) => category.id),
    ['y3-4', 'y5-6', 'secure-extension', 'extra'],
  );
});

test('Spelling pool taxonomy drives setup and Word Bank options', () => {
  assert.deepEqual(spellingSetupPoolOptions(), [
    { value: 'core', label: 'Core' },
    { value: 'y3-4', label: 'Y3-4' },
    { value: 'y5-6', label: 'Y5-6' },
    { value: 'secure-extension', label: 'Secure vocabulary' },
    { value: 'extra', label: 'Extra' },
  ]);
  assert.deepEqual(spellingWordBankFilterOptions(), [
    { id: 'all', label: 'All' },
    { id: 'y3-4', label: 'Years 3-4' },
    { id: 'y5-6', label: 'Years 5-6' },
    { id: 'secure-extension', label: 'Secure vocabulary' },
    { id: 'extra', label: 'Extra' },
  ]);
});

test('Spelling pool taxonomy maps filter ids to stats keys and safe defaults', () => {
  assert.equal(spellingPoolStatsKey('y3-4'), 'y34');
  assert.equal(spellingPoolStatsKey('y5-6'), 'y56');
  assert.equal(spellingPoolStatsKey('secure-extension'), 'secureExtension');
  assert.equal(spellingPoolStatsKey('extra'), 'extra');
  assert.equal(spellingPoolStatsKey('unknown'), 'core');
  assert.equal(normaliseSpellingSetupPoolId('secure-extension'), 'secure-extension');
  assert.equal(normaliseSpellingSetupPoolId('all'), 'core');
  assert.equal(normaliseSpellingWordBankFilterId('all'), 'all');
  assert.equal(normaliseSpellingWordBankFilterId('core'), 'all');
  assert.equal(normaliseSpellingWordBankFilterId('unknown'), 'all');
});

test('Spelling pool taxonomy match descriptors classify current word rows', () => {
  const statutoryY34 = { slug: 'early', year: '3-4', coverageTier: 'statutory-core', spellingPool: 'core' };
  const statutoryY56 = { slug: 'relevant', year: '5-6', coverageTier: 'statutory-core', spellingPool: 'core' };
  const secure = { slug: 'analyse', year: 'secure-extension', coverageTier: 'secure-extension', spellingPool: 'core' };
  const extra = { slug: 'divide', year: 'extra', coverageTier: 'enrichment-extra', spellingPool: 'extra' };

  assert.equal(spellingPoolCategoryMatchesWord('all', extra), true);
  assert.equal(spellingPoolCategoryMatchesWord('core', statutoryY34), true);
  assert.equal(spellingPoolCategoryMatchesWord('core', extra), false);
  assert.equal(spellingPoolCategoryMatchesWord('y3-4', statutoryY34), true);
  assert.equal(spellingPoolCategoryMatchesWord('y3-4', statutoryY56), false);
  assert.equal(spellingPoolCategoryMatchesWord('secure-extension', secure), true);
  assert.equal(spellingPoolCategoryMatchesWord('secure-extension', statutoryY34), false);
  assert.equal(spellingPoolCategoryMatchesWord('extra', extra), true);
});

test('Spelling pool taxonomy validates duplicate and unsupported category definitions', () => {
  assert.equal(validateSpellingPoolCategories(), true);
  assert.throws(
    () => validateSpellingPoolCategories([
      ...SPELLING_POOL_CATEGORIES,
      { ...spellingPoolCategoryById('extra') },
    ]),
    /Duplicate Spelling pool category id: extra/,
  );
  assert.throws(
    () => validateSpellingPoolCategories([
      ...SPELLING_POOL_CATEGORIES,
      {
        id: 'future',
        label: 'Future',
        statsKey: 'future',
        order: 90,
        match: { unsupported: true },
      },
    ]),
    /Unsupported Spelling pool match key/,
  );
});

test('Spelling pool taxonomy helpers can accept a future category outside JSX code', () => {
  const future = {
    id: 'future-science',
    label: 'Future science',
    statsKey: 'futureScience',
    order: 90,
    match: { coverageTier: 'enrichment-extra', year: 'future-science' },
  };
  const custom = [...SPELLING_POOL_CATEGORIES, future];

  assert.equal(validateSpellingPoolCategories(custom), true);
  assert.equal(normaliseSpellingPoolCategoryId('future-science', 'core', custom), 'future-science');
  assert.equal(spellingPoolCategoryMatchesWord(future, {
    slug: 'gravity',
    year: 'future-science',
    coverageTier: 'enrichment-extra',
  }), true);
});
