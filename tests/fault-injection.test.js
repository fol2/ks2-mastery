// U9 follow-up (review blocker-2 + major-1): node-level unit tests for the
// fault-injection middleware. These lock two invariants that the Playwright
// chaos suite relies on but cannot observe cheaply:
//
//   1. `once: true` fires exactly once per plan identity across repeated
//      matching requests. Without a registry, the middleware had no
//      across-request memory and 5 scenes silently mis-asserted.
//   2. The defence-in-depth env gate: without `KS2_TEST_HARNESS=1`
//      (or any of the other harness markers), the registry refuses to
//      honour a plan even when the per-request opt-in header is set.
//
// Both invariants live in `tests/helpers/fault-injection.mjs` so they
// run at the same speed as any other node:test file and never spin up a
// browser. The Playwright scenes are the end-to-end witness; these
// tests are the contract oracle the Playwright scenes depend on.

import test from 'node:test';
import assert from 'node:assert/strict';

import { __ks2_injectFault_TESTS_ONLY__ as faultInjection } from './helpers/fault-injection.mjs';

function makeRequest(plan, { pathname = '/api/bootstrap' } = {}) {
  const encoded = faultInjection.encodePlan(plan);
  return {
    url: pathname,
    pathname,
    headers: {
      [faultInjection.OPT_IN_HEADER]: faultInjection.OPT_IN_VALUE,
      [faultInjection.PLAN_HEADER]: encoded,
    },
  };
}

test('encodePlan round-trips through parseFaultPlan with planId preserved', () => {
  const plan = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'scene-5xx-bootstrap-1',
  };
  const request = makeRequest(plan);
  const parsed = faultInjection.parseFaultPlan(request);
  assert.ok(parsed, 'parseFaultPlan must accept a header-supplied plan with a planId');
  assert.equal(parsed.kind, plan.kind);
  assert.equal(parsed.pathPattern, plan.pathPattern);
  assert.equal(parsed.once, true);
  assert.equal(parsed.planId, plan.planId);
});

test('planIdentity derives a stable fallback from kind + pathPattern when planId is absent', () => {
  const plan = { kind: '429-rate-limited', pathPattern: '/api/bootstrap', once: true };
  assert.equal(faultInjection.planIdentity(plan), '429-rate-limited|/api/bootstrap');
});

test('planIdentity returns the supplied planId verbatim when provided', () => {
  const plan = { kind: '429-rate-limited', pathPattern: '/api/bootstrap', once: true, planId: 'custom' };
  assert.equal(faultInjection.planIdentity(plan), 'custom');
});

test('createFaultRegistry: once:true fires exactly once across three matching requests', () => {
  const registry = faultInjection.createFaultRegistry();
  const plan = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'chaos-500-once',
  };
  const request = { url: '/api/bootstrap', pathname: '/api/bootstrap', headers: {} };

  const first = registry.decide(plan, request);
  assert.equal(first.action, 'respond', 'first matching request must fire the fault');
  assert.equal(first.status, 500);

  const second = registry.decide(plan, request);
  assert.equal(second.action, 'forward', 'second matching request must fall through');

  const third = registry.decide(plan, request);
  assert.equal(third.action, 'forward', 'third matching request must also fall through');

  assert.equal(registry.size, 1, 'exactly one plan identity consumed');
});

test('createFaultRegistry: once:false fires on every matching request', () => {
  const registry = faultInjection.createFaultRegistry();
  const plan = {
    kind: '429-rate-limited',
    pathPattern: '/api/bootstrap',
    once: false,
  };
  const request = { url: '/api/bootstrap', pathname: '/api/bootstrap', headers: {} };

  for (let index = 0; index < 4; index += 1) {
    const decision = registry.decide(plan, request);
    assert.equal(decision.action, 'respond', `iteration ${index + 1} must still respond`);
    assert.equal(decision.status, 429);
  }
  assert.equal(registry.size, 0, 'non-once plans must not enter the consumption set');
});

test('createFaultRegistry: distinct planIds are consumed independently', () => {
  const registry = faultInjection.createFaultRegistry();
  const request = { url: '/api/bootstrap', pathname: '/api/bootstrap', headers: {} };
  const planA = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'alpha',
  };
  const planB = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'beta',
  };

  assert.equal(registry.decide(planA, request).action, 'respond');
  assert.equal(registry.decide(planA, request).action, 'forward');
  assert.equal(registry.decide(planB, request).action, 'respond');
  assert.equal(registry.decide(planB, request).action, 'forward');
  assert.equal(registry.size, 2);
});

test('createFaultRegistry: non-matching pathname does not consume a once plan', () => {
  const registry = faultInjection.createFaultRegistry();
  const plan = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'chaos-noop',
  };
  const unrelated = { url: '/api/tts', pathname: '/api/tts', headers: {} };
  const matching = { url: '/api/bootstrap', pathname: '/api/bootstrap', headers: {} };

  assert.equal(registry.decide(plan, unrelated).action, 'forward');
  assert.equal(registry.decide(plan, unrelated).action, 'forward');
  assert.equal(registry.size, 0, 'non-matching requests must not mark the plan as consumed');

  assert.equal(registry.decide(plan, matching).action, 'respond', 'first real match still fires');
  assert.equal(registry.decide(plan, matching).action, 'forward', 'second real match falls through');
});

test('createFaultRegistry.reset clears consumption state', () => {
  const registry = faultInjection.createFaultRegistry();
  const plan = {
    kind: '500-server-error',
    pathPattern: '/api/bootstrap',
    once: true,
    planId: 'resettable',
  };
  const request = { url: '/api/bootstrap', pathname: '/api/bootstrap', headers: {} };

  assert.equal(registry.decide(plan, request).action, 'respond');
  assert.equal(registry.decide(plan, request).action, 'forward');
  registry.reset();
  assert.equal(registry.size, 0);
  assert.equal(registry.decide(plan, request).action, 'respond', 'after reset the plan fires again');
});

test('isFaultInjectionAllowed: defence-in-depth env gate accepts known harness markers', () => {
  assert.equal(faultInjection.isFaultInjectionAllowed({ NODE_ENV: 'test' }), true);
  assert.equal(faultInjection.isFaultInjectionAllowed({ NODE_TEST_CONTEXT: 'child' }), true);
  assert.equal(faultInjection.isFaultInjectionAllowed({ PLAYWRIGHT_TEST: '1' }), true);
  assert.equal(faultInjection.isFaultInjectionAllowed({ KS2_TEST_HARNESS: '1' }), true);
});

test('isFaultInjectionAllowed: production-shaped env denies the gate', () => {
  assert.equal(faultInjection.isFaultInjectionAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(faultInjection.isFaultInjectionAllowed({}), false);
  // Truthy-but-wrong values never satisfy the gate. `KS2_TEST_HARNESS`
  // must be the literal string '1' to prove deliberate intent.
  assert.equal(faultInjection.isFaultInjectionAllowed({ KS2_TEST_HARNESS: 'true' }), false);
  assert.equal(faultInjection.isFaultInjectionAllowed({ PLAYWRIGHT_TEST: 'yes' }), false);
});
