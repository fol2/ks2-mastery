import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseRewardTrackConfig,
  thresholdsForRewardTrack,
} from '../src/platform/game/reward-track-config.js';
import {
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  buildSpellingContentOperationCandidate,
} from '../src/subjects/spelling/content/operations-model.js';
import {
  buildSpellingPoolUpsertOperation,
  buildSpellingRewardTrackUpsertOperation,
  normaliseSpellingPoolEditorInput,
  validateSpellingRewardTrackEditorInput,
} from '../src/subjects/spelling/content/package-operations.js';

const NOW = Date.UTC(2026, 5, 12, 9, 0, 0);

function poolFixture(poolId, {
  title = poolId,
  visibilityState = 'visible',
  rewardTrackIds = [],
  sortIndex = 0,
} = {}) {
  return {
    id: poolId,
    title,
    type: 'extension',
    sourceNote: 'Reward-track test fixture.',
    provenance: { source: 'spelling-reward-tracks-test' },
    visibility: { state: visibilityState },
    ...(rewardTrackIds.length ? { rewardTrackIds } : {}),
    sortIndex,
  };
}

function addWordsForPool(target, poolId, count) {
  const listId = `${poolId}-list`;
  const wordSlugs = [];
  target.wordLists.push({
    id: listId,
    title: `${poolId} list`,
    spellingPool: poolId,
    coverageTier: 'secure-extension',
    yearGroups: [],
    wordSlugs,
    sourceNote: 'Reward-track test word list.',
    provenance: { source: 'spelling-reward-tracks-test' },
    sortIndex: target.wordLists.length,
  });

  for (let index = 0; index < count; index += 1) {
    const slug = `${poolId}-word-${index + 1}`;
    const word = `${poolId.replace(/-/g, '')}word${index + 1}`;
    const sentenceId = `${slug}-s1`;
    wordSlugs.push(slug);
    target.words.push({
      slug,
      word,
      family: `${poolId}-family`,
      listId,
      spellingPool: poolId,
      coverageTier: 'secure-extension',
      yearGroups: [],
      accepted: [word],
      explanation: `${word} has a clear learner-facing explanation for reward validation.`,
      sentenceEntryIds: [sentenceId],
      sourceNote: 'Reward-track test word.',
      provenance: { source: 'spelling-reward-tracks-test' },
      sortIndex: target.words.length,
    });
    target.sentences.push({
      id: sentenceId,
      wordSlug: slug,
      text: `The ${word} example supports reward-track validation.`,
      variantLabel: 'default',
      sourceNote: 'Reward-track test sentence.',
      provenance: { source: 'spelling-reward-tracks-test' },
      sortIndex: target.sentences.length,
    });
  }
}

function rewardBundle({
  pools = [poolFixture('secure-vocabulary', { rewardTrackIds: ['secure-inklet'] })],
  rewardTracks = [{
    id: 'secure-inklet',
    poolId: 'secure-vocabulary',
    monsterId: 'inklet',
    thresholdOverrides: [1],
  }],
  wordCounts = { 'secure-vocabulary': 1 },
} = {}) {
  const draftCollections = {
    wordLists: [],
    words: [],
    sentences: [],
  };
  for (const [poolId, count] of Object.entries(wordCounts)) {
    addWordsForPool(draftCollections, poolId, count);
  }

  return {
    modelVersion: 10,
    subjectId: 'spelling',
    draft: {
      id: 'main',
      state: 'draft',
      version: 1,
      title: 'Reward-track test draft',
      createdAt: NOW,
      updatedAt: NOW,
      pools,
      rewardTracks,
      ...draftCollections,
    },
    releases: [],
    publication: { currentReleaseId: '', publishedVersion: 0, updatedAt: 0 },
  };
}

function errorCodes(validation) {
  return validation.errors.map((entry) => entry.code);
}

test('reward track config defaults to parallel direct progression', () => {
  const track = normaliseRewardTrackConfig({
    id: 'Secure-Inklet',
    poolId: 'Secure-Vocabulary',
    monsterId: 'Inklet',
  });

  assert.equal(track.id, 'secure-inklet');
  assert.equal(track.poolId, 'secure-vocabulary');
  assert.equal(track.monsterId, 'inklet');
  assert.equal(track.progressionMode, 'parallel');
  assert.equal(track.thresholdTemplate, 'direct');
  assert.deepEqual(thresholdsForRewardTrack(track), [1, 10, 30, 60, 100]);
});

test('pool can bind to multiple formal reward tracks through content operations', () => {
  const base = rewardBundle({
    pools: [poolFixture('secure-vocabulary', { visibilityState: 'hidden' })],
    rewardTracks: [],
    wordCounts: { 'secure-vocabulary': 3 },
  });
  const poolWordCounts = new Map([['secure-vocabulary', 3]]);
  const learnerVisiblePoolIds = new Set(['secure-vocabulary']);
  const rewardTrackOptions = {
    pools: base.draft.pools,
    poolWordCounts,
    learnerVisiblePoolIds,
  };

  const firstTrack = buildSpellingRewardTrackUpsertOperation({
    id: 'secure-inklet',
    poolId: 'secure-vocabulary',
    monsterId: 'inklet',
    thresholdOverrides: [1, 2, 3],
    labels: { title: 'Secure Inklet' },
  }, rewardTrackOptions);
  const secondTrack = buildSpellingRewardTrackUpsertOperation({
    id: 'secure-vellhorn',
    poolId: 'secure-vocabulary',
    monsterId: 'vellhorn',
    thresholdOverrides: [1, 2, 3],
    labels: { title: 'Secure Vellhorn' },
  }, rewardTrackOptions);
  const poolUpdate = buildSpellingPoolUpsertOperation({
    ...base.draft.pools[0],
    visibility: { state: 'visible' },
    rewardTrackIds: ['secure-inklet', 'secure-vellhorn'],
  }, { existingPool: base.draft.pools[0] });
  const candidate = buildSpellingContentOperationCandidate(base, [firstTrack, secondTrack, poolUpdate]);

  assert.equal(firstTrack.entityType, 'spelling.rewardTrack');
  assert.equal(secondTrack.payload.progressionMode, 'parallel');
  assert.equal(candidate.validation.ok, true, JSON.stringify(candidate.validation.errors, null, 2));
  assert.deepEqual(
    candidate.validation.bundle.draft.pools.find((pool) => pool.id === 'secure-vocabulary').rewardTrackIds,
    ['secure-inklet', 'secure-vellhorn'],
  );
  assert.equal(candidate.validation.bundle.draft.rewardTracks.length, 2);
});

test('impossible reward thresholds block learner-visible publish', () => {
  const validation = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', { rewardTrackIds: ['secure-inklet'] })],
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1, 2],
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  }));

  assert.equal(validation.ok, false);
  assert.ok(errorCodes(validation).includes('reward_threshold_exceeds_pool_count'));
});

test('impossible reward thresholds block active hidden and staged pools', () => {
  const hidden = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', {
      visibilityState: 'hidden',
      rewardTrackIds: ['secure-inklet'],
    })],
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1, 2],
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  }));
  const staged = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', {
      visibilityState: 'staged',
      rewardTrackIds: ['secure-inklet'],
    })],
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1, 2],
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  }));

  assert.equal(hidden.ok, false);
  assert.equal(staged.ok, false);
  assert.ok(errorCodes(hidden).includes('reward_threshold_exceeds_pool_count'));
  assert.ok(errorCodes(staged).includes('reward_threshold_exceeds_pool_count'));
});

test('dangling pool rewardTrackIds return validation errors instead of throwing', () => {
  const validation = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', { rewardTrackIds: ['missing-track'] })],
    rewardTracks: [],
    wordCounts: { 'secure-vocabulary': 1 },
  }));

  assert.equal(validation.ok, false);
  assert.ok(errorCodes(validation).includes('reward_track_missing'));
});

test('sequential reward-track cycles block publish', () => {
  const validation = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', { rewardTrackIds: ['secure-inklet', 'secure-vellhorn'] })],
    rewardTracks: [
      {
        id: 'secure-inklet',
        poolId: 'secure-vocabulary',
        monsterId: 'inklet',
        progressionMode: 'sequentialAfter',
        sequentialAfter: 'secure-vellhorn',
        thresholdOverrides: [1],
      },
      {
        id: 'secure-vellhorn',
        poolId: 'secure-vocabulary',
        monsterId: 'vellhorn',
        progressionMode: 'sequentialAfter',
        sequentialAfter: 'secure-inklet',
        thresholdOverrides: [1],
      },
    ],
    wordCounts: { 'secure-vocabulary': 2 },
  }));

  assert.equal(validation.ok, false);
  assert.ok(errorCodes(validation).includes('reward_track_cycle'));
});

test('cross-pool sequential dependencies require explicit approval', () => {
  const pools = [
    poolFixture('secure-vocabulary', { rewardTrackIds: ['secure-inklet'], sortIndex: 0 }),
    poolFixture('challenge-vocabulary', { rewardTrackIds: ['challenge-vellhorn'], sortIndex: 1 }),
  ];
  const rewardTracks = [
    {
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
    },
    {
      id: 'challenge-vellhorn',
      poolId: 'challenge-vocabulary',
      monsterId: 'vellhorn',
      progressionMode: 'sequentialAfter',
      sequentialAfter: 'secure-inklet',
      thresholdOverrides: [1],
    },
  ];
  const blocked = validateSpellingContentBundle(rewardBundle({
    pools,
    rewardTracks,
    wordCounts: { 'secure-vocabulary': 1, 'challenge-vocabulary': 1 },
  }));
  const approved = validateSpellingContentBundle(rewardBundle({
    pools,
    rewardTracks: rewardTracks.map((track) => (track.id === 'challenge-vellhorn'
      ? {
          ...track,
          dependencyApproval: {
            approved: true,
            reason: 'Approved as an editorial bridge between pools.',
            approvedBy: 'content-admin',
            approvedAt: NOW,
          },
        }
      : track)),
    wordCounts: { 'secure-vocabulary': 1, 'challenge-vocabulary': 1 },
  }));

  assert.equal(blocked.ok, false);
  assert.ok(errorCodes(blocked).includes('reward_cross_pool_dependency'));
  assert.equal(approved.ok, true, JSON.stringify(approved.errors, null, 2));
});

test('reward-track editor validator catches duplicate ids in context', () => {
  const validation = validateSpellingRewardTrackEditorInput({
    id: 'secure-inklet',
    poolId: 'secure-vocabulary',
    monsterId: 'vellhorn',
    thresholdOverrides: [1],
  }, {
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
    }],
    pools: [poolFixture('secure-vocabulary')],
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) => entry.code === 'duplicate_reward_track'));
});

test('pool editor can clear existing formal reward-track bindings', () => {
  const pool = normaliseSpellingPoolEditorInput({
    id: 'secure-vocabulary',
    title: 'Secure vocabulary',
    type: 'extension',
    visibility: { state: 'hidden' },
    sourceNote: 'Reward-track test fixture.',
    provenance: { source: 'spelling-reward-tracks-test' },
    rewardTrackIds: [],
  }, {
    existingPool: poolFixture('secure-vocabulary', {
      visibilityState: 'hidden',
      rewardTrackIds: ['secure-inklet'],
    }),
  });

  assert.equal(pool.rewardTrackIds, undefined);
});
