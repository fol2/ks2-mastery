// P5 U2: Safe-copy framework test suite.
//
// Validates audience-aware redaction logic in admin-safe-copy.js.
//
// Test scenarios:
//   1. admin_only audience passes full bundle JSON through (minus auth tokens)
//   2. ops_safe masks email to last 6 chars, strips internal notes
//   3. parent_safe strips child IDs, stack traces, internal notes, request bodies
//   4. public_preview strips everything except title and sanitised body
//   5. Empty data returns { ok: false }
//   6. Data with auth tokens (cookie header) stripped regardless of audience
//   7. Clipboard failure returns { ok: false } gracefully
//   8. maskEmail and maskId edge cases

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COPY_AUDIENCE,
  prepareSafeCopy,
  copyToClipboard,
  maskEmail,
  maskId,
} from '../src/platform/hubs/admin-safe-copy.js';

// ---------------------------------------------------------------------------
// 1. admin_only — full passthrough (minus auth tokens + request bodies)
// ---------------------------------------------------------------------------

test('admin_only audience passes full bundle JSON through', () => {
  const data = {
    title: 'Debug Bundle',
    accountSummary: { accountId: 'acct-abcdef123456', email: 'admin@longdomain.test.com' },
    linkedLearners: [{ learnerId: 'lrn-xyz789', learnerName: 'Alice' }],
    internalNotes: 'Some internal note',
    stack: 'Error\n  at fn (/path/file.js:10:5)',
  };

  const result = prepareSafeCopy(data, COPY_AUDIENCE.ADMIN_ONLY);

  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.text);
  // Core data preserved.
  assert.equal(parsed.accountSummary.accountId, 'acct-abcdef123456');
  assert.equal(parsed.accountSummary.email, 'admin@longdomain.test.com');
  assert.equal(parsed.linkedLearners[0].learnerId, 'lrn-xyz789');
  assert.equal(parsed.internalNotes, 'Some internal note');
  // Stack preserved for admin.
  assert.equal(parsed.stack, 'Error\n  at fn (/path/file.js:10:5)');
});

// ---------------------------------------------------------------------------
// 2. ops_safe — masked email, masked account ID, no internal notes
// ---------------------------------------------------------------------------

test('ops_safe masks email to last 6 and strips internal notes', () => {
  const data = {
    accountSummary: {
      accountId: 'acct-abcdef123456',
      email: 'admin@longdomain.test.com',
    },
    internalNotes: 'Secret internal info',
    details: { internal_notes: 'Also secret', adminNotes: 'Admin note' },
  };

  const result = prepareSafeCopy(data, COPY_AUDIENCE.OPS_SAFE);

  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.text);
  // Email masked to last 6.
  assert.equal(parsed.accountSummary.email, '****st.com');
  // Account ID masked to last 8.
  assert.equal(parsed.accountSummary.accountId, '****ef123456');
  // Internal notes stripped.
  assert.equal(parsed.internalNotes, undefined);
  assert.equal(parsed.details.internal_notes, undefined);
  assert.equal(parsed.details.adminNotes, undefined);
  // Redacted fields recorded.
  assert.ok(result.redactedFields.includes('emails_masked'));
  assert.ok(result.redactedFields.includes('account_ids_masked'));
  assert.ok(result.redactedFields.includes('internal_notes'));
});

// ---------------------------------------------------------------------------
// 3. parent_safe — strips child IDs, stacks, internal notes, request bodies
// ---------------------------------------------------------------------------

test('parent_safe strips child IDs, stack traces, and internal notes', () => {
  const data = {
    accountSummary: { email: 'parent@example.com' },
    linkedLearners: [{ learnerId: 'lrn-abc', learnerName: 'Child', learner_id: 'lrn-abc-alt' }],
    recentErrors: [{
      id: 'e1',
      firstFrame: '  at handler (/app/index.js:42:3)',
      stack: 'Error: oops\n  at x (/y.js:1:1)',
      requestBody: '{"password":"secret"}',
    }],
    internalNotes: 'Admin-only context',
    childId: 'child-999',
  };

  const result = prepareSafeCopy(data, COPY_AUDIENCE.PARENT_SAFE);

  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.text);
  // Child IDs stripped.
  assert.equal(parsed.linkedLearners[0].learnerId, undefined);
  assert.equal(parsed.linkedLearners[0].learner_id, undefined);
  assert.equal(parsed.childId, undefined);
  // Learner name preserved.
  assert.equal(parsed.linkedLearners[0].learnerName, 'Child');
  // Stack traces redacted.
  assert.equal(parsed.recentErrors[0].firstFrame, '[stack trace redacted]');
  assert.equal(parsed.recentErrors[0].stack, '[stack trace redacted]');
  // Request body stripped.
  assert.equal(parsed.recentErrors[0].requestBody, undefined);
  // Internal notes stripped.
  assert.equal(parsed.internalNotes, undefined);
  // Email masked.
  assert.equal(parsed.accountSummary.email, '****le.com');
  // Redacted fields.
  assert.ok(result.redactedFields.includes('child_ids'));
  assert.ok(result.redactedFields.includes('stack_traces'));
  assert.ok(result.redactedFields.includes('internal_notes'));
  assert.ok(result.redactedFields.includes('emails_masked'));
});

// ---------------------------------------------------------------------------
// 4. public_preview — only title and body
// ---------------------------------------------------------------------------

test('public_preview strips everything except title and body', () => {
  const data = {
    title: 'Support Case #1234',
    humanSummary: 'Summary for display',
    accountSummary: { email: 'user@test.com', accountId: 'acct-123' },
    linkedLearners: [{ learnerId: 'lrn-1' }],
  };

  const result = prepareSafeCopy(data, COPY_AUDIENCE.PUBLIC_PREVIEW);

  assert.equal(result.ok, true);
  const parsed = JSON.parse(result.text);
  assert.equal(parsed.title, 'Support Case #1234');
  // Body falls back to humanSummary if no explicit body.
  assert.equal(parsed.body, 'Summary for display');
  // No other fields.
  assert.equal(parsed.accountSummary, undefined);
  assert.equal(parsed.linkedLearners, undefined);
  assert.ok(result.redactedFields.includes('all_except_title_body'));
});

// ---------------------------------------------------------------------------
// 5. Empty data returns { ok: false }
// ---------------------------------------------------------------------------

test('empty/null data returns ok: false', () => {
  assert.equal(prepareSafeCopy(null, COPY_AUDIENCE.ADMIN_ONLY).ok, false);
  assert.equal(prepareSafeCopy(undefined, COPY_AUDIENCE.ADMIN_ONLY).ok, false);
  assert.equal(prepareSafeCopy({}, COPY_AUDIENCE.ADMIN_ONLY).ok, false);
  assert.equal(prepareSafeCopy('', COPY_AUDIENCE.ADMIN_ONLY).ok, false);
  assert.equal(prepareSafeCopy('   ', COPY_AUDIENCE.ADMIN_ONLY).ok, false);
});

// ---------------------------------------------------------------------------
// 6. Auth tokens (cookie header) stripped regardless of audience
// ---------------------------------------------------------------------------

test('auth tokens stripped for all audiences', () => {
  const data = {
    title: 'Bundle',
    headers: {
      cookie: 'session=abc123',
      authorization: 'Bearer xyz',
      'x-auth-token': 'tok-secret',
      'content-type': 'application/json',
    },
    nested: { 'set-cookie': 'val=1' },
  };

  for (const audience of Object.values(COPY_AUDIENCE)) {
    const result = prepareSafeCopy(data, audience);
    assert.equal(result.ok, true, `Failed for audience: ${audience}`);
    // public_preview reduces to title+body, so check non-public audiences.
    if (audience !== COPY_AUDIENCE.PUBLIC_PREVIEW) {
      const parsed = JSON.parse(result.text);
      assert.equal(parsed.headers.cookie, undefined, `cookie not stripped for ${audience}`);
      assert.equal(parsed.headers.authorization, undefined, `auth not stripped for ${audience}`);
      assert.equal(parsed.headers['x-auth-token'], undefined, `x-auth-token not stripped for ${audience}`);
      assert.equal(parsed.nested['set-cookie'], undefined, `set-cookie not stripped for ${audience}`);
      // Non-sensitive header preserved.
      assert.equal(parsed.headers['content-type'], 'application/json');
    }
    assert.ok(result.redactedFields.includes('auth_tokens'));
  }
});

// ---------------------------------------------------------------------------
// 7. Clipboard failure returns { ok: false } gracefully
// ---------------------------------------------------------------------------

test('copyToClipboard returns ok: false on failure', async () => {
  // Mock navigator.clipboard in non-browser environment.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: () => Promise.reject(new Error('Not allowed')) } },
    writable: true,
    configurable: true,
  });

  const result = await copyToClipboard('test text');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Not allowed');

  // Restore.
  if (original) {
    Object.defineProperty(globalThis, 'navigator', original);
  } else {
    delete globalThis.navigator;
  }
});

test('copyToClipboard returns ok: true on success', async () => {
  let captured = '';
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: (text) => { captured = text; return Promise.resolve(); } } },
    writable: true,
    configurable: true,
  });

  const result = await copyToClipboard('hello world');
  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
  assert.equal(captured, 'hello world');

  // Restore.
  if (original) {
    Object.defineProperty(globalThis, 'navigator', original);
  } else {
    delete globalThis.navigator;
  }
});

// ---------------------------------------------------------------------------
// 8. maskEmail and maskId edge cases
// ---------------------------------------------------------------------------

test('maskEmail edge cases', () => {
  assert.equal(maskEmail('ab@c.d'), '******'); // length <= 6
  assert.equal(maskEmail('a@b.co'), '******'); // exactly 6
  assert.equal(maskEmail('test@example.com'), '****le.com'); // last 6
  assert.equal(maskEmail(null), '');
  assert.equal(maskEmail(''), '');
});

test('maskId edge cases', () => {
  assert.equal(maskId('acct-12'), '********'); // length <= 8
  assert.equal(maskId('acct-1234'), '****cct-1234'); // length 9; last 8 = 'cct-1234'
  assert.equal(maskId('acct-abcdef123456'), '****ef123456'); // standard; last 8 = 'ef123456'
  assert.equal(maskId(null), '');
  assert.equal(maskId(''), '');
});

// ---------------------------------------------------------------------------
// 9. Unknown audience returns { ok: false }
// ---------------------------------------------------------------------------

test('unknown audience returns ok: false', () => {
  const data = { title: 'test' };
  const result = prepareSafeCopy(data, 'invalid_audience');
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// 10. String input handling
// ---------------------------------------------------------------------------

test('string input without sensitive content passes through for admin_only', () => {
  const result = prepareSafeCopy('Some summary text', COPY_AUDIENCE.ADMIN_ONLY);
  assert.equal(result.ok, true);
  assert.equal(result.text, 'Some summary text');
});

// ---------------------------------------------------------------------------
// 11. Does not mutate original data
// ---------------------------------------------------------------------------

test('prepareSafeCopy does not mutate original data', () => {
  const data = {
    accountSummary: { email: 'user@test.com', accountId: 'acct-abc123456789' },
    cookie: 'session=secret',
    internalNotes: 'secret',
  };
  const frozen = JSON.stringify(data);

  prepareSafeCopy(data, COPY_AUDIENCE.OPS_SAFE);

  assert.equal(JSON.stringify(data), frozen, 'Original data was mutated');
});
