import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpellingContentBrowseModel,
  buildSpellingContentSentenceDetail,
  buildSpellingContentWordDetail,
} from '../src/subjects/spelling/content/editor-read-model.js';

const NOW = Date.UTC(2026, 5, 11, 12, 0, 0);

function contentBundle(overrides = {}) {
  return {
    modelVersion: 6,
    subjectId: 'spelling',
    draft: {
      id: 'main',
      state: 'draft',
      version: 1,
      title: 'Spelling editorial test draft',
      createdAt: NOW,
      updatedAt: NOW,
      wordLists: [
        {
          id: 'core-y34',
          title: 'Core Y3/4',
          spellingPool: 'core',
          coverageTier: 'statutory-core',
          yearGroups: ['Y3', 'Y4'],
          wordSlugs: ['alpha', 'beta'],
          sortIndex: 0,
        },
        {
          id: 'extra-greek',
          title: 'Extra Greek roots',
          spellingPool: 'extra',
          coverageTier: 'enrichment-extra',
          yearGroups: [],
          wordSlugs: ['metamorphosis'],
          sortIndex: 1,
        },
      ],
      words: [
        {
          slug: 'alpha',
          word: 'alpha',
          family: 'greek-root',
          listId: 'core-y34',
          spellingPool: 'core',
          coverageTier: 'statutory-core',
          yearGroups: ['Y3', 'Y4'],
          accepted: ['alpha'],
          patternIds: ['prefix-alpha'],
          explanation: 'Alpha has a clear root explanation.',
          sentenceEntryIds: ['alpha-s1', 'alpha-s2'],
          sortIndex: 0,
        },
        {
          slug: 'beta',
          word: 'beta',
          family: 'greek-root',
          listId: 'core-y34',
          spellingPool: 'core',
          coverageTier: 'statutory-core',
          yearGroups: ['Y3', 'Y4'],
          accepted: ['beta'],
          patternIds: ['prefix-beta'],
          explanation: 'Beta has a clear root explanation.',
          sentenceEntryIds: ['beta-s1'],
          sortIndex: 1,
        },
        {
          slug: 'metamorphosis',
          word: 'metamorphosis',
          family: 'shape-change',
          listId: 'extra-greek',
          spellingPool: 'extra',
          coverageTier: 'enrichment-extra',
          yearGroups: [],
          accepted: ['metamorphosis'],
          explanation: 'Metamorphosis describes a complete change.',
          sentenceEntryIds: ['meta-s1'],
          variants: [
            {
              word: 'metamorphic',
              accepted: ['metamorphic'],
              explanation: 'Metamorphic shares the same changing root.',
              sentenceEntryIds: ['meta-v1'],
              sortIndex: 0,
            },
          ],
          sortIndex: 2,
        },
      ],
      sentences: [
        { id: 'alpha-s1', wordSlug: 'alpha', text: 'The alpha example starts the list.', variantLabel: 'default', sortIndex: 0 },
        { id: 'alpha-s2', wordSlug: 'alpha', text: 'A second alpha sentence supports audio.', variantLabel: 'slow', sortIndex: 1 },
        { id: 'beta-s1', wordSlug: 'beta', text: 'The beta example follows alpha.', variantLabel: 'default', sortIndex: 2 },
        { id: 'meta-s1', wordSlug: 'metamorphosis', text: 'The tadpole begins metamorphosis.', variantLabel: 'default', sortIndex: 3 },
        { id: 'meta-v1', wordSlug: 'metamorphosis', text: 'Metamorphic rock changes under pressure.', variantLabel: 'variant', sortIndex: 4 },
      ],
    },
    releases: [],
    publication: { currentReleaseId: '', publishedVersion: 0, updatedAt: NOW },
    ...overrides,
  };
}

function packageBundle() {
  const bundle = contentBundle();
  return {
    ...bundle,
    draft: {
      ...bundle.draft,
      words: [
        {
          ...bundle.draft.words[0],
          explanation: 'Alpha has a package draft explanation for editors.',
        },
        bundle.draft.words[1],
        bundle.draft.words[2],
        {
          slug: 'gamma',
          word: 'gamma',
          family: 'greek-root',
          listId: 'core-y34',
          spellingPool: 'core',
          coverageTier: 'statutory-core',
          yearGroups: ['Y3', 'Y4'],
          accepted: ['gamma'],
          patternIds: ['prefix-gamma'],
          explanation: 'Gamma has a clear root explanation.',
          sentenceEntryIds: ['gamma-s1'],
          sortIndex: 3,
        },
      ],
      sentences: [
        ...bundle.draft.sentences,
        { id: 'gamma-s1', wordSlug: 'gamma', text: 'Gamma joins the package draft.', variantLabel: 'default', sortIndex: 5 },
      ],
      wordLists: bundle.draft.wordLists.map((list) => (
        list.id === 'core-y34'
          ? { ...list, wordSlugs: [...list.wordSlugs, 'gamma'] }
          : list
      )),
    },
  };
}

test('spelling content operations browse summarises families, pools, and audio requirements', () => {
  const browse = buildSpellingContentBrowseModel({
    publishedContent: contentBundle(),
    releaseInfo: { releaseId: 'rel-1', snapshotHash: 'hash-1', publishedAt: NOW },
    filters: { pool: 'all', limit: 20 },
  });

  const alpha = browse.words.find((row) => row.slug === 'alpha');
  const extra = browse.words.find((row) => row.slug === 'metamorphosis');

  assert.equal(browse.release.releaseId, 'rel-1');
  assert.equal(browse.totals.words, 3);
  assert.equal(browse.totals.families, 2);
  assert.equal(alpha.familySize, 2);
  assert.equal(alpha.audioReadiness.wordAudioRequired, 2);
  assert.equal(alpha.audioReadiness.sentenceAudioRequired, 8);
  assert.equal(extra.variantCount, 1);
  assert.equal(extra.audioReadiness.wordAudioRequired, 4);
  assert.equal(extra.audioReadiness.sentenceAudioRequired, 8);
  assert.equal(browse.pools.find((pool) => pool.pool === 'extra').variantCount, 1);
});

test('spelling content operations browse filters by variant words and accepted spellings', () => {
  const browse = buildSpellingContentBrowseModel({
    publishedContent: contentBundle(),
    filters: { query: 'metamorphic', limit: 20 },
  });

  assert.deepEqual(browse.words.map((row) => row.slug), ['metamorphosis']);
  assert.deepEqual(browse.words[0].variantWords, ['metamorphic']);
  assert.deepEqual(browse.words[0].variantAccepted, ['metamorphic']);
});

test('spelling content operations browse marks package draft additions and modifications', () => {
  const browse = buildSpellingContentBrowseModel({
    publishedContent: contentBundle(),
    packageContent: packageBundle(),
    packageId: 'pkg-1',
    packageRecord: { packageId: 'pkg-1', title: 'Greek root package', state: 'draft' },
    packageCandidate: {
      candidateId: 'cand-1',
      candidateHash: 'candidate-1',
      validation: { ok: true, errors: [], warnings: [] },
    },
    filters: { query: 'greek', limit: 20 },
  });

  assert.equal(browse.packageDraft.status, 'available');
  assert.equal(browse.draftStateCounts.modified, 1);
  assert.equal(browse.draftStateCounts.added, 1);
  assert.equal(browse.words.find((row) => row.slug === 'alpha').draftState, 'modified');
  assert.equal(browse.words.find((row) => row.slug === 'gamma').draftState, 'added');
});

test('spelling content operations browse requires validation for active packages without candidates', () => {
  const browse = buildSpellingContentBrowseModel({
    publishedContent: contentBundle(),
    packageContent: null,
    packageId: 'pkg-1',
    packageRecord: { packageId: 'pkg-1', title: 'Greek root package', state: 'draft' },
    packageCandidate: null,
    filters: { query: 'alpha', limit: 20 },
  });

  const row = browse.words.find((entry) => entry.slug === 'alpha');
  assert.equal(browse.packageDraft.status, 'candidate_required');
  assert.equal(browse.packageDraft.validation.status, 'candidate_required');
  assert.equal(browse.packageDraft.validation.ok, false);
  assert.equal(row.validationState.status, 'candidate_required');
  assert.equal(row.validationState.ok, false);
});

test('spelling content operations browse marks stale package candidates without applying old draft values', () => {
  const browse = buildSpellingContentBrowseModel({
    publishedContent: contentBundle(),
    packageContent: null,
    packageId: 'pkg-1',
    packageRecord: { packageId: 'pkg-1', title: 'Greek root package', state: 'draft' },
    packageCandidate: {
      candidateId: 'cand-1',
      candidateHash: 'candidate-1',
      validation: { ok: true, errors: [], warnings: [] },
      isCurrent: false,
      staleReasons: ['operations_stale'],
      expectedOperationsHash: 'ops-current',
      latestReleaseId: 'rel-current',
    },
    filters: { query: 'alpha', limit: 20 },
  });

  const row = browse.words.find((entry) => entry.slug === 'alpha');
  assert.equal(browse.packageDraft.status, 'stale_candidate');
  assert.deepEqual(browse.packageDraft.staleReasons, ['operations_stale']);
  assert.equal(browse.packageDraft.validation.status, 'stale_candidate');
  assert.equal(row.draftState, 'unchanged');
  assert.equal(row.hasPackageDraft, false);
  assert.equal(row.validationState.status, 'stale_candidate');
});

test('spelling content operations detail exposes current and package draft word values', () => {
  const detail = buildSpellingContentWordDetail({
    publishedContent: contentBundle(),
    packageContent: packageBundle(),
    packageId: 'pkg-1',
    packageCandidate: { candidateId: 'cand-1', candidateHash: 'candidate-1', validation: { ok: true } },
    slug: 'alpha',
  });

  assert.equal(detail.found, true);
  assert.equal(detail.draftState, 'modified');
  assert.equal(detail.current.explanation, 'Alpha has a clear root explanation.');
  assert.equal(detail.packageValue.explanation, 'Alpha has a package draft explanation for editors.');
  assert.equal(detail.current.sentences.length, 2);
  assert.equal(detail.current.familyMembers.length, 2);
});

test('spelling content operations sentence detail supports id lookups', () => {
  const detail = buildSpellingContentSentenceDetail({
    publishedContent: contentBundle(),
    packageContent: packageBundle(),
    sentenceId: 'gamma-s1',
    packageId: 'pkg-1',
  });

  assert.equal(detail.found, true);
  assert.equal(detail.draftState, 'added');
  assert.equal(detail.current, null);
  assert.equal(detail.packageValue.word.slug, 'gamma');
});
