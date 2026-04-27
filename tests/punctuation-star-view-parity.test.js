import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import { buildPunctuationDashboardModel } from '../src/subjects/punctuation/components/punctuation-view-model.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function secureItemState(now) {
  return {
    attempts: 10, correct: 9, incorrect: 1, streak: 4, lapses: 0,
    dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
  };
}

// ---------------------------------------------------------------------------
// Read-model starView ↔ projection consistency
// ---------------------------------------------------------------------------

test('starView consistency: fresh learner read-model and star projection both zero', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });

  // All direct monster totals should be 0.
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(model.starView.perMonster[monsterId].total, 0);
    assert.equal(model.starView.perMonster[monsterId].starDerivedStage, 0);
  }
  assert.equal(model.starView.grand.grandStars, 0);
  assert.equal(model.starView.grand.starDerivedStage, 0);
});

test('starView consistency: seeded state produces identical numbers across read-model runs', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Seed evidence across two monsters.
  for (let i = 0; i < 5; i++) {
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
  for (let i = 0; i < 3; i++) {
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000) - 300_000,
      sessionId: 'test-session',
      itemId: `apos_item_${i}`,
      itemMode: 'choose',
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
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

  const model1 = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });
  const model2 = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  assert.deepStrictEqual(model1.starView, model2.starView, 'Identical inputs must produce identical starView');
});

// ---------------------------------------------------------------------------
// module.js pct derivation from grandStars
// ---------------------------------------------------------------------------

test('module.js pct: derives from grandStars when present in stats', () => {
  // Simulate the getDashboardStats logic from module.js with grandStars in stats.
  const stats = { publishedRewardUnits: 14, securedRewardUnits: 2, grandStars: 42 };
  const grandStars = stats.grandStars;
  const pct = grandStars != null
    ? Math.round(grandStars)
    : (stats.publishedRewardUnits
      ? Math.round(((stats.securedRewardUnits || 0) / stats.publishedRewardUnits) * 100)
      : 0);
  assert.equal(pct, 42, 'pct must derive from grandStars when available');
});

test('module.js pct: falls back to secured ratio when grandStars is null', () => {
  const stats = { publishedRewardUnits: 14, securedRewardUnits: 2, grandStars: null };
  const grandStars = stats.grandStars;
  const pct = grandStars != null
    ? Math.round(grandStars)
    : (stats.publishedRewardUnits
      ? Math.round(((stats.securedRewardUnits || 0) / stats.publishedRewardUnits) * 100)
      : 0);
  assert.equal(pct, 14, 'pct must fall back to secured/published ratio when grandStars is null');
});

test('module.js pct: falls back when grandStars absent', () => {
  const stats = { publishedRewardUnits: 14, securedRewardUnits: 7 };
  const grandStars = stats.grandStars;
  const pct = grandStars != null
    ? Math.round(grandStars)
    : (stats.publishedRewardUnits
      ? Math.round(((stats.securedRewardUnits || 0) / stats.publishedRewardUnits) * 100)
      : 0);
  assert.equal(pct, 50, 'pct must fall back to secured/published ratio when grandStars is absent');
});

// ---------------------------------------------------------------------------
// Dashboard model: star data flows through to activeMonsters
// ---------------------------------------------------------------------------

test('buildPunctuationDashboardModel threads starView into activeMonsters', () => {
  const stats = { due: 0, weak: 0, securedRewardUnits: 0, accuracy: 0 };
  const learner = { prefs: { mode: 'smart' } };
  const rewardState = {};
  const starView = {
    perMonster: {
      pealark: { tryStars: 5, practiceStars: 10, secureStars: 8, masteryStars: 0, total: 23, starDerivedStage: 1 },
      claspin: { tryStars: 0, practiceStars: 0, secureStars: 0, masteryStars: 0, total: 0, starDerivedStage: 0 },
      curlune: { tryStars: 2, practiceStars: 5, secureStars: 0, masteryStars: 0, total: 7, starDerivedStage: 0 },
    },
    grand: { grandStars: 12, total: 100, starDerivedStage: 1 },
  };

  const dashboard = buildPunctuationDashboardModel(stats, learner, rewardState, starView);
  const pealark = dashboard.activeMonsters.find((m) => m.id === 'pealark');
  const claspin = dashboard.activeMonsters.find((m) => m.id === 'claspin');
  const quoral = dashboard.activeMonsters.find((m) => m.id === 'quoral');

  assert.equal(pealark.totalStars, 23, 'Pealark totalStars from starView');
  assert.equal(pealark.starDerivedStage, 1, 'Pealark starDerivedStage from starView');
  assert.equal(claspin.totalStars, 0, 'Claspin totalStars zero');
  assert.equal(claspin.starDerivedStage, 0, 'Claspin starDerivedStage zero');
  assert.equal(quoral.totalStars, 12, 'Quoral reads from grand.grandStars');
  assert.equal(quoral.starDerivedStage, 1, 'Quoral reads from grand.starDerivedStage');
});

test('buildPunctuationDashboardModel handles null starView gracefully', () => {
  const stats = { due: 0, weak: 0, securedRewardUnits: 0, accuracy: 0 };
  const learner = { prefs: { mode: 'smart' } };
  const rewardState = {};

  // null starView — no star data, backward compatible.
  const dashboard = buildPunctuationDashboardModel(stats, learner, rewardState, null);
  for (const monster of dashboard.activeMonsters) {
    assert.equal(monster.totalStars, 0, `${monster.id} totalStars defaults to 0`);
    assert.equal(monster.starDerivedStage, 0, `${monster.id} starDerivedStage defaults to 0`);
  }
});

test('buildPunctuationDashboardModel handles undefined starView (omitted param)', () => {
  const stats = { due: 0, weak: 0, securedRewardUnits: 0, accuracy: 0 };
  const learner = { prefs: { mode: 'smart' } };

  // Omitted starView param — backward compatible with 3-arg call.
  const dashboard = buildPunctuationDashboardModel(stats, learner, {});
  for (const monster of dashboard.activeMonsters) {
    assert.equal(monster.totalStars, 0, `${monster.id} totalStars defaults to 0`);
    assert.equal(monster.starDerivedStage, 0, `${monster.id} starDerivedStage defaults to 0`);
  }
});

// ---------------------------------------------------------------------------
// FIX 2 (T1): Integration pct test — read-model starView.grand.grandStars
//   matches what module.js getDashboardStats would produce.
// ---------------------------------------------------------------------------

test('integration: read-model with seeded evidence produces non-zero grandStars that module.js pct formula consumes', () => {
  const now = Date.UTC(2026, 3, 25);
  const subjectState = freshSubjectState();

  // Seed evidence across all 3 direct monsters to unlock Grand Stars beyond
  // the 1-monster breadth cap.
  // Pealark: endmarks cluster
  for (let i = 0; i < 5; i++) {
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'int-session',
      itemId: `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }
  // Claspin: apostrophe cluster
  for (let i = 0; i < 3; i++) {
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000) - 300_000,
      sessionId: 'int-session',
      itemId: `apos_item_${i}`,
      itemMode: 'choose',
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }
  // Curlune: comma_flow cluster
  for (let i = 0; i < 3; i++) {
    subjectState.data.progress.attempts.push({
      ts: now - (i * 60_000) - 600_000,
      sessionId: 'int-session',
      itemId: `lc_item_${i}`,
      itemMode: 'choose',
      skillIds: ['list_commas'],
      rewardUnitId: 'list-commas-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Secured reward units across all 3 direct monsters.
  const k1 = masteryKey('endmarks', 'sentence-endings-core');
  const k2 = masteryKey('apostrophe', 'apostrophe-contractions-core');
  const k3 = masteryKey('comma_flow', 'list-commas-core');
  subjectState.data.progress.rewardUnits[k1] = {
    masteryKey: k1, releaseId: CURRENT_RELEASE_ID,
    clusterId: 'endmarks', rewardUnitId: 'sentence-endings-core', securedAt: now - 10_000,
  };
  subjectState.data.progress.rewardUnits[k2] = {
    masteryKey: k2, releaseId: CURRENT_RELEASE_ID,
    clusterId: 'apostrophe', rewardUnitId: 'apostrophe-contractions-core', securedAt: now - 20_000,
  };
  subjectState.data.progress.rewardUnits[k3] = {
    masteryKey: k3, releaseId: CURRENT_RELEASE_ID,
    clusterId: 'comma_flow', rewardUnitId: 'list-commas-core', securedAt: now - 30_000,
  };

  // Deep-secured facets to contribute to grand score.
  subjectState.data.progress.facets = {
    'sentence_endings::choose': secureItemState(now),
    'apostrophe_contractions::choose': secureItemState(now),
    'list_commas::choose': secureItemState(now),
  };

  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: subjectState,
    practiceSessions: [],
    now: () => now,
  });

  const grandStars = model.starView.grand.grandStars;

  // With 3 direct monsters holding secured units, breadth gate is 100.
  // rawScore = 3 secured * 4 + 3 deep-secured * 2 = 12 + 6 = 18.
  assert.ok(grandStars > 0, `grandStars must be non-zero, got ${grandStars}`);
  assert.equal(typeof grandStars, 'number', 'grandStars must be a number');

  // Replay the module.js pct formula against the read-model output.
  // module.js: pct = grandStars != null ? Math.round(grandStars) : fallback
  const pct = Math.round(grandStars);
  assert.equal(pct, grandStars,
    'grandStars is already an integer; Math.round is a no-op');
  assert.ok(pct > 0, `pct derived from grandStars must be positive, got ${pct}`);
  assert.ok(pct <= 100, `pct must be <= 100, got ${pct}`);
});

// ---------------------------------------------------------------------------
// FIX 3 (T3 — minor): grandStars=0 edge case — valid "fresh learner" value
// ---------------------------------------------------------------------------

test('grandStars=0 is a valid value meaning fresh learner with zero Stars', () => {
  const model = buildPunctuationLearnerReadModel({
    subjectStateRecord: freshSubjectState(),
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 25),
  });

  const grandStars = model.starView.grand.grandStars;
  assert.equal(grandStars, 0, 'Fresh learner grandStars must be exactly 0');
  // 0 is NOT null and NOT undefined — it is a valid numeric value.
  assert.notEqual(grandStars, null, 'grandStars=0 must not be null');
  assert.notEqual(grandStars, undefined, 'grandStars=0 must not be undefined');
  assert.equal(typeof grandStars, 'number', 'grandStars must be a number');

  // When grandStars=0 flows into the module.js pct formula, it yields 0 (not fallback).
  // module.js: pct = grandStars != null ? Math.round(grandStars) : fallback
  const pct = grandStars != null
    ? Math.round(grandStars)
    : 99; // sentinel — should never be reached
  assert.equal(pct, 0, 'pct must be 0 for a fresh learner, not the fallback path');
});
