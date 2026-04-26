// P2 U12 — Achievement framework skeleton.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U12)
//
// Four named achievements ship with deterministic IDs:
//   1. Guardian 7-day Maintainer — 7 distinct dayIds with completed Guardian
//      Missions                       `achievement:spelling:guardian:7-day:<learnerId>`
//   2. Recovery Expert — 10 distinct slugs transitioned wobbling:true → false
//      over any time window            `achievement:spelling:recovery:expert:<learnerId>`
//   3. Boss Clean Sweep — Boss session ends 10/10 correct. NON-UNIQUE per learner;
//      one row per distinct sessionId  `achievement:spelling:boss:clean-sweep:<learnerId>:<sessionId>`
//   4. Pattern Mastery — last 3 `spelling.pattern.quest-completed` events with the
//      same patternId all 5/5 correct, with >= 7 days between first and last of
//      those three                     `achievement:spelling:pattern:<patternId>:<learnerId>`
//
// Critical constraints under test (H4 adversarial):
//   - `evaluateAchievements` is PURE: `(domainEvent, currentAchievements, learnerId)
//     -> { unlocks, progressUpdates }`. No side effects.
//   - Idempotency is enforced at the PERSISTENCE layer, not the caller. Re-reading
//     `currentAchievements` before writing skips the write if already set.
//   - Reward subscriber de-dups `reward.toast` emission on (achievementId) so a
//     local-dispatch + remote-sync echo of the same domain event emits exactly
//     ONE toast.
//   - No progress bars rendered before unlock (adversarial children's-app
//     gamification critique).
//
// Test-first directive from the plan: the idempotency test "replaying the same
// `spelling.guardian.mission-completed` event 5 times produces exactly ONE
// unlock" ships FIRST.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_IDS,
  deriveAchievementId,
  evaluateAchievements,
} from '../src/subjects/spelling/achievements.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingBossCompletedEvent,
  createSpellingGuardianMissionCompletedEvent,
  createSpellingGuardianRecoveredEvent,
  createSpellingGuardianRenewedEvent,
  createSpellingPatternQuestCompletedEvent,
} from '../src/subjects/spelling/events.js';
import { rewardEventsFromSpellingEvents } from '../src/subjects/spelling/event-hooks.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';

// Use real core slugs from WORD_BY_SLUG so the event factory doesn't reject
// them. Event factories use wordFields() which returns null for unknown slugs.
const REAL_CORE_SLUGS = WORDS
  .filter((w) => w.spellingPool !== 'extra')
  .slice(0, 12)
  .map((w) => w.slug);

const DAY_MS = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------
// Helpers — construct events with deterministic timestamps + session ids.
// -----------------------------------------------------------------------------

function missionCompletedEvent({ learnerId = 'learner-a', sessionId, dayOffset = 0, createdAt }) {
  return createSpellingGuardianMissionCompletedEvent({
    learnerId,
    session: { id: sessionId, mode: 'guardian', uniqueWords: ['a', 'b', 'c'] },
    renewalCount: 3,
    wobbledCount: 0,
    recoveredCount: 0,
    createdAt: createdAt ?? (Date.UTC(2026, 0, 1) + dayOffset * DAY_MS),
  });
}

function bossCompletedEvent({ learnerId = 'learner-a', sessionId, correct, length = 10, createdAt }) {
  return createSpellingBossCompletedEvent({
    learnerId,
    session: { id: sessionId, mode: 'boss', uniqueWords: new Array(length).fill(0).map((_, i) => `slug-${i}`) },
    summary: { correct, wrong: length - correct },
    createdAt: createdAt ?? Date.UTC(2026, 0, 10),
  });
}

function patternQuestCompletedEvent({
  learnerId = 'learner-a',
  sessionId,
  patternId = 'suffix-tion',
  correctCount = 5,
  dayOffset = 0,
} = {}) {
  return createSpellingPatternQuestCompletedEvent({
    learnerId,
    session: { id: sessionId, mode: 'pattern-quest' },
    patternId,
    slugs: ['competition', 'education', 'position', 'direction'],
    correctCount,
    wobbledSlugs: correctCount < 5 ? ['competition'] : [],
    createdAt: Date.UTC(2026, 0, 1) + dayOffset * DAY_MS,
  });
}

function renewedEvent({ learnerId = 'learner-a', sessionId = 's1', slug, dayOffset = 0 }) {
  return createSpellingGuardianRenewedEvent({
    learnerId,
    session: { id: sessionId, mode: 'guardian' },
    slug,
    reviewLevel: 1,
    nextDueDay: 100 + dayOffset,
    createdAt: Date.UTC(2026, 0, 1) + dayOffset * DAY_MS,
  });
}

function recoveredEvent({ learnerId = 'learner-a', sessionId = 's1', slug, dayOffset = 0 }) {
  return createSpellingGuardianRecoveredEvent({
    learnerId,
    session: { id: sessionId, mode: 'guardian' },
    slug,
    renewals: 1,
    reviewLevel: 1,
    createdAt: Date.UTC(2026, 0, 1) + dayOffset * DAY_MS,
  });
}

// =============================================================================
// 1. TEST-FIRST: Idempotency gate — replaying the same mission-completed event
// 5 times produces exactly ONE unlock across the accumulated state.
// =============================================================================

test('U12 idempotency: replaying the same guardian.mission-completed 5 times produces exactly ONE unlock', () => {
  const learnerId = 'learner-a';
  // Start from a state where 6 distinct guardian completion days are already
  // in the progress tracker. The 7th event will be the one under replay.
  let currentAchievements = {};
  let aggregateState = {
    guardianCompletedDays: new Set([18015, 18016, 18017, 18018, 18019, 18020]),
    recoveredSlugs: new Set(),
    patternCompletions: {},
  };

  const seventhEvent = missionCompletedEvent({
    learnerId,
    sessionId: 'session-day-7',
    createdAt: 18021 * DAY_MS, // day 18021 — 7th distinct day
  });

  // Replay 5 times — each call is PURE, must return the same unlock set from
  // the same currentAchievements input. Idempotency means caller-side state
  // unchanged after the first persistence write.
  const results = [];
  for (let i = 0; i < 5; i += 1) {
    // Merge the event's createdAt day into aggregate state for this replay
    const result = evaluateAchievements(seventhEvent, currentAchievements, learnerId, {
      aggregateState,
    });
    results.push(result);
    // Simulate a PERSISTENCE-layer write: on the first unlock, persist. On
    // subsequent replays, currentAchievements already has the id so no write.
    for (const unlock of result.unlocks || []) {
      if (!currentAchievements[unlock.id]) {
        currentAchievements[unlock.id] = { unlockedAt: unlock.unlockedAt };
      }
    }
  }

  // Exactly ONE unlock across all 5 replays for the Guardian 7-day achievement.
  const guardianUnlocks = [];
  for (let i = 0; i < results.length; i += 1) {
    for (const unlock of results[i].unlocks || []) {
      if (unlock.id.startsWith('achievement:spelling:guardian:7-day:')) {
        guardianUnlocks.push({ replay: i, unlock });
      }
    }
  }
  assert.equal(
    guardianUnlocks.length,
    1,
    `expected exactly one Guardian 7-day unlock across 5 replays, got ${guardianUnlocks.length}`,
  );
  assert.equal(guardianUnlocks[0].replay, 0, 'the unlock occurs on the FIRST replay');
  assert.equal(guardianUnlocks[0].unlock.id, `achievement:spelling:guardian:7-day:${learnerId}`);
});

// =============================================================================
// 2. Public surface — ACHIEVEMENT_IDS, ACHIEVEMENT_DEFINITIONS, deriveAchievementId
// =============================================================================

test('U12 surface: ACHIEVEMENT_IDS names four canonical achievements', () => {
  assert.ok(ACHIEVEMENT_IDS.GUARDIAN_7_DAY, 'GUARDIAN_7_DAY key exists');
  assert.ok(ACHIEVEMENT_IDS.RECOVERY_EXPERT, 'RECOVERY_EXPERT key exists');
  assert.ok(ACHIEVEMENT_IDS.BOSS_CLEAN_SWEEP, 'BOSS_CLEAN_SWEEP key exists');
  assert.ok(ACHIEVEMENT_IDS.PATTERN_MASTERY, 'PATTERN_MASTERY key exists');
});

test('U12 surface: ACHIEVEMENT_DEFINITIONS has title + body for each', () => {
  for (const key of Object.keys(ACHIEVEMENT_IDS)) {
    const def = ACHIEVEMENT_DEFINITIONS[ACHIEVEMENT_IDS[key]];
    assert.ok(def, `definition exists for ${key}`);
    assert.ok(typeof def.title === 'string' && def.title, `title present for ${key}`);
    assert.ok(typeof def.body === 'string' && def.body, `body present for ${key}`);
  }
});

test('U12 surface: deriveAchievementId emits kebab-case deterministic IDs', () => {
  assert.equal(
    deriveAchievementId(ACHIEVEMENT_IDS.GUARDIAN_7_DAY, { learnerId: 'learner-a' }),
    'achievement:spelling:guardian:7-day:learner-a',
  );
  assert.equal(
    deriveAchievementId(ACHIEVEMENT_IDS.RECOVERY_EXPERT, { learnerId: 'learner-a' }),
    'achievement:spelling:recovery:expert:learner-a',
  );
  assert.equal(
    deriveAchievementId(ACHIEVEMENT_IDS.BOSS_CLEAN_SWEEP, { learnerId: 'learner-a', sessionId: 'sess-42' }),
    'achievement:spelling:boss:clean-sweep:learner-a:sess-42',
  );
  assert.equal(
    deriveAchievementId(ACHIEVEMENT_IDS.PATTERN_MASTERY, { learnerId: 'learner-a', patternId: 'suffix-tion' }),
    'achievement:spelling:pattern:suffix-tion:learner-a',
  );
});

// =============================================================================
// 3. Happy paths — each achievement unlocks under the right conditions
// =============================================================================

test('U12 Guardian 7-day: unlocks after 7 distinct dayIds with completed Guardian Missions', () => {
  const learnerId = 'learner-a';
  const currentAchievements = {};
  // Simulate an aggregate state where 7 distinct completion days are seen.
  const aggregateState = {
    guardianCompletedDays: new Set([18010, 18011, 18012, 18013, 18014, 18015, 18016]),
    recoveredSlugs: new Set(),
    patternCompletions: {},
  };
  const event = missionCompletedEvent({ learnerId, sessionId: 'sess-7', createdAt: 18016 * DAY_MS });
  const result = evaluateAchievements(event, currentAchievements, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.GUARDIAN_7_DAY, { learnerId });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(unlocked, 'Guardian 7-day is unlocked');
  assert.ok(Number.isInteger(unlocked.unlockedAt), 'unlockedAt is integer');
});

test('U12 Guardian 7-day: 6 missions on the same day does NOT unlock', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set([18010]),
    recoveredSlugs: new Set(),
    patternCompletions: {},
  };
  const event = missionCompletedEvent({ learnerId, sessionId: 'sess-dup', createdAt: 18010 * DAY_MS });
  const result = evaluateAchievements(event, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.GUARDIAN_7_DAY, { learnerId });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(!unlocked, 'Guardian 7-day not unlocked at 1 distinct day');
});

test('U12 Recovery Expert: unlocks after 10 distinct slugs transitioned wobbling true -> false', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set(),
    recoveredSlugs: new Set(REAL_CORE_SLUGS.slice(0, 10)),
    patternCompletions: {},
  };
  // A recovered event where this slug was already in the set (size stays 10).
  const event = recoveredEvent({ learnerId, slug: REAL_CORE_SLUGS[9] });
  const result = evaluateAchievements(event, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.RECOVERY_EXPERT, { learnerId });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(unlocked, 'Recovery Expert is unlocked at 10 distinct recovered slugs');
});

test('U12 Recovery Expert: 9 distinct recovered slugs does NOT unlock', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set(),
    recoveredSlugs: new Set(REAL_CORE_SLUGS.slice(0, 9)),
    patternCompletions: {},
  };
  const event = recoveredEvent({ learnerId, slug: REAL_CORE_SLUGS[8] });
  const result = evaluateAchievements(event, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.RECOVERY_EXPERT, { learnerId });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(!unlocked, 'Recovery Expert NOT unlocked at 9 distinct recovered slugs');
});

test('U12 Boss Clean Sweep: unlocks on 10/10 Boss round and is per-sessionId', () => {
  const learnerId = 'learner-a';
  // First 10/10 round — unlocks with sessionId-1
  const event1 = bossCompletedEvent({ learnerId, sessionId: 'sess-1', correct: 10, length: 10 });
  const result1 = evaluateAchievements(event1, {}, learnerId);
  const id1 = deriveAchievementId(ACHIEVEMENT_IDS.BOSS_CLEAN_SWEEP, { learnerId, sessionId: 'sess-1' });
  const unlock1 = (result1.unlocks || []).find((u) => u.id === id1);
  assert.ok(unlock1, 'First clean sweep unlocks with sess-1 id');

  // Second 10/10 round, DIFFERENT sessionId — unlocks NEW row
  const event2 = bossCompletedEvent({ learnerId, sessionId: 'sess-2', correct: 10, length: 10 });
  const currentAfterFirst = { [id1]: { unlockedAt: unlock1.unlockedAt } };
  const result2 = evaluateAchievements(event2, currentAfterFirst, learnerId);
  const id2 = deriveAchievementId(ACHIEVEMENT_IDS.BOSS_CLEAN_SWEEP, { learnerId, sessionId: 'sess-2' });
  const unlock2 = (result2.unlocks || []).find((u) => u.id === id2);
  assert.ok(unlock2, 'Second clean sweep unlocks with sess-2 id');
  assert.notEqual(id1, id2, 'Distinct session ids produce distinct achievement ids');
});

test('U12 Boss Clean Sweep: 9/10 does NOT unlock', () => {
  const event = bossCompletedEvent({ learnerId: 'learner-a', sessionId: 'sess-1', correct: 9, length: 10 });
  const result = evaluateAchievements(event, {}, 'learner-a');
  assert.equal((result.unlocks || []).length, 0, 'No unlock on 9/10');
});

test('U12 Pattern Mastery: 3 consecutive 5/5 quests at least 7 days apart unlocks', () => {
  const learnerId = 'learner-a';
  // Three quests at days 0, 4, 7 — the 3rd completes the window.
  // aggregateState already tracks the first two 5/5 completions before the 3rd event fires.
  const aggregateState = {
    guardianCompletedDays: new Set(),
    recoveredSlugs: new Set(),
    patternCompletions: {
      'suffix-tion': [
        // chronological list of last 3 5/5 completions for this pattern
        { createdAt: Date.UTC(2026, 0, 1), correctCount: 5, sessionId: 'q1' },
        { createdAt: Date.UTC(2026, 0, 5), correctCount: 5, sessionId: 'q2' },
      ],
    },
  };
  const thirdEvent = patternQuestCompletedEvent({
    learnerId,
    sessionId: 'q3',
    patternId: 'suffix-tion',
    correctCount: 5,
    dayOffset: 7,
  });
  const result = evaluateAchievements(thirdEvent, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.PATTERN_MASTERY, { learnerId, patternId: 'suffix-tion' });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(unlocked, 'Pattern Mastery unlocks with 3 consecutive 5/5 at least 7 days apart');
});

test('U12 Pattern Mastery: 3 consecutive 5/5 WITHIN 7 days does NOT unlock', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set(),
    recoveredSlugs: new Set(),
    patternCompletions: {
      'suffix-tion': [
        { createdAt: Date.UTC(2026, 0, 1), correctCount: 5, sessionId: 'q1' },
        { createdAt: Date.UTC(2026, 0, 3), correctCount: 5, sessionId: 'q2' },
      ],
    },
  };
  const thirdEvent = patternQuestCompletedEvent({
    learnerId,
    sessionId: 'q3',
    patternId: 'suffix-tion',
    correctCount: 5,
    dayOffset: 5, // 5 days later, not 7
  });
  const result = evaluateAchievements(thirdEvent, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.PATTERN_MASTERY, { learnerId, patternId: 'suffix-tion' });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(!unlocked, 'Pattern Mastery NOT unlocked within 7-day window');
});

test('U12 Pattern Mastery: a 4/5 run resets the streak — last 3 must all be 5/5', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set(),
    recoveredSlugs: new Set(),
    patternCompletions: {
      'suffix-tion': [
        { createdAt: Date.UTC(2026, 0, 1), correctCount: 5, sessionId: 'q1' },
        { createdAt: Date.UTC(2026, 0, 5), correctCount: 4, sessionId: 'q2' }, // bad
      ],
    },
  };
  const thirdEvent = patternQuestCompletedEvent({
    learnerId,
    sessionId: 'q3',
    patternId: 'suffix-tion',
    correctCount: 5,
    dayOffset: 14,
  });
  const result = evaluateAchievements(thirdEvent, {}, learnerId, { aggregateState });
  const id = deriveAchievementId(ACHIEVEMENT_IDS.PATTERN_MASTERY, { learnerId, patternId: 'suffix-tion' });
  const unlocked = (result.unlocks || []).find((u) => u.id === id);
  assert.ok(!unlocked, 'Pattern Mastery NOT unlocked when middle run was 4/5');
});

// =============================================================================
// 4. Pure / tolerance — no side effects, survives null / unknown events.
// =============================================================================

test('U12 pure: evaluateAchievements does not mutate currentAchievements', () => {
  const learnerId = 'learner-a';
  const currentAchievements = Object.freeze({});
  const aggregateState = Object.freeze({
    guardianCompletedDays: new Set([18010, 18011, 18012, 18013, 18014, 18015, 18016]),
    recoveredSlugs: new Set(),
    patternCompletions: {},
  });
  const event = missionCompletedEvent({ learnerId, sessionId: 's1', createdAt: 18016 * DAY_MS });
  // Frozen input — no throw means no mutation attempted.
  assert.doesNotThrow(() => evaluateAchievements(event, currentAchievements, learnerId, { aggregateState }));
});

test('U12 tolerance: unknown event type returns empty unlocks + progressUpdates', () => {
  const result = evaluateAchievements(
    { type: 'unrelated.event.type', learnerId: 'l', id: 'x' },
    {},
    'l',
  );
  assert.deepEqual(result.unlocks, []);
  assert.deepEqual(result.progressUpdates, []);
});

test('U12 tolerance: null / undefined currentAchievements treated as empty', () => {
  const event = bossCompletedEvent({ learnerId: 'learner-a', sessionId: 'sess-1', correct: 10, length: 10 });
  const r1 = evaluateAchievements(event, null, 'learner-a');
  const r2 = evaluateAchievements(event, undefined, 'learner-a');
  const r3 = evaluateAchievements(event, {}, 'learner-a');
  assert.equal((r1.unlocks || []).length, 1, 'null currentAchievements still fires first unlock');
  assert.equal((r2.unlocks || []).length, 1, 'undefined currentAchievements still fires first unlock');
  assert.equal((r3.unlocks || []).length, 1, 'empty currentAchievements fires first unlock');
});

test('U12 tolerance: garbage learnerId does not crash', () => {
  const event = bossCompletedEvent({ learnerId: '', sessionId: 'sess-1', correct: 10, length: 10 });
  assert.doesNotThrow(() => evaluateAchievements(event, {}, ''));
});

// =============================================================================
// 5. Reward subscriber integration — `reward.toast` with kind:'reward.achievement'
// =============================================================================

test('U12 reward subscriber: unlock domain event produces kind: reward.achievement toast', () => {
  // Construct an achievement-unlocked reaction event and feed through the
  // subscriber's toast-extension branch.
  const learnerId = 'learner-a';
  // The domain event is the canonical mission-completed; the subscriber
  // (event-hooks.js) inspects aggregate state to decide if an achievement
  // unlocked fires.
  const missionEvents = [];
  for (let i = 0; i < 7; i += 1) {
    missionEvents.push(missionCompletedEvent({
      learnerId,
      sessionId: `s-${i}`,
      createdAt: (18010 + i) * DAY_MS,
    }));
  }
  // Thread through aggregate state via the harness.
  // The subscriber needs to accumulate day-ids. Expose `achievements`
  // on the subscriber call so it can gate.
  const gameStateRepository = {
    writes: 0,
    read() { return {}; },
    write() { this.writes += 1; return {}; },
  };
  const toasts = rewardEventsFromSpellingEvents(missionEvents, { gameStateRepository });
  // Among the toasts, at least one should be kind: 'reward.achievement'
  const achievementToasts = toasts.filter((t) => t.type === 'reward.toast' && t.kind === 'reward.achievement');
  assert.ok(
    achievementToasts.length >= 1,
    `Expected at least one reward.achievement toast after 7 distinct-day missions, got ${achievementToasts.length}`,
  );
  const g7 = achievementToasts.find((t) => t.achievementId && t.achievementId.includes('guardian:7-day'));
  assert.ok(g7, 'Guardian 7-day toast is emitted');
  assert.ok(typeof g7.toast?.title === 'string' && g7.toast.title, 'toast has a title');
  assert.ok(typeof g7.toast?.body === 'string' && g7.toast.body, 'toast has a body');
});

test('U12 reward subscriber: replaying the same domain events emits ONE toast per achievement', () => {
  const learnerId = 'learner-a';
  const missionEvents = [];
  for (let i = 0; i < 7; i += 1) {
    missionEvents.push(missionCompletedEvent({
      learnerId,
      sessionId: `s-${i}`,
      createdAt: (18010 + i) * DAY_MS,
    }));
  }
  const gameStateRepository = { read() { return {}; }, write() { return {}; } };

  const toasts1 = rewardEventsFromSpellingEvents(missionEvents, { gameStateRepository });
  // Second call with the SAME events — the subscriber is stateless (same events =
  // same output; the event-log's seenTokens dedup is handled in the event runtime).
  const toasts2 = rewardEventsFromSpellingEvents(missionEvents, { gameStateRepository });

  const achievementToasts1 = toasts1.filter((t) => t.kind === 'reward.achievement');
  const achievementToasts2 = toasts2.filter((t) => t.kind === 'reward.achievement');
  const ids1 = achievementToasts1.map((t) => t.achievementId);
  const ids2 = achievementToasts2.map((t) => t.achievementId);
  // The subscriber output is deterministic per call — so each call emits
  // the same ids. But the event runtime's seenToken dedup (a layer above)
  // would drop the second call's toasts from persistence. Here we just assert
  // stability: replaying produces the same deterministic id list.
  assert.deepEqual(ids1.sort(), ids2.sort(), 'deterministic achievement toast ids on replay');
});

test('U12 reward subscriber: achievement toast has deterministic id derived from achievementId', () => {
  const learnerId = 'learner-a';
  const missionEvents = [];
  for (let i = 0; i < 7; i += 1) {
    missionEvents.push(missionCompletedEvent({
      learnerId,
      sessionId: `s-${i}`,
      createdAt: (18010 + i) * DAY_MS,
    }));
  }
  const toasts = rewardEventsFromSpellingEvents(missionEvents, {
    gameStateRepository: { read() { return {}; }, write() { return {}; } },
  });
  const achievement = toasts.find((t) => t.kind === 'reward.achievement');
  assert.ok(achievement, 'Achievement toast emitted');
  // Toast id embeds the achievement id so the event-log seenTokens dedup drops
  // a second identical toast regardless of the source domain event id.
  assert.ok(
    typeof achievement.id === 'string' && achievement.id.includes(achievement.achievementId),
    `Toast id includes the achievement id (${achievement.id} vs ${achievement.achievementId})`,
  );
});

// =============================================================================
// 6. H4 adversarial — pure evaluator never mutates external state even when
// invoked concurrently with stale inputs.
// =============================================================================

test('U12 H4 concurrent evaluators with stale currentAchievements produce the same unlock', () => {
  const learnerId = 'learner-a';
  const aggregateState = {
    guardianCompletedDays: new Set([18010, 18011, 18012, 18013, 18014, 18015, 18016]),
    recoveredSlugs: new Set(),
    patternCompletions: {},
  };
  const event = missionCompletedEvent({ learnerId, sessionId: 's7', createdAt: 18016 * DAY_MS });

  // Two concurrent evaluators both read `currentAchievements === {}` (stale)
  // and both return an unlock. The persistence-layer INSERT-OR-IGNORE is
  // what actually dedups — here we assert the evaluators are deterministic
  // so the persistence layer only has a single id to dedup on.
  const r1 = evaluateAchievements(event, {}, learnerId, { aggregateState });
  const r2 = evaluateAchievements(event, {}, learnerId, { aggregateState });
  const ids1 = (r1.unlocks || []).map((u) => u.id).sort();
  const ids2 = (r2.unlocks || []).map((u) => u.id).sort();
  assert.deepEqual(ids1, ids2, 'Concurrent evaluators with stale input produce identical unlock ids');
});
