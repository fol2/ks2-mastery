// P4/U7 — Breaker reset and sticky learner-fetch recovery.
//
// When the `bootstrapCapacityMetadata` breaker (cooldownMaxMs: Infinity)
// trips open, sibling learner stat fetches may fail and get recorded in
// the store's sticky `attemptedLearnerFetches` Set. After operator reset
// (or natural recovery), `clearStaleFetchGuards()` fires via the
// composition root's `breakerResetListeners` hook, allowing the next
// `selectLearner` to retry those learners.
//
// These tests cover:
//   T1: breaker open -> sticky guard blocks -> reset -> clearStaleFetchGuards -> refetch
//   T2: 4-learner account with transient sibling fetch failure -> recovery
//   T3: clearStaleFetchGuards when Set is empty -> no-op
//   T4: existing infinite-refetch guard still passes (via store-select-learner-refetch.test.js)

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRepositoriesWithReadForLearner(perLearner) {
  const storage = installMemoryStorage();
  const base = createLocalPlatformRepositories({ storage });
  const proxy = {
    ...base,
    subjectStates: {
      ...base.subjectStates,
      readForLearner(learnerId) {
        if (Object.prototype.hasOwnProperty.call(perLearner, learnerId)) {
          return perLearner[learnerId];
        }
        return base.subjectStates.readForLearner.call(base.subjectStates, learnerId);
      },
    },
  };
  return { repositories: proxy, base, perLearner };
}

function createStoreWithTwoLearners({ readForLearner = {}, fetchLearnerSubjectState } = {}) {
  const { repositories, base, perLearner } = buildRepositoriesWithReadForLearner({});

  const setupStore = createStore(SUBJECTS, { repositories });
  const learnerA = setupStore.getState().learners.selectedId;
  const learnerB = setupStore.createLearner({ name: 'Nelson' }).id;
  setupStore.selectLearner(learnerA);

  for (const [aliasKey, value] of Object.entries(readForLearner)) {
    const resolvedId = aliasKey === 'A' ? learnerA : aliasKey === 'B' ? learnerB : aliasKey;
    perLearner[resolvedId] = value;
  }

  const store = createStore(SUBJECTS, {
    repositories,
    ...(fetchLearnerSubjectState ? { fetchLearnerSubjectState } : {}),
  });

  return { store, learnerA, learnerB, repositories, base, perLearner };
}

function createStoreWithFourLearners({ readForLearner = {}, fetchLearnerSubjectState } = {}) {
  const { repositories, base, perLearner } = buildRepositoriesWithReadForLearner({});

  const setupStore = createStore(SUBJECTS, { repositories });
  const learnerA = setupStore.getState().learners.selectedId;
  const learnerB = setupStore.createLearner({ name: 'Nelson' }).id;
  const learnerC = setupStore.createLearner({ name: 'Mei' }).id;
  const learnerD = setupStore.createLearner({ name: 'Suki' }).id;
  setupStore.selectLearner(learnerA);

  for (const [aliasKey, value] of Object.entries(readForLearner)) {
    const resolvedId = aliasKey === 'A' ? learnerA
      : aliasKey === 'B' ? learnerB
        : aliasKey === 'C' ? learnerC
          : aliasKey === 'D' ? learnerD
            : aliasKey;
    perLearner[resolvedId] = value;
  }

  const store = createStore(SUBJECTS, {
    repositories,
    ...(fetchLearnerSubjectState ? { fetchLearnerSubjectState } : {}),
  });

  return { store, learnerA, learnerB, learnerC, learnerD, repositories, base, perLearner };
}

async function flushMicrotasks(rounds = 5) {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// T1: breaker open -> sticky guard blocks -> reset -> clearStaleFetchGuards -> refetch
// ---------------------------------------------------------------------------

test('breaker open -> attemptedLearnerFetches blocks -> operator reset -> clearStaleFetchGuards -> refetch succeeds', async () => {
  const spyCalls = [];
  const { store, learnerA, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      // Simulate a failure during breaker-open window.
      if (spyCalls.length === 1) {
        return Promise.reject(new Error('breaker open — fetch blocked'));
      }
      // After reset, the fetch succeeds.
      return Promise.resolve();
    },
  });

  // 1. Select B — fetch fires and fails (simulating breaker-open window).
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 1, 'first fetch fires for B');

  // 2. The sticky guard now holds B. Switching back and re-selecting B
  //    does NOT fire a second fetch (the R2 invariant).
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1, 'sticky guard blocks refetch for B');

  // 3. Operator resets the breaker -> clearStaleFetchGuards fires.
  store.clearStaleFetchGuards();

  // 4. Now selecting B again fires a fresh fetch.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 2, 'after clearStaleFetchGuards, refetch succeeds for B');
  assert.equal(spyCalls[1], learnerB, 'second fetch is for B');
});

// ---------------------------------------------------------------------------
// T2: 4-learner account with transient sibling fetch failure -> recovery
// ---------------------------------------------------------------------------

test('4-learner account: transient sibling fetch failure recovers after clearStaleFetchGuards', async () => {
  const spyCalls = [];
  let failFetches = true;
  const { store, learnerA, learnerB, learnerC, learnerD } = createStoreWithFourLearners({
    readForLearner: {
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
      B: {},
      C: {},
      D: {},
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      if (failFetches) {
        return Promise.reject(new Error('transient failure'));
      }
      return Promise.resolve();
    },
  });

  // 1. Select B, C, D in sequence — all fail during the outage.
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  store.selectLearner(learnerC);
  await flushMicrotasks(10);
  store.selectLearner(learnerD);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 3, 'three fetches fired (B, C, D)');

  // 2. All three are now sticky-guarded. Switching back does not refetch.
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  store.selectLearner(learnerC);
  await flushMicrotasks(5);
  store.selectLearner(learnerD);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 3, 'sticky guard blocks all three during outage');

  // 3. Server recovers. Clear the fetch guards.
  failFetches = false;
  store.clearStaleFetchGuards();

  // 4. Now all three can be retried.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 4, 'B refetched after recovery');

  store.selectLearner(learnerC);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 5, 'C refetched after recovery');

  store.selectLearner(learnerD);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 6, 'D refetched after recovery');
});

// ---------------------------------------------------------------------------
// T3: clearStaleFetchGuards when Set is empty -> no-op
// ---------------------------------------------------------------------------

test('clearStaleFetchGuards is a no-op when no learner fetches have been attempted', () => {
  const storage = installMemoryStorage();
  const repositories = createLocalPlatformRepositories({ storage });
  const store = createStore(SUBJECTS, { repositories });

  // No selectLearner calls — the attemptedLearnerFetches Set is empty.
  // clearStaleFetchGuards must not throw.
  assert.doesNotThrow(() => store.clearStaleFetchGuards(),
    'clearStaleFetchGuards on empty Set must not throw');
});

// ---------------------------------------------------------------------------
// T4: clearStaleFetchGuards does NOT break the infinite-refetch guard
// ---------------------------------------------------------------------------
//
// After clearStaleFetchGuards, the R2 contract still holds for NEW
// attempts: a learner whose fetch fails AFTER the clear is still
// sticky-guarded until the next clear. This test pins that the clear
// is a one-shot reset, not a permanent disable.

test('clearStaleFetchGuards resets the guard but new attempts re-arm it (R2 contract preserved)', async () => {
  const spyCalls = [];
  const { store, learnerA, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      // Always resolve with no side-effect (cache stays empty).
      return Promise.resolve();
    },
  });

  // 1. First attempt for B.
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 1, 'first fetch fires');

  // 2. Clear the guard.
  store.clearStaleFetchGuards();

  // 3. Second attempt fires (guard was cleared).
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 2, 'second fetch fires after clear');

  // 4. Without another clear, the R2 infinite-refetch guard re-arms.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 2, 'R2 guard re-armed — no third fetch without another clear');
});

// ---------------------------------------------------------------------------
// T5: registerBreakerResetHook wires clearStaleFetchGuards automatically
// ---------------------------------------------------------------------------
//
// Verify that when the repositories expose `registerBreakerResetHook`,
// the store auto-registers and the hook fires clearStaleFetchGuards.

test('store auto-registers with registerBreakerResetHook when available', async () => {
  const registeredListeners = new Set();

  // Phase 1: build repos with a mock registerBreakerResetHook.
  const { repositories: baseRepos, perLearner } = buildRepositoriesWithReadForLearner({});
  const repositories = {
    ...baseRepos,
    persistence: {
      ...baseRepos.persistence,
      registerBreakerResetHook(listener) {
        registeredListeners.add(listener);
        return () => registeredListeners.delete(listener);
      },
    },
  };

  // Phase 2: seed two learners WITHOUT the fetch hook (same pattern
  // as createStoreWithTwoLearners).
  const setupStore = createStore(SUBJECTS, { repositories });
  const learnerA = setupStore.getState().learners.selectedId;
  const learnerB = setupStore.createLearner({ name: 'Test' }).id;
  setupStore.selectLearner(learnerA);

  // Install per-learner overrides now that ids are known.
  perLearner[learnerA] = { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } };
  perLearner[learnerB] = {};

  // Phase 3: construct the store under test with the fetch hook wired.
  const spyCalls = [];
  const store = createStore(SUBJECTS, {
    repositories,
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return Promise.resolve();
    },
  });

  // The store must have registered exactly one listener.
  assert.equal(registeredListeners.size, 2,
    'both setup and test stores registered a listener (2 createStore calls)');

  // Select B — triggers fetch, records in attemptedLearnerFetches.
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 1, 'first fetch fired for B');

  // Sticky guard blocks refetch.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1, 'sticky guard active');

  // Fire the registered listeners (simulating breaker reset in api.js).
  for (const listener of registeredListeners) {
    listener({ breakerName: 'bootstrapCapacityMetadata' });
  }

  // Now the guard is cleared — refetch fires.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  store.selectLearner(learnerB);
  await flushMicrotasks(10);
  assert.equal(spyCalls.length, 2, 'refetch fires after hook-triggered clear');
});
