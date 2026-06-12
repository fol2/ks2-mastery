import test from 'node:test';
import assert from 'node:assert/strict';

import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { cloneSerialisable } from '../src/platform/core/repositories/helpers.js';
import { uid } from '../src/platform/core/utils.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createLocalSpellingContentRepository } from '../src/subjects/spelling/content/repository.js';
import { createSpellingContentService } from '../src/subjects/spelling/content/service.js';
import {
  SPELLING_CONTENT_MODEL_VERSION,
  buildSpellingContentSummary,
  extractPortableSpellingContent,
  publishSpellingContentBundle,
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  SPELLING_COVERAGE_TIER,
  isEnrichmentExtraWord,
  isStatutoryCoreWord,
  normaliseCoverageTier,
} from '../src/subjects/spelling/content/taxonomy.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';
import { coreOnlyVersionOneContent } from './helpers/spelling-content.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

function makeTts() {
  return {
    speak() {},
    stop() {},
    warmup() {},
  };
}

function addDraftOnlyWord(bundle) {
  const next = cloneSerialisable(bundle);
  next.draft.words.push({
    slug: 'draftonly',
    word: 'draftonly',
    family: 'draftonly',
    listId: 'statutory-y3-4',
    yearGroups: ['Y3', 'Y4'],
    // P2 U10: `exception-word` tag satisfies the pattern-coverage validator
    // for a made-up test word that does not fit any KS2 pattern.
    tags: ['draft-only', 'exception-word'],
    accepted: ['draftonly'],
    explanation: 'Draftonly is a test spelling word used only by content tests.',
    sentenceEntryIds: ['draftonly__01'],
    sourceNote: 'Draft-only test word',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.sentences.push({
    id: 'draftonly__01',
    wordSlug: 'draftonly',
    text: 'The draftonly word exists only in the draft.',
    variantLabel: 'baseline',
    tags: ['draft-only'],
    sourceNote: 'Draft-only test sentence',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.wordLists[0].wordSlugs.push('draftonly');
  return next;
}

function addExtraWordList(bundle, { wordSpellingPool } = {}) {
  const next = cloneSerialisable(bundle);
  const listId = 'extra-test-science';
  next.draft.wordLists.push({
    id: listId,
    title: 'Extra test science',
    spellingPool: 'extra',
    yearGroups: [],
    tags: ['extra', 'science'],
    wordSlugs: ['cephalopod'],
    sourceNote: 'Extra pool test list',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.words.push({
    slug: 'cephalopod',
    word: 'cephalopod',
    family: 'Science: cephalopods',
    listId,
    ...(wordSpellingPool ? { spellingPool: wordSpellingPool } : {}),
    yearGroups: wordSpellingPool === 'core' ? ['Y3', 'Y4'] : [],
    tags: ['extra', 'science'],
    accepted: ['cephalopod'],
    explanation: 'A cephalopod is a sea animal such as an octopus or squid.',
    sentenceEntryIds: ['cephalopod__01'],
    sourceNote: 'Extra pool test word',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.sentences.push({
    id: 'cephalopod__01',
    wordSlug: 'cephalopod',
    text: 'An octopus is a cephalopod with eight arms.',
    variantLabel: 'baseline',
    tags: ['extra', 'science'],
    sourceNote: 'Extra pool test sentence',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  return next;
}

function addSecureExtensionWordList(bundle) {
  const next = cloneSerialisable(bundle);
  const listId = 'secure-extension-test-vocabulary';
  next.draft.wordLists.push({
    id: listId,
    title: 'Secure extension test vocabulary',
    spellingPool: 'core',
    coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
    yearGroups: ['Y5', 'Y6'],
    tags: ['secure-extension', 'test'],
    wordSlugs: ['cartographytest'],
    sourceNote: 'Secure-extension test list',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.words.push({
    slug: 'cartographytest',
    word: 'cartographytest',
    family: 'Maps and navigation',
    listId,
    spellingPool: 'core',
    coverageTier: SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
    yearGroups: ['Y5', 'Y6'],
    tags: ['secure-extension', 'occupation'],
    accepted: ['cartographytest'],
    explanation: 'Cartographytest is a secure-extension fixture word used only by content tests.',
    sentenceEntryIds: ['cartographytest__01'],
    sourceNote: 'Secure-extension test word',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  next.draft.sentences.push({
    id: 'cartographytest__01',
    wordSlug: 'cartographytest',
    text: 'The cartographytest word checks secure vocabulary without colliding with production content.',
    variantLabel: 'baseline',
    tags: ['secure-extension'],
    sourceNote: 'Secure-extension test sentence',
    provenance: { source: 'tests', note: 'Added inside tests.' },
    sortIndex: 9999,
  });
  return next;
}

function ensureLearner(repositories) {
  const snapshot = repositories.learners.read();
  if (snapshot?.selectedId) return snapshot.selectedId;

  const learnerId = uid('learner');
  repositories.learners.write({
    byId: {
      [learnerId]: {
        id: learnerId,
        name: 'Learner 1',
        yearGroup: 'Y5',
        avatarColor: '#3E6FA8',
        goal: 'sats',
        dailyMinutes: 15,
        weakSubjects: [],
        createdAt: Date.now(),
      },
    },
    allIds: [learnerId],
    selectedId: learnerId,
  });

  return learnerId;
}

function stripWordExplanations(bundle) {
  const next = cloneSerialisable(bundle);
  next.draft.words = next.draft.words.map(({ explanation: _explanation, ...word }) => word);
  next.releases = next.releases.map((release) => {
    const words = release.snapshot.words.map(({ explanation: _explanation, ...word }) => word);
    return {
      ...release,
      snapshot: {
        ...release.snapshot,
        words,
        wordBySlug: Object.fromEntries(words.map((word) => [word.slug, word])),
      },
    };
  });
  return next;
}

test('seeded spelling content validates and round-trips through the portable export format', () => {
  const storage = installMemoryStorage();
  const repository = createLocalSpellingContentRepository({ storage });
  const content = createSpellingContentService({ repository });

  const validation = content.validate();
  assert.equal(validation.ok, true);
  assert.equal(validation.bundle.modelVersion, SPELLING_CONTENT_MODEL_VERSION);
  assert.equal(SPELLING_CONTENT_MODEL_VERSION, 10, 'Spelling content model keeps the even-version convention.');
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.bundle.releases.length, 7);
  assert.equal(validation.bundle.publication.publishedVersion, 7);
  assert.ok(validation.bundle.draft.wordLists
    .filter((list) => list.id.startsWith('statutory-'))
    .every((list) => list.spellingPool === 'core'));
  assert.ok(validation.bundle.draft.wordLists
    .filter((list) => list.id.startsWith('statutory-'))
    .every((list) => list.coverageTier === SPELLING_COVERAGE_TIER.STATUTORY_CORE));
  assert.ok(validation.bundle.draft.words
    .filter((word) => word.listId.startsWith('statutory-'))
    .every((word) => word.spellingPool === 'core'));
  assert.ok(validation.bundle.draft.words
    .filter((word) => word.listId.startsWith('statutory-'))
    .every((word) => word.coverageTier === SPELLING_COVERAGE_TIER.STATUTORY_CORE));
  assert.ok(validation.bundle.releases[0].snapshot.words.every((word) => word.spellingPool === 'core'));
  assert.ok(validation.bundle.releases[0].snapshot.words.every(isStatutoryCoreWord));
  assert.ok(validation.bundle.draft.words.every((word) => word.explanation));
  assert.ok(validation.bundle.releases.at(-1).snapshot.words.every((word) => word.explanation));
  const summary = buildSpellingContentSummary(validation.bundle);
  assert.equal(summary.statutoryCoreCount, 213);
  assert.equal(summary.secureExtensionCount, 1215);
  assert.equal(summary.enrichmentExtraCount, 52);

  // P2 U10: every core word carries a patternIds field AND either at least
  // one registered patternId OR the exception-word / statutory-exception tag.
  const coreWords = validation.bundle.draft.words.filter(isStatutoryCoreWord);
  assert.ok(coreWords.length > 0);
  assert.ok(coreWords.every((word) => Array.isArray(word.patternIds)));
  assert.ok(coreWords.every((word) => {
    const hasPatternId = word.patternIds.length > 0;
    const exceptionTag = word.tags.includes('exception-word') || word.tags.includes('statutory-exception');
    return hasPatternId || exceptionTag;
  }));
  // Runtime snapshot preserves patternIds so U11 selection can read them.
  const runtimeCoreWords = validation.bundle.releases.at(-1).snapshot.words
    .filter(isStatutoryCoreWord);
  assert.ok(runtimeCoreWords.every((word) => Array.isArray(word.patternIds)));

  const exported = content.exportPortable();
  const roundTripped = extractPortableSpellingContent(exported);
  assert.equal(roundTripped.draft.words.length, validation.bundle.draft.words.length);
  assert.equal(roundTripped.releases.at(-1).version, 7);
});

test('seeded spelling content includes the Extra expansion and current word-family variants', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  assert.equal(validation.ok, true);
  const jamesRequestedExtraWords = [
    'roughest',
    'leadership',
    'quietest',
    'sponsorship',
    'partnership',
    'lightest',
    'brightest',
    'membership',
    'ownership',
    'hardship',
    'championship',
    'admission',
    'aggression',
    'compassion',
    'confession',
    'mission',
    'permission',
    'progression',
    'procession',
  ];

  const extraList = validation.bundle.draft.wordLists.find((list) => list.id === 'extra-science-word-building');
  assert.ok(extraList);
  assert.equal(extraList.spellingPool, 'extra');
  assert.equal(extraList.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.deepEqual(extraList.yearGroups, []);
  assert.equal(extraList.wordSlugs.length, 33);

  const suffixList = validation.bundle.draft.wordLists.find((list) => list.id === 'extra-suffix-word-building-2026-05-20');
  assert.ok(suffixList);
  assert.equal(suffixList.spellingPool, 'extra');
  assert.equal(suffixList.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.deepEqual(suffixList.yearGroups, []);
  assert.deepEqual(suffixList.wordSlugs, jamesRequestedExtraWords);

  const extraWords = validation.bundle.draft.words.filter((word) => word.spellingPool === 'extra');
  assert.equal(extraWords.length, 52);
  assert.ok(extraWords.every(isEnrichmentExtraWord));
  assert.ok(jamesRequestedExtraWords.every((slug) => {
    const draftWord = validation.bundle.draft.words.find((word) => word.slug === slug);
    return draftWord?.spellingPool === 'extra'
      && draftWord?.coverageTier === SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA
      && draftWord?.yearGroups.length === 0
      && draftWord?.accepted.includes(slug)
      && draftWord?.explanation
      && draftWord?.sentenceEntryIds.length > 0;
  }));

  const baselineRelease = validation.bundle.releases[0];
  const currentRelease = validation.bundle.releases.at(-1);
  assert.equal(validation.bundle.publication.currentReleaseId, currentRelease.id);
  assert.equal(baselineRelease.snapshot.wordBySlug.mollusc, undefined);
  assert.ok(jamesRequestedExtraWords.every((slug) => {
    const runtimeWord = currentRelease.snapshot.wordBySlug[slug];
    return runtimeWord?.spellingPool === 'extra'
      && runtimeWord?.coverageTier === SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA
      && runtimeWord?.year === 'extra'
      && runtimeWord?.yearLabel === 'Extra';
  }));

  const runtimeWord = currentRelease.snapshot.wordBySlug.mollusc;
  assert.equal(runtimeWord.word, 'mollusc');
  assert.equal(runtimeWord.spellingPool, 'extra');
  assert.equal(runtimeWord.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.equal(runtimeWord.year, 'extra');
  assert.deepEqual(runtimeWord.accepted, ['mollusc']);
  assert.equal(runtimeWord.accepted.includes('mollusk'), false);
  const vertebrates = currentRelease.snapshot.wordBySlug.vertebrates;
  assert.equal(vertebrates.word, 'vertebrates');
  assert.deepEqual(vertebrates.familyWords, ['vertebrates', 'invertebrates']);
  assert.equal(vertebrates.variants[0].word, 'invertebrates');
  assert.equal(vertebrates.variants[0].sentence, 'Worms and insects are invertebrates without a backbone.');

  const divide = currentRelease.snapshot.wordBySlug.divide;
  assert.deepEqual(divide.familyWords, ['divide', 'division', 'divisible']);
  assert.equal(divide.variants[0].word, 'division');
  assert.deepEqual(divide.variants[0].accepted, ['division']);
  assert.equal(divide.variants[0].explanation, 'Division is the act of splitting something into parts or groups.');
  assert.equal(divide.variants[0].sentence, 'The division of the class into teams was fair.');
  assert.equal(divide.variants[1].word, 'divisible');
  assert.equal(divide.variants[1].explanation, 'Divisible means able to be divided exactly by a number.');
  const science = currentRelease.snapshot.wordBySlug.science;
  assert.equal(science.word, 'science');
  assert.equal(science.spellingPool, 'extra');
  assert.equal(science.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.ok(science.tags.includes('silent-c'));
  assert.deepEqual(science.familyWords, ['science', 'scientist', 'scientific']);
  assert.equal(science.variants[0].sentence, 'The scientist recorded the results carefully.');
  const school = currentRelease.snapshot.wordBySlug.school;
  assert.ok(school.tags.includes('hard-ch'));
  assert.deepEqual(school.familyWords, ['school', 'schooling', 'schoolwork']);
  const currentExtraWords = currentRelease.snapshot.words.filter((word) => word.spellingPool === 'extra');
  const variantCount = currentExtraWords.reduce((total, word) => total + (word.variants?.length || 0), 0);
  assert.equal(currentRelease.snapshot.words.filter((word) => word.spellingPool === 'extra').length, 52);
  assert.equal(variantCount, 50);
  assert.ok(currentExtraWords.every((word) => (word.variants || []).every((variant) => variant.explanation && variant.sentence)));
});

test('extra spelling pool validates without statutory year groups and publishes as Extra runtime words', () => {
  const bundle = addExtraWordList(SEEDED_SPELLING_CONTENT_BUNDLE);
  const validation = validateSpellingContentBundle(bundle);

  assert.equal(validation.ok, true);
  const extraList = validation.bundle.draft.wordLists.find((list) => list.id === 'extra-test-science');
  const extraWord = validation.bundle.draft.words.find((word) => word.slug === 'cephalopod');
  assert.equal(extraList.spellingPool, 'extra');
  assert.equal(extraList.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.deepEqual(extraList.yearGroups, []);
  assert.equal(extraWord.spellingPool, 'extra');
  assert.equal(extraWord.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.deepEqual(extraWord.yearGroups, []);

  const published = publishSpellingContentBundle(bundle, {
    notes: 'Publish Extra pool test word.',
    publishedAt: 23456,
  });
  const runtimeWord = published.releases.at(-1).snapshot.wordBySlug.cephalopod;

  assert.equal(runtimeWord.spellingPool, 'extra');
  assert.equal(runtimeWord.coverageTier, SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA);
  assert.equal(runtimeWord.year, 'extra');
  assert.equal(runtimeWord.yearLabel, 'Extra');
  assert.deepEqual(runtimeWord.yearGroups, []);
  assert.deepEqual(runtimeWord.accepted, ['cephalopod']);
  assert.deepEqual(runtimeWord.familyWords, ['cephalopod']);
});

test('validation catches spelling-pool mismatches between word lists and words', () => {
  const broken = addExtraWordList(SEEDED_SPELLING_CONTENT_BUNDLE, { wordSpellingPool: 'core' });

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === 'pool_mismatch'));
});

test('secure-extension content stays separate from statutory-core and publishes with its coverage tier', () => {
  const bundle = addSecureExtensionWordList(SEEDED_SPELLING_CONTENT_BUNDLE);
  const validation = validateSpellingContentBundle(bundle);

  assert.equal(validation.ok, true);
  const secureList = validation.bundle.draft.wordLists.find((list) => list.id === 'secure-extension-test-vocabulary');
  const secureWord = validation.bundle.draft.words.find((word) => word.slug === 'cartographytest');
  assert.equal(secureList.spellingPool, 'core');
  assert.equal(secureList.coverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION);
  assert.equal(secureWord.spellingPool, 'core');
  assert.equal(secureWord.coverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION);

  const published = publishSpellingContentBundle(bundle, {
    notes: 'Publish secure-extension taxonomy test word.',
    publishedAt: 34567,
  });
  const runtimeWord = published.releases.at(-1).snapshot.wordBySlug.cartographytest;
  assert.equal(runtimeWord.spellingPool, 'core');
  assert.equal(runtimeWord.coverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION);

  const summary = buildSpellingContentSummary(published);
  assert.equal(summary.statutoryCoreCount, 213);
  assert.equal(summary.secureExtensionCount, 1216);
  assert.equal(summary.enrichmentExtraCount, 52);
});

test('published word-family variants do not cross coverage tiers', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);
  assert.equal(validation.ok, true);
  const snapshot = validation.bundle.releases.at(-1).snapshot;
  const statutoryCertain = snapshot.wordBySlug.certain;
  const secureCertainly = snapshot.wordBySlug.certainly;

  assert.equal(statutoryCertain.coverageTier, SPELLING_COVERAGE_TIER.STATUTORY_CORE);
  assert.equal(secureCertainly.coverageTier, SPELLING_COVERAGE_TIER.SECURE_EXTENSION);
  assert.equal(statutoryCertain.family, secureCertainly.family);
  assert.deepEqual(statutoryCertain.familyWords, ['certain']);
  assert.equal(secureCertainly.familyWords.includes('certain'), false);
  assert.equal(secureCertainly.familyWords.includes('certainly'), true);
});

test('coverage-tier normalisation accepts approved-source tier aliases', () => {
  assert.equal(
    normaliseCoverageTier('secure_extension_candidate', { spellingPool: 'core' }),
    SPELLING_COVERAGE_TIER.SECURE_EXTENSION,
  );
  assert.equal(
    normaliseCoverageTier('current_statutory_core', { spellingPool: 'extra' }),
    SPELLING_COVERAGE_TIER.STATUTORY_CORE,
  );
  assert.equal(
    normaliseCoverageTier('current_extra', { spellingPool: 'core' }),
    SPELLING_COVERAGE_TIER.ENRICHMENT_EXTRA,
  );
});

test('validation catches coverage-tier mismatches between word lists and words', () => {
  const broken = addExtraWordList(SEEDED_SPELLING_CONTENT_BUNDLE);
  broken.draft.wordLists.find((list) => list.id === 'extra-test-science').coverageTier = SPELLING_COVERAGE_TIER.SECURE_EXTENSION;

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === 'coverage_tier_mismatch'));
});

test('validation keeps word-family variants out of the core pool', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  const coreWord = broken.draft.words.find((word) => word.slug === 'possess');
  coreWord.variants = [{
    word: 'possession',
    accepted: ['possession'],
    explanation: 'A possession is something that belongs to someone.',
    sentenceEntryIds: coreWord.sentenceEntryIds.slice(0, 1),
  }];

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === 'core_variants_not_supported'));
});

test('validation catches duplicate words and broken sentence references', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  broken.draft.words.push(cloneSerialisable(broken.draft.words[0]));
  broken.draft.sentences[0].wordSlug = 'missing-word';

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === 'duplicate_word'));
  assert.ok(validation.errors.some((issue) => issue.code === 'broken_sentence_reference'));
});

test('validation catches invalid publish state pointers', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  broken.releases[0].state = 'draft';
  broken.publication.currentReleaseId = 'missing-release';

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((issue) => issue.code === 'invalid_publish_state'));
});

test('validation requires learner-facing word explanations in draft and published snapshots', () => {
  const broken = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
  broken.draft.words[0].explanation = '';
  broken.releases[0].snapshot.words[0].explanation = '';
  broken.draft.words.find((word) => word.slug === 'divide').variants[0].explanation = '';
  broken.releases.at(-1).snapshot.wordBySlug.divide.variants[0].explanation = '';
  broken.releases.at(-1).snapshot.words.find((word) => word.slug === 'divide').variants[0].explanation = '';

  const validation = validateSpellingContentBundle(broken);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.filter((issue) => issue.code === 'missing_word_explanation').length, 4);
  assert.ok(validation.errors.some((issue) => issue.path === 'draft.words[0].explanation'));
  assert.ok(validation.errors.some((issue) => issue.path === 'releases[0].snapshot.words[0].explanation'));
  assert.ok(validation.errors.some((issue) => issue.path.includes('variants[0].explanation')));
});

test('content service backfills seeded explanations for legacy stored bundles', () => {
  let stored = stripWordExplanations(SEEDED_SPELLING_CONTENT_BUNDLE);
  const repository = {
    read() {
      return cloneSerialisable(stored);
    },
    write(bundle) {
      stored = cloneSerialisable(bundle);
      return cloneSerialisable(stored);
    },
    clear() {
      stored = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
      return cloneSerialisable(stored);
    },
  };
  const content = createSpellingContentService({ repository });
  const bundle = content.readBundle();
  const draftWord = bundle.draft.words.find((word) => word.slug === 'possess');
  const runtimeWord = content.getRuntimeSnapshot().wordBySlug.possess;

  assert.equal(draftWord.explanation, 'To possess something means to own it or have it.');
  assert.equal(runtimeWord.explanation, 'To possess something means to own it or have it.');
  assert.equal(content.validate().ok, true);
});

test('content service supplements legacy published runtime with seeded release additions', () => {
  let stored = coreOnlyVersionOneContent(SEEDED_SPELLING_CONTENT_BUNDLE);
  const repository = {
    read() {
      return cloneSerialisable(stored);
    },
    write(bundle) {
      stored = cloneSerialisable(bundle);
      return cloneSerialisable(stored);
    },
    clear() {
      stored = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
      return cloneSerialisable(stored);
    },
  };
  const content = createSpellingContentService({ repository });
  const snapshot = content.getRuntimeSnapshot();

  assert.equal(content.readBundle().publication.publishedVersion, 1);
  assert.equal(snapshot.words.filter((word) => word.spellingPool === 'extra').length, 52);
  assert.equal(snapshot.wordBySlug.mollusc.spellingPool, 'extra');
  assert.ok(snapshot.rewardTracks.some((track) => track.id === 'spelling-extra-vellhorn'));

  stored.releases[0].version = SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion + 1;
  stored.releases[0].publishedAt = 1;
  stored.publication.publishedVersion = stored.releases[0].version;
  stored.publication.updatedAt = 1;
  const higherLocalVersionSnapshot = content.getRuntimeSnapshot();

  assert.equal(content.readBundle().publication.publishedVersion, SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion + 1);
  assert.equal(higherLocalVersionSnapshot.words.filter((word) => word.spellingPool === 'extra').length, 52);

  const service = createSpellingService({
    tts: makeTts(),
    contentSnapshot: higherLocalVersionSnapshot,
  });
  const transition = service.startSession('learner-a', {
    mode: 'smart',
    yearFilter: 'extra',
    length: 10,
  });

  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.progress.total, 10);
  assert.ok(transition.state.session.uniqueWords.every((slug) => higherLocalVersionSnapshot.wordBySlug[slug].spellingPool === 'extra'));
});

test('content service respects newer published account content that omits seeded additions', () => {
  let stored = coreOnlyVersionOneContent(SEEDED_SPELLING_CONTENT_BUNDLE);
  const currentSeedRelease = SEEDED_SPELLING_CONTENT_BUNDLE.releases.at(-1);
  stored.releases[0].version = currentSeedRelease.version + 1;
  stored.releases[0].publishedAt = currentSeedRelease.publishedAt + 1;
  stored.publication.publishedVersion = stored.releases[0].version;
  stored.publication.updatedAt = stored.releases[0].publishedAt;
  const repository = {
    read() {
      return cloneSerialisable(stored);
    },
    write(bundle) {
      stored = cloneSerialisable(bundle);
      return cloneSerialisable(stored);
    },
    clear() {
      stored = cloneSerialisable(SEEDED_SPELLING_CONTENT_BUNDLE);
      return cloneSerialisable(stored);
    },
  };
  const content = createSpellingContentService({ repository });
  const snapshot = content.getRuntimeSnapshot();

  assert.equal(snapshot.words.filter((word) => word.spellingPool === 'extra').length, 0);
});

test('runtime stays pinned to the published spelling release until a new draft is published', async () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  await repositories.hydrate();

  const contentRepository = createLocalSpellingContentRepository({ storage });
  const content = createSpellingContentService({ repository: contentRepository });
  const learnerId = ensureLearner(repositories);

  const draftOnlyBundle = addDraftOnlyWord(content.readBundle());
  await content.writeBundle(draftOnlyBundle);

  let service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: makeTts(),
    contentSnapshot: content.getRuntimeSnapshot(),
  });

  let transition = service.startSession(learnerId, {
    mode: 'single',
    words: ['draftonly'],
    yearFilter: 'all',
    length: 1,
  });
  assert.equal(transition.ok, false);
  assert.match(transition.state.error, /Could not start a spelling session/);

  transition = service.startSession(learnerId, {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.currentCard.word.slug, 'possess');

  await content.publishDraft({ notes: 'Publish the draft-only word for runtime use.' });
  service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: makeTts(),
    contentSnapshot: content.getRuntimeSnapshot(),
  });

  transition = service.startSession(learnerId, {
    mode: 'single',
    words: ['draftonly'],
    yearFilter: 'all',
    length: 1,
  });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.currentCard.word.slug, 'draftonly');
  assert.equal(content.getSummary().publishedVersion, SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion + 1);
});

test('publishing a valid spelling draft increments release versions and updates the publication pointer', () => {
  const currentReleaseCount = SEEDED_SPELLING_CONTENT_BUNDLE.releases.length;
  const currentVersion = SEEDED_SPELLING_CONTENT_BUNDLE.publication.publishedVersion;
  const published = publishSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE, {
    notes: 'Regression publish test.',
    publishedAt: 12345,
  });

  assert.equal(published.releases.length, currentReleaseCount + 1);
  assert.equal(published.publication.currentReleaseId, `spelling-r${currentVersion + 1}`);
  assert.equal(published.publication.publishedVersion, currentVersion + 1);
  assert.equal(published.releases.at(-1).snapshot.words.length, SEEDED_SPELLING_CONTENT_BUNDLE.releases.at(-1).snapshot.words.length);
  assert.deepEqual(
    published.releases.at(-1).snapshot.pools.map((pool) => pool.id),
    ['core', 'extra'],
  );
  assert.ok(published.releases.at(-1).snapshot.rewardTracks.some((track) => track.id === 'spelling-extra-vellhorn'));
});
