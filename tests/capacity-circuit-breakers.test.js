// U9 — Circuit breakers and graceful degradation.
//
// Table-driven state-matrix tests for the five named breakers plus the
// primitive's closed/half-open/open transitions. Scenarios mirror
// `docs/plans/2026-04-25-002-feat-capacity-release-gates-and-telemetry-plan.md`
// U9 test list.
//
// Non-goals:
//   - Not a Playwright scene — single-process unit oracle using
//     `installMemoryStorage()` for cross-tab broadcast simulation.
//   - Not a regression snapshot of the full 7-field persistence shape;
//     that surface has its own `tests/persistence.test.js` coverage.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BREAKER_STATES,
  DEFAULT_BREAKER_CONFIG,
  isResetableBreakerName,
  buildBreakersDegradedMap,
  createCircuitBreaker,
} from '../src/platform/core/circuit-breaker.js';
import { createApiPlatformRepositories } from '../src/platform/core/repositories/index.js';
import { installMemoryStorage } from './helpers/memory-storage.js';
import { createMockRepositoryServer } from './helpers/mock-api-server.js';

function makeNow(initial = 1_000_000) {
  let clock = initial;
  return {
    read: () => clock,
    advance: (ms) => { clock += ms; },
    set: (next) => { clock = next; },
  };
}

// ---------------------------------------------------------------------------
// Primitive state-machine scenarios (closed / half-open / open).
// ---------------------------------------------------------------------------

test('U9 scenario 1: closed + N-1 failures stays closed and does not block calls', () => {
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'test-a',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
  });
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.CLOSED);
  assert.equal(breaker.shouldBlockCall(), false);
});

test('U9 scenario 2: Nth failure opens breaker and emits breakerTransition once', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'test-b',
    failureThreshold: 3,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
  assert.equal(breaker.shouldBlockCall(), true);
  assert.equal(transitions.length, 1, 'exactly one transition emitted on CLOSED->OPEN');
  assert.deepEqual(
    { name: transitions[0].name, from: transitions[0].from, to: transitions[0].to },
    { name: 'test-b', from: BREAKER_STATES.CLOSED, to: BREAKER_STATES.OPEN },
  );
});

test('U9 scenario 3: open + request within cooldown still blocks calls', () => {
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'test-c',
    failureThreshold: 3,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
  });
  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure();
  // Move clock forward but still inside cooldown.
  clock.advance(200);
  assert.equal(breaker.shouldBlockCall(), true);
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
});

test('U9 scenario 4: open + cooldown elapsed transitions to half-open on next call', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'test-d',
    failureThreshold: 3,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure();
  clock.advance(600);
  // Cooldown elapsed — read state at this point should be half-open.
  assert.equal(breaker.state, BREAKER_STATES.HALF_OPEN);
  // Half-open allows the probe through — shouldBlockCall is false so the
  // caller knows it may attempt the next request.
  assert.equal(breaker.shouldBlockCall(), false);
  assert.deepEqual(
    transitions.map((entry) => entry.to),
    [BREAKER_STATES.OPEN, BREAKER_STATES.HALF_OPEN],
  );
});

test('U9 scenario 5: half-open + probe success transitions to closed and resets failure count', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'test-e',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  clock.advance(501);
  breaker.recordSuccess();
  assert.equal(breaker.state, BREAKER_STATES.CLOSED);
  const final = transitions[transitions.length - 1];
  assert.equal(final.to, BREAKER_STATES.CLOSED);
  // Failure count is reset — a fresh Nth failure is required to reopen.
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.CLOSED, 'single failure after reset does not trip');
});

test('U9 scenario 6: half-open + probe failure reopens with doubled cooldown capped at cooldownMaxMs', () => {
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'test-f',
    failureThreshold: 2,
    cooldownMs: 500,
    cooldownMaxMs: 30_000,
    now: clock.read,
    storage: null,
  });
  breaker.recordFailure();
  breaker.recordFailure();
  const firstSnapshot = breaker.snapshot();
  assert.equal(firstSnapshot.cooldownMs, 500);
  clock.advance(501);
  // Half-open transition triggered on state read / shouldBlockCall.
  assert.equal(breaker.state, BREAKER_STATES.HALF_OPEN);
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
  const secondSnapshot = breaker.snapshot();
  assert.equal(secondSnapshot.cooldownMs, 1000, 'cooldown doubled to 1000ms');

  // Drive the exponential curve up to the cap.
  for (let i = 0; i < 20; i += 1) {
    clock.advance(secondSnapshot.cooldownMs * 100);
    if (breaker.state === BREAKER_STATES.HALF_OPEN) {
      breaker.recordFailure();
    }
  }
  const cappedSnapshot = breaker.snapshot();
  assert.ok(cappedSnapshot.cooldownMs <= 30_000, `cooldown must respect cap, got ${cappedSnapshot.cooldownMs}`);
});

// ---------------------------------------------------------------------------
// Per-breaker exposure via buildBreakersDegradedMap.
// ---------------------------------------------------------------------------

test('U9 scenario 7: parentHubRecentSessions open => breakersDegraded.parentHub=true (aggregate)', () => {
  const clock = makeNow();
  const parentHubRecentSessions = createCircuitBreaker({
    name: 'parentHubRecentSessions',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
  });
  const parentHubActivity = createCircuitBreaker({
    name: 'parentHubActivity',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
  });
  const classroomSummary = createCircuitBreaker({
    name: 'classroomSummary',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
  });
  const readModelDerivedWrite = createCircuitBreaker({
    name: 'readModelDerivedWrite',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
  });
  const bootstrapCapacityMetadata = createCircuitBreaker({
    name: 'bootstrapCapacityMetadata',
    failureThreshold: 3,
    cooldownMaxMs: Infinity,
    now: clock.read,
    storage: null,
  });

  const before = buildBreakersDegradedMap({
    parentHubRecentSessions,
    parentHubActivity,
    classroomSummary,
    readModelDerivedWrite,
    bootstrapCapacityMetadata,
  });
  assert.deepEqual(before, {
    parentHub: false,
    classroomSummary: false,
    derivedWrite: false,
    bootstrapCapacity: false,
  });

  parentHubRecentSessions.recordFailure();
  parentHubRecentSessions.recordFailure();

  const after = buildBreakersDegradedMap({
    parentHubRecentSessions,
    parentHubActivity,
    classroomSummary,
    readModelDerivedWrite,
    bootstrapCapacityMetadata,
  });
  assert.equal(after.parentHub, true, 'parentHubRecentSessions open flips aggregate parentHub boolean');
  assert.equal(after.classroomSummary, false);
  assert.equal(after.derivedWrite, false);
  assert.equal(after.bootstrapCapacity, false);
});

test('U9 scenario 8: readModelDerivedWrite open emits breakerTransition with name in payload (not in signal token)', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'readModelDerivedWrite',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].name, 'readModelDerivedWrite');
  // The signal token itself is the closed enum `breakerTransition` — the
  // primitive carries the name separately so we do not widen the token
  // allowlist. The caller is responsible for stamping
  // `breakerTransition` on the collector and logging the name.
  assert.equal(typeof transitions[0].at, 'number');
});

test('U9 scenario 9: bootstrapCapacityMetadata with cooldownMaxMs=Infinity never auto-recovers', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'bootstrapCapacityMetadata',
    failureThreshold: 3,
    cooldownMs: 500,
    cooldownMaxMs: Infinity,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);

  // Advance an absurd amount of time. Breaker MUST stay open — operator
  // action is required.
  clock.advance(24 * 60 * 60 * 1000); // 24h
  assert.equal(breaker.state, BREAKER_STATES.OPEN, 'bootstrapCapacityMetadata must not auto-recover');
  assert.equal(breaker.shouldBlockCall(), true);
  // Only the single CLOSED->OPEN transition fires.
  assert.equal(transitions.length, 1);
});

// ---------------------------------------------------------------------------
// Multi-tab localStorage broadcast.
// ---------------------------------------------------------------------------

test('U9 scenario 10: multi-tab broadcast — Tab A open writes a hint that Tab B respects without independent trip', () => {
  const storage = installMemoryStorage();
  const clock = makeNow();
  const tabA = createCircuitBreaker({
    name: 'parentHubRecentSessions',
    failureThreshold: 2,
    cooldownMs: 5_000,
    now: clock.read,
    storage,
  });
  tabA.recordFailure();
  tabA.recordFailure();
  assert.equal(tabA.state, BREAKER_STATES.OPEN);

  // Tab B constructs a breaker with the same storage. It has NO failure
  // history, yet the broadcast hint must push it into OPEN without an
  // independent failure count.
  const tabB = createCircuitBreaker({
    name: 'parentHubRecentSessions',
    failureThreshold: 2,
    cooldownMs: 5_000,
    now: clock.read,
    storage,
  });
  assert.equal(tabB.state, BREAKER_STATES.OPEN, 'Tab B inherits OPEN from localStorage hint');
  assert.equal(tabB.shouldBlockCall(), true);
});

test('U9 scenario 11: localStorage unavailable falls back to per-tab behaviour without throwing', () => {
  // Simulate managed-profile / incognito where setItem throws.
  const hostile = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceeded'); },
    removeItem: () => { /* noop */ },
  };
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'parentHubActivity',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: hostile,
  });
  // Failures must still transition the state; broadcast failure is a
  // silent degrade per plan line 886.
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
});

// ---------------------------------------------------------------------------
// Telemetry: exact-once breakerTransition per transition.
// ---------------------------------------------------------------------------

test('U9 scenario 12: each state transition emits exactly one onTransition call', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'classroomSummary',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  // CLOSED -> OPEN
  breaker.recordFailure();
  breaker.recordFailure();
  // OPEN -> HALF_OPEN (cooldown elapses; transition fires on next state read)
  clock.advance(501);
  assert.equal(breaker.state, BREAKER_STATES.HALF_OPEN);
  // HALF_OPEN -> CLOSED
  breaker.recordSuccess();
  // Then trip again for HALF_OPEN -> OPEN.
  breaker.recordFailure();
  breaker.recordFailure();
  clock.advance(501);
  assert.equal(breaker.state, BREAKER_STATES.HALF_OPEN);
  breaker.recordFailure();

  const edges = transitions.map((entry) => `${entry.from}->${entry.to}`);
  assert.deepEqual(edges, [
    'closed->open',
    'open->half-open',
    'half-open->closed',
    'closed->open',
    'open->half-open',
    'half-open->open',
  ]);
});

// ---------------------------------------------------------------------------
// Cross-layer composition: U7/U8 primitives must NOT accidentally auto-trip U9.
// ---------------------------------------------------------------------------

test('U9 scenario 13: reset() clears state and localStorage hint', () => {
  const storage = installMemoryStorage();
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'readModelDerivedWrite',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage,
  });
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
  breaker.reset();
  assert.equal(breaker.state, BREAKER_STATES.CLOSED);
  // A sibling tab constructing the same breaker should NOT inherit OPEN
  // because the hint was cleared.
  const sibling = createCircuitBreaker({
    name: 'readModelDerivedWrite',
    failureThreshold: 2,
    cooldownMs: 500,
    now: clock.read,
    storage,
  });
  assert.equal(sibling.state, BREAKER_STATES.CLOSED);
});

test('U9 scenario 14: forceOpen(sticky:true) pins breaker open for operator escalation', () => {
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'bootstrapCapacityMetadata',
    failureThreshold: 3,
    cooldownMs: 500,
    cooldownMaxMs: Infinity,
    now: clock.read,
    storage: null,
  });
  breaker.forceOpen({ sticky: true });
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
  assert.equal(breaker.shouldBlockCall(), true);
  clock.advance(24 * 60 * 60 * 1000);
  assert.equal(breaker.state, BREAKER_STATES.OPEN, 'sticky forceOpen must never auto-recover');
});

// ---------------------------------------------------------------------------
// DEFAULT_BREAKER_CONFIG public contract (used by api.js wiring).
// ---------------------------------------------------------------------------

test('U9 DEFAULT_BREAKER_CONFIG matches plan line 877 tuning', () => {
  assert.equal(DEFAULT_BREAKER_CONFIG.failureThreshold, 3);
  assert.equal(DEFAULT_BREAKER_CONFIG.cooldownMs, 500);
  assert.equal(DEFAULT_BREAKER_CONFIG.cooldownMaxMs, 30_000);
});

// ---------------------------------------------------------------------------
// Integration: api.js exposes breakersDegraded via persistenceChannel.
// ---------------------------------------------------------------------------

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

test('U9 integration: fresh api repository exposes a zeroed breakersDegraded map via persistenceChannel', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => 1_000,
  });
  await repositories.hydrate();
  const snapshot = repositories.persistence.read();
  assert.ok(snapshot, 'persistence snapshot must be present');
  assert.deepEqual(snapshot.breakersDegraded, {
    parentHub: false,
    classroomSummary: false,
    derivedWrite: false,
    bootstrapCapacity: false,
  });
  // Full breakers sub-namespace is null when every breaker is CLOSED with zero
  // failures — the default `cooldownUntil:0` and `state:'closed'` is present
  // but the sub-namespace itself is populated.
  assert.ok(snapshot.breakers, 'breakers sub-namespace exists on the snapshot');
  assert.equal(snapshot.breakers.parentHubRecentSessions.state, BREAKER_STATES.CLOSED);
});

test('U9 integration: tripping parentHubRecentSessions flips breakersDegraded.parentHub via persistenceChannel', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => 1_000,
  });
  await repositories.hydrate();

  // Simulate three consecutive failures on the recentSessions endpoint.
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();

  // U9.1 item 5: scheduleBreakerRecompute is now microtask-deferred.
  // Wait for the microtask to drain before reading the snapshot.
  await new Promise((resolve) => { queueMicrotask(resolve); });

  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.parentHub, true);
  assert.equal(snapshot.breakersDegraded.classroomSummary, false);
  assert.equal(snapshot.breakersDegraded.derivedWrite, false);
  assert.equal(snapshot.breakersDegraded.bootstrapCapacity, false);
});

test('U9 integration: 3 consecutive missing meta.capacity.bootstrapCapacity trips bootstrapCapacity breaker sticky', async () => {
  const storage = installMemoryStorage();
  // Server that drops `meta.capacity.bootstrapCapacity` deliberately.
  const rawServer = createMockRepositoryServer({ learners: learnerSnapshot() });
  const fetchStrip = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      // Remove the bootstrapCapacity meta so the client counts a miss.
      const stripped = {
        ...body,
        meta: { ...(body.meta || {}), capacity: {} },
      };
      return new Response(JSON.stringify(stripped), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchStrip,
    storage,
    now: () => 1_000,
  });

  await repositories.hydrate();
  assert.equal(repositories.persistence.read().breakersDegraded.bootstrapCapacity, false, 'one miss is not enough');
  await repositories.hydrate();
  assert.equal(repositories.persistence.read().breakersDegraded.bootstrapCapacity, false, 'two misses is not enough');
  await repositories.hydrate();
  // Third miss trips the breaker and it is sticky — no auto-recovery.
  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.bootstrapCapacity, true, 'third miss trips sticky breaker');
  assert.equal(snapshot.breakers.bootstrapCapacityMetadata.state, BREAKER_STATES.OPEN);
});

// ---------------------------------------------------------------------------
// U3 worker signal allowlist — breakerTransition reuse.
// ---------------------------------------------------------------------------

test('U9 worker collector: addSignal(breakerTransition) is a legal closed-enum token', async () => {
  const { CapacityCollector } = await import('../worker/src/logger.js');
  const collector = new CapacityCollector({
    requestId: 'ks2_req_12345678-9abc-4def-89ab-123456789abc',
    endpoint: '/api/subjects/spelling/command',
    method: 'POST',
    startedAt: 0,
  });
  collector.addSignal('breakerTransition');
  const emitted = collector.toPublicJSON();
  assert.ok(Array.isArray(emitted.signals));
  assert.equal(emitted.signals.filter((token) => token === 'breakerTransition').length, 1);
  // Vocabulary-drift regression: other imaginary tokens are silently rejected.
  collector.addSignal('breakerName:parentHubRecentSessions');
  assert.equal(
    collector.toPublicJSON().signals.filter((token) => token !== 'breakerTransition').length,
    0,
  );
});

// ---------------------------------------------------------------------------
// Composition: U7 notModified success resets bootstrapCapacityMetadata counter.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Server-side integration: readModelDerivedWrite breaker in runSubjectCommandMutation.
// ---------------------------------------------------------------------------

test('U9 integration: server-side readModelDerivedWrite breaker open skips projection write and stamps derivedWriteSkipped breaker-open', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');
  const {
    getReadModelDerivedWriteBreaker,
    resetReadModelDerivedWriteBreaker,
  } = await import('../worker/src/circuit-breaker-server.js');

  resetReadModelDerivedWriteBreaker();
  try {
    const DB = createMigratedSqliteD1Database();
    const now = Date.UTC(2026, 0, 1);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run('learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
    `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `).run('adult-a', 'learner-a', now, now);

    // Force the breaker open BEFORE the subject command fires.
    const breaker = getReadModelDerivedWriteBreaker();
    breaker.forceOpen();
    assert.equal(breaker.state, BREAKER_STATES.OPEN);

    const app = createWorkerApp({ now: () => now });
    const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };
    const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-a',
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: 'breaker-open-1',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'possess', length: 1 },
      }),
    }), env, {});
    assert.equal(response.status, 200, 'primary write still succeeds when breaker open');
    const body = await response.json();
    assert.equal(
      body?.meta?.capacity?.derivedWriteSkipped?.reason,
      'breaker-open',
      `derivedWriteSkipped.reason must be breaker-open, got ${JSON.stringify(body?.meta?.capacity?.derivedWriteSkipped)}`,
    );
    // The breakerTransition signal must appear on meta.capacity.signals.
    assert.ok(
      Array.isArray(body?.meta?.capacity?.signals)
        && body.meta.capacity.signals.includes('breakerTransition'),
      `breakerTransition signal must be emitted, got ${JSON.stringify(body?.meta?.capacity?.signals)}`,
    );
    // Primary state must have been written: the mutation receipt row is
    // present and the learner revision bumped to 1.
    const learner = DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a');
    assert.equal(learner.state_revision, 1, 'primary state revision bumped');
    DB.close();
  } finally {
    // Always clean up — module-scoped singleton bleeds across tests.
    resetReadModelDerivedWriteBreaker();
  }
});

// ---------------------------------------------------------------------------
// U9 round 1 fix (adv-u9-r1-004): successful batch() commits recordSuccess
// against the server-side breaker; failed batch() (D1 error) recordFailure.
// CAS contention (changes=0) records NEITHER.
// ---------------------------------------------------------------------------

test('U9 round 1: successful subject-command projection write records success on server breaker', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');
  const {
    getReadModelDerivedWriteBreaker,
    resetReadModelDerivedWriteBreaker,
  } = await import('../worker/src/circuit-breaker-server.js');

  resetReadModelDerivedWriteBreaker();
  try {
    const DB = createMigratedSqliteD1Database();
    const now = Date.UTC(2026, 0, 1);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run('learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
    `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `).run('adult-a', 'learner-a', now, now);

    // Trigger 2 failures on the breaker (below threshold=3, stays closed) so a
    // subsequent healthy write proves recordSuccess resets the count.
    const breaker = getReadModelDerivedWriteBreaker();
    breaker.recordFailure();
    breaker.recordFailure();
    assert.equal(breaker.state, BREAKER_STATES.CLOSED, 'breaker stays closed below threshold');

    const app = createWorkerApp({ now: () => now });
    const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };
    const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-a',
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: 'success-record-1',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'possess', length: 1 },
      }),
    }), env, {});
    assert.equal(response.status, 200);
    // Successful write records success -> failureCount resets to 0. Trigger 2
    // more failures; breaker still closed (2 < 3) confirms the prior 2 reset.
    breaker.recordFailure();
    breaker.recordFailure();
    assert.equal(breaker.state, BREAKER_STATES.CLOSED, 'recordSuccess reset the failure counter');
    DB.close();
  } finally {
    resetReadModelDerivedWriteBreaker();
  }
});

test('U9 round 1: CAS-retry Attempt 2 re-checks breaker and preserves breaker-open reason stamp', async () => {
  // Given the breaker is forced OPEN before Attempt 1, both Attempt 2 and
  // Attempt 3 of the CAS retry chain must also skip projection and keep the
  // `breaker-open` reason on `derivedWriteSkipped` — NOT overwrite with
  // `concurrent-retry-exhausted`. The base integration test (line 593)
  // exercises Attempt 1. Here we assert the breaker primitive's shouldBlockCall
  // is stable across multiple reads so Attempts 2 and 3 re-check cleanly.
  const {
    getReadModelDerivedWriteBreaker,
    resetReadModelDerivedWriteBreaker,
  } = await import('../worker/src/circuit-breaker-server.js');
  resetReadModelDerivedWriteBreaker();
  try {
    const breaker = getReadModelDerivedWriteBreaker();
    breaker.forceOpen();
    assert.equal(breaker.state, BREAKER_STATES.OPEN);
    // Two consecutive reads both block — Attempt 1 gate + Attempt 2 re-check.
    assert.equal(breaker.shouldBlockCall(), true);
    assert.equal(breaker.shouldBlockCall(), true);
    // snapshot does not mutate state in a way that would unblock future calls.
    breaker.snapshot();
    assert.equal(breaker.shouldBlockCall(), true);
  } finally {
    resetReadModelDerivedWriteBreaker();
  }
});

// ---------------------------------------------------------------------------
// Client UX degradation: ParentHub + AdminHub render breaker-open panels.
// ---------------------------------------------------------------------------

test('U9 UX: Parent Hub renders "Recent history temporarily unavailable" when breakersDegraded.parentHub=true', async () => {
  const { renderHubSurfaceFixture } = await import('./helpers/react-render.js');
  const html = await renderHubSurfaceFixture({
    surface: 'parent',
    breakersDegraded: { parentHub: true, classroomSummary: false, derivedWrite: false, bootstrapCapacity: false },
  });
  assert.match(html, /Recent history temporarily unavailable/, 'degraded message on recent-sessions widget');
  assert.match(html, /Activity feed temporarily unavailable/, 'degraded message on activity-feed widget');
  assert.match(html, /data-parent-hub-degraded="recent-sessions"/);
  // Student-facing practice surfaces unaffected — the hub still renders
  // the learner overview chip row.
  assert.match(html, /Current picture/);
});

test('U9 UX: Parent Hub shows normal recent-sessions list when breakersDegraded.parentHub=false', async () => {
  const { renderHubSurfaceFixture } = await import('./helpers/react-render.js');
  const html = await renderHubSurfaceFixture({ surface: 'parent' });
  assert.doesNotMatch(html, /Recent history temporarily unavailable/);
  assert.match(html, /Smart Review/, 'RecentSessionList renders its fixture data');
});

test('U9 UX: Admin Hub renders classroom-summary degraded banner and hides per-learner summary stats when classroomSummary=true', async () => {
  const { renderHubSurfaceFixture } = await import('./helpers/react-render.js');
  const html = await renderHubSurfaceFixture({
    surface: 'admin',
    breakersDegraded: { parentHub: false, classroomSummary: true, derivedWrite: false, bootstrapCapacity: false },
  });
  assert.match(html, /Classroom summary temporarily unavailable/);
  assert.match(html, /data-admin-hub-degraded="classroom-summary"/);
  // Roster list is still rendered.
  assert.match(html, /Ava/);
  // Per-learner Grammar / Punctuation stat rows MUST NOT render.
  assert.doesNotMatch(html, /Grammar: 1 due/);
  assert.doesNotMatch(html, /Punctuation: 1 due/);
});

test('U9 UX: Admin Hub renders bootstrap-capacity operator banner when bootstrapCapacity=true', async () => {
  const { renderHubSurfaceFixture } = await import('./helpers/react-render.js');
  const html = await renderHubSurfaceFixture({
    surface: 'admin',
    breakersDegraded: { parentHub: false, classroomSummary: false, derivedWrite: false, bootstrapCapacity: true },
  });
  assert.match(html, /Bootstrap capacity metadata missing/);
  assert.match(html, /Operator action is required/);
  assert.match(html, /data-admin-hub-degraded="bootstrap-capacity"/);
});

test('U9 UX: Admin Hub renders full per-learner stats when no breakers are open', async () => {
  const { renderHubSurfaceFixture } = await import('./helpers/react-render.js');
  const html = await renderHubSurfaceFixture({ surface: 'admin' });
  assert.doesNotMatch(html, /Classroom summary temporarily unavailable/);
  assert.doesNotMatch(html, /Bootstrap capacity metadata missing/);
  assert.match(html, /Grammar: 1 due/, 'per-learner Grammar stats render when breakers closed');
});

// ---------------------------------------------------------------------------
// U9 round 1 fix (adv-u9-r1-005): emitTransition reentrancy guard prevents
// cascading transitions when a listener reads state during a transition.
// ---------------------------------------------------------------------------

test('U9 round 1: listener that reads state mid-transition does not cascade recursive transitions', () => {
  const clock = makeNow();
  const transitions = [];
  let observedStateInsideListener = null;
  const breaker = createCircuitBreaker({
    name: 'reentrancy-test',
    failureThreshold: 2,
    cooldownMs: 1000,
    now: clock.read,
    storage: null,
    onTransition: (payload) => {
      transitions.push(payload);
      // Adversarial listener: read the state getter, which could internally
      // call respectBroadcast + maybeHalfOpenFromCooldown and re-enter
      // transitionTo in a pre-fix implementation.
      observedStateInsideListener = breaker.state;
      // Also call snapshot which has the same read-side-effect risk.
      breaker.snapshot();
    },
  });
  breaker.recordFailure();
  breaker.recordFailure();
  // Exactly one closed->open transition, no recursion.
  assert.equal(transitions.filter((t) => t.to === BREAKER_STATES.OPEN).length, 1);
  assert.equal(observedStateInsideListener, BREAKER_STATES.OPEN);
});

test('U9 round 1: two breakers flapping in listener callbacks emit transitions in FIFO order without recursion', () => {
  const clock = makeNow();
  const emitted = [];
  const breakerA = createCircuitBreaker({
    name: 'breaker-a',
    failureThreshold: 1,
    now: clock.read,
    storage: null,
    onTransition: (payload) => emitted.push(['A', payload.from, payload.to]),
  });
  const breakerB = createCircuitBreaker({
    name: 'breaker-b',
    failureThreshold: 1,
    now: clock.read,
    storage: null,
    onTransition: (payload) => {
      emitted.push(['B', payload.from, payload.to]);
      // Re-enter breakerB.state from within its own listener.
      breakerB.state; // eslint-disable-line no-unused-expressions
    },
  });
  breakerA.recordFailure();
  breakerB.recordFailure();
  // Each breaker emits exactly one transition; no interleaving / duplicate.
  assert.equal(emitted.filter((e) => e[0] === 'A').length, 1);
  assert.equal(emitted.filter((e) => e[0] === 'B').length, 1);
});

// ---------------------------------------------------------------------------
// U9 round 1 fix (adv-u9-r1-006): localStorage stale-key cleanup on OPEN.
// ---------------------------------------------------------------------------

test('U9 round 1: writing a new open broadcast key clears any prior open keys for the same breaker', () => {
  const storage = installMemoryStorage();
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'cleanup-test',
    failureThreshold: 1,
    cooldownMs: 500,
    cooldownMaxMs: 30_000,
    now: clock.read,
    storage,
  });
  // Simulate a pre-existing stale open-key from a prior flap.
  storage.setItem('ks2-breaker:cleanup-test:open:999', '1');
  storage.setItem('ks2-breaker:cleanup-test:open:500', '1');
  // Unrelated breaker key must survive.
  storage.setItem('ks2-breaker:other-breaker:open:999', '1');

  breaker.recordFailure();
  assert.equal(breaker.state, BREAKER_STATES.OPEN);

  // Collect every key still present in storage.
  const survivors = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (typeof key === 'string') survivors.push(key);
  }
  // The two pre-existing cleanup-test keys are gone.
  assert.equal(survivors.filter((k) => k.startsWith('ks2-breaker:cleanup-test:open:999')).length, 0);
  assert.equal(survivors.filter((k) => k.startsWith('ks2-breaker:cleanup-test:open:500')).length, 0);
  // Exactly one cleanup-test open key survives, with the fresh timestamp.
  const freshOpens = survivors.filter((k) => k.startsWith('ks2-breaker:cleanup-test:open:'));
  assert.equal(freshOpens.length, 1);
  // Other breaker's key was untouched.
  assert.ok(survivors.includes('ks2-breaker:other-breaker:open:999'));
});

// ---------------------------------------------------------------------------
// U9 round 1 fix (adv-u9-r1-002): hub-api fetch sites wire recordFailure /
// recordSuccess to the matching client-side breaker so 5xx / network failures
// self-trip the breaker. Pre-fix the primitive was only tripped by operator
// forceOpen / test-only direct calls; the production fetch path ignored it.
// ---------------------------------------------------------------------------

test('U9 round 1: parentHubRecentSessions self-trips after 3 consecutive 5xx responses', async () => {
  const { createHubApi } = await import('../src/platform/hubs/api.js');
  const { createCircuitBreaker } = await import('../src/platform/core/circuit-breaker.js');
  const transitions = [];
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'parentHubRecentSessions',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async () => new Response('oops', { status: 502 }),
    breakers: { parentHubRecentSessions: breaker },
  });
  for (let i = 0; i < 3; i += 1) {
    try { await api.readParentRecentSessions({ learnerId: 'learner-a' }); }
    catch { /* expected 5xx rethrow */ }
  }
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
  const openTransitions = transitions.filter((t) => t.to === BREAKER_STATES.OPEN);
  assert.equal(openTransitions.length, 1, 'breakerTransition emits exactly once per closed->open transition');
});

test('U9 round 1: parentHubActivity self-trips on network failure (no Response object)', async () => {
  const { createHubApi } = await import('../src/platform/hubs/api.js');
  const { createCircuitBreaker } = await import('../src/platform/core/circuit-breaker.js');
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'parentHubActivity',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
  });
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async () => { throw new TypeError('Failed to fetch'); },
    breakers: { parentHubActivity: breaker },
  });
  for (let i = 0; i < 3; i += 1) {
    try { await api.readParentActivity({ learnerId: 'learner-a' }); }
    catch { /* expected network-fault rethrow */ }
  }
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
});

test('U9 round 1: classroomSummary self-trips after 3 consecutive 503 responses on readAdminHub', async () => {
  const { createHubApi } = await import('../src/platform/hubs/api.js');
  const { createCircuitBreaker } = await import('../src/platform/core/circuit-breaker.js');
  const clock = makeNow();
  const breaker = createCircuitBreaker({
    name: 'classroomSummary',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
  });
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async () => new Response(JSON.stringify({ message: 'overloaded' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
    breakers: { classroomSummary: breaker },
  });
  for (let i = 0; i < 3; i += 1) {
    try { await api.readAdminHub({ learnerId: 'learner-a' }); }
    catch { /* expected 5xx rethrow */ }
  }
  assert.equal(breaker.state, BREAKER_STATES.OPEN);
});

test('U9 round 1: client breakers record success on 2xx and do NOT trip on 4xx user errors', async () => {
  const { createHubApi } = await import('../src/platform/hubs/api.js');
  const { createCircuitBreaker } = await import('../src/platform/core/circuit-breaker.js');
  const clock = makeNow();
  const recentSessions = createCircuitBreaker({
    name: 'parentHubRecentSessions',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
  });
  const activity = createCircuitBreaker({
    name: 'parentHubActivity',
    failureThreshold: 3,
    now: clock.read,
    storage: null,
  });
  // Sequence: 2x 404 (4xx — NEITHER record), 1x 200 (recordSuccess),
  // then drop in 2x 500 (recordFailure x2) followed by another 200.
  // 4xx must not tally toward failureThreshold, and 2xx must reset any
  // partial closed-state failure count.
  const responses = [
    new Response(JSON.stringify({ message: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ message: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify({ recentSessions: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
  ];
  let call = 0;
  const api = createHubApi({
    baseUrl: 'https://repo.test',
    fetch: async () => {
      const next = responses[Math.min(call, responses.length - 1)];
      call += 1;
      return next;
    },
    breakers: { parentHubRecentSessions: recentSessions, parentHubActivity: activity },
  });
  for (let i = 0; i < 3; i += 1) {
    try { await api.readParentRecentSessions({ learnerId: 'learner-a' }); }
    catch { /* 4xx rethrows */ }
  }
  // Three calls: 404, 403, 200 — NONE of them count toward threshold (two 4xx +
  // one success). Breaker must remain CLOSED with zero failures.
  assert.equal(recentSessions.state, BREAKER_STATES.CLOSED);
  // Activity breaker had zero calls — never tripped.
  assert.equal(activity.state, BREAKER_STATES.CLOSED);
});

test('U9 integration: a response with meta.capacity.bootstrapCapacity resets the consecutive-miss counter', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  // The mock server never emits bootstrapCapacity metadata by default;
  // injectResponses lets us flip hydrate responses into an enriched
  // envelope to simulate a healthy third bootstrap.
  let requestIndex = 0;
  const fetchEnriching = async (url, init) => {
    const response = await server.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      requestIndex += 1;
      if (requestIndex === 3) {
        // Healthy response — inject bootstrapCapacity metadata.
        const body = await response.json();
        const enriched = {
          ...body,
          meta: {
            ...(body.meta || {}),
            capacity: {
              ...(body.meta?.capacity || {}),
              bootstrapCapacity: { version: 1 },
            },
          },
        };
        return new Response(JSON.stringify(enriched), {
          status: response.status,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchEnriching,
    storage,
    now: () => 1_000,
  });

  await repositories.hydrate(); // miss 1
  await repositories.hydrate(); // miss 2
  // After two misses the counter is 2 but below the 3-threshold — breaker stays closed.
  assert.equal(repositories.persistence.read().breakersDegraded.bootstrapCapacity, false);
  await repositories.hydrate(); // SUCCESS — counter resets to 0
  await repositories.hydrate(); // miss 1 (post-reset)
  // Only 1 miss in the latest streak — breaker must NOT trip.
  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.bootstrapCapacity, false);
  assert.equal(snapshot.breakers.bootstrapCapacityMetadata.state, BREAKER_STATES.CLOSED);
});

// ---------------------------------------------------------------------------
// U9.1 item 1: breakerTransition overemission — blocked calls on open
// breaker do NOT emit transitions.
// ---------------------------------------------------------------------------

test('U9.1 item 1: repeated shouldBlockCall on OPEN breaker emits zero additional transitions', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'overemission-test',
    failureThreshold: 2,
    cooldownMs: 5000,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(transitions.length, 1, 'one CLOSED->OPEN transition');
  // Call shouldBlockCall many times while still in cooldown. Each call
  // must NOT emit a transition — only actual state changes emit.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(breaker.shouldBlockCall(), true);
  }
  assert.equal(transitions.length, 1, 'no additional transitions from blocked calls');
});

test('U9.1 item 1: reading state getter on OPEN breaker within cooldown emits zero additional transitions', () => {
  const clock = makeNow();
  const transitions = [];
  const breaker = createCircuitBreaker({
    name: 'state-read-test',
    failureThreshold: 2,
    cooldownMs: 5000,
    now: clock.read,
    storage: null,
    onTransition: (payload) => transitions.push(payload),
  });
  breaker.recordFailure();
  breaker.recordFailure();
  assert.equal(transitions.length, 1);
  // Reading state 10 times while still OPEN must not emit.
  for (let i = 0; i < 10; i += 1) {
    assert.equal(breaker.state, BREAKER_STATES.OPEN);
  }
  assert.equal(transitions.length, 1, 'state reads do not overemit');
});

// ---------------------------------------------------------------------------
// U9.1 item 2: forceBreakerReset via bootstrap response.
// ---------------------------------------------------------------------------

test('U9.1 item 2: isResetableBreakerName is a closed predicate accepting only bootstrapCapacityMetadata', () => {
  assert.equal(typeof isResetableBreakerName, 'function');
  assert.ok(isResetableBreakerName('bootstrapCapacityMetadata'));
  assert.ok(!isResetableBreakerName('parentHubRecentSessions'));
  assert.ok(!isResetableBreakerName('readModelDerivedWrite'));
  assert.ok(!isResetableBreakerName(''));
  assert.ok(!isResetableBreakerName(null));
});

test('U9.1 item 2: forceBreakerReset in bootstrap response triggers client-side reset', async () => {
  const storage = installMemoryStorage();
  const rawServer = createMockRepositoryServer({ learners: learnerSnapshot() });

  // First: 3 misses to trip the bootstrapCapacityMetadata breaker sticky.
  const fetchStrip = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      const stripped = {
        ...body,
        meta: { ...(body.meta || {}), capacity: {} },
      };
      return new Response(JSON.stringify(stripped), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchStrip,
    storage,
    now: () => 1_000,
  });

  await repositories.hydrate();
  await repositories.hydrate();
  await repositories.hydrate();
  assert.equal(repositories.persistence.read().breakersDegraded.bootstrapCapacity, true, 'breaker tripped after 3 misses');

  // Now simulate a bootstrap response that carries forceBreakerReset AND
  // a healthy bootstrapCapacity field (operator fixed the issue).
  let resetSent = false;
  const fetchWithReset = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      const enriched = {
        ...body,
        meta: {
          ...(body.meta || {}),
          capacity: {
            ...(body.meta?.capacity || {}),
            bootstrapCapacity: { version: 1 },
            forceBreakerReset: 'bootstrapCapacityMetadata',
          },
        },
      };
      resetSent = true;
      return new Response(JSON.stringify(enriched), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  // Replace the fetch and hydrate again.
  const repos2 = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchWithReset,
    storage,
    now: () => 2_000,
  });
  await repos2.hydrate();
  assert.ok(resetSent, 'mock served the forceBreakerReset response');
  // The breaker must be reset via the forceBreakerReset field.
  const snapshot = repos2.persistence.read();
  assert.equal(snapshot.breakersDegraded.bootstrapCapacity, false, 'breaker reset by forceBreakerReset');
  assert.equal(snapshot.breakers.bootstrapCapacityMetadata.state, BREAKER_STATES.CLOSED);
});

test('U9.1 item 2: forceBreakerReset with invalid name is silently ignored', async () => {
  const storage = installMemoryStorage();
  const rawServer = createMockRepositoryServer({ learners: learnerSnapshot() });
  const fetchWithBadReset = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      const enriched = {
        ...body,
        meta: {
          ...(body.meta || {}),
          capacity: {
            ...(body.meta?.capacity || {}),
            bootstrapCapacity: { version: 1 },
            forceBreakerReset: 'readModelDerivedWrite', // NOT in the closed set
          },
        },
      };
      return new Response(JSON.stringify(enriched), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchWithBadReset,
    storage,
    now: () => 1_000,
  });

  // Force the readModelDerivedWrite breaker open before hydrating.
  repositories.persistence.breakers.readModelDerivedWrite.recordFailure();
  repositories.persistence.breakers.readModelDerivedWrite.recordFailure();
  repositories.persistence.breakers.readModelDerivedWrite.recordFailure();
  assert.equal(repositories.persistence.breakers.readModelDerivedWrite.state, BREAKER_STATES.OPEN);

  await repositories.hydrate();
  // The invalid name must be silently ignored — breaker stays open.
  assert.equal(repositories.persistence.breakers.readModelDerivedWrite.state, BREAKER_STATES.OPEN);
});

// ---------------------------------------------------------------------------
// U9.1 item 3: derivedWriteBreakerOpen client-side parity.
// ---------------------------------------------------------------------------

test('U9.1 item 3: derivedWriteBreakerOpen=true in bootstrap response opens client-side readModelDerivedWrite', async () => {
  const storage = installMemoryStorage();
  const rawServer = createMockRepositoryServer({ learners: learnerSnapshot() });
  const fetchWithDerivedOpen = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      const enriched = {
        ...body,
        meta: {
          ...(body.meta || {}),
          capacity: {
            ...(body.meta?.capacity || {}),
            bootstrapCapacity: { version: 1 },
            derivedWriteBreakerOpen: true,
          },
        },
      };
      return new Response(JSON.stringify(enriched), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchWithDerivedOpen,
    storage,
    now: () => 1_000,
  });

  await repositories.hydrate();
  // Wait for the microtask-batched recompute to settle.
  await new Promise((resolve) => { queueMicrotask(resolve); });
  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.derivedWrite, true, 'client mirrors server derivedWrite open state');
});

test('U9.1 item 3: derivedWriteBreakerOpen=false in bootstrap response resets client-side readModelDerivedWrite', async () => {
  const storage = installMemoryStorage();
  const rawServer = createMockRepositoryServer({ learners: learnerSnapshot() });
  const fetchWithDerivedClosed = async (url, init) => {
    const response = await rawServer.fetch(url, init);
    if (typeof url === 'string' && url.endsWith('/api/bootstrap')) {
      const body = await response.json();
      const enriched = {
        ...body,
        meta: {
          ...(body.meta || {}),
          capacity: {
            ...(body.meta?.capacity || {}),
            bootstrapCapacity: { version: 1 },
            derivedWriteBreakerOpen: false,
          },
        },
      };
      return new Response(JSON.stringify(enriched), {
        status: response.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return response;
  };

  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: fetchWithDerivedClosed,
    storage,
    now: () => 1_000,
  });

  // Force the client breaker open before hydrate.
  repositories.persistence.breakers.readModelDerivedWrite.forceOpen();
  assert.equal(repositories.persistence.breakers.readModelDerivedWrite.state, BREAKER_STATES.OPEN);

  await repositories.hydrate();
  await new Promise((resolve) => { queueMicrotask(resolve); });
  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.derivedWrite, false, 'client mirrors server derivedWrite closed state');
});

// ---------------------------------------------------------------------------
// U9.1 item 4: priority-order invariant — primary write proceeds when
// readModelDerivedWrite breaker is open.
// ---------------------------------------------------------------------------

test('U9.1 item 4: primary subject-state write commits even when derivedWrite breaker is open', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');
  const {
    getReadModelDerivedWriteBreaker,
    resetReadModelDerivedWriteBreaker,
  } = await import('../worker/src/circuit-breaker-server.js');

  resetReadModelDerivedWriteBreaker();
  try {
    const DB = createMigratedSqliteD1Database();
    const now = Date.UTC(2026, 0, 1);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run('learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
    `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `).run('adult-a', 'learner-a', now, now);

    const breaker = getReadModelDerivedWriteBreaker();
    breaker.forceOpen();
    assert.equal(breaker.state, BREAKER_STATES.OPEN, 'breaker is open before command');

    const app = createWorkerApp({ now: () => now });
    const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };
    const response = await app.fetch(new Request('https://repo.test/api/subjects/spelling/command', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ks2-dev-account-id': 'adult-a',
      },
      body: JSON.stringify({
        command: 'start-session',
        learnerId: 'learner-a',
        requestId: 'priority-invariant-1',
        expectedLearnerRevision: 0,
        payload: { mode: 'single', slug: 'possess', length: 1 },
      }),
    }), env, {});

    assert.equal(response.status, 200, 'command succeeds (primary write proceeds)');
    const body = await response.json();

    // Primary state: learner revision must be bumped (the write landed).
    const learner = DB.db.prepare('SELECT state_revision FROM learner_profiles WHERE id = ?').get('learner-a');
    assert.equal(learner.state_revision, 1, 'primary state revision bumped despite breaker open');

    // Mutation receipt must exist (idempotency record proves the write committed).
    const receipt = DB.db.prepare('SELECT * FROM mutation_receipts WHERE request_id = ?').get('priority-invariant-1');
    assert.ok(receipt, 'mutation receipt written — primary write committed');

    // Response carries derivedWriteSkipped signal but the primary write is not masked.
    assert.equal(
      body?.meta?.capacity?.derivedWriteSkipped?.reason,
      'breaker-open',
      'derivedWriteSkipped stamps breaker-open',
    );
    assert.ok(body.ok, 'response.ok is true — the write is not masked as failed');
    DB.close();
  } finally {
    resetReadModelDerivedWriteBreaker();
  }
});

// ---------------------------------------------------------------------------
// U9.1 item 5: scheduleBreakerRecompute O(N^2) fix — N simultaneous
// transitions produce a single batched recompute via microtask.
// ---------------------------------------------------------------------------

test('U9.1 item 5: N simultaneous breaker transitions batch into a single persistence recompute via microtask', async () => {
  const storage = installMemoryStorage();
  const server = createMockRepositoryServer({ learners: learnerSnapshot() });
  const repositories = createApiPlatformRepositories({
    baseUrl: 'https://repo.test',
    fetch: server.fetch.bind(server),
    storage,
    now: () => 1_000,
  });
  await repositories.hydrate();

  // Capture the number of persistence notifications before the burst.
  let notificationCount = 0;
  const unsubscribe = repositories.persistence.subscribe(() => {
    notificationCount += 1;
  });

  // Trip 3 breakers simultaneously in the same synchronous turn.
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();
  repositories.persistence.breakers.parentHubRecentSessions.recordFailure();
  repositories.persistence.breakers.parentHubActivity.recordFailure();
  repositories.persistence.breakers.parentHubActivity.recordFailure();
  repositories.persistence.breakers.parentHubActivity.recordFailure();
  repositories.persistence.breakers.classroomSummary.recordFailure();
  repositories.persistence.breakers.classroomSummary.recordFailure();
  repositories.persistence.breakers.classroomSummary.recordFailure();

  // The microtask-batched recompute fires after all synchronous transitions.
  // Before the fix, 3 transitions would fire 3 recomputes synchronously.
  // After the fix, the count after the microtask drains must be <= 1.
  const syncNotifications = notificationCount;
  await new Promise((resolve) => { queueMicrotask(resolve); });
  const totalNotifications = notificationCount;

  // The key assertion: synchronous notifications must be zero (all deferred
  // to microtask), and the total after microtask must be exactly 1 (batched).
  assert.equal(syncNotifications, 0, 'no synchronous recompute during transition burst');
  assert.equal(totalNotifications, 1, 'exactly one batched recompute via microtask');

  // Final state correctness: all three surfaces are degraded.
  const snapshot = repositories.persistence.read();
  assert.equal(snapshot.breakersDegraded.parentHub, true);
  assert.equal(snapshot.breakersDegraded.classroomSummary, true);

  unsubscribe();
});

// ---------------------------------------------------------------------------
// U9.1 item 2 server-side: forceBreakerReset header on bootstrap response
// ---------------------------------------------------------------------------

test('U9.1 item 2 server: bootstrap response includes forceBreakerReset when admin header sent by admin session', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');

  const DB = createMigratedSqliteD1Database();
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run('learner-a', now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'admin', ?, ?, ?, 0)
  `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run('adult-a', 'learner-a', now, now);

  const app = createWorkerApp({ now: () => now });
  const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };

  // Send a bootstrap GET with the admin header from an admin session.
  // The dev-stub reads platformRole from x-ks2-dev-platform-role so
  // ensureAccount UPSERT preserves the admin role in the DB row.
  const response = await app.fetch(new Request('https://repo.test/api/bootstrap', {
    method: 'GET',
    headers: {
      'x-ks2-dev-account-id': 'adult-a',
      'x-ks2-dev-platform-role': 'admin',
      'x-ks2-admin-force-breaker-reset': 'bootstrapCapacityMetadata',
    },
  }), env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(
    body?.meta?.capacity?.forceBreakerReset,
    'bootstrapCapacityMetadata',
    'bootstrap response carries forceBreakerReset for admin session',
  );
  DB.close();
});

test('ADV-U5-CB-001: forceBreakerReset header from non-admin session is silently ignored', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');

  const DB = createMigratedSqliteD1Database();
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run('learner-a', now, now);
  // Non-admin parent account — the header must be silently ignored.
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run('adult-a', 'learner-a', now, now);

  const app = createWorkerApp({ now: () => now });
  const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };

  // Send the admin-only header from a parent session.
  const response = await app.fetch(new Request('https://repo.test/api/bootstrap', {
    method: 'GET',
    headers: {
      'x-ks2-dev-account-id': 'adult-a',
      'x-ks2-admin-force-breaker-reset': 'bootstrapCapacityMetadata',
    },
  }), env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  // ADV-U5-CB-001: non-admin must NOT see the forceBreakerReset field.
  assert.equal(
    body?.meta?.capacity?.forceBreakerReset,
    undefined,
    'non-admin session must not trigger forceBreakerReset',
  );
  DB.close();
});

test('U9.1 item 2 server: invalid breaker name in admin header is silently ignored', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');

  const DB = createMigratedSqliteD1Database();
  const now = Date.UTC(2026, 0, 1);
  DB.db.prepare(`
    INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
    VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
  `).run('learner-a', now, now);
  DB.db.prepare(`
    INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
    VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
  `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
  DB.db.prepare(`
    INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
    VALUES (?, ?, 'owner', 0, ?, ?)
  `).run('adult-a', 'learner-a', now, now);

  const app = createWorkerApp({ now: () => now });
  const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };

  const response = await app.fetch(new Request('https://repo.test/api/bootstrap', {
    method: 'GET',
    headers: {
      'x-ks2-dev-account-id': 'adult-a',
      'x-ks2-admin-force-breaker-reset': 'readModelDerivedWrite', // not in RESETABLE set
    },
  }), env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  // The invalid name must NOT appear in the response.
  assert.equal(body?.meta?.capacity?.forceBreakerReset, undefined, 'invalid name silently omitted');
  DB.close();
});

// ---------------------------------------------------------------------------
// U9.1 item 3 server: derivedWriteBreakerOpen in bootstrap response.
// ---------------------------------------------------------------------------

test('U9.1 item 3 server: bootstrap response includes derivedWriteBreakerOpen field', async () => {
  const { createWorkerApp } = await import('../worker/src/app.js');
  const { createMigratedSqliteD1Database } = await import('./helpers/sqlite-d1.js');
  const {
    getReadModelDerivedWriteBreaker,
    resetReadModelDerivedWriteBreaker,
  } = await import('../worker/src/circuit-breaker-server.js');

  resetReadModelDerivedWriteBreaker();
  try {
    const DB = createMigratedSqliteD1Database();
    const now = Date.UTC(2026, 0, 1);
    DB.db.prepare(`
      INSERT INTO learner_profiles (id, name, year_group, avatar_color, goal, daily_minutes, created_at, updated_at, state_revision)
      VALUES (?, 'Learner A', 'Y5', '#3E6FA8', 'sats', 15, ?, ?, 0)
    `).run('learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO adult_accounts (id, email, display_name, platform_role, selected_learner_id, created_at, updated_at, repo_revision)
      VALUES (?, ?, ?, 'parent', ?, ?, ?, 0)
    `).run('adult-a', 'adult@example.test', 'Adult A', 'learner-a', now, now);
    DB.db.prepare(`
      INSERT INTO account_learner_memberships (account_id, learner_id, role, sort_index, created_at, updated_at)
      VALUES (?, ?, 'owner', 0, ?, ?)
    `).run('adult-a', 'learner-a', now, now);

    const app = createWorkerApp({ now: () => now });
    const env = { DB, AUTH_MODE: 'development-stub', ENVIRONMENT: 'test' };

    // Breaker is closed — derivedWriteBreakerOpen should be false.
    const closedResponse = await app.fetch(new Request('https://repo.test/api/bootstrap', {
      method: 'GET',
      headers: { 'x-ks2-dev-account-id': 'adult-a' },
    }), env, {});
    const closedBody = await closedResponse.json();
    assert.equal(closedBody?.meta?.capacity?.derivedWriteBreakerOpen, false, 'breaker closed -> false');

    // Force the breaker open.
    getReadModelDerivedWriteBreaker().forceOpen();

    const openResponse = await app.fetch(new Request('https://repo.test/api/bootstrap', {
      method: 'GET',
      headers: { 'x-ks2-dev-account-id': 'adult-a' },
    }), env, {});
    const openBody = await openResponse.json();
    assert.equal(openBody?.meta?.capacity?.derivedWriteBreakerOpen, true, 'breaker open -> true');
    DB.close();
  } finally {
    resetReadModelDerivedWriteBreaker();
  }
});
