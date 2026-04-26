// U8 (capacity release gates + telemetry): unit-level oracle for the
// multi-tab bootstrap coordination counters that the Playwright scene
// (`tests/playwright/bootstrap-multi-tab.playwright.test.mjs`) asserts in
// a real Chromium context.
//
// Three invariants the browser scene cannot observe cheaply:
//
//   1. Counter object is installed on `globalThis.__ks2_capacityMeta__`
//      in dev/test builds (the repository factory surfaces it) and is
//      shaped `{ bootstrapLeaderAcquired: 0, ... , reset() }`.
//   2. Each coordination event increments the matching counter exactly
//      once. The Playwright scene can assert per-tab totals; only a
//      node oracle can assert single-increment semantics without a
//      timing race.
//   3. `reset()` zeroes every counter but keeps the reset function in
//      place so the next scene starts from a clean slate.
//
// The scenarios below all use an in-memory `installMemoryStorage()` and
// the existing `createMockRepositoryServer()` so they run under the
// ordinary `node --test` runner alongside `tests/persistence.test.js`.
//
// Production bundle must NOT ship the counter object. The companion
// audit token in `scripts/audit-client-bundle.mjs` enforces that
// invariant (see FORBIDDEN_TEXT entry added in the same PR).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createMockRepositoryServer } from './helpers/mock-api-server.js';

const DEFAULT_API_CACHE_STORAGE_KEY = 'ks2-platform-v2.api-cache-state:default';
const BOOTSTRAP_COORDINATION_KEY = `${DEFAULT_API_CACHE_STORAGE_KEY}:bootstrap-coordination`;

function learnerSnapshot() {
  return {
    byId: {
      'learner-a': {
        id: 'learner-a',
        name: 'Ava',
        yearGroup: 'Y5',
        goal: 'sats',
        dailyMinutes: 15,
        avatarColor: '#2D7DD2',
        createdAt: 1,
      },
    },
    allIds: ['learner-a'],
    selectedId: 'learner-a',
  };
}

// The capacity-meta counter object is module-scoped on `globalThis`.
// Each test reads it via this helper so any future rename surfaces here.
function readCapacityMeta() {
  return globalThis.__ks2_capacityMeta__;
}

function resetCapacityMeta() {
  const meta = readCapacityMeta();
  if (meta && typeof meta.reset === 'function') meta.reset();
}

test('globalThis.__ks2_capacityMeta__ is installed in test builds with expected shape', () => {
  // The counter singleton installs lazily on first import of the
  // repositories barrel. That happens at the top of this file, so the
  // object must already exist by the time the first test runs.
  const meta = readCapacityMeta();
  assert.ok(meta, 'capacity meta counters must exist in test mode');
  const expectedKeys = [
    'bootstrapLeaderAcquired',
    'bootstrapFollowerWaited',
    'bootstrapFollowerUsedCache',
    'bootstrapFollowerTimedOut',
    'bootstrapFallbackFullRefresh',
    'staleCommandSmallRefresh',
    'staleCommandFullBootstrapFallback',
    'bootstrapCoordinationStorageUnavailable',
  ];
  for (const key of expectedKeys) {
    assert.equal(
      typeof meta[key],
      'number',
      `counter ${key} must be numeric, got ${typeof meta[key]}`,
    );
  }
  assert.equal(typeof meta.reset, 'function', 'capacity meta must expose reset()');
});

test('reset() zeros every counter without replacing the object identity', () => {
  const meta = readCapacityMeta();
  // Prime a counter by mutating directly — we assert the reset
  // contract independently of the increment paths below.
  meta.bootstrapLeaderAcquired = 7;
  meta.staleCommandSmallRefresh = 3;
  const before = meta;
  meta.reset();
  const after = readCapacityMeta();
  assert.equal(after, before, 'reset() must preserve object identity (no replace)');
  assert.equal(after.bootstrapLeaderAcquired, 0);
  assert.equal(after.staleCommandSmallRefresh, 0);
});

test('leader tab hydrate acquires the coordination lease when a cache fallback is available', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  let now = 100_000;
  const options = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };

  // Cold start bypasses coordination (there is no cache to protect),
  // so the leader counter only fires on the SECOND hydrate when the
  // warmed cache provides the fallback. This mirrors the production
  // flow: the very first hydrate of a session is a "full refresh"
  // path and does not compete for a coordination lease.
  const repositories = createApiPlatformRepositories(options);
  await repositories.hydrate();
  resetCapacityMeta();

  const rehydrated = createApiPlatformRepositories(options);
  await rehydrated.hydrate();

  const meta = readCapacityMeta();
  assert.equal(
    meta.bootstrapLeaderAcquired,
    1,
    'second-tab hydrate must bump bootstrapLeaderAcquired exactly once',
  );
  assert.equal(
    meta.bootstrapFollowerWaited,
    0,
    'leader path does not fire follower-waited counter',
  );
});

test('follower tab with an active foreign lease increments bootstrapFollowerWaited', async () => {
  resetCapacityMeta();
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  let now = 200_000;
  const options = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };

  // Warm the shared cache so the follower path has a fallback bundle.
  const leader = createApiPlatformRepositories(options);
  await leader.hydrate();
  resetCapacityMeta();

  // Plant a foreign-owned lease — simulates another tab mid-bootstrap.
  storage.setItem(BOOTSTRAP_COORDINATION_KEY, JSON.stringify({
    ownerId: 'other-tab',
    startedAt: now,
    expiresAt: now + 30_000,
  }));

  const follower = createApiPlatformRepositories(options);
  await follower.hydrate();

  const meta = readCapacityMeta();
  assert.equal(
    meta.bootstrapFollowerWaited,
    1,
    'follower seeing a foreign lease must bump bootstrapFollowerWaited once',
  );
  assert.equal(
    meta.bootstrapLeaderAcquired,
    0,
    'follower path must NOT claim leader credit',
  );
  assert.equal(
    meta.bootstrapFollowerUsedCache,
    1,
    'follower backing off with fallback cache must bump bootstrapFollowerUsedCache',
  );
});

test('bootstrapFallbackFullRefresh fires when there is no cache fallback and bootstrap throws', async () => {
  resetCapacityMeta();
  const storage = installMemoryStorage();
  let now = 300_000;
  const fetch = async () => {
    throw new Error('network dead');
  };
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch,
    storage,
    now: () => now,
    random: () => 0,
  });

  // No shared cache has been warmed, so the failure path is the
  // "no fallback available" branch — that is the fallback-full-refresh
  // signal we want to count.
  await assert.rejects(repositories.hydrate(), /network dead/);

  const meta = readCapacityMeta();
  assert.ok(
    meta.bootstrapFallbackFullRefresh >= 1,
    `bootstrapFallbackFullRefresh must fire on no-fallback failure, got ${meta.bootstrapFallbackFullRefresh}`,
  );
});

test('bootstrapFollowerTimedOut fires when a previously active foreign lease has expired', async () => {
  resetCapacityMeta();
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  let now = 400_000;
  const options = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };

  const warm = createApiPlatformRepositories(options);
  await warm.hydrate();
  resetCapacityMeta();

  // Plant an expired foreign lease. The follower's reader MUST treat
  // this as "previous leader timed out" and pick up leadership itself.
  storage.setItem(BOOTSTRAP_COORDINATION_KEY, JSON.stringify({
    ownerId: 'other-tab',
    startedAt: now - 60_000,
    expiresAt: now - 1_000,
  }));

  const follower = createApiPlatformRepositories(options);
  await follower.hydrate();

  const meta = readCapacityMeta();
  assert.ok(
    meta.bootstrapFollowerTimedOut >= 1,
    `expired foreign lease must bump bootstrapFollowerTimedOut, got ${meta.bootstrapFollowerTimedOut}`,
  );
  assert.equal(
    meta.bootstrapLeaderAcquired,
    1,
    'after timeout the follower must take over leadership once',
  );
});

// U8 round 1 adv-u8-r1-001 P2: the recursive `hydrateRemoteState` retry
// that fires on a `notModified` response with a malformed revision
// envelope (cacheDivergence) must NOT re-bump
// `bootstrapLeaderAcquired`. A single tab session triggering
// cacheDivergence performs exactly one leader acquisition even though
// the code path re-enters itself internally.
test('cacheDivergence recursive hydrate bumps bootstrapLeaderAcquired exactly once', async () => {
  resetCapacityMeta();
  const storage = installMemoryStorage();
  const validRevision = {
    accountRevision: 1,
    accountLearnerListRevision: 1,
    bootstrapCapacityVersion: 1,
    hash: 'rev-warm',
    selectedLearnerRevision: 1,
  };
  let now = 500_000;
  // Hand-rolled fetch that drives the three-response sequence on a
  // single repository instance:
  //   1. first hydrate cold GET -> full bundle with a valid revision
  //      envelope; this captures `lastKnownBootstrapRevision` in
  //      memory for the second hydrate.
  //   2. second hydrate POST probe -> `{ notModified: true, revision }`
  //      where revision is structurally invalid (hash only, other
  //      BOOTSTRAP_V2_REVISION_KEYS missing). This triggers the
  //      recursive retry in api.js.
  //   3. recursive GET retry -> full bundle with the valid envelope
  //      again so the retry succeeds.
  let call = 0;
  const fetch = async (_url, init = {}) => {
    call += 1;
    const method = (init.method || 'GET').toUpperCase();
    const bundle = {
      ok: true,
      learners: learnerSnapshot(),
      subjectStates: {},
      practiceSessions: [],
      gameState: {},
      eventLog: [],
      meta: { capacity: { bootstrapCapacity: { requestsPerMinute: 10 } } },
      revision: validRevision,
    };
    if (method === 'POST') {
      return new Response(JSON.stringify({
        ok: true,
        notModified: true,
        // Invalid revision envelope — only `hash` present.
        revision: { hash: 'rev-warm' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify(bundle), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const options = {
    baseUrl: 'https://repo.test',
    fetch,
    storage,
    now: () => now,
    random: () => 0,
  };

  // First hydrate warms the cache AND captures `lastKnownBootstrapRevision`
  // in the repository closure so the second hydrate uses the POST probe.
  const repositories = createApiPlatformRepositories(options);
  await repositories.hydrate();
  resetCapacityMeta();

  // Second hydrate fires POST (cacheDivergence) -> recursive GET on
  // the SAME repository instance. The lease lives across the
  // recursion; without the retry guard the leader counter bumps twice.
  await repositories.hydrate();

  const meta = readCapacityMeta();
  // Two network calls were observed — POST probe + recursive GET
  // retry — so the test really did drive the cacheDivergence path.
  assert.ok(call >= 3, `test should drive POST probe + recursive GET, saw ${call} fetches`);
  assert.equal(
    meta.bootstrapLeaderAcquired,
    1,
    `cacheDivergence recursive retry must not double-bump leader counter, got ${meta.bootstrapLeaderAcquired}`,
  );
});

// U8 round 1 adv-u8-r1-002 P2: when `localStorage.setItem` throws on
// the lease write (quota exceeded, managed-profile Chromebook with
// site storage disabled), acquireBootstrapCoordination must bump the
// new `bootstrapCoordinationStorageUnavailable` counter so operators
// have visibility into the coordination-bypass path. The tab falls
// through to independent bootstrap without throwing.
test('bootstrapCoordinationStorageUnavailable fires when the lease write throws', async () => {
  resetCapacityMeta();
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  let now = 600_000;
  const options = {
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => now,
    random: () => 0,
  };

  // Warm the cache so the second hydrate has a fallback and actually
  // exercises the coordination path (cold start bypasses the lease).
  const warm = createApiPlatformRepositories(options);
  await warm.hydrate();
  resetCapacityMeta();

  // Arm the storage to throw on the next lease write. The hydrate
  // MUST still complete — graceful degradation is the contract.
  storage.throwOnNextSet({ key: BOOTSTRAP_COORDINATION_KEY });

  const degraded = createApiPlatformRepositories(options);
  await degraded.hydrate();

  const meta = readCapacityMeta();
  assert.equal(
    meta.bootstrapCoordinationStorageUnavailable,
    1,
    `storage-write failure during lease acquisition must bump bootstrapCoordinationStorageUnavailable, got ${meta.bootstrapCoordinationStorageUnavailable}`,
  );
  // The tab must NOT have claimed leadership (the write failed, no
  // lease was held). It did proceed to bootstrap independently, which
  // is the degraded path we are measuring.
  assert.equal(
    meta.bootstrapLeaderAcquired,
    0,
    'failed lease acquisition must not bump the leader counter',
  );
});

// U8 round 1: `reset()` must zero every counter including the new
// `bootstrapCoordinationStorageUnavailable` key so scenes start clean.
test('reset() zeros bootstrapCoordinationStorageUnavailable alongside existing counters', () => {
  const meta = readCapacityMeta();
  meta.bootstrapCoordinationStorageUnavailable = 5;
  meta.reset();
  assert.equal(meta.bootstrapCoordinationStorageUnavailable, 0);
});
