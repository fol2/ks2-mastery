import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODE_CARDS,
  POST_MEGA_MODE_CARDS,
  guardianLabel,
  renderAction,
  summaryModeLabel,
} from '../src/subjects/spelling/components/spelling-view-model.js';

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

test('POST_MEGA_MODE_CARDS is a frozen array of four cards in Guardian-first order', () => {
  assert.equal(Array.isArray(POST_MEGA_MODE_CARDS), true);
  assert.equal(Object.isFrozen(POST_MEGA_MODE_CARDS), true);
  assert.equal(POST_MEGA_MODE_CARDS.length, 4);
  const ids = POST_MEGA_MODE_CARDS.map((card) => card.id);
  assert.deepEqual(ids, ['guardian', 'boss-dictation', 'word-detective', 'story-challenge']);
});

test('POST_MEGA_MODE_CARDS: Guardian is active, remaining three are disabled placeholders', () => {
  const [guardian, ...rest] = POST_MEGA_MODE_CARDS;
  assert.equal(guardian.id, 'guardian');
  assert.notEqual(guardian.disabled, true);
  assert.equal(typeof guardian.title, 'string');
  assert.equal(typeof guardian.desc, 'string');
  for (const card of rest) {
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
