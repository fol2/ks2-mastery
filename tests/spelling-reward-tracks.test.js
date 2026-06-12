import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_SPELLING_REWARD_TRACKS,
  legacySpellingRewardTrackIdsForPool,
  normaliseRewardTrackConfig,
  rewardTracksVisibleForHeroSurface,
  thresholdsForRewardTrack,
} from '../src/platform/game/reward-track-config.js';
import {
  monsterSummaryFromSpellingAnalytics,
} from '../src/platform/game/monster-system.js';
import {
  validateSpellingContentBundle,
} from '../src/subjects/spelling/content/model.js';
import {
  buildSpellingContentOperationCandidate,
} from '../src/subjects/spelling/content/operations-model.js';
import {
  buildSpellingHeroExposureUpsertOperation,
  buildSpellingPoolUpsertOperation,
  buildSpellingRewardTrackDeleteOrRetireOperation,
  buildSpellingRewardTrackUpsertOperation,
  normaliseSpellingPoolEditorInput,
  validateSpellingRewardTrackEditorInput,
} from '../src/subjects/spelling/content/package-operations.js';
import {
  SEEDED_SPELLING_CONTENT_BUNDLE,
} from '../src/subjects/spelling/data/content-data.js';

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
  assert.equal(track.heroExposure.state, 'visible');
  assert.deepEqual(thresholdsForRewardTrack(track), [1, 10, 30, 60, 100]);
});

test('reward track Hero / Codex exposure filters learner surfaces without removing admin preview', () => {
  const now = Date.UTC(2026, 5, 12, 9, 0, 0);
  const tracks = [
    normaliseRewardTrackConfig({
      id: 'secure-hidden',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
      heroExposure: { state: 'hidden' },
    }),
    normaliseRewardTrackConfig({
      id: 'secure-scheduled',
      poolId: 'secure-vocabulary',
      monsterId: 'glimmerbug',
      thresholdOverrides: [1],
      heroExposure: { state: 'scheduled', scheduledAt: now + 60_000 },
    }),
    normaliseRewardTrackConfig({
      id: 'secure-visible',
      poolId: 'secure-vocabulary',
      monsterId: 'vellhorn',
      thresholdOverrides: [1],
      heroExposure: { state: 'visible', surfaces: ['codex'] },
    }),
    normaliseRewardTrackConfig({
      id: 'secure-preview-blocked',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
      heroExposure: { state: 'hidden', previewAllowed: false },
    }),
    normaliseRewardTrackConfig({
      id: 'secure-hero-camp-only',
      poolId: 'secure-vocabulary',
      monsterId: 'vellhorn',
      thresholdOverrides: [1],
      heroExposure: { state: 'hidden', surfaces: ['heroCamp'] },
    }),
  ];

  assert.deepEqual(
    rewardTracksVisibleForHeroSurface(tracks, { surface: 'codex', now }).map((track) => track.id),
    ['secure-visible'],
  );
  assert.deepEqual(
    rewardTracksVisibleForHeroSurface(tracks, { surface: 'codex', now, includeAdminPreview: true }).map((track) => track.id),
    ['secure-hidden', 'secure-scheduled', 'secure-visible'],
  );
});

test('spelling setup monster summary reads subjectSetup exposure rules', () => {
  const tracks = LEGACY_SPELLING_REWARD_TRACKS.map((track) => {
    if (track.monsterId === 'inklet') {
      return normaliseRewardTrackConfig({
        ...track,
        heroExposure: { state: 'visible', surfaces: ['codex'] },
      });
    }
    if (track.monsterId === 'vellhorn') {
      return normaliseRewardTrackConfig({
        ...track,
        heroExposure: { state: 'visible', surfaces: ['subjectSetup'] },
      });
    }
    return normaliseRewardTrackConfig({
      ...track,
      heroExposure: { state: 'hidden', surfaces: ['codex', 'subjectSetup'] },
    });
  });
  const analytics = {
    wordGroups: [{
      words: [
        { slug: 'core-secure', word: 'core', year: '3-4', spellingPool: 'core', status: 'secure' },
        { slug: 'extra-secure', word: 'extra', year: 'extra', spellingPool: 'extra', status: 'secure' },
      ],
    }],
  };

  const setupIds = monsterSummaryFromSpellingAnalytics(analytics, {
    rewardTracks: tracks,
    surface: 'subjectSetup',
  })
    .filter((entry) => entry.subjectId === 'spelling')
    .map((entry) => entry.monster.id);
  const codexIds = monsterSummaryFromSpellingAnalytics(analytics, {
    rewardTracks: tracks,
    surface: 'codex',
  })
    .filter((entry) => entry.subjectId === 'spelling')
    .map((entry) => entry.monster.id);

  assert.deepEqual(setupIds, ['vellhorn']);
  assert.deepEqual(codexIds, ['inklet']);
});

test('seeded spelling content binds legacy pools to formal reward tracks', () => {
  const validation = validateSpellingContentBundle(SEEDED_SPELLING_CONTENT_BUNDLE);

  assert.equal(validation.ok, true, JSON.stringify(validation.errors, null, 2));
  const { draft } = validation.bundle;
  const poolsById = new Map(draft.pools.map((pool) => [pool.id, pool]));
  const tracksById = new Map(draft.rewardTracks.map((track) => [track.id, track]));

  assert.deepEqual(poolsById.get('core').rewardTrackIds, legacySpellingRewardTrackIdsForPool('core'));
  assert.deepEqual(poolsById.get('extra').rewardTrackIds, legacySpellingRewardTrackIdsForPool('extra'));
  assert.deepEqual(
    draft.rewardTracks.map((track) => track.id),
    LEGACY_SPELLING_REWARD_TRACKS.map((track) => track.id),
  );

  for (const track of LEGACY_SPELLING_REWARD_TRACKS) {
    assert.ok(tracksById.has(track.id), `${track.id} should be present in the seeded draft`);
    assert.equal(tracksById.get(track.id).progressKey, track.progressKey);
  }

  const extraWordCount = draft.words.filter((word) => (
    word.spellingPool === 'extra' && word.active !== false && !word.retired
  )).length;
  const vellhornThresholds = thresholdsForRewardTrack(tracksById.get('spelling-extra-vellhorn'));
  assert.deepEqual(vellhornThresholds, [1, 10, 30, 60, 100]);
  assert.equal(tracksById.get('spelling-extra-vellhorn').compatibilityMode, 'legacy');
  assert.equal(Math.max(...vellhornThresholds) > extraWordCount, true);
  assert.ok(errorCodes(validation).includes('reward_threshold_exceeds_pool_count') === false);
  assert.ok(validation.warnings.some((issue) => issue.code === 'reward_threshold_exceeds_pool_count'));
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

test('unknown reward track source monsters block publish', () => {
  const validation = validateSpellingContentBundle(rewardBundle({
    pools: [poolFixture('secure-vocabulary', { rewardTrackIds: ['secure-phaeton'] })],
    rewardTracks: [{
      id: 'secure-phaeton',
      poolId: 'secure-vocabulary',
      monsterId: 'phaeton',
      thresholdTemplate: 'aggregate',
      sourceMonsterIds: ['inklet', 'glimmerbugg'],
      thresholdOverrides: [1],
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  }));

  assert.equal(validation.ok, false);
  assert.ok(errorCodes(validation).includes('reward_source_monster_missing'));
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

test('reward-track editor validates scheduled and rollout-flagged Hero / Codex exposure', () => {
  const scheduled = validateSpellingRewardTrackEditorInput({
    id: 'secure-inklet',
    poolId: 'secure-vocabulary',
    monsterId: 'inklet',
    thresholdOverrides: [1],
    heroExposure: { state: 'scheduled' },
  }, {
    pools: [poolFixture('secure-vocabulary')],
  });
  const flagged = validateSpellingRewardTrackEditorInput({
    id: 'secure-vellhorn',
    poolId: 'secure-vocabulary',
    monsterId: 'vellhorn',
    thresholdOverrides: [1],
    heroExposure: { state: 'rollout-flagged' },
  }, {
    pools: [poolFixture('secure-vocabulary')],
  });

  assert.equal(scheduled.ok, false);
  assert.equal(flagged.ok, false);
  assert.ok(scheduled.errors.some((entry) => entry.code === 'hero_exposure_schedule_required'));
  assert.ok(flagged.errors.some((entry) => entry.code === 'hero_exposure_flag_required'));
});

test('reward-track editor validates empty and invalid Hero / Codex exposure surfaces', () => {
  const empty = validateSpellingRewardTrackEditorInput({
    id: 'secure-inklet',
    poolId: 'secure-vocabulary',
    monsterId: 'inklet',
    thresholdOverrides: [1],
    heroExposure: { state: 'visible', surfaces: [] },
  }, {
    pools: [poolFixture('secure-vocabulary')],
  });
  const invalid = validateSpellingRewardTrackEditorInput({
    id: 'secure-vellhorn',
    poolId: 'secure-vocabulary',
    monsterId: 'vellhorn',
    thresholdOverrides: [1],
    heroExposure: { state: 'visible', surfaces: 'codex, archive' },
  }, {
    pools: [poolFixture('secure-vocabulary')],
  });

  assert.equal(empty.ok, false);
  assert.equal(invalid.ok, false);
  assert.ok(empty.errors.some((entry) => entry.code === 'hero_exposure_surface_required'));
  assert.ok(invalid.errors.some((entry) => entry.code === 'invalid_hero_exposure_surface'));
});

test('Hero / Codex exposure operation updates reward-track exposure without replacing the track', () => {
  const base = rewardBundle({
    pools: [poolFixture('secure-vocabulary', {
      visibilityState: 'hidden',
      rewardTrackIds: ['secure-inklet'],
    })],
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
      labels: { title: 'Secure Inklet' },
      heroExposure: { state: 'visible', surfaces: ['codex'] },
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  });
  const operation = buildSpellingHeroExposureUpsertOperation({
    id: 'secure-inklet',
    heroExposure: {
      state: 'scheduled',
      surfaces: 'heroCamp, codex',
      scheduledAt: NOW,
      previewAllowed: false,
    },
  }, {
    existingTrack: base.draft.rewardTracks[0],
  });
  const candidate = buildSpellingContentOperationCandidate(base, [operation]);
  const updatedTrack = candidate.validation.bundle.draft.rewardTracks.find((track) => track.id === 'secure-inklet');

  assert.equal(operation.entityType, 'spelling.heroExposure');
  assert.equal(updatedTrack.monsterId, 'inklet');
  assert.deepEqual(updatedTrack.heroExposure, {
    state: 'scheduled',
    surfaces: ['heroCamp', 'codex'],
    scheduledAt: NOW,
    rolloutFlag: '',
    previewAllowed: false,
  });
});

test('reward-track editor operation normalises UI-submitted source monsters and inactive state', () => {
  const operation = buildSpellingRewardTrackUpsertOperation({
    id: 'secure-vellhorn',
    poolId: 'secure-vocabulary',
    monsterId: 'vellhorn',
    thresholdOverrides: [1, 2],
    sourceMonsterIds: 'vellhorn, inklet',
    active: false,
    labels: { title: 'Secure Vellhorn' },
  }, {
    pools: [poolFixture('secure-vocabulary', { visibilityState: 'hidden' })],
    poolWordCounts: { 'secure-vocabulary': 2 },
    enforceThresholdsForHiddenPools: true,
  });

  assert.equal(operation.entityType, 'spelling.rewardTrack');
  assert.equal(operation.payload.active, false);
  assert.deepEqual(operation.payload.sourceMonsterIds, ['vellhorn', 'inklet']);
  assert.deepEqual(operation.payload.thresholdOverrides, [1, 2]);
});

test('reward-track editor can remove draft tracks or retire published tracks', () => {
  const removeDraft = buildSpellingRewardTrackDeleteOrRetireOperation({
    id: 'secure-inklet',
    hasCurrent: false,
  });
  const retirePublished = buildSpellingRewardTrackDeleteOrRetireOperation({
    id: 'secure-inklet',
    hasCurrent: true,
    reason: 'Replacing the track with a new monster route.',
  }, {
    now: () => NOW,
  });
  const base = rewardBundle({
    pools: [poolFixture('secure-vocabulary', {
      visibilityState: 'hidden',
      rewardTrackIds: ['secure-inklet'],
    })],
    rewardTracks: [{
      id: 'secure-inklet',
      poolId: 'secure-vocabulary',
      monsterId: 'inklet',
      thresholdOverrides: [1],
    }],
    wordCounts: { 'secure-vocabulary': 1 },
  });
  const candidate = buildSpellingContentOperationCandidate(base, [retirePublished]);
  const retiredTrack = candidate.validation.bundle.draft.rewardTracks.find((track) => track.id === 'secure-inklet');

  assert.equal(removeDraft.action, 'remove');
  assert.equal(removeDraft.payload, null);
  assert.equal(retirePublished.action, 'retire');
  assert.equal(retirePublished.payload.reason, 'Replacing the track with a new monster route.');
  assert.equal(retirePublished.payload.retiredAt, NOW);
  assert.equal(retiredTrack.active, false);
  assert.equal(retiredTrack.retired, true);
  assert.equal(retiredTrack.retirement.reason, 'Replacing the track with a new monster route.');
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
