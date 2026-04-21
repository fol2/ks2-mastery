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
import {
  buildAdminHubAccessContext,
  buildParentHubAccessContext,
} from '../src/platform/hubs/shell-access.js';
import { SEEDED_SPELLING_CONTENT_BUNDLE } from '../src/subjects/spelling/data/content-data.js';

function noWritableLearnerState(store, routeScreen) {
  const appState = store.getState();
  return {
    ...appState,
    route: { screen: routeScreen, subjectId: null, tab: 'practice' },
    learners: {
      byId: {},
      allIds: [],
      selectedId: null,
    },
  };
}

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

  assert.match(html, /data-home-mount="true"/);
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
  assert.doesNotMatch(dashboardHtml, /assets\/monsters\/inklet\/b[12]\/inklet-b[12]-0\.320\.webp/);
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

test('home meadow shows an egg only once a species has been caught and hides uncaught species entirely', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: false, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary);

  const inklet = meadow.find((entry) => entry.species === 'inklet');
  const glimmerbug = meadow.find((entry) => entry.species === 'glimmerbug');
  const phaeton = meadow.find((entry) => entry.species === 'phaeton');

  assert.equal(inklet.stage, 0);
  assert.equal(inklet.path, 'none');
  assert.equal(glimmerbug.stage, 1);
  assert.notEqual(glimmerbug.path, 'none');
  assert.equal(phaeton, undefined);
});

test('home meadow shows all three eggs once every species has been caught but stays in stage zero', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary);

  assert.equal(meadow.length, 3);
  for (const entry of meadow) {
    assert.equal(entry.stage, 0);
    assert.equal(entry.path, 'none');
  }
});

test('home meadow hides every species for a fresh learner with nothing caught yet', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: false, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: false, stage: 0, branch: 'b1' } },
  ];
  assert.equal(buildMeadowMonsters(summary).length, 0);
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
  assert.match(html, /assets\/monsters\/inklet\/b1\/inklet-b1-0\.640\.webp/);
  assert.match(html, /assets\/monsters\/inklet\/b1\/inklet-b1-0\.1280\.webp/);
});

test('render app exposes profile, parent, and admin operating surfaces by route', () => {
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

  store.openProfileSettings();
  const profileState = store.getState();
  const profileHtml = renderApp(profileState, {
    ...baseContext,
    appState: profileState,
  });
  assert.match(profileHtml, /Profile settings/);
  assert.match(profileHtml, /Save learner profile/);

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

test('signed-in parent hub renders viewer learners as read-only without a writable shell learner', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const learner = {
    id: 'learner-viewer',
    name: 'Vera',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  };
  const parentHub = buildParentHubReadModel({
    learner,
    platformRole: 'parent',
    membershipRole: 'viewer',
    accessibleLearners: [{ learnerId: learner.id, role: 'viewer', learner }],
    selectedLearnerId: learner.id,
  });
  const appState = noWritableLearnerState(store, 'parent-hub');
  const html = renderApp(appState, {
    appState,
    store,
    repositories,
    services: {},
    subject: SUBJECTS[0],
    service: null,
    tts: { speak() {}, stop() {}, warmup() {} },
    applySubjectTransition() { return true; },
    shellAccess: { platformRole: 'parent', source: 'worker-session' },
    parentHub,
    parentHubState: { status: 'loaded', learnerId: learner.id, error: '', notice: '' },
    activeAdultLearnerContext: buildParentHubAccessContext({ learnerId: learner.id, parentHub }, null),
  });

  assert.match(html, /Adult surface learner/);
  assert.match(html, /Vera · Y5 · Viewer · read-only/);
  assert.match(html, /Read-only learner/);
  assert.match(html, /No writable learner in shell/);
  assert.match(html, /data-action="platform-export-learner" disabled aria-disabled="true"/);
});

test('signed-in admin hub labels viewer diagnostics and blocks subject entry points', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });
  const learner = {
    id: 'learner-viewer',
    name: 'Vera',
    yearGroup: 'Y5',
    goal: 'sats',
    dailyMinutes: 15,
    avatarColor: '#3E6FA8',
    createdAt: 1,
  };
  const adminHub = buildAdminHubReadModel({
    account: { id: 'adult-ops', platformRole: 'ops', selectedLearnerId: learner.id, repoRevision: 4 },
    platformRole: 'ops',
    spellingContentBundle: SEEDED_SPELLING_CONTENT_BUNDLE,
    memberships: [{ learnerId: learner.id, role: 'viewer', stateRevision: 3, learner }],
    learnerBundles: {
      [learner.id]: {
        subjectStates: {},
        practiceSessions: [],
        eventLog: [],
        gameState: {},
      },
    },
    selectedLearnerId: learner.id,
  });
  const appState = noWritableLearnerState(store, 'admin-hub');
  const html = renderApp(appState, {
    appState,
    store,
    repositories,
    services: {},
    subject: SUBJECTS[0],
    service: null,
    tts: { speak() {}, stop() {}, warmup() {} },
    applySubjectTransition() { return true; },
    shellAccess: { platformRole: 'ops', source: 'worker-session' },
    adminHub,
    adminHubState: { status: 'loaded', learnerId: learner.id, error: '', notice: '' },
    activeAdultLearnerContext: buildAdminHubAccessContext({ adminHub }, null),
    adminAccountDirectory: { status: 'unavailable', accounts: [], error: '' },
  });

  assert.match(html, /Diagnostics learner/);
  assert.match(html, /Vera · Y5 · Viewer · read-only/);
  assert.match(html, /Readable learners/);
  assert.match(html, /Read-only learner/);
  assert.match(html, /data-action="open-subject" data-subject-id="spelling" disabled aria-disabled="true"/);
});
