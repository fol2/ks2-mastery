// P1.5 Phase A (U2) tests — auto-refresh cascade after a successful
// admin-ops mutation.
//
// `runAdminOpsRefreshCascade` is a pure function that takes a small object
// of refresh callbacks and orchestrates their sequential, fail-fast
// invocation. These tests verify:
//   - Happy path — KPI then activity both fire in order, both succeed.
//   - includeErrorEvents=true runs error-events first so the chips update
//     before KPI re-reads.
//   - Fail-fast: KPI returns { ok: false, reason: 'error' } → activity is
//     NOT called, cascade returns stopped='kpi'.
//   - Non-error non-ok (e.g. reason='suppressed-dirty' from the metadata
//     panel) is NOT a cascade failure — the next step still fires. That
//     keeps the flush-on-clean pattern intact.
//   - Superseded / no-hub are likewise treated as soft — cascade continues.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runAdminOpsRefreshCascade } from '../src/platform/hubs/admin-refresh-cascade.js';

function tracker(result) {
  const calls = [];
  const fn = async () => {
    calls.push(Date.now());
    return result;
  };
  return { fn, calls };
}

test('cascade runs KPI then activity on happy path', async () => {
  const kpi = tracker({ ok: true });
  const activity = tracker({ ok: true });
  const errorEvents = tracker({ ok: true });
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: kpi.fn,
    refreshActivity: activity.fn,
    refreshErrorEvents: errorEvents.fn,
  });
  assert.equal(result.ok, true);
  assert.equal(kpi.calls.length, 1);
  assert.equal(activity.calls.length, 1);
  // Default: error-events not invoked (error-event status transition path
  // sets includeErrorEvents=true explicitly).
  assert.equal(errorEvents.calls.length, 0);
});

test('cascade with includeErrorEvents fires error-events BEFORE KPI and activity', async () => {
  const order = [];
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: async () => { order.push('kpi'); return { ok: true }; },
    refreshActivity: async () => { order.push('activity'); return { ok: true }; },
    refreshErrorEvents: async () => { order.push('error-events'); return { ok: true }; },
  }, { includeErrorEvents: true });
  assert.equal(result.ok, true);
  assert.deepEqual(order, ['error-events', 'kpi', 'activity']);
});

test('cascade is fail-fast: KPI error suppresses the activity refresh', async () => {
  const kpi = tracker({ ok: false, reason: 'error', error: new Error('boom') });
  const activity = tracker({ ok: true });
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: kpi.fn,
    refreshActivity: activity.fn,
  });
  assert.equal(result.ok, false);
  assert.equal(result.stopped, 'kpi');
  assert.equal(activity.calls.length, 0, 'activity is suppressed after a KPI error');
});

test('cascade is fail-fast: error-events error suppresses KPI and activity when includeErrorEvents=true', async () => {
  const kpi = tracker({ ok: true });
  const activity = tracker({ ok: true });
  const errorEvents = tracker({ ok: false, reason: 'error', error: new Error('boom') });
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: kpi.fn,
    refreshActivity: activity.fn,
    refreshErrorEvents: errorEvents.fn,
  }, { includeErrorEvents: true });
  assert.equal(result.ok, false);
  assert.equal(result.stopped, 'errorEvents');
  assert.equal(kpi.calls.length, 0);
  assert.equal(activity.calls.length, 0);
});

test('cascade treats suppressed-dirty as soft — next step still fires', async () => {
  const kpi = tracker({ ok: false, reason: 'suppressed-dirty' });
  const activity = tracker({ ok: true });
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: kpi.fn,
    refreshActivity: activity.fn,
  });
  // The cascade only breaks on a hard error — `suppressed-dirty` just
  // means that step opted out. The chain continues so the activity panel
  // gets its update even if KPI is gated on dirty state.
  assert.equal(result.ok, true);
  assert.equal(activity.calls.length, 1);
});

test('cascade treats superseded as soft', async () => {
  const kpi = tracker({ ok: false, reason: 'superseded' });
  const activity = tracker({ ok: true });
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: kpi.fn,
    refreshActivity: activity.fn,
  });
  assert.equal(result.ok, true);
  assert.equal(activity.calls.length, 1);
});

test('cascade tolerates a missing refreshErrorEvents when includeErrorEvents is false', async () => {
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: async () => ({ ok: true }),
    refreshActivity: async () => ({ ok: true }),
  });
  assert.equal(result.ok, true);
});

test('cascade never invokes a refreshAccountsMetadata hook even if present in the config object', async () => {
  // T4 coverage: the metadata panel is deliberately excluded from the
  // mutation-success cascade because its own state is already current
  // from the optimistic in-row patch (or the flush-on-clean suppression
  // rule picks up any missed refresh). Asserting structural absence
  // guards against a later refactor silently wiring metadata into the
  // cascade and re-opening the ghost-refresh bug that U2 addressed.
  const calls = [];
  const result = await runAdminOpsRefreshCascade({
    refreshKpi: async () => { calls.push('kpi'); return { ok: true }; },
    refreshActivity: async () => { calls.push('activity'); return { ok: true }; },
    // Attached defensively even though the helper should not see it —
    // `runAdminOpsRefreshCascade` pulls only the three documented
    // keys. A future helper addition of a metadata step must land with
    // its own explicit opt-in switch; this test pins the contract.
    refreshAccountsMetadata: async () => { calls.push('accounts-metadata'); return { ok: true }; },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['kpi', 'activity']);
});
