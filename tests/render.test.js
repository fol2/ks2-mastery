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
import { MONSTERS } from '../src/platform/game/monsters.js';
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

test('home meadow uses seeded random foot positions for eggs', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const summary = [
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 0, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 0, branch: 'b1' } },
  ];
  const meadow = buildMeadowMonsters(summary, { seed: 'eggs-a' });
  const repeated = buildMeadowMonsters(summary, { seed: 'eggs-a' });
  const alternate = buildMeadowMonsters(summary, { seed: 'eggs-b' });

  assert.deepEqual(meadow.map((entry) => [entry.species, entry.x, entry.footY]), repeated.map((entry) => [entry.species, entry.x, entry.footY]));
  assert.notDeepEqual(meadow.map((entry) => entry.x), alternate.map((entry) => entry.x));
  assert.ok(meadow.every((entry) => entry.leftPct >= 25 && entry.leftPct <= 82));
  assert.ok(meadow.every((entry) => entry.footPct >= 60 && entry.footPct <= 82));
  assertMeadowSpacing(meadow);
});

test('home meadow scales mature monsters while preserving path-specific lanes', async () => {
  const { buildMeadowMonsters } = await import('../src/surfaces/home/data.js');
  const lowStage = buildMeadowMonsters([
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 1, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 1, branch: 'b1' } },
  ]);
  const highStage = buildMeadowMonsters([
    { monster: { id: 'inklet', name: 'Inklet' }, progress: { caught: true, stage: 4, branch: 'b1' } },
    { monster: { id: 'glimmerbug', name: 'Glimmerbug' }, progress: { caught: true, stage: 4, branch: 'b1' } },
    { monster: { id: 'phaeton', name: 'Phaeton' }, progress: { caught: true, stage: 4, branch: 'b1' } },
  ]);

  for (const species of ['inklet', 'glimmerbug', 'phaeton']) {
    assert.ok(highStage.find((entry) => entry.species === species).size > lowStage.find((entry) => entry.species === species).size);
  }
  const inklet = highStage.find((entry) => entry.species === 'inklet');
  const glimmerbug = highStage.find((entry) => entry.species === 'glimmerbug');
  const phaeton = highStage.find((entry) => entry.species === 'phaeton');

  assert.equal(inklet.lane, 'ground');
  assert.equal(glimmerbug.lane, 'air');
  assert.equal(phaeton.lane, 'air');
  assert.ok(inklet.size > phaeton.size);
  assert.ok(phaeton.size > 0);
  assert.ok(glimmerbug.size > 0);
  assertMeadowSpacing(highStage);
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

function assertMeadowSpacing(entries) {
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const left = entries[leftIndex];
      const right = entries[rightIndex];
      const dx = left.leftPct - right.leftPct;
      const dy = (left.footPct - right.footPct) * 1.45;
      const hasMonster = left.path !== 'none' || right.path !== 'none';
      const minimum = hasMonster ? 30 : 17;
      assert.ok(Math.hypot(dx, dy) >= minimum);
    }
  }
}

test('hero background rotation includes the new Scribe Downs c landscapes', async () => {
  const { REGION_BACKGROUND_URLS } = await import('../src/surfaces/home/data.js');

  for (const index of [1, 2, 3, 4, 5, 6]) {
    assert.ok(
      REGION_BACKGROUND_URLS.includes(`/assets/regions/the-scribe-downs/the-scribe-downs-bg-c${index}.1280.webp`),
    );
  }
});

test('codex entries show fresh creatures as unknown and caught stage-zero creatures as eggs', async () => {
  const { buildCodexEntries } = await import('../src/surfaces/home/data.js');
  const [fresh, egg] = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: true, mastered: 1, stage: 0, level: 0, branch: 'b2' } },
  ]);

  assert.equal(fresh.displayState, 'fresh');
  assert.equal(fresh.placeholder, '?');
  assert.equal(fresh.img, null);
  assert.equal(fresh.name, 'Unknown creature');

  assert.equal(egg.displayState, 'egg');
  assert.equal(egg.stageLabel, 'Egg');
  assert.equal(egg.secureLabel, '1 secure word');
  assert.equal(egg.nextGoal, 'Keep securing words for the next change');
  assert.match(egg.img, /glimmerbug-b2-0\.640\.webp/);
});

test('codex progress copy omits total and remaining counts', async () => {
  const { buildCodexEntries } = await import('../src/surfaces/home/data.js');
  const [fresh, egg] = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: true, mastered: 3, stage: 0, level: 0, branch: 'b1' } },
  ]);

  assert.equal(fresh.secureLabel, 'No secure words yet');
  assert.equal(fresh.nextGoal, 'Secure words to catch this creature');
  assert.equal(egg.name, 'Phaeton');
  assert.equal(egg.stageLabel, 'Egg');
  assert.equal(egg.secureLabel, '3 secure words');
  assert.equal(egg.nextGoal, 'Keep securing words for the next change');
  assert.doesNotMatch(egg.secureLabel, /\//);
  assert.doesNotMatch(egg.nextGoal, /^\d/);
});

test('egg breath styles are stable while offsetting different creatures', async () => {
  const { eggBreatheStyle } = await import('../src/surfaces/home/data.js');
  const inklet = { id: 'inklet', branch: 'b1', stage: 0 };
  const glimmerbug = { id: 'glimmerbug', branch: 'b2', stage: 0 };

  assert.deepEqual(eggBreatheStyle(inklet), eggBreatheStyle(inklet));
  assert.notDeepEqual(eggBreatheStyle(inklet), eggBreatheStyle(glimmerbug));
  assert.match(eggBreatheStyle(inklet)['--egg-breathe-duration'], /^\d+\.\d{2}s$/);
  assert.match(eggBreatheStyle(inklet)['--egg-breathe-delay'], /^-\d+\.\d{2}s$/);
});

test('monster motion styles slow down as codex stages mature', async () => {
  const { monsterMotionStyle } = await import('../src/surfaces/home/data.js');
  const kid = { id: 'inklet', branch: 'b1', stage: 1 };
  const mega = { id: 'phaeton', branch: 'b1', stage: 4 };

  assert.deepEqual(monsterMotionStyle(kid), monsterMotionStyle(kid));
  assert.ok(parseFloat(monsterMotionStyle(kid)['--monster-float-duration']) < 4.2);
  assert.ok(parseFloat(monsterMotionStyle(mega)['--monster-float-duration']) >= 7.6);
  assert.ok(parseFloat(monsterMotionStyle(mega)['--monster-float-scale-a']) > 1.02);
  assert.notEqual(monsterMotionStyle(kid)['--monster-float-pan-a'], monsterMotionStyle(mega)['--monster-float-pan-a']);
});

test('codex hero favours the most powerful caught creature and uses species priority at equal level', async () => {
  const { buildCodexEntries, pickFeaturedCodexEntry } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: true, mastered: 4, stage: 0, level: 0, branch: 'b1' } },
  ]);

  assert.equal(pickFeaturedCodexEntry(entries).id, 'phaeton');
});

test('codex hero uses the highest-priority unknown creature for a fresh profile', async () => {
  const { buildCodexEntries, pickFeaturedCodexEntry } = await import('../src/surfaces/home/data.js');
  const entries = buildCodexEntries([
    { monster: MONSTERS.inklet, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.glimmerbug, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
    { monster: MONSTERS.phaeton, progress: { caught: false, mastered: 0, stage: 0, level: 0, branch: 'b1' } },
  ]);
  const featured = pickFeaturedCodexEntry(entries);

  assert.equal(featured.id, 'phaeton');
  assert.equal(featured.displayState, 'fresh');
  assert.equal(featured.placeholder, '?');
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
