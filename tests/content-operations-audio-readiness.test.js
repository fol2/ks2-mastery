import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELLING_AUDIO_MODEL,
  buildAudioAssetKey,
} from '../shared/spelling-audio.js';
import {
  computeSpellingSentenceAudioContentKey,
  scanSpellingAudioReadiness,
} from '../src/subjects/spelling/content/audio-readiness.js';

function spellingBundle() {
  return {
    draft: {
      pools: [{
        id: 'core',
        title: 'Core',
        type: 'statutory',
        visibility: { state: 'visible', learnerVisible: true },
        sourceNote: 'Test source.',
        provenance: { source: 'test', note: 'test', importedAt: 1 },
        sortIndex: 0,
      }],
      wordLists: [{
        id: 'core-list',
        title: 'Core list',
        spellingPool: 'core',
        coverageTier: 'statutory-core',
        yearGroups: ['Y3', 'Y4'],
        wordSlugs: ['early'],
        sourceNote: 'Test source.',
        provenance: { source: 'test', note: 'test', importedAt: 1 },
        sortIndex: 0,
      }],
      words: [{
        slug: 'early',
        word: 'early',
        family: 'early',
        listId: 'core-list',
        spellingPool: 'core',
        coverageTier: 'statutory-core',
        yearGroups: ['Y3', 'Y4'],
        accepted: ['early'],
        explanation: 'A time word meaning before the expected time.',
        sentenceEntryIds: ['early-base'],
        variants: [{
          word: 'earlier',
          accepted: ['earlier'],
          explanation: 'A related form for comparisons of time.',
          sentenceEntryIds: ['early-variant'],
          progressKey: 'earlier',
          sourceNote: 'Test source.',
          provenance: { source: 'test', note: 'test', importedAt: 1 },
        }],
        sourceNote: 'Test source.',
        provenance: { source: 'test', note: 'test', importedAt: 1 },
        progressKey: 'early',
        sortIndex: 0,
      }],
      sentences: [{
        id: 'early-base',
        wordSlug: 'early',
        text: 'The early train arrived before sunrise.',
        variantLabel: 'base',
        sourceNote: 'Test source.',
        provenance: { source: 'test', note: 'test', importedAt: 1 },
        sortIndex: 0,
      }, {
        id: 'early-variant',
        wordSlug: 'early',
        text: 'The earlier bus stopped outside school.',
        variantLabel: 'variant',
        sourceNote: 'Test source.',
        provenance: { source: 'test', note: 'test', importedAt: 1 },
        sortIndex: 1,
      }],
      updatedAt: 1,
    },
    releases: [],
    publication: { currentReleaseId: '' },
  };
}

test('audio readiness scanner plans word, variant, and sentence profiles with strict missing blockers', async () => {
  const scan = await scanSpellingAudioReadiness(spellingBundle(), { scope: 'all' });

  assert.equal(scan.status, 'blocked');
  assert.equal(scan.modelId, SPELLING_AUDIO_MODEL);
  assert.deepEqual(scan.profile.wordProfiles.map((entry) => entry.profileId), ['male.natural', 'female.natural']);
  assert.deepEqual(scan.profile.sentenceProfiles.map((entry) => entry.profileId), [
    'male.normal',
    'male.slow',
    'female.normal',
    'female.slow',
  ]);
  assert.equal(scan.lanes.word.totalRequired, 4);
  assert.equal(scan.lanes.sentence.totalRequired, 8);
  assert.equal(scan.totalRequired, 12);
  assert.ok(scan.blockers.includes('word_audio_missing'));
  assert.ok(scan.blockers.includes('sentence_audio_missing'));

  const variantSentence = scan.items.find((item) => (
    item.lane === 'sentence'
    && item.surface === 'variant'
    && item.profileId === 'female.slow'
  ));
  assert.ok(variantSentence);
  assert.equal(variantSentence.variantWord, 'earlier');
  assert.equal(variantSentence.sentenceId, 'early-variant');
  assert.equal(variantSentence.sentenceIndex, 0);
});

test('audio readiness scanner marks inventory hits present and same-scope old content keys stale', async () => {
  const baseline = await scanSpellingAudioReadiness(spellingBundle(), { scope: 'all' });
  const presentItem = baseline.items.find((item) => item.lane === 'word' && item.profileId === 'male.natural');
  const staleTarget = baseline.items.find((item) => item.lane === 'sentence' && item.profileId === 'male.normal');
  const staleKey = buildAudioAssetKey({
    model: staleTarget.modelId,
    voice: staleTarget.voiceId,
    speed: staleTarget.speedId,
    contentKey: 'old-content-key',
    slug: staleTarget.slug,
    sentenceIndex: staleTarget.sentenceIndex,
  });

  const scan = await scanSpellingAudioReadiness(spellingBundle(), {
    scope: 'all',
    inventory: [presentItem.r2Key, staleKey],
  });

  const present = scan.items.find((item) => item.itemId === presentItem.itemId);
  const stale = scan.items.find((item) => item.itemId === staleTarget.itemId);
  assert.equal(present.status, 'present');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.staleContentKey, 'old-content-key');
  assert.ok(scan.blockers.includes('sentence_audio_stale'));
});

test('audio readiness scanner consumes package audio jobs for generated, failed, skipped, and override states', async () => {
  const baseline = await scanSpellingAudioReadiness(spellingBundle(), { scope: 'all' });
  const [generated, failed, skipped, override] = baseline.items
    .filter((item) => item.lane === 'word')
    .slice(0, 4);

  const scan = await scanSpellingAudioReadiness(spellingBundle(), {
    scope: 'all',
    jobs: [
      { ...generated, status: 'generated', r2Key: generated.r2Key },
      { ...failed, status: 'failed', r2Key: failed.r2Key, error: { message: 'Provider failed.' } },
      { ...skipped, status: 'skipped', r2Key: skipped.r2Key },
      { ...override, status: 'override_requested', r2Key: override.r2Key },
    ],
  });

  assert.equal(scan.items.find((item) => item.itemId === generated.itemId).status, 'generated');
  assert.equal(scan.items.find((item) => item.itemId === failed.itemId).status, 'failed');
  assert.equal(scan.items.find((item) => item.itemId === skipped.itemId).status, 'skipped');
  assert.equal(scan.items.find((item) => item.itemId === override.itemId).status, 'override_requested');
  assert.ok(scan.blockers.includes('word_audio_not_uploaded'));
  assert.ok(scan.blockers.includes('word_audio_failed'));
  assert.ok(scan.blockers.includes('word_audio_skipped'));
  assert.ok(scan.blockers.includes('word_audio_override_requested'));
});

test('audio readiness affected scope ignores editorial-only word changes but scans sentence text edits', async () => {
  const editorialOnly = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.word',
      entityId: 'early',
      action: 'set',
      fieldPath: 'explanation',
      payload: 'An improved learner-facing explanation.',
    }],
  });
  assert.equal(editorialOnly.status, 'passed');
  assert.equal(editorialOnly.totalRequired, 0);

  const sentenceEdit = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.sentenceEntry',
      entityId: 'early-base',
      action: 'set',
      fieldPath: 'text',
      payload: 'The early train arrived before sunrise.',
    }],
  });
  assert.equal(sentenceEdit.status, 'blocked');
  assert.equal(sentenceEdit.bySlug.early.wordAudioRequired, 0);
  assert.equal(sentenceEdit.bySlug.early.sentenceAudioRequired, 4);
});

test('audio readiness affected scope handles exposure, profile, and nested variant paths', async () => {
  const variantMetadata = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.word',
      entityId: 'early',
      action: 'set',
      fieldPath: 'variants.0.explanation',
      payload: 'A clearer editor-only explanation for this variant.',
    }],
  });
  assert.equal(variantMetadata.status, 'passed');
  assert.equal(variantMetadata.totalRequired, 0);

  const variantWord = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.word',
      entityId: 'early',
      action: 'set',
      fieldPath: 'variants.0.word',
      payload: 'earliest',
    }],
  });
  assert.equal(variantWord.status, 'blocked');
  assert.equal(variantWord.totalRequired, 12);

  const poolExposure = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.pool',
      entityId: 'core',
      action: 'set',
      fieldPath: 'visibility.state',
      payload: 'visible',
    }],
  });
  assert.equal(poolExposure.status, 'blocked');
  assert.equal(poolExposure.totalRequired, 12);

  const mixedExposureAndSentence = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [
      {
        entityType: 'spelling.pool',
        entityId: 'core',
        action: 'set',
        fieldPath: 'visibility.state',
        payload: 'visible',
      },
      {
        entityType: 'spelling.sentenceEntry',
        entityId: 'early-base',
        action: 'set',
        fieldPath: 'text',
        payload: 'The early train arrived before sunrise.',
      },
    ],
  });
  assert.equal(mixedExposureAndSentence.status, 'blocked');
  assert.equal(mixedExposureAndSentence.lanes.word.totalRequired, poolExposure.lanes.word.totalRequired);
  assert.equal(mixedExposureAndSentence.totalRequired, poolExposure.totalRequired);

  const listExposure = await scanSpellingAudioReadiness(spellingBundle(), {
    operations: [{
      entityType: 'spelling.wordList',
      entityId: 'core-list',
      action: 'set',
      fieldPath: 'active',
      payload: true,
    }],
  });
  assert.equal(listExposure.status, 'blocked');
  assert.equal(listExposure.totalRequired, 12);

  const profile = {
    wordProfiles: ['male.natural'],
    sentenceProfiles: ['female.slow'],
  };
  const bundle = spellingBundle();
  bundle.draft.audioRequirementProfile = profile;
  const profileScan = await scanSpellingAudioReadiness(bundle, {
    operations: [{
      entityType: 'spelling.audioRequirementProfile',
      entityId: 'default',
      action: 'replace',
      fieldPath: '',
      payload: profile,
    }],
  });
  assert.equal(profileScan.status, 'blocked');
  assert.deepEqual(profileScan.profile.wordProfiles.map((entry) => entry.profileId), ['male.natural']);
  assert.deepEqual(profileScan.profile.sentenceProfiles.map((entry) => entry.profileId), ['female.slow']);
  assert.equal(profileScan.lanes.word.totalRequired, 2);
  assert.equal(profileScan.lanes.sentence.totalRequired, 2);
  assert.equal(profileScan.totalRequired, 4);
});

test('sentence content key matches the shared R2 key helper for candidate scan items', async () => {
  const scan = await scanSpellingAudioReadiness(spellingBundle(), { scope: 'all' });
  const sentence = scan.items.find((item) => item.lane === 'sentence' && item.profileId === 'male.normal');
  const contentKey = await computeSpellingSentenceAudioContentKey(
    sentence.slug,
    sentence.sentenceIndex,
    sentence.word,
    sentence.sentence,
  );

  assert.equal(sentence.contentKey, contentKey);
  assert.equal(sentence.r2Key, buildAudioAssetKey({
    model: SPELLING_AUDIO_MODEL,
    voice: sentence.voiceId,
    speed: sentence.speedId,
    contentKey,
    slug: sentence.slug,
    sentenceIndex: sentence.sentenceIndex,
  }));
});
