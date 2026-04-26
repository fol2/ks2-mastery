// U11: Guardian + Boss reward subscriber (toasts only)
//
// Asserts the additive toast-emission branches in
// src/subjects/spelling/event-hooks.js:
//   - spelling.guardian.renewed           -> "Word renewed." toast
//   - spelling.guardian.recovered         -> "Back on guard." toast
//   - spelling.guardian.mission-completed -> "Mission complete." toast
//   - spelling.boss.completed             -> "Boss round complete." toast
//
// Wobbled is NOT a toast source (positive-events-only MVP scope). The legacy
// WORD_SECURED monster-evolution projection must remain untouched; the new
// branches are additive alongside it.
//
// Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U11)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELLING_EVENT_TYPES,
  createSpellingBossCompletedEvent,
  createSpellingGuardianMissionCompletedEvent,
  createSpellingGuardianRecoveredEvent,
  createSpellingGuardianRenewedEvent,
  createSpellingGuardianWobbledEvent,
  createSpellingWordSecuredEvent,
} from '../src/subjects/spelling/events.js';
import { rewardEventsFromSpellingEvents } from '../src/subjects/spelling/event-hooks.js';

const GUARDIAN_SESSION = Object.freeze({
  id: 'session-guardian-1',
  mode: 'guardian',
  type: 'learning',
  uniqueWords: ['possess', 'accommodate', 'believe'],
});

const BOSS_SESSION = Object.freeze({
  id: 'session-boss-1',
  mode: 'boss',
  type: 'test',
  uniqueWords: [
    'possess', 'accommodate', 'believe', 'conscience', 'neighbour',
    'rhythm', 'queue', 'achieve', 'awkward', 'bruise',
  ],
});

function makeStubGameStateRepo() {
  // A minimal in-memory repo so the WORD_SECURED branch can still read/write
  // without touching disk. The reward subscriber only hits this when a
  // WORD_SECURED event arrives; Guardian/Boss events must never call it.
  const store = new Map();
  return {
    writes: 0,
    read(learnerId, systemId) {
      return structuredClone(store.get(`${learnerId}:${systemId}`) || {});
    },
    write(learnerId, systemId, state) {
      this.writes += 1;
      const cloned = structuredClone(state || {});
      store.set(`${learnerId}:${systemId}`, cloned);
      return cloned;
    },
  };
}

// -----------------------------------------------------------------------------
// Guardian renewed -> "Word renewed." toast
// -----------------------------------------------------------------------------

test('rewardEventsFromSpellingEvents emits one toast per guardian.renewed event with word + nextDueDay', () => {
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 2,
    nextDueDay: 18_014,
    createdAt: 1_780_000_000_000,
  });
  const toasts = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() });
  const renewedToasts = toasts.filter((t) => t.type === 'reward.toast' && t.kind === 'guardian.renewed');
  assert.equal(renewedToasts.length, 1, 'exactly one renewed toast');
  const [toast] = renewedToasts;
  assert.equal(toast.subjectId, 'spelling');
  assert.equal(toast.learnerId, 'learner-a');
  assert.equal(toast.sessionId, 'session-guardian-1');
  assert.equal(toast.toast.title, 'Word renewed.');
  // The event carries today=Date.now() implicitly in the service; we only
  // check the body references the word and shows a delta in days via the raw
  // nextDueDay integer. The subscriber does not have access to a clock; it
  // just repeats the nextDueDay field as-is using dayFromCreatedAt derivation.
  assert.ok(toast.toast.body.includes('"possess"'), 'body includes quoted word');
  assert.ok(/next check in \d+ days?/i.test(toast.toast.body), 'body includes "next check in N days"');
});

test('rewardEventsFromSpellingEvents renewed toast falls back when word/nextDueDay missing', () => {
  // Simulate a renewed event that somehow lost its nextDueDay (defensive MVP
  // path — should not occur in production but the subscriber must not crash).
  const event = createSpellingGuardianRenewedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 0,
    nextDueDay: null,
    createdAt: 1_780_000_000_000,
  });
  const [toast] = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() })
    .filter((t) => t.kind === 'guardian.renewed');
  assert.equal(toast.toast.title, 'Word renewed.');
  assert.equal(toast.toast.body, 'Held steady. Next check scheduled.');
});

// -----------------------------------------------------------------------------
// Guardian recovered -> "Back on guard." toast
// -----------------------------------------------------------------------------

test('rewardEventsFromSpellingEvents emits one toast per guardian.recovered event with word', () => {
  const event = createSpellingGuardianRecoveredEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'believe',
    renewals: 1,
    reviewLevel: 3,
    createdAt: 1_780_000_000_500,
  });
  const toasts = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() });
  const recoveredToasts = toasts.filter((t) => t.kind === 'guardian.recovered');
  assert.equal(recoveredToasts.length, 1);
  const [toast] = recoveredToasts;
  assert.equal(toast.toast.title, 'Back on guard.');
  assert.equal(toast.toast.body, '"believe" is wobble-free again.');
});

// -----------------------------------------------------------------------------
// Guardian mission-completed -> "Mission complete." toast
// -----------------------------------------------------------------------------

test('rewardEventsFromSpellingEvents emits one toast per guardian.mission-completed event with counts', () => {
  const event = createSpellingGuardianMissionCompletedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    renewalCount: 2,
    wobbledCount: 1,
    recoveredCount: 1,
    createdAt: 1_780_000_001_000,
  });
  const toasts = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() });
  const missionToasts = toasts.filter((t) => t.kind === 'guardian.mission-completed');
  assert.equal(missionToasts.length, 1);
  const [toast] = missionToasts;
  assert.equal(toast.toast.title, 'Mission complete.');
  assert.equal(toast.toast.body, '2 renewed, 1 recovered.');
});

test('rewardEventsFromSpellingEvents mission-completed toast falls back when counts are zero', () => {
  const event = createSpellingGuardianMissionCompletedEvent({
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    renewalCount: 0,
    wobbledCount: 0,
    recoveredCount: 0,
    createdAt: 1_780_000_001_000,
  });
  const [toast] = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() })
    .filter((t) => t.kind === 'guardian.mission-completed');
  assert.equal(toast.toast.title, 'Mission complete.');
  assert.equal(toast.toast.body, 'Guardian round finished.');
});

// -----------------------------------------------------------------------------
// Boss completed -> "Boss round complete." toast
// -----------------------------------------------------------------------------

test('rewardEventsFromSpellingEvents emits one toast per boss.completed event with score', () => {
  const event = createSpellingBossCompletedEvent({
    learnerId: 'learner-a',
    session: BOSS_SESSION,
    summary: { correct: 7, wrong: 3 },
    seedSlugs: BOSS_SESSION.uniqueWords.slice(),
    createdAt: 1_780_000_002_000,
  });
  const toasts = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() });
  const bossToasts = toasts.filter((t) => t.kind === 'boss.completed');
  assert.equal(bossToasts.length, 1);
  const [toast] = bossToasts;
  assert.equal(toast.toast.title, 'Boss round complete.');
  assert.equal(toast.toast.body, '7 of 10 Mega words landed.');
});

// -----------------------------------------------------------------------------
// Composite scenarios (from plan's U11 test scenarios)
// -----------------------------------------------------------------------------

test('Guardian mission with 2 renewed + 1 wobbled -> 2 renewed toasts + 1 mission-completed toast (wobbled is silent)', () => {
  const events = [
    createSpellingGuardianRenewedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'possess',
      reviewLevel: 1, nextDueDay: 18_003, createdAt: 1,
    }),
    createSpellingGuardianRenewedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'accommodate',
      reviewLevel: 2, nextDueDay: 18_007, createdAt: 2,
    }),
    createSpellingGuardianWobbledEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'believe',
      lapses: 1, createdAt: 3,
    }),
    createSpellingGuardianMissionCompletedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION,
      renewalCount: 2, wobbledCount: 1, recoveredCount: 0, createdAt: 4,
    }),
  ];
  const toasts = rewardEventsFromSpellingEvents(events, { gameStateRepository: makeStubGameStateRepo() });
  const renewedToasts = toasts.filter((t) => t.kind === 'guardian.renewed');
  const wobbledToasts = toasts.filter((t) => t.kind === 'guardian.wobbled');
  const missionToasts = toasts.filter((t) => t.kind === 'guardian.mission-completed');
  assert.equal(renewedToasts.length, 2, 'one renewed toast per renewed event');
  assert.equal(wobbledToasts.length, 0, 'wobbled does NOT emit a toast (positive-only MVP)');
  assert.equal(missionToasts.length, 1, 'one mission-completed toast');
});

test('Guardian mission with 1 recovered + all correct -> 1 recovered toast + 1 mission-completed toast', () => {
  const events = [
    createSpellingGuardianRenewedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'possess',
      reviewLevel: 2, nextDueDay: 18_007, createdAt: 1,
    }),
    createSpellingGuardianRecoveredEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'believe',
      renewals: 1, reviewLevel: 1, createdAt: 2,
    }),
    createSpellingGuardianMissionCompletedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION,
      renewalCount: 1, wobbledCount: 0, recoveredCount: 1, createdAt: 3,
    }),
  ];
  const toasts = rewardEventsFromSpellingEvents(events, { gameStateRepository: makeStubGameStateRepo() });
  const recoveredToasts = toasts.filter((t) => t.kind === 'guardian.recovered');
  const missionToasts = toasts.filter((t) => t.kind === 'guardian.mission-completed');
  assert.equal(recoveredToasts.length, 1);
  assert.equal(missionToasts.length, 1);
  assert.equal(recoveredToasts[0].toast.body, '"believe" is wobble-free again.');
  assert.equal(missionToasts[0].toast.body, '1 renewed, 1 recovered.');
});

test('Guardian wobbled event alone produces zero toasts (positive-events-only guard)', () => {
  const event = createSpellingGuardianWobbledEvent({
    learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'believe', lapses: 2, createdAt: 1,
  });
  const toasts = rewardEventsFromSpellingEvents([event], { gameStateRepository: makeStubGameStateRepo() });
  assert.deepEqual(toasts, [], 'wobbled never emits a toast in the MVP');
});

// -----------------------------------------------------------------------------
// Integration — legacy WORD_SECURED projection is unchanged; new branches are
// additive and never feed the monster-evolution pipeline.
// -----------------------------------------------------------------------------

test('WORD_SECURED monster-evolution projection is unchanged by U11 additions', () => {
  const secured = createSpellingWordSecuredEvent({
    learnerId: 'learner-a',
    session: { id: 'session-secure', mode: 'smart', type: 'learning' },
    slug: 'possess',
    stage: 4,
    createdAt: 1_780_000_003_000,
  });
  const stubRepo = makeStubGameStateRepo();
  const rewards = rewardEventsFromSpellingEvents([secured], { gameStateRepository: stubRepo });
  // The existing WORD_SECURED branch emits monster reward events, not toasts
  // with our new kind strings. Assert the legacy reward shape ('reward.monster')
  // is preserved and no new 'reward.toast' entries leak in from it.
  const monsterRewards = rewards.filter((event) => event.type === 'reward.monster');
  const u11Toasts = rewards.filter((event) => event.type === 'reward.toast');
  assert.ok(monsterRewards.length >= 1, 'WORD_SECURED still produces at least one monster reward event');
  assert.equal(u11Toasts.length, 0, 'WORD_SECURED does not emit a U11 toast');
  assert.ok(stubRepo.writes >= 1, 'monster-evolution projection still writes to game state');
});

test('Guardian/Boss toast-emitting branches do NOT write to the game-state repository', () => {
  // Enforces the plan's explicit non-goal: "no monster projection" for the
  // Guardian + Boss branches. A write here would indicate a regression that
  // coupled the toast subscriber to monster evolution.
  const events = [
    createSpellingGuardianRenewedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'possess',
      reviewLevel: 1, nextDueDay: 18_003, createdAt: 1,
    }),
    createSpellingGuardianRecoveredEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'believe',
      renewals: 1, reviewLevel: 1, createdAt: 2,
    }),
    createSpellingGuardianMissionCompletedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION,
      renewalCount: 1, wobbledCount: 0, recoveredCount: 1, createdAt: 3,
    }),
    createSpellingBossCompletedEvent({
      learnerId: 'learner-a', session: BOSS_SESSION,
      summary: { correct: 7, wrong: 3 }, seedSlugs: BOSS_SESSION.uniqueWords.slice(), createdAt: 4,
    }),
  ];
  const stubRepo = makeStubGameStateRepo();
  const toasts = rewardEventsFromSpellingEvents(events, { gameStateRepository: stubRepo });
  assert.equal(stubRepo.writes, 0, 'toast-only branches must not touch game state');
  assert.ok(toasts.length >= 4, 'but each event still produced a toast');
});

// -----------------------------------------------------------------------------
// Emitted toast event shape contract
// -----------------------------------------------------------------------------

test('Every toast reward event carries deterministic id + toast.title + toast.body', () => {
  const events = [
    createSpellingGuardianRenewedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'possess',
      reviewLevel: 1, nextDueDay: 18_003, createdAt: 100,
    }),
    createSpellingGuardianRecoveredEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION, slug: 'believe',
      renewals: 1, reviewLevel: 1, createdAt: 200,
    }),
    createSpellingGuardianMissionCompletedEvent({
      learnerId: 'learner-a', session: GUARDIAN_SESSION,
      renewalCount: 1, wobbledCount: 0, recoveredCount: 1, createdAt: 300,
    }),
    createSpellingBossCompletedEvent({
      learnerId: 'learner-a', session: BOSS_SESSION,
      summary: { correct: 7, wrong: 3 }, seedSlugs: BOSS_SESSION.uniqueWords.slice(), createdAt: 400,
    }),
  ];
  const toasts = rewardEventsFromSpellingEvents(events, { gameStateRepository: makeStubGameStateRepo() });
  assert.equal(toasts.length, 4);
  for (const toast of toasts) {
    assert.equal(toast.type, 'reward.toast');
    assert.equal(toast.subjectId, 'spelling');
    assert.equal(typeof toast.id, 'string');
    assert.ok(toast.id.length > 0, 'id is non-empty');
    assert.equal(typeof toast.toast.title, 'string');
    assert.equal(typeof toast.toast.body, 'string');
    assert.ok(toast.toast.title.length > 0, 'title non-empty');
    assert.ok(toast.toast.body.length > 0, 'body non-empty');
  }
  // IDs must be unique — no dedupe collision across kinds.
  const ids = new Set(toasts.map((t) => t.id));
  assert.equal(ids.size, toasts.length, 'all toast ids unique');
});

test('Identical input events produce a stable toast id (dedupe key)', () => {
  const input = {
    learnerId: 'learner-a',
    session: GUARDIAN_SESSION,
    slug: 'possess',
    reviewLevel: 1,
    nextDueDay: 18_003,
    createdAt: 1_780_000_000_000,
  };
  const toasts1 = rewardEventsFromSpellingEvents(
    [createSpellingGuardianRenewedEvent(input)],
    { gameStateRepository: makeStubGameStateRepo() },
  );
  const toasts2 = rewardEventsFromSpellingEvents(
    [createSpellingGuardianRenewedEvent(input)],
    { gameStateRepository: makeStubGameStateRepo() },
  );
  assert.equal(toasts1[0].id, toasts2[0].id, 'stable id for identical input');
});

// -----------------------------------------------------------------------------
// Defensive — the subscriber must tolerate a null/non-array input and
// non-Guardian/Boss event types silently (unchanged from pre-U11 behaviour).
// -----------------------------------------------------------------------------

test('rewardEventsFromSpellingEvents tolerates non-array input without throwing', () => {
  assert.deepEqual(rewardEventsFromSpellingEvents(null, { gameStateRepository: makeStubGameStateRepo() }), []);
  assert.deepEqual(rewardEventsFromSpellingEvents(undefined, { gameStateRepository: makeStubGameStateRepo() }), []);
  assert.deepEqual(rewardEventsFromSpellingEvents('not-an-array', { gameStateRepository: makeStubGameStateRepo() }), []);
});

test('rewardEventsFromSpellingEvents ignores event types it does not handle', () => {
  const unknown = {
    id: 'custom:1',
    type: 'spelling.unknown',
    subjectId: 'spelling',
    learnerId: 'learner-a',
    createdAt: 1,
  };
  const toasts = rewardEventsFromSpellingEvents([unknown], { gameStateRepository: makeStubGameStateRepo() });
  assert.deepEqual(toasts, []);
});

test('Session completed (SPELLING_EVENT_TYPES.SESSION_COMPLETED) does not emit a toast by itself', () => {
  const sessionCompleted = {
    id: 'sess-complete:1',
    type: SPELLING_EVENT_TYPES.SESSION_COMPLETED,
    subjectId: 'spelling',
    learnerId: 'learner-a',
    sessionId: 'session-1',
    mode: 'smart',
    createdAt: 1,
    sessionType: 'learning',
    totalWords: 5,
    mistakeCount: 0,
  };
  const toasts = rewardEventsFromSpellingEvents([sessionCompleted], { gameStateRepository: makeStubGameStateRepo() });
  const u11Toasts = toasts.filter((t) => t.type === 'reward.toast');
  assert.deepEqual(u11Toasts, [], 'SESSION_COMPLETED alone does not trigger a U11 toast');
});
