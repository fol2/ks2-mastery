import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function freshSubjectState() {
  return {
    data: {
      progress: {
        items: {},
        facets: {},
        rewardUnits: {},
        attempts: [],
        sessionsCompleted: 0,
      },
    },
    updatedAt: 1,
  };
}

test('fresh learner has zero secured reward units and no evidence', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });
  assert.equal(model.hasEvidence, false, 'fresh learner must not read as having evidence');
  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
  assert.equal(model.progressSnapshot.trackedRewardUnits, 0);
  assert.equal(model.overview.securedRewardUnits, 0);
  assert.equal(model.progressSnapshot.attempts, 0);
  assert.equal(model.progressSnapshot.totalRewardUnits, 14);
});

test('learner with one attempt but no secured units reads as having evidence with zero secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  subjectState.data.progress.attempts.push({
    ts: now - 60_000,
    sessionId: 'attempt-only',
    itemId: 'sp_choose_endmark',
    itemMode: 'choose',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    sessionMode: 'smart',
    correct: true,
  });
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  assert.equal(model.hasEvidence, true);
  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
  assert.equal(model.progressSnapshot.attempts, 1);
});

test('learner with one secured reward unit reads as having one secured and attempts evidence', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  const key = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[key] = {
    masteryKey: key,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };
  subjectState.data.progress.attempts.push({
    ts: now - 30_000,
    sessionId: 'recent-attempt',
    itemId: 'sp_choose_endmark',
    itemMode: 'choose',
    skillIds: ['sentence_endings'],
    rewardUnitId: 'sentence-endings-core',
    sessionMode: 'smart',
    correct: true,
  });
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  assert.equal(model.hasEvidence, true);
  assert.equal(model.progressSnapshot.securedRewardUnits, 1);
  assert.equal(model.overview.securedRewardUnits, 1);
  assert.equal(model.progressSnapshot.trackedRewardUnits, 1);
});

test('hasEvidence is true when sessions exist even with zero attempts', () => {
  const now = Date.UTC(2026, 3, 25);
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [
      {
        id: 'abandoned-session',
        learnerId: 'learner-a',
        subjectId: 'punctuation',
        sessionKind: 'smart',
        status: 'abandoned',
        summary: null,
        createdAt: now - 60_000,
        updatedAt: now - 10_000,
      },
    ],
    now: () => now,
  });
  assert.equal(model.hasEvidence, true);
  assert.equal(model.progressSnapshot.attempts, 0);
});

test('hasEvidence ignores stored item snapshots without attempts or sessions', () => {
  const subjectState = freshSubjectState();
  subjectState.data.progress.items.sp_choose_endmark = {
    stage: 0,
    attempts: 0,
    successes: 0,
    failures: 0,
    lastResult: null,
  };
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });
  assert.equal(
    model.hasEvidence,
    false,
    'empty item snapshots must not flip hasEvidence — only attempts or sessions count',
  );
});

test('fourteen published units with zero secured keeps overview and dashboard accurate', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });
  assert.equal(model.progressSnapshot.totalRewardUnits, 14);
  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
  assert.equal(model.overview.securedRewardUnits, 0);
  // Simulated dashboard pct: secured / total
  const dashboardPct = Math.round(
    (model.progressSnapshot.securedRewardUnits / model.progressSnapshot.totalRewardUnits) * 100,
  );
  assert.equal(dashboardPct, 0);
});
