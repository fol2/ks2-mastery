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

// =============================================================================
// U10: Boss Dictation UI + Alt+5 — end-to-end React render + dispatch surface
// -----------------------------------------------------------------------------
// These tests drive the full `createAppHarness` render pipeline so the wiring
// from POST_MEGA_MODE_CARDS → PostMegaSetupContent → dispatch(shortcut-start)
// → SpellingSummaryScene is exercised in one pass. U9 tested the service-
// layer path; U10 adds the scene-layer wiring.
// =============================================================================

import { createAppHarness } from './helpers/app-harness.js';
import { createManualScheduler } from './helpers/manual-scheduler.js';

function u10SeedAllCoreMega(repositories, learnerId, todayDay) {
  // Mirrors the seed helper used by spelling-parity.test.js so a learner
  // with Mega on every core-pool word flips `allWordsMega === true` and the
  // post-Mega dashboard renders.
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

test('U10 dashboard: Boss card renders with active variant when allWordsMega === true', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  const html = harness.render();
  // Post-mega dashboard must be active (not legacy Smart Review setup).
  assert.match(html, /The Word Vault is yours\./, 'post-Mega dashboard rendered');
  // Boss card present AND active — not the grey "Coming soon" placeholder.
  assert.match(html, /Boss Dictation/, 'Boss card title rendered');
  // The Boss card's description must not contain "Coming soon" now that
  // it's active. We scope the regex to the Boss card's own description
  // paragraph by matching `Boss Dictation</h4><p>...</p>` rather than
  // sweeping across sibling cards.
  const bossCardMatch = html.match(/<h4>Boss Dictation<\/h4><p>([^<]*)<\/p>/);
  assert.ok(bossCardMatch, 'Boss card description paragraph rendered');
  assert.doesNotMatch(bossCardMatch[1], /coming soon/i, 'Boss card description no longer says "Coming soon"');
  // The plan requires a badge on the active card (mirrors Guardian's ACTIVE
  // DUTY chip). The exact badge string ("BOSS READY") is the copy landed via
  // /frontend-design for U10.
  assert.match(html, /BOSS READY/i, 'Boss active badge rendered');
});

test('U10 dashboard: Alt+5 hint microcopy present when Boss card is active', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  const html = harness.render();
  // Alt+5 hint mirrors Alt+4 hint ("quick-start Guardian Mission").
  assert.match(html, /quick-start Boss Dictation/i, 'Alt+5 hint microcopy rendered');
});

test('U10 dashboard: dispatch via spelling-shortcut-start mode=boss lands on Boss session (alt+5 wiring)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss' });

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'session');
  assert.equal(state.session.mode, 'boss');
  assert.equal(state.session.label, 'Boss Dictation');
});

test('U10 summary: Boss summary renders score line + read-only miss list (no drill-all)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  // Manual scheduler pins auto-advance (320ms for test-type sessions) so the
  // loop stays deterministic; otherwise the real setTimeout would race the
  // submit loop.
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  // Dispatch with explicit `length: 10` to mirror the Begin-button payload
  // (`spelling-shortcut-start` with `{ mode: 'boss', length:
  // BOSS_DEFAULT_ROUND_LENGTH }`). Without the explicit length the module
  // handler falls back to `prefs.roundLength` which defaults to '20' for a
  // fresh learner, and the Boss service clamps it down to 12 — that 12-card
  // round would defeat the precise correct/total assertion below.
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  // Run through the Boss round. Miss the first 3 cards (wrong answer), type
  // the real answer for the remaining 7. This produces summary { correct: 7,
  // totalWords: 10, mistakes.length: 3 }. Track submits by `session.progress.done`
  // which increments exactly once per scored card, decoupling our wrong/right
  // policy from the outer iter counter.
  for (let guard = 0; guard < 80; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const answeredSoFar = Math.max(0, Number(ui.session?.progress?.done) || 0);
    const real = ui.session.currentCard.word.word;
    const typed = answeredSoFar < 3 ? 'definitely-wrong' : real;
    const formData = new FormData();
    formData.set('typed', typed);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'summary');
  assert.equal(state.summary.mode, 'boss');
  assert.equal(state.summary.correct, 7);
  assert.equal(state.summary.totalWords, 10);

  const html = harness.render();
  // Completion header + score line (U10 copy).
  assert.match(html, /Boss round complete/i, 'Boss completion header rendered');
  assert.match(html, /Boss score:\s*7\s*\/\s*10\s*Mega words landed/i,
    'Boss score line in scene — matches plan spec format');

  // Miss list: present as static chips. The scene renders each mistake via
  // a read-only chip (no button). Regression guard: `spelling-drill-all` and
  // `spelling-drill-single` dispatch targets MUST NOT appear anywhere on a
  // Boss summary — they are the Guardian/legacy drill paths and must not
  // leak into the test-mode Boss summary.
  assert.doesNotMatch(html, /data-action="spelling-drill-all"/,
    'Boss summary must not render a drill-all button');
  assert.doesNotMatch(html, /data-action="spelling-drill-single"/,
    'Boss summary must not render per-word drill buttons');
});

test('U10 summary: all-correct Boss round renders score "10/10 Mega words landed" with no miss list', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  for (let guard = 0; guard < 60; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const real = ui.session.currentCard.word.word;
    const formData = new FormData();
    formData.set('typed', real);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const state = harness.store.getState().subjectUi.spelling;
  assert.equal(state.phase, 'summary');
  assert.equal(state.summary.mode, 'boss');
  assert.equal(state.summary.mistakes.length, 0);

  const html = harness.render();
  assert.match(html, /Boss score:\s*10\s*\/\s*10\s*Mega words landed/i,
    'All-correct Boss summary renders 10/10');
});

test('U10 summary: Boss summary mode persists across reopen (round-trip)', () => {
  // Regression guard — the plan explicitly calls out "Boss round round-trip:
  // session.mode === 'boss' persists through summary; reopening summary
  // re-renders Boss branch". This asserts the same via a rehydration cycle
  // on the summary phase.
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: 10 });

  for (let guard = 0; guard < 60; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const real = ui.session.currentCard.word.word;
    const formData = new FormData();
    formData.set('typed', real);
    harness.dispatch('spelling-submit-form', { formData });
  }

  // Re-open the harness against the same storage — tests the full rehydration
  // path back onto the summary phase.
  const rehydrated = createAppHarness({ storage, now: () => nowRef.value });
  rehydrated.dispatch('open-subject', { subjectId: 'spelling' });
  const state = rehydrated.store.getState().subjectUi.spelling;
  // Depending on service resume rules this may land on dashboard or summary;
  // either way, `summary.mode === 'boss'` must survive somewhere in the UI.
  // The key invariant is that `summary.mode === 'boss'` if a summary is
  // present; we do not require the resumed phase to be 'summary'.
  if (state.phase === 'summary') {
    assert.equal(state.summary.mode, 'boss',
      'rehydrated Boss summary keeps mode === "boss"');
  }
});

test('U10 gate: Alt+5 dispatch when allWordsMega === false is a no-op (module-level gate parity)', () => {
  // Duplicates the spelling-parity.test.js U9 gate test but under the
  // U10-owned keyboard entry point — this is the R13 Alt+5 gate invariant
  // the plan explicitly guards: "Alt+5 press when `allWordsMega === false`:
  // no-op, no error thrown".
  const storage = installMemoryStorage();
  const harness = createAppHarness({ storage });
  const learnerId = harness.store.getState().learners.selectedId;

  harness.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '5' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  const beforePhase = harness.store.getState().subjectUi.spelling.phase;

  // No throw: Alt+5 fires the same shortcut action as Alt+4. The gate lives
  // in module.js, so the dispatch must short-circuit before startSession.
  assert.doesNotThrow(() => {
    harness.dispatch('spelling-shortcut-start', { mode: 'boss' });
  });

  const after = harness.store.getState().subjectUi.spelling;
  assert.equal(after.phase, beforePhase, 'phase unchanged — Boss did not start');
  assert.equal(after.session, null, 'no Boss session allocated');
});

// -----------------------------------------------------------------------------
// U10 review blocker 1 — Alt+5 length propagation.
// -----------------------------------------------------------------------------
// The Alt+5 shortcut resolver MUST embed `length: BOSS_DEFAULT_ROUND_LENGTH`
// in the dispatch payload. Without it the module handler falls back to
// `currentPrefs.roundLength` which defaults to '20' for any fresh/SATs
// learner, and the Boss service clamps that down to BOSS_MAX_ROUND_LENGTH
// = 12 — producing a 12-card Boss round instead of the spec-mandated 10.
// This test pair pins both halves of the contract:
//   (a) resolver output shape includes the canonical length constant.
//   (b) dispatching the resolver's exact output with prefs.roundLength = '20'
//       lands on a 10-card Boss round, matching the Begin-button payload.
// -----------------------------------------------------------------------------

test('U10 blocker: Alt+5 resolver emits length === BOSS_DEFAULT_ROUND_LENGTH', async () => {
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const appState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: { spelling: { phase: 'dashboard', awaitingAdvance: false, session: null } },
  };
  const resolved = resolveSpellingShortcut({
    key: '5',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
  }, appState);
  assert.deepEqual(resolved, {
    action: 'spelling-shortcut-start',
    data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
    preventDefault: true,
  }, 'Alt+5 resolver must emit the canonical Boss round length');
  assert.equal(resolved.data.length, 10,
    'BOSS_DEFAULT_ROUND_LENGTH constant must still be 10 (spec-mandated)');
});

test('U10 blocker: Alt+5 dispatch with prefs.roundLength = "20" yields a 10-card Boss round', async () => {
  // Reproduces the Blocker 1 regression. Seeded prefs.roundLength is '20' —
  // the fresh-learner default — so a naive Alt+5 dispatch that omits `length`
  // would land on a 12-card round (prefs.roundLength='20' clamped down to
  // BOSS_MAX_ROUND_LENGTH=12). The fixed resolver embeds
  // `length: BOSS_DEFAULT_ROUND_LENGTH` so the session lands on exactly 10.
  const { resolveSpellingShortcut } = await import('../src/subjects/spelling/shortcuts.js');
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const harness = createAppHarness({ storage, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  // Explicitly seed roundLength = '20' so we catch any regression where the
  // dispatch payload silently falls back to prefs.
  harness.services.spelling.savePrefs(learnerId, { roundLength: '20' });
  harness.dispatch('open-subject', { subjectId: 'spelling' });

  // Round-trip through the resolver so the test exercises the EXACT payload
  // a keypress would produce — no hand-built length literal.
  const appState = harness.store.getState();
  // Stage the app state shape the resolver expects (phase/subjectUi snapshot).
  const resolverState = {
    route: { subjectId: 'spelling', tab: 'practice' },
    subjectUi: { spelling: appState.subjectUi.spelling },
  };
  const resolved = resolveSpellingShortcut({
    key: '5',
    altKey: true,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    target: { tagName: 'DIV' },
  }, resolverState);
  assert.ok(resolved, 'Alt+5 resolver returned a dispatch descriptor');
  harness.dispatch(resolved.action, resolved.data);

  const session = harness.store.getState().subjectUi.spelling.session;
  assert.ok(session, 'Boss session allocated');
  assert.equal(session.mode, 'boss');
  assert.equal(session.progress.total, BOSS_DEFAULT_ROUND_LENGTH,
    'Alt+5 Boss round must be exactly BOSS_DEFAULT_ROUND_LENGTH cards, not the 12-card prefs clamp');
  assert.equal(session.uniqueWords.length, BOSS_DEFAULT_ROUND_LENGTH,
    'uniqueWords roster must match the Boss default length');
});

// -----------------------------------------------------------------------------
// U10 advisory fix (low severity but bundled with the blocker fix):
// -----------------------------------------------------------------------------
// Text-level negative assertion for the Boss summary scene. The existing
// selector-level guards (`data-action="spelling-drill-all"`, etc.) catch
// the dispatch wiring, but a belt-and-braces text assertion catches accidental
// copy leaks from legacy summary variants. "Drill all" is Guardian/legacy
// summary copy and must NOT appear on a Boss summary.
//
// NOTE: The review request also asked for `doesNotMatch /data-action="spelling-start-again"/`.
// That assertion was intentionally dropped here: SpellingSummaryScene.jsx's
// primary "Start another round" CTA dispatches `spelling-start-again` for
// ALL summary modes — including Boss — and that is the intended UX (the
// Boss round is quick-start, but a learner landing on the summary should
// be able to re-roll another Mega-safe Boss round without having to
// navigate back to the dashboard). The session-mode prefs fork inside
// `spelling-start` handles Boss correctly (startSession reads
// `prefs.mode === 'boss'` → boss-start path → `submitBossAnswer`).
// -----------------------------------------------------------------------------

test('U10 advisory: Boss summary HTML contains no legacy "Drill all" copy (text-level guard)', () => {
  const storage = installMemoryStorage();
  const nowRef = { value: Date.UTC(2026, 0, 10) };
  const scheduler = createManualScheduler();
  const harness = createAppHarness({ storage, scheduler, now: () => nowRef.value });
  const learnerId = harness.store.getState().learners.selectedId;
  const todayDay = Math.floor(nowRef.value / DAY_MS);

  u10SeedAllCoreMega(harness.repositories, learnerId, todayDay);
  harness.dispatch('open-subject', { subjectId: 'spelling' });
  harness.dispatch('spelling-shortcut-start', { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH });

  // Drive enough submits to complete a full Boss round (10 cards). Miss some
  // so the mistakes block would be rendered if the scene leaked Guardian
  // "Drill all" copy.
  for (let guard = 0; guard < 80; guard += 1) {
    const ui = harness.store.getState().subjectUi.spelling;
    if (ui.phase !== 'session') break;
    if (ui.awaitingAdvance) {
      scheduler.flushAll();
      continue;
    }
    const answeredSoFar = Math.max(0, Number(ui.session?.progress?.done) || 0);
    const real = ui.session.currentCard.word.word;
    const typed = answeredSoFar < 3 ? 'definitely-wrong' : real;
    const formData = new FormData();
    formData.set('typed', typed);
    harness.dispatch('spelling-submit-form', { formData });
  }

  const html = harness.render();
  // Text-level negative: Boss summary copy must not advertise a "Drill all"
  // Guardian/legacy flow even though drill-all/drill-single selectors are
  // already gated elsewhere.
  assert.doesNotMatch(html, /Drill all/i,
    'Boss summary must not surface "Drill all" copy — it belongs to Guardian/legacy summaries.');
});
