import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';

test('shared store creates and selects a new learner', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const initial = store.getState();
  const initialCount = initial.learners.allIds.length;

  const learner = store.createLearner({ name: 'Ava', yearGroup: 'Y4' });
  const state = store.getState();

  assert.equal(state.learners.allIds.length, initialCount + 1);
  assert.equal(state.learners.selectedId, learner.id);
  assert.equal(state.learners.byId[learner.id].name, 'Ava');
  assert.equal(state.subjectUi.spelling.phase, 'dashboard');
});

test('shared store can switch subject tabs without losing route context', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });

  store.openSubject('spelling');
  store.setTab('analytics');

  const state = store.getState();
  assert.equal(state.route.screen, 'subject');
  assert.equal(state.route.subjectId, 'spelling');
  assert.equal(state.route.tab, 'analytics');
});

test('shared store caches subject setup reset when runtime UI writes are cached', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  let cached = null;
  const guardedRepositories = {
    ...repositories,
    subjectStates: {
      ...repositories.subjectStates,
      cacheUi(learnerId, subjectId, ui) {
        cached = { learnerId, subjectId, ui };
        return repositories.subjectStates.writeUi(learnerId, subjectId, ui);
      },
      writeUi() {
        throw new Error('openSubject should cache the setup reset instead of queuing a runtime write.');
      },
    },
  };
  const store = createStore(SUBJECTS, { repositories: guardedRepositories, cacheSubjectUiWrites: true });
  const learnerId = store.getState().learners.selectedId;

  store.setState((current) => ({
    ...current,
    subjectUi: {
      ...current.subjectUi,
      spelling: {
        ...current.subjectUi.spelling,
        phase: 'word-bank',
        error: 'stale setup flow',
      },
    },
  }));

  store.openSubject('spelling');

  assert.equal(cached.learnerId, learnerId);
  assert.equal(cached.subjectId, 'spelling');
  assert.equal(cached.ui.phase, 'dashboard');
  assert.equal(cached.ui.error, '');
  assert.equal(store.getState().subjectUi.spelling.phase, 'dashboard');
  assert.equal(store.getState().subjectUi.spelling.error, '');
});

test('shared store can route to adult operating surfaces', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });

  store.openCodex();
  assert.equal(store.getState().route.screen, 'codex');

  store.openProfileSettings();
  assert.equal(store.getState().route.screen, 'profile-settings');

  store.openParentHub();
  assert.equal(store.getState().route.screen, 'parent-hub');

  store.openAdminHub();
  assert.equal(store.getState().route.screen, 'admin-hub');

  store.goHome();
  assert.equal(store.getState().route.screen, 'dashboard');
});

test('serialisable spelling state survives store persistence for resume', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const firstStore = createStore(SUBJECTS, { repositories });
  const learnerId = firstStore.getState().learners.selectedId;
  const started = service.startSession(learnerId, {
    mode: 'single',
    words: ['possess'],
    yearFilter: 'all',
    length: 1,
  });

  firstStore.updateSubjectUi('spelling', started.state);
  const restoredStore = createStore(SUBJECTS, { repositories });
  const restoredUi = restoredStore.getState().subjectUi.spelling;
  const resumed = service.initState(restoredUi, learnerId);

  assert.equal(resumed.phase, 'session');
  assert.equal(resumed.session.currentCard.slug, 'possess');
});
