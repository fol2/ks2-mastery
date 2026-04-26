import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createStore, VALID_ADMIN_SECTIONS } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';

function makeStore() {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  return createStore(SUBJECTS, { repositories });
}

// ---------------------------------------------------------------------------
// VALID_ADMIN_SECTIONS export
// ---------------------------------------------------------------------------
test('VALID_ADMIN_SECTIONS is exported and contains expected sections', () => {
  assert.ok(VALID_ADMIN_SECTIONS instanceof Set);
  assert.ok(VALID_ADMIN_SECTIONS.has('overview'));
  assert.ok(VALID_ADMIN_SECTIONS.has('accounts'));
  assert.ok(VALID_ADMIN_SECTIONS.has('debug'));
  assert.ok(VALID_ADMIN_SECTIONS.has('content'));
  assert.ok(VALID_ADMIN_SECTIONS.has('marketing'));
  assert.equal(VALID_ADMIN_SECTIONS.size, 5);
});

// ---------------------------------------------------------------------------
// normaliseRoute via store.openAdminHub — valid section
// ---------------------------------------------------------------------------
test('openAdminHub({ adminSection: "debug" }) sets correct route', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'debug' });
  const route = store.getState().route;
  assert.equal(route.screen, 'admin-hub');
  assert.equal(route.adminSection, 'debug');
  assert.equal(route.subjectId, null);
});

// ---------------------------------------------------------------------------
// normaliseRoute — invalid section falls back to 'overview'
// ---------------------------------------------------------------------------
test('openAdminHub({ adminSection: "nonexistent" }) falls back to overview', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'nonexistent' });
  const route = store.getState().route;
  assert.equal(route.screen, 'admin-hub');
  assert.equal(route.adminSection, 'overview');
});

// ---------------------------------------------------------------------------
// normaliseRoute — no section specified defaults adminSection to null
// ---------------------------------------------------------------------------
test('openAdminHub() with no section defaults adminSection to null', () => {
  const store = makeStore();
  store.openAdminHub();
  const route = store.getState().route;
  assert.equal(route.screen, 'admin-hub');
  assert.equal(route.adminSection, null);
});

// ---------------------------------------------------------------------------
// Each valid section is accepted
// ---------------------------------------------------------------------------
test('every valid admin section is accepted by openAdminHub', () => {
  const store = makeStore();
  for (const section of VALID_ADMIN_SECTIONS) {
    store.openAdminHub({ adminSection: section });
    const route = store.getState().route;
    assert.equal(route.screen, 'admin-hub');
    assert.equal(route.adminSection, section, `section "${section}" was not preserved`);
  }
});

// ---------------------------------------------------------------------------
// adminSection survives sanitiseState via setState (selectLearner path)
// ---------------------------------------------------------------------------
test('adminSection survives selectLearner state update cycle', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'accounts' });
  // Create a second learner and switch to them
  const learner2 = store.createLearner({ name: 'Learner 2' });
  // Re-open admin with section before switching
  store.openAdminHub({ adminSection: 'accounts' });
  store.selectLearner(learner2.id);
  // selectLearner runs sanitiseState — adminSection should survive
  const route = store.getState().route;
  assert.equal(route.screen, 'admin-hub');
  assert.equal(route.adminSection, 'accounts');
});

// ---------------------------------------------------------------------------
// adminSection survives reloadFromRepositories with preserveRoute
// ---------------------------------------------------------------------------
test('adminSection survives reloadFromRepositories({ preserveRoute: true })', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'debug' });
  store.reloadFromRepositories({ preserveRoute: true });
  const route = store.getState().route;
  assert.equal(route.screen, 'admin-hub');
  assert.equal(route.adminSection, 'debug');
});

// ---------------------------------------------------------------------------
// adminSection resets on reloadFromRepositories without preserveRoute
// ---------------------------------------------------------------------------
test('adminSection resets on reloadFromRepositories without preserveRoute', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'debug' });
  store.reloadFromRepositories();
  const route = store.getState().route;
  // reloadFromRepositories resets route to DEFAULT_ROUTE (dashboard)
  assert.equal(route.screen, 'dashboard');
  assert.equal(route.adminSection, null);
});

// ---------------------------------------------------------------------------
// Other screens always have adminSection: null
// ---------------------------------------------------------------------------
test('non-admin screens carry adminSection: null', () => {
  const store = makeStore();
  store.openAdminHub({ adminSection: 'debug' });
  assert.equal(store.getState().route.adminSection, 'debug');

  store.goHome();
  assert.equal(store.getState().route.adminSection, null);

  store.openSubject('spelling');
  assert.equal(store.getState().route.adminSection, null);

  store.openCodex();
  assert.equal(store.getState().route.adminSection, null);

  store.openParentHub();
  assert.equal(store.getState().route.adminSection, null);

  store.openProfileSettings();
  assert.equal(store.getState().route.adminSection, null);
});

// ---------------------------------------------------------------------------
// parseAdminSectionFromHash — inline unit tests
// These test the hash parsing logic that lives in main.js. Since main.js
// cannot be imported directly (it has browser-side effects), we replicate
// the pure parsing function here to validate the algorithm.
// ---------------------------------------------------------------------------
function parseAdminSectionFromHash(hash) {
  if (!hash || typeof hash !== 'string') return null;
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  const match = raw.match(/(?:^|&)section=([^&]*)/);
  if (!match) return null;
  const value = decodeURIComponent(match[1]).toLowerCase();
  if (!value) return null;
  return VALID_ADMIN_SECTIONS.has(value) ? value : 'overview';
}

test('parseAdminSectionFromHash: #section=debug returns "debug"', () => {
  assert.equal(parseAdminSectionFromHash('#section=debug'), 'debug');
});

test('parseAdminSectionFromHash: #section=accounts returns "accounts"', () => {
  assert.equal(parseAdminSectionFromHash('#section=accounts'), 'accounts');
});

test('parseAdminSectionFromHash: #section=invalid falls back to "overview"', () => {
  assert.equal(parseAdminSectionFromHash('#section=invalid'), 'overview');
});

test('parseAdminSectionFromHash: empty hash returns null', () => {
  assert.equal(parseAdminSectionFromHash(''), null);
  assert.equal(parseAdminSectionFromHash('#'), null);
});

test('parseAdminSectionFromHash: hash without section key returns null', () => {
  assert.equal(parseAdminSectionFromHash('#foo=bar'), null);
});

test('parseAdminSectionFromHash: case-insensitive — #section=DEBUG returns "debug"', () => {
  assert.equal(parseAdminSectionFromHash('#section=DEBUG'), 'debug');
});

test('parseAdminSectionFromHash: section with other params — #theme=dark&section=content', () => {
  assert.equal(parseAdminSectionFromHash('#theme=dark&section=content'), 'content');
});

test('parseAdminSectionFromHash: encoded section value', () => {
  assert.equal(parseAdminSectionFromHash('#section=d%65bug'), 'debug');
});

test('parseAdminSectionFromHash: #section= (empty value) returns null', () => {
  assert.equal(parseAdminSectionFromHash('#section='), null);
});

test('parseAdminSectionFromHash: null/undefined input returns null', () => {
  assert.equal(parseAdminSectionFromHash(null), null);
  assert.equal(parseAdminSectionFromHash(undefined), null);
});
