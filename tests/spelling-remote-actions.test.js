import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRemoteSpellingActionHandler,
  spellingCommandDedupeKey,
} from '../src/subjects/spelling/remote-actions.js';

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStoreHarness(initial = {}) {
  let state = {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        phase: 'session',
        session: {
          id: 'session-a',
          currentSlug: 'early',
          phase: 'answer',
          promptCount: 1,
        },
        analytics: null,
        audio: null,
        error: '',
      },
    },
    transientUi: {},
    ...(initial || {}),
  };
  const calls = [];
  const store = {
    getState() {
      return state;
    },
    updateSubjectUi(subjectId, updater) {
      const previous = state.subjectUi?.[subjectId] || {};
      const next = typeof updater === 'function'
        ? updater(previous)
        : { ...previous, ...(updater || {}) };
      state = {
        ...state,
        subjectUi: {
          ...state.subjectUi,
          [subjectId]: next,
        },
      };
      calls.push(['updateSubjectUi', subjectId, next]);
    },
    patch(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      state = { ...state, ...(patch || {}) };
      calls.push(['patch', patch || {}]);
    },
    pushToasts(toasts) {
      calls.push(['pushToasts', toasts]);
    },
    pushMonsterCelebrations(events) {
      calls.push(['pushMonsterCelebrations', events]);
    },
    reloadFromRepositories(options) {
      calls.push(['reloadFromRepositories', options]);
    },
  };
  return {
    calls,
    getState: () => state,
    store,
  };
}

function createTtsHarness() {
  return {
    spoken: [],
    stopCalls: 0,
    speak(payload) {
      this.spoken.push(payload);
    },
    stop() {
      this.stopCalls += 1;
    },
  };
}

test('spelling command dedupe key includes learner and prompt context', () => {
  assert.equal(spellingCommandDedupeKey('save-prefs', {}), '');
  assert.equal(spellingCommandDedupeKey('start-session', {
    learners: { selectedId: 'learner-a' },
  }), 'start-session:learner-a:setup');
  assert.equal(spellingCommandDedupeKey('submit-answer', {
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        session: {
          id: 'session-a',
          currentSlug: 'early',
          phase: 'answer',
          promptCount: 2,
        },
      },
    },
  }), 'submit-answer:learner-a:session-a:early:answer:2');
});

test('remote spelling actions dedupe in-flight session commands and release after settlement', async () => {
  const { store } = createStoreHarness();
  const tts = createTtsHarness();
  const pending = deferred();
  const sent = [];
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts,
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return pending.promise;
      },
    },
  });

  const formData = new FormData();
  formData.set('typed', 'early');
  assert.equal(handler.handle('spelling-submit-form', { formData }), true);
  assert.equal(handler.handle('spelling-submit-form', { formData }), true);
  assert.equal(sent.length, 1);

  pending.resolve({ subjectReadModel: { phase: 'session' } });
  await flushPromises();
  assert.equal(handler.handle('spelling-submit-form', { formData }), true);
  assert.equal(sent.length, 2);
});

test('remote spelling command response preserves reward side effects and TTS stop rules', () => {
  const { calls, store } = createStoreHarness();
  const tts = createTtsHarness();
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts,
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });

  handler.applyCommandResponse({
    subjectReadModel: { phase: 'session' },
    projections: {
      rewards: {
        toastEvents: [{ id: 'toast-a' }],
        events: [{ id: 'monster-a' }],
      },
    },
  }, { command: 'submit-answer' });

  assert.equal(tts.stopCalls, 1);
  assert.deepEqual(calls.map(([name]) => name), [
    'pushToasts',
    'pushMonsterCelebrations',
    'reloadFromRepositories',
  ]);

  handler.applyCommandResponse({
    subjectReadModel: { phase: 'session' },
    audio: { promptToken: 'prompt-a', word: 'early' },
  }, { command: 'submit-answer' });

  assert.equal(tts.stopCalls, 1);
  assert.deepEqual(tts.spoken, [{ promptToken: 'prompt-a', word: 'early' }]);
});

test('remote spelling word bank open loads analytics and detail into the store', async () => {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        analytics: null,
        error: '',
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    subjectCommands: { send: async () => ({}) },
    readModels: {
      async readJson(url) {
        assert.match(url, /learnerId=learner-a/);
        return {
          wordBank: {
            analytics: {
              wordGroups: [{ key: 'core', words: [{ slug: 'early' }] }],
              wordBank: { page: 1, hasNextPage: false },
            },
            detail: { slug: 'early', audio: { word: { promptToken: 'word-a' } } },
          },
        };
      },
    },
  });

  assert.equal(handler.handle('spelling-open-word-bank'), true);
  assert.equal(getState().subjectUi.spelling.phase, 'word-bank');
  assert.equal(getState().transientUi.spellingWordBankStatus, 'loading');

  await flushPromises();
  assert.equal(getState().transientUi.spellingWordBankStatus, 'loaded');
  assert.deepEqual(getState().subjectUi.spelling.analytics.wordGroups[0].words, [{ slug: 'early' }]);
  assert.equal(getState().transientUi.spellingWordDetail.slug, 'early');
});

test('remote spelling word-bank drill submit is blocked while read-only', () => {
  const { store } = createStoreHarness({
    transientUi: {
      spellingWordDetailSlug: 'early',
      spellingWordBankDrillTyped: 'early',
    },
  });
  const sent = [];
  const errors = [];
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    isReadOnly: () => true,
    readModels: { readJson: async () => ({}) },
    setRuntimeError(message) {
      errors.push(message);
    },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({});
      },
    },
  });

  assert.equal(handler.handle('spelling-word-bank-drill-submit'), true);
  assert.equal(sent.length, 0);
  assert.match(errors[0], /read-only/i);
});
