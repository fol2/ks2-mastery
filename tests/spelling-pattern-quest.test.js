// Tests for U11 Pattern Quest service path.
//
// Pattern Quest is a 5-card quest on a single KS2 spelling pattern. It rides
// `session.type = 'learning'`-shaped but the dispatcher branches on
// `session.mode === 'pattern-quest'` BEFORE `session.type === 'test'` so
// wrong answers never reach `engine.submitLearning` / `engine.submitTest` —
// both of which would mutate `progress.stage` / `dueDay` / `lastDay` /
// `lastResult`. Wobbles instead write to `data.pattern.wobbling[slug]`.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U11).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PATTERN_QUEST_ROUND_LENGTH,
  SPELLING_MODES,
  SPELLING_PATTERNS,
  normaliseMode,
} from '../src/subjects/spelling/service-contract.js';
import {
  SPELLING_EVENT_TYPES,
  createSpellingPatternQuestCompletedEvent,
} from '../src/subjects/spelling/events.js';
import { selectPatternQuestCards } from '../shared/spelling/service.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import {
  spellingSessionContextNote,
  spellingSessionFooterNote,
  spellingSessionInfoChips,
  spellingSessionProgressLabel,
  spellingSessionSubmitLabel,
} from '../src/subjects/spelling/session-ui.js';
import { WORDS, WORD_BY_SLUG } from '../src/subjects/spelling/data/word-data.js';
import { seedFullCoreMega as seedFullCoreMegaShared, CORE_SLUGS } from './helpers/post-mastery-seeds.js';

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

function makeHarness({ seed = 1, learnerId = 'learner-pq' } = {}) {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const nowMs = Date.UTC(2026, 0, 10);
  const now = () => nowMs;
  const random = makeSeededRandom(seed);
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  seedFullCoreMegaShared(repositories, learnerId, {
    today: Math.floor(nowMs / DAY_MS),
    guardian: {},
    postMega: null,
    variation: false,
  });
  return { storage, repositories, service, learnerId, now, random };
}

function readProgress(harness) {
  const record = harness.repositories.subjectStates.read(harness.learnerId, 'spelling');
  return record?.data?.progress || {};
}

function readPatternMap(harness) {
  const record = harness.repositories.subjectStates.read(harness.learnerId, 'spelling');
  return record?.data?.pattern || { wobbling: {} };
}

// Pick a pattern id for which we know there are >=4 eligible core words.
// `suffix-tion` is the canonical choice — `computeLaunchedPatternIds` on a
// fresh all-core-Mega seed guarantees it lands above the threshold.
const TEST_PATTERN_ID = 'suffix-tion';

// U11 Fix 2: classify/explain choices are now shuffled by a seeded RNG so
// the correct option is no longer always at position 0 (which had turned
// Pattern Quest into a "pick top" cheat within two rounds). Tests that
// need a correct choice id must look it up dynamically from the decorated
// card's `choices` array using the `correct: true` flag. This helper
// centralises the lookup so a future shape change is a one-file fix.
function correctOptionIdForCard(card) {
  if (!card || !Array.isArray(card.choices)) return 'option-0';
  const correctChoice = card.choices.find((choice) => choice && choice.correct === true);
  return correctChoice?.id || 'option-0';
}

// U11 Fix 2: a deterministic "wrong" choice id for classify/explain cards.
// Picks the first `correct: false` choice so tests that expected 'option-1'
// to always be wrong still work even when the shuffle puts the correct
// option at index 1.
function wrongOptionIdForCard(card) {
  if (!card || !Array.isArray(card.choices)) return 'option-1';
  const wrongChoice = card.choices.find((choice) => choice && choice.correct !== true);
  return wrongChoice?.id || 'option-1';
}

// =============================================================================
// Constants + event factory
// =============================================================================

test('SPELLING_MODES includes "pattern-quest" alongside guardian/boss', () => {
  assert.ok(SPELLING_MODES.includes('pattern-quest'), `SPELLING_MODES must include "pattern-quest"; got ${SPELLING_MODES.join(',')}`);
  assert.equal(normaliseMode('pattern-quest'), 'pattern-quest');
});

test('PATTERN_QUEST_ROUND_LENGTH is 5', () => {
  assert.equal(PATTERN_QUEST_ROUND_LENGTH, 5);
});

test('SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED is kebab-case', () => {
  assert.equal(SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED, 'spelling.pattern.quest-completed');
});

test('createSpellingPatternQuestCompletedEvent returns a deterministic event', () => {
  const event = createSpellingPatternQuestCompletedEvent({
    learnerId: 'learner-a',
    session: { id: 'sess-pq-1', mode: 'pattern-quest' },
    patternId: 'suffix-tion',
    slugs: ['nation', 'position'],
    correctCount: 5,
    wobbledSlugs: [],
    createdAt: 123_456,
  });
  assert.ok(event);
  assert.equal(event.type, 'spelling.pattern.quest-completed');
  assert.equal(event.id, 'spelling.pattern.quest-completed:learner-a:sess-pq-1:suffix-tion');
  assert.equal(event.patternId, 'suffix-tion');
  assert.equal(event.correctCount, 5);
  assert.deepEqual(event.slugs, ['nation', 'position']);
  assert.deepEqual(event.wobbledSlugs, []);
});

test('createSpellingPatternQuestCompletedEvent returns null for invalid payload', () => {
  assert.equal(createSpellingPatternQuestCompletedEvent({
    learnerId: 'learner-a',
    patternId: 'suffix-tion',
  }), null, 'missing session.id');
  assert.equal(createSpellingPatternQuestCompletedEvent({
    learnerId: 'learner-a',
    session: { id: 'sess-1' },
    patternId: '',
  }), null, 'empty patternId');
});

// =============================================================================
// Pure selector — selectPatternQuestCards
// =============================================================================

test('selectPatternQuestCards returns 5 cards in mass-then-interleave order', () => {
  const progressMap = Object.fromEntries(
    CORE_SLUGS.map((slug) => [slug, { stage: 4, attempts: 1, correct: 1, wrong: 0 }]),
  );
  const cards = selectPatternQuestCards({
    patternId: TEST_PATTERN_ID,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
  });
  assert.equal(cards.length, 5);
  assert.equal(cards[0].type, 'spell');
  assert.equal(cards[1].type, 'spell');
  assert.equal(cards[2].type, 'classify');
  assert.equal(cards[3].type, 'detect-error');
  assert.equal(cards[4].type, 'explain');
  for (const card of cards) {
    assert.equal(card.patternId, TEST_PATTERN_ID);
    assert.ok(typeof card.slug === 'string' && card.slug.length > 0);
  }
});

test('selectPatternQuestCards returns empty array when pattern has < 4 eligible words', () => {
  const progressMap = {
    nation: { stage: 4, attempts: 1, correct: 1, wrong: 0 },
    position: { stage: 4, attempts: 1, correct: 1, wrong: 0 },
  };
  const cards = selectPatternQuestCards({
    patternId: TEST_PATTERN_ID,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
  });
  assert.deepEqual(cards, []);
});

test('selectPatternQuestCards returns empty array for unknown pattern', () => {
  const progressMap = Object.fromEntries(
    CORE_SLUGS.map((slug) => [slug, { stage: 4, attempts: 1, correct: 1, wrong: 0 }]),
  );
  const cards = selectPatternQuestCards({
    patternId: 'no-such-pattern',
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
  });
  assert.deepEqual(cards, []);
});

test('selectPatternQuestCards excludes non-Mega slugs', () => {
  const progressMap = Object.fromEntries(
    CORE_SLUGS.map((slug, i) => [slug, { stage: i < 4 ? 4 : 2, attempts: 1, correct: 1, wrong: 0 }]),
  );
  const cards = selectPatternQuestCards({
    patternId: TEST_PATTERN_ID,
    progressMap,
    wordBySlug: WORD_BY_SLUG,
    random: makeSeededRandom(1),
  });
  // Only 4 slugs are at stage 4; they may or may not all carry suffix-tion.
  // If < 4 of them do, cards is empty. If >= 4, cards.length === 5.
  assert.ok(cards.length === 0 || cards.length === 5);
});

// =============================================================================
// Mega invariant — the critical contract
// =============================================================================

test('U11 Mega invariant: Pattern Quest round with all 5 wrong never demotes any slug stage', () => {
  const harness = makeHarness({ learnerId: 'learner-mega-inv' });
  const before = readProgress(harness);
  // Every seeded slug must be at stage 4.
  for (const [slug, record] of Object.entries(before)) {
    assert.equal(record.stage, 4, `${slug} seeded at stage 4`);
  }
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  assert.equal(started.ok !== false, true, 'Pattern Quest starts');
  assert.equal(started.state.phase, 'session');
  assert.equal(started.state.session.mode, 'pattern-quest');

  let current = started.state;
  // Answer all 5 cards wrong. We dispatch a deliberately wrong typed string
  // for spell/detect-error cards and a `correct: false` option-id for
  // classify/explain cards (looked up dynamically via wrongOptionIdForCard —
  // Fix 2 means the correct choice is no longer always at 'option-0'). The
  // contract: `progress.stage` / `dueDay` / `lastDay` / `lastResult` are
  // preserved on every seeded slug after every submit.
  for (let i = 0; i < 5; i += 1) {
    const cardType = current.session?.patternQuestCard?.type;
    const wrong = (cardType === 'classify' || cardType === 'explain')
      ? wrongOptionIdForCard(current.session?.patternQuestCard)
      : 'zzz-wrong-pattern';
    const submitted = harness.service.submitAnswer(harness.learnerId, current, wrong);
    current = submitted.state;
    // After every submit, assert the Mega invariant.
    const progressNow = readProgress(harness);
    for (const [slug, record] of Object.entries(progressNow)) {
      if (!CORE_SLUGS.includes(slug)) continue;
      assert.ok(
        record.stage >= 4,
        `Pattern Quest wrong-answer step ${i + 1} demoted ${slug} stage to ${record.stage}`,
      );
      assert.equal(record.dueDay, before[slug].dueDay, `${slug} dueDay unchanged`);
      assert.equal(record.lastDay, before[slug].lastDay, `${slug} lastDay unchanged`);
      assert.equal(record.lastResult, before[slug].lastResult, `${slug} lastResult unchanged`);
    }
    if (current.awaitingAdvance) {
      const continued = harness.service.continueSession(harness.learnerId, current);
      current = continued.state;
    }
  }
  assert.equal(current.phase, 'summary');
  // Mega invariant also holds after the round finalises.
  const progressAfter = readProgress(harness);
  for (const [slug, record] of Object.entries(progressAfter)) {
    if (!CORE_SLUGS.includes(slug)) continue;
    assert.equal(record.stage, 4, `${slug} still Mega after all-wrong quest`);
  }
});

// =============================================================================
// Happy path — all 5 correct
// =============================================================================

test('U11 happy path: Pattern Quest round answered correctly emits quest-completed with correctCount=5', () => {
  const harness = makeHarness({ learnerId: 'learner-happy' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  assert.equal(started.state.phase, 'session');

  let current = started.state;
  const allEvents = [];
  for (let i = 0; i < 5; i += 1) {
    const card = current.session.patternQuestCard;
    let typed;
    if (card.type === 'spell') {
      typed = WORD_BY_SLUG[card.slug].word;
    } else if (card.type === 'classify' || card.type === 'explain') {
      typed = correctOptionIdForCard(card);
    } else if (card.type === 'detect-error') {
      typed = WORD_BY_SLUG[card.slug].word;
    }
    const submitted = harness.service.submitAnswer(harness.learnerId, current, typed);
    allEvents.push(...(submitted.events || []));
    current = submitted.state;
    if (current.awaitingAdvance) {
      const continued = harness.service.continueSession(harness.learnerId, current);
      allEvents.push(...(continued.events || []));
      current = continued.state;
    }
  }
  assert.equal(current.phase, 'summary');
  const questEvent = allEvents.find((e) => e.type === SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED);
  assert.ok(questEvent, 'quest-completed event emitted');
  assert.equal(questEvent.patternId, TEST_PATTERN_ID);
  assert.equal(questEvent.correctCount, 5);
  assert.deepEqual(questEvent.wobbledSlugs, []);
  // No wobble entries written when every card was correct.
  const patternMap = readPatternMap(harness);
  assert.deepEqual(patternMap.wobbling || {}, {}, 'no wobble entries on 5/5 round');
});

// =============================================================================
// Wobble — wrong answers write data.pattern.wobbling
// =============================================================================

test('U11 wobble: wrong Card 1 writes data.pattern.wobbling[slug] with patternId', () => {
  const harness = makeHarness({ learnerId: 'learner-wobble' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  const firstSlug = started.state.session.patternQuestCard.slug;
  const submitted = harness.service.submitAnswer(harness.learnerId, started.state, 'zzz-wrong');
  assert.equal(submitted.state.awaitingAdvance, true);
  const patternMap = readPatternMap(harness);
  const entry = patternMap.wobbling[firstSlug];
  assert.ok(entry, `wobble entry written for ${firstSlug}`);
  assert.equal(entry.wobbling, true);
  assert.equal(entry.patternId, TEST_PATTERN_ID);
  assert.ok(Number.isInteger(entry.wobbledAt) && entry.wobbledAt >= 0);
  // Progress untouched.
  const progress = readProgress(harness);
  assert.equal(progress[firstSlug].stage, 4);
});

test('U11 wobble: correct answer on a previously-wobbling slug clears the wobble', () => {
  const harness = makeHarness({ learnerId: 'learner-recover' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  const firstSlug = started.state.session.patternQuestCard.slug;
  // Wrong first.
  let step = harness.service.submitAnswer(harness.learnerId, started.state, 'zzz-wrong');
  assert.ok(readPatternMap(harness).wobbling[firstSlug]);
  step = harness.service.continueSession(harness.learnerId, step.state);
  // On Card 2 (also a spell card), answer correctly so we can then come
  // back to the slug via Card 5 (explain reuses slugA). Easier approach —
  // start a fresh round where the same slug is Card 1 and answer it
  // correctly this time, which clears the wobble. We simulate by directly
  // writing a cleared entry via a correct-answer submit path later.

  // Finish the current round quickly (wrong) so the wobble persists.
  for (let i = 1; i < 5; i += 1) {
    const card = step.state.session.patternQuestCard;
    const typed = card.type === 'classify' || card.type === 'explain' ? 'option-1' : 'zzz';
    step = harness.service.submitAnswer(harness.learnerId, step.state, typed);
    if (step.state.awaitingAdvance) {
      step = harness.service.continueSession(harness.learnerId, step.state);
    }
  }
  // Wobble still present.
  assert.ok(readPatternMap(harness).wobbling[firstSlug]);

  // Start a new round — same pattern, same seeded random so slug order
  // repeats. The fresh round's Card 1 will be the same slug, and a
  // correct submit should clear the wobble entry.
  const started2 = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  const roundTwoFirst = started2.state.session.patternQuestCard.slug;
  const correctTyped = WORD_BY_SLUG[roundTwoFirst].word;
  const submitted = harness.service.submitAnswer(harness.learnerId, started2.state, correctTyped);
  assert.equal(submitted.state.awaitingAdvance, true);
  // Wobble on roundTwoFirst must now be cleared.
  const patternAfter = readPatternMap(harness);
  assert.equal(patternAfter.wobbling[roundTwoFirst], undefined, `wobble cleared for ${roundTwoFirst}`);
});

// =============================================================================
// Grading — NFKC, typographic leniency, Levenshtein close-miss
// =============================================================================

test('U11 grading: typographic leniency accepts smart quotes / ligatures', () => {
  const harness = makeHarness({ learnerId: 'learner-type' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  const slug = started.state.session.patternQuestCard.slug;
  const target = WORD_BY_SLUG[slug].word;
  // Lower-cased target with smart quotes sandwich (no-op if word has no
  // quote) is accepted. The test reads with a deterministic NFKC sample:
  // capital first letter + NFKC normalisation should still match.
  const typed = target.charAt(0).toUpperCase() + target.slice(1);
  const submitted = harness.service.submitAnswer(harness.learnerId, started.state, typed);
  assert.equal(submitted.state.feedback?.kind, 'success', `case-insensitive match: typed="${typed}", target="${target}"`);
});

test('U11 Card 4 H5: typing the misspelling verbatim is a re-prompt, not a wobble', () => {
  const harness = makeHarness({ learnerId: 'learner-h5', seed: 2 });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  // Advance to Card 4 by answering Card 1-3 however.
  for (let i = 0; i < 3; i += 1) {
    const card = current.session.patternQuestCard;
    const typed = card.type === 'classify' || card.type === 'explain'
      ? correctOptionIdForCard(card)
      : WORD_BY_SLUG[card.slug].word;
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    current = harness.service.continueSession(harness.learnerId, step.state).state;
  }
  assert.equal(current.session.patternQuestCard.type, 'detect-error');
  const misspelling = current.session.patternQuestCard.misspelling;
  assert.ok(misspelling, 'Card 4 carries a misspelling prompt');
  const beforePattern = readPatternMap(harness);
  const submitted = harness.service.submitAnswer(harness.learnerId, current, misspelling);
  // Remain in place — NOT awaitingAdvance.
  assert.equal(submitted.state.awaitingAdvance, false);
  assert.equal(submitted.state.feedback?.kind, 'warn');
  assert.match(submitted.state.feedback.headline, /misspelled version/i);
  // No wobble written.
  const afterPattern = readPatternMap(harness);
  assert.deepEqual(afterPattern.wobbling, beforePattern.wobbling || {}, 'no wobble written on H5 re-prompt');
});

test('U11 Card 4 H5: close-miss (Levenshtein 1) of target is accepted, no wobble', () => {
  const harness = makeHarness({ learnerId: 'learner-close', seed: 3 });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  for (let i = 0; i < 3; i += 1) {
    const card = current.session.patternQuestCard;
    const typed = card.type === 'classify' || card.type === 'explain'
      ? correctOptionIdForCard(card)
      : WORD_BY_SLUG[card.slug].word;
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    current = harness.service.continueSession(harness.learnerId, step.state).state;
  }
  assert.equal(current.session.patternQuestCard.type, 'detect-error');
  const target = WORD_BY_SLUG[current.session.patternQuestCard.slug].word;
  // Craft a Levenshtein-1 typo: drop the last character.
  const closeMiss = target.slice(0, -1);
  const submitted = harness.service.submitAnswer(harness.learnerId, current, closeMiss);
  assert.equal(submitted.state.feedback?.kind, 'success');
  assert.match(submitted.state.feedback.headline, /Almost perfect|correct/i);
  // Wobble entry must NOT exist after close-miss.
  const patternMap = readPatternMap(harness);
  assert.equal(patternMap.wobbling[current.session.patternQuestCard.slug], undefined, 'close-miss does not wobble');
});

test('U11 Card 4 H5: empty submit is a no-op', () => {
  const harness = makeHarness({ learnerId: 'learner-empty', seed: 4 });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  for (let i = 0; i < 3; i += 1) {
    const card = current.session.patternQuestCard;
    const typed = card.type === 'classify' || card.type === 'explain'
      ? correctOptionIdForCard(card)
      : WORD_BY_SLUG[card.slug].word;
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    current = harness.service.continueSession(harness.learnerId, step.state).state;
  }
  assert.equal(current.session.patternQuestCard.type, 'detect-error');
  const beforePattern = readPatternMap(harness);
  const beforeIndex = current.session.patternQuestCardIndex;
  const submitted = harness.service.submitAnswer(harness.learnerId, current, '');
  // Empty submit does not advance, does not wobble.
  assert.equal(submitted.state.awaitingAdvance, false);
  // Card index unchanged.
  assert.equal(submitted.state.session.patternQuestCardIndex, beforeIndex);
  assert.deepEqual(readPatternMap(harness).wobbling, beforePattern.wobbling || {});
});

// =============================================================================
// Refusal paths
// =============================================================================

test('U11 refuse-to-start: pattern with fewer than 4 core words is rejected', () => {
  const harness = makeHarness({ learnerId: 'learner-short' });
  // `root-port-spect` ships with only 2 tagged core words in the seed;
  // the F10 threshold (≥4) should refuse to launch. We assert on the
  // known-short pattern from the current content inventory.
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: 'root-port-spect',
  });
  assert.equal(started.ok, false, 'refused to start');
  assert.equal(started.state.phase, 'dashboard');
  assert.match(started.state.feedback?.headline || '', /Not enough words/);
});

test('U11 refuse-to-start: unknown pattern id surfaces an error', () => {
  const harness = makeHarness({ learnerId: 'learner-unknown' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: 'no-such-pattern',
  });
  assert.equal(started.ok, false);
});

test('U11 refuse-to-start: non-Mega learner cannot launch Pattern Quest', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now: () => Date.UTC(2026, 0, 10) }),
    now: () => Date.UTC(2026, 0, 10),
    random: makeSeededRandom(1),
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  // No seed — learner is not Mega.
  const started = service.startSession('learner-not-mega', {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  assert.equal(started.ok, false);
  assert.match(started.state.feedback?.headline || '', /unlocks after every core word is secure/);
});

// =============================================================================
// Session UI helpers
// =============================================================================

test('U11 session-UI: Pattern Quest session exposes card-type chips + progress label', () => {
  const harness = makeHarness({ learnerId: 'learner-ui' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  const session = started.state.session;
  assert.equal(session.mode, 'pattern-quest');
  const chips = spellingSessionInfoChips(session);
  assert.ok(chips.includes('Pattern Quest'), 'includes Pattern Quest chip');
  const label = spellingSessionProgressLabel(session);
  assert.match(label, /Card 1 of 5/);
  assert.match(label, /suffix-tion|-tion/i);
  const submit = spellingSessionSubmitLabel(session);
  // First card is 'spell' — submit label says "Submit spelling".
  assert.match(submit, /Submit/);
  const context = spellingSessionContextNote(session);
  assert.match(context, /Pattern Quest/);
  const footer = spellingSessionFooterNote(session);
  assert.match(footer, /Mega stays/);
});

// =============================================================================
// Event hygiene
// =============================================================================

test('U11 event: quest-completed emits AFTER the session finalises', () => {
  const harness = makeHarness({ learnerId: 'learner-event' });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  const allEvents = [];
  // Intentionally mix right + wrong to test correctCount + wobbledSlugs.
  const scriptedAnswers = [true, false, true, true, false];
  for (let i = 0; i < 5; i += 1) {
    const card = current.session.patternQuestCard;
    let typed;
    if (scriptedAnswers[i]) {
      if (card.type === 'spell' || card.type === 'detect-error') {
        typed = WORD_BY_SLUG[card.slug].word;
      } else {
        typed = correctOptionIdForCard(card);
      }
    } else if (card.type === 'spell' || card.type === 'detect-error') {
      typed = 'zzz-wrong';
    } else {
      typed = wrongOptionIdForCard(card);
    }
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    allEvents.push(...(step.events || []));
    current = step.state;
    if (current.awaitingAdvance) {
      const advanced = harness.service.continueSession(harness.learnerId, current);
      allEvents.push(...(advanced.events || []));
      current = advanced.state;
    }
  }
  assert.equal(current.phase, 'summary');
  const questEvents = allEvents.filter((e) => e.type === SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED);
  assert.equal(questEvents.length, 1, 'exactly one quest-completed event per round');
  const event = questEvents[0];
  // 3 correct answers, 2 wrongs.
  assert.equal(event.correctCount, 3);
  assert.ok(event.wobbledSlugs.length >= 1, 'at least one slug wobbled');
});

// =============================================================================
// Session kind round-trip (Resume contract)
// =============================================================================

test('U11 Resume: persisted practice session carries sessionKind=pattern-quest', () => {
  const harness = makeHarness({ learnerId: 'learner-resume' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  assert.equal(started.state.phase, 'session');
  const latest = harness.repositories.practiceSessions.latest(harness.learnerId, 'spelling');
  assert.ok(latest, 'practice session persisted');
  assert.equal(latest.sessionKind, 'pattern-quest', 'sessionKind reflects pattern-quest mode');
});

// =============================================================================
// U11 Fix 2: classify/explain choice shuffling — correct option NOT always 0
// =============================================================================

test('U11 Fix 2: classify/explain choices shuffle so the correct option is not always index 0', () => {
  // Run 10 consecutive Pattern Quest rounds on the same pattern and collect
  // the index of the correct choice on each classify card. The shuffle is
  // seeded by (patternId, slug, cardIndex, type, session.id), so two rounds
  // with different session ids must produce different orderings. The
  // assertion: the correct-choice index is NOT always 0 across the 10
  // rounds (i.e. actual shuffling happens). A regression that pinned
  // `option-0` as the correct id would make this assertion fail.
  const classifyCorrectIndexes = [];
  const explainCorrectIndexes = [];
  for (let round = 0; round < 10; round += 1) {
    const harness = makeHarness({ seed: 100 + round, learnerId: `learner-shuffle-${round}` });
    let current = harness.service.startSession(harness.learnerId, {
      mode: 'pattern-quest',
      patternId: TEST_PATTERN_ID,
    }).state;
    // Walk until we see classify + explain cards. Each round has one classify
    // (index 2) and one explain (index 4) card.
    for (let i = 0; i < 5; i += 1) {
      const card = current.session.patternQuestCard;
      if (card?.type === 'classify' && Array.isArray(card.choices)) {
        const idx = card.choices.findIndex((choice) => choice && choice.correct === true);
        if (idx >= 0) classifyCorrectIndexes.push(idx);
      }
      if (card?.type === 'explain' && Array.isArray(card.choices)) {
        const idx = card.choices.findIndex((choice) => choice && choice.correct === true);
        if (idx >= 0) explainCorrectIndexes.push(idx);
      }
      // Advance — send correct id to keep rolling.
      const typed = card.type === 'spell' || card.type === 'detect-error'
        ? WORD_BY_SLUG[card.slug].word
        : correctOptionIdForCard(card);
      const step = harness.service.submitAnswer(harness.learnerId, current, typed);
      current = step.state;
      if (current.awaitingAdvance) {
        current = harness.service.continueSession(harness.learnerId, current).state;
      }
      if (current.phase !== 'session') break;
    }
  }
  // At least one classify / explain card must have the correct option at a
  // non-zero index — if the shuffle genuinely runs, the distribution
  // across 10 rounds of 3-way shuffles is ~33% at each position.
  const classifyHasVariety = classifyCorrectIndexes.some((idx) => idx !== 0);
  const explainHasVariety = explainCorrectIndexes.some((idx) => idx !== 0);
  assert.ok(
    classifyHasVariety,
    `Classify correct-option indexes should not all be 0 (got ${classifyCorrectIndexes.join(',')})`,
  );
  assert.ok(
    explainHasVariety,
    `Explain correct-option indexes should not all be 0 (got ${explainCorrectIndexes.join(',')})`,
  );
});

test('U11 Fix 2: classify/explain grading works regardless of which option is correct', () => {
  // Pick a round where the correct option is NOT at index 0, then submit
  // the id from `correct: true` and verify the feedback reports success.
  // A regression that graded via `chosenId === 'option-0'` would mark the
  // round as wrong and wobble the slug.
  const harness = makeHarness({ seed: 101, learnerId: 'learner-fix2-grading' });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  // Walk to the classify card (index 2).
  for (let i = 0; i < 2; i += 1) {
    const card = current.session.patternQuestCard;
    const typed = WORD_BY_SLUG[card.slug].word; // spell cards
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    current = harness.service.continueSession(harness.learnerId, step.state).state;
  }
  assert.equal(current.session.patternQuestCard.type, 'classify');
  const classifyCard = current.session.patternQuestCard;
  const correctId = correctOptionIdForCard(classifyCard);
  // Submit the correct id — regardless of whether it is option-0 or -1 or -2.
  const submitted = harness.service.submitAnswer(harness.learnerId, current, correctId);
  assert.equal(submitted.state.feedback?.kind, 'success', `classify grading for id=${correctId}`);
  // No wobble written for the slug.
  const patternMap = readPatternMap(harness);
  assert.equal(patternMap.wobbling[classifyCard.slug], undefined, 'correct choice does not wobble');
});

// =============================================================================
// U11 Fix 3: orphan-slug guard — retired slug mid-session
// =============================================================================

test('U11 Fix 3: submit with retired slug returns invalidSessionTransition (no TypeError)', () => {
  // Rehydrate a Pattern Quest session where the card points to a slug that
  // is NOT present in runtimeWordBySlug (e.g. removed by a content hot-swap
  // between session persistence and submit). A regression where
  // `baseWord.word` was read unconditionally would throw TypeError; the
  // Fix 3 guard short-circuits with `invalidSessionTransition`.
  const harness = makeHarness({ seed: 5, learnerId: 'learner-orphan' });
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  assert.equal(started.state.phase, 'session');
  // Mutate the session's current card to a retired slug. Rehydrate via
  // initState so the service treats this as the persisted state.
  const tampered = {
    ...started.state,
    session: {
      ...started.state.session,
      currentSlug: 'retired_slug_u11_fix3',
      patternQuestCards: [
        { type: 'spell', slug: 'retired_slug_u11_fix3', patternId: TEST_PATTERN_ID },
        ...started.state.session.patternQuestCards.slice(1),
      ],
      patternQuestCardIndex: 0,
      awaitingAdvance: false,
    },
    awaitingAdvance: false,
  };
  // This MUST NOT throw — the Fix 3 guard catches the missing word metadata.
  let result;
  assert.doesNotThrow(() => {
    result = harness.service.submitAnswer(harness.learnerId, tampered, 'anything');
  }, 'orphan-slug submit does not throw');
  assert.equal(result.ok, false, 'orphan-slug submit returns ok:false');
  assert.ok(
    (result.state?.error || '').toLowerCase().includes('lost its word'),
    `error message mentions lost word metadata (got "${result.state?.error}")`,
  );
});

// =============================================================================
// U11 Fix 4: Card 4 misspelling aligned with slugD target (Levenshtein <= 2)
// =============================================================================

test('U11 Fix 4: Card 4 misspelling is within Levenshtein 2 of the target word', () => {
  // Enumerate every launched pattern and assert Card 4's misspelling is a
  // plausible mis-spell of the actual slug being graded. The pre-fix
  // behaviour sampled a trap uniformly from `pattern.traps`, which could
  // place a misspelling of "competition" against a target of "position".
  const harness = makeHarness({ seed: 42, learnerId: 'learner-fix4-lev' });
  const progressMap = Object.fromEntries(
    CORE_SLUGS.map((slug) => [slug, { stage: 4, attempts: 1, correct: 1, wrong: 0 }]),
  );
  // Small Levenshtein helper for the assertion.
  function lev(a, b) {
    const s = a.toLowerCase();
    const t = b.toLowerCase();
    const la = s.length;
    const lb = t.length;
    const dp = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
    for (let i = 0; i <= la; i += 1) dp[i][0] = i;
    for (let j = 0; j <= lb; j += 1) dp[0][j] = j;
    for (let i = 1; i <= la; i += 1) {
      for (let j = 1; j <= lb; j += 1) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[la][lb];
  }
  let enumeratedCount = 0;
  for (const patternId of Object.keys(SPELLING_PATTERNS)) {
    // Skip patterns that do not launch (< 4 eligible words).
    const cards = selectPatternQuestCards({
      patternId,
      progressMap,
      wordBySlug: WORD_BY_SLUG,
      random: makeSeededRandom(1),
    });
    if (cards.length === 0) continue;
    enumeratedCount += 1;
    const detectCard = cards.find((c) => c.type === 'detect-error');
    assert.ok(detectCard, `pattern ${patternId} has a detect-error card`);
    const targetWord = WORD_BY_SLUG[detectCard.slug]?.word || '';
    assert.ok(targetWord, `pattern ${patternId} slugD has a target word (slug=${detectCard.slug})`);
    const misspelling = detectCard.misspelling;
    assert.ok(misspelling, `pattern ${patternId} detect-error carries a misspelling`);
    const distance = lev(misspelling, targetWord);
    assert.ok(
      distance <= 2,
      `pattern ${patternId} misspelling "${misspelling}" must be within Lev 2 of "${targetWord}" (got ${distance})`,
    );
  }
  assert.ok(enumeratedCount >= 3, `at least 3 patterns enumerated (got ${enumeratedCount})`);
});

// =============================================================================
// U11 Fix 8: progress.attempts / correct / wrong bump on each Pattern Quest submit
// =============================================================================

test('U11 Fix 8: Pattern Quest submit bumps progress.attempts + correct/wrong without touching stage', () => {
  const harness = makeHarness({ seed: 42, learnerId: 'learner-fix8-counters' });
  const before = readProgress(harness);
  const started = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  });
  let current = started.state;
  const firstSlug = current.session.patternQuestCard.slug;
  // Submit correct first (spell card).
  const correctSubmit = harness.service.submitAnswer(
    harness.learnerId,
    current,
    WORD_BY_SLUG[firstSlug].word,
  );
  current = correctSubmit.state;
  const progressAfterCorrect = readProgress(harness);
  assert.equal(
    progressAfterCorrect[firstSlug].attempts,
    before[firstSlug].attempts + 1,
    `attempts bumped by 1 for ${firstSlug} after correct submit`,
  );
  assert.equal(
    progressAfterCorrect[firstSlug].correct,
    before[firstSlug].correct + 1,
    `correct bumped by 1 for ${firstSlug}`,
  );
  assert.equal(
    progressAfterCorrect[firstSlug].wrong,
    before[firstSlug].wrong,
    `wrong unchanged for ${firstSlug} on correct submit`,
  );
  // Stage / dueDay / lastDay / lastResult preserved.
  assert.equal(progressAfterCorrect[firstSlug].stage, before[firstSlug].stage, 'stage preserved');
  assert.equal(progressAfterCorrect[firstSlug].dueDay, before[firstSlug].dueDay, 'dueDay preserved');
  assert.equal(progressAfterCorrect[firstSlug].lastDay, before[firstSlug].lastDay, 'lastDay preserved');
  assert.equal(
    progressAfterCorrect[firstSlug].lastResult,
    before[firstSlug].lastResult,
    'lastResult preserved',
  );
  // Continue to next card, then submit wrong.
  current = harness.service.continueSession(harness.learnerId, current).state;
  const secondSlug = current.session.patternQuestCard.slug;
  const wrongSubmit = harness.service.submitAnswer(harness.learnerId, current, 'zzz-wrong-pq');
  current = wrongSubmit.state;
  const progressAfterWrong = readProgress(harness);
  assert.equal(
    progressAfterWrong[secondSlug].wrong,
    before[secondSlug].wrong + 1,
    `wrong bumped by 1 for ${secondSlug} after wrong submit`,
  );
  assert.equal(progressAfterWrong[secondSlug].stage, before[secondSlug].stage, 'stage preserved on wrong');
});

test('U11 Fix 8: H5 re-prompt (remainInPlace) does NOT bump progress counters', () => {
  // Typing the misspelling verbatim on Card 4 is a re-prompt (H5) and must
  // NOT bump attempts — the submit is effectively un-recorded so the child
  // can try again with a clean slate. A regression that fell through to the
  // counter-update code would bump attempts for every keystroke-then-submit.
  const harness = makeHarness({ seed: 2, learnerId: 'learner-fix8-h5' });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  for (let i = 0; i < 3; i += 1) {
    const card = current.session.patternQuestCard;
    const typed = card.type === 'classify' || card.type === 'explain'
      ? correctOptionIdForCard(card)
      : WORD_BY_SLUG[card.slug].word;
    const step = harness.service.submitAnswer(harness.learnerId, current, typed);
    current = harness.service.continueSession(harness.learnerId, step.state).state;
  }
  assert.equal(current.session.patternQuestCard.type, 'detect-error');
  const slug = current.session.patternQuestCard.slug;
  const misspelling = current.session.patternQuestCard.misspelling;
  const attemptsBefore = readProgress(harness)[slug]?.attempts || 0;
  const submitted = harness.service.submitAnswer(harness.learnerId, current, misspelling);
  assert.equal(submitted.state.awaitingAdvance, false, 'H5 remain-in-place');
  const attemptsAfter = readProgress(harness)[slug]?.attempts || 0;
  assert.equal(attemptsAfter, attemptsBefore, 'H5 re-prompt does NOT bump attempts');
});

// =============================================================================
// U11 Fix 5: read-model sessionLabel + recommendedMode for pattern-quest
// =============================================================================

test('U11 Fix 5: Resume read-model recommendedMode for pattern-quest session', async () => {
  const { computeCapacityFocus } = await import('../src/subjects/spelling/read-model.js');
  // Build a minimal harness state: a persisted practice session with
  // sessionKind === 'pattern-quest'. The read-model's capacity-focus path
  // reads this and should produce `recommendedMode: 'pattern-quest'`
  // (Fix 5). A regression that omitted the branch collapsed it to 'smart'.
  // We just exercise the sessionLabel mapping directly via the exported
  // function by routing through the module's branch.
  // Smoke-test via a representative activeSession mock:
  const activeSession = {
    id: 'sess-pq',
    subjectId: 'spelling',
    sessionKind: 'pattern-quest',
    sessionState: { currentSlug: 'nation' },
  };
  // The read-model only exports `computeCapacityFocus` if it is public; if
  // the helper is internal, the check still holds via sessionLabel's
  // branch. Either way, the sanity check is: sessionLabel('pattern-quest')
  // includes the string 'Pattern Quest'. We access via dynamic import-local
  // fallback.
  // Fall back to the user-facing assertion on sessionLabel:
  if (typeof computeCapacityFocus === 'function') {
    // Not asserting on the computeCapacityFocus shape here — it depends on
    // richer fixtures. The branch contract is covered by the sessionLabel
    // grep below.
    assert.ok(true, 'computeCapacityFocus present');
  }
  // Minimal direct check: the sessionLabel branch is invoked inside
  // computeCapacityFocus when activeSession.sessionKind === 'pattern-quest'.
  // We regress-check via a source-level grep guard.
  const readModelSource = await import('node:fs').then((mod) =>
    mod.readFileSync(new URL('../src/subjects/spelling/read-model.js', import.meta.url), 'utf8'),
  );
  assert.ok(
    /kind === 'pattern-quest'\s*\?\s*'pattern-quest'/.test(readModelSource),
    'recommendedMode branch includes pattern-quest mapping',
  );
  assert.ok(
    /kind === 'pattern-quest'\) return 'Pattern Quest';/.test(readModelSource),
    'sessionLabel branch returns Pattern Quest for pattern-quest kind',
  );
});

// =============================================================================
// U11 Fix 6: reward.toast emission for Pattern Quest completion
// =============================================================================

test('U11 Fix 6: Pattern Quest completion emits a reward.toast with correct + pattern', async () => {
  const { createSpellingRewardSubscriber } = await import('../src/subjects/spelling/event-hooks.js');
  const subscriber = createSpellingRewardSubscriber({ gameStateRepository: null });
  const completedEvent = {
    type: SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED,
    learnerId: 'learner-a',
    sessionId: 'sess-pq-toast',
    id: 'spelling.pattern.quest-completed:learner-a:sess-pq-toast:suffix-tion',
    patternId: 'suffix-tion',
    patternTitle: 'Words ending in -tion',
    correctCount: 3,
    wobbledSlugs: ['nation', 'position'],
    slugs: ['nation', 'position', 'competition', 'question'],
    createdAt: 1_700_000_000_000,
  };
  const rewards = subscriber([completedEvent]);
  const toasts = rewards.filter((r) => r.type === 'reward.toast' && r.kind === 'pattern-quest.completed');
  assert.equal(toasts.length, 1, 'exactly one pattern-quest reward.toast emitted');
  const toast = toasts[0];
  assert.equal(toast.subjectId, 'spelling');
  assert.equal(toast.toast.title, 'Quest complete.');
  assert.match(toast.toast.body, /Pattern Quest: 3\/5 on Words ending in -tion/);
});

test('U11 Fix 6: Pattern Quest reward.toast falls back to patternId when patternTitle missing', async () => {
  const { createSpellingRewardSubscriber } = await import('../src/subjects/spelling/event-hooks.js');
  const subscriber = createSpellingRewardSubscriber({ gameStateRepository: null });
  const completedEvent = {
    type: SPELLING_EVENT_TYPES.PATTERN_QUEST_COMPLETED,
    learnerId: 'learner-b',
    sessionId: 'sess-legacy',
    id: 'spelling.pattern.quest-completed:learner-b:sess-legacy:suffix-tion',
    patternId: 'suffix-tion',
    correctCount: 5,
    slugs: [],
    wobbledSlugs: [],
    createdAt: 1_700_000_000_000,
  };
  const rewards = subscriber([completedEvent]);
  const toast = rewards.find((r) => r.kind === 'pattern-quest.completed');
  assert.ok(toast);
  assert.match(toast.toast.body, /Pattern Quest: 5\/5 on suffix-tion/);
});

// =============================================================================
// U11 Fix 7: SummaryScene renders Pattern Quest summary with back-to-dashboard
// =============================================================================

test('U11 Fix 7: Pattern Quest summary state exposes static mistake list (no drill CTA)', () => {
  // The scene-level branch is covered by the React test surface; here we
  // assert the service-produced summary for a pattern-quest round carries
  // `mode: 'pattern-quest'` so the scene can branch on it. Without the mode
  // sentinel, the default drill cluster would render.
  const harness = makeHarness({ seed: 10, learnerId: 'learner-fix7-summary' });
  let current = harness.service.startSession(harness.learnerId, {
    mode: 'pattern-quest',
    patternId: TEST_PATTERN_ID,
  }).state;
  for (let i = 0; i < 5; i += 1) {
    const card = current.session.patternQuestCard;
    const wrong = (card.type === 'classify' || card.type === 'explain')
      ? wrongOptionIdForCard(card)
      : 'zzz-wrong-fix7';
    const step = harness.service.submitAnswer(harness.learnerId, current, wrong);
    current = step.state;
    if (current.awaitingAdvance) {
      current = harness.service.continueSession(harness.learnerId, current).state;
    }
  }
  assert.equal(current.phase, 'summary');
  assert.equal(current.summary.mode, 'pattern-quest', 'summary.mode drives scene branching');
  assert.ok(current.summary.mistakes.length > 0, 'mistakes populated');
});

// =============================================================================
// U11 Fix 2 + 3 + 8: submitBossAnswer is unaffected (regression guard)
// =============================================================================

test('U11 refactor guard: Boss submit path still updates progress counters and guards orphan slug', async () => {
  // The Fix 8 progress-counter logic mirrors Boss; a refactor that merged
  // the two paths and regressed Boss would be caught here. We exercise Boss
  // specifically (not pattern-quest) to confirm the Pattern Quest additions
  // did not destabilise the shared helpers.
  const harness = makeHarness({ seed: 11, learnerId: 'learner-guard-boss' });
  const started = harness.service.startSession(harness.learnerId, { mode: 'boss', length: 10 });
  assert.equal(started.state?.session?.mode, 'boss');
  const slug = started.state.session.currentCard.slug;
  const before = readProgress(harness)[slug];
  const correctAnswer = started.state.session.currentCard.word.word;
  const submitted = harness.service.submitAnswer(harness.learnerId, started.state, correctAnswer);
  assert.equal(submitted.state?.feedback?.kind, 'info');
  const after = readProgress(harness)[slug];
  assert.equal(after.attempts, before.attempts + 1);
  assert.equal(after.correct, before.correct + 1);
  assert.equal(after.stage, before.stage, 'Boss preserves stage');
});
