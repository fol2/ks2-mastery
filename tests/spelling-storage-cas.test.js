// Tests for U5 — Full storage-CAS hardening (navigator.locks + BroadcastChannel
// + writeVersion + soft lockout).
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U5).
//
// Scenarios covered (per plan test matrix):
//   - Happy path — single-tab sequential writes: writeVersion monotonically increases.
//   - Happy path — fallback when navigator.locks === undefined still writes correctly.
//   - Edge case — simulated cross-tab via BroadcastChannel re-hydration.
//   - Edge case — duplicate-leader race: writeVersion stale detection catches
//     the conflict; retry re-hydrates and merges.
//   - Edge case — WriteVersionStaleError propagates when the retry cap is reached.
//   - Edge case — 2^30 wraparound: counter wraps to 1 and the telemetry hook fires.
//   - Second-tab detector — `ifAvailable: true` returning null flips the state.
//   - Fallback (no locks) — second-tab-detector emits SINGLE_TAB_FALLBACK.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import { createSpellingPersistence } from '../src/subjects/spelling/repository.js';
import {
  WriteVersionStaleError,
  WRITE_VERSION_CEILING,
  assertNotStale,
  nextWriteVersion,
  readWriteVersion,
  isWriteVersionStaleError,
} from '../src/platform/core/repositories/locks/write-version.js';
import {
  createBroadcastInvalidator,
  isBroadcastChannelAvailable,
} from '../src/platform/core/repositories/locks/broadcast-invalidator.js';
import {
  DEFAULT_LOCK_NAME,
  isLocksAvailable,
  withWriteLock,
  probeSecondTabOwnership,
} from '../src/platform/core/repositories/locks/lock-manager.js';
import {
  LOCKOUT_STATES,
  LOCKOUT_BANNER_COPY,
  createSecondTabDetector,
} from '../src/platform/core/repositories/locks/second-tab-detector.js';
import { REPO_STORAGE_KEYS } from '../src/platform/core/repositories/helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function freshGuardianRecord(todayDay) {
  return {
    correctStreak: 1,
    lastResult: 'correct',
    lastDay: todayDay,
    nextDueDay: todayDay + 3,
    reviewLevel: 0,
    wobbling: false,
  };
}

function makeTabRepositories(storage, factoryOpts = {}) {
  return createLocalPlatformRepositories({ storage, ...factoryOpts });
}

function readMetaVersion(storage) {
  const raw = storage.getItem(REPO_STORAGE_KEYS.meta);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Number(parsed?.writeVersion) || 0;
  } catch {
    return 0;
  }
}

// -----------------------------------------------------------------------------
// writeVersion primitives
// -----------------------------------------------------------------------------

test('U5 writeVersion: readWriteVersion returns 0 for missing / invalid input', () => {
  assert.equal(readWriteVersion(null), 0);
  assert.equal(readWriteVersion(undefined), 0);
  assert.equal(readWriteVersion({}), 0);
  assert.equal(readWriteVersion({ writeVersion: 'x' }), 0);
  assert.equal(readWriteVersion({ writeVersion: -4 }), 0);
  assert.equal(readWriteVersion({ writeVersion: 1.8 }), 1);
  assert.equal(readWriteVersion({ writeVersion: 42 }), 42);
  assert.equal(readWriteVersion({ meta: { writeVersion: 7 } }), 7);
});

test('U5 writeVersion: nextWriteVersion advances monotonically', () => {
  assert.equal(nextWriteVersion(0), 1);
  assert.equal(nextWriteVersion(1), 2);
  assert.equal(nextWriteVersion(99), 100);
});

test('U5 writeVersion: nextWriteVersion wraps to 1 at the ceiling and fires telemetry', () => {
  const calls = [];
  const telemetry = (event) => calls.push(event);
  const result = nextWriteVersion(WRITE_VERSION_CEILING - 1, { telemetry });
  assert.equal(result, 1, 'wraps to 1 at ceiling');
  assert.equal(calls.length, 1, 'telemetry fires once');
  assert.equal(calls[0].kind, 'write-version-wraparound');
  assert.equal(calls[0].wrappedTo, 1);
  assert.equal(calls[0].ceiling, WRITE_VERSION_CEILING);
});

test('U5 writeVersion: assertNotStale throws WriteVersionStaleError when actual > expected', () => {
  // Same versions — OK (not stale).
  assert.doesNotThrow(() => assertNotStale({ expected: 5, actual: 5 }));
  // Expected ahead of actual (e.g. in-memory wrote but disk hasn't caught up; treat as OK).
  assert.doesNotThrow(() => assertNotStale({ expected: 7, actual: 5 }));
  // Stale — someone else bumped the counter.
  assert.throws(
    () => assertNotStale({ expected: 5, actual: 6 }),
    (err) => {
      assert.equal(err.name, 'WriteVersionStaleError');
      assert.equal(err.expected, 5);
      assert.equal(err.actual, 6);
      assert.ok(isWriteVersionStaleError(err));
      return true;
    },
  );
});

// -----------------------------------------------------------------------------
// BroadcastChannel invalidator
// -----------------------------------------------------------------------------

test('U5 broadcast: createBroadcastInvalidator returns no-op adapter when BroadcastChannel is absent', () => {
  const original = globalThis.BroadcastChannel;
  try {
    Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined, configurable: true });
    assert.equal(isBroadcastChannelAvailable(), false, 'late-binding detection sees undefined');
    const invalidator = createBroadcastInvalidator();
    assert.equal(invalidator.available, false, 'fallback adapter reports unavailable');
    // no-op — must not throw
    invalidator.broadcast({ writeVersion: 1 });
    const unsub = invalidator.subscribe(() => {});
    unsub();
  } finally {
    Object.defineProperty(globalThis, 'BroadcastChannel', { value: original, configurable: true });
  }
});

test('U5 broadcast: sibling tabs receive write events asynchronously', async () => {
  if (typeof globalThis.BroadcastChannel !== 'function') {
    // Host without BroadcastChannel — skip the async propagation test.
    return;
  }
  const channelName = 'ks2-spell-cache-invalidate-test-' + Math.random().toString(36).slice(2, 8);
  const a = createBroadcastInvalidator({ channelName });
  const b = createBroadcastInvalidator({ channelName });
  try {
    const received = [];
    b.subscribe((msg) => { received.push(msg); });
    a.broadcast({ writeVersion: 5 });
    // BroadcastChannel dispatches on the next microtask — poll up to 100ms.
    const start = Date.now();
    while (received.length === 0 && Date.now() - start < 500) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(received.length, 1);
    assert.equal(received[0].kind, 'write');
    assert.equal(received[0].writeVersion, 5);
  } finally {
    a.close();
    b.close();
  }
});

// -----------------------------------------------------------------------------
// lock-manager late-binding feature detection
// -----------------------------------------------------------------------------

test('U5 lock-manager: isLocksAvailable is late-binding (re-checks on each call)', () => {
  const originalNav = globalThis.navigator;
  try {
    // Simulate navigator.locks absent (Safari < 15.4 / workers < 16 path).
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'test' },
      configurable: true,
    });
    assert.equal(isLocksAvailable(), false, 'late-binding sees navigator without locks');

    // Flip to present mid-test (M6 adversarial finding).
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          request(name, opts, fn) { return fn({ name }); },
        },
      },
      configurable: true,
    });
    assert.equal(isLocksAvailable(), true, 're-check sees the newly-mutated navigator');
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

test('U5 lock-manager: withWriteLock runs fn directly when locks unavailable (fallback mainline)', async () => {
  const originalNav = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'fallback' },
      configurable: true,
    });
    const order = [];
    await withWriteLock('ks2-spell-write', async () => { order.push('inside'); });
    assert.deepEqual(order, ['inside'], 'fn runs even without locks');
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

test('U5 lock-manager: withWriteLock serialises callbacks under the mock locks API', async () => {
  const originalNav = globalThis.navigator;
  try {
    let inFlight = 0;
    let peakConcurrency = 0;
    const locksQueue = Promise.resolve();
    let tail = locksQueue;
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          async request(name, opts, fn) {
            // Mimic the browser's serialisation: queue by chaining off `tail`.
            const next = tail.then(async () => {
              inFlight += 1;
              peakConcurrency = Math.max(peakConcurrency, inFlight);
              try {
                return await fn({ name });
              } finally {
                inFlight -= 1;
              }
            });
            tail = next.catch(() => {});
            return next;
          },
        },
      },
      configurable: true,
    });
    await Promise.all([
      withWriteLock('ks2-spell-write', async () => { await new Promise((r) => setTimeout(r, 10)); }),
      withWriteLock('ks2-spell-write', async () => { await new Promise((r) => setTimeout(r, 10)); }),
      withWriteLock('ks2-spell-write', async () => { await new Promise((r) => setTimeout(r, 10)); }),
    ]);
    assert.equal(peakConcurrency, 1, 'only one callback ever holds the lock at a time');
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

test('U5 lock-manager: probeSecondTabOwnership returns true when ifAvailable yields null', async () => {
  const originalNav = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          async request(name, opts, fn) {
            if (opts && opts.ifAvailable) return fn(null);
            return fn({ name });
          },
        },
      },
      configurable: true,
    });
    const held = await probeSecondTabOwnership(DEFAULT_LOCK_NAME);
    assert.equal(held, true, 'probe interprets null as held-elsewhere');
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

// -----------------------------------------------------------------------------
// second-tab detector
// -----------------------------------------------------------------------------

test('U5 second-tab detector: emits SINGLE_TAB_FALLBACK when locks unavailable', () => {
  const originalNav = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'fallback' }, configurable: true });
    const detector = createSecondTabDetector();
    const states = [];
    detector.subscribe((s) => states.push(s.kind));
    detector.start();
    assert.deepEqual(states, [LOCKOUT_STATES.SINGLE_TAB_FALLBACK]);
    assert.ok(LOCKOUT_BANNER_COPY[LOCKOUT_STATES.SINGLE_TAB_FALLBACK].message);
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

test('U5 second-tab detector: flips to OTHER_TAB_ACTIVE when probe returns held-elsewhere', async () => {
  const originalNav = globalThis.navigator;
  try {
    // Provide a locks API so isLocksAvailable() passes; the actual probe is
    // injected via options below.
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        locks: {
          async request(_name, _opts, fn) { return fn({}); },
        },
      },
      configurable: true,
    });
    let heldElsewhere = true;
    const detector = createSecondTabDetector({
      probe: async () => heldElsewhere,
      pollIntervalMs: 5,
      scheduler: (fn) => setTimeout(fn, 5),
      cancelScheduler: (h) => clearTimeout(h),
    });
    const states = [];
    detector.subscribe((s) => states.push(s.kind));
    detector.start();
    const state1 = await detector.probeNow();
    assert.equal(state1.kind, LOCKOUT_STATES.OTHER_TAB_ACTIVE);
    heldElsewhere = false;
    const state2 = await detector.probeNow();
    assert.equal(state2.kind, LOCKOUT_STATES.THIS_TAB_OWNS);
    detector.stop();
  } finally {
    if (originalNav) {
      Object.defineProperty(globalThis, 'navigator', { value: originalNav, configurable: true });
    } else {
      delete globalThis.navigator;
    }
  }
});

// -----------------------------------------------------------------------------
// Repository writeVersion integration
// -----------------------------------------------------------------------------

test('U5 repository: writeVersion monotonically increases on sequential writes', () => {
  const storage = installMemoryStorage();
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const repos = makeTabRepositories(storage);
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories: repos, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  const v0 = repos.storageCas.readWriteVersion();
  service.saveGuardianRecord('learner-a', 'possess', freshGuardianRecord(today));
  const v1 = repos.storageCas.readWriteVersion();
  assert.ok(v1 > v0, `writeVersion advanced past ${v0}`);
  service.saveGuardianRecord('learner-a', 'believe', freshGuardianRecord(today));
  const v2 = repos.storageCas.readWriteVersion();
  assert.ok(v2 > v1, 'second write advances further');
  assert.equal(readMetaVersion(storage), v2, 'storage carries the latest version');
});

test('U5 repository: writeData with expectedWriteVersion rejects a stale snapshot', () => {
  const storage = installMemoryStorage();
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const reposTabA = makeTabRepositories(storage);
  const serviceA = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposTabA, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  serviceA.saveGuardianRecord('learner-a', 'possess', freshGuardianRecord(today));
  const snapshotVersion = reposTabA.storageCas.readWriteVersion();

  // Simulate another tab bumping the disk version by writing through a second
  // repository that shares storage.
  const reposTabB = makeTabRepositories(storage);
  const serviceB = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposTabB, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  serviceB.saveGuardianRecord('learner-a', 'believe', freshGuardianRecord(today));

  // Now try to writeData from Tab A with its stale snapshot version — the CAS
  // catches the drift.
  assert.throws(
    () => reposTabA.subjectStates.writeData(
      'learner-a',
      'spelling',
      { prefs: {}, progress: {}, guardian: { possess: freshGuardianRecord(today) } },
      { expectedWriteVersion: snapshotVersion },
    ),
    (err) => {
      assert.equal(err.name, 'WriteVersionStaleError');
      assert.equal(err.expected, snapshotVersion);
      assert.ok(err.actual > snapshotVersion);
      return true;
    },
  );
});

test('U5 repository: simulated cross-tab through shared storage — both slugs survive via CAS retry', async () => {
  // This is the invariant version of the P1.5 U7 "known limitation" test. Now
  // that the storage layer carries a monotonic writeVersion and the spelling
  // repository's setItem path retries on stale, both tabs' writes survive.
  const storage = installMemoryStorage();
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);

  const reposTabA = makeTabRepositories(storage);
  const serviceTabA = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposTabA, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });

  const slugX = 'possess';
  const slugY = 'believe';

  serviceTabA.saveGuardianRecord('learner-a', slugX, freshGuardianRecord(today));

  const reposTabB = makeTabRepositories(storage);
  const serviceTabB = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposTabB, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  serviceTabB.saveGuardianRecord('learner-a', slugY, freshGuardianRecord(today));

  // Tab A now writes again — our CAS path must detect the stale version, re-
  // read (capturing slug Y), merge slug X on top, and commit.
  serviceTabA.saveGuardianRecord('learner-a', slugX, {
    ...freshGuardianRecord(today),
    reviewLevel: 3,
  });

  // Observe raw storage directly — both slugs are present.
  const finalRaw = JSON.parse(storage.getItem(REPO_STORAGE_KEYS.subjectStates) || '{}');
  const finalSpellingRecord = finalRaw['learner-a::spelling'] || {};
  const finalGuardian = (finalSpellingRecord.data && finalSpellingRecord.data.guardian) || {};
  assert.ok(finalGuardian[slugX], 'tab A\'s slug X write landed');
  assert.ok(
    finalGuardian[slugY],
    'tab B\'s slug Y survives — CAS retry merged both writes',
  );
  // Sanity: tab A's update to slug X is reflected.
  assert.equal(finalGuardian[slugX].reviewLevel, 3, 'slug X carries tab A\'s latest update');
});

test('U5 repository: fallback path (BroadcastChannel absent) still preserves writeVersion CAS', () => {
  const originalBC = globalThis.BroadcastChannel;
  try {
    Object.defineProperty(globalThis, 'BroadcastChannel', { value: undefined, configurable: true });
    const storage = installMemoryStorage();
    const now = () => Date.UTC(2026, 0, 10);
    const today = Math.floor(now() / DAY_MS);
    const repos = makeTabRepositories(storage);
    const service = createSpellingService({
      repository: createSpellingPersistence({ repositories: repos, now }),
      now,
      random: () => 0.5,
      tts: { speak() {}, stop() {}, warmup() {} },
    });
    assert.equal(repos.storageCas.isBroadcastAvailable(), false);
    service.saveGuardianRecord('learner-a', 'possess', freshGuardianRecord(today));
    service.saveGuardianRecord('learner-a', 'believe', freshGuardianRecord(today));
    const v = repos.storageCas.readWriteVersion();
    assert.ok(v >= 2, 'writeVersion bumps despite BroadcastChannel absence');
  } finally {
    Object.defineProperty(globalThis, 'BroadcastChannel', { value: originalBC, configurable: true });
  }
});

test('U5 repository: writeVersion wraparound telemetry fires at 2^30 ceiling', () => {
  const storage = installMemoryStorage();
  // Pre-seed the meta so the next persistAll bumps from the ceiling.
  storage.setItem(REPO_STORAGE_KEYS.meta, JSON.stringify({
    schemaVersion: 2,
    updatedAt: Date.now(),
    writeVersion: WRITE_VERSION_CEILING - 1,
  }));
  // Seed minimal bundle so createLocalPlatformRepositories treats this as
  // "already has new repository data" and skips legacy loading.
  storage.setItem(REPO_STORAGE_KEYS.learners, JSON.stringify({ byId: {}, allIds: [], selectedId: null }));
  storage.setItem(REPO_STORAGE_KEYS.subjectStates, JSON.stringify({}));
  storage.setItem(REPO_STORAGE_KEYS.practiceSessions, JSON.stringify([]));
  storage.setItem(REPO_STORAGE_KEYS.gameState, JSON.stringify({}));
  storage.setItem(REPO_STORAGE_KEYS.eventLog, JSON.stringify([]));

  const telemetryEvents = [];
  const repos = makeTabRepositories(storage, {
    onWriteVersionWraparound: (ev) => telemetryEvents.push(ev),
  });
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories: repos, now }),
    now,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  service.saveGuardianRecord('learner-a', 'possess', freshGuardianRecord(today));

  assert.equal(telemetryEvents.length >= 1, true, 'telemetry fired on wraparound');
  const wrap = telemetryEvents.find((e) => e.kind === 'write-version-wraparound');
  assert.ok(wrap, 'telemetry event kind === write-version-wraparound');
  assert.equal(wrap.wrappedTo, 1);
  assert.equal(wrap.ceiling, WRITE_VERSION_CEILING);
  // After wraparound, the stored writeVersion is 1, not WRITE_VERSION_CEILING.
  assert.equal(readMetaVersion(storage), 1, 'disk writeVersion wrapped to 1');
});

test('U5 repository: WriteVersionStaleError surfaces when retries are exhausted', () => {
  // Drive a pathological scenario where every pre-commit re-read sees a
  // bumped writeVersion — retries burn through until the cap kicks in. We
  // simulate this by overriding writeData on a wrapped repository so it
  // throws WriteVersionStaleError unconditionally.
  const storage = installMemoryStorage();
  const now = () => Date.UTC(2026, 0, 10);
  const today = Math.floor(now() / DAY_MS);
  const repos = makeTabRepositories(storage);
  const originalWriteData = repos.subjectStates.writeData;
  repos.subjectStates.writeData = function failingWriteData() {
    throw new WriteVersionStaleError({ expected: 1, actual: 99 });
  };
  // Keep `storageCas.readWriteVersion` returning a value so the retry loop
  // actually engages.
  const spelling = createSpellingPersistence({ repositories: repos, now });
  assert.throws(
    () => spelling.storage.setItem(`ks2-spell-guardian-learner-a`, JSON.stringify({ possess: freshGuardianRecord(today) })),
    (err) => err && (err.name === 'WriteVersionStaleError' || err.name === 'PersistenceSetItemError'),
  );
  // Restore so test cleanup doesn't leave the repository half-broken.
  repos.subjectStates.writeData = originalWriteData;
});

test('U5 repository: storageCas surface exposes readWriteVersion and broadcast helpers', () => {
  const storage = installMemoryStorage();
  const repos = makeTabRepositories(storage);
  assert.equal(typeof repos.storageCas.readWriteVersion, 'function');
  assert.equal(typeof repos.storageCas.broadcast, 'function');
  assert.equal(typeof repos.storageCas.subscribe, 'function');
  assert.equal(typeof repos.storageCas.isBroadcastAvailable, 'function');
});

test('U5 banner copy: LOCKOUT_BANNER_COPY provides distinct strings for both lockout states', () => {
  const active = LOCKOUT_BANNER_COPY[LOCKOUT_STATES.OTHER_TAB_ACTIVE];
  assert.ok(active.message.length > 0);
  assert.equal(active.actionLabel, 'Use this tab anyway');
  const fallback = LOCKOUT_BANNER_COPY[LOCKOUT_STATES.SINGLE_TAB_FALLBACK];
  assert.ok(fallback.message.length > 0);
  assert.notEqual(active.message, fallback.message);
});
