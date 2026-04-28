import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const OLD_RELEASE_ID = 'punctuation-r3-endmarks-apostrophe-speech-comma-flow-boundary';

function masteryKeyForRelease(releaseId, clusterId, rewardUnitId) {
  return `punctuation:${releaseId}:${clusterId}:${rewardUnitId}`;
}

function masteryKey(clusterId, rewardUnitId) {
  return masteryKeyForRelease(CURRENT_RELEASE_ID, clusterId, rewardUnitId);
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

test('old-release reward units do not inflate current starView through the read-model', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  const oldKey = masteryKeyForRelease(OLD_RELEASE_ID, 'endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[oldKey] = {
    masteryKey: oldKey,
    releaseId: OLD_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
  assert.equal(model.releaseDiagnostics.trackedRewardUnitCount, 0);
  assert.equal(model.starView.perMonster.pealark.secureStars, 0);
  assert.equal(model.starView.perMonster.pealark.total, 0);
  assert.equal(model.starView.grand.grandStars, 0);
});

test('mismatched current storage key and old release metadata do not split counters from starView', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();
  const currentStorageKey = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[currentStorageKey] = {
    releaseId: OLD_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.trackedRewardUnits, 0);
  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
  assert.equal(model.overview.securedRewardUnits, 0);
  assert.equal(model.releaseDiagnostics.trackedRewardUnitCount, 0);
  assert.equal(model.starView.perMonster.pealark.secureStars, 0);
  assert.equal(model.starView.perMonster.pealark.total, 0);
  assert.equal(model.starView.grand.grandStars, 0);
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
  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0, 'no facets exist so no deep-secured units');
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
  // Mirrors the module.js getDashboardStats formula:
  //   pct = securedRewardUnits / publishedRewardUnits * 100
  // (read-model exposes publishedRewardUnitCount via releaseDiagnostics;
  // totalRewardUnits is the same constant but the service denominator is
  // publishedRewardUnits — use it here to stay faithful to the code path)
  const stats = model.progressSnapshot;
  const publishedRewardUnits = model.releaseDiagnostics.publishedRewardUnitCount;
  const pct = publishedRewardUnits
    ? Math.round((stats.securedRewardUnits / publishedRewardUnits) * 100)
    : 0;
  // 2 secured out of 14 published = ~14%
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

// ---------------------------------------------------------------------------
// U4: starView wiring tests
// ---------------------------------------------------------------------------

test('U4: fresh learner starView has all-zero entries for direct monsters and grand', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });
  assert.ok(model.starView, 'starView must exist on the read-model');
  assert.ok(model.starView.perMonster, 'starView.perMonster must exist');
  assert.ok(model.starView.grand, 'starView.grand must exist');

  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const m = model.starView.perMonster[monsterId];
    assert.ok(m, `starView.perMonster.${monsterId} must exist`);
    assert.equal(m.tryStars, 0, `${monsterId} tryStars`);
    assert.equal(m.practiceStars, 0, `${monsterId} practiceStars`);
    assert.equal(m.secureStars, 0, `${monsterId} secureStars`);
    assert.equal(m.masteryStars, 0, `${monsterId} masteryStars`);
    assert.equal(m.total, 0, `${monsterId} total`);
    assert.equal(m.starDerivedStage, 0, `${monsterId} starDerivedStage`);
  }

  assert.equal(model.starView.grand.grandStars, 0, 'grand.grandStars');
  assert.equal(model.starView.grand.total, 100, 'grand.total');
  assert.equal(model.starView.grand.starDerivedStage, 0, 'grand.starDerivedStage');
});

test('U4: starView shape includes all expected fields per direct monster', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });
  const expectedFields = ['tryStars', 'practiceStars', 'secureStars', 'masteryStars', 'total', 'starDerivedStage'];
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    const m = model.starView.perMonster[monsterId];
    for (const field of expectedFields) {
      assert.ok(field in m, `starView.perMonster.${monsterId} must have field ${field}`);
    }
  }
  const grandFields = ['grandStars', 'total', 'starDerivedStage'];
  for (const field of grandFields) {
    assert.ok(field in model.starView.grand, `starView.grand must have field ${field}`);
  }
});

test('U4: seeded secured units produce non-zero starView values', () => {
  const now = Date.UTC(2026, 3, 25);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const subjectState = freshSubjectState();

  // Seed items that are secure (meet the streak/accuracy/span gates).
  subjectState.data.progress.items['se_choose_endmark'] = {
    attempts: 10, correct: 9, incorrect: 1, streak: 4, lapses: 0,
    dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
  };

  // Seed secured reward unit.
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1, releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core', securedAt: now - 10_000,
  };

  // Seed attempts so the star projection maps items to Pealark.
  for (let i = 0; i < 5; i++) {
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'test-session',
      itemId: i === 0 ? 'se_choose_endmark' : `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  const pealark = model.starView.perMonster.pealark;
  assert.ok(pealark.tryStars > 0, 'Pealark tryStars must be > 0 with attempts');
  assert.ok(pealark.total > 0, 'Pealark total must be > 0');
  assert.ok(pealark.secureStars > 0, 'Pealark secureStars must be > 0 with secured evidence');
  // Claspin should remain at zero — no apostrophe evidence.
  assert.equal(model.starView.perMonster.claspin.total, 0);
});

test('U4: starDerivedStage follows PUNCTUATION_STAR_THRESHOLDS', () => {
  const now = Date.UTC(2026, 3, 25);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const subjectState = freshSubjectState();

  // Seed enough evidence for Pealark to reach at least stage 1 (threshold[1]=10 stars).
  // Many distinct items + secured unit should push tryStars + practiceStars + secureStars >= 10.
  for (let i = 0; i < 15; i++) {
    subjectState.data.progress.items[`se_item_${i}`] = {
      attempts: 6, correct: 5, incorrect: 1, streak: 4, lapses: 0,
      dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
    };
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'test-session',
      itemId: `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1, releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core', securedAt: now - 10_000,
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  const pealark = model.starView.perMonster.pealark;
  // With 15 distinct correct items + 1 secured reward unit, expect total >= 10 → stage >= 1.
  assert.ok(pealark.total >= 10, `Pealark total should be >= 10, got ${pealark.total}`);
  assert.ok(pealark.starDerivedStage >= 1, `Pealark starDerivedStage should be >= 1, got ${pealark.starDerivedStage}`);
});

// ---------------------------------------------------------------------------
// U7: deepSecuredRewardUnits wiring tests
// ---------------------------------------------------------------------------

/**
 * Helper: build a facet state that memorySnapshot classifies as secure.
 * secure bucket requires: streak >= 3, accuracy >= 0.8, correctSpanDays >= 7.
 */
function deepSecureFacet(nowTs) {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return {
    attempts: 10,
    correct: 9,
    incorrect: 1,
    streak: 4,
    lapses: 0,
    dueAt: 0,
    firstCorrectAt: nowTs - (14 * DAY_MS),
    lastCorrectAt: nowTs,
    lastSeen: nowTs,
  };
}

test('U7: reward unit with securedAt and all facets deep-secure counts as deep-secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Secure reward unit in endmarks cluster.
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  // Deep-secure facet for sentence_endings (belongs to endmarks cluster).
  subjectState.data.progress.facets['sentence_endings::choose'] = deepSecureFacet(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 1,
    'reward unit with securedAt + deep-secure facet must count as deep-secured');
});

test('U7: 3 of 14 units deep-secured returns deepSecuredRewardUnits = 3', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Three secured reward units with deep-secure facets.
  const secured = [
    { clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core', facetSkill: 'sentence_endings' },
    { clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core', facetSkill: 'apostrophe_contractions' },
    { clusterId: 'speech', rewardUnitId: 'speech-core', facetSkill: 'speech' },
  ];

  for (const u of secured) {
    const k = masteryKey(u.clusterId, u.rewardUnitId);
    subjectState.data.progress.rewardUnits[k] = {
      masteryKey: k,
      releaseId: CURRENT_RELEASE_ID,
      clusterId: u.clusterId,
      rewardUnitId: u.rewardUnitId,
      securedAt: now - 10_000,
    };
    subjectState.data.progress.facets[`${u.facetSkill}::choose`] = deepSecureFacet(now);
  }

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 3,
    '3 units with securedAt + deep-secure facets = deepSecuredRewardUnits 3');
  assert.equal(model.progressSnapshot.securedRewardUnits, 3,
    'all 3 are also counted as secured');
});

test('U7: secured unit with facet that has lapse is NOT deep-secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  // Facet is secure but has lapses > 0.
  const facet = deepSecureFacet(now);
  facet.lapses = 2;
  subjectState.data.progress.facets['sentence_endings::choose'] = facet;

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'facet with lapses > 0 blocks deep-secure even when bucket is secure');
  assert.equal(model.progressSnapshot.securedRewardUnits, 1,
    'still counts as secured (securedAt is valid)');
});

test('U7: facet secure with lapses > 0 but streak > 0 is NOT deep-secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  const k1 = masteryKey('speech', 'speech-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'speech',
    rewardUnitId: 'speech-core',
    securedAt: now - 10_000,
  };

  // Facet: secure bucket (streak >= 3, accuracy >= 0.8, span >= 7 days) but lapses = 1.
  const facet = deepSecureFacet(now);
  facet.lapses = 1;
  facet.streak = 4; // streak > 0 does NOT excuse the lapse for deep-secure
  subjectState.data.progress.facets['speech::insert'] = facet;

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'lapses must be exactly 0 for deep-secure — streak cannot compensate');
});

test('U7: no tracked reward units yields deepSecuredRewardUnits = 0', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Add a deep-secure facet but no reward units at all.
  subjectState.data.progress.facets['sentence_endings::choose'] = deepSecureFacet(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'no tracked reward units means deepSecuredRewardUnits = 0');
  assert.equal(model.progressSnapshot.trackedRewardUnits, 0);
});

test('U7: fresh learner with no facets and no reward units yields deepSecuredRewardUnits = 0', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'fresh learner must have deepSecuredRewardUnits = 0');
  assert.equal(model.progressSnapshot.trackedRewardUnits, 0);
  assert.equal(model.progressSnapshot.securedRewardUnits, 0);
});

test('U7: secured unit without securedAt is NOT deep-secured even with deep-secure facets', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Tracked reward unit but securedAt = 0 (not yet secured).
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: 0,
  };

  // Deep-secure facet exists.
  subjectState.data.progress.facets['sentence_endings::choose'] = deepSecureFacet(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'securedAt must be > 0 for deep-secured count');
  assert.equal(model.progressSnapshot.securedRewardUnits, 0,
    'securedAt = 0 means not secured either');
  assert.equal(model.progressSnapshot.trackedRewardUnits, 1,
    'entry is tracked');
});

test('U7: deep-secure facet for a DIFFERENT cluster does not count — cluster mismatch', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Secured reward unit in the endmarks cluster.
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  // Deep-secure facet for apostrophe_contractions — belongs to the apostrophe
  // cluster, NOT endmarks. This exercises the `if (!skillIds.has(skillId)) continue`
  // guard: the facet is genuine deep-secure material but for the wrong cluster.
  subjectState.data.progress.facets['apostrophe_contractions::choose'] = deepSecureFacet(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'facet is deep-secure but belongs to apostrophe cluster, not endmarks');
  assert.equal(model.progressSnapshot.securedRewardUnits, 1,
    'reward unit is still secured (securedAt > 0)');
});

test('U7: facet in learning bucket with zero lapses is NOT deep-secured', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Secured reward unit in endmarks cluster.
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks',
    rewardUnitId: 'sentence-endings-core',
    securedAt: now - 10_000,
  };

  // Facet with zero lapses but NOT in the secure bucket.
  // Learning bucket: streak=1 (< 3), accuracy=0.85, correctSpanDays=2 (< 7).
  // This exercises the `snap.secure` conjunct independently while rawLapses === 0.
  const DAY_MS = 24 * 60 * 60 * 1000;
  subjectState.data.progress.facets['sentence_endings::choose'] = {
    attempts: 10,
    correct: 9,         // accuracy 0.9 — well above 0.8
    incorrect: 1,
    streak: 1,          // below secure threshold of 3
    lapses: 0,          // zero lapses — not the blocking factor
    dueAt: 0,
    firstCorrectAt: now - (2 * DAY_MS),   // correctSpanDays = 2, below secure threshold of 7
    lastCorrectAt: now,
    lastSeen: now,
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0,
    'facet is in learning bucket (not secure) despite zero lapses — snap.secure blocks');
  assert.equal(model.progressSnapshot.securedRewardUnits, 1,
    'reward unit itself is still secured');
});

test('U7: epoch-zero firstCorrectAt does not deep-secure reward units', () => {
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
  subjectState.data.progress.facets['sentence_endings::choose'] = {
    attempts: 4,
    correct: 4,
    incorrect: 0,
    streak: 4,
    lapses: 0,
    dueAt: 0,
    firstCorrectAt: 0,
    lastCorrectAt: now,
    lastSeen: now,
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 0);
  assert.equal(model.progressSnapshot.securedRewardUnits, 1);
});

test('U7: multiple reward units in same cluster — shared deep-secure facet promotes both', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // comma_flow cluster has 3 reward units: list-commas, fronted-adverbials, comma-clarity.
  // Secure two of them, but only provide deep-secure facets for one skill.
  const k1 = masteryKey('comma_flow', 'list-commas-core');
  const k2 = masteryKey('comma_flow', 'fronted-adverbials-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'comma_flow',
    rewardUnitId: 'list-commas-core',
    securedAt: now - 10_000,
  };
  subjectState.data.progress.rewardUnits[k2] = {
    masteryKey: k2,
    releaseId: CURRENT_RELEASE_ID,
    clusterId: 'comma_flow',
    rewardUnitId: 'fronted-adverbials-core',
    securedAt: now - 5_000,
  };

  // Deep-secure facet for list_commas skill (belongs to comma_flow).
  // Both reward units share the comma_flow cluster, so ANY deep-secure facet
  // for a comma_flow skill qualifies all secured reward units in that cluster.
  subjectState.data.progress.facets['list_commas::choose'] = deepSecureFacet(now);

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  // Both reward units are in comma_flow, both have securedAt > 0,
  // and there is a deep-secure facet for list_commas which is in comma_flow.
  assert.equal(model.progressSnapshot.deepSecuredRewardUnits, 2,
    'both comma_flow units are deep-secured because a shared cluster facet is deep-secure');
  assert.equal(model.progressSnapshot.securedRewardUnits, 2);
});
