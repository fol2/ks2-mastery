// P2 U9 — Durable persistence-warning sibling.
//
// Plan: docs/plans/2026-04-26-006-feat-post-mega-spelling-p2-visibility-pattern-foundation-plan.md (U9)
//
// Contract under test:
//   1. On any `saveJson` failure through the spelling storage proxy the
//      service writes `data.persistenceWarning = { reason, occurredAt,
//      acknowledged: false }` — the DURABLE sibling, not just the
//      session-scoped `feedback.persistenceWarning`.
//   2. The durable record survives tab close: a fresh service instance
//      reading the same repositories sees the banner.
//   3. `acknowledgePersistenceWarning(learnerId)` sets `acknowledged: true`
//      while preserving `reason` + `occurredAt` for audit; banner dismisses.
//   4. A second `saveJson` failure while unacknowledged overwrites
//      `occurredAt` and keeps `acknowledged: false` (the learner already
//      knows something is wrong — no "double-banner" fatigue).
//   5. A second failure AFTER acknowledge overwrites `acknowledged: false`
//      so the banner re-surfaces.
//   6. When `writePersistenceWarning` itself fails, the bounded retry +
//      `console.warn` fallback stops the submit path from crashing.
//   7. Worker twin's `normaliseServerSpellingData` preserves
//      `data.persistenceWarning` through command round-trips.
//   8. The `acknowledge-persistence-warning` Worker command mirrors
//      `service.acknowledgePersistenceWarning` behaviour.
//
// Tests use `createLocalPlatformRepositories` (the P1.5 U8 dead-code
// learning: bare `MemoryStorage` misses the `persistAll` wrapper that the
// production code path actually hits). `MemoryStorage.throwOnNextSet` arms
// a one-shot throw on the underlying raw storage; the platform repository's
// `persistAll` detects the throw via `persistBundle` and surfaces it through
// the proxy's `PersistenceSetItemError`, which is exactly the production
// signature the service reacts to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installMemoryStorage, MemoryStorage } from './helpers/memory-storage.js';
import { createLocalPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { createSpellingService } from '../src/subjects/spelling/service.js';
import {
  createSpellingPersistence,
  normaliseSpellingSubjectData,
} from '../src/subjects/spelling/repository.js';
import { WORDS } from '../src/subjects/spelling/data/word-data.js';
import {
  SPELLING_PERSISTENCE_WARNING_REASON,
  normaliseDurablePersistenceWarning,
} from '../src/subjects/spelling/service-contract.js';
import {
  createServerSpellingEngine,
  normaliseServerSpellingData,
} from '../worker/src/subjects/spelling/engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY_MS = Date.UTC(2026, 3, 26);
const TODAY_DAY = Math.floor(TODAY_MS / DAY_MS);
const CORE_WORDS = WORDS.filter((word) => word.spellingPool !== 'extra');
const CORE_SLUGS = CORE_WORDS.map((word) => word.slug);

function makeServiceWithRepositories({ now = () => TODAY_MS, random = () => 0.5 } = {}) {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const repositories = createLocalPlatformRepositories({ storage });
  const service = createSpellingService({
    repository: createSpellingPersistence({ repositories, now }),
    now,
    random,
    tts: {
      speak() {},
      stop() {},
      warmup() {},
    },
  });
  return { storage, repositories, service };
}

function seedAllCoreMega(repositories, learnerId, todayDay) {
  const progress = Object.fromEntries(
    CORE_SLUGS.map((slug, index) => [slug, {
      stage: 4,
      attempts: 6 + (index % 4),
      correct: 5 + (index % 4),
      wrong: 1,
      dueDay: todayDay + 60,
      lastDay: todayDay - 7,
      lastResult: 'correct',
    }]),
  );
  repositories.subjectStates.writeData(learnerId, 'spelling', { progress, guardian: {} });
}

// ---- Normaliser contract -----------------------------------------------------

test('P2 U9 normaliser: returns null for garbage / missing input', () => {
  assert.equal(normaliseDurablePersistenceWarning(null), null);
  assert.equal(normaliseDurablePersistenceWarning(undefined), null);
  assert.equal(normaliseDurablePersistenceWarning('not-an-object'), null);
  assert.equal(normaliseDurablePersistenceWarning([]), null);
  assert.equal(normaliseDurablePersistenceWarning({}), null);
  assert.equal(normaliseDurablePersistenceWarning({ reason: 'unknown-kind' }), null);
});

test('P2 U9 normaliser: accepts well-formed record with defaults', () => {
  const out = normaliseDurablePersistenceWarning({
    reason: 'storage-save-failed',
    occurredAt: 19_500,
    acknowledged: true,
  });
  assert.deepEqual(out, {
    reason: 'storage-save-failed',
    occurredAt: 19_500,
    acknowledged: true,
  });
});

test('P2 U9 normaliser: defaults acknowledged=false, occurredAt=0 when absent/invalid', () => {
  const out = normaliseDurablePersistenceWarning({ reason: 'storage-save-failed' });
  assert.deepEqual(out, {
    reason: 'storage-save-failed',
    occurredAt: 0,
    acknowledged: false,
  });
  const clampedNeg = normaliseDurablePersistenceWarning({
    reason: 'storage-save-failed',
    occurredAt: -5,
  });
  assert.equal(clampedNeg.occurredAt, 0);
  const nonBoolean = normaliseDurablePersistenceWarning({
    reason: 'storage-save-failed',
    acknowledged: 'yes',
  });
  assert.equal(nonBoolean.acknowledged, false);
});

// ---- normaliseSpellingSubjectData parity (client + worker) ------------------

test('P2 U9 client normaliser: preserves data.persistenceWarning sibling', () => {
  const input = {
    progress: {},
    guardian: {},
    persistenceWarning: {
      reason: 'storage-save-failed',
      occurredAt: 19_500,
      acknowledged: false,
    },
  };
  const out = normaliseSpellingSubjectData(input, TODAY_DAY);
  assert.deepEqual(out.persistenceWarning, {
    reason: 'storage-save-failed',
    occurredAt: 19_500,
    acknowledged: false,
  });
});

test('P2 U9 client normaliser: drops persistenceWarning sibling when invalid', () => {
  const out = normaliseSpellingSubjectData({
    progress: {},
    guardian: {},
    persistenceWarning: { reason: 'unknown' },
  }, TODAY_DAY);
  assert.equal(out.persistenceWarning, undefined);
});

test('P2 U9 worker normaliser: preserves data.persistenceWarning sibling', () => {
  const input = {
    progress: {},
    guardian: {},
    persistenceWarning: {
      reason: 'storage-save-failed',
      occurredAt: 19_500,
      acknowledged: false,
    },
  };
  const out = normaliseServerSpellingData(input, TODAY_MS);
  assert.deepEqual(out.persistenceWarning, {
    reason: 'storage-save-failed',
    occurredAt: 19_500,
    acknowledged: false,
  });
});

// ---- Happy path: no warning ------------------------------------------------

test('P2 U9 happy path: clean submit leaves persistenceWarning unset', () => {
  const { service, repositories } = makeServiceWithRepositories();
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);
  const started = service.startSession('learner-a', { mode: 'guardian' });
  const answer = started.state.session.currentCard.word.word;
  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(submitted.ok, true);
  assert.equal(service.getPersistenceWarning('learner-a'), null,
    'no banner for a successful submit');
});

// ---- Write on storage failure (durable sibling) -----------------------------

test('P2 U9 write path: Guardian submit storage failure writes durable warning', () => {
  const { service, repositories, storage } = makeServiceWithRepositories();
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);

  const started = service.startSession('learner-a', { mode: 'guardian' });
  const answer = started.state.session.currentCard.word.word;

  // Arm the underlying raw storage to throw on the guardian-key write.
  // The platform repository wraps setItem inside persistAll → persistBundle;
  // a throw there surfaces via the persistence channel's lastError AND the
  // proxy's `PersistenceSetItemError` (see repository.js L249), which is
  // exactly the production signal the service reacts to.
  storage.throwOnNextSet();

  const submitted = service.submitAnswer('learner-a', started.state, answer);
  assert.equal(submitted.ok, true, 'submit stays ok: true on storage failure');

  // Feedback banner still surfaces (session-scoped, legacy behaviour).
  assert.equal(submitted.state.feedback?.persistenceWarning?.reason,
    'storage-save-failed');

  // Durable sibling IS written.
  const durable = service.getPersistenceWarning('learner-a');
  assert.ok(durable, 'durable persistenceWarning is non-null after failure');
  assert.equal(durable.reason, SPELLING_PERSISTENCE_WARNING_REASON.STORAGE_SAVE_FAILED);
  assert.equal(durable.acknowledged, false);
  assert.equal(typeof durable.occurredAt, 'number');
  assert.ok(durable.occurredAt >= 0);
});

// ---- Cross-session survival (integration with createLocalPlatformRepositories)

test('P2 U9 durable survival: fresh service instance reads persisted warning', () => {
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  const reposA = createLocalPlatformRepositories({ storage });
  const serviceA = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposA, now: () => TODAY_MS }),
    now: () => TODAY_MS,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  seedAllCoreMega(reposA, 'learner-a', TODAY_DAY);
  const started = serviceA.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  serviceA.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);

  // Sanity — first service wrote the warning.
  const warningA = serviceA.getPersistenceWarning('learner-a');
  assert.ok(warningA, 'warning is present on service A');
  assert.equal(warningA.acknowledged, false);

  // Simulate tab reopen: build a fresh repository + service wrapping the
  // SAME raw storage. The underlying platform repositories re-hydrate from
  // localStorage on construction, so a fresh instance should see the
  // warning that service A wrote.
  const reposB = createLocalPlatformRepositories({ storage });
  const serviceB = createSpellingService({
    repository: createSpellingPersistence({ repositories: reposB, now: () => TODAY_MS + 60_000 }),
    now: () => TODAY_MS + 60_000,
    random: () => 0.5,
    tts: { speak() {}, stop() {}, warmup() {} },
  });
  const warningB = serviceB.getPersistenceWarning('learner-a');
  assert.ok(warningB, 'warning survives into fresh service B (tab close simulation)');
  assert.equal(warningB.reason, warningA.reason);
  assert.equal(warningB.acknowledged, false,
    'banner still wants to show in the new tab until acknowledged');
});

// ---- Acknowledge dispatcher -------------------------------------------------

test('P2 U9 acknowledge: sets acknowledged=true, keeps reason + occurredAt', () => {
  const { service, repositories, storage } = makeServiceWithRepositories();
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);
  const started = service.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);

  const before = service.getPersistenceWarning('learner-a');
  assert.ok(before);
  assert.equal(before.acknowledged, false);

  service.acknowledgePersistenceWarning('learner-a');

  const after = service.getPersistenceWarning('learner-a');
  assert.ok(after, 'record retained for audit after acknowledge');
  assert.equal(after.acknowledged, true, 'acknowledged flipped true');
  assert.equal(after.reason, before.reason, 'reason preserved');
  assert.equal(after.occurredAt, before.occurredAt, 'occurredAt preserved');
});

test('P2 U9 acknowledge: no-op when no warning exists', () => {
  const { service } = makeServiceWithRepositories();
  // Never triggered a failure; no warning present.
  const result = service.acknowledgePersistenceWarning('learner-fresh');
  assert.equal(result.ok, true);
  assert.equal(service.getPersistenceWarning('learner-fresh'), null);
});

// ---- Subsequent-failure semantics -------------------------------------------

test('P2 U9 subsequent-failure-unacknowledged: overwrites occurredAt, keeps ack=false', () => {
  const clock = { now: TODAY_MS };
  const { service, repositories, storage } = makeServiceWithRepositories({ now: () => clock.now });
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);

  // First failure on day T.
  let started = service.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);
  const first = service.getPersistenceWarning('learner-a');
  assert.ok(first);
  assert.equal(first.occurredAt, TODAY_DAY);

  // Advance clock by 2 days, trigger second failure.
  clock.now = TODAY_MS + 2 * DAY_MS;
  started = service.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);

  const second = service.getPersistenceWarning('learner-a');
  assert.ok(second);
  assert.equal(second.acknowledged, false, 'still unacknowledged');
  assert.equal(second.occurredAt, TODAY_DAY + 2, 'occurredAt bumped to latest failure day');
});

test('P2 U9 subsequent-failure-after-ack: resets acknowledged to false', () => {
  const { service, repositories, storage } = makeServiceWithRepositories();
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);
  let started = service.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);
  service.acknowledgePersistenceWarning('learner-a');
  assert.equal(service.getPersistenceWarning('learner-a').acknowledged, true);

  // New failure after acknowledge.
  started = service.startSession('learner-a', { mode: 'guardian' });
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);

  const after = service.getPersistenceWarning('learner-a');
  assert.ok(after);
  assert.equal(after.acknowledged, false,
    'new failure resets acknowledged false so banner re-surfaces');
});

// ---- Bounded retry for writePersistenceWarning itself -----------------------

test('P2 U9 bounded retry: writePersistenceWarning twice-failing falls through to console.warn', () => {
  const { service } = makeServiceWithRepositories();

  // Replace console.warn with a spy so we can observe the fallback without
  // stomping the console. Restored after the assertion.
  const originalWarn = globalThis.console?.warn;
  const warnings = [];
  globalThis.console = globalThis.console || {};
  globalThis.console.warn = (...args) => { warnings.push(args); };

  try {
    // Directly monkeypatch the service's resolvedStorage.setItem so BOTH
    // the first attempt AND the retry throw. We reach into the repository
    // by using a brand-new service with an always-throwing storage.
    const throwingStorage = {
      getItem() { return null; },
      setItem() {
        throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
      },
      removeItem() {},
    };
    const hostile = createSpellingService({
      storage: throwingStorage,
      now: () => TODAY_MS,
      random: () => 0.5,
      tts: { speak() {}, stop() {}, warmup() {} },
    });

    // writePersistenceWarning should NOT throw — the bounded retry catches
    // and falls through to console.warn.
    let thrown = null;
    try {
      hostile.writePersistenceWarning('learner-a', 'storage-save-failed');
    } catch (error) {
      thrown = error;
    }
    assert.equal(thrown, null, 'writePersistenceWarning must not throw on double-failure');
    assert.ok(warnings.length >= 1, 'console.warn fallback fired');
  } finally {
    globalThis.console.warn = originalWarn;
  }
});

// ---- Worker twin parity -----------------------------------------------------

test('P2 U9 worker twin: acknowledge-persistence-warning command flips acknowledged', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
  });
  const subjectRecord = {
    ui: null,
    data: {
      progress: {},
      guardian: {},
      persistenceWarning: {
        reason: 'storage-save-failed',
        occurredAt: TODAY_DAY,
        acknowledged: false,
      },
    },
  };
  const response = engine.apply({
    learnerId: 'learner-a',
    subjectRecord,
    command: 'acknowledge-persistence-warning',
    payload: {},
  });
  assert.equal(response.ok, true);
  assert.ok(response.data.persistenceWarning,
    'worker command preserves the sibling with acknowledged=true');
  assert.equal(response.data.persistenceWarning.acknowledged, true);
  assert.equal(response.data.persistenceWarning.reason, 'storage-save-failed');
  assert.equal(response.data.persistenceWarning.occurredAt, TODAY_DAY);
});

test('P2 U9 worker twin: no-op acknowledge when no warning present', () => {
  const engine = createServerSpellingEngine({
    now: () => TODAY_MS,
    random: () => 0.5,
  });
  const subjectRecord = { ui: null, data: { progress: {}, guardian: {} } };
  const response = engine.apply({
    learnerId: 'learner-a',
    subjectRecord,
    command: 'acknowledge-persistence-warning',
    payload: {},
  });
  assert.equal(response.ok, true);
  assert.equal(response.data.persistenceWarning, undefined);
});

// ---- Mega-never-revoked invariant on storage failure -----------------------

test('P2 U9 Mega-never-revoked: stage=4 preserved on storage failure', () => {
  const { service, repositories, storage } = makeServiceWithRepositories();
  seedAllCoreMega(repositories, 'learner-a', TODAY_DAY);
  const started = service.startSession('learner-a', { mode: 'guardian' });
  const currentSlug = started.state.session.currentSlug;
  storage.throwOnNextSet();
  service.submitAnswer('learner-a', started.state, started.state.session.currentCard.word.word);

  // Read progress through the platform layer — the stored stage must stay
  // at 4 (Mega) even though the guardian write failed. The warning is the
  // only observable side-effect the learner feels.
  const data = repositories.subjectStates.read('learner-a', 'spelling').data || {};
  assert.equal(data.progress?.[currentSlug]?.stage, 4,
    'progress.stage still 4 after storage-failure write');
});
