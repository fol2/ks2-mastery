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
import { installMemoryStorage } from './helpers/memory-storage.js';

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
