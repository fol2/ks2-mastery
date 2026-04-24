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
  const commandMissedEvolution = {
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
    createdAt: now,
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
        events.push(commandMissedEvolution);
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

  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, commandMissedEvolution.id);
});

test('remote spelling compensation preserves older recent missed celebrations for later replay', () => {
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

  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, phaetonEvolution.id);

  acknowledgeMonsterCelebrationEvents(phaetonEvolution, { learnerId: 'learner-a' });
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
    compensationBaselineEventIds: new Set([directEvolution.id, phaetonEvolution.id]),
  });

  assert.deepEqual(calls.map(([name]) => name), [
    'reloadFromRepositories',
    'deferMonsterCelebrations',
    'releaseMonsterCelebrations',
  ]);
  assert.equal(getState().monsterCelebrations.queue.length, 1);
  assert.equal(getState().monsterCelebrations.queue[0].id, directEvolution.id);
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
