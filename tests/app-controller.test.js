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
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import {
  LOCAL_CODEX_REVIEW_LEARNER_ID,
  LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS,
} from '../src/platform/core/local-review-profile.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { installMemoryStorage } from './helpers/memory-storage.js';

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

test('browser bootstrap creates local repositories and recognises codex review URL modes', async () => {
  const storage = installMemoryStorage();
  const location = new URL('file:///tmp/index.html?codexReview=stage-3');

  const boot = await createRepositoriesForBrowserRuntime({ location, storage });

  assert.equal(boot.session.mode, 'local-only');
  assert.equal(reviewLearnerIdFromMode('eggs'), LOCAL_CODEX_REVIEW_LEARNER_ID);
  assert.equal(
    localCodexReviewLearnerIdFromUrl({ location }),
    LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3],
  );
  assert.equal(shouldOpenLocalCodexReview({ location }), true);
  assert.equal(boot.repositories.learners.read().selectedId, LOCAL_CODEX_STAGE_REVIEW_LEARNER_IDS[3]);
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
  const controller = createAppController({ repositories });
  const snapshot = controller.getSnapshot();

  assert.equal(snapshot.appState.route.screen, 'dashboard');
  assert.equal(snapshot.appState.learners.allIds.length, 1);
  assert.equal(typeof snapshot.appState.learners.selectedId, 'string');
  assert.equal(Boolean(controller.services.spelling), true);
  assert.equal(snapshot.repositories, repositories);
  assert.equal(snapshot.session.mode, 'local-only');
  assert.equal(snapshot.ui.adultSurface.parentHub.status, 'idle');
});

test('controller dispatches spelling transitions through store, repositories, events, and TTS', () => {
  installMemoryStorage();
  const controller = createAppController();
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

test('controller can defer spelling start audio until the flow transition flushes', () => {
  installMemoryStorage();
  const controller = createAppController();
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
  const controller = createAppController();
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
  await Promise.resolve();

  assert.equal(controller.store.getState().route.screen, 'subject');
  assert.equal(controller.runtimeBoundary.list().length, 0);
});

test('controller contains subject action errors without mutating unrelated learner state', () => {
  installMemoryStorage();
  const brokenSubject = makeBrokenSubject();
  const controller = createAppController({ subjects: [...SUBJECTS, brokenSubject] });
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
  const controller = createAppController();
  const snapshots = [];
  const unsubscribe = controller.subscribe((snapshot) => snapshots.push(snapshot));

  controller.dispatch('open-codex');
  unsubscribe();
  controller.dispatch('navigate-home');

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].appState.route.screen, 'codex');
  assert.equal(snapshots[0].ui.tts.playingKind, null);
});
