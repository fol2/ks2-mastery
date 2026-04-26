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

test('three units tracked but only one has securedAt — tracked 3, secured 1', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  const k2 = masteryKey('apostrophe', 'apostrophe-contractions-core');
  const k3 = masteryKey('apostrophe', 'apostrophe-possession-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };
  // Tracked but securedAt is 0 — not secured
  subjectState.data.progress.rewardUnits[k2] = {
    masteryKey: k2,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-contractions-core',
    securedAt: 0,
  };
  // Tracked but securedAt is absent — not secured
  subjectState.data.progress.rewardUnits[k3] = {
    masteryKey: k3,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'apostrophe',
    rewardUnitId: 'apostrophe-possession-core',
  };
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  assert.equal(model.progressSnapshot.trackedRewardUnits, 3, 'three entries exist in the progress store');
  assert.equal(model.progressSnapshot.securedRewardUnits, 1, 'only the entry with a valid securedAt is secured');
  assert.equal(model.overview.securedRewardUnits, 1, 'overview must match progressSnapshot');
  assert.equal(model.releaseDiagnostics.trackedRewardUnitCount, 3, 'diagnostics must reflect tracked count');
  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0, 'deep-secured placeholder is 0 until U3');
});

test('reward unit entry with null securedAt is tracked but not secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  const k1 = masteryKey('speech', 'speech-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    securedAt: null,
  };
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  assert.equal(model.progressSnapshot.trackedRewardUnits, 1, 'entry exists so tracked');
  assert.equal(model.progressSnapshot.securedRewardUnits, 0, 'null securedAt must not count as secured');
  assert.equal(model.overview.securedRewardUnits, 0);
});

test('module.js pct derives from corrected securedRewardUnits, not tracked count', () => {
  // Simulate the getDashboardStats logic from module.js using read-model output
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  // Add 5 tracked units, only 2 with valid securedAt
  const units = [
    { clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core', securedAt: now - 10_000 },
    { clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core', securedAt: now - 5_000 },
    { clusterId: 'apostrophe', rewardUnitId: 'apostrophe-possession-core', securedAt: 0 },
    { clusterId: 'speech', rewardUnitId: 'speech-core', securedAt: null },
    { clusterId: 'comma_flow', rewardUnitId: 'list-commas-core' },
  ];
  for (const u of units) {
    const k = masteryKey(u.clusterId, u.rewardUnitId);
    subjectState.data.progress.rewardUnits[k] = {
      masteryKey: k,
      releaseId: CURRENT_RELEASE_ID,
      clusterId: u.clusterId,
      rewardUnitId: u.rewardUnitId,
      ...(u.securedAt !== undefined ? { securedAt: u.securedAt } : {}),
    };
  }
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  // Replicate the module.js getDashboardStats formula:
  // pct = securedRewardUnits / totalRewardUnits * 100
  const stats = model.progressSnapshot;
  const pct = stats.totalRewardUnits
    ? Math.round((stats.securedRewardUnits / stats.totalRewardUnits) * 100)
    : 0;
  // 2 secured out of 14 total = ~14%
  assert.equal(stats.securedRewardUnits, 2, 'only 2 of 5 tracked units have valid securedAt');
  assert.equal(stats.trackedRewardUnits, 5);
  assert.equal(pct, 14, 'dashboard pct must derive from secured count (2/14), not tracked count (5/14)');
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
