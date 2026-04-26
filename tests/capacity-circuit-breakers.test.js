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
