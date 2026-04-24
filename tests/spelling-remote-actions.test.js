import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRemoteSpellingActionHandler,
  spellingCommandDedupeKey,
} from '../src/subjects/spelling/remote-actions.js';

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function flushTimers() {
  return new Promise((resolve) => setTimeout(resolve, 0));
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

test('remote spelling setup preference changes are coalesced before saving', async () => {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: {
          mode: 'smart',
          roundLength: '10',
          yearFilter: 'core',
          autoSpeak: true,
          showCloze: true,
        },
        analytics: null,
        error: '',
      },
    },
  });
  const sent = [];
  const handler = createRemoteSpellingActionHandler({
    store,
    services: {
      spelling: {
        getPrefs() {
          return getState().subjectUi.spelling.prefs;
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ subjectReadModel: { phase: 'dashboard' } });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'roundLength', value: '5' }), true);
  assert.equal(handler.handle('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }), true);
  assert.equal(handler.handle('spelling-toggle-pref', { pref: 'autoSpeak' }), true);

  assert.equal(sent.length, 0);
  assert.equal(getState().subjectUi.spelling.prefs.roundLength, '5');
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');
  assert.equal(getState().subjectUi.spelling.prefs.autoSpeak, false);

  await flushTimers();
  await flushPromises();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].command, 'save-prefs');
  assert.deepEqual(sent[0].payload, {
    prefs: {
      roundLength: '5',
      yearFilter: 'extra',
      autoSpeak: false,
    },
  });
});

test('remote spelling start flushes pending setup preferences first', async () => {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: {
          mode: 'smart',
          roundLength: '10',
          yearFilter: 'core',
          autoSpeak: true,
          showCloze: true,
          extraWordFamilies: false,
        },
        analytics: null,
        error: '',
      },
    },
  });
  const sent = [];
  const handler = createRemoteSpellingActionHandler({
    store,
    services: {
      spelling: {
        getPrefs() {
          return getState().subjectUi.spelling.prefs;
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ subjectReadModel: { phase: request.command === 'start-session' ? 'session' : 'dashboard' } });
      },
    },
    preferenceSaveDebounceMs: 10_000,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'roundLength', value: '5' }), true);
  assert.equal(handler.handle('spelling-start'), true);

  await flushTimers();
  await flushPromises();

  assert.deepEqual(sent.map((request) => request.command), ['save-prefs', 'start-session']);
  assert.deepEqual(sent[0].payload, { prefs: { roundLength: '5' } });
  assert.equal(sent[1].payload.length, '5');
  assert.equal(sent[1].payload.mode, 'smart');
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
