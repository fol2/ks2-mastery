import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRemoteSpellingActionHandler,
  spellingCommandDedupeKey,
} from '../src/subjects/spelling/remote-actions.js';
import {
  acknowledgeMonsterCelebrationEvents,
  clearMonsterCelebrationAcknowledgements,
} from '../src/platform/game/monster-celebration-acks.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

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
    monsterCelebrations: {
      pending: [],
      queue: [],
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
      state = {
        ...state,
        monsterCelebrations: {
          ...state.monsterCelebrations,
          queue: [...(state.monsterCelebrations?.queue || []), ...(Array.isArray(events) ? events : [events])],
        },
      };
      calls.push(['pushMonsterCelebrations', events]);
    },
    deferMonsterCelebrations(events) {
      state = {
        ...state,
        monsterCelebrations: {
          ...state.monsterCelebrations,
          pending: [...(state.monsterCelebrations?.pending || []), ...(Array.isArray(events) ? events : [events])],
        },
      };
      calls.push(['deferMonsterCelebrations', events]);
      return true;
    },
    releaseMonsterCelebrations() {
      state = {
        ...state,
        monsterCelebrations: {
          pending: [],
          queue: [
            ...(state.monsterCelebrations?.queue || []),
            ...(state.monsterCelebrations?.pending || []),
          ],
        },
      };
      calls.push(['releaseMonsterCelebrations']);
      return true;
    },
    dismissMonsterCelebration() {
      state = {
        ...state,
        monsterCelebrations: {
          ...state.monsterCelebrations,
          queue: (state.monsterCelebrations?.queue || []).slice(1),
        },
      };
      calls.push(['dismissMonsterCelebration']);
      return true;
    },
    reloadFromRepositories(options) {
      if (!options?.preserveMonsterCelebrations) {
        state = {
          ...state,
          monsterCelebrations: {
            pending: [],
            queue: [],
          },
        };
      }
      calls.push(['reloadFromRepositories', options]);
    },
    repositories: initial.repositories || {
      eventLog: {
        list() {
          return [];
        },
      },
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
  assert.equal(spellingCommandDedupeKey('save-prefs', {
    learners: { selectedId: 'learner-a' },
  }), 'save-prefs:learner-a:prefs');
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

test('remote spelling start marks pending and ignores duplicate clicks before settlement', async () => {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: {
          mode: 'smart',
          roundLength: '20',
          yearFilter: 'core',
          extraWordFamilies: false,
        },
        analytics: null,
        audio: null,
        error: '',
      },
    },
  });
  const tts = createTtsHarness();
  const pending = deferred();
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
    tts,
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return pending.promise;
      },
    },
  });

  assert.equal(handler.handle('spelling-start'), true);
  assert.equal(getState().transientUi.spellingPendingCommand, 'start-session');
  assert.equal(handler.handle('spelling-start'), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(tts.stopCalls, 1);

  pending.resolve({ subjectReadModel: { phase: 'session' } });
  await flushPromises();
  await flushPromises();
  assert.equal(getState().transientUi.spellingPendingCommand, '');
});

test('remote spelling start waits while an option save is in flight', async () => {
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
  const firstSave = deferred();
  const tts = createTtsHarness();
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
    tts,
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        if (request.command === 'save-prefs') return firstSave.promise;
        return Promise.resolve({ subjectReadModel: { phase: 'session' } });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'roundLength', value: '5' }), true);
  await flushTimers();
  await flushPromises();
  assert.deepEqual(sent.map((request) => request.command), ['save-prefs']);
  assert.equal(getState().transientUi.spellingPendingCommand, 'save-prefs');

  assert.equal(handler.handle('spelling-start'), true);
  await flushPromises();
  assert.deepEqual(sent.map((request) => request.command), ['save-prefs']);
  assert.equal(tts.stopCalls, 0);

  firstSave.resolve({ subjectReadModel: { phase: 'dashboard' } });
  await flushPromises();
  await flushPromises();
  assert.equal(getState().transientUi.spellingPendingCommand, '');

  assert.equal(handler.handle('spelling-start'), true);
  await flushPromises();
  assert.deepEqual(sent.map((request) => request.command), ['save-prefs', 'start-session']);
});

test('remote spelling keeps newer pending preferences when an older save response reloads', async () => {
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
  const firstSave = deferred();
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
        if (sent.length === 1) return firstSave.promise;
        return Promise.resolve({ subjectReadModel: { phase: 'dashboard' } });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'roundLength', value: '5' }), true);
  await flushTimers();
  await flushPromises();
  assert.equal(sent.length, 1);

  assert.equal(handler.handle('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }), true);
  await flushTimers();
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');

  store.updateSubjectUi('spelling', (current = {}) => ({
    ...current,
    prefs: {
      ...(current.prefs || {}),
      roundLength: '5',
      yearFilter: 'core',
    },
  }));
  firstSave.resolve({ subjectReadModel: { phase: 'dashboard' } });
  await flushPromises();
  await flushPromises();

  assert.equal(getState().subjectUi.spelling.prefs.roundLength, '5');
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].payload, {
    prefs: {
      roundLength: '5',
      yearFilter: 'extra',
    },
  });
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
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'session' },
    projections: {
      rewards: {
        toastEvents: [{ id: 'toast-a' }],
        events: [{
          id: 'reward.monster:learner-a:inklet:evolve:1:2',
          type: 'reward.monster',
          kind: 'evolve',
          learnerId: 'learner-a',
          monsterId: 'inklet',
          monster: { id: 'inklet', name: 'Inklet' },
          previous: { stage: 0, level: 1, caught: true, branch: 'b1' },
          next: { stage: 1, level: 2, caught: true, branch: 'b1' },
          createdAt: 100,
        }],
      },
    },
  }, { command: 'submit-answer' });

  assert.equal(tts.stopCalls, 1);
  assert.deepEqual(calls.map(([name]) => name), [
    'reloadFromRepositories',
    'pushToasts',
    'deferMonsterCelebrations',
  ]);

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'session' },
    audio: { promptToken: 'prompt-a', word: 'early' },
  }, { command: 'submit-answer' });

  assert.equal(tts.stopCalls, 1);
  assert.deepEqual(tts.spoken, [{ promptToken: 'prompt-a', word: 'early' }]);
});

test('remote spelling command compensates a logged monster celebration after the next session finishes', () => {
  installMemoryStorage();
  const now = Date.now();
  const olderCatch = {
    id: 'reward.monster:learner-a:inklet:caught:0:0',
    type: 'reward.monster',
    kind: 'caught',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
    },
    previous: { mastered: 0, stage: 0, level: 0, caught: false, branch: 'b1' },
    next: { mastered: 1, stage: 0, level: 0, caught: true, branch: 'b1' },
    createdAt: now - (10 * 24 * 60 * 60 * 1000),
  };
  const missedEvolution = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      nameByStage: ['Inklet egg', 'Inklet sprout'],
      accent: '#3E6FA8',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: now - 1000,
  };
  const nonSpellingReward = {
    id: 'reward.monster:learner-a:grammar:bracehart:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'grammar',
    monsterId: 'bracehart',
    monster: {
      id: 'bracehart',
      name: 'Bracehart',
      accent: '#3E6FA8',
    },
    previous: { mastered: 1, stage: 1, level: 2, caught: true, branch: 'b1' },
    next: { mastered: 2, stage: 2, level: 4, caught: true, branch: 'b1' },
    createdAt: now,
  };
  const { calls, getState, store } = createStoreHarness({
    repositories: {
      eventLog: {
        list(learnerId) {
          assert.equal(learnerId, 'learner-a');
          return [olderCatch, missedEvolution, nonSpellingReward];
        },
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [],
        events: [],
      },
    },
  }, {
    command: 'end-session',
    compensationBaselineEventIds: new Set([olderCatch.id]),
  });

  assert.deepEqual(calls.map(([name]) => name), [
    'reloadFromRepositories',
    'deferMonsterCelebrations',
    'releaseMonsterCelebrations',
  ]);
  assert.equal(getState().monsterCelebrations.pending.length, 0);
  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, missedEvolution.id);

  acknowledgeMonsterCelebrationEvents(missedEvolution, { learnerId: 'learner-a' });
  store.dismissMonsterCelebration();
  store.updateSubjectUi('spelling', {
    phase: 'session',
    session: {
      id: 'session-b',
      currentSlug: 'necessary',
      phase: 'answer',
      promptCount: 1,
    },
  });
  calls.length = 0;
  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [],
        events: [],
      },
    },
  }, {
    command: 'end-session',
    compensationBaselineEventIds: new Set([olderCatch.id, missedEvolution.id]),
  });

  assert.equal(calls.some(([name]) => name === 'deferMonsterCelebrations'), false);
});

test('remote spelling compensation baselines recent logged celebrations that existed before command', () => {
  installMemoryStorage();
  const recentEvolution = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: Date.now() - 60_000,
  };
  const { calls, getState, store } = createStoreHarness({
    repositories: {
      eventLog: {
        list() {
          return [recentEvolution];
        },
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [],
        events: [],
      },
    },
  }, {
    command: 'end-session',
    compensationBaselineEventIds: new Set([recentEvolution.id]),
  });

  assert.equal(calls.some(([name]) => name === 'deferMonsterCelebrations'), false);
  assert.equal(getState().monsterCelebrations.queue.length, 0);
});

test('remote spelling compensation can replay a deterministic reward id after reset clears acknowledgements', () => {
  installMemoryStorage();
  const reearnedEvolution = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: Date.now(),
  };
  acknowledgeMonsterCelebrationEvents(reearnedEvolution, { learnerId: 'learner-a' });
  clearMonsterCelebrationAcknowledgements('learner-a');
  const { calls, getState, store } = createStoreHarness({
    repositories: {
      eventLog: {
        list(learnerId) {
          assert.equal(learnerId, 'learner-a');
          return [reearnedEvolution];
        },
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [],
        events: [],
      },
    },
  }, {
    command: 'end-session',
    compensationBaselineEventIds: new Set(),
  });

  assert.deepEqual(calls.map(([name]) => name), [
    'reloadFromRepositories',
    'deferMonsterCelebrations',
    'releaseMonsterCelebrations',
  ]);
  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, reearnedEvolution.id);
});

test('remote spelling command compensates only rewards appended after the command starts', async () => {
  installMemoryStorage();
  const now = Date.now();
  const priorEvolution = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: now - 60_000,
  };
  const commandDirectEvolution = {
    id: 'reward.monster:learner-a:glimmerbug:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'glimmerbug',
    monster: {
      id: 'glimmerbug',
      name: 'Glimmerbug',
      accent: '#F2B84B',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: now,
  };
  const commandPhaetonEvolution = {
    id: 'reward.monster:learner-a:phaeton:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'phaeton',
    monster: {
      id: 'phaeton',
      name: 'Phaeton',
      accent: '#7D5CC6',
    },
    previous: { mastered: 29, stage: 1, level: 2, caught: true, branch: 'b2' },
    next: { mastered: 30, stage: 2, level: 3, caught: true, branch: 'b2' },
    createdAt: now + 1,
  };
  const events = [priorEvolution];
  const { getState, store } = createStoreHarness({
    repositories: {
      eventLog: {
        list(learnerId) {
          assert.equal(learnerId, 'learner-a');
          return events;
        },
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      async send() {
        events.push(commandDirectEvolution, commandPhaetonEvolution);
        return {
          learnerId: 'learner-a',
          subjectReadModel: { phase: 'summary' },
          projections: {
            rewards: {
              toastEvents: [],
              events: [],
            },
          },
        };
      },
    },
  });

  assert.equal(handler.runCommand('end-session'), true);
  await flushPromises();

  assert.deepEqual(getState().monsterCelebrations.queue.map((event) => event.id), [
    commandDirectEvolution.id,
    commandPhaetonEvolution.id,
  ]);
});

test('remote spelling compensation excludes pre-command rewards even with an existing ack baseline', () => {
  installMemoryStorage();
  const now = Date.now();
  const directEvolution = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'inklet',
    monster: {
      id: 'inklet',
      name: 'Inklet',
      accent: '#3E6FA8',
    },
    previous: { mastered: 9, stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { mastered: 10, stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: now - 2000,
  };
  const phaetonEvolution = {
    id: 'reward.monster:learner-a:phaeton:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: 'learner-a',
    subjectId: 'spelling',
    monsterId: 'phaeton',
    monster: {
      id: 'phaeton',
      name: 'Phaeton',
      accent: '#7D5CC6',
    },
    previous: { mastered: 29, stage: 1, level: 2, caught: true, branch: 'b2' },
    next: { mastered: 30, stage: 2, level: 3, caught: true, branch: 'b2' },
    createdAt: now - 1000,
  };
  const { calls, getState, store } = createStoreHarness({
    repositories: {
      eventLog: {
        list() {
          return [directEvolution, phaetonEvolution];
        },
      },
    },
  });
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });
  globalThis.localStorage.setItem('ks2-platform-v2.monster-celebration-acks', JSON.stringify({
    'learner-a': { ids: [], baselineAt: now - 5000 },
  }));

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [],
        events: [],
      },
    },
  }, {
    command: 'end-session',
    compensationBaselineEventIds: new Set([directEvolution.id]),
  });

  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, phaetonEvolution.id);
  assert.deepEqual(calls.map(([name]) => name), [
    'reloadFromRepositories',
    'deferMonsterCelebrations',
    'releaseMonsterCelebrations',
  ]);
});

test('remote spelling command response ignores stale learner TTS side effects', () => {
  const { store } = createStoreHarness({
    learners: { selectedId: 'learner-b' },
  });
  const tts = createTtsHarness();
  const handler = createRemoteSpellingActionHandler({
    store,
    services: { spelling: {} },
    tts,
    readModels: { readJson: async () => ({}) },
    subjectCommands: { send: async () => ({}) },
  });

  handler.applyCommandResponse({
    learnerId: 'learner-a',
    subjectReadModel: { phase: 'summary' },
    projections: {
      rewards: {
        toastEvents: [{ id: 'toast-a' }],
        events: [],
      },
    },
    audio: { promptToken: 'prompt-a', word: 'early' },
  }, { command: 'end-session' });

  assert.equal(tts.stopCalls, 0);
  assert.deepEqual(tts.spoken, []);
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

test('remote spelling optimistic prefs reapply after learner switches', async () => {
  const prefsByLearner = {
    'learner-a': { mode: 'smart', yearFilter: 'core', roundLength: '10', extraWordFamilies: false },
    'learner-b': { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
  };
  const { getState, store } = createStoreHarness({
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-a'] },
        error: '',
      },
    },
  });
  const sent = [];
  const handler = createRemoteSpellingActionHandler({
    store,
    services: {
      spelling: {
        getPrefs(learnerId) {
          return prefsByLearner[learnerId] || {};
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

  assert.equal(handler.handle('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }), true);
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');

  store.patch((current) => ({
    ...current,
    learners: { selectedId: 'learner-b' },
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-b'] },
        error: '',
      },
    },
  }));
  handler.reapplyPendingOptimisticPrefs();
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'core');

  store.patch((current) => ({
    ...current,
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-a'] },
        error: '',
      },
    },
  }));
  handler.reapplyPendingOptimisticPrefs();
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');

  assert.equal(handler.handle('spelling-start'), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();
  await flushPromises();
  assert.equal(sent[0].command, 'save-prefs');
  assert.deepEqual(sent[0].payload, { prefs: { yearFilter: 'extra' } });
  assert.equal(sent[1].command, 'start-session');
  assert.equal(sent[1].payload.yearFilter, 'extra');
});

test('remote spelling save failures stay scoped to the original learner', async () => {
  const prefsByLearner = {
    'learner-a': { mode: 'smart', yearFilter: 'core', roundLength: '10', extraWordFamilies: false },
    'learner-b': { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
  };
  const { getState, store } = createStoreHarness({
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-a'] },
        error: '',
      },
    },
  });
  const pending = deferred();
  const errors = [];
  const originalWarn = globalThis.console?.warn;
  const handler = createRemoteSpellingActionHandler({
    store,
    services: {
      spelling: {
        getPrefs(learnerId) {
          return prefsByLearner[learnerId] || {};
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    setRuntimeError(message) {
      errors.push({ learnerId: getState().learners.selectedId, message });
      store.patch((current) => ({
        subjectUi: {
          ...current.subjectUi,
          spelling: {
            ...current.subjectUi.spelling,
            error: message,
          },
        },
      }));
    },
    subjectCommands: {
      send() {
        return pending.promise;
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }), true);
  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'extra');

  store.patch((current) => ({
    ...current,
    learners: { selectedId: 'learner-b' },
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-b'] },
        error: '',
      },
    },
  }));

  try {
    if (globalThis.console) globalThis.console.warn = () => {};
    await flushTimers();
    pending.reject(new Error('Save failed'));
    await flushPromises();
    await flushPromises();
  } finally {
    if (globalThis.console) globalThis.console.warn = originalWarn;
  }

  assert.deepEqual(errors, []);
  assert.equal(getState().learners.selectedId, 'learner-b');
  assert.equal(getState().subjectUi.spelling.error, '');

  store.patch((current) => ({
    ...current,
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        phase: 'dashboard',
        prefs: { ...prefsByLearner['learner-a'] },
        error: '',
      },
    },
  }));
  handler.reapplyPendingOptimisticPrefs();

  assert.equal(getState().subjectUi.spelling.prefs.yearFilter, 'core');
  assert.equal(getState().subjectUi.spelling.error, 'Save failed');
});

test('remote spelling successful commands clear scoped save errors', async () => {
  const persistedPrefs = { mode: 'smart', yearFilter: 'core', roundLength: '10', extraWordFamilies: false };
  const { getState, store } = createStoreHarness({
    learners: { selectedId: 'learner-a' },
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs: { ...persistedPrefs },
        error: '',
      },
    },
  });
  const pendingSave = deferred();
  const sent = [];
  const originalWarn = globalThis.console?.warn;
  const originalReload = store.reloadFromRepositories;
  store.reloadFromRepositories = (options) => {
    originalReload(options);
    store.patch((current) => ({
      subjectUi: {
        ...current.subjectUi,
        spelling: {
          ...current.subjectUi.spelling,
          phase: 'session',
          prefs: { ...persistedPrefs },
          error: '',
        },
      },
    }));
  };
  const handler = createRemoteSpellingActionHandler({
    store,
    services: {
      spelling: {
        getPrefs() {
          return persistedPrefs;
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        if (request.command === 'save-prefs') return pendingSave.promise;
        return Promise.resolve({ subjectReadModel: { phase: 'session' } });
      },
    },
    preferenceSaveDebounceMs: 0,
  });

  assert.equal(handler.handle('spelling-set-pref', { pref: 'yearFilter', value: 'extra' }), true);

  try {
    if (globalThis.console) globalThis.console.warn = () => {};
    await flushTimers();
    pendingSave.reject(new Error('Save failed'));
    await flushPromises();
    await flushPromises();
  } finally {
    if (globalThis.console) globalThis.console.warn = originalWarn;
  }

  assert.equal(getState().subjectUi.spelling.error, 'Save failed');

  assert.equal(handler.handle('spelling-start'), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();
  await flushPromises();

  assert.deepEqual(sent.map((request) => request.command), ['save-prefs', 'start-session']);
  assert.equal(getState().subjectUi.spelling.phase, 'session');
  assert.equal(getState().subjectUi.spelling.error, '');

  handler.reapplyPendingOptimisticPrefs();
  assert.equal(getState().subjectUi.spelling.error, '');
});

// -----------------------------------------------------------------------------
// U3: Guardian-safe summary drill parity on the remote-sync path.
//
// `module.js` U3 branch + `remote-actions.js` U3 branch must round-trip the
// same `practiceOnly` flag for Guardian-origin summaries, otherwise a learner
// running on remote-sync (which routes `spelling-drill-all` / -single through
// the Worker) would bypass the local practiceOnly gate and the Worker would
// happily call `applyLearningOutcome`, demoting Mega on a wrong answer in the
// practice round.
// -----------------------------------------------------------------------------

function createDrillHarness({ summaryMode, mistakes = [{ slug: 'possess', word: 'possess' }] }) {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'summary',
        summary: {
          mode: summaryMode,
          mistakes,
          totalWords: Math.max(1, mistakes.length),
        },
        session: null,
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
          return { mode: 'smart', roundLength: '10', yearFilter: 'core', autoSpeak: true, showCloze: true, extraWordFamilies: false };
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        return Promise.resolve({ subjectReadModel: { phase: 'session' } });
      },
    },
  });
  return { handler, sent, getState };
}

test('U3 remote-sync: guardian-origin drill-all forwards practiceOnly:true on the Worker start-session command', async () => {
  const { handler, sent } = createDrillHarness({ summaryMode: 'guardian' });
  assert.equal(handler.handle('spelling-drill-all'), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].command, 'start-session');
  assert.equal(sent[0].payload.mode, 'trouble');
  assert.equal(sent[0].payload.practiceOnly, true, 'Guardian-origin remote drill-all must carry practiceOnly=true');
  assert.deepEqual(sent[0].payload.words, ['possess']);
});

test('U3 remote-sync: guardian-origin drill-single forwards practiceOnly:true on the Worker start-session command', async () => {
  const { handler, sent } = createDrillHarness({ summaryMode: 'guardian' });
  assert.equal(handler.handle('spelling-drill-single', { slug: 'possess' }), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].command, 'start-session');
  assert.equal(sent[0].payload.mode, 'single');
  assert.equal(sent[0].payload.practiceOnly, true, 'Guardian-origin remote drill-single must carry practiceOnly=true');
  assert.deepEqual(sent[0].payload.words, ['possess']);
});

test('U3 remote-sync: legacy non-Guardian drill-all does NOT set practiceOnly (characterisation)', async () => {
  const { handler, sent } = createDrillHarness({ summaryMode: 'smart' });
  assert.equal(handler.handle('spelling-drill-all'), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.mode, 'trouble');
  assert.notEqual(sent[0].payload.practiceOnly, true, 'non-Guardian remote drill-all must keep legacy behaviour (practiceOnly !== true)');
});

test('U3 remote-sync: legacy non-Guardian drill-single does NOT set practiceOnly (characterisation)', async () => {
  const { handler, sent } = createDrillHarness({ summaryMode: 'smart' });
  assert.equal(handler.handle('spelling-drill-single', { slug: 'possess' }), true);
  await flushPromises();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.mode, 'single');
  assert.notEqual(sent[0].payload.practiceOnly, true, 'non-Guardian remote drill-single must keep legacy behaviour (practiceOnly !== true)');
});

// -----------------------------------------------------------------------------
// U10 review blockers 2 + 3 — remote-sync Boss-shortcut parity.
//
// Blocker 2: the remote-sync `spelling-shortcut-start` handler used to
// unconditionally send `length: prefs.roundLength` to the Worker, ignoring
// `data.length`. That made Alt+5 and the Begin button diverge under
// remote-sync: the Begin button dispatches `{ mode: 'boss', length: 10 }`,
// Alt+5 now dispatches the same — both MUST arrive at the Worker as
// `length: 10`, not `prefs.roundLength`.
//
// Blocker 3: the remote-sync handler used to run `save-prefs` BEFORE
// `start-session`. If `start-session` failed, `prefs.mode` stayed
// persisted as 'boss' — leaving the dashboard pointing at a mode the
// learner never actually landed in. The fix mirrors module.js U9: run
// `start-session` first, `save-prefs` only on success, and rollback the
// optimistic patch if the start rejects.
// -----------------------------------------------------------------------------

function createBossShortcutHarness({
  startResponse = { subjectReadModel: { phase: 'session' } },
  startRejection = null,
  saveResponse = { subjectReadModel: { phase: 'session' } },
  prefs = { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
} = {}) {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs,
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
        // `allWordsMega: true` — the Boss gate lets the shortcut through.
        getPostMasteryState() {
          return { allWordsMega: true };
        },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        if (request.command === 'start-session') {
          if (startRejection) return Promise.reject(startRejection);
          return Promise.resolve(startResponse);
        }
        if (request.command === 'save-prefs') return Promise.resolve(saveResponse);
        return Promise.resolve({});
      },
    },
    preferenceSaveDebounceMs: 0,
  });
  return { handler, sent, getState };
}

test('U10 remote-sync: shortcut-start forwards explicit data.length to the Worker (Blocker 2)', async () => {
  const { handler, sent } = createBossShortcutHarness({
    prefs: { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
  });
  // Explicit length mirrors Begin-button + Alt+5 resolver payload.
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss', length: 10 }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const startSession = sent.find((request) => request.command === 'start-session');
  assert.ok(startSession, 'start-session command sent');
  assert.equal(startSession.payload.length, 10,
    'data.length must survive onto the start-session payload — not clobbered by prefs.roundLength');
  assert.equal(startSession.payload.mode, 'boss');
});

test('U10 remote-sync: shortcut-start without data.length falls back to prefs.roundLength (characterisation)', async () => {
  const { handler, sent } = createBossShortcutHarness({
    prefs: { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
  });
  // No `length` — the handler falls back to prefs.roundLength. The Boss
  // SERVICE on the Worker is then responsible for clamping '20' down to
  // BOSS_MAX_ROUND_LENGTH = 12 — this characterisation test documents
  // the fallback path explicitly so a future edit that breaks it is loud.
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss' }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const startSession = sent.find((request) => request.command === 'start-session');
  assert.ok(startSession, 'start-session command sent');
  assert.equal(startSession.payload.length, '20',
    'missing data.length → forwards prefs.roundLength verbatim; Worker clamps to 12 at submit.');
});

test('U10 remote-sync: shortcut-start runs start-session FIRST, then save-prefs (Blocker 3 ordering)', async () => {
  const { handler, sent } = createBossShortcutHarness();
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss', length: 10 }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const orderedCommands = sent.map((request) => request.command);
  assert.deepEqual(orderedCommands, ['start-session', 'save-prefs'],
    'start-session must run before save-prefs so a failed start cannot leave prefs.mode = "boss"');
});

test('U10 remote-sync: failed start-session skips save-prefs entirely (Blocker 3 rollback)', async () => {
  const originalWarn = globalThis.console?.warn;
  if (globalThis.console) globalThis.console.warn = () => {};
  try {
    const { handler, sent } = createBossShortcutHarness({
      startRejection: new Error('start-session rejected'),
    });
    assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss', length: 10 }), true);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const commands = sent.map((request) => request.command);
    assert.deepEqual(commands, ['start-session'],
      'start-session failure must NOT fire save-prefs — prefs.mode must not be mutated to "boss"');
    assert.equal(commands.includes('save-prefs'), false,
      'explicit inverse: save-prefs must not appear in the command list on start failure');
  } finally {
    if (globalThis.console) globalThis.console.warn = originalWarn;
  }
});

test('U10 remote-sync: non-session start response skips save-prefs (dashboard bounce rollback)', async () => {
  // The Worker may reject a start inline by returning a response whose read
  // model phase is not 'session' (e.g. ok:false, validation error). In that
  // case save-prefs must NOT run — mirror of module.js `transition?.ok !== false`.
  const { handler, sent } = createBossShortcutHarness({
    startResponse: { ok: false, subjectReadModel: { phase: 'dashboard' } },
  });
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss', length: 10 }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const commands = sent.map((request) => request.command);
  assert.deepEqual(commands, ['start-session'],
    'server-level start rejection (phase !== session) must also skip save-prefs');
});

// -----------------------------------------------------------------------------
// U4 (P2): Alt+4 (Guardian) + Alt+5 (Boss) regression pin for BOTH dispatchers.
//
// The ordering fix already shipped in P1.5 U10 but the regression surface is
// subtle enough to pin explicitly here. Test matrix per mode:
//   - remote-sync async path (sendCommand('start-session') before
//     sendCommand('save-prefs'); save-prefs skipped on failure).
//   - module.js synchronous path via a spy on `service.startSession` +
//     `service.savePrefs`; tested separately below under the `U4 module.js`
//     heading because they exercise a different dispatcher.
// -----------------------------------------------------------------------------

function createGuardianShortcutHarness({
  startResponse = { subjectReadModel: { phase: 'session' } },
  startRejection = null,
  saveResponse = { subjectReadModel: { phase: 'session' } },
  prefs = { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
} = {}) {
  const { getState, store } = createStoreHarness({
    subjectUi: {
      spelling: {
        phase: 'dashboard',
        prefs,
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
        getPrefs() { return getState().subjectUi.spelling.prefs; },
        // `allWordsMega: true` — Guardian gate lets Alt+4 through.
        getPostMasteryState() { return { allWordsMega: true }; },
      },
    },
    tts: createTtsHarness(),
    readModels: { readJson: async () => ({}) },
    subjectCommands: {
      send(request) {
        sent.push(request);
        if (request.command === 'start-session') {
          if (startRejection) return Promise.reject(startRejection);
          return Promise.resolve(startResponse);
        }
        if (request.command === 'save-prefs') return Promise.resolve(saveResponse);
        return Promise.resolve({});
      },
    },
    preferenceSaveDebounceMs: 0,
  });
  return { handler, sent, getState };
}

test('U4 remote-sync: Alt+4 Guardian shortcut runs start-session FIRST, then save-prefs (ordering pin)', async () => {
  const { handler, sent } = createGuardianShortcutHarness();
  // Alt+4 dispatches { mode: 'guardian' } WITHOUT an explicit length — the
  // handler falls back to prefs.roundLength. Unlike Alt+5 Boss, Guardian does
  // not override the round length on the shortcut payload.
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'guardian' }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const orderedCommands = sent.map((request) => request.command);
  assert.deepEqual(orderedCommands, ['start-session', 'save-prefs'],
    'Guardian (Alt+4) ordering must be start-session → save-prefs: a failed Guardian start cannot persist prefs.mode = "guardian"');
  const startSession = sent.find((request) => request.command === 'start-session');
  assert.equal(startSession.payload.mode, 'guardian');
});

test('U4 remote-sync: Alt+4 Guardian failed start-session skips save-prefs (rollback pin)', async () => {
  const originalWarn = globalThis.console?.warn;
  if (globalThis.console) globalThis.console.warn = () => {};
  try {
    const { handler, sent } = createGuardianShortcutHarness({
      startRejection: new Error('Guardian start rejected'),
    });
    assert.equal(handler.handle('spelling-shortcut-start', { mode: 'guardian' }), true);
    await flushPromises();
    await flushPromises();
    await flushPromises();

    const commands = sent.map((request) => request.command);
    assert.deepEqual(commands, ['start-session'],
      'Alt+4 failure must NOT fire save-prefs — prefs.mode must not be mutated to "guardian"');
  } finally {
    if (globalThis.console) globalThis.console.warn = originalWarn;
  }
});

test('U4 remote-sync: Alt+4 Guardian non-session start response skips save-prefs', async () => {
  const { handler, sent } = createGuardianShortcutHarness({
    startResponse: { ok: false, subjectReadModel: { phase: 'dashboard' } },
  });
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'guardian' }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const commands = sent.map((request) => request.command);
  assert.deepEqual(commands, ['start-session'],
    'server-level start rejection (phase !== session) must also skip save-prefs on Guardian Alt+4');
});

test('U4 remote-sync: Alt+5 Boss pinned length = 10 (BOSS_DEFAULT_ROUND_LENGTH) on the start-session payload', async () => {
  // Explicit second-pass pin: `length: 10` is the BOSS_DEFAULT_ROUND_LENGTH
  // constant in service-contract.js. A future refactor that wires Alt+5 to
  // prefs.roundLength without this override would fail this assertion.
  const { handler, sent } = createBossShortcutHarness({
    prefs: { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
  });
  assert.equal(handler.handle('spelling-shortcut-start', { mode: 'boss', length: 10 }), true);
  await flushPromises();
  await flushPromises();
  await flushPromises();

  const startSession = sent.find((request) => request.command === 'start-session');
  assert.equal(startSession.payload.length, 10,
    'Alt+5 Boss shortcut pinned to BOSS_DEFAULT_ROUND_LENGTH = 10');
  assert.equal(startSession.payload.mode, 'boss');
  const orderedCommands = sent.map((request) => request.command);
  assert.deepEqual(orderedCommands, ['start-session', 'save-prefs'],
    'Alt+5 Boss ordering: start-session FIRST, then save-prefs');
});

// -----------------------------------------------------------------------------
// U4 (P2): module.js LOCAL SYNCHRONOUS path pinning. The spec in the plan
// says the local path asserts:
//   1. service.startSession(...) fires before service.savePrefs(...).
//   2. savePrefs only when `transition?.ok !== false`.
// Both for Alt+4 (Guardian) AND Alt+5 (Boss) dispatch.
//
// We drive `spellingModule.handleAction(...)` directly with a spy service
// so the ordering assertion is decoupled from the full app harness.
// -----------------------------------------------------------------------------

import { spellingModule } from '../src/subjects/spelling/module.js';
import { BOSS_DEFAULT_ROUND_LENGTH } from '../src/subjects/spelling/service-contract.js';

function createModuleShortcutSpy({
  allWordsMega = true,
  startResult = { ok: true, state: { phase: 'session', session: { id: 's' } } },
  prefs = { mode: 'smart', yearFilter: 'core', roundLength: '20', extraWordFamilies: false },
} = {}) {
  const callLog = [];
  const service = {
    initState(state) { return state || { phase: 'dashboard' }; },
    getPrefs() { return { ...prefs }; },
    getPostMasteryState() { return { allWordsMega }; },
    startSession(learnerId, options) {
      callLog.push({ name: 'startSession', args: { learnerId, options } });
      return startResult;
    },
    savePrefs(learnerId, patch) {
      callLog.push({ name: 'savePrefs', args: { learnerId, patch } });
      return { ...prefs, ...patch };
    },
  };
  const context = {
    appState: {
      learners: { selectedId: 'learner-a', byId: { 'learner-a': { id: 'learner-a' } } },
      subjectUi: { spelling: { phase: 'dashboard' } },
      transientUi: {},
    },
    data: {},
    store: {
      patch() {},
      updateSubjectUi() {},
      getState() { return context.appState; },
    },
    service,
    tts: { speak() {}, stop() {} },
    applySubjectTransition() { return true; },
  };
  return { service, context, callLog };
}

test('U4 module.js: Alt+4 Guardian — service.startSession fires BEFORE service.savePrefs (local-path ordering pin)', () => {
  const { context, callLog } = createModuleShortcutSpy({
    startResult: { ok: true, state: { phase: 'session', session: { id: 'guardian-1' } } },
  });
  spellingModule.handleAction('spelling-shortcut-start', { ...context, data: { mode: 'guardian' } });

  const names = callLog.map((entry) => entry.name);
  // Must start with startSession (savePrefs may or may not follow, but it
  // must not precede it).
  assert.equal(names[0], 'startSession',
    'Guardian local path: service.startSession must be the FIRST service call on Alt+4');
  const startIdx = names.indexOf('startSession');
  const saveIdx = names.indexOf('savePrefs');
  assert.ok(startIdx < saveIdx,
    `Guardian local path ordering: startSession (${startIdx}) must precede savePrefs (${saveIdx})`);
});

test('U4 module.js: Alt+4 Guardian — failed startSession (ok:false) does NOT call savePrefs (local-path rollback pin)', () => {
  const { context, callLog } = createModuleShortcutSpy({
    startResult: { ok: false, state: { phase: 'dashboard' } },
  });
  spellingModule.handleAction('spelling-shortcut-start', { ...context, data: { mode: 'guardian' } });

  const names = callLog.map((entry) => entry.name);
  assert.ok(names.includes('startSession'),
    'Guardian local path invoked startSession');
  assert.equal(names.includes('savePrefs'), false,
    'Guardian local path: ok:false transition must NOT fire savePrefs — prefs.mode stays on the pre-Alt+4 value');
});

test('U4 module.js: Alt+5 Boss — service.startSession fires BEFORE service.savePrefs and receives length = BOSS_DEFAULT_ROUND_LENGTH', () => {
  const { context, callLog } = createModuleShortcutSpy({
    startResult: { ok: true, state: { phase: 'session', session: { id: 'boss-1' } } },
  });
  spellingModule.handleAction('spelling-shortcut-start', {
    ...context,
    data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
  });

  const startCall = callLog.find((entry) => entry.name === 'startSession');
  assert.ok(startCall, 'Boss local path invoked service.startSession');
  assert.equal(startCall.args.options.mode, 'boss');
  assert.equal(startCall.args.options.length, BOSS_DEFAULT_ROUND_LENGTH,
    'Alt+5 Boss local path: length = BOSS_DEFAULT_ROUND_LENGTH (10) must survive onto startSession options');
  const names = callLog.map((entry) => entry.name);
  const startIdx = names.indexOf('startSession');
  const saveIdx = names.indexOf('savePrefs');
  assert.ok(startIdx < saveIdx, `Boss local path ordering: startSession (${startIdx}) must precede savePrefs (${saveIdx})`);
});

test('U4 module.js: Alt+5 Boss — failed startSession (ok:false) does NOT call savePrefs (local-path rollback pin)', () => {
  const { context, callLog } = createModuleShortcutSpy({
    startResult: { ok: false, state: { phase: 'dashboard' } },
  });
  spellingModule.handleAction('spelling-shortcut-start', {
    ...context,
    data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
  });
  const names = callLog.map((entry) => entry.name);
  assert.ok(names.includes('startSession'));
  assert.equal(names.includes('savePrefs'), false,
    'Boss local path: ok:false transition must NOT fire savePrefs — prefs.mode stays on the pre-Alt+5 value');
});

test('U4 module.js: Alt+4 Guardian is a no-op when allWordsMega=false — neither startSession nor savePrefs fires', () => {
  const { context, callLog } = createModuleShortcutSpy({ allWordsMega: false });
  spellingModule.handleAction('spelling-shortcut-start', { ...context, data: { mode: 'guardian' } });
  const names = callLog.map((entry) => entry.name);
  assert.equal(names.includes('startSession'), false,
    'Guardian gate held — startSession must NOT fire before graduation');
  assert.equal(names.includes('savePrefs'), false,
    'Guardian gate held — savePrefs must NOT fire before graduation');
});

test('U4 module.js: Alt+5 Boss is a no-op when allWordsMega=false — neither startSession nor savePrefs fires', () => {
  const { context, callLog } = createModuleShortcutSpy({ allWordsMega: false });
  spellingModule.handleAction('spelling-shortcut-start', {
    ...context,
    data: { mode: 'boss', length: BOSS_DEFAULT_ROUND_LENGTH },
  });
  const names = callLog.map((entry) => entry.name);
  assert.equal(names.includes('startSession'), false,
    'Boss gate held — startSession must NOT fire before graduation');
  assert.equal(names.includes('savePrefs'), false,
    'Boss gate held — savePrefs must NOT fire before graduation');
});
