import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODE_CARDS,
  POST_MEGA_MODE_CARDS,
  SPELLING_HERO_BACKGROUNDS,
  WORD_BANK_FILTER_IDS,
  WORD_BANK_GUARDIAN_CHIP_LABELS,
  WORD_BANK_GUARDIAN_FILTER_HINTS,
  WORD_BANK_GUARDIAN_FILTER_IDS,
  guardianLabel,
  guardianPracticeActionLabel,
  guardianSummaryCopy,
  guardianSummaryCards,
  heroBgForPostMega,
  heroBgForSession,
  heroBgForSetup,
  heroBgPreloadUrls,
  heroContrastProfileForBg,
  heroToneForBg,
  normalisePostMegaBranch,
  renderAction,
  summaryModeLabel,
  wordBankAggregateCards,
  wordBankAggregateStats,
  wordBankFilterMatchesStatus,
} from '../src/subjects/spelling/components/spelling-view-model.js';
import { spellingSessionSkipLabel } from '../src/subjects/spelling/session-ui.js';

function createEventStub() {
  return {
    preventDefaultCalled: 0,
    stopPropagationCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
    },
    stopPropagation() {
      this.stopPropagationCalled += 1;
    },
  };
}

test('renderAction ignores duplicate spelling flow actions while a view transition is in flight', async () => {
  const originalDocument = globalThis.document;
  const classOps = [];
  const calls = [];
  let flushCalls = 0;
  let resolveFinished = null;

  globalThis.document = {
    documentElement: {
      classList: {
        add(token) {
          classOps.push(['add', token]);
        },
        remove(token) {
          classOps.push(['remove', token]);
        },
      },
    },
    startViewTransition(callback) {
      callback();
      return {
        finished: new Promise((resolve) => {
          resolveFinished = resolve;
        }),
      };
    },
  };

  try {
    const firstEvent = createEventStub();
    renderAction({
      dispatch(action, payload) {
        calls.push([action, payload]);
      },
      flushSpellingDeferredAudio() {
        flushCalls += 1;
      },
    }, firstEvent, 'spelling-start');

    const duplicateEvent = createEventStub();
    renderAction({
      dispatch(action, payload) {
        calls.push([action, payload]);
      },
      flushSpellingDeferredAudio() {
        flushCalls += 1;
      },
    }, duplicateEvent, 'spelling-start');

    assert.equal(firstEvent.preventDefaultCalled, 1);
    assert.equal(firstEvent.stopPropagationCalled, 1);
    assert.equal(duplicateEvent.preventDefaultCalled, 1);
    assert.equal(duplicateEvent.stopPropagationCalled, 1);
    assert.deepEqual(calls.map(([action]) => action), ['spelling-start']);
    assert.equal(calls[0][1].deferAudioUntilFlowTransitionEnd, true);
    assert.equal(flushCalls, 0);

    resolveFinished?.();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(flushCalls, 1);

    renderAction({
      dispatch(action, payload) {
        calls.push([action, payload]);
      },
      flushSpellingDeferredAudio() {
        flushCalls += 1;
      },
    }, createEventStub(), 'spelling-start-again');

    assert.deepEqual(calls.map(([action]) => action), ['spelling-start', 'spelling-start-again']);
    assert.deepEqual(classOps, [
      ['add', 'spelling-flow-transition'],
      ['remove', 'spelling-flow-transition'],
      ['add', 'spelling-flow-transition'],
    ]);
  } finally {
    resolveFinished?.();
    await Promise.resolve();
    await Promise.resolve();
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});

test('renderAction keeps spelling start audio immediate when view transitions are unavailable', () => {
  const originalDocument = globalThis.document;
  const calls = [];

  globalThis.document = {
    documentElement: {
      classList: {
        add() {},
        remove() {},
      },
    },
  };

  try {
    renderAction({
      dispatch(action, payload) {
        calls.push([action, payload]);
      },
      flushSpellingDeferredAudio() {
        throw new Error('flush should not run without view transitions');
      },
    }, createEventStub(), 'spelling-start');

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'spelling-start');
    assert.equal(calls[0][1]?.deferAudioUntilFlowTransitionEnd, undefined);
  } finally {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});

// ----- U5: post-mega dashboard view-model -------------------------------------

test('POST_MEGA_MODE_CARDS is a frozen array of five cards in Guardian-first order (P2 U11)', () => {
  assert.equal(Array.isArray(POST_MEGA_MODE_CARDS), true);
  assert.equal(Object.isFrozen(POST_MEGA_MODE_CARDS), true);
  // U11 adds a third active card (Pattern Quest) so the total is 5.
  assert.equal(POST_MEGA_MODE_CARDS.length, 5);
  const ids = POST_MEGA_MODE_CARDS.map((card) => card.id);
  assert.deepEqual(ids, ['guardian', 'boss-dictation', 'pattern-quest', 'word-detective', 'story-challenge']);
});

// U10: Boss Dictation card flips from placeholder to active alongside Guardian.
// Guardian was active from the start of Phase P1; Boss joins in U10 so the
// dashboard shows TWO active duties rather than one. U11 adds Pattern Quest
// as a third active duty. Word Detective and Story Challenge stay as
// placeholders — the P2 roadmap still has them ahead.
test('POST_MEGA_MODE_CARDS: Guardian + Boss + Pattern Quest are active, remaining two are disabled placeholders (U11)', () => {
  const guardian = POST_MEGA_MODE_CARDS.find((card) => card.id === 'guardian');
  const boss = POST_MEGA_MODE_CARDS.find((card) => card.id === 'boss-dictation');
  const patternQuest = POST_MEGA_MODE_CARDS.find((card) => card.id === 'pattern-quest');
  const placeholders = POST_MEGA_MODE_CARDS.filter((card) => (
    card.id !== 'guardian' && card.id !== 'boss-dictation' && card.id !== 'pattern-quest'
  ));

  assert.equal(guardian.id, 'guardian');
  assert.notEqual(guardian.disabled, true);
  assert.equal(typeof guardian.title, 'string');
  assert.equal(typeof guardian.desc, 'string');

  // Boss is the U10 active card.
  assert.equal(boss.id, 'boss-dictation');
  assert.notEqual(boss.disabled, true, 'Boss card must be active post-U10');
  assert.equal(typeof boss.title, 'string');
  assert.equal(typeof boss.desc, 'string');
  assert.doesNotMatch(boss.desc, /coming soon/i, 'Boss description must not say "coming soon" now that it is active');
  assert.equal(typeof boss.glyph, 'string');
  assert.equal(boss.glyph.length, 1, 'Boss glyph is a single character');
  assert.equal(typeof boss.ariaLabel, 'string', 'Boss card carries an ariaLabel for screen readers');
  assert.ok(boss.ariaLabel.length > 0, 'Boss ariaLabel is non-empty');

  // Pattern Quest is the new U11 active card.
  assert.equal(patternQuest.id, 'pattern-quest');
  assert.notEqual(patternQuest.disabled, true, 'Pattern Quest card must be active post-U11');
  assert.equal(typeof patternQuest.title, 'string');
  assert.equal(typeof patternQuest.desc, 'string');
  assert.doesNotMatch(patternQuest.desc, /coming soon/i, 'Pattern Quest description must not say "coming soon" now that it is active');
  assert.equal(typeof patternQuest.glyph, 'string');
  assert.equal(patternQuest.glyph.length, 1, 'Pattern Quest glyph is a single character');
  assert.equal(typeof patternQuest.ariaLabel, 'string', 'Pattern Quest card carries an ariaLabel for screen readers');
  assert.ok(patternQuest.ariaLabel.length > 0, 'Pattern Quest ariaLabel is non-empty');

  for (const card of placeholders) {
    assert.equal(card.disabled, true, `${card.id} must be disabled`);
    assert.match(card.desc, /coming soon/i, `${card.id} copy should signal a future card, not a grey empty state`);
  }
});

test('POST_MEGA_MODE_CARDS does not reuse legacy iconSrc paths', () => {
  // We are deliberately *not* reusing smart-review.webp / trouble-drill.webp /
  // sats-test.webp to avoid implying those tools are still active. Each card
  // either renders a fresh asset or leaves iconSrc null so the component can
  // draw a typographic placeholder.
  const legacyIcons = new Set(MODE_CARDS.map((card) => card.iconSrc).filter(Boolean));
  for (const card of POST_MEGA_MODE_CARDS) {
    if (card.iconSrc) assert.equal(legacyIcons.has(card.iconSrc), false, `${card.id} must not borrow legacy iconSrc`);
  }
});

test('summaryModeLabel handles the new guardian mode', () => {
  assert.equal(summaryModeLabel('guardian'), 'Guardian Mission');
  // Regression spot-check: the existing labels still resolve.
  assert.equal(summaryModeLabel('smart'), 'Smart Review');
  assert.equal(summaryModeLabel('trouble'), 'Trouble Drill');
  assert.equal(summaryModeLabel('test'), 'SATs Test');
  assert.equal(summaryModeLabel('single'), 'Single-word Drill');
  assert.equal(summaryModeLabel('unknown'), 'Smart Review');
});

// U10: summaryModeLabel must resolve 'boss' to a distinct, human-readable
// string. Without this branch `summaryRibbonSub` would display "Smart Review"
// for the mode chip on the Boss round summary, which leaks legacy copy into
// the graduated surface.
test('U10: summaryModeLabel resolves "boss" to "Boss Dictation"', () => {
  assert.equal(summaryModeLabel('boss'), 'Boss Dictation');
});

test('guardianLabel: reports "Due today" when nextDueDay <= todayDay and not wobbling', () => {
  const today = 18_000;
  assert.equal(guardianLabel({ nextDueDay: today, wobbling: false }, today), 'Due today');
  assert.equal(guardianLabel({ nextDueDay: today - 2, wobbling: false }, today), 'Due today');
});

test('guardianLabel: reports "Next check in N days" for future due non-wobbling records', () => {
  const today = 18_000;
  assert.equal(guardianLabel({ nextDueDay: today + 3, wobbling: false }, today), 'Next check in 3 days');
  assert.equal(guardianLabel({ nextDueDay: today + 1, wobbling: false }, today), 'Next check in 1 day');
  assert.equal(guardianLabel({ nextDueDay: today + 30, wobbling: false }, today), 'Next check in 30 days');
});

test('guardianLabel: leads with "Wobbling" regardless of due-day delta', () => {
  const today = 18_000;
  assert.equal(guardianLabel({ nextDueDay: today + 1, wobbling: true }, today), 'Wobbling — due in 1 day');
  assert.equal(guardianLabel({ nextDueDay: today + 5, wobbling: true }, today), 'Wobbling — due in 5 days');
  assert.equal(guardianLabel({ nextDueDay: today, wobbling: true }, today), 'Wobbling — due today');
});

test('guardianLabel: returns "Not guarded yet" when the record is missing or malformed', () => {
  const today = 18_000;
  assert.equal(guardianLabel(null, today), 'Not guarded yet');
  assert.equal(guardianLabel(undefined, today), 'Not guarded yet');
  assert.equal(guardianLabel('garbage', today), 'Not guarded yet');
  assert.equal(guardianLabel([], today), 'Not guarded yet');
});

// ----- U6: Word Bank guardian filter predicates + aggregates ------------------

test('WORD_BANK_FILTER_IDS gains exactly four Guardian IDs on top of the six legacy IDs', () => {
  // Baseline: legacy chips shipped before U6 were all/due/weak/learning/secure/unseen.
  const legacyIds = ['all', 'due', 'weak', 'learning', 'secure', 'unseen'];
  for (const id of legacyIds) {
    assert.equal(WORD_BANK_FILTER_IDS.has(id), true, `${id} must still be in WORD_BANK_FILTER_IDS`);
  }
  const guardianIds = ['guardianDue', 'wobbling', 'renewedRecently', 'neverRenewed'];
  for (const id of guardianIds) {
    assert.equal(WORD_BANK_FILTER_IDS.has(id), true, `${id} must be in WORD_BANK_FILTER_IDS`);
  }
  assert.equal(WORD_BANK_FILTER_IDS.size, legacyIds.length + guardianIds.length);
  assert.deepEqual([...WORD_BANK_GUARDIAN_FILTER_IDS], guardianIds);
});

test('wordBankFilterMatchesStatus: legacy filters preserve their historic semantics (no guardian context)', () => {
  // Legacy contract: two positional args, no third options arg. Guardian
  // shape must not leak in when callers only pass (filter, status).
  assert.equal(wordBankFilterMatchesStatus('all', 'secure'), true);
  assert.equal(wordBankFilterMatchesStatus('all', 'new'), true);
  assert.equal(wordBankFilterMatchesStatus('secure', 'secure'), true);
  assert.equal(wordBankFilterMatchesStatus('secure', 'due'), false);
  assert.equal(wordBankFilterMatchesStatus('due', 'due'), true);
  assert.equal(wordBankFilterMatchesStatus('due', 'secure'), false);
  assert.equal(wordBankFilterMatchesStatus('weak', 'trouble'), true);
  assert.equal(wordBankFilterMatchesStatus('weak', 'secure'), false);
  assert.equal(wordBankFilterMatchesStatus('learning', 'learning'), true);
  assert.equal(wordBankFilterMatchesStatus('learning', 'new'), false);
  assert.equal(wordBankFilterMatchesStatus('unseen', 'new'), true);
  assert.equal(wordBankFilterMatchesStatus('unseen', 'secure'), false);
});

test('wordBankFilterMatchesStatus: guardianDue is true when nextDueDay <= todayDay on a secure word', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
    }),
    true,
  );
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today - 5, wobbling: false },
      todayDay: today,
    }),
    true,
  );
});

test('wordBankFilterMatchesStatus: guardianDue is false when nextDueDay > todayDay', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today + 1, wobbling: false },
      todayDay: today,
    }),
    false,
  );
});

test('wordBankFilterMatchesStatus: guardianDue requires a guardian record (returns false when absent)', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', { guardian: null, todayDay: today }),
    false,
  );
});

test('wordBankFilterMatchesStatus: guardianDue requires status === "secure" — due non-secure words show under the legacy chip, not here', () => {
  const today = 20_000;
  const dueRecord = { nextDueDay: today, wobbling: false };
  assert.equal(wordBankFilterMatchesStatus('guardianDue', 'due', { guardian: dueRecord, todayDay: today }), false);
  assert.equal(wordBankFilterMatchesStatus('guardianDue', 'trouble', { guardian: dueRecord, todayDay: today }), false);
});

test('wordBankFilterMatchesStatus: wobbling is true iff guardian.wobbling === true', () => {
  assert.equal(wordBankFilterMatchesStatus('wobbling', 'secure', { guardian: { wobbling: true } }), true);
  assert.equal(wordBankFilterMatchesStatus('wobbling', 'secure', { guardian: { wobbling: false } }), false);
  assert.equal(wordBankFilterMatchesStatus('wobbling', 'secure', { guardian: null }), false);
  assert.equal(wordBankFilterMatchesStatus('wobbling', 'secure', {}), false);
});

test('wordBankFilterMatchesStatus: renewedRecently inclusive at the 7-day boundary', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('renewedRecently', 'secure', {
      guardian: { lastReviewedDay: today - 7 },
      todayDay: today,
    }),
    true,
    'exactly 7 days ago counts as recent',
  );
  assert.equal(
    wordBankFilterMatchesStatus('renewedRecently', 'secure', {
      guardian: { lastReviewedDay: today - 8 },
      todayDay: today,
    }),
    false,
    '8 days ago is outside the window',
  );
  assert.equal(
    wordBankFilterMatchesStatus('renewedRecently', 'secure', {
      guardian: { lastReviewedDay: null },
      todayDay: today,
    }),
    false,
    'null lastReviewedDay never qualifies',
  );
  assert.equal(
    wordBankFilterMatchesStatus('renewedRecently', 'secure', {
      guardian: null,
      todayDay: today,
    }),
    false,
    'no guardian record → false',
  );
});

test('wordBankFilterMatchesStatus: neverRenewed is true only for secure words with no guardian record', () => {
  assert.equal(
    wordBankFilterMatchesStatus('neverRenewed', 'secure', { guardian: null }),
    true,
    'secure + no guardian → true',
  );
  assert.equal(
    wordBankFilterMatchesStatus('neverRenewed', 'secure', {}),
    true,
    'options w/ no guardian key → true',
  );
  assert.equal(
    wordBankFilterMatchesStatus('neverRenewed', 'due', { guardian: null }),
    false,
    'non-secure never qualifies',
  );
  assert.equal(
    wordBankFilterMatchesStatus('neverRenewed', 'new', { guardian: null }),
    false,
  );
  assert.equal(
    wordBankFilterMatchesStatus('neverRenewed', 'secure', {
      guardian: { reviewLevel: 0, lastReviewedDay: null, nextDueDay: 20_000, wobbling: false },
    }),
    false,
    'secure with a guardian record → false',
  );
});

test('wordBankAggregateStats: with no guardian context, returns the legacy six-field shape identically', () => {
  const words = [
    { slug: 'a', status: 'secure' },
    { slug: 'b', status: 'secure' },
    { slug: 'c', status: 'due' },
    { slug: 'd', status: 'trouble' },
    { slug: 'e', status: 'learning' },
    { slug: 'f', status: 'new' },
  ];
  const stats = wordBankAggregateStats(words);
  assert.deepEqual(stats, { total: 6, secure: 2, due: 1, trouble: 1, learning: 1, unseen: 1 });
  // No guardian fields should leak in when context is absent.
  assert.equal(Object.prototype.hasOwnProperty.call(stats, 'guardianDue'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(stats, 'wobbling'), false);
});

test('wordBankAggregateStats: with guardian context, appends the four Guardian counts', () => {
  const today = 20_000;
  const words = [
    { slug: 'renew', status: 'secure' },   // renewed recently + not due
    { slug: 'due', status: 'secure' },     // guardian due today
    { slug: 'wob', status: 'secure' },     // wobbling
    { slug: 'none', status: 'secure' },    // secure, no guardian record
    { slug: 'fresh', status: 'new' },      // no Guardian effect (non-secure)
  ];
  const guardianMap = {
    renew: { nextDueDay: today + 7, lastReviewedDay: today - 3, wobbling: false },
    due: { nextDueDay: today, lastReviewedDay: today - 30, wobbling: false },
    wob: { nextDueDay: today, lastReviewedDay: today - 1, wobbling: true },
  };
  const stats = wordBankAggregateStats(words, { guardianMap, todayDay: today });
  assert.equal(stats.total, 5);
  assert.equal(stats.secure, 4);
  assert.equal(stats.unseen, 1);
  assert.equal(stats.guardianDue, 2, 'due + wob both qualify as guardian due (both nextDueDay <= today)');
  assert.equal(stats.wobbling, 1);
  // "renew" reviewed 3 days ago, "wob" reviewed yesterday — both count as renewed recently.
  assert.equal(stats.renewedRecently, 2);
  assert.equal(stats.neverRenewed, 1, 'only "none" is secure with no guardian record');
});

test('wordBankAggregateCards: with showGuardian === false (default) returns the 6 legacy cards', () => {
  const stats = {
    total: 10, secure: 5, due: 2, trouble: 1, learning: 1, unseen: 1,
  };
  const cards = wordBankAggregateCards(stats, 'Words in pool');
  assert.equal(cards.length, 6);
  assert.deepEqual(cards.map((c) => c.label), [
    'Total', 'Secure', 'Due now', 'Trouble', 'Learning', 'Unseen',
  ]);
});

test('wordBankAggregateCards: with showGuardian === true appends 4 Guardian cards (10 total)', () => {
  const stats = {
    total: 10, secure: 5, due: 2, trouble: 1, learning: 1, unseen: 1,
    guardianDue: 3, wobbling: 1, renewedRecently: 2, neverRenewed: 4,
  };
  const cards = wordBankAggregateCards(stats, 'Words in pool', { showGuardian: true });
  assert.equal(cards.length, 10);
  const labels = cards.map((c) => c.label);
  // Legacy order must still come first so the existing visual rhythm is preserved.
  assert.deepEqual(labels.slice(0, 6), ['Total', 'Secure', 'Due now', 'Trouble', 'Learning', 'Unseen']);
  assert.deepEqual(labels.slice(6), ['Renewed (7d)', 'Guardian due', 'Wobbling', 'Untouched']);
  assert.equal(cards[6].value, 2);
  assert.equal(cards[7].value, 3);
  assert.equal(cards[8].value, 1);
  assert.equal(cards[9].value, 4);
});

test('wordBankAggregateCards: showGuardian defaults to false when options omit the flag', () => {
  const stats = { total: 1, secure: 1, due: 0, trouble: 0, learning: 0, unseen: 0 };
  const cards = wordBankAggregateCards(stats, 'Words', {});
  assert.equal(cards.length, 6);
});

// ----- U6: Guardian summary cards ---------------------------------------------

test('guardianSummaryCards: derives renewed = totalWords - mistakes.length and wobbled = mistakes.length', () => {
  const summary = { totalWords: 5, mistakes: [{ slug: 'a' }, { slug: 'b' }] };
  const cards = guardianSummaryCards({ summary, nextGuardianDueDay: 20_005, todayDay: 20_000 });
  assert.equal(cards.length, 3);
  const [renewed, wobbling, nextCheck] = cards;
  assert.equal(renewed.id, 'guardian-renewed');
  assert.equal(renewed.value, 3);
  assert.equal(wobbling.id, 'guardian-wobbling');
  assert.equal(wobbling.value, 2);
  assert.equal(nextCheck.id, 'guardian-next-check');
  assert.equal(nextCheck.value, '5 days');
});

test('guardianSummaryCards: formats "Today" / "Tomorrow" / "N days" on the next-check card', () => {
  const today = 20_000;
  const mkCards = (delta) => guardianSummaryCards({
    summary: { totalWords: 1, mistakes: [] },
    nextGuardianDueDay: today + delta,
    todayDay: today,
  });
  assert.equal(mkCards(0)[2].value, 'Today');
  assert.equal(mkCards(-3)[2].value, 'Today', 'overdue collapses to "Today"');
  assert.equal(mkCards(1)[2].value, 'Tomorrow');
  assert.equal(mkCards(5)[2].value, '5 days');
  assert.equal(mkCards(60)[2].value, '60 days');
});

test('guardianSummaryCards: when no Guardian work remains, next-check renders "—"', () => {
  const cards = guardianSummaryCards({
    summary: { totalWords: 1, mistakes: [] },
    nextGuardianDueDay: null,
    todayDay: 20_000,
  });
  assert.equal(cards[2].value, '—');
});

test('guardianSummaryCards: clamps wobbled to totalWords when summary.mistakes is inconsistent', () => {
  // Defensive branch: a duplicated mistake entry or a mistaken mapping
  // cannot push wobbled > totalWords. The UI never displays a negative
  // renewed count.
  const summary = { totalWords: 2, mistakes: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] };
  const cards = guardianSummaryCards({ summary, nextGuardianDueDay: null, todayDay: 20_000 });
  assert.equal(cards[0].value, 0, 'renewed never goes negative');
  assert.equal(cards[1].value, 2, 'wobbled clamps to totalWords');
});

// -----------------------------------------------------------------------------
// U4 (P1.5 hardening): skip button label helper branches on session.mode.
// -----------------------------------------------------------------------------

test('spellingSessionSkipLabel returns "I don\'t know" for Guardian sessions', () => {
  assert.equal(spellingSessionSkipLabel({ mode: 'guardian', type: 'learning' }), "I don't know");
});

test('spellingSessionSkipLabel returns "Skip for now" for non-Guardian learning sessions', () => {
  assert.equal(spellingSessionSkipLabel({ mode: 'smart', type: 'learning' }), 'Skip for now');
  assert.equal(spellingSessionSkipLabel({ mode: 'trouble', type: 'learning' }), 'Skip for now');
  assert.equal(spellingSessionSkipLabel({ mode: 'single', type: 'learning' }), 'Skip for now');
});

test('spellingSessionSkipLabel falls back to "Skip for now" when session is null or missing mode', () => {
  assert.equal(spellingSessionSkipLabel(null), 'Skip for now');
  assert.equal(spellingSessionSkipLabel(undefined), 'Skip for now');
  assert.equal(spellingSessionSkipLabel({}), 'Skip for now');
});

// ----- U5: Word Bank chip copy polish (R10) -----------------------------------
//
// The four Guardian filter IDs are rendered via a label map that used to read
// "Guardian due / Wobbling / Renewed (7d) / Untouched". U5 rewords them to
// "Due for check / Wobbling words / Guarded this week / Not guarded yet" so
// the child-facing copy sounds consistent with the rest of the Guardian
// dashboard. The rename is a single-source-of-truth swap in
// `spelling-view-model.js::WORD_BANK_GUARDIAN_CHIP_LABELS` (moved out of the
// JSX scene in U5 so both the SSR component and the Node tests read from the
// same place).

test('WORD_BANK_GUARDIAN_CHIP_LABELS uses the U5 child-friendly phrases', () => {
  assert.equal(WORD_BANK_GUARDIAN_CHIP_LABELS.guardianDue, 'Due for check');
  assert.equal(WORD_BANK_GUARDIAN_CHIP_LABELS.wobbling, 'Wobbling words');
  assert.equal(WORD_BANK_GUARDIAN_CHIP_LABELS.renewedRecently, 'Guarded this week');
  assert.equal(WORD_BANK_GUARDIAN_CHIP_LABELS.neverRenewed, 'Not guarded yet');
});

test('WORD_BANK_GUARDIAN_CHIP_LABELS covers every Guardian filter ID so no chip can render "undefined"', () => {
  const ids = [...WORD_BANK_GUARDIAN_FILTER_IDS];
  for (const id of ids) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(WORD_BANK_GUARDIAN_CHIP_LABELS, id),
      `${id} is missing a Guardian chip label`,
    );
    assert.equal(typeof WORD_BANK_GUARDIAN_CHIP_LABELS[id], 'string');
    assert.ok(WORD_BANK_GUARDIAN_CHIP_LABELS[id].length > 0);
  }
});

test('WORD_BANK_GUARDIAN_FILTER_HINTS still covers every Guardian filter ID (hint map parity)', () => {
  for (const id of [...WORD_BANK_GUARDIAN_FILTER_IDS]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(WORD_BANK_GUARDIAN_FILTER_HINTS, id),
      `${id} is missing a Guardian filter hint`,
    );
    assert.equal(typeof WORD_BANK_GUARDIAN_FILTER_HINTS[id], 'string');
  }
});

test('WORD_BANK_GUARDIAN_CHIP_LABELS and WORD_BANK_GUARDIAN_FILTER_HINTS are frozen', () => {
  assert.equal(Object.isFrozen(WORD_BANK_GUARDIAN_CHIP_LABELS), true);
  assert.equal(Object.isFrozen(WORD_BANK_GUARDIAN_FILTER_HINTS), true);
});

// ----- U5: wobbling filter status guard (R10 tightening) ----------------------

test('wordBankFilterMatchesStatus: wobbling requires status === "secure" (R10 tightening)', () => {
  // Plan spec, U5 edge case:
  //   Synthesised guardian record with wobbling: true + progress[slug].stage === 3
  //   (legacy pre-fix state). Filter returns FALSE after R10 tightening.
  // A stage-3 word has status 'learning' / 'trouble' / 'due', not 'secure';
  // if a pre-hardening bug left a wobbling flag on such a record, the Word
  // Bank should not flip that into a Guardian chip because the word is no
  // longer in the Vault. This keeps the wobbling chip honest: its count
  // matches exactly the secure+wobbling set.
  const wobblingRecord = { wobbling: true };
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'learning', { guardian: wobblingRecord }),
    false,
    'non-secure + wobbling → false',
  );
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'trouble', { guardian: wobblingRecord }),
    false,
  );
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'due', { guardian: wobblingRecord }),
    false,
  );
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'new', { guardian: wobblingRecord }),
    false,
  );
  // Secure + wobbling still holds (this is the happy path the chip was
  // designed for); regression guard for the baseline assertion above.
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', { guardian: wobblingRecord }),
    true,
    'secure + wobbling still → true',
  );
});

// ----- U3: Guardian-safe summary drill copy (single-source-of-truth) ---------

test('guardianPracticeActionLabel: button label is the canonical "Practice wobbling words" string', () => {
  // Scene consumers must read this string from one place (the view-model) so
  // the copy cannot drift between button text and telemetry. Every deviation
  // from this exact string weakens the "practice ≠ real Guardian round"
  // identity separation (see plan Key Technical Decisions).
  assert.equal(guardianPracticeActionLabel(), 'Practice wobbling words');
});

test('guardianSummaryCopy: help text covers "Optional practice", "schedule will not change", and "tomorrow"', () => {
  // The plan fixes this copy as the identity-preserver between Guardian
  // (single-attempt, spaced) and practice-only (optional rehearsal).
  // Copy changes that drop any of these three phrases regress the product
  // contract, so this test asserts on phrases rather than exact equality so
  // a tone tweak is still possible without accidentally stripping the
  // identity-guarding words.
  const copy = guardianSummaryCopy();
  assert.match(copy, /Optional practice/);
  assert.match(copy, /schedule will not change/i);
  assert.match(copy, /tomorrow/i);
  // Guardian Mega invariant must be named explicitly.
  assert.match(copy, /Mega/);
});

// ----- U2: Orphan sanitiser for Word Bank predicates --------------------------
//
// Content hot-swap: a slug that was in `guardianMap` can silently fall out
// of the current runtime (`wordBySlug` drops it, or it gets demoted to
// `spellingPool === 'extra'`, or its progress stage drops below
// `GUARDIAN_SECURE_STAGE`). The `wobbling` and `guardianDue` chips must
// never surface an orphan row, even when the persisted guardian record
// still says `wobbling: true`.

test('U2 view-model: wobbling filter rejects an orphan slug (wordBySlug missing entry)', () => {
  const today = 20_000;
  // Guardian record says wobbling, but wordBySlug does not know the slug.
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', {
      guardian: { wobbling: true },
      todayDay: today,
      slug: 'ghostword',
      progressMap: { ghostword: { stage: 4 } },
      wordBySlug: {},
    }),
    false,
    'orphan slug never matches the wobbling chip',
  );
});

test('U2 view-model: wobbling filter rejects a slug demoted to spellingPool=extra', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', {
      guardian: { wobbling: true },
      todayDay: today,
      slug: 'demoted',
      progressMap: { demoted: { stage: 4 } },
      wordBySlug: { demoted: { slug: 'demoted', spellingPool: 'extra' } },
    }),
    false,
    'pool-demoted slug never matches the wobbling chip',
  );
});

test('U2 view-model: wobbling filter (R10 tightening) rejects a slug whose progress stage dropped below GUARDIAN_SECURE_STAGE', () => {
  // Legacy pre-fix state: synthesised guardian record with wobbling: true +
  // progress[slug].stage === 3. Post-hardening, this is an invariant
  // impossibility, but the filter must still reject it defensively.
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', {
      guardian: { wobbling: true },
      todayDay: today,
      slug: 'legacy',
      progressMap: { legacy: { stage: 3 } },
      wordBySlug: { legacy: { slug: 'legacy', spellingPool: 'core' } },
    }),
    false,
    'stage-3 slug never matches the wobbling chip (R10 invariant tightening)',
  );
});

test('U2 view-model: wobbling filter accepts a known core stage-4 slug with guardian.wobbling=true', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', {
      guardian: { wobbling: true },
      todayDay: today,
      slug: 'possess',
      progressMap: { possess: { stage: 4 } },
      wordBySlug: { possess: { slug: 'possess', spellingPool: 'core' } },
    }),
    true,
    'eligible slug with wobbling guardian still matches',
  );
});

test('U2 view-model: wobbling filter preserves the legacy `status === "secure"` guard even with eligible slug', () => {
  // R10: wobbling filter requires status === 'secure'. Even an eligible
  // slug must not match if the row status has drifted away from 'secure'.
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'due', {
      guardian: { wobbling: true },
      todayDay: today,
      slug: 'possess',
      progressMap: { possess: { stage: 4 } },
      wordBySlug: { possess: { slug: 'possess', spellingPool: 'core' } },
    }),
    false,
    'non-secure status still blocks the wobbling chip regardless of eligibility',
  );
});

test('U2 view-model: guardianDue filter rejects an orphan slug (wordBySlug missing entry)', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
      slug: 'ghostword',
      progressMap: { ghostword: { stage: 4 } },
      wordBySlug: {},
    }),
    false,
    'orphan slug never matches the guardianDue chip',
  );
});

test('U2 view-model: guardianDue filter rejects a slug demoted to spellingPool=extra', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
      slug: 'demoted',
      progressMap: { demoted: { stage: 4 } },
      wordBySlug: { demoted: { slug: 'demoted', spellingPool: 'extra' } },
    }),
    false,
    'pool-demoted slug never matches the guardianDue chip',
  );
});

test('U2 view-model: guardianDue filter rejects a slug whose progress stage dropped below GUARDIAN_SECURE_STAGE', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
      slug: 'legacy',
      progressMap: { legacy: { stage: 3 } },
      wordBySlug: { legacy: { slug: 'legacy', spellingPool: 'core' } },
    }),
    false,
    'stage-3 slug never matches the guardianDue chip',
  );
});

test('U2 view-model: guardianDue filter accepts a known core stage-4 slug with nextDueDay <= today', () => {
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
      slug: 'possess',
      progressMap: { possess: { stage: 4 } },
      wordBySlug: { possess: { slug: 'possess', spellingPool: 'core' } },
    }),
    true,
    'eligible slug with due guardian still matches',
  );
});

test('U2 view-model: orphan sanitiser options are opt-in — omitting slug/progressMap/wordBySlug keeps legacy behaviour', () => {
  // Regression guard: the pre-U2 contract ({ guardian, todayDay } only) must
  // still behave identically. Existing callers that have not been updated
  // get exactly the pre-U2 result.
  const today = 20_000;
  assert.equal(
    wordBankFilterMatchesStatus('wobbling', 'secure', {
      guardian: { wobbling: true },
      todayDay: today,
    }),
    true,
    'legacy call shape (no orphan context) keeps pre-U2 behaviour',
  );
  assert.equal(
    wordBankFilterMatchesStatus('guardianDue', 'secure', {
      guardian: { nextDueDay: today, wobbling: false },
      todayDay: today,
    }),
    true,
    'legacy call shape (no orphan context) keeps pre-U2 behaviour',
  );
});

// --------------------------------------------------------------------------
// Post-Mega hero backgrounds (`f` region with branch suffix).
// --------------------------------------------------------------------------
//
// Graduated learners draw the Guardian / Boss / Pattern Quest vista from
// the `f` region. The branch suffix (b1 / b2) tracks the learner's
// grand-master Phaeton so the painting matches the Codex creature even
// when the rest of the monster set happens to be on the other branch.

test('normalisePostMegaBranch falls back to b1 for unknown / empty input', () => {
  assert.equal(normalisePostMegaBranch('b1'), 'b1');
  assert.equal(normalisePostMegaBranch('b2'), 'b2');
  assert.equal(normalisePostMegaBranch(''), 'b1');
  assert.equal(normalisePostMegaBranch(null), 'b1');
  assert.equal(normalisePostMegaBranch('b3'), 'b1', 'unknown branches collapse to the default');
  assert.equal(normalisePostMegaBranch('B2'), 'b1', 'case-sensitive — capitalised input is rejected');
});

test('heroBgForPostMega returns the f-region URL with branch suffix and a valid tone', () => {
  assert.equal(
    heroBgForPostMega('b2', '1', 'learner-eugenia'),
    '/assets/regions/the-scribe-downs/the-scribe-downs-f1-b2.1280.webp',
  );
  assert.equal(
    heroBgForPostMega('b1', '3', 'learner-nelson'),
    '/assets/regions/the-scribe-downs/the-scribe-downs-f3-b1.1280.webp',
  );
  // Unknown tone falls through to the learner-deterministic tone (1/2/3),
  // never an out-of-range value.
  const fallback = heroBgForPostMega('b1', 'rogue', 'learner-eugenia');
  assert.match(fallback, /the-scribe-downs-f[1-3]-b1\.1280\.webp$/);
});

test('heroBgForSetup routes graduated learners to the f-region when postMega flag is set', () => {
  const learnerId = 'learner-eugenia';
  const prefs = { mode: 'smart' };
  const legacyUrl = heroBgForSetup(learnerId, prefs, { tone: '1' });
  assert.match(legacyUrl, /the-scribe-downs-[a-c]1\.1280\.webp$/, 'pre-Mega learner stays on the legacy region');
  const postMegaUrl = heroBgForSetup(learnerId, prefs, { tone: '1', postMega: true, postMegaBranch: 'b2' });
  assert.equal(
    postMegaUrl,
    '/assets/regions/the-scribe-downs/the-scribe-downs-f1-b2.1280.webp',
    'post-Mega flag swaps the picker to the f-region with branch suffix',
  );
});

test('heroBgForSession routes graduated sessions to the f-region with branch suffix', () => {
  const session = { mode: 'guardian', progress: { done: 0, total: 5 } };
  const url = heroBgForSession('learner-eugenia', session, {
    tone: '2',
    postMega: true,
    postMegaBranch: 'b2',
  });
  assert.equal(url, '/assets/regions/the-scribe-downs/the-scribe-downs-f2-b2.1280.webp');
  // Without the flag the picker still falls back to the legacy mode-driven
  // region — this is the path Workshop sessions take (Smart / Trouble /
  // Test still feel like classic practice rather than a graduation vista).
  const classicUrl = heroBgForSession('learner-eugenia', { mode: 'smart' }, { tone: '2' });
  assert.match(classicUrl, /the-scribe-downs-[a-c]2\.1280\.webp$/);
});

test('heroBgPreloadUrls includes f-region tones when the learner is post-Mega', () => {
  const urls = heroBgPreloadUrls('learner-eugenia', { mode: 'smart' }, {
    setupTone: '1',
    postMega: true,
    postMegaBranch: 'b2',
  });
  // Three post-Mega URLs (one per tone), each anchored to the b2 branch.
  assert.ok(urls.includes('/assets/regions/the-scribe-downs/the-scribe-downs-f1-b2.1280.webp'));
  assert.ok(urls.includes('/assets/regions/the-scribe-downs/the-scribe-downs-f2-b2.1280.webp'));
  assert.ok(urls.includes('/assets/regions/the-scribe-downs/the-scribe-downs-f3-b2.1280.webp'));
  // Pre-Mega learners keep the legacy preload list — no f-region URLs.
  const classic = heroBgPreloadUrls('learner-nelson', { mode: 'smart' }, { setupTone: '1' });
  assert.equal(classic.some((url) => /-f[1-3]-b[12]\.1280\.webp$/.test(url)), false);
});

test('heroToneForBg matches both legacy a–e and post-Mega f-region URLs', () => {
  assert.equal(heroToneForBg('/assets/regions/the-scribe-downs/the-scribe-downs-c2.1280.webp'), '2');
  assert.equal(heroToneForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f3-b1.1280.webp'), '3');
  assert.equal(heroToneForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f1-b2.1280.webp'), '1');
  assert.equal(heroToneForBg('/missing-region/foo.1280.webp'), '');
});

test('heroContrastProfileForBg honours the post-Mega tone envelope', () => {
  // Tone 1 = dark shell on both regions.
  const tone1Legacy = heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-a1.1280.webp');
  const tone1PostMega = heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f1-b2.1280.webp');
  assert.equal(tone1Legacy?.shell, 'dark');
  assert.equal(tone1PostMega?.shell, 'dark');
  // Tone 3 = light shell.
  const tone3PostMega = heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f3-b1.1280.webp');
  assert.equal(tone3PostMega?.shell, 'light');
  // Branch suffix must not bleed into the tone — both b1 and b2 share envelope.
  const f2b1 = heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f2-b1.1280.webp');
  const f2b2 = heroContrastProfileForBg('/assets/regions/the-scribe-downs/the-scribe-downs-f2-b2.1280.webp');
  assert.deepEqual(f2b1?.cards, f2b2?.cards);
});

test('SPELLING_HERO_BACKGROUNDS exposes a postMega catalogue with branch × tone coverage', () => {
  const postMega = SPELLING_HERO_BACKGROUNDS.postMega || [];
  // 2 branches × 3 tones = 6 unique URLs.
  assert.equal(postMega.length, 6);
  assert.equal(new Set(postMega).size, 6);
  // Every entry hits the `-fN-bM.1280.webp` shape.
  for (const url of postMega) {
    assert.match(url, /the-scribe-downs-f[1-3]-b[12]\.1280\.webp$/);
  }
});
