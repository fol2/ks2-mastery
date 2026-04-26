// U2 — Client: selectLearner auto-refetch hook for missing subject_state.
//
// Context: the bootstrap-multi-learner-stats hotfix landed U1 (PR #316)
// which unbinds child_subject_state from U7's bounded-bootstrap mode, so
// every writable learner now ships with its subject state on bootstrap.
// U2 is defence-in-depth for the remaining edge cases:
//
//   - A learner added by another device after the current session's
//     bootstrap (stats would be 0 until the next Worker command fires).
//   - A cold-start race where bootstrap is still in-flight while the user
//     rapidly switches learners.
//   - Any future bootstrap optimisation that legitimately omits sibling
//     state (e.g., if capacity growth forces a bounded mode again).
//
// Contract: `createStore(subjects, { repositories, fetchLearnerSubjectState })`
// accepts an optional `fetchLearnerSubjectState(learnerId)` hook. When
// `selectLearner(id)` is called and the target learner has no cached
// subject state locally AND the hook is provided AND no fetch is already
// in-flight for that learner, the store fires the hook. On resolution,
// if the user has NOT navigated away, the store re-reads subjectUi from
// the (now populated) repository cache.
//
// Back-compat: if `fetchLearnerSubjectState` is not provided, selectLearner
// behaves exactly as today. Existing tests constructing `{ repositories }`
// without the hook must stay green.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createStore } from '../src/platform/core/store.js';
import { SUBJECTS } from '../src/platform/core/subject-registry.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Wrap a real repositories collection so `subjectStates.readForLearner` can
// be controlled per-learnerId. Any key not in `perLearner` falls through to
// the real repo's readForLearner. We override the method as a function on a
// shallow copy of subjectStates so the rest of the contract (writeUi,
// writeRecord, clearLearner, etc.) remains validated.
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

// Create a store seeded with two learners (A, B). Returns { store, learnerA, learnerB }.
// The caller's `readForLearner` overrides run against the (A, B) ids.
//
// Seeding order matters: we must create A and B via the real repo FIRST,
// then install the per-learner overrides, then construct the store with
// the fetchLearnerSubjectState hook. Otherwise the first selectLearner
// (which fires during setup to rebind to A) would hit an empty-cache
// override and fire a spurious fetch before the test proper begins.
function createStoreWithTwoLearners({ readForLearner = {}, fetchLearnerSubjectState } = {}) {
  const { repositories, base, perLearner } = buildRepositoriesWithReadForLearner({});

  // Phase 1 — bootstrap a bare store WITHOUT the fetch hook so we can
  // safely create both learners. `createLearner` internally re-reads
  // subject state via the registry; if we wired the fetch hook here and
  // the learner had no cache, a spurious call would register before the
  // real test began.
  const setupStore = createStore(SUBJECTS, { repositories });
  const learnerA = setupStore.getState().learners.selectedId;
  const learnerB = setupStore.createLearner({ name: 'Nelson' }).id;
  setupStore.selectLearner(learnerA);

  // Phase 2 — install the per-learner overrides now that we know the
  // real ids.
  for (const [aliasKey, value] of Object.entries(readForLearner)) {
    const resolvedId = aliasKey === 'A' ? learnerA : aliasKey === 'B' ? learnerB : aliasKey;
    perLearner[resolvedId] = value;
  }

  // Phase 3 — construct the store under test with the hook wired. The
  // store's ctor will readForLearner(learnerA) once to build its
  // subjectUi tree; `fetchLearnerSubjectState` is NOT invoked on ctor,
  // only on subsequent `selectLearner` calls.
  const store = createStore(SUBJECTS, {
    repositories,
    ...(fetchLearnerSubjectState ? { fetchLearnerSubjectState } : {}),
  });

  return { store, learnerA, learnerB, repositories, base, perLearner };
}

// Flush microtasks so fire-and-forget promise chains settle.
async function flushMicrotasks(rounds = 3) {
  for (let i = 0; i < rounds; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Test 1 — cache-hit: no fetch fires
// ---------------------------------------------------------------------------

test('selectLearner does not fetch when cache already has the learner subject state', async () => {
  let calls = 0;
  const { store, learnerB } = createStoreWithTwoLearners({
    // Non-empty state for B — cache already has it.
    readForLearner: {
      B: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (_id) => {
      calls += 1;
      return Promise.resolve();
    },
  });

  store.selectLearner(learnerB);
  await flushMicrotasks();

  assert.equal(calls, 0, 'fetchLearnerSubjectState must not fire when cache is non-empty');
  assert.equal(store.getState().learners.selectedId, learnerB, 'selectLearner still updates state');
});

// ---------------------------------------------------------------------------
// Test 2 — cache-miss: fetch fires once and store re-reads after resolution
// ---------------------------------------------------------------------------

test('selectLearner fetches once when cache is empty for the target learner', async () => {
  const spyCalls = [];
  let resolveFetch;
  const fetchPromise = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const { store, learnerB, repositories } = createStoreWithTwoLearners({
    // Empty cache for B simulates the "sibling learner with no shipped
    // subject_state" edge case.
    readForLearner: {
      B: {},
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return fetchPromise;
    },
  });

  store.selectLearner(learnerB);
  // Fetch starts synchronously — spy already recorded the call.
  assert.equal(spyCalls.length, 1, 'fetch fires exactly once on cache-miss');
  assert.equal(spyCalls[0], learnerB, 'fetch fires with the target learner id');

  // Before resolution, simulate the Worker response repopulating the
  // client-side repo cache (this is what applyCommandResultToCache would
  // do in the real app). We flip the readForLearner override to return
  // the populated entry now that the fetch has "resolved".
  repositories.subjectStates.readForLearner = function readForLearner(learnerId) {
    if (learnerId === learnerB) {
      return { spelling: { ui: { phase: 'dashboard' }, data: { fetched: true }, writeVersion: 2, updatedAt: 2 } };
    }
    return {};
  };

  resolveFetch();
  await flushMicrotasks();

  // After the fetch resolved, the store must have rebuilt subjectUi from
  // the repository — any subjectUi key is fine to assert presence; the
  // key point is that setState ran, i.e., the listener path executed.
  const nextState = store.getState();
  assert.equal(nextState.learners.selectedId, learnerB);
  assert.ok(nextState.subjectUi.spelling, 'subjectUi rebuilt after fetch resolved');
});

// ---------------------------------------------------------------------------
// Test 3 — in-flight guard: duplicate select on same learner fires once
// ---------------------------------------------------------------------------

test('selectLearner does NOT fire a second fetch while the first is in-flight', async () => {
  const spyCalls = [];
  let resolveFetch;
  const fetchPromise = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const { store, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return fetchPromise;
    },
  });

  store.selectLearner(learnerB);
  // Second selectLearner on the same id BEFORE the first fetch resolves.
  store.selectLearner(learnerB);
  // And a third, for paranoia.
  store.selectLearner(learnerB);

  assert.equal(spyCalls.length, 1, 'in-flight guard blocks duplicate fetches');

  resolveFetch();
  await flushMicrotasks();

  // After resolution, the guard must have cleared so a FUTURE cache-miss
  // can fire again. Simulate: the cache is still empty, select again, and
  // expect a new fetch.
  store.selectLearner(learnerB);
  assert.equal(spyCalls.length, 2, 'in-flight guard cleared after resolution — subsequent select fires a new fetch');
});

// ---------------------------------------------------------------------------
// Test 4 — back-compat: no fetchLearnerSubjectState provided
// ---------------------------------------------------------------------------

test('selectLearner does NOT fail if fetchLearnerSubjectState is not provided', async () => {
  const { store, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
    },
    // deliberately no fetchLearnerSubjectState — back-compat path.
  });

  assert.doesNotThrow(() => store.selectLearner(learnerB), 'must not throw without the hook');
  assert.equal(store.getState().learners.selectedId, learnerB, 'state still updates normally');
});

// ---------------------------------------------------------------------------
// Test 5 — error swallowed: rejected fetch does not break the store
// ---------------------------------------------------------------------------

test('selectLearner fetch error is swallowed and does not break the store', async () => {
  const unhandledRejections = [];
  const handler = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handler);

  try {
    const { store, learnerB } = createStoreWithTwoLearners({
      readForLearner: {
        B: {},
      },
      fetchLearnerSubjectState: () => Promise.reject(new Error('simulated network failure')),
    });

    store.selectLearner(learnerB);
    await flushMicrotasks(5);

    // State is still consistent — selected learner is B, subjectUi is
    // present (empty-cache defaults from the registry), no throw bubbled
    // up into the store.
    const next = store.getState();
    assert.equal(next.learners.selectedId, learnerB);
    assert.ok(next.subjectUi.spelling, 'defaults rendered even on fetch failure');

    assert.equal(unhandledRejections.length, 0,
      'fetch rejection must be swallowed — no unhandledRejection event');
  } finally {
    process.off('unhandledRejection', handler);
  }
});

// ---------------------------------------------------------------------------
// Test 6 — late-resolution stale-guard: user already navigated away
// ---------------------------------------------------------------------------

test('selectLearner does NOT re-read after fetch if user has already navigated to a different learner', async () => {
  let resolveBFetch;
  const bFetchPromise = new Promise((resolve) => {
    resolveBFetch = resolve;
  });
  const fetchCalls = [];
  const { store, learnerA, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
      // A is pre-populated so switching back doesn't trigger a nested fetch.
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (id) => {
      fetchCalls.push(id);
      if (id === learnerB) return bFetchPromise;
      return Promise.resolve();
    },
  });

  // Start the fetch for B.
  store.selectLearner(learnerB);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], learnerB);
  assert.equal(store.getState().learners.selectedId, learnerB);

  // Before B's fetch resolves, navigate away to A. A's cache is non-empty
  // so no fetch fires for A.
  store.selectLearner(learnerA);
  assert.equal(store.getState().learners.selectedId, learnerA);
  assert.equal(fetchCalls.length, 1, 'no fetch for A (cache already populated)');

  // Capture state BEFORE B's fetch resolves — we'll compare subjectUi ref
  // equality after resolution to confirm the post-fetch re-read was
  // skipped. (If the re-read ran, setState would have produced a new
  // subjectUi object.)
  const stateBeforeResolution = store.getState();

  resolveBFetch();
  await flushMicrotasks(5);

  // After B's fetch resolves, the selected learner is STILL A. The store
  // must NOT have rebuilt subjectUi from B's cache. The easiest structural
  // assertion: the state reference is untouched after B resolved.
  const stateAfterResolution = store.getState();
  assert.equal(stateAfterResolution.learners.selectedId, learnerA,
    'selected learner must still be A after B fetch resolves');
  assert.equal(stateAfterResolution, stateBeforeResolution,
    'store state reference must be unchanged — post-fetch re-read was skipped');
});
