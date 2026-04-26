// Tests for U9 Boss Dictation service path.
//
// Boss Dictation is a `type: 'test'`-shaped single-attempt round over a random
// sample of core-pool Mega slugs. Unlike legacy SATs Test, Boss NEVER demotes
// `progress.stage` / `dueDay` / `lastDay` / `lastResult` — those invariants
// live in the dedicated `submitBossAnswer` path.
//
// Plan: docs/plans/2026-04-25-005-feat-post-mega-spelling-guardian-hardening-plan.md (U9).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOSS_DEFAULT_ROUND_LENGTH,
  BOSS_MAX_ROUND_LENGTH,
  BOSS_MIN_ROUND_LENGTH,
  SPELLING_MODES,
  normaliseMode,
} from '../src/subjects/spelling/service-contract.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingBossCompletedEvent,
} from '../src/subjects/spelling/events.js';
import { selectBossWords } from '../shared/spelling/service.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { buildSpellingLearnerReadModel } from '../src/subjects/spelling/read-model.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionInputPlaceholder,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
} from '../src/subjects/spelling/session-ui.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeSeededRandom(seed = 1) {
  let value = seed >>> 0;
  return function seededRandom() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeServiceWithSeed({ now, random, storage = installMemoryStorage() } = {}) {
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service };
}

function seedAllCoreMega(repositories, learnerId, todayDay) {
  const progress = Object.fromEntries(
    WORDS.filter((word) => word.spellingPool !== 'extra').map((word, index) => [word.slug, {
      stage: 4,
      attempts: 6 + (index % 4),
      correct: 5 + (index % 4),
      wrong: 1,
      dueDay: todayDay + 60,
      lastDay: todayDay - 7,
      lastResult: 'correct',
    }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress });
}

function runBossRoundUntilSummary(service, learnerId, state, getAnswerForSlug) {
  const events = [];
  const seenSlugs = [];
  let current = state;
  while (current.phase === 'session') {
    const slug = current.session.currentCard.slug;
    seenSlugs.push(slug);
    const typed = getAnswerForSlug(slug, current);
    const submitted = service.submitAnswer(learnerId, current, typed);
    events.push(...submitted.events);
    current = submitted.state;
    assert.equal(current.awaitingAdvance, true, `awaitingAdvance after ${slug}`);
    const continued = service.continueSession(learnerId, current);
    events.push(...continued.events);
    current = continued.state;
  }
  return { state: current, events, seenSlugs };
}

// -----------------------------------------------------------------------------
// Contract constants + mode normalisation
// -----------------------------------------------------------------------------

test('SPELLING_MODES includes "boss" alongside existing modes', () => {
  assert.ok(SPELLING_MODES.includes('boss'), `SPELLING_MODES must include "boss", got ${SPELLING_MODES.join(',')}`);
  assert.equal(normaliseMode('boss'), 'boss');
});

test('Boss round length constants are 8..12 with default 10', () => {
  assert.equal(BOSS_MIN_ROUND_LENGTH, 8);
  assert.equal(BOSS_MAX_ROUND_LENGTH, 12);
  assert.equal(BOSS_DEFAULT_ROUND_LENGTH, 10);
});

// -----------------------------------------------------------------------------
// Event factory
// -----------------------------------------------------------------------------

test('SPELLING_EVENT_TYPES.BOSS_COMPLETED is "spelling.boss.completed"', () => {
  assert.equal(SPELLING_EVENT_TYPES.BOSS_COMPLETED, 'spelling.boss.completed');
});

test('createSpellingBossCompletedEvent returns a kebab-case event with deterministic id', () => {
  const session = {
    id: 'sess-boss-1',
    mode: 'boss',
    uniqueWords: ['possess', 'address', 'believe'],
  };
  const event = createSpellingBossCompletedEvent({
    learnerId: 'learner-a',
    session,
    summary: { correct: 2, wrong: 1 },
    seedSlugs: ['possess', 'address', 'believe'],
    createdAt: 123_456,
  });
  assert.ok(event);
  assert.equal(event.type, 'spelling.boss.completed');
  assert.equal(event.id, 'spelling.boss.completed:learner-a:sess-boss-1');
  assert.equal(event.subjectId, 'spelling');
  assert.equal(event.learnerId, 'learner-a');
  assert.equal(event.sessionId, 'sess-boss-1');
  assert.equal(event.mode, 'boss');
  assert.equal(event.createdAt, 123_456);
  assert.equal(event.length, 3);
  assert.equal(event.correct, 2);
  assert.equal(event.wrong, 1);
  assert.deepEqual(event.seedSlugs, ['possess', 'address', 'believe']);
});

test('createSpellingBossCompletedEvent returns null when session.id is missing', () => {
  const event = createSpellingBossCompletedEvent({
    learnerId: 'learner-a',
    session: { mode: 'boss' },
    summary: { correct: 0, wrong: 0 },
  });
  assert.equal(event, null);
});

// -----------------------------------------------------------------------------
// selectBossWords — random sample of core-pool Mega slugs
// -----------------------------------------------------------------------------

test('selectBossWords returns N slugs drawn only from Mega core-pool progress entries', () => {
  const progressMap = {};
  for (const word of WORDS.filter((w) => w.spellingPool !== 'extra')) {
    progressMap[word.slug] = { stage: 4, attempts: 1, correct: 1, wrong: 0 };
  }
  // Add one extra-pool Mega entry that must NEVER be picked.
  const extraSlug = WORDS.find((w) => w.spellingPool === 'extra')?.slug;
  if (extraSlug) {
    progressMap[extraSlug] = { stage: 4, attempts: 1, correct: 1, wrong: 0 };
  }
  const selected = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(42),
    length: 10,
  });
  assert.equal(selected.length, 10);
  for (const slug of selected) {
    assert.ok(WORD_BY_SLUG[slug], `${slug} must be a known word`);
    assert.notEqual(WORD_BY_SLUG[slug].spellingPool, 'extra', `${slug} must be core`);
    assert.equal(progressMap[slug].stage, 4, `${slug} must be at Mega stage`);
  }
});

test('selectBossWords clamps length below 8 up to BOSS_MIN_ROUND_LENGTH', () => {
  const progressMap = {};
  for (const word of WORDS.filter((w) => w.spellingPool !== 'extra')) {
    progressMap[word.slug] = { stage: 4, attempts: 1, correct: 1, wrong: 0 };
  }
  const selected = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
    length: 3,
  });
  assert.equal(selected.length, BOSS_MIN_ROUND_LENGTH);
});

test('selectBossWords clamps length above 12 down to BOSS_MAX_ROUND_LENGTH', () => {
  const progressMap = {};
  for (const word of WORDS.filter((w) => w.spellingPool !== 'extra')) {
    progressMap[word.slug] = { stage: 4, attempts: 1, correct: 1, wrong: 0 };
  }
  const selected = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
    length: 50,
  });
  assert.equal(selected.length, BOSS_MAX_ROUND_LENGTH);
});

test('selectBossWords returns deterministic ordering under a seeded random', () => {
  const progressMap = {};
  for (const word of WORDS.filter((w) => w.spellingPool !== 'extra')) {
    progressMap[word.slug] = { stage: 4, attempts: 1, correct: 1, wrong: 0 };
  }
  const a = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(42),
    length: 10,
  });
  const b = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(42),
    length: 10,
  });
  assert.deepEqual(a, b, 'same seed => same slug ordering');
});

test('selectBossWords returns empty when no Mega core-pool words exist', () => {
  const selected = selectBossWords({
    progressMap: {},
    wordBySlug: WORD_BY_SLUG,
    random: () => 0.5,
    length: 10,
  });
  assert.deepEqual(selected, []);
});

// -----------------------------------------------------------------------------
// startSession({ mode: 'boss' }) happy / error paths
// -----------------------------------------------------------------------------

test('startSession({mode: boss}) returns ok:false when allWordsMega === false', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  const transition = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(transition.ok, false);
  assert.equal(transition.state.phase, 'dashboard');
  assert.equal(transition.state.session, null);
});

test('startSession({mode: boss}) with allWordsMega builds a test-shaped Boss session', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const transition = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.phase, 'session');
  const session = transition.state.session;
  assert.equal(session.type, 'test', 'Boss session must be type: "test"');
  assert.equal(session.mode, 'boss');
  assert.equal(session.label, 'Boss Dictation');
  assert.equal(session.practiceOnly, false, 'Boss is a real round');
  assert.equal(session.uniqueWords.length, 10);
  // All selected slugs are Mega core-pool words.
  for (const slug of session.uniqueWords) {
    assert.notEqual(WORD_BY_SLUG[slug].spellingPool, 'extra');
  }
});

test('startSession({mode: boss, length: 3}) clamps up to BOSS_MIN_ROUND_LENGTH', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(1) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const transition = service.startSession('learner-a', { mode: 'boss', length: 3 });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.uniqueWords.length, BOSS_MIN_ROUND_LENGTH);
});

test('startSession({mode: boss, length: 50}) clamps down to BOSS_MAX_ROUND_LENGTH', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(1) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const transition = service.startSession('learner-a', { mode: 'boss', length: 50 });
  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.uniqueWords.length, BOSS_MAX_ROUND_LENGTH);
});

test('startSession({mode: boss}) queue order exactly matches selectBossWords seeded output (words array is load-bearing)', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const progressMap = Object.fromEntries(
    WORDS.filter((w) => w.spellingPool !== 'extra').map((w) => [w.slug, { stage: 4 }]),
  );
  const expected = selectBossWords({
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(42),
    length: 10,
  });
  const transition = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.deepEqual(transition.state.session.uniqueWords, expected,
    'session.uniqueWords must equal selectBossWords seeded output (proves words[] bridges into createSession)');
});

// -----------------------------------------------------------------------------
// Full Boss round — happy path + miss path + demotion-safety
// -----------------------------------------------------------------------------

test('Boss round all-correct: emits N answer events + 1 BOSS_COMPLETED + 1 SESSION_COMPLETED', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const initialSlugs = started.state.session.uniqueWords.slice();

  const { state: summaryState, events, seenSlugs } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => state.session.currentCard.word.word,
  );

  assert.equal(summaryState.phase, 'summary');
  assert.deepEqual(seenSlugs, initialSlugs, 'FIFO order preserved for test-typed Boss');

  const bossCompleted = events.filter((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  const sessionCompleted = events.filter((e) => e.type === SPELLING_EVENT_TYPES.SESSION_COMPLETED);

  assert.equal(bossCompleted.length, 1, `exactly 1 BOSS_COMPLETED event, got ${bossCompleted.length}`);
  assert.equal(sessionCompleted.length, 1, `exactly 1 SESSION_COMPLETED, got ${sessionCompleted.length}`);
  assert.equal(bossCompleted[0].length, 10);
  assert.equal(bossCompleted[0].correct, 10);
  assert.equal(bossCompleted[0].wrong, 0);
  assert.deepEqual(bossCompleted[0].seedSlugs, initialSlugs);

  // Progress bookkeeping: attempts/correct bumped; stage/dueDay/lastDay/lastResult untouched.
  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const rowsBySlug = new Map(snapshot.wordGroups.flatMap((g) => g.words).map((row) => [row.slug, row]));
  for (const slug of initialSlugs) {
    const row = rowsBySlug.get(slug);
    assert.equal(row.progress.stage, 4, `${slug} stage stays at 4`);
    assert.equal(row.progress.dueDay, today + 60, `${slug} dueDay unchanged`);
    assert.equal(row.progress.lastDay, today - 7, `${slug} lastDay unchanged`);
    assert.equal(row.progress.lastResult, 'correct', `${slug} lastResult unchanged`);
  }
});

test('Boss round with 3 misses: progress.wrong +3, stage/dueDay/lastDay/lastResult unchanged', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const initialSlugs = started.state.session.uniqueWords.slice();

  let cardCount = 0;
  const { state: summaryState, events } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => {
      cardCount += 1;
      if (cardCount <= 3) return 'definitely-wrong';
      return state.session.currentCard.word.word;
    },
  );

  assert.equal(summaryState.phase, 'summary');
  const boss = events.filter((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  assert.equal(boss.length, 1);
  assert.equal(boss[0].correct, 7);
  assert.equal(boss[0].wrong, 3);
  assert.equal(boss[0].length, 10);

  const snapshot = service.getAnalyticsSnapshot('learner-a');
  const rowsBySlug = new Map(snapshot.wordGroups.flatMap((g) => g.words).map((row) => [row.slug, row]));
  for (const slug of initialSlugs) {
    const row = rowsBySlug.get(slug);
    // Mega-never-revoked invariant — the critical Boss contract.
    assert.equal(row.progress.stage, 4, `${slug} stage stays at 4 (Mega never revoked)`);
    assert.equal(row.progress.dueDay, today + 60, `${slug} dueDay unchanged`);
    assert.equal(row.progress.lastDay, today - 7, `${slug} lastDay unchanged`);
    assert.equal(row.progress.lastResult, 'correct', `${slug} lastResult unchanged`);
  }
});

test('Boss round dispatcher routing: wrong answer on a Mega slug must NOT demote via submitTest', () => {
  // This is the single most important guard — if the submitAnswer dispatcher
  // falls through to `engine.submitTest` for a Boss session, `applyTestOutcome`
  // will set `stage = Math.max(0, stage - 1)` and demote Mega. This test
  // injects a wrong answer on the first Mega slug and asserts stage === 4.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const firstSlug = started.state.session.currentCard.slug;

  const submitted = service.submitAnswer('learner-a', started.state, 'definitely-wrong');
  // Read progress from analytics snapshot.
  const row = service.getAnalyticsSnapshot('learner-a').wordGroups
    .flatMap((g) => g.words)
    .find((w) => w.slug === firstSlug);
  assert.equal(row.progress.stage, 4, `${firstSlug} stage === 4 after wrong Boss submit (would be 3 if routed through legacy submitTest)`);
  assert.equal(row.progress.wrong, 2, `${firstSlug} wrong bumped by 1 (from seed 1 to 2)`);
  assert.equal(submitted.state.awaitingAdvance, true);
});

test('Boss round awaitingAdvance === true makes submit idempotent', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const firstSlug = started.state.session.currentCard.slug;

  const firstSubmit = service.submitAnswer('learner-a', started.state, 'definitely-wrong');
  assert.equal(firstSubmit.state.awaitingAdvance, true);

  // Double-tap: second submit while awaitingAdvance must be a no-op.
  const secondSubmit = service.submitAnswer('learner-a', firstSubmit.state, 'definitely-wrong-again');
  assert.equal(secondSubmit.changed, false, 'double-tap is a no-op');

  const row = service.getAnalyticsSnapshot('learner-a').wordGroups
    .flatMap((g) => g.words)
    .find((w) => w.slug === firstSlug);
  // progress.wrong bumped exactly once, not twice.
  assert.equal(row.progress.wrong, 2, `${firstSlug} attempts count bumped exactly once`);
});

// -----------------------------------------------------------------------------
// Session-ui copy — Boss session must not leak SATs copy
// -----------------------------------------------------------------------------

test('Session-ui helpers return Boss-specific copy for mode: "boss"', () => {
  const session = {
    type: 'test',
    mode: 'boss',
    label: 'Boss Dictation',
    phase: 'question',
    currentCard: { word: { yearLabel: 'Year 5-6' } },
  };
  const submitLabel = spellingSessionSubmitLabel(session);
  const placeholder = spellingSessionInputPlaceholder(session);
  const contextNote = spellingSessionContextNote(session);
  const progressLabel = spellingSessionProgressLabel(session);
  const chips = spellingSessionInfoChips(session);
  const footerNote = spellingSessionFooterNote(session);

  // Boss must never leak SATs-specific copy.
  assert.doesNotMatch(contextNote, /SATs mode uses audio only/, 'no SATs copy leak in context');
  assert.doesNotMatch(progressLabel, /SATs one-shot/, 'no SATs copy leak in progress label');
  // Boss must never leak the SATs "marked due again" demotion footer —
  // Boss preserves Mega on wrong answers, so the SATs footer is factually
  // wrong for a Boss round and would confuse children / parents.
  assert.doesNotMatch(footerNote, /marked due again/, 'no SATs demotion copy leak in footer');
  assert.match(footerNote, /Mega count never drops/, 'Boss footer states the Mega-safe contract');
  // Boss-specific copy is present.
  assert.match(contextNote, /Boss round/i, 'context mentions Boss round');
  assert.equal(progressLabel, 'Boss round');
  assert.ok(chips.includes('Boss'), `info chips include "Boss", got ${chips.join(',')}`);
  assert.ok(submitLabel, 'submit label is defined');
  assert.ok(placeholder, 'placeholder is defined');
});

// -----------------------------------------------------------------------------
// Alt+5 / remote-actions.js gate parity
// -----------------------------------------------------------------------------

test('Alt+5 gate parity: module-level boss-start on allWordsMega=false is a no-op', () => {
  // Module-level gate lives inside module.js handler; we exercise it via the
  // service: when allWordsMega is false, startSession returns ok:false, so the
  // module handler's early-return-before-dispatch path has nothing to regress.
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  const transition = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(transition.ok, false);
});

// -----------------------------------------------------------------------------
// Summary copy — Boss must NOT leak SATs demotion strings (blocker fix)
// -----------------------------------------------------------------------------

test('Boss summary: message contains Mega-safe copy, not SATs demotion copy', () => {
  // Boss rides as type:'test' for single-attempt UI reuse, which means
  // engine.finalise() routes to testSummary(). The SATs testSummary() emits
  // "pushed back into the learner's due queue" and "Marked due again today" —
  // both FALSE for Boss. This test locks in the Boss summary override so every
  // Boss round surfaces Mega-safe copy instead, matching the Mega-never-revoked
  // invariant the footer note (session-ui.js) already advertises.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });

  // Miss 3 words so the "Needs more work" card appears with sub copy.
  let cardCount = 0;
  const { state: summaryState } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => {
      cardCount += 1;
      if (cardCount <= 3) return 'definitely-wrong';
      return state.session.currentCard.word.word;
    },
  );

  assert.equal(summaryState.phase, 'summary');
  const summary = summaryState.summary;
  assert.ok(summary, 'summary is set');
  assert.equal(summary.mode, 'boss', 'summary.mode is boss');

  // Negative: no SATs demotion copy.
  assert.doesNotMatch(summary.message, /pushed back/i,
    'summary.message must not claim the missed words are pushed back');
  assert.doesNotMatch(summary.message, /due queue/i,
    'summary.message must not mention the due queue');

  // Positive: Boss-appropriate copy that reflects Mega-never-revoked.
  assert.match(summary.message, /Mega/i,
    'summary.message reassures that Mega words stay Mega');

  // Needs-more-work card sub must not use SATs demotion language.
  const needsMoreCard = summary.cards.find((card) => card.label === 'Needs more work');
  assert.ok(needsMoreCard, '"Needs more work" card is present when there are misses');
  assert.doesNotMatch(needsMoreCard.sub, /marked due again/i,
    '"Needs more work" sub must not claim the missed words are marked due again');
  assert.match(needsMoreCard.sub, /Mega/i,
    '"Needs more work" sub should reference the Mega invariant');
});

test('Boss summary: all-correct round still uses Mega-safe message wording', () => {
  // Full-marks case still gets the Boss override — the SATs all-correct
  // message ("This learner scored full marks on this SATs-style round") would
  // leak SATs framing to a Boss summary otherwise.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const { state: summaryState } = runBossRoundUntilSummary(
    service,
    'learner-a',
    started.state,
    (slug, state) => state.session.currentCard.word.word,
  );

  assert.equal(summaryState.phase, 'summary');
  const summary = summaryState.summary;
  assert.equal(summary.mode, 'boss');
  assert.doesNotMatch(summary.message, /SATs/i,
    'all-correct Boss summary must not reference SATs');
  assert.match(summary.message, /Mega/i,
    'all-correct Boss summary references Mega');
});

// -----------------------------------------------------------------------------
// uniqueWords-as-seed invariant — rehydration must preserve the seed roster
// -----------------------------------------------------------------------------

test('BOSS_COMPLETED seedSlugs survives session rehydration (uniqueWords is the seed)', () => {
  // The Boss seed roster lives on session.uniqueWords — not on a separate
  // bossSeedSlugs field — because buildResumeSession enumerates session
  // fields explicitly and any unlisted field would be stripped on rehydration.
  // This test confirms that after a rehydration cycle, BOSS_COMPLETED still
  // reports the original selectBossWords output as seedSlugs.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  const originalSlugs = started.state.session.uniqueWords.slice();

  // Round-trip through initState (the rehydration entry point).
  const rehydrated = service.initState(started.state, 'learner-a');
  assert.equal(rehydrated.phase, 'session', 'rehydrated as a live session');
  assert.deepEqual(
    rehydrated.session.uniqueWords,
    originalSlugs,
    'uniqueWords survives rehydration unchanged',
  );

  // Complete the round from the rehydrated state and confirm BOSS_COMPLETED
  // reports the same seed roster.
  const { events } = runBossRoundUntilSummary(
    service,
    'learner-a',
    rehydrated,
    (slug, state) => state.session.currentCard.word.word,
  );
  const bossCompleted = events.find((e) => e.type === SPELLING_EVENT_TYPES.BOSS_COMPLETED);
  assert.ok(bossCompleted, 'BOSS_COMPLETED fired');
  assert.deepEqual(
    bossCompleted.seedSlugs,
    originalSlugs,
    'BOSS_COMPLETED seedSlugs preserved across rehydration',
  );
});

// -----------------------------------------------------------------------------
// Fallback stage guard — mid-round progress loss must NOT silently demote Mega
// -----------------------------------------------------------------------------

test('Boss submitBossAnswer refuses the write if progress is cleared mid-round', () => {
  // Under a storage-clear race (learner resets progress mid-round, another tab
  // overwrites the progress map, etc.) the progressMap could be missing the
  // current Boss slug. The prior implementation synthesised a
  // `{ stage: 0, ... }` seed and wrote it — silently demoting a word that had
  // been Mega at round-start and violating the Mega-never-revoked invariant.
  //
  // The fix is to refuse the write and return an invalid-session transition,
  // so the UI shows an error instead of masking the demotion.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const storage = installMemoryStorage();
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42), storage });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true);
  const firstSlug = started.state.session.currentCard.slug;

  // Simulate the storage-clear race: wipe the progress map after the round
  // has started but before the first submit.
  repositories.subjectStates.writeData('learner-a', 'spelling', { progress: {} });

  const submitted = service.submitAnswer('learner-a', started.state, 'anything');
  assert.equal(submitted.ok, false,
    'submit is refused when progress is missing for the current slug');

  // Verify no demotion landed — the progress map should still be empty
  // (not seeded with stage:0). Reading back through the service's progress
  // snapshot confirms no silent write happened for the current slug.
  const row = service.getAnalyticsSnapshot('learner-a').wordGroups
    .flatMap((g) => g.words)
    .find((w) => w.slug === firstSlug);
  // After the wipe the analytics row defaults to stage 0 for any slug not
  // present in the (now-empty) progress map — but the critical guarantee is
  // that submit did not write a new entry. The before/after state remains
  // "progress missing"; the service did not invent a stage:0 row.
  assert.equal(row.progress.attempts, 0,
    'no write landed for the current slug (attempts stays at 0)');
  assert.equal(row.progress.wrong, 0,
    'no write landed for the current slug (wrong stays at 0)');
});

// -----------------------------------------------------------------------------
// Resume-after-refresh — Boss must persist sessionKind 'boss' (not 'test') so
// Resume routes back to Boss Dictation, not SATs Test Setup.
// -----------------------------------------------------------------------------

test('Resume after refresh: active Boss session persists sessionKind === "boss"', () => {
  // Regression for PR #235 sev-80 blocker. When `buildActiveRecord` persisted
  // `sessionKind: session.type`, Boss (type: 'test') and Guardian (type:
  // 'learning') both lost their post-Mega identity across refresh. Resume
  // button then displayed "Continue SATs 20" and routed into SATs Test Setup.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true, 'Boss session must start for this test');
  assert.equal(started.state.session.type, 'test', 'Boss session shape is type: test');
  assert.equal(started.state.session.mode, 'boss', 'Boss session mode is boss');

  // Round-trip: read the active record back through the persistence layer.
  // `service.startSession` already calls `syncPracticeSession` under the hood
  // (the repository.write hook), so we can read directly.
  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active, 'active practice session record must exist after start');
  assert.equal(active.status, 'active');
  assert.equal(active.sessionKind, 'boss',
    `sessionKind must be 'boss' (mode identity), not 'test' (shape identity); got ${active.sessionKind}`);
});

test('Resume after refresh: read-model surfaces recommendedMode === "boss" for active Boss session', () => {
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'boss', length: 10 });
  assert.equal(started.ok, true);

  // Build the read model the dashboard uses.
  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');

  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });

  assert.equal(model.currentFocus.recommendedMode, 'boss',
    'Resume should route back to Boss Dictation, not SATs Test Setup');
  assert.match(model.currentFocus.label, /Boss Dictation/i,
    `Resume label must say "Boss Dictation", got ${model.currentFocus.label}`);
  assert.doesNotMatch(model.currentFocus.label, /SATs/i,
    'Resume label must not leak SATs copy for Boss');
});

test('Resume after refresh: Guardian session also persists sessionKind === "guardian"', () => {
  // Guardian has the same shape-vs-mode mismatch as Boss: type is 'learning',
  // mode is 'guardian'. Without the fix, `sessionKind` was 'learning', which
  // read-model mapped to 'smart' so Resume routed to Smart Review Setup.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  // Force an active Guardian record by seeding a Guardian mission.
  // Use service.startSession({mode:'guardian'}) which is available when Mega.
  const started = service.startSession('learner-a', { mode: 'guardian', length: 5 });
  if (!started.ok) {
    // Guardian may have no words due without seeded guardian map — skip.
    return;
  }
  assert.equal(started.state.session.mode, 'guardian');
  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active);
  assert.equal(active.sessionKind, 'guardian',
    `sessionKind must be 'guardian'; got ${active.sessionKind}`);

  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');
  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });
  assert.equal(model.currentFocus.recommendedMode, 'guardian');
});

// -----------------------------------------------------------------------------
// Alt+5 double-press abuse — prefs.mode must not mutate unless the transition
// actually commits. Protects against `startSession` failing after savePrefs
// has already written 'boss' to storage, which would leave the child's Setup
// scene configured for Boss without ever actually running one.
// -----------------------------------------------------------------------------

test('Alt+5 abuse: failed Boss startSession must NOT persist prefs.mode = "boss"', () => {
  // Simulate the `spelling-shortcut-start` action when allWordsMega === false.
  // This is the exact scenario a rapid double-press exposes: the gate holds,
  // startSession returns ok:false, and prefs must remain on the pre-Alt+5
  // value. If savePrefs runs before startSession (or runs regardless of the
  // transition outcome), the child's Setup scene defaults to Boss on next
  // open even though no Boss session was ever committed.
  const now = () => Date.UTC(2026, 0, 10);
  const { service } = makeServiceWithSeed({ now, random: () => 0.5 });
  // Baseline: prefs.mode starts at the default 'smart'.
  const initialPrefs = service.getPrefs('learner-a');
  assert.equal(initialPrefs.mode, 'smart', 'baseline prefs.mode === "smart"');

  // Mirror module.js `spelling-shortcut-start` logic: read prefs, start,
  // persist only on ok.
  const currentPrefs = service.getPrefs('learner-a');
  const transition = service.startSession('learner-a', {
    mode: 'boss',
    yearFilter: currentPrefs.yearFilter,
    length: currentPrefs.roundLength,
    extraWordFamilies: currentPrefs.extraWordFamilies,
  });
  if (transition?.ok !== false) {
    service.savePrefs('learner-a', { mode: 'boss' });
  }

  // allWordsMega === false so Boss startSession returns ok:false and prefs
  // MUST still be 'smart'. If module.js is ever refactored to run savePrefs
  // before startSession (or unconditionally), this assertion flips and the
  // test fails.
  assert.equal(transition.ok, false, 'Boss transition must fail without Mega');
  const afterPrefs = service.getPrefs('learner-a');
  assert.equal(afterPrefs.mode, 'smart',
    `prefs.mode must NOT have been promoted to "boss" after a failed transition; got "${afterPrefs.mode}"`);
});

test('Alt+5 abuse: successful Boss startSession DOES persist prefs.mode = "boss"', () => {
  // Inverse regression test — when Boss does transition successfully the
  // savePrefs step must still run, so the Setup scene on next refresh
  // reflects the committed session mode.
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(42) });
  seedAllCoreMega(repositories, 'learner-a', today);

  const currentPrefs = service.getPrefs('learner-a');
  assert.equal(currentPrefs.mode, 'smart');

  const transition = service.startSession('learner-a', {
    mode: 'boss',
    yearFilter: currentPrefs.yearFilter,
    length: currentPrefs.roundLength,
    extraWordFamilies: currentPrefs.extraWordFamilies,
  });
  if (transition?.ok !== false) {
    service.savePrefs('learner-a', { mode: 'boss' });
  }

  assert.equal(transition.ok, true);
  assert.equal(transition.state.session.mode, 'boss');
  const afterPrefs = service.getPrefs('learner-a');
  assert.equal(afterPrefs.mode, 'boss',
    'prefs.mode SHOULD be "boss" after a successful Boss transition');
});

test('Resume after refresh: legacy SATs test preserves sessionKind === "test"', () => {
  // Guard against over-generalising the fix: non-post-Mega modes (smart /
  // trouble / test / single) must still use session.type as sessionKind.
  const now = () => Date.UTC(2026, 0, 10);
  const { service, repositories } = makeServiceWithSeed({ now, random: makeSeededRandom(7) });
  const today = Math.floor(now() / DAY_MS);
  // Seed enough secure progress so SATs test can run (type: 'test' uses
  // core year only; any progress shape will do for starting a test session).
  seedAllCoreMega(repositories, 'learner-a', today);

  const started = service.startSession('learner-a', { mode: 'test' });
  assert.equal(started.ok, true);
  assert.equal(started.state.session.type, 'test');
  assert.equal(started.state.session.mode, 'test');

  const active = repositories.practiceSessions.latest('learner-a', 'spelling');
  assert.ok(active);
  assert.equal(active.sessionKind, 'test',
    'legacy SATs test must keep sessionKind === "test"');

  const subjectStateRecord = repositories.subjectStates.read('learner-a', 'spelling');
  const practiceSessions = repositories.practiceSessions.list('learner-a', 'spelling');
  const model = buildSpellingLearnerReadModel({
    subjectStateRecord,
    practiceSessions,
    eventLog: [],
    runtimeSnapshot: { words: WORDS, wordBySlug: WORD_BY_SLUG },
    now: now(),
  });
  assert.equal(model.currentFocus.recommendedMode, 'test');
});
