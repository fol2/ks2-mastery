import test from 'node:test';
import assert from 'node:assert/strict';

import { renderAction } from '../src/subjects/spelling/components/spelling-view-model.js';

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
