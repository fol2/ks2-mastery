// P7-U9: unit tests for the `stall-punctuation-command` fault kind.
//
// These tests lock the contract that U11 depends on for pending/degraded
// navigation proof:
//
//   1. The `stall` action hangs for a configurable duration rather than
//      responding or forwarding immediately.
//   2. The fault kind is activatable via the existing base64 query param
//      and header transport — no new transport is required.
//   3. Without the opt-in header, the fault plan is ignored.
//   4. Malformed plans return null — no crash.
//   5. The `__ks2_injectFault_TESTS_ONLY__` forbidden-text token covers
//      this module (verified by the existing bundle-audit.test.js; this
//      file asserts the token is exported as a self-check).

import test from 'node:test';
import assert from 'node:assert/strict';

import { __ks2_injectFault_TESTS_ONLY__ as faultInjection } from './helpers/fault-injection.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(plan, { pathname = '/api/subjects/punctuation/command' } = {}) {
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

function makeRequestWithoutOptIn(plan, { pathname = '/api/subjects/punctuation/command' } = {}) {
  const encoded = faultInjection.encodePlan(plan);
  return {
    url: pathname,
    pathname,
    headers: {
      [faultInjection.PLAN_HEADER]: encoded,
    },
  };
}

// ---------------------------------------------------------------------------
// Test: stall-punctuation-command is a recognised FAULT_KIND
// ---------------------------------------------------------------------------

test('stall-punctuation-command is listed in FAULT_KINDS', () => {
  assert.ok(
    faultInjection.FAULT_KINDS.includes('stall-punctuation-command'),
    'FAULT_KINDS must include stall-punctuation-command',
  );
});

// ---------------------------------------------------------------------------
// Test: applyFault returns stall action with configurable duration
// ---------------------------------------------------------------------------

test('applyFault returns stall action with default 30s duration', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
  };
  const request = {
    url: '/api/subjects/punctuation/command',
    pathname: '/api/subjects/punctuation/command',
  };
  const decision = faultInjection.applyFault(plan, request);
  assert.equal(decision.action, 'stall', 'action must be stall');
  assert.equal(decision.durationMs, 30_000, 'default duration must be 30 000 ms');
});

test('applyFault returns stall action with custom durationMs from plan', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
    durationMs: 5000,
  };
  const request = {
    url: '/api/subjects/punctuation/command',
    pathname: '/api/subjects/punctuation/command',
  };
  const decision = faultInjection.applyFault(plan, request);
  assert.equal(decision.action, 'stall');
  assert.equal(decision.durationMs, 5000, 'custom durationMs must be honoured');
});

// ---------------------------------------------------------------------------
// Test: fault hook activatable via existing base64 query param transport
// ---------------------------------------------------------------------------

test('stall plan round-trips through encodePlan/parseFaultPlan with durationMs preserved', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: true,
    planId: 'stall-scene-1',
    durationMs: 2000,
  };
  const request = makeRequest(plan);
  const parsed = faultInjection.parseFaultPlan(request);
  assert.ok(parsed, 'parseFaultPlan must accept a stall-punctuation-command plan');
  assert.equal(parsed.kind, 'stall-punctuation-command');
  assert.equal(parsed.pathPattern, '/api/subjects/punctuation/command');
  assert.equal(parsed.once, true);
  assert.equal(parsed.planId, 'stall-scene-1');
  assert.equal(parsed.durationMs, 2000, 'durationMs must survive the encode/decode round-trip');
});

test('stall plan decodable from base64 query param transport', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
    durationMs: 3000,
  };
  const encoded = faultInjection.encodePlan(plan);
  const request = {
    url: `/api/subjects/punctuation/command?${faultInjection.PLAN_QUERY_PARAM}=${encoded}`,
    headers: {
      [faultInjection.OPT_IN_HEADER]: faultInjection.OPT_IN_VALUE,
    },
  };
  const parsed = faultInjection.parseFaultPlan(request);
  assert.ok(parsed, 'parseFaultPlan must decode stall plan from query param');
  assert.equal(parsed.kind, 'stall-punctuation-command');
  assert.equal(parsed.durationMs, 3000);
});

// ---------------------------------------------------------------------------
// Test: fault hook without opt-in header is ignored (no stall)
// ---------------------------------------------------------------------------

test('stall plan without opt-in header returns null from parseFaultPlan', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
  };
  const request = makeRequestWithoutOptIn(plan);
  const parsed = faultInjection.parseFaultPlan(request);
  assert.equal(parsed, null, 'plan must be ignored when opt-in header is absent');
});

// ---------------------------------------------------------------------------
// Test: malformed fault plan returns null (no crash)
// ---------------------------------------------------------------------------

test('malformed base64 plan returns null from decodePlan', () => {
  assert.equal(faultInjection.decodePlan('not-valid-base64!!!'), null);
});

test('plan with unknown kind returns null from decodePlan', () => {
  const encoded = Buffer.from(JSON.stringify({
    kind: 'unknown-kind',
    pathPattern: '/api/test',
  }), 'utf8').toString('base64');
  assert.equal(faultInjection.decodePlan(encoded), null);
});

test('plan missing pathPattern returns null from decodePlan', () => {
  const encoded = Buffer.from(JSON.stringify({
    kind: 'stall-punctuation-command',
  }), 'utf8').toString('base64');
  assert.equal(faultInjection.decodePlan(encoded), null);
});

test('null/undefined/empty input to decodePlan returns null', () => {
  assert.equal(faultInjection.decodePlan(null), null);
  assert.equal(faultInjection.decodePlan(undefined), null);
  assert.equal(faultInjection.decodePlan(''), null);
  assert.equal(faultInjection.decodePlan(42), null);
});

// ---------------------------------------------------------------------------
// Test: stall action in the fault registry (once: true fires once)
// ---------------------------------------------------------------------------

test('createFaultRegistry: stall-punctuation-command once:true fires once then forwards', () => {
  const registry = faultInjection.createFaultRegistry();
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: true,
    planId: 'stall-once-test',
    durationMs: 100,
  };
  const request = {
    url: '/api/subjects/punctuation/command',
    pathname: '/api/subjects/punctuation/command',
    headers: {},
  };

  const first = registry.decide(plan, request);
  assert.equal(first.action, 'stall', 'first matching request must produce stall');
  assert.equal(first.durationMs, 100);

  const second = registry.decide(plan, request);
  assert.equal(second.action, 'forward', 'second matching request must fall through');

  assert.equal(registry.size, 1, 'exactly one plan identity consumed');
});

// ---------------------------------------------------------------------------
// Test: stall does not match non-matching pathnames
// ---------------------------------------------------------------------------

test('stall plan does not fire for non-matching pathname', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
  };
  const request = {
    url: '/api/bootstrap',
    pathname: '/api/bootstrap',
  };
  const decision = faultInjection.applyFault(plan, request);
  assert.equal(decision.action, 'forward', 'non-matching pathname must forward');
});

// ---------------------------------------------------------------------------
// Test: __ks2_injectFault_TESTS_ONLY__ token is present (bundle audit)
// ---------------------------------------------------------------------------

test('__ks2_injectFault_TESTS_ONLY__ export is present and includes stall kind', () => {
  assert.ok(
    typeof faultInjection === 'object' && faultInjection !== null,
    '__ks2_injectFault_TESTS_ONLY__ must be an object',
  );
  assert.ok(
    faultInjection.FAULT_KINDS.includes('stall-punctuation-command'),
    'the forbidden-text-guarded export must include the new stall kind',
  );
});

// ---------------------------------------------------------------------------
// Test: durationMs defaults correctly when omitted or non-numeric
// ---------------------------------------------------------------------------

test('applyFault uses default 30s when durationMs is not a number', () => {
  const plan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    once: false,
    durationMs: 'not-a-number',
  };
  const request = {
    url: '/api/subjects/punctuation/command',
    pathname: '/api/subjects/punctuation/command',
  };
  const decision = faultInjection.applyFault(plan, request);
  assert.equal(decision.durationMs, 30_000, 'non-numeric durationMs must fall back to 30 000 ms');
});

test('decodePlan omits durationMs when the field is not a finite number', () => {
  const encoded = Buffer.from(JSON.stringify({
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    durationMs: 'bad',
  }), 'utf8').toString('base64');
  const decoded = faultInjection.decodePlan(encoded);
  assert.ok(decoded, 'plan must decode successfully');
  assert.equal(decoded.durationMs, undefined, 'non-numeric durationMs must be omitted from decoded plan');
});

test('decodePlan preserves durationMs when the field is a finite number', () => {
  const encoded = Buffer.from(JSON.stringify({
    kind: 'stall-punctuation-command',
    pathPattern: '/api/subjects/punctuation/command',
    durationMs: 7500,
  }), 'utf8').toString('base64');
  const decoded = faultInjection.decodePlan(encoded);
  assert.ok(decoded);
  assert.equal(decoded.durationMs, 7500);
});

// ---------------------------------------------------------------------------
// Test: stall is fundamentally different from timeout (408 immediate)
// ---------------------------------------------------------------------------

test('timeout returns immediate 408 respond; stall returns a stall action', () => {
  const stallPlan = {
    kind: 'stall-punctuation-command',
    pathPattern: '/api/test',
    once: false,
  };
  const timeoutPlan = {
    kind: 'timeout',
    pathPattern: '/api/test',
    once: false,
  };
  const request = { url: '/api/test', pathname: '/api/test' };

  const stallDecision = faultInjection.applyFault(stallPlan, request);
  const timeoutDecision = faultInjection.applyFault(timeoutPlan, request);

  assert.equal(stallDecision.action, 'stall', 'stall-punctuation-command must produce stall action');
  assert.equal(timeoutDecision.action, 'respond', 'timeout must produce respond action');
  assert.equal(timeoutDecision.status, 408, 'timeout must return 408 status');
  assert.notEqual(stallDecision.action, timeoutDecision.action, 'stall and timeout actions must differ');
});
