import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canSoftReloadForUpdate,
  createBuildUpdateDetector,
  normaliseVersionPayload,
  versionHasChanged,
} from '../src/platform/react/build-update-detector.js';

function quietDocument(overrides = {}) {
  const body = {};
  return {
    body,
    activeElement: body,
    visibilityState: 'visible',
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    ...overrides,
  };
}

function dashboardState(overrides = {}) {
  return {
    route: { screen: 'dashboard' },
    persistence: { pendingWriteCount: 0, inFlightWriteCount: 0 },
    subjectUi: {},
    ...overrides,
  };
}

test('version payload normalises build hash as the preferred build id', () => {
  assert.deepEqual(normaliseVersionPayload({
    buildHash: ' abc123 ',
    release: 'release-1',
  }), {
    buildHash: 'abc123',
    release: 'release-1',
    buildId: 'abc123',
    source: 'env.BUILD_HASH',
    generatedAt: null,
  });
  assert.equal(versionHasChanged('abc123', { buildHash: 'def456' }), true);
  assert.equal(versionHasChanged('abc123', { buildHash: 'abc123' }), false);
});

test('safe update reload is blocked during subject work, writes, dialogs, and active text entry', () => {
  assert.equal(canSoftReloadForUpdate({ state: dashboardState(), document: quietDocument() }), true);
  assert.equal(canSoftReloadForUpdate({
    state: dashboardState({ route: { screen: 'subject', subjectId: 'spelling' } }),
    document: quietDocument(),
  }), false);
  assert.equal(canSoftReloadForUpdate({
    state: dashboardState({ persistence: { pendingWriteCount: 1, inFlightWriteCount: 0 } }),
    document: quietDocument(),
  }), false);
  assert.equal(canSoftReloadForUpdate({
    state: dashboardState({ subjectUi: { spelling: { pendingCommand: 'submit-answer' } } }),
    document: quietDocument(),
  }), false);
  assert.equal(canSoftReloadForUpdate({
    state: dashboardState(),
    document: quietDocument({ querySelector: () => ({}) }),
  }), false);
  assert.equal(canSoftReloadForUpdate({
    state: dashboardState(),
    document: quietDocument({ activeElement: { tagName: 'INPUT' } }),
  }), false);
});

test('build update detector soft reloads immediately when the route is safe', async () => {
  let reloads = 0;
  const published = [];
  const detector = createBuildUpdateDetector({
    loadedBuildId: 'old123',
    document: quietDocument(),
    location: { reload() { reloads += 1; } },
    getState: () => dashboardState(),
    setSystemUpdate: (snapshot) => published.push(snapshot),
    fetchFn: async () => new Response(JSON.stringify({ buildHash: 'new456' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
    now: () => 1_000,
  });

  assert.equal(await detector.check('test-safe'), 'reloaded');
  assert.equal(reloads, 1);
  assert.equal(published.length, 0);
});

test('build update detector publishes a banner state until the learner returns to a safe route', async () => {
  let reloads = 0;
  const published = [];
  let state = dashboardState({ route: { screen: 'subject', subjectId: 'spelling' } });
  const detector = createBuildUpdateDetector({
    loadedBuildId: 'old123',
    document: quietDocument(),
    location: { reload() { reloads += 1; } },
    getState: () => state,
    setSystemUpdate: (snapshot) => published.push(snapshot),
    fetchFn: async () => new Response(JSON.stringify({ buildHash: 'new456' }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }),
    now: () => 2_000,
  });

  assert.equal(await detector.check('test-subject'), 'ready');
  assert.equal(reloads, 0);
  assert.equal(published[0].status, 'ready');
  assert.equal(published[0].currentBuildId, 'old123');
  assert.equal(published[0].latestBuildId, 'new456');

  state = dashboardState();
  detector.afterRender(state);
  assert.equal(reloads, 1);
});
