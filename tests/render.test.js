import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { renderApp } from '../src/platform/ui/render.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import { buildParentHubReadModel } from '../src/platform/hubs/parent-read-model.js';
import { buildAdminHubReadModel } from '../src/platform/hubs/admin-read-model.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';

test('dashboard render smoke test covers spelling subject dashboard stats without crashing', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const appState = store.getState();
  const html = renderApp(appState, {
    appState,
    store,
    repositories,
    services: { spelling: service },
    subject: SUBJECTS[0],
    service,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
    applySubjectTransition() {
      return true;
    },
  });

  assert.match(html, /Subject registry/);
  assert.match(html, /Spelling/);
  assert.match(html, /Live \/ ready/);
  assert.doesNotMatch(html, /Temporarily unavailable/);
});

test('uncaught monsters stay off the main dashboard but use codex placeholders', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories }),
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });

  const baseContext = {
    store,
    repositories,
    services: { spelling: service },
    subject: SUBJECTS[0],
    service,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
    applySubjectTransition() {
      return true;
    },
  };

  const dashboardState = store.getState();
  const dashboardHtml = renderApp(dashboardState, {
    ...baseContext,
    appState: dashboardState,
  });
  assert.doesNotMatch(dashboardHtml, /assets\/monsters\/inklet-0\.320\.webp/);
  assert.doesNotMatch(dashboardHtml, /monster-placeholder/);

  store.openSubject('spelling');
  const spellingState = store.getState();
  const spellingHtml = renderApp(spellingState, {
    ...baseContext,
    appState: spellingState,
  });
  assert.match(spellingHtml, /monster-placeholder/);
  assert.match(spellingHtml, /Not caught/);
});

test('monster celebration overlay uses high-resolution stage artwork', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const appState = {
    ...store.getState(),
    monsterCelebrations: {
      pending: [],
      queue: [
        {
          id: 'reward.monster:learner-a:inklet:caught:0:0',
          type: 'reward.monster',
          kind: 'caught',
          learnerId: 'learner-a',
          monsterId: 'inklet',
          monster: {
            id: 'inklet',
            name: 'Inklet',
            blurb: 'Grows as Year 3-4 spellings become secure.',
            accent: '#3E6FA8',
            secondary: '#9FC1E8',
            pale: '#E8F0FA',
            nameByStage: ['Inklet Egg', 'Inklet'],
            masteredMax: 100,
          },
          previous: { mastered: 0, stage: 0, level: 0, caught: false },
          next: { mastered: 1, stage: 0, level: 0, caught: true },
          createdAt: Date.UTC(2026, 0, 1),
        },
      ],
    },
  };

  const html = renderApp(appState, {
    appState,
    store,
    repositories,
    services: {},
    subject: SUBJECTS[0],
    service: null,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
    applySubjectTransition() {
      return true;
    },
  });

  assert.match(html, /monster-celebration-overlay/);
  assert.match(html, /assets\/monsters\/inklet-0\.640\.webp/);
});

test('render app exposes parent and admin operating surfaces by route', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const appState = store.getState();
  const learner = appState.learners.byId[appState.learners.selectedId];
  const baseContext = {
    appState,
    store,
    repositories,
    services: {},
    subject: SUBJECTS[0],
    service: null,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
    applySubjectTransition() {
      return true;
    },
    shellAccess: { platformRole: 'parent', source: 'local-reference' },
  };

  store.openParentHub();
  const parentState = store.getState();
  const parentHtml = renderApp(parentState, {
    ...baseContext,
    appState: parentState,
    parentHub: buildParentHubReadModel({ learner, platformRole: 'parent', membershipRole: 'owner' }),
  });
  assert.match(parentHtml, /Parent Hub thin slice/);

  store.openAdminHub();
  const adminState = store.getState();
  const adminHtml = renderApp(adminState, {
    ...baseContext,
    appState: adminState,
    shellAccess: { platformRole: 'admin', source: 'local-reference' },
    adminHub: buildAdminHubReadModel({
      account: { id: 'local-browser', platformRole: 'admin' },
      platformRole: 'admin',
      spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    }),
    adminAccountDirectory: {
      status: 'loaded',
      accounts: [
        {
          id: 'adult-admin',
          email: 'fol2hk@gmail.com',
          displayName: 'James',
          platformRole: 'admin',
          providers: ['google'],
          learnerCount: 3,
        },
        {
          id: 'adult-parent',
          email: 'parent@example.com',
          displayName: 'Parent',
          platformRole: 'parent',
          providers: ['email'],
          learnerCount: 1,
        },
      ],
      error: '',
    },
  });
  assert.match(adminHtml, /Admin \/ operations skeleton/);
  assert.match(adminHtml, /Account roles/);
  assert.match(adminHtml, /fol2hk@gmail.com/);
  assert.match(adminHtml, /data-action="admin-account-role-set"/);
});
