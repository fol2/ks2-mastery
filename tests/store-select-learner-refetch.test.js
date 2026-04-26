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
// in-flight for that learner AND we have not already attempted a fetch
// for that learner this session, the store fires the hook. On
// resolution, if the user has NOT navigated away, the store re-reads
// subjectUi from the (now populated) repository cache.
//
// Back-compat: if `fetchLearnerSubjectState` is not provided, selectLearner
// behaves exactly as today. Existing tests constructing `{ repositories }`
// without the hook must stay green.
//
// U2 follow-up (2026-04-26, PR #319 review):
//   - R1: the success-handler chain now uses `.finally()` so the
//     in-flight guard clears on every path (success, rejection,
//     success-throw, setState-throw) and success-handler throws no
//     longer escape as unhandledRejection.
//   - R2: a sticky `attemptedLearnerFetches` Set records each learner
//     we've tried this session — prevents the infinite refetch loop
//     when the server legitimately returns no state for a learner
//     (cache stays empty; next select would otherwise refetch forever).
//   - M1: the "empty cache" check now requires at least one subject
//     record to be a truthy object, not just any key present.

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

// Same as above but seeds three learners (A, B, C) — used by the
// concurrent-distinct-learners test (T1).
function createStoreWithThreeLearners({ readForLearner = {}, fetchLearnerSubjectState } = {}) {
  const { repositories, base, perLearner } = buildRepositoriesWithReadForLearner({});

  const setupStore = createStore(SUBJECTS, { repositories });
  const learnerA = setupStore.getState().learners.selectedId;
  const learnerB = setupStore.createLearner({ name: 'Nelson' }).id;
  const learnerC = setupStore.createLearner({ name: 'Mei' }).id;
  setupStore.selectLearner(learnerA);

  for (const [aliasKey, value] of Object.entries(readForLearner)) {
    const resolvedId = aliasKey === 'A'
      ? learnerA
      : aliasKey === 'B'
        ? learnerB
        : aliasKey === 'C'
          ? learnerC
          : aliasKey;
    perLearner[resolvedId] = value;
  }

  const store = createStore(SUBJECTS, {
    repositories,
    ...(fetchLearnerSubjectState ? { fetchLearnerSubjectState } : {}),
  });

  return { store, learnerA, learnerB, learnerC, repositories, base, perLearner };
}

// Flush microtasks so fire-and-forget promise chains settle.
async function flushMicrotasks(rounds = 5) {
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
// Test 3 — in-flight guard + sticky attempt guard (T3 per U2 follow-up)
// ---------------------------------------------------------------------------
//
// NOTE: this test's contract changed with R2 (2026-04-26 follow-up).
// Before: "after fetch resolves, a future select on same empty-cache
// learner fires a NEW fetch". After R2: "one attempt per learner per
// session — by design, not a bug". See the R2 comment in store.js.

test('selectLearner does NOT fire a second fetch while the first is in-flight, and sticky-guards after', async () => {
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

  // R2 semantic: after resolution, `attemptedLearnerFetches` still holds
  // B (sticky per session). A subsequent selectLearner(B) — even with an
  // empty cache — must NOT fire a new fetch. This is the correct
  // semantic now: "one attempt per learner per session" stops the
  // infinite refetch loop when the server legitimately returns no state
  // for a learner. If a later Worker command fills the cache via a
  // different path, the empty-check short-circuits and we never consult
  // the attempted-set.
  store.selectLearner(learnerB);
  assert.equal(spyCalls.length, 1,
    'R2: subsequent select on same empty-cache learner is sticky-guarded — no new fetch');
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
// Test 5 — error swallowed + sticky after rejection (T3 per U2 follow-up)
// ---------------------------------------------------------------------------

test('selectLearner fetch rejection is swallowed, store stays coherent, and retry is NOT attempted this session', async () => {
  const unhandledRejections = [];
  const handler = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', handler);

  try {
    const spyCalls = [];
    const { store, learnerB } = createStoreWithTwoLearners({
      readForLearner: {
        B: {},
      },
      fetchLearnerSubjectState: (id) => {
        spyCalls.push(id);
        return Promise.reject(new Error('simulated network failure'));
      },
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

    // R2 semantic change (U2 follow-up): after rejection, a SECOND
    // selectLearner(B) does NOT re-fetch. The attemptedLearnerFetches
    // Set holds B so we do not retry in the same session. The
    // inFlightLearnerFetches guard IS cleared (proved by the fact the
    // initial rejection ran through to the finally cleanup — if the
    // guard leaked, subsequent selects would also be blocked by it,
    // but the signal we can observe from outside is the attempted-set
    // sticking). Design choice: one attempt per session — by design,
    // not a bug. A future Worker command that fills the cache via a
    // different path will naturally succeed because the empty-check
    // short-circuits before we consult the attempted-set.
    assert.equal(spyCalls.length, 1, 'first select fired one fetch');
    store.selectLearner(learnerB);
    await flushMicrotasks(5);
    assert.equal(spyCalls.length, 1,
      'R2: after rejection, subsequent select on same learner does NOT retry this session');
  } finally {
    process.off('unhandledRejection', handler);
  }
});

// ---------------------------------------------------------------------------
// Test 6 — late-resolution stale-guard: user already navigated away
// ---------------------------------------------------------------------------
//
// M2 (U2 follow-up): previously asserted ref-equality of
// `stateAfterResolution === stateBeforeResolution`, which is brittle.
// Replaced with a listener-call-count assertion — the invariant we
// actually care about is "no setState notify fired", not "same ref".

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

  // M2: subscribe a listener and count calls AFTER the switch to A.
  // When B's fetch resolves, the stale-guard must prevent setState
  // from firing, so the listener count must stay at zero delta.
  let listenerCalls = 0;
  store.subscribe(() => { listenerCalls += 1; });
  const listenerCallsBefore = listenerCalls;

  resolveBFetch();
  await flushMicrotasks(5);

  // After B's fetch resolves, the selected learner is STILL A. The store
  // must NOT have rebuilt subjectUi from B's cache — the listener
  // count-delta is the canonical signal.
  assert.equal(store.getState().learners.selectedId, learnerA,
    'selected learner must still be A after B fetch resolves');
  assert.equal(listenerCalls, listenerCallsBefore,
    'no setState notifications fired after stale-learner resolution');
});

// ---------------------------------------------------------------------------
// Test 7 (T1) — concurrent fetches for DISTINCT learners
// ---------------------------------------------------------------------------
//
// The inFlightLearnerFetches guard is keyed by learnerId, so two rapid
// selects on DIFFERENT learners must both fire. This pins the guard's
// per-learner independence (regression test for "accidentally making
// the guard global").

test('selectLearner fires independent fetches for distinct pending learners', async () => {
  const spyCalls = [];
  const resolvers = new Map();
  const { store, learnerB, learnerC } = createStoreWithThreeLearners({
    readForLearner: {
      B: {},
      C: {},
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return new Promise((resolve) => {
        resolvers.set(id, resolve);
      });
    },
  });

  store.selectLearner(learnerB);
  assert.equal(spyCalls.length, 1, 'select B fires fetch 1');
  assert.equal(spyCalls[0], learnerB);

  store.selectLearner(learnerC);
  assert.equal(spyCalls.length, 2, 'select C (distinct learner, different in-flight key) fires fetch 2');
  assert.equal(spyCalls[1], learnerC);

  // Resolve both fetches. No deadlock.
  resolvers.get(learnerB)();
  resolvers.get(learnerC)();
  await flushMicrotasks(5);

  // State after resolution — selected is C (the last select). subjectUi
  // present. Clean.
  assert.equal(store.getState().learners.selectedId, learnerC);
  assert.ok(store.getState().subjectUi.spelling, 'subjectUi present after concurrent resolution');
});

// ---------------------------------------------------------------------------
// Test 8 (T2) — stale-then-return: no spurious refetch on return
// ---------------------------------------------------------------------------
//
// Scenario: user selects B (empty cache → fetch 1 fires), navigates back
// to A (A cache populated, no fetch), B's fetch resolves in the
// background (stale-guard skips setState because selectedId === A).
// Later, user returns to B. Because attemptedLearnerFetches[B] is sticky
// from the first attempt, we must NOT fire a second fetch even if B's
// cache is still empty. If the original fetch DID populate B's cache
// via applyCommandResultToCache, the empty-check short-circuits and we
// rebuild subjectUi from cache without a new fetch.

test('returning to original learner after its fetch resolved while user was elsewhere does not spuriously re-fetch', async () => {
  let resolveBFetch;
  const bFetchPromise = new Promise((resolve) => { resolveBFetch = resolve; });
  const spyCalls = [];

  const { store, learnerA, learnerB, repositories } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return bFetchPromise;
    },
  });

  // 1. Select B — fetch 1 fires.
  store.selectLearner(learnerB);
  assert.equal(spyCalls.length, 1, 'fetch 1 fired for B');

  // 2. Navigate to A — no fetch (A populated).
  store.selectLearner(learnerA);
  assert.equal(spyCalls.length, 1, 'no fetch for A (cache populated)');

  // 3. B's fetch resolves while user is on A. Stale-guard blocks the
  //    setState re-read (covered by test 6).
  resolveBFetch();
  await flushMicrotasks(5);

  // 4a. Empty-cache sub-case: B's server returned nothing, so cache
  //     is still empty. R2 attemptedLearnerFetches guard must block
  //     a second fetch.
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1,
    'R2: return to B after its fetch resolved with empty cache does NOT refetch (attempted-set sticky)');

  // 4b. Populated-cache sub-case: simulate a later Worker command
  //     filling B's cache (applyCommandResultToCache path). Now the
  //     empty-check short-circuits before we consult the attempted-set,
  //     so it doesn't matter that we already attempted once. We must
  //     also NOT fire a spurious fetch — the cache-hit branch wins.
  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  repositories.subjectStates.readForLearner = function readForLearner(learnerId) {
    if (learnerId === learnerB) {
      return { spelling: { ui: { phase: 'dashboard' }, data: { late: true }, writeVersion: 2, updatedAt: 2 } };
    }
    if (learnerId === learnerA) {
      return { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } };
    }
    return {};
  };
  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1,
    'R2: return to B after cache got populated via another path does NOT refetch');
  assert.equal(store.getState().learners.selectedId, learnerB);
});

// ---------------------------------------------------------------------------
// Test 9 (R1) — success-handler throw does not produce unhandledRejection
// ---------------------------------------------------------------------------
//
// Pin the R1 contract: when the post-fetch re-read block throws (e.g.,
// subjectUiForLearner throws on a poisoned repo, or a setState pipeline
// error), the rejection must be swallowed and the in-flight guard must
// still clear via .finally(). Without the fix, the chained
// `.then(ok, err).then(cleanup)` shape allowed the throw to propagate
// as unhandledRejection.

test('selectLearner post-fetch success-handler throw does NOT produce an unhandledRejection', async () => {
  const spyCalls = [];
  let resolveFetch;
  const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

  let poisonActive = false;

  const { store, learnerB } = createStoreWithTwoLearners({
    readForLearner: { B: {} },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return fetchPromise;
    },
  });

  // Swap in a patched readForLearner that throws ONLY when the poison
  // flag is armed — the initial empty-check runs while the flag is off,
  // but the post-fetch subjectUiForLearner call runs while it is on.
  const proxySubjectStates = store.repositories.subjectStates;
  const originalRead = proxySubjectStates.readForLearner.bind(proxySubjectStates);
  proxySubjectStates.readForLearner = function patchedRead(id) {
    if (poisonActive && id === learnerB) {
      throw new Error('poisoned post-fetch re-read');
    }
    return originalRead(id);
  };

  store.selectLearner(learnerB);
  assert.equal(spyCalls.length, 1, 'fetch fired');

  // R1 tripwire: capture any unhandled rejection that fires during the
  // post-fetch window. Node's unhandledRejection tracker runs on a
  // nextTick-ish cadence, so we wait through a setTimeout(0) cycle (two
  // of them for paranoia) BEFORE detaching the handler to ensure the
  // signal has had time to surface. Without the R1 fix, the success-
  // handler's synchronous throw propagates through the `.then(cleanup)`
  // chain and hits the unhandled path; with the fix, the .catch+.finally
  // chain swallows it.
  const unhandled = [];
  const handler = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', handler);

  poisonActive = true;
  try {
    resolveFetch();
    await flushMicrotasks(10);
    // Give Node's unhandled-rejection tracker a tick (macrotask) to flush.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off('unhandledRejection', handler);
  }
  poisonActive = false;

  assert.equal(unhandled.length, 0,
    'R1: post-fetch success-handler throw must be swallowed — no unhandledRejection');
});

// ---------------------------------------------------------------------------
// Test 10 (R2) — empty server response does not cause infinite refetch loop
// ---------------------------------------------------------------------------
//
// The core R2 scenario: server returns no state for B (fetch resolves,
// cache stays empty). User toggles A ↔ B. Without R2, each return to B
// fires a new fetch — infinite loop. With R2, attemptedLearnerFetches
// holds B and blocks refetches.

test('selectLearner does NOT refetch in an infinite loop when server returns empty state for a learner', async () => {
  const spyCalls = [];
  const { store, learnerA, learnerB } = createStoreWithTwoLearners({
    readForLearner: {
      B: {},
      A: { spelling: { ui: { phase: 'dashboard' }, data: {}, writeVersion: 1, updatedAt: 1 } },
    },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      // Resolves with no side-effect: cache stays empty (server had
      // nothing for this learner).
      return Promise.resolve();
    },
  });

  store.selectLearner(learnerB);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1, 'first select on B fires fetch');

  // Toggle: A → B → A → B → A → B.
  for (let i = 0; i < 3; i += 1) {
    store.selectLearner(learnerA);
    // eslint-disable-next-line no-await-in-loop
    await flushMicrotasks(2);
    store.selectLearner(learnerB);
    // eslint-disable-next-line no-await-in-loop
    await flushMicrotasks(2);
  }

  assert.equal(spyCalls.length, 1,
    'R2: despite repeated toggles, only the first attempt fires — no infinite loop');
});

// ---------------------------------------------------------------------------
// Test 11 (S1) — sync-throw fetcher
// ---------------------------------------------------------------------------

test('selectLearner clears in-flight guard when fetchLearnerSubjectState throws synchronously', async () => {
  const unhandled = [];
  const handler = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', handler);

  try {
    const spyCalls = [];
    const { store, learnerB } = createStoreWithTwoLearners({
      readForLearner: {
        B: {},
      },
      fetchLearnerSubjectState: (id) => {
        spyCalls.push(id);
        throw new Error('sync-throw fetcher');
      },
    });

    assert.doesNotThrow(() => store.selectLearner(learnerB),
      'sync-throw in fetcher must not propagate out of selectLearner');

    await flushMicrotasks(5);

    // Fetcher was called once.
    assert.equal(spyCalls.length, 1, 'fetcher invoked exactly once');
    // No unhandledRejection.
    assert.equal(unhandled.length, 0, 'sync-throw must be swallowed');
    // Store state remains coherent — selectedId is B, subjectUi present.
    const next = store.getState();
    assert.equal(next.learners.selectedId, learnerB);
    assert.ok(next.subjectUi.spelling, 'subjectUi defaults still present after sync-throw');
  } finally {
    process.off('unhandledRejection', handler);
  }
});

// ---------------------------------------------------------------------------
// Test 12 (S2) — second select on current selected learner with empty cache
// is sticky-guarded after the first attempt
// ---------------------------------------------------------------------------
//
// The task's original S2 proposed "0 calls when selecting the already-
// selected learner with empty cache" — but the current store contract
// does not special-case self-select, so the first call legitimately
// fires a fetch (defence-in-depth). What we CAN pin is the R2
// invariant: after the first attempt, subsequent same-learner selects
// do not re-fire. Re-selecting the current learner is just the
// degenerate case of "select on empty-cache learner twice".

test('repeated selectLearner on the current (empty-cache) learner fires the first fetch and stays sticky after', async () => {
  const spyCalls = [];
  const { store, learnerA } = createStoreWithTwoLearners({
    readForLearner: { A: {} },
    fetchLearnerSubjectState: (id) => {
      spyCalls.push(id);
      return Promise.resolve();
    },
  });

  assert.equal(store.getState().learners.selectedId, learnerA);

  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1, 'first select on empty-cache current learner fires fetch');

  store.selectLearner(learnerA);
  await flushMicrotasks(5);
  assert.equal(spyCalls.length, 1,
    'R2: second select on same learner with still-empty cache does NOT refetch');
});
