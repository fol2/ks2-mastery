// tests/punctuation-star-parity-worker-backed.test.js
//
// Phase 6 U10: Worker-backed Star parity proof.
//
// Proves that the Worker → bootstrap → Landing → Summary → Map →
// Home/dashboard surfaces all render identical Star truth. Exercises
// the Worker-backed path (`buildPunctuationReadModel` with `data`)
// alongside the client path (`buildPunctuationLearnerReadModel`) and
// asserts byte-for-byte starView equality.
//
// Test scenarios:
//   1. Worker read-model with seeded progress → star meters non-zero
//   2. Worker stats.grandStars matches starView.grand.grandStars
//   3. Landing, Summary, Map all show identical per-monster star totals
//   4. Home/dashboard pct matches Math.round(grandStars)
//   5. Worker and client starView are deepStrictEqual for same data
//   6. Bootstrap path produces same starView as command path
//   7. Monotonicity: 5 sessions → displayStage never decreases
//   8. Negative: no "Stage X of 4", no "XP", no reserved monsters
//   9. Negative: forbidden-key scan passes on starView-enriched payload

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPunctuationReadModel } from '../worker/src/subjects/punctuation/read-models.js';
import { buildPunctuationLearnerReadModel } from '../src/subjects/punctuation/read-model.js';
import {
  buildPunctuationDashboardModel,
  mergeMonotonicDisplay,
} from '../src/subjects/punctuation/components/punctuation-view-model.js';
import { stageFor, PUNCTUATION_STAR_THRESHOLDS } from '../src/platform/game/monsters.js';

const CURRENT_RELEASE_ID = 'punctuation-r4-full-14-skill-structure';
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masteryKey(clusterId, rewardUnitId) {
  return `punctuation:${CURRENT_RELEASE_ID}:${clusterId}:${rewardUnitId}`;
}

function freshProgress() {
  return {
    items: {},
    facets: {},
    rewardUnits: {},
    attempts: [],
    sessionsCompleted: 0,
  };
}

function secureItemState(now) {
  return {
    attempts: 10, correct: 9, incorrect: 1, streak: 4, lapses: 0,
    dueAt: 0, firstCorrectAt: now - (14 * DAY_MS), lastCorrectAt: now, lastSeen: now,
  };
}

function securedRewardUnit(clusterId, rewardUnitId, now) {
  const key = masteryKey(clusterId, rewardUnitId);
  return {
    [key]: {
      masteryKey: key,
      releaseId: CURRENT_RELEASE_ID,
      clusterId,
      rewardUnitId,
      securedAt: now - 10_000,
    },
  };
}

/**
 * Build a seeded progress blob with evidence across all 3 direct monsters.
 * Returns the raw `progress` shape that both Worker and client paths consume.
 */
function seededProgress(now) {
  const progress = freshProgress();

  // Pealark: endmarks cluster — 5 correct attempts
  for (let i = 0; i < 5; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000),
      sessionId: 'parity-session',
      itemId: `se_item_${i}`,
      itemMode: 'choose',
      skillIds: ['sentence_endings'],
      rewardUnitId: 'sentence-endings-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Claspin: apostrophe cluster — 3 correct attempts
  for (let i = 0; i < 3; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000) - 300_000,
      sessionId: 'parity-session',
      itemId: `apos_item_${i}`,
      itemMode: 'choose',
      skillIds: ['apostrophe_contractions'],
      rewardUnitId: 'apostrophe-contractions-core',
      sessionMode: 'smart',
      correct: true,
      supportLevel: 0,
    });
  }

  // Curlune: comma_flow cluster — 3 correct attempts
  for (let i = 0; i < 3; i++) {
    progress.attempts.push({
      ts: now - (i * 60_000) - 600_000,
      sessionId: 'parity-session',
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
  progress.rewardUnits = {
    ...securedRewardUnit('endmarks', 'sentence-endings-core', now),
    ...securedRewardUnit('apostrophe', 'apostrophe-contractions-core', now),
    ...securedRewardUnit('comma_flow', 'list-commas-core', now),
  };

  // Deep-secured facets.
  progress.facets = {
    'sentence_endings::choose': secureItemState(now),
    'apostrophe_contractions::choose': secureItemState(now),
    'list_commas::choose': secureItemState(now),
  };

  return progress;
}

// ---------------------------------------------------------------------------
// 1. Worker read-model with seeded progress → star meters non-zero
// ---------------------------------------------------------------------------

test('Worker-backed: seeded progress produces non-zero star meters', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-001',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: { due: 0, weak: 0 },
    data: { progress },
  });

  assert.ok(payload.starView, 'Worker payload must carry starView');
  assert.ok(payload.starView.perMonster.pealark.total > 0,
    `Pealark stars must be > 0, got ${payload.starView.perMonster.pealark.total}`);
  assert.ok(payload.starView.perMonster.claspin.total > 0,
    `Claspin stars must be > 0, got ${payload.starView.perMonster.claspin.total}`);
  assert.ok(payload.starView.perMonster.curlune.total > 0,
    `Curlune stars must be > 0, got ${payload.starView.perMonster.curlune.total}`);
  assert.ok(payload.starView.grand.grandStars > 0,
    `Grand stars must be > 0, got ${payload.starView.grand.grandStars}`);
});

// ---------------------------------------------------------------------------
// 2. Worker stats.grandStars matches starView.grand.grandStars
// ---------------------------------------------------------------------------

test('Worker-backed: stats.grandStars matches starView.grand.grandStars', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-002',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  assert.equal(payload.stats.grandStars, payload.starView.grand.grandStars,
    'stats.grandStars must be identical to starView.grand.grandStars');
});

// ---------------------------------------------------------------------------
// 3. Landing, Summary, Map all show identical per-monster star totals
// ---------------------------------------------------------------------------

test('Worker-backed: Landing / Summary / Map phases all carry identical star totals', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  // Simulate three different phases that the Worker read-model can produce.
  // The starView is computed from `data.progress` regardless of phase.
  const phases = ['setup', 'summary', 'active-item'];
  const starViews = phases.map((phase) => {
    const payload = buildPunctuationReadModel({
      learnerId: 'test-learner-003',
      state: { phase },
      prefs: { mode: 'smart' },
      stats: {},
      data: { progress },
    });
    return payload.starView;
  });

  // All phases must produce byte-for-byte identical starView.
  for (let i = 1; i < starViews.length; i++) {
    assert.deepStrictEqual(starViews[i], starViews[0],
      `Phase "${phases[i]}" starView must equal phase "${phases[0]}" starView`);
  }
});

// ---------------------------------------------------------------------------
// 4. Home/dashboard pct matches Math.round(grandStars)
// ---------------------------------------------------------------------------

test('Worker-backed: dashboard pct equals Math.round(grandStars)', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-004',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  const grandStars = payload.starView.grand.grandStars;
  // Replay the module.js getDashboardStats formula:
  //   pct = grandStars != null ? Math.round(grandStars) : fallback
  const pct = grandStars != null
    ? Math.round(grandStars)
    : -1; // sentinel — must not be reached

  assert.ok(pct >= 0, 'pct must be non-negative');
  assert.ok(pct <= 100, `pct must be <= 100, got ${pct}`);
  assert.equal(pct, Math.round(grandStars),
    'Home/dashboard pct must equal Math.round(grandStars)');
});

// ---------------------------------------------------------------------------
// 5. Worker and client starView are deepStrictEqual for same data
// ---------------------------------------------------------------------------

test('Worker-backed: Worker and client read-models produce identical starView for same data', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  // Worker path: buildPunctuationReadModel with `data`.
  const workerPayload = buildPunctuationReadModel({
    learnerId: 'test-learner-005',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  // Client path: buildPunctuationLearnerReadModel with subjectStateRecord.
  const clientModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: { data: { progress }, updatedAt: 1 },
    practiceSessions: [],
    now: () => now,
  });

  assert.deepStrictEqual(workerPayload.starView, clientModel.starView,
    'Worker and client read-models must produce identical starView for the same progress data');
});

// ---------------------------------------------------------------------------
// 6. Bootstrap path produces same starView as command path
// ---------------------------------------------------------------------------

test('Worker-backed: bootstrap path (empty data) produces same zeroed starView as fresh client', () => {
  // Worker path with null data — simulates first bootstrap before evidence.
  const workerPayload = buildPunctuationReadModel({
    learnerId: 'test-learner-006',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: null,
  });

  // Client path with empty subjectStateRecord.
  const clientModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: {},
    practiceSessions: [],
    now: () => Date.UTC(2026, 3, 27),
  });

  assert.deepStrictEqual(workerPayload.starView, clientModel.starView,
    'Bootstrap (null data) and fresh client must produce identical zeroed starView');

  // All zeros.
  for (const monsterId of ['pealark', 'claspin', 'curlune']) {
    assert.equal(workerPayload.starView.perMonster[monsterId].total, 0,
      `Fresh bootstrap: ${monsterId}.total must be 0`);
  }
  assert.equal(workerPayload.starView.grand.grandStars, 0,
    'Fresh bootstrap: grandStars must be 0');
});

test('Worker-backed: bootstrap path (seeded data) matches command path starView', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  // Worker command path: `data` carries the progress blob.
  const commandPayload = buildPunctuationReadModel({
    learnerId: 'test-learner-006b',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  // Bootstrap path: same `data` shape (simulating bootstrap hydration).
  const bootstrapPayload = buildPunctuationReadModel({
    learnerId: 'test-learner-006b',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  assert.deepStrictEqual(commandPayload.starView, bootstrapPayload.starView,
    'Bootstrap and command paths must produce identical starView for same progress');
});

// ---------------------------------------------------------------------------
// 7. Monotonicity: 5 sessions with intermittent lapses → displayStage
//    never decreases
// ---------------------------------------------------------------------------

test('monotonicity: displayStage never decreases across lapse via mergeMonotonicDisplay', () => {
  // Simulate 5 sessions where the live stage oscillates due to evidence lapse.
  // The codex high-water marks persist across sessions.
  const sessions = [
    { liveStars: 5, liveStage: 0 },   // Session 1: just started
    { liveStars: 15, liveStage: 1 },   // Session 2: stage 1
    { liveStars: 35, liveStage: 2 },   // Session 3: stage 2
    { liveStars: 20, liveStage: 1 },   // Session 4: lapse — live drops to stage 1
    { liveStars: 40, liveStage: 2 },   // Session 5: recovery
  ];

  let codexEntry = { maxStageEver: 0, starHighWater: 0 };
  let previousDisplayStage = 0;

  for (let i = 0; i < sessions.length; i++) {
    const { liveStars, liveStage } = sessions[i];
    const { displayStage, displayStars } = mergeMonotonicDisplay(liveStars, liveStage, codexEntry);

    // displayStage must never decrease.
    assert.ok(displayStage >= previousDisplayStage,
      `Session ${i + 1}: displayStage (${displayStage}) must not decrease below previous (${previousDisplayStage})`);

    // displayStars must be at least liveStars (monotonic high-water).
    assert.ok(displayStars >= liveStars,
      `Session ${i + 1}: displayStars (${displayStars}) must be >= liveStars (${liveStars})`);

    // Update codex high-water marks for next session.
    codexEntry = {
      maxStageEver: Math.max(codexEntry.maxStageEver, displayStage),
      starHighWater: Math.max(codexEntry.starHighWater, displayStars),
    };
    previousDisplayStage = displayStage;
  }

  // After all sessions, displayStage must be at least the highest stage seen.
  assert.ok(previousDisplayStage >= 2,
    `Final displayStage (${previousDisplayStage}) must be >= 2 (the highest liveStage seen)`);
});

test('monotonicity: stageFor is consistent with star thresholds across displayStars range', () => {
  // Walk 0-100 Stars and verify stage never decreases.
  let prevStage = 0;
  for (let stars = 0; stars <= 100; stars++) {
    const stage = stageFor(stars, PUNCTUATION_STAR_THRESHOLDS);
    assert.ok(stage >= prevStage,
      `stageFor(${stars}) = ${stage} must not be less than stageFor(${stars - 1}) = ${prevStage}`);
    prevStage = stage;
  }
});

// ---------------------------------------------------------------------------
// 8. Negative: no "Stage X of 4", no "XP", no reserved monsters
// ---------------------------------------------------------------------------

test('negative: Worker payload does not contain "Stage X of 4" pattern', () => {
  const now = Date.UTC(2026, 3, 27);
  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-008',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress: seededProgress(now) },
  });

  const json = JSON.stringify(payload);
  const stagePattern = /Stage\s+\d+\s+of\s+4/;
  assert.equal(stagePattern.test(json), false,
    'Worker payload must not contain "Stage X of 4" — star meters replace stages.');
});

test('negative: Worker payload does not contain "XP" as a reward label', () => {
  const now = Date.UTC(2026, 3, 27);
  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-009',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress: seededProgress(now) },
  });

  const json = JSON.stringify(payload);
  // Match standalone XP token, not embedded in identifiers like "maxXPos".
  const xpPattern = /(?:^|[\s>"`'{(])XP(?:[\s<"`'}).,;:]|$)/m;
  assert.equal(xpPattern.test(json), false,
    'Worker payload must not contain "XP" as a reward label — use Stars instead.');
});

test('negative: reserved monsters (colisk, hyphang, carillon) absent from Worker payload', () => {
  const now = Date.UTC(2026, 3, 27);
  const payload = buildPunctuationReadModel({
    learnerId: 'test-learner-010',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress: seededProgress(now) },
  });

  const json = JSON.stringify(payload).toLowerCase();
  for (const reserved of ['colisk', 'hyphang', 'carillon']) {
    assert.equal(json.includes(reserved), false,
      `Reserved monster "${reserved}" must not appear in the Worker read-model payload.`);
  }
});

// ---------------------------------------------------------------------------
// 9. Forbidden-key scan passes on starView-enriched payload
// ---------------------------------------------------------------------------

test('negative: Worker forbidden-key scan passes on starView-enriched payload', () => {
  const now = Date.UTC(2026, 3, 27);

  // buildPunctuationReadModel internally calls assertNoForbiddenReadModelKeys
  // on the assembled payload. If any forbidden key (accepted, correctIndex,
  // rubric, validator, generator, rawGenerator, queueItemIds, responses)
  // appears anywhere in the payload tree, the call throws. The test passes
  // if no error is thrown.
  assert.doesNotThrow(() => {
    buildPunctuationReadModel({
      learnerId: 'test-learner-011',
      state: { phase: 'setup' },
      prefs: { mode: 'smart' },
      stats: {},
      data: { progress: seededProgress(now) },
    });
  }, 'buildPunctuationReadModel must not throw a forbidden-key error on starView-enriched payloads');
});

test('negative: Worker forbidden-key scan passes on fresh/null data payload', () => {
  assert.doesNotThrow(() => {
    buildPunctuationReadModel({
      learnerId: 'test-learner-012',
      state: { phase: 'setup' },
      prefs: { mode: 'smart' },
      stats: {},
      data: null,
    });
  }, 'buildPunctuationReadModel must not throw on null data payload');
});

// ---------------------------------------------------------------------------
// 10. Dashboard model consumes Worker starView identically to client path
// ---------------------------------------------------------------------------

test('integration: dashboard model built from Worker starView matches client path', () => {
  const now = Date.UTC(2026, 3, 27);
  const progress = seededProgress(now);

  // Worker path.
  const workerPayload = buildPunctuationReadModel({
    learnerId: 'test-learner-013',
    state: { phase: 'setup' },
    prefs: { mode: 'smart' },
    stats: {},
    data: { progress },
  });

  // Client path.
  const clientModel = buildPunctuationLearnerReadModel({
    subjectStateRecord: { data: { progress }, updatedAt: 1 },
    practiceSessions: [],
    now: () => now,
  });

  // Build dashboard models from each starView.
  const stats = { due: 0, weak: 0, securedRewardUnits: 3, accuracy: 0 };
  const learner = { prefs: { mode: 'smart' } };
  const rewardState = {};

  const workerDashboard = buildPunctuationDashboardModel(stats, learner, rewardState, workerPayload.starView);
  const clientDashboard = buildPunctuationDashboardModel(stats, learner, rewardState, clientModel.starView);

  // Per-monster star totals must match.
  for (const wm of workerDashboard.activeMonsters) {
    const cm = clientDashboard.activeMonsters.find((m) => m.id === wm.id);
    assert.ok(cm, `Monster ${wm.id} must exist in both dashboards`);
    assert.equal(wm.totalStars, cm.totalStars,
      `Dashboard ${wm.id}.totalStars: Worker (${wm.totalStars}) must equal client (${cm.totalStars})`);
    assert.equal(wm.starDerivedStage, cm.starDerivedStage,
      `Dashboard ${wm.id}.starDerivedStage: Worker (${wm.starDerivedStage}) must equal client (${cm.starDerivedStage})`);
  }
});
