import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';

import {
  createCredentialFetch,
  createRepositoriesForBrowserRuntime,
  localCodexReviewLearnerIdFromUrl,
  reviewLearnerIdFromMode,
  shouldOpenLocalCodexReview,
} from '../src/platform/app/bootstrap.js';
import { createAppController } from '../src/platform/app/create-app-controller.js';
import { createLocalAppController } from '../src/platform/app/create-local-app-controller.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import {
  acknowledgeMonsterCelebrationEvents,
  acknowledgedMonsterCelebrationIds,
} from '../src/platform/game/monster-celebration-acks.js';
import {
  LOCAL_CODEX_REVIEW_LEARNER_ID,
  LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS,
} from '../src/platform/core/local-review-profile.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { normaliseGrammarReadModel } from '../src/subjects/grammar/metadata.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { flushMicrotasks } from './helpers/microtasks.js';

function typedFormData(value) {
  const formData = new FormData();
  formData.set('typed', value);
  return formData;
}

function makeBrokenSubject() {
  return {
    id: 'broken-action',
    name: 'Broken Action',
    blurb: 'Deliberately broken for controller tests.',
    accent: '#8B5CF6',
    accentSoft: '#F3E8FF',
    icon: 'quote',
    available: true,
    initState() {
      return { phase: 'dashboard', error: '' };
    },
    getDashboardStats() {
      return { pct: 0, due: 0, streak: 0, nextUp: 'Broken fixture' };
    },
    PracticeComponent() {
      return React.createElement('button', { type: 'button', onClick: () => {} }, 'Break');
    },
    handleAction(action) {
      if (action === 'broken-action-trigger') throw new Error('handleAction exploded');
      return false;
    },
  };
}

function jsonResponse(ok, payload) {
  return {
    ok,
    async json() {
      return payload;
    },
  };
}

test('browser bootstrap does not create local repositories for file or local query modes', async () => {
  const storage = installMemoryStorage();
  const location = new URL('file:///tmp/index.html?local=1&codexReview=stage-3');

  const boot = await createRepositoriesForBrowserRuntime({
    location,
    storage,
    credentialFetch: async () => jsonResponse(false, { ok: false }),
    waitForAuthRequired: false,
  });

  assert.equal(boot.session.mode, 'auth-required');
  assert.equal(boot.repositories, null);
  assert.equal(reviewLearnerIdFromMode('eggs'), LOCAL_CODEX_REVIEW_LEARNER_ID);
  assert.equal(
    localCodexReviewLearnerIdFromUrl({ location }),
    '',
  );
  assert.equal(shouldOpenLocalCodexReview({ location }), false);
  assert.equal(Boolean(LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3]), true);
});

test('browser bootstrap builds remote repositories from an authenticated session payload', async () => {
  const calls = [];
  const credentialFetch = async (input, init) => {
    calls.push({ input, init });
    return jsonResponse(true, {
      session: {
        accountId: 'adult-remote',
        email: 'parent@example.com',
        provider: 'password',
      },
      account: {
        platformRole: 'admin',
        repoRevision: 7,
      },
    });
  };

  const boot = await createRepositoriesForBrowserRuntime({
    location: new URL('https://ks2.example.test/'),
    storage: installMemoryStorage(),
    credentialFetch,
  });

  assert.equal(calls[0].input, '/api/auth/session');
  assert.equal(boot.session.mode, 'remote-sync');
  assert.equal(boot.session.accountId, 'adult-remote');
  assert.equal(boot.session.platformRole, 'admin');
  assert.equal(boot.session.repoRevision, 7);
  assert.equal(Boolean(boot.repositories.persistence), true);
});

test('browser bootstrap surfaces auth-required state without creating repositories in tests', async () => {
  let authRequired = null;
  const boot = await createRepositoriesForBrowserRuntime({
    location: new URL('https://ks2.example.test/?auth_error=expired'),
    storage: installMemoryStorage(),
    credentialFetch: async () => jsonResponse(false, { ok: false }),
    waitForAuthRequired: false,
    onAuthRequired(payload) {
      authRequired = payload;
    },
  });

  assert.equal(authRequired.error, 'expired');
  assert.equal(boot.repositories, null);
  assert.equal(boot.session.mode, 'auth-required');
  assert.equal(boot.session.authRequired, true);
});

test('credential fetch preserves caller options and adds same-origin credentials', async () => {
  const calls = [];
  const credentialFetch = createCredentialFetch(async (input, init) => {
    calls.push({ input, init });
    return jsonResponse(true, { ok: true });
  });

  await credentialFetch('/api/example', {
    method: 'POST',
    headers: { accept: 'application/json' },
  });

  assert.deepEqual(calls, [{
    input: '/api/example',
    init: {
      method: 'POST',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    },
  }]);
});

test('controller bootstraps local repositories, store, services, and snapshot without rendering DOM', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const controller = createLocalAppController({ repositories });
  const snapshot = controller.getSnapshot();

  assert.equal(snapshot.appState.route.screen, 'dashboard');
  assert.equal(snapshot.appState.learners.allIds.length, 1);
  assert.equal(typeof snapshot.appState.learners.selectedId, 'string');
  assert.equal(Boolean(controller.services.spelling), true);
  assert.equal(snapshot.repositories, repositories);
  assert.equal(snapshot.session.mode, 'local-only');
  assert.equal(snapshot.ui.adultSurface.parentHub.status, 'idle');
});

test('controller persists profile TTS provider in spelling prefs', () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const learnerId = controller.store.getState().learners.selectedId;
  const formData = new FormData();
  formData.set('name', 'Ava');
  formData.set('yearGroup', 'Y5');
  formData.set('goal', 'sats');
  formData.set('dailyMinutes', '15');
  formData.set('avatarColor', '#3E6FA8');
  formData.set('ttsProvider', 'gemini');
  formData.set('bufferedGeminiVoice', 'Sulafat');

  controller.dispatch('learner-save-form', { formData });

  assert.equal(controller.services.spelling.getPrefs(learnerId).ttsProvider, 'gemini');
  assert.equal(controller.services.spelling.getPrefs(learnerId).bufferedGeminiVoice, 'Sulafat');
});

test('controller dispatches profile TTS test through the selected provider', () => {
  installMemoryStorage();
  const controller = createLocalAppController();

  controller.dispatch('tts-test', { provider: 'browser' });

  assert.deepEqual(controller.tts.spoken.at(-1), {
    word: 'early',
    sentence: 'The birds sang early in the day.',
    provider: 'browser',
    bufferedGeminiVoice: 'Iapetus',
    kind: 'test',
  });
});

test('controller clears monster celebration acknowledgements on learner reset, delete, and full reset', () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const learnerA = controller.store.getState().learners.selectedId;
  const learnerAReward = {
    id: 'reward.monster:learner-a:inklet:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: learnerA,
    monsterId: 'inklet',
    monster: { id: 'inklet', name: 'Inklet' },
    previous: { stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: Date.now(),
  };

  acknowledgeMonsterCelebrationEvents(learnerAReward, { learnerId: learnerA });
  assert.equal(acknowledgedMonsterCelebrationIds(learnerA).has(learnerAReward.id), true);

  controller.dispatch('learner-reset-progress');

  assert.equal(acknowledgedMonsterCelebrationIds(learnerA).has(learnerAReward.id), false);

  const learnerB = controller.store.createLearner({ name: 'Bryn', yearGroup: 'Y5' }).id;
  const learnerBReward = {
    id: 'reward.monster:learner-b:phaeton:evolve:1:2',
    type: 'reward.monster',
    kind: 'evolve',
    learnerId: learnerB,
    monsterId: 'phaeton',
    monster: { id: 'phaeton', name: 'Phaeton' },
    previous: { stage: 0, level: 1, caught: true, branch: 'b1' },
    next: { stage: 1, level: 2, caught: true, branch: 'b1' },
    createdAt: Date.now(),
  };

  acknowledgeMonsterCelebrationEvents(learnerBReward, { learnerId: learnerB });
  assert.equal(acknowledgedMonsterCelebrationIds(learnerB).has(learnerBReward.id), true);

  controller.dispatch('learner-delete');

  assert.equal(acknowledgedMonsterCelebrationIds(learnerB).has(learnerBReward.id), false);

  acknowledgeMonsterCelebrationEvents(learnerAReward, { learnerId: learnerA });
  assert.equal(acknowledgedMonsterCelebrationIds(learnerA).has(learnerAReward.id), true);

  controller.dispatch('platform-reset-all');

  assert.equal(acknowledgedMonsterCelebrationIds(learnerA).has(learnerAReward.id), false);
});

test('controller dispatches spelling transitions through store, repositories, events, and TTS', () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const learnerId = controller.store.getState().learners.selectedId;
  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });

  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');

  const state = controller.store.getState();
  const persisted = controller.repositories.subjectStates.read(learnerId, 'spelling');
  assert.equal(state.route.screen, 'subject');
  assert.equal(state.subjectUi.spelling.phase, 'session');
  assert.equal(persisted.ui.phase, 'session');
  assert.equal(controller.tts.spoken.length, 1);

  const answer = state.subjectUi.spelling.session.currentCard.word.word;
  controller.dispatch('spelling-submit-form', { formData: typedFormData(answer) });

  assert.ok(controller.repositories.practiceSessions.list(learnerId).length >= 1);
});

test('controller delegates server-synced spelling actions to the remote command boundary', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const remoteCalls = [];
  const session = { signedIn: true, mode: 'remote-sync', platformRole: 'parent' };
  const controller = createAppController({
    repositories,
    session,
    extraContext: {
      session,
      handleRemoteSpellingAction(action, data) {
        remoteCalls.push({ action, data });
        return true;
      },
    },
  });
  const learnerId = controller.store.getState().learners.selectedId;

  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start', { source: 'test' });

  assert.deepEqual(remoteCalls, [{ action: 'spelling-start', data: { source: 'test' } }]);
  assert.equal(controller.store.getState().subjectUi.spelling.phase, 'dashboard');
  assert.equal(controller.repositories.practiceSessions.list(learnerId).length, 0);
  assert.equal(controller.runtimeBoundary.list().length, 0);
});

test('controller keeps late Grammar command responses scoped to their original learner', async () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  let resolveCommand;
  const subjectCommands = {
    requests: [],
    send(request) {
      this.requests.push(request);
      return new Promise((resolve) => {
        resolveCommand = resolve;
      });
    },
  };
  const controller = createAppController({
    repositories,
    extraContext: {
      runtimeReadOnly: false,
      subjectCommands,
    },
  });
  const learnerA = controller.store.getState().learners.selectedId;
  const learnerB = controller.store.createLearner({ name: 'Bryn', yearGroup: 'Y5' }).id;

  controller.dispatch('learner-select', { value: learnerA });
  controller.dispatch('open-subject', { subjectId: 'grammar' });
  controller.dispatch('grammar-start');

  assert.equal(subjectCommands.requests.length, 1);
  assert.equal(subjectCommands.requests[0].learnerId, learnerA);
  assert.equal(controller.store.getState().subjectUi.grammar.pendingCommand, 'start-session');

  controller.dispatch('learner-select', { value: learnerB });
  const learnerBUiBeforeResponse = JSON.stringify(controller.store.getState().subjectUi.grammar);

  resolveCommand({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId: learnerA,
      phase: 'summary',
      summary: { sessionId: 'learner-a-summary' },
      analytics: { concepts: [] },
    }, learnerA),
    projections: {
      rewards: {
        toastEvents: [{ id: 'learner-a-toast' }],
        events: [{ id: 'learner-a-celebration' }],
      },
    },
  });
  await Promise.resolve();

  const state = controller.store.getState();
  assert.equal(state.learners.selectedId, learnerB);
  assert.equal(JSON.stringify(state.subjectUi.grammar), learnerBUiBeforeResponse);
  assert.equal(state.toasts.length, 0);
  assert.equal(state.monsterCelebrations.pending.length, 0);
  assert.equal(state.monsterCelebrations.queue.length, 0);

  const learnerARecord = controller.repositories.subjectStates.read(learnerA, 'grammar');
  assert.equal(learnerARecord.ui.phase, 'summary');
  assert.equal(learnerARecord.ui.learnerId, learnerA);
  assert.equal(learnerARecord.ui.pendingCommand, '');
  assert.equal(controller.repositories.subjectStates.read(learnerB, 'grammar').ui, null);
});

test('controller ignores setup preference commands while Grammar start is pending', async () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  let resolveStart;
  const subjectCommands = {
    requests: [],
    send(request) {
      this.requests.push(request);
      return new Promise((resolve) => {
        if (request.command === 'start-session') resolveStart = resolve;
      });
    },
  };
  const controller = createAppController({
    repositories,
    extraContext: {
      runtimeReadOnly: false,
      subjectCommands,
    },
  });
  const learnerId = controller.store.getState().learners.selectedId;

  controller.dispatch('open-subject', { subjectId: 'grammar' });
  controller.dispatch('grammar-start');
  controller.dispatch('grammar-set-mode', { value: 'learn' });
  controller.dispatch('grammar-set-round-length', { value: '15' });

  assert.equal(subjectCommands.requests.length, 1);
  assert.equal(subjectCommands.requests[0].command, 'start-session');
  assert.equal(controller.store.getState().subjectUi.grammar.pendingCommand, 'start-session');

  resolveStart({
    subjectReadModel: normaliseGrammarReadModel({
      learnerId,
      phase: 'session',
      session: { id: 'grammar-session-a' },
      analytics: { concepts: [] },
    }, learnerId),
  });
  await Promise.resolve();

  const grammar = controller.store.getState().subjectUi.grammar;
  assert.equal(grammar.phase, 'session');
  assert.equal(grammar.session.id, 'grammar-session-a');
  assert.equal(grammar.prefs.mode, 'smart');
  assert.equal(grammar.prefs.roundLength, 5);
});

test('controller stops spelling audio when feedback has no auto-speak cue', () => {
  installMemoryStorage();
  const tts = {
    spoken: [],
    stopCalls: 0,
    speak(payload) {
      this.spoken.push(payload);
    },
    stop() {
      this.stopCalls += 1;
    },
    warmup() {},
  };
  const controller = createLocalAppController({ tts });
  const learnerId = controller.store.getState().learners.selectedId;
  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1' });

  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start');
  const stopCallsBeforeAnswer = tts.stopCalls;
  const answer = controller.store.getState().subjectUi.spelling.session.currentCard.word.word;

  controller.dispatch('spelling-submit-form', { formData: typedFormData(answer) });

  assert.equal(controller.store.getState().subjectUi.spelling.awaitingAdvance, true);
  assert.equal(tts.spoken.length, 1);
  assert.equal(tts.stopCalls, stopCallsBeforeAnswer + 1);
});

test('controller can defer spelling start audio until the flow transition flushes', () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const learnerId = controller.store.getState().learners.selectedId;
  controller.services.spelling.savePrefs(learnerId, { mode: 'smart', roundLength: '1', autoSpeak: true });

  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.dispatch('spelling-start', { deferAudioUntilFlowTransitionEnd: true });

  const state = controller.store.getState();
  assert.equal(state.subjectUi.spelling.phase, 'session');
  assert.equal(controller.tts.spoken.length, 0);

  assert.equal(controller.flushDeferredAudio(), true);
  assert.equal(controller.tts.spoken.length, 1);
  assert.equal(controller.tts.spoken[0].word.word, state.subjectUi.spelling.session.currentCard.word.word);
});

test('controller retry preserves the current route and clears runtime boundaries', async () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const learnerId = controller.store.getState().learners.selectedId;

  controller.dispatch('open-subject', { subjectId: 'spelling' });
  controller.runtimeBoundary.capture({
    learnerId,
    subject: SUBJECTS[0],
    tab: 'practice',
    phase: 'action',
    methodName: 'handleAction',
    action: 'spelling-start',
    error: new Error('contained'),
  });

  controller.dispatch('persistence-retry');
  await flushMicrotasks();

  assert.equal(controller.store.getState().route.screen, 'subject');
  assert.equal(controller.runtimeBoundary.list().length, 0);
});

test('controller contains subject action errors without mutating unrelated learner state', () => {
  installMemoryStorage();
  const brokenSubject = makeBrokenSubject();
  const controller = createLocalAppController({ subjects: [...SUBJECTS, brokenSubject] });
  const learnerId = controller.store.getState().learners.selectedId;
  const spellingBefore = JSON.stringify(controller.store.getState().subjectUi.spelling);

  controller.dispatch('open-subject', { subjectId: brokenSubject.id });
  controller.dispatch('broken-action-trigger');

  assert.equal(controller.store.getState().route.subjectId, brokenSubject.id);
  assert.equal(controller.store.getState().learners.selectedId, learnerId);
  assert.equal(JSON.stringify(controller.store.getState().subjectUi.spelling), spellingBefore);
  assert.equal(controller.runtimeBoundary.read({
    learnerId,
    subjectId: brokenSubject.id,
    tab: 'practice',
  }).methodName, 'handleAction');
});

test('controller subscribers receive a controller snapshot per logical state change', () => {
  installMemoryStorage();
  const controller = createLocalAppController();
  const snapshots = [];
  const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));

  controller.dispatch('open-codex');
  unsubscribe();
  controller.dispatch('navigate-home');

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].appState.route.screen, 'codex');
  assert.equal(snapshots[0].ui.tts.playingKind, null);
});
