// Phase D / U15 + T-Block-2 (Phase D reviewer) coverage: integration-style
// test for the `handleSave` closure. Per the Phase D resolver plan we use
// the pure-function extraction route (NOT JSDOM) — the production
// `handleSave` delegates every branch to `decideAccountOpsSave`, so
// asserting that helper exercises the same decision surface.
//
// Contract under test:
// 1. `opsStatus === 'active'` or unchanged → no confirm call, dispatch fires.
// 2. `opsStatus === 'suspended'` + confirm returns true → dispatch fires
//    with the canonical `account-ops-metadata-save` envelope.
// 3. `opsStatus === 'suspended'` + confirm returns false → dispatch NOT called.
// 4. `opsStatus === 'payment_hold'` + confirm returns false → dispatch NOT called.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import { decideAccountOpsSave } from '../src/platform/hubs/admin-ops-confirm.js';

function draftOf(overrides = {}) {
  return {
    opsStatus: 'active',
    planLabel: '',
    tagsText: '',
    internalNotes: '',
    ...overrides,
  };
}

function accountOf(overrides = {}) {
  return {
    accountId: 'adult-abcdef123456',
    opsStatus: 'active',
    ...overrides,
  };
}

test('handleSave — opsStatus unchanged (active) bypasses confirm and dispatches', () => {
  let confirmCalls = 0;
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'active' }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => { confirmCalls += 1; return false; },
  });
  assert.equal(confirmCalls, 0);
  assert.equal(result.shouldDispatch, true);
  assert.equal(result.dispatchArgs.action, 'account-ops-metadata-save');
  assert.equal(result.dispatchArgs.data.accountId, 'adult-abcdef123456');
  assert.equal(result.dispatchArgs.data.patch.opsStatus, 'active');
});

test('handleSave — opsStatus unchanged (suspended) bypasses confirm and dispatches', () => {
  // The confirm gate only fires when opsStatus DIFFERS from the current
  // account value AND is non-active. Leaving a suspended account on
  // suspended simply saves a tags/notes edit without prompting.
  let confirmCalls = 0;
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'suspended', tagsText: 'billing' }),
    account: accountOf({ opsStatus: 'suspended' }),
    confirmOpsStatusChange: () => { confirmCalls += 1; return false; },
  });
  assert.equal(confirmCalls, 0);
  assert.equal(result.shouldDispatch, true);
  assert.deepEqual(result.dispatchArgs.data.patch.tags, ['billing']);
});

test('handleSave — suspended + confirm returns true → dispatch fires with full envelope', () => {
  const seen = [];
  const result = decideAccountOpsSave({
    draft: draftOf({
      opsStatus: 'suspended',
      planLabel: '  priority  ',
      tagsText: 'alpha, beta, , , gamma',
      internalNotes: '  note text  ',
    }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: (id, next) => { seen.push({ id, next }); return true; },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].id, 'adult-abcdef123456');
  assert.equal(seen[0].next, 'suspended');
  assert.equal(result.shouldDispatch, true);
  assert.equal(result.dispatchArgs.action, 'account-ops-metadata-save');
  assert.equal(result.dispatchArgs.data.accountId, 'adult-abcdef123456');
  assert.equal(result.dispatchArgs.data.patch.opsStatus, 'suspended');
  assert.equal(result.dispatchArgs.data.patch.planLabel, 'priority');
  assert.deepEqual(result.dispatchArgs.data.patch.tags, ['alpha', 'beta', 'gamma']);
  assert.equal(result.dispatchArgs.data.patch.internalNotes, '  note text  ');
});

test('handleSave — suspended + confirm returns false → dispatch NOT called', () => {
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'suspended', tagsText: 'ignored' }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => false,
  });
  assert.equal(result.shouldDispatch, false);
  assert.equal(result.dispatchArgs, null);
});

test('handleSave — payment_hold + confirm returns false → dispatch NOT called', () => {
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'payment_hold' }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => false,
  });
  assert.equal(result.shouldDispatch, false);
  assert.equal(result.dispatchArgs, null);
});

test('handleSave — payment_hold + confirm returns true → dispatch fires', () => {
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'payment_hold' }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => true,
  });
  assert.equal(result.shouldDispatch, true);
  assert.equal(result.dispatchArgs.data.patch.opsStatus, 'payment_hold');
});

test('handleSave — coerces truthy/falsy confirm returns via Boolean()', () => {
  // Defence against a stub that returns a truthy-but-not-boolean value.
  for (const ok of [true, 1, 'yes', {}]) {
    const result = decideAccountOpsSave({
      draft: draftOf({ opsStatus: 'suspended' }),
      account: accountOf({ opsStatus: 'active' }),
      confirmOpsStatusChange: () => ok,
    });
    assert.equal(result.shouldDispatch, true);
  }
  for (const bad of [false, 0, '', null, undefined]) {
    const result = decideAccountOpsSave({
      draft: draftOf({ opsStatus: 'suspended' }),
      account: accountOf({ opsStatus: 'active' }),
      confirmOpsStatusChange: () => bad,
    });
    assert.equal(result.shouldDispatch, false);
  }
});

test('handleSave — internalNotes with interior whitespace preserved on dispatch', () => {
  // The production component dispatches `internalNotes` unchanged when it
  // contains non-blank content, preserving interior whitespace so the
  // admin can format bullet lists / line breaks. Only an all-whitespace
  // string collapses to null.
  const result = decideAccountOpsSave({
    draft: draftOf({
      opsStatus: 'suspended',
      internalNotes: '  line one\n  line two  ',
    }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => true,
  });
  assert.equal(result.shouldDispatch, true);
  assert.equal(result.dispatchArgs.data.patch.internalNotes, '  line one\n  line two  ');

  const empty = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'suspended', internalNotes: '   \t  ' }),
    account: accountOf({ opsStatus: 'active' }),
    confirmOpsStatusChange: () => true,
  });
  assert.equal(empty.dispatchArgs.data.patch.internalNotes, null);
});

test('handleSave — account.opsStatus missing defaults to active for the unchanged-guard', () => {
  // Fresh metadata row (no server row yet): existing ops_status is
  // effectively 'active'. Switching to suspended must still trigger
  // confirm.
  let called = false;
  const result = decideAccountOpsSave({
    draft: draftOf({ opsStatus: 'suspended' }),
    account: { accountId: 'adult-abcdef123456' }, // no opsStatus key
    confirmOpsStatusChange: () => { called = true; return true; },
  });
  assert.equal(called, true);
  assert.equal(result.shouldDispatch, true);
});
