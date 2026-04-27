// U6 (P3): Debug Bundle redaction test suite.
//
// Validates `redactBundleForRole`, `maskEmail`, `maskAccountId`,
// and `buildHumanSummary` from the standalone admin-debug-bundle module.
//
// Test scenarios:
//   1. Admin role: full email, full account ID preserved
//   2. Ops role: masked email (last 6), masked account ID (last 8)
//   3. Ops role: internal notes excluded (denials: no account/learner linkage)
//   4. Ops role: error entries get first-frame-only stack, no userAgent
//   5. Ops role: mutations get masked accountId and scopeId
//   6. Both roles: null sections pass through cleanly
//   7. Human summary includes all populated sections
//   8. maskEmail edge cases: short email, null, empty
//   9. maskAccountId edge cases: short id, null, empty
//  10. Ops role: query params are masked

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  redactBundleForRole,
  maskEmail,
  maskAccountId,
  buildHumanSummary,
} from '../worker/src/admin-debug-bundle.js';

// ---------- 1. Admin: full identifiers preserved ----------

test('admin role preserves full email and account ID', () => {
  const bundle = {
    generatedAt: 1000,
    query: { accountId: 'acct-abcdef123456', learnerId: 'lrn-xyz789' },
    accountSummary: {
      accountId: 'acct-abcdef123456',
      email: 'admin@longdomain.test.com',
      displayName: 'Admin',
      platformRole: 'admin',
      accountType: 'real',
    },
    linkedLearners: [{ learnerId: 'lrn-xyz789', learnerName: 'Alice' }],
    recentErrors: [{
      id: 'e1',
      firstFrame: '  at doSomething (/path/to/file.js:10:5)',
      accountId: 'acct-abcdef123456',
      userAgent: 'Mozilla/5.0',
    }],
    errorOccurrences: [{ id: 'o1', accountId: 'acct-abcdef123456', userAgent: 'Bot' }],
    recentDenials: [{ id: 'd1', accountId: 'acct-abcdef123456', learnerId: 'lrn-xyz789', sessionIdLast8: 'sess1234' }],
    recentMutations: [{ id: 'm1', accountId: 'acct-abcdef123456', scopeId: 'scope-abc123' }],
  };

  const redacted = redactBundleForRole(bundle, 'admin');

  assert.equal(redacted.accountSummary.email, 'admin@longdomain.test.com');
  assert.equal(redacted.accountSummary.accountId, 'acct-abcdef123456');
  assert.equal(redacted.query.accountId, 'acct-abcdef123456');
  assert.equal(redacted.linkedLearners[0].learnerId, 'lrn-xyz789');
  assert.equal(redacted.recentErrors[0].userAgent, 'Mozilla/5.0');
  assert.equal(redacted.recentDenials[0].accountId, 'acct-abcdef123456');
  assert.equal(redacted.recentDenials[0].sessionIdLast8, 'sess1234');
  assert.equal(redacted.recentMutations[0].accountId, 'acct-abcdef123456');
});

// ---------- 2. Ops: masked email and account ID ----------

test('ops role masks email (last 6) and account ID (last 8)', () => {
  const bundle = {
    generatedAt: 1000,
    query: { accountId: 'acct-abcdef123456', learnerId: 'lrn-xyz789012' },
    accountSummary: {
      accountId: 'acct-abcdef123456',
      email: 'admin@longdomain.test.com',
    },
  };

  const redacted = redactBundleForRole(bundle, 'ops');

  // Email: last 6 chars of 'admin@longdomain.test.com' → 't.com' (6 chars)
  assert.ok(redacted.accountSummary.email.endsWith('t.com'), `email ends correctly: ${redacted.accountSummary.email}`);
  assert.ok(redacted.accountSummary.email.startsWith('*'), 'email starts with mask');
  // Account ID: last 8 chars of 'acct-abcdef123456' → 'f123456' (wait, 8 chars → 'ef123456')
  assert.equal(redacted.accountSummary.accountId.length, 8);
  // Query params also masked.
  assert.equal(redacted.query.accountId.length, 8);
  assert.equal(redacted.query.learnerId.length, 8);
});

// ---------- 3. Ops: denials — no account/learner linkage ----------

test('ops role strips account/learner/session from denials', () => {
  const bundle = {
    generatedAt: 1000,
    query: {},
    recentDenials: [{
      id: 'd1',
      accountId: 'acct-123',
      learnerId: 'lrn-456',
      sessionIdLast8: 'sess1234',
      denialReason: 'rate_limit_exceeded',
      routeName: '/api/test',
    }],
  };

  const redacted = redactBundleForRole(bundle, 'ops');

  assert.equal(redacted.recentDenials[0].accountId, null);
  assert.equal(redacted.recentDenials[0].learnerId, null);
  assert.equal(redacted.recentDenials[0].sessionIdLast8, null);
  // Reason and route are preserved.
  assert.equal(redacted.recentDenials[0].denialReason, 'rate_limit_exceeded');
  assert.equal(redacted.recentDenials[0].routeName, '/api/test');
});

// ---------- 4. Ops: errors — first-frame-only, no userAgent ----------

test('ops role strips userAgent and keeps only first frame', () => {
  const bundle = {
    generatedAt: 1000,
    query: {},
    recentErrors: [{
      id: 'e1',
      firstFrame: '  at doSomething (/path/to/file.js:10:5)\n  at secondCall (/other.js:20:3)',
      accountId: 'acct-abcdef123456',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    }],
  };

  const redacted = redactBundleForRole(bundle, 'ops');

  assert.equal(redacted.recentErrors[0].userAgent, null);
  assert.equal(redacted.recentErrors[0].accountId.length, 8, 'account masked to last 8');
  // First frame preserved (the first line with 'at').
  assert.ok(
    redacted.recentErrors[0].firstFrame.includes('doSomething'),
    'first frame preserved',
  );
  assert.ok(
    !redacted.recentErrors[0].firstFrame.includes('secondCall'),
    'second frame stripped',
  );
});

// ---------- 5. Ops: mutations — masked accountId and scopeId ----------

test('ops role masks mutation accountId and scopeId', () => {
  const bundle = {
    generatedAt: 1000,
    query: {},
    recentMutations: [{
      id: 'm1',
      accountId: 'acct-abcdef123456',
      scopeId: 'scope-xyz789012345',
      mutationKind: 'update-role',
    }],
  };

  const redacted = redactBundleForRole(bundle, 'ops');

  assert.equal(redacted.recentMutations[0].accountId.length, 8);
  assert.equal(redacted.recentMutations[0].scopeId.length, 8);
  assert.equal(redacted.recentMutations[0].mutationKind, 'update-role');
});

// ---------- 6. Null sections pass through ----------

test('null sections pass through cleanly', () => {
  const bundle = {
    generatedAt: 1000,
    query: {},
    accountSummary: null,
    linkedLearners: null,
    recentErrors: null,
    recentDenials: null,
    recentMutations: null,
  };

  const redacted = redactBundleForRole(bundle, 'ops');
  assert.equal(redacted.accountSummary, null);
  // Non-array null values should not crash.
});

// ---------- 7. Human summary includes populated sections ----------

test('human summary includes populated sections', () => {
  const bundle = {
    generatedAt: Date.now(),
    buildHash: 'abc1234',
    query: { accountId: 'acct-1', timeFrom: Date.now() - 86400000, timeTo: Date.now() },
    accountSummary: { accountId: 'acct-1', email: 'test@test.com', platformRole: 'admin', accountType: 'real' },
    linkedLearners: [{ learnerId: 'lrn-1', learnerName: 'Alice', yearGroup: 'Year 4', membershipRole: 'owner' }],
    recentErrors: [{ status: 'open', errorKind: 'TypeError', messageFirstLine: 'test', occurrenceCount: 3 }],
    errorOccurrences: [],
    recentDenials: [{ deniedAt: Date.now(), denialReason: 'rate_limit', routeName: '/api/test' }],
    recentMutations: [],
    capacityState: [],
  };

  const summary = buildHumanSummary(bundle);

  assert.ok(summary.includes('Debug Bundle'), 'includes title');
  assert.ok(summary.includes('abc1234'), 'includes build hash');
  assert.ok(summary.includes('Account Summary'), 'includes account section');
  assert.ok(summary.includes('acct-1'), 'includes account ID');
  assert.ok(summary.includes('Linked Learners (1)'), 'includes learner count');
  assert.ok(summary.includes('Alice'), 'includes learner name');
  assert.ok(summary.includes('Recent Errors (1)'), 'includes error count');
  assert.ok(summary.includes('TypeError'), 'includes error kind');
  assert.ok(summary.includes('Recent Denials (1)'), 'includes denial count');
});

// ---------- 8. maskEmail edge cases ----------

test('maskEmail edge cases', () => {
  assert.equal(maskEmail(null), null, 'null returns null');
  assert.equal(maskEmail(''), null, 'empty returns null');
  assert.equal(maskEmail('ab'), 'ab', 'short email unchanged');
  assert.equal(maskEmail('abc123'), 'abc123', 'exact-length email unchanged');
  assert.equal(maskEmail('test@example.com'), '**********le.com', 'standard mask');
});

// ---------- 9. maskAccountId edge cases ----------

test('maskAccountId edge cases', () => {
  assert.equal(maskAccountId(null), null, 'null returns null');
  assert.equal(maskAccountId(''), null, 'empty returns null');
  assert.equal(maskAccountId('short'), 'short', 'short ID unchanged');
  assert.equal(maskAccountId('12345678'), '12345678', 'exact-length ID unchanged');
  assert.equal(maskAccountId('acct-abcdef123456'), 'ef123456', '17-char ID masked to last 8');
});

// ---------- 10. Ops: query params masked ----------

test('ops role masks query accountId and learnerId', () => {
  const bundle = {
    generatedAt: 1000,
    query: { accountId: 'acct-abcdef123456', learnerId: 'lrn-xyz789012345' },
  };

  const redacted = redactBundleForRole(bundle, 'ops');

  assert.equal(redacted.query.accountId.length, 8);
  assert.equal(redacted.query.learnerId.length, 8);
});

// ---------- 11. Null/undefined bundle passes through ----------

test('redactBundleForRole handles null/undefined gracefully', () => {
  assert.equal(redactBundleForRole(null, 'admin'), null);
  assert.equal(redactBundleForRole(undefined, 'admin'), undefined);
});

// ---------- 12. buildHumanSummary handles null/empty ----------

test('buildHumanSummary handles null bundle', () => {
  const summary = buildHumanSummary(null);
  assert.equal(summary, 'No bundle data available.');
});
