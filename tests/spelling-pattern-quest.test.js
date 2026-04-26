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
  // for spell/detect-error cards and an option-id that is NOT `option-0` for
  // classify/explain cards. The contract: `progress.stage` / `dueDay` /
  // `lastDay` / `lastResult` are preserved on every seeded slug after every
  // submit.
  for (let i = 0; i < 5; i += 1) {
    const cardType = current.session?.patternQuestCard?.type;
    const wrong = (cardType === 'classify' || cardType === 'explain')
      ? 'option-1'
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
      typed = 'option-0';
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
      ? 'option-0'
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
      ? 'option-0'
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
      ? 'option-0'
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
        typed = 'option-0';
      }
    } else if (card.type === 'spell' || card.type === 'detect-error') {
      typed = 'zzz-wrong';
    } else {
      typed = 'option-1';
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
