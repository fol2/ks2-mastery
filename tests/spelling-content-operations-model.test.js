import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpellingContentBrowseModel,
  buildSpellingContentSentenceDetail,
  buildSpellingContentWordDetail,
} from '../src/subjects/spelling/content/editor-read-model.js';
import {
  buildSpellingContentOperationCandidate,
  applyContentOperationsToSpellingContent,
} from '../src/subjects/spelling/content/operations-model.js';
import {
  buildPublishedSnapshotFromDraft,
} from '../src/subjects/spelling/content/model.js';
import {
  buildSpellingSentenceDeleteOrRetireOperation,
  buildSpellingSentenceUpsertOperation,
  buildSpellingWordListDeleteOrRetireOperation,
  buildSpellingWordListUpsertOperation,
  buildSpellingWordDeleteOrRetireOperation,
  buildSpellingWordUpsertOperation,
  validateSpellingSentenceEditorInput,
  validateSpellingWordListEditorInput,
  validateSpellingWordEditorInput,
} from '../src/subjects/spelling/content/package-operations.js';

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
          tags: ['exception-word'],
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
          tags: ['exception-word'],
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
          tags: ['exception-word'],
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

test('spelling content operations browse keeps retired words out of active pool and list totals', () => {
  const retiredBundle = contentBundle();
  retiredBundle.draft.words = retiredBundle.draft.words.map((word) => (
    word.slug === 'alpha'
      ? {
          ...word,
          active: false,
          retired: true,
          retirement: { reason: 'Retired by test.', source: 'test', retiredAt: NOW },
        }
      : word
  ));
  const browse = buildSpellingContentBrowseModel({
    publishedContent: retiredBundle,
    filters: { pool: 'all', limit: 20 },
  });
  const corePool = browse.pools.find((pool) => pool.pool === 'core');
  const coreList = browse.wordLists.find((list) => list.id === 'core-y34');
  const retiredRow = browse.words.find((row) => row.slug === 'alpha');

  assert.equal(corePool.wordCount, 1);
  assert.equal(corePool.totalWordCount, 2);
  assert.equal(coreList.wordCount, 1);
  assert.equal(coreList.totalWordCount, 2);
  assert.equal(retiredRow.retired, true);
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

test('spelling word editor builder creates a valid upsert operation with explicit progress key', () => {
  const bundle = contentBundle();
  const alpha = bundle.draft.words[0];
  const operation = buildSpellingWordUpsertOperation({
    ...alpha,
    explanation: 'Alpha has a revised learner-facing explanation.',
    accepted: 'alpha',
    sourceNote: 'Edited in Content Operations Centre.',
    provenance: { source: 'admin-editor', note: 'T10 test edit' },
    progressKey: 'alpha',
  }, {
    existingWord: alpha,
    wordLists: bundle.draft.wordLists,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [operation]);

  assert.equal(operation.entityType, 'spelling.word');
  assert.equal(operation.action, 'upsert');
  assert.equal(operation.entityId, 'alpha');
  assert.equal(operation.payload.progressKey, 'alpha');
  assert.equal(candidate.validation.ok, true);
  assert.equal(
    candidate.candidate.draft.words.find((word) => word.slug === 'alpha').explanation,
    'Alpha has a revised learner-facing explanation.',
  );
});

test('spelling word editor builder keeps Extra word-family variants first class', () => {
  const bundle = contentBundle();
  const extra = bundle.draft.words.find((word) => word.slug === 'metamorphosis');
  const operation = buildSpellingWordUpsertOperation({
    ...extra,
    accepted: 'metamorphosis',
    sourceNote: 'Edited in Content Operations Centre.',
    provenance: { source: 'admin-editor' },
    variants: [{
      word: 'metamorphic',
      accepted: 'metamorphic',
      explanation: 'Metamorphic shares the same changing root.',
      sentenceEntryIds: 'meta-v1',
      sourceNote: 'Edited in Content Operations Centre.',
      provenance: { source: 'admin-editor' },
      progressKey: 'metamorphic',
    }],
  }, {
    existingWord: extra,
    wordLists: bundle.draft.wordLists,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [operation]);

  assert.equal(operation.payload.variants[0].word, 'metamorphic');
  assert.equal(operation.payload.variants[0].progressKey, 'metamorphic');
  assert.equal(candidate.validation.ok, true);
});

test('spelling word editor validation blocks learner-visible words without editorial contract fields', () => {
  const bundle = contentBundle();
  const result = validateSpellingWordEditorInput({
    slug: 'delta',
    word: 'delta',
    family: 'greek-root',
    listId: 'core-y34',
    spellingPool: 'core',
    coverageTier: 'statutory-core',
    yearGroups: 'Y3, Y4',
    explanation: 'Too short.',
  }, {
    wordLists: bundle.draft.wordLists,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.field === 'accepted'));
  assert.ok(result.errors.some((entry) => entry.field === 'sentenceEntryIds'));
  assert.ok(result.errors.some((entry) => entry.field === 'provenance'));
});

test('spelling word editor builder keeps core word-family variants as separate rows', () => {
  const bundle = contentBundle();
  const alpha = bundle.draft.words[0];

  assert.throws(
    () => buildSpellingWordUpsertOperation({
      ...alpha,
      accepted: 'alpha',
      sourceNote: 'Edited in Content Operations Centre.',
      provenance: { source: 'admin-editor' },
      variants: [{
        word: 'alphabet',
        accepted: 'alphabet',
        explanation: 'Alphabet shares the same family.',
        sentenceEntryIds: 'alpha-s1',
        sourceNote: 'Edited in Content Operations Centre.',
        provenance: { source: 'admin-editor' },
      }],
    }, {
      existingWord: alpha,
      wordLists: bundle.draft.wordLists,
    }),
    /Core word-family variants must stay as separate word rows/,
  );
});

test('spelling word delete-or-retire operation hard deletes drafts and retires published words', () => {
  const bundle = contentBundle();
  const draftDelete = buildSpellingWordDeleteOrRetireOperation({ slug: 'gamma' });
  const retire = buildSpellingWordDeleteOrRetireOperation({ slug: 'alpha', hasCurrent: true }, {
    reason: 'Retired by test.',
    now: () => NOW,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [retire]);
  const applied = applyContentOperationsToSpellingContent(bundle, [retire]);
  const retiredAlpha = applied.draft.words.find((word) => word.slug === 'alpha');
  const snapshot = buildPublishedSnapshotFromDraft(applied.draft, { generatedAt: NOW });

  assert.equal(draftDelete.action, 'remove');
  assert.equal(retire.action, 'retire');
  assert.equal(candidate.validation.ok, true);
  assert.equal(retiredAlpha.active, false);
  assert.equal(retiredAlpha.retired, true);
  assert.equal(retiredAlpha.retirement.reason, 'Retired by test.');
  assert.equal(snapshot.words.some((word) => word.slug === 'alpha'), false);
  assert.equal(snapshot.words.some((word) => word.slug === 'beta'), true);
});

test('spelling sentence editor builder creates stable-id sentence upsert operations', () => {
  const bundle = contentBundle();
  const operation = buildSpellingSentenceUpsertOperation({
    id: 'alpha-s3',
    wordSlug: 'alpha',
    text: 'A third alpha sentence gives editors another dictation choice.',
    variantLabel: 'default',
    tags: 'dictation, core',
    sourceNote: 'Added in Content Operations Centre.',
    provenance: { source: 'admin-editor', note: 'T11 sentence test' },
  }, {
    words: bundle.draft.words,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [operation]);

  assert.equal(operation.entityType, 'spelling.sentenceEntry');
  assert.equal(operation.action, 'upsert');
  assert.equal(operation.entityId, 'alpha-s3');
  assert.deepEqual(operation.payload.tags, ['dictation', 'core']);
  assert.equal(candidate.validation.ok, true);
  assert.equal(
    candidate.candidate.draft.sentences.find((sentence) => sentence.id === 'alpha-s3').text,
    'A third alpha sentence gives editors another dictation choice.',
  );
});

test('spelling sentence editor validation blocks missing text, owner, and provenance', () => {
  const bundle = contentBundle();
  const result = validateSpellingSentenceEditorInput({
    id: 'alpha-s4',
    wordSlug: 'missing-word',
    text: '',
  }, {
    words: bundle.draft.words,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.field === 'wordSlug'));
  assert.ok(result.errors.some((entry) => entry.field === 'text'));
  assert.ok(result.errors.some((entry) => entry.field === 'provenance'));
});

test('spelling sentence delete-or-retire operation removes drafts and blocks retiring active references', () => {
  const bundle = contentBundle();
  const draftDelete = buildSpellingSentenceDeleteOrRetireOperation({ id: 'draft-sentence' });
  const retire = buildSpellingSentenceDeleteOrRetireOperation({ id: 'alpha-s1', hasCurrent: true }, {
    reason: 'Retired by test.',
    now: () => NOW,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [retire]);
  const retiredSentence = candidate.candidate.draft.sentences.find((sentence) => sentence.id === 'alpha-s1');

  assert.equal(draftDelete.action, 'remove');
  assert.equal(retire.action, 'retire');
  assert.equal(retiredSentence.active, false);
  assert.equal(retiredSentence.retired, true);
  assert.equal(retiredSentence.retirement.reason, 'Retired by test.');
  assert.equal(candidate.validation.ok, false);
  assert.ok(candidate.validation.errors.some((entry) => entry.code === 'retired_sentence_reference'));
});

test('spelling word-list editor builder manages list metadata and membership without sentence text', () => {
  const bundle = contentBundle();
  const operation = buildSpellingWordListUpsertOperation({
    id: 'extra-greek',
    title: 'Extra Greek roots revised',
    spellingPool: 'extra',
    coverageTier: 'enrichment-extra',
    wordSlugs: 'metamorphosis',
    tags: 'roots, enrichment',
    sourceNote: 'Edited in Content Operations Centre.',
    provenance: { source: 'admin-editor', note: 'T11 list test' },
  }, {
    existingWordList: bundle.draft.wordLists.find((list) => list.id === 'extra-greek'),
    words: bundle.draft.words,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [operation]);
  const list = candidate.candidate.draft.wordLists.find((entry) => entry.id === 'extra-greek');

  assert.equal(operation.entityType, 'spelling.wordList');
  assert.equal(operation.action, 'upsert');
  assert.deepEqual(operation.payload.wordSlugs, ['metamorphosis']);
  assert.equal(Object.prototype.hasOwnProperty.call(operation.payload, 'sentences'), false);
  assert.equal(candidate.validation.ok, true);
  assert.equal(list.title, 'Extra Greek roots revised');
});

test('spelling word-list editor validation blocks missing metadata and invalid membership', () => {
  const bundle = contentBundle();
  const result = validateSpellingWordListEditorInput({
    id: 'core-empty',
    title: '',
    spellingPool: 'core',
    coverageTier: 'statutory-core',
    wordSlugs: 'missing-word',
  }, {
    words: bundle.draft.words,
  });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.field === 'title'));
  assert.ok(result.errors.some((entry) => entry.field === 'yearGroups'));
  assert.ok(result.errors.some((entry) => entry.field === 'wordSlugs'));
  assert.ok(result.errors.some((entry) => entry.field === 'provenance'));
});

test('spelling word-list delete-or-retire operation removes drafts and blocks retiring active lists', () => {
  const bundle = contentBundle();
  const draftDelete = buildSpellingWordListDeleteOrRetireOperation({ id: 'draft-list' });
  const retire = buildSpellingWordListDeleteOrRetireOperation({ id: 'core-y34', hasCurrent: true }, {
    reason: 'Retired by test.',
    now: () => NOW,
  });
  const candidate = buildSpellingContentOperationCandidate(bundle, [retire]);
  const retiredList = candidate.candidate.draft.wordLists.find((list) => list.id === 'core-y34');

  assert.equal(draftDelete.action, 'remove');
  assert.equal(retire.action, 'retire');
  assert.equal(retiredList.active, false);
  assert.equal(retiredList.retired, true);
  assert.equal(retiredList.retirement.reason, 'Retired by test.');
  assert.equal(candidate.validation.ok, false);
  assert.ok(candidate.validation.errors.some((entry) => entry.code === 'retired_word_list_reference'));
});
