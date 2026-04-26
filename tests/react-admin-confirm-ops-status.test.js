// Phase D / U15 + T-Block-2 (Phase D reviewer) coverage: the pure
// confirmation helpers extracted from `AdminHubSurface.jsx`. Tests every
// branch of `lastSixOfAccountId` + `defaultConfirmOpsStatusChange` without
// mounting React or JSDOM — the repo pattern is pure-function extraction
// + SSR for markup, and confirmation logic is pure.
//
// ADV-2 anchor: when `globalThis.prompt` is unavailable, the default MUST
// fail safe. Silently approving a destructive status change with no
// interactive confirmation defeats the whole guard.
//
// References: docs/plans/2026-04-25-005-refactor-admin-ops-console-p1-5-hardening-plan.md §U15

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  lastSixOfAccountId,
  defaultConfirmOpsStatusChange,
} from '../src/platform/hubs/admin-ops-confirm.js';

test('lastSixOfAccountId — long id returns the trailing 6 characters', () => {
  assert.equal(lastSixOfAccountId('adult-abcdef123456'), '123456');
});

test('lastSixOfAccountId — short id returns the whole string unchanged', () => {
  assert.equal(lastSixOfAccountId('abc'), 'abc');
});

test('lastSixOfAccountId — empty string returns empty', () => {
  assert.equal(lastSixOfAccountId(''), '');
});

test('lastSixOfAccountId — null / undefined / non-string returns empty', () => {
  assert.equal(lastSixOfAccountId(null), '');
  assert.equal(lastSixOfAccountId(undefined), '');
  assert.equal(lastSixOfAccountId(42), '');
  assert.equal(lastSixOfAccountId({ toString() { return 'hijack'; } }), '');
});

test("defaultConfirmOpsStatusChange — nextStatus='active' short-circuits true", () => {
  // Early return before `globalThis.prompt` is consulted. We verify by
  // temporarily deleting the prompt — the guard must still return true.
  const originalPrompt = globalThis.prompt;
  try {
    delete globalThis.prompt;
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'active'), true);
  } finally {
    if (originalPrompt !== undefined) globalThis.prompt = originalPrompt;
  }
});

test('defaultConfirmOpsStatusChange — trimmed last-6 match returns true', () => {
  const calls = [];
  globalThis.prompt = (message) => {
    calls.push(message);
    return '  123456  ';
  };
  try {
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'suspended'), true);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /123456/);
    assert.match(calls[0], /suspended/);
  } finally {
    delete globalThis.prompt;
  }
});

test('defaultConfirmOpsStatusChange — mismatched input returns false', () => {
  globalThis.prompt = () => 'not-the-last-six';
  try {
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'suspended'), false);
  } finally {
    delete globalThis.prompt;
  }
});

test('defaultConfirmOpsStatusChange — cancelled prompt (null) returns false', () => {
  globalThis.prompt = () => null;
  try {
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'suspended'), false);
  } finally {
    delete globalThis.prompt;
  }
});

test('defaultConfirmOpsStatusChange — ADV-2 missing prompt returns false (fail-safe)', () => {
  // When globalThis.prompt is not a function (SSR, headless harness, CSP
  // sandbox), the helper MUST return false. Returning true here would
  // silently approve every non-active status change.
  const original = globalThis.prompt;
  try {
    delete globalThis.prompt;
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'suspended'), false);
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'payment_hold'), false);
  } finally {
    if (original !== undefined) globalThis.prompt = original;
  }
});

test('defaultConfirmOpsStatusChange — prompt set but non-function returns false', () => {
  globalThis.prompt = 'not a function';
  try {
    assert.equal(defaultConfirmOpsStatusChange('adult-abcdef123456', 'suspended'), false);
  } finally {
    delete globalThis.prompt;
  }
});
