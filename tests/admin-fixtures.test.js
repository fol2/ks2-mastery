// P5 U5: Unit tests for admin Playwright fixture factories.
//
// Validates:
//   1. Shape correctness — all 7 bundle sections present with expected keys
//   2. Frozen state — Object.isFrozen on root and nested objects
//   3. No sensitive data leaks — no raw passwords, tokens, or cookie values
//   4. Role-specific contract — admin gets canExportJson, ops does not
//   5. Identifier masking in ops fixture — accounts + learner IDs masked

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAdminFixtureAccount,
  createOpsFixtureAccount,
} from './playwright/admin-fixtures.mjs';

// =================================================================
// Constants
// =================================================================

const EXPECTED_BUNDLE_SECTIONS = [
  'accountSummary',
  'linkedLearners',
  'recentErrors',
  'errorOccurrences',
  'recentDenials',
  'recentMutations',
  'capacityState',
];

const FORBIDDEN_KEYS = ['password', 'token', 'cookie', 'secret', 'authToken', 'sessionToken'];

// =================================================================
// Helpers
// =================================================================

function deepCollectKeys(obj, collected = new Set()) {
  if (!obj || typeof obj !== 'object') return collected;
  if (Array.isArray(obj)) {
    for (const item of obj) deepCollectKeys(item, collected);
    return collected;
  }
  for (const key of Object.keys(obj)) {
    collected.add(key);
    deepCollectKeys(obj[key], collected);
  }
  return collected;
}

function isFrozenDeep(obj) {
  if (!obj || typeof obj !== 'object') return true;
  if (!Object.isFrozen(obj)) return false;
  if (Array.isArray(obj)) {
    return obj.every((item) => isFrozenDeep(item));
  }
  return Object.values(obj).every((val) => isFrozenDeep(val));
}

// =================================================================
// 1. Admin fixture shape
// =================================================================

test('createAdminFixtureAccount returns all 7 bundle sections', () => {
  const fixture = createAdminFixtureAccount();
  assert.equal(fixture.ok, true);
  assert.equal(typeof fixture.bundle, 'object');

  for (const section of EXPECTED_BUNDLE_SECTIONS) {
    assert.ok(
      section in fixture.bundle,
      `Missing bundle section: ${section}`,
    );
    assert.ok(
      fixture.bundle[section] !== undefined,
      `Bundle section ${section} is undefined`,
    );
  }
});

test('createAdminFixtureAccount bundle sections have non-empty data', () => {
  const fixture = createAdminFixtureAccount();
  const { bundle } = fixture;

  assert.ok(bundle.accountSummary && typeof bundle.accountSummary === 'object');
  assert.ok(bundle.accountSummary.accountId.length > 0);
  assert.ok(bundle.accountSummary.email.length > 0);

  assert.ok(Array.isArray(bundle.linkedLearners) && bundle.linkedLearners.length > 0);
  assert.ok(Array.isArray(bundle.recentErrors) && bundle.recentErrors.length > 0);
  assert.ok(Array.isArray(bundle.errorOccurrences) && bundle.errorOccurrences.length > 0);
  assert.ok(Array.isArray(bundle.recentDenials) && bundle.recentDenials.length > 0);
  assert.ok(Array.isArray(bundle.recentMutations) && bundle.recentMutations.length > 0);
  assert.ok(Array.isArray(bundle.capacityState) && bundle.capacityState.length > 0);
});

test('createAdminFixtureAccount has valid timestamps', () => {
  const fixture = createAdminFixtureAccount();
  const { bundle } = fixture;

  assert.ok(Number.isFinite(bundle.generatedAt) && bundle.generatedAt > 0);
  assert.ok(Number.isFinite(bundle.query.timeFrom) && bundle.query.timeFrom > 0);
  assert.ok(Number.isFinite(bundle.query.timeTo) && bundle.query.timeTo > 0);
  assert.ok(bundle.query.timeTo > bundle.query.timeFrom);
});

// =================================================================
// 2. Frozen state
// =================================================================

test('createAdminFixtureAccount is deeply frozen', () => {
  const fixture = createAdminFixtureAccount();
  assert.ok(isFrozenDeep(fixture), 'Admin fixture must be deeply frozen');
});

test('createOpsFixtureAccount is deeply frozen', () => {
  const fixture = createOpsFixtureAccount();
  assert.ok(isFrozenDeep(fixture), 'Ops fixture must be deeply frozen');
});

// =================================================================
// 3. No sensitive data leaks
// =================================================================

test('admin fixture contains no forbidden sensitive keys', () => {
  const fixture = createAdminFixtureAccount();
  const allKeys = deepCollectKeys(fixture);

  for (const forbidden of FORBIDDEN_KEYS) {
    assert.ok(
      !allKeys.has(forbidden),
      `Admin fixture must not contain key: ${forbidden}`,
    );
  }
});

test('ops fixture contains no forbidden sensitive keys', () => {
  const fixture = createOpsFixtureAccount();
  const allKeys = deepCollectKeys(fixture);

  for (const forbidden of FORBIDDEN_KEYS) {
    assert.ok(
      !allKeys.has(forbidden),
      `Ops fixture must not contain key: ${forbidden}`,
    );
  }
});

// =================================================================
// 4. Role-specific contract
// =================================================================

test('admin fixture allows JSON export', () => {
  const fixture = createAdminFixtureAccount();
  assert.equal(fixture.canExportJson, true);
  assert.equal(fixture.actorRole, 'admin');
});

test('ops fixture denies JSON export', () => {
  const fixture = createOpsFixtureAccount();
  assert.equal(fixture.canExportJson, false);
  assert.equal(fixture.actorRole, 'ops');
});

// =================================================================
// 5. Identifier masking in ops fixture
// =================================================================

test('ops fixture has masked account ID in accountSummary', () => {
  const fixture = createOpsFixtureAccount();
  const accountId = fixture.bundle.accountSummary.accountId;
  // Ops-redacted account ID is the last 8 chars only (no 'acct-' prefix)
  assert.ok(
    accountId.length <= 8,
    `Ops accountId should be masked to last 8 chars, got: ${accountId}`,
  );
  assert.ok(
    !accountId.startsWith('acct-'),
    'Ops accountId must not contain full prefix',
  );
});

test('ops fixture has masked email', () => {
  const fixture = createOpsFixtureAccount();
  const email = fixture.bundle.accountSummary.email;
  assert.ok(
    email.includes('*'),
    `Ops email should be masked, got: ${email}`,
  );
});

test('ops fixture has masked learner IDs', () => {
  const fixture = createOpsFixtureAccount();
  for (const learner of fixture.bundle.linkedLearners) {
    assert.ok(
      !learner.learnerId.startsWith('lrn-fixture'),
      `Ops learner ID should be masked, got: ${learner.learnerId}`,
    );
  }
});

test('ops fixture has masked account IDs in errors', () => {
  const fixture = createOpsFixtureAccount();
  for (const err of fixture.bundle.recentErrors) {
    assert.ok(
      !err.accountId.startsWith('acct-fixture'),
      `Ops error accountId should be masked, got: ${err.accountId}`,
    );
  }
});

// =================================================================
// 6. Human summary present
// =================================================================

test('admin fixture has non-empty humanSummary', () => {
  const fixture = createAdminFixtureAccount();
  assert.ok(typeof fixture.humanSummary === 'string');
  assert.ok(fixture.humanSummary.length > 0);
});

test('ops fixture has non-empty humanSummary', () => {
  const fixture = createOpsFixtureAccount();
  assert.ok(typeof fixture.humanSummary === 'string');
  assert.ok(fixture.humanSummary.length > 0);
});

// =================================================================
// 7. Build hash present
// =================================================================

test('both fixtures include buildHash', () => {
  const admin = createAdminFixtureAccount();
  const ops = createOpsFixtureAccount();
  assert.ok(typeof admin.bundle.buildHash === 'string' && admin.bundle.buildHash.length > 0);
  assert.ok(typeof ops.bundle.buildHash === 'string' && ops.bundle.buildHash.length > 0);
});

// =================================================================
// 8. Ops fixture sections shape
// =================================================================

test('ops fixture has all 7 bundle sections', () => {
  const fixture = createOpsFixtureAccount();
  for (const section of EXPECTED_BUNDLE_SECTIONS) {
    assert.ok(
      section in fixture.bundle,
      `Ops fixture missing bundle section: ${section}`,
    );
  }
});

// =================================================================
// 9. Idempotent factory calls
// =================================================================

test('factory calls return fresh frozen instances', () => {
  const a1 = createAdminFixtureAccount();
  const a2 = createAdminFixtureAccount();
  // Same shape but NOT the same reference (each call returns new frozen object)
  assert.notEqual(a1, a2, 'Each call should return a new object');
  assert.deepEqual(a1, a2, 'Each call should return the same shape');
});
